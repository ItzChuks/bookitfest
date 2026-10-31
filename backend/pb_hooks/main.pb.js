/// <reference path="../pb_data/types.d.ts" />
// Bookitfest server logic. Everything that touches money runs here, inside a
// database transaction, so the browser can never set its own balance or tickets.

// Stamp the vendor's display name server-side so it can't be spoofed.
onRecordCreateRequest((e) => {
  if (e.auth) e.record.set("vendor_name", e.auth.getString("name") || e.auth.email())
  e.next()
}, "events")

// Public config the frontend reads on every page load. It also makes sure a Lucky 5
// draw is open and, when BKF_DEMO=1, seeds demo accounts and events (first load only).
// (PocketBase 0.23 has no serve-time JS hook, and migrations run after onBootstrap.)
routerAdd("GET", "/api/bkf/config", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  try {
    if ($os.getenv("BKF_DEMO") === "1") lib.seedDemo($app)
    lib.ensureOpenDraw($app)
  } catch (err) {
    console.log("[bookitfest] startup check failed:", err)
  }
  return e.json(200, {
    luckyFeeUSD: lib.CFG.LUCKY_FEE_USD,
    maxTicketsPerOrder: lib.CFG.MAX_TICKETS_PER_ORDER,
    simulatedPayments: lib.simulatedPaymentsEnabled(),
    flutterwaveEnabled: lib.flwEnabled(),
    chargeCurrency: lib.flwCurrency(),
  })
})

// ---- Buy tickets ----
routerAdd("POST", "/api/bkf/purchase", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  const body = e.requestInfo().body
  const q = body.qty || {}
  const qty = { early: lib.int(q.early), regular: lib.int(q.regular), vip: lib.int(q.vip) }
  const seats = qty.early + qty.regular + qty.vip
  if (seats < 1) throw new BadRequestError("Choose at least one ticket.")
  if (seats > lib.CFG.MAX_TICKETS_PER_ORDER) throw new BadRequestError(`You can buy up to ${lib.CFG.MAX_TICKETS_PER_ORDER} tickets per order.`)

  const name = String(body.name || "").trim().slice(0, 120)
  const email = String(body.email || "").trim().slice(0, 200)
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestError("Enter the attendee's name and a valid email.")

  const gateway = String(body.gateway || "wallet")
  const gatewayLabel = { wallet: "Bookitfest Wallet", paystack: "Paystack (simulated)", flutterwave: "Flutterwave (simulated)" }[gateway]
  if (!gatewayLabel) throw new BadRequestError("Unknown payment method.")
  if (gateway === "flutterwave" && lib.flwEnabled() && !lib.simulatedPaymentsEnabled()) {
    throw new BadRequestError("Card payments go through Flutterwave checkout. Please try again.")
  }
  if (gateway !== "wallet" && !lib.simulatedPaymentsEnabled()) {
    throw new BadRequestError("Card payments aren't connected yet. Pay with your wallet instead.")
  }

  let result = null
  $app.runInTransaction((tx) => {
    const event = tx.findRecordById("events", String(body.eventId || ""))
    if (event.getString("status") !== "approved") throw new BadRequestError("This event isn't on sale.")
    if (event.getDateTime("starts_at").time().unix() < Math.floor(Date.now() / 1000)) {
      throw new BadRequestError("This event has already started.")
    }

    const price = { early: event.getFloat("price_early"), regular: event.getFloat("price_regular"), vip: event.getFloat("price_vip") }
    const total = lib.money(qty.early * price.early + qty.regular * price.regular + qty.vip * price.vip)

    let buyer = tx.findRecordById("users", e.auth.id)
    if (gateway === "wallet") {
      const bal = buyer.getFloat("balance")
      if (bal < total) throw new BadRequestError("Your wallet balance is too low. Top up and try again.")
      buyer.set("balance", lib.money(bal - total))
      tx.save(buyer)
    }

    const tickets = lib.issueTickets(tx, { userId: e.auth.id, event: event, qty: qty, price: price, name: name, email: email, method: gatewayLabel, total: total })

    result = { tickets: tickets, total: total, balance: tx.findRecordById("users", e.auth.id).getFloat("balance") }
  })
  return e.json(200, result)
}, $apis.requireAuth())

// ---- Wallet ----
routerAdd("POST", "/api/bkf/wallet/deposit", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  const amount = lib.money(e.requestInfo().body.amount)
  if (!(amount >= 1 && amount <= lib.CFG.MAX_DEPOSIT_USD)) throw new BadRequestError(`Deposits must be between $1 and $${lib.CFG.MAX_DEPOSIT_USD}.`)
  if (!lib.simulatedPaymentsEnabled()) throw new BadRequestError("Use the card payment option to top up your wallet.")
  let balance = 0
  $app.runInTransaction((tx) => {
    const u = tx.findRecordById("users", e.auth.id)
    balance = lib.money(u.getFloat("balance") + amount)
    u.set("balance", balance)
    tx.save(u)
    lib.logTx(tx, e.auth.id, "deposit", "Paystack (simulated)", amount, "completed", "Wallet top-up")
  })
  return e.json(200, { balance: balance })
}, $apis.requireAuth())

routerAdd("POST", "/api/bkf/wallet/withdraw", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  const body = e.requestInfo().body
  const amount = lib.money(body.amount)
  const bank = String(body.bank || "").trim().slice(0, 200)
  if (!(amount > 0)) throw new BadRequestError("Enter an amount to withdraw.")
  if (bank.length < 5) throw new BadRequestError("Enter your bank name and account number.")
  let balance = 0
  $app.runInTransaction((tx) => {
    const u = tx.findRecordById("users", e.auth.id)
    const bal = u.getFloat("balance")
    if (amount > bal) throw new BadRequestError("That's more than your available balance.")
    balance = lib.money(bal - amount)
    u.set("balance", balance)
    tx.save(u)
    lib.logTx(tx, e.auth.id, "withdrawal", bank, -amount, "pending", "Awaiting payout by admin")
  })
  return e.json(200, { balance: balance })
}, $apis.requireAuth())

// ---- Lucky 5 ----
routerAdd("POST", "/api/bkf/lucky/enter", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  const digits = String(e.requestInfo().body.digits || "")
  if (!/^[0-9]{5}$/.test(digits)) throw new BadRequestError("Pick exactly 5 digits.")
  const fee = lib.CFG.LUCKY_FEE_USD
  let result = null
  $app.runInTransaction((tx) => {
    const draw = lib.ensureOpenDraw(tx)
    const u = tx.findRecordById("users", e.auth.id)
    const bal = u.getFloat("balance")
    if (bal < fee) throw new BadRequestError("Your wallet balance is too low. Top up and try again.")
    u.set("balance", lib.money(bal - fee))
    tx.save(u)

    const entry = new Record(tx.findCollectionByNameOrId("lucky_entries"))
    entry.set("draw", draw.id)
    entry.set("user", e.auth.id)
    entry.set("digits", digits)
    entry.set("fee", fee)
    tx.save(entry)

    draw.set("jackpot", lib.money(draw.getFloat("jackpot") + fee * lib.CFG.JACKPOT_SHARE))
    tx.save(draw)

    lib.logTx(tx, e.auth.id, "lucky_entry", "Bookitfest Wallet", -fee, "completed", `Draw #${draw.getInt("number")} · ${digits}`)
    result = { digits: digits, draw: draw.getInt("number"), balance: u.getFloat("balance"), jackpot: draw.getFloat("jackpot") }
  })
  return e.json(200, result)
}, $apis.requireAuth())

// ---- Admin: run the draw ----
routerAdd("POST", "/api/bkf/admin/draw", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  if (e.auth.getString("role") !== "admin") throw new ForbiddenError("Admins only.")
  const body = e.requestInfo().body
  const mode = body.mode === "manual" ? "manual" : "auto"
  let winning = ""
  if (mode === "manual") {
    winning = String(body.digits || "")
    if (!/^[0-9]{5}$/.test(winning)) throw new BadRequestError("Enter a valid 5-digit sequence.")
  } else {
    winning = $security.randomStringWithAlphabet(5, "0123456789")
  }

  let result = null
  $app.runInTransaction((tx) => {
    const draw = lib.ensureOpenDraw(tx)
    const jackpot = draw.getFloat("jackpot")
    const winners = tx.findRecordsByFilter("lucky_entries", "draw = {:d} && digits = {:g}", "", 5000, 0, { d: draw.id, g: winning })
    let payout = 0
    if (winners.length) {
      const share = lib.money(jackpot / winners.length)
      for (const w of winners) {
        const u = tx.findRecordById("users", w.getString("user"))
        u.set("balance", lib.money(u.getFloat("balance") + share))
        tx.save(u)
        w.set("won", true)
        tx.save(w)
        lib.logTx(tx, u.id, "lucky_win", "Bookitfest Wallet", share, "completed", `Draw #${draw.getInt("number")} · ${winning}`)
        payout = lib.money(payout + share)
      }
    }
    draw.set("status", "closed")
    draw.set("winning_digits", winning)
    draw.set("winners", winners.length)
    draw.set("payout", payout)
    draw.set("mode", mode)
    draw.set("drawn_at", new DateTime())
    tx.save(draw)

    const next = new Record(tx.findCollectionByNameOrId("draws"))
    next.set("number", draw.getInt("number") + 1)
    next.set("status", "open")
    next.set("jackpot", winners.length ? lib.CFG.BASE_JACKPOT_USD : jackpot) // unclaimed jackpots roll over
    next.set("winners", 0)
    next.set("payout", 0)
    tx.save(next)

    result = { draw: draw.getInt("number"), winning: winning, winners: winners.length, payout: payout, nextDraw: next.getInt("number"), nextJackpot: next.getFloat("jackpot") }
  })
  return e.json(200, result)
}, $apis.requireAuth())

// ---- Vendor: check a ticket in at the gate ----
routerAdd("POST", "/api/bkf/ticket/check", (e) => {
  const code = String(e.requestInfo().body.code || "").trim().toUpperCase()
  if (!code) throw new BadRequestError("Enter a ticket code.")
  let ticket
  try { ticket = $app.findFirstRecordByFilter("tickets", "code = {:c}", { c: code }) }
  catch (_) { return e.json(404, { ok: false, message: "No ticket with that code." }) }
  const event = $app.findRecordById("events", ticket.getString("event"))
  const isAdmin = e.auth.getString("role") === "admin"
  if (!isAdmin && event.getString("vendor") !== e.auth.id) throw new ForbiddenError("That ticket is for another vendor's event.")
  const info = { event: event.getString("title"), tier: ticket.getString("tier"), holder: ticket.getString("holder_name") }
  if (ticket.getString("status") === "used") return e.json(200, Object.assign({ ok: false, message: "Already checked in." }, info))
  ticket.set("status", "used")
  $app.save(ticket)
  return e.json(200, Object.assign({ ok: true, message: "Valid ticket. Checked in." }, info))
}, $apis.requireAuth())


// ---- Flutterwave: start a hosted checkout (ticket purchase or wallet deposit) ----
// Amounts are always worked out here from server-side prices, never from the browser.
routerAdd("POST", "/api/bkf/flw/checkout", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  if (!lib.flwEnabled()) throw new BadRequestError("Card payments aren't connected yet.")
  const body = e.requestInfo().body
  const origin = lib.frontendOrigin(body.origin)
  const kind = body.kind === "deposit" ? "deposit" : "ticket"

  let amount = 0, payload = {}, title = "", desc = "", returnUrl = ""
  if (kind === "deposit") {
    amount = lib.money(body.amount)
    if (!(amount >= 1 && amount <= lib.CFG.MAX_DEPOSIT_USD)) throw new BadRequestError(`Deposits must be between $1 and $${lib.CFG.MAX_DEPOSIT_USD}.`)
    title = "Bookitfest wallet top-up"
    desc = "Funds are added to your Bookitfest wallet"
    returnUrl = `${origin}/wallet.html`
  } else {
    const q = body.qty || {}
    const qty = { early: lib.int(q.early), regular: lib.int(q.regular), vip: lib.int(q.vip) }
    const seats = qty.early + qty.regular + qty.vip
    if (seats < 1) throw new BadRequestError("Choose at least one ticket.")
    if (seats > lib.CFG.MAX_TICKETS_PER_ORDER) throw new BadRequestError(`You can buy up to ${lib.CFG.MAX_TICKETS_PER_ORDER} tickets per order.`)
    const name = String(body.name || "").trim().slice(0, 120)
    const email = String(body.email || "").trim().slice(0, 200)
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestError("Enter the attendee's name and a valid email.")
    let event
    try { event = $app.findRecordById("events", String(body.eventId || "")) } catch (_) { throw new BadRequestError("Event not found.") }
    if (event.getString("status") !== "approved") throw new BadRequestError("This event isn't on sale.")
    if (event.getDateTime("starts_at").time().unix() < Math.floor(Date.now() / 1000)) throw new BadRequestError("This event has already started.")
    const price = { early: event.getFloat("price_early"), regular: event.getFloat("price_regular"), vip: event.getFloat("price_vip") }
    amount = lib.money(qty.early * price.early + qty.regular * price.regular + qty.vip * price.vip)
    if (!(amount > 0)) throw new BadRequestError("Free tickets don't need a card payment. Use your wallet instead.")
    payload = { eventId: event.id, qty: qty, price: price, name: name, email: email }
    title = event.getString("title")
    desc = `${seats} ticket${seats === 1 ? "" : "s"} for ${name}`
    returnUrl = `${origin}/event.html?id=${event.id}`
  }

  const currency = lib.flwCurrency()
  const chargeAmount = lib.flwChargeAmount(amount)
  payload.currency = currency
  payload.chargeAmount = chargeAmount
  const reference = lib.randomCode("BKFPAY")

  const pay = new Record($app.findCollectionByNameOrId("payments"))
  pay.set("user", e.auth.id)
  pay.set("kind", kind)
  pay.set("provider", "flutterwave")
  pay.set("reference", reference)
  pay.set("amount", amount)
  pay.set("status", "pending")
  pay.set("payload", JSON.stringify(payload))
  $app.save(pay)

  try {
    const r = lib.flwRequest("POST", "/payments", {
      tx_ref: reference,
      amount: chargeAmount,
      currency: currency,
      redirect_url: returnUrl,
      customer: { email: e.auth.email(), name: e.auth.getString("name") || e.auth.email() },
      meta: { payment_id: pay.id, user_id: e.auth.id, kind: kind },
      customizations: { title: "Bookitfest", description: title + " — " + desc },
    })
    return e.json(200, { url: r.data.link })
  } catch (err) {
    console.log("[bookitfest] flutterwave checkout failed:", err)
    pay.set("status", "failed")
    $app.save(pay)
    throw new BadRequestError("We couldn't start the card payment. Please try again in a moment.")
  }
}, $apis.requireAuth())

// ---- Flutterwave: buyer lands back on the site; verify with Flutterwave and deliver ----
// Works even if the webhook is slow. Idempotent with the webhook below.
routerAdd("GET", "/api/bkf/flw/confirm", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  if (!lib.flwEnabled()) throw new BadRequestError("Card payments aren't connected yet.")
  const q = e.request.url.query()
  const ref = String(q.get("tx_ref") || "")
  const txId = String(q.get("transaction_id") || "")
  if (!/^BKFPAY-[A-Z0-9]+$/.test(ref)) throw new BadRequestError("Missing payment reference.")
  if (txId && !/^[0-9]+$/.test(txId)) throw new BadRequestError("Bad transaction id.")
  let pay
  try { pay = $app.findFirstRecordByFilter("payments", "reference = {:r} && user = {:u}", { r: ref, u: e.auth.id }) }
  catch (_) { throw new NotFoundError("We couldn't find that payment.") }
  let out
  if (pay.getString("status") === "pending") {
    let data = null
    try { data = lib.flwVerify(txId, ref) } catch (err) { console.log("[bookitfest] flutterwave verify:", err) }
    out = lib.fulfillFlutterwave($app, ref, data)
  } else {
    out = lib.fulfillFlutterwave($app, ref, null)
  }
  const u = $app.findRecordById("users", e.auth.id)
  return e.json(200, Object.assign({ balance: u.getFloat("balance") }, out))
}, $apis.requireAuth())

// ---- Flutterwave webhook (no login; authenticated by your secret hash, then re-verified via the API) ----
routerAdd("POST", "/api/bkf/flw/webhook", (e) => {
  const lib = require(`${__hooks}/bkf_lib.js`)
  const secret = ($os.getenv("FLW_SECRET_HASH") || "").trim()
  const sent = String(e.request.header.get("verif-hash") || "")
  if (!secret || !sent || !$security.equal(sent, secret)) return e.json(401, { message: "Invalid signature." })
  let evt
  try { evt = JSON.parse(toString(e.request.body)) } catch (_) { return e.json(400, { message: "Bad body." }) }
  const d = evt.data || {}
  if (evt.event === "charge.completed" && d.tx_ref && d.id) {
    try {
      const data = lib.flwVerify(String(d.id), String(d.tx_ref))
      lib.fulfillFlutterwave($app, String(d.tx_ref), data)
    } catch (err) {
      console.log("[bookitfest] flutterwave webhook error:", err)
      return e.json(500, { message: "Handler error." }) // Flutterwave will retry
    }
  }
  return e.json(200, { received: true })
})
