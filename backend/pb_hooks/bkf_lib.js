// Shared helpers for pb_hooks. PocketBase hook handlers run in isolated scopes,
// so handlers load this file with: const lib = require(`${__hooks}/bkf_lib.js`)

const CFG = {
  PLATFORM_FEE_PERCENT: 0,   // share of each ticket sale kept by Bookitfest (vendor gets the rest)
  LUCKY_FEE_USD: 10,         // price of one Lucky 5 entry
  JACKPOT_SHARE: 0.7,        // share of each entry added to the jackpot
  BASE_JACKPOT_USD: 10000,   // jackpot a fresh draw starts from after someone wins
  MAX_TICKETS_PER_ORDER: 10,
  MAX_DEPOSIT_USD: 10000,
}

function money(n) { return Math.round(Number(n) * 100) / 100 }
function int(n) { n = Math.floor(Number(n)); return isFinite(n) && n > 0 ? n : 0 }

// ---------------------------------------------------------------------------
// Ticket tiers: each event has a capacity per tier (qty_early / qty_regular / qty_vip).
// 0 means the vendor doesn't sell that tier.
// ---------------------------------------------------------------------------
const TIERS = ["early", "regular", "vip"]
const TIER_LABEL = { early: "Early Bird", regular: "Regular", vip: "VIP" }

function tierSold(app, eventId, tier) {
  return app.countRecords("tickets", $dbx.hashExp({ event: eventId, tier: tier }))
}

// { early: {capacity, sold, left}, regular: {...}, vip: {...} }
function availability(app, event) {
  const out = {}
  for (const t of TIERS) {
    const capacity = event.getInt("qty_" + t)
    const sold = tierSold(app, event.id, t)
    out[t] = { capacity: capacity, sold: sold, left: Math.max(0, capacity - sold) }
  }
  return out
}

// Returns "" when the order fits, otherwise a sentence explaining which tier is short.
function shortfall(app, event, qty) {
  const a = availability(app, event)
  for (const t of TIERS) {
    if (qty[t] > a[t].left) {
      if (a[t].capacity === 0) return `${TIER_LABEL[t]} tickets aren't offered for this event.`
      if (a[t].left === 0) return `${TIER_LABEL[t]} tickets are sold out.`
      return `Only ${a[t].left} ${TIER_LABEL[t]} ticket${a[t].left === 1 ? "" : "s"} left.`
    }
  }
  return ""
}

// Validates the capacities on an event record a vendor is saving.
// Returns "" when fine. `checkSold` stops a vendor from setting a tier below what is already sold.
function capacityProblem(app, rec, checkSold) {
  let total = 0
  for (const t of TIERS) {
    const cap = rec.getInt("qty_" + t)
    total += cap
    if (checkSold && rec.id) {
      const sold = tierSold(app, rec.id, t)
      if (cap < sold) return `${sold} ${TIER_LABEL[t]} ticket${sold === 1 ? " is" : "s are"} already sold, so you can't offer fewer than that.`
    }
  }
  if (total < 1) return "Offer at least one ticket in one of the tiers."
  return ""
}

// Gateways other than the in-app wallet are simulated until a real provider
// (Paystack / Flutterwave) is wired in. They only work when this env var is set.
function simulatedPaymentsEnabled() { return $os.getenv("BKF_SIMULATE_PAYMENTS") === "1" }

function randomCode(prefix) {
  return prefix + "-" + $security.randomStringWithAlphabet(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
}

function logTx(app, userId, type, method, amount, status, note) {
  const rec = new Record(app.findCollectionByNameOrId("transactions"))
  rec.set("user", userId)
  rec.set("type", type)
  rec.set("method", method)
  rec.set("amount", money(amount))
  rec.set("status", status)
  rec.set("note", note || "")
  app.save(rec)
  return rec
}

function findOpenDraw(app) {
  try { return app.findFirstRecordByFilter("draws", "status = 'open'") } catch (_) { return null }
}

function ensureOpenDraw(app) {
  let draw = findOpenDraw(app)
  if (draw) return draw
  let next = 1
  try {
    const last = app.findRecordsByFilter("draws", "number > 0", "-number", 1, 0)
    if (last.length) next = last[0].getInt("number") + 1
  } catch (_) {}
  draw = new Record(app.findCollectionByNameOrId("draws"))
  draw.set("number", next)
  draw.set("status", "open")
  draw.set("jackpot", CFG.BASE_JACKPOT_USD)
  draw.set("winners", 0)
  draw.set("payout", 0)
  app.save(draw)
  return draw
}

function seedDemo(app) {
  try { app.findAuthRecordByEmail("users", "admin@bookitfest.test"); return } catch (_) {} // already seeded
  const users = app.findCollectionByNameOrId("users")
  const ensureUser = (email, name, role, balance) => {
    try { return app.findAuthRecordByEmail("users", email) } catch (_) {}
    const u = new Record(users)
    u.set("email", email)
    u.set("name", name)
    u.set("role", role)
    u.set("balance", balance)
    u.set("verified", true)
    u.setPassword("Passw0rd!demo")
    app.save(u)
    return u
  }
  ensureUser("admin@bookitfest.test", "Bookitfest Admin", "admin", 0)
  const vendor = ensureUser("vendor@bookitfest.test", "Afrobeat Empire Ltd", "vendor", 0)
  ensureUser("user@bookitfest.test", "Demo Festival Goer", "user", 1250)

  if (app.countRecords("events") === 0) {
    const col = app.findCollectionByNameOrId("events")
    const add = (title, category, iso, location, image, status, vendorName, early, regular, vip, qty, description) => {
      const r = new Record(col)
      r.set("title", title); r.set("category", category); r.set("starts_at", iso)
      r.set("location", location); r.set("image_url", image); r.set("status", status)
      r.set("vendor", vendor.id); r.set("vendor_name", vendorName)
      r.set("price_early", early); r.set("price_regular", regular); r.set("price_vip", vip)
      r.set("qty_early", qty[0]); r.set("qty_regular", qty[1]); r.set("qty_vip", qty[2])
      r.set("description", description)
      app.save(r)
    }
    add("Bookitfest Mega Concert 2026", "Music Festival", "2026-11-15 18:00:00.000Z", "Eko Atlantic City, Lagos",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
      "approved", "Afrobeat Empire Ltd", 45, 75, 200, [200, 800, 50],
      "A full night of live Afrobeats on the Atlantic waterfront. Gates open at 4 PM, headline sets from 8 PM.")
    add("Global Web3 & Tech Summit", "Tech Conference", "2026-12-02 09:00:00.000Z", "Landmark Centre, Victoria Island",
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",
      "approved", "NaijaTech Ventures", 30, 60, 250, [100, 300, 40],
      "One day of talks, workshops and demos from builders across West Africa. VIP includes the speakers' dinner.")
    add("Lagos Cultural & Culinary Fair", "Cultural Fair", "2026-12-18 12:00:00.000Z", "TBS Square, Lagos Island",
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
      "pending", "Heritage Festive Guild", 15, 35, 100, [150, 400, 0],
      "Street food, crafts and live performances celebrating Lagos culture.")
  }

  if (app.countRecords("draws") === 0) {
    const col = app.findCollectionByNameOrId("draws")
    const add = (number, status, jackpot, digits, winners, payout, drawnAt) => {
      const r = new Record(col)
      r.set("number", number); r.set("status", status); r.set("jackpot", jackpot)
      r.set("winning_digits", digits); r.set("winners", winners); r.set("payout", payout)
      if (drawnAt) r.set("drawn_at", drawnAt)
      if (status === "closed") r.set("mode", "auto")
      app.save(r)
    }
    add(8841, "closed", 10000, "07359", 1, 10000, "2026-10-05 18:00:00.000Z")
    add(8842, "closed", 15000, "49201", 1, 15000, "2026-10-12 18:00:00.000Z")
    add(8843, "open", 25000, "", 0, 0, "")
  }
}

// ---------------------------------------------------------------------------
// Tickets (shared by wallet purchases and Flutterwave fulfilment)
// ---------------------------------------------------------------------------
// o = { userId, event, qty:{early,regular,vip}, price:{early,regular,vip}, name, email, method, total }
function issueTickets(tx, o) {
  const seats = o.qty.early + o.qty.regular + o.qty.vip
  const col = tx.findCollectionByNameOrId("tickets")
  const tickets = []
  for (const tier of ["early", "regular", "vip"]) {
    for (let i = 0; i < o.qty[tier]; i++) {
      const t = new Record(col)
      t.set("event", o.event.id)
      t.set("user", o.userId)
      t.set("tier", tier)
      t.set("price", o.price[tier])
      t.set("code", randomCode("BKF"))
      t.set("holder_name", o.name)
      t.set("holder_email", o.email)
      t.set("status", "valid")
      tx.save(t)
      tickets.push({ id: t.id, code: t.getString("code"), tier: tier })
    }
  }
  logTx(tx, o.userId, "ticket", o.method, -o.total, "completed", `${seats} x ${o.event.getString("title")}`)
  const vendorId = o.event.getString("vendor")
  if (vendorId && o.total > 0) {
    const vendor = tx.findRecordById("users", vendorId)
    const earn = money(o.total * (100 - CFG.PLATFORM_FEE_PERCENT) / 100)
    vendor.set("balance", money(vendor.getFloat("balance") + earn))
    tx.save(vendor)
    logTx(tx, vendorId, "ticket_sale", "Ticket sale", earn, "completed", `${seats} x ${o.event.getString("title")}`)
  }
  return tickets
}

// ---------------------------------------------------------------------------
// Flutterwave (v3 Standard hosted checkout). Secrets come from environment variables only:
//   FLW_SECRET_KEY, FLW_SECRET_HASH (webhook), BKF_FRONTEND_URL
//   optional: FLW_CURRENCY (default NGN), FLW_NGN_RATE (default 1500, keep equal to NGN_RATE in config.js)
// ---------------------------------------------------------------------------
function flwKey() { return ($os.getenv("FLW_SECRET_KEY") || "").trim() }
function flwEnabled() { return flwKey() !== "" }
function flwCurrency() { return ($os.getenv("FLW_CURRENCY") || "NGN").trim().toUpperCase() }

// Converts a USD amount into what the customer is actually charged.
function flwChargeAmount(usd) {
  if (flwCurrency() === "USD") return money(usd)
  const rate = Number($os.getenv("FLW_NGN_RATE")) || 1500
  return Math.round(usd * rate * 100) / 100
}

function flwRequest(method, path, body) {
  const res = $http.send({
    url: "https://api.flutterwave.com/v3" + path,
    method: method,
    headers: { "Authorization": "Bearer " + flwKey(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "",
    timeout: 30,
  })
  if (res.statusCode < 200 || res.statusCode >= 300 || !res.json || res.json.status !== "success") {
    const msg = (res.json && res.json.message) || ("HTTP " + res.statusCode)
    throw new Error("Flutterwave: " + msg)
  }
  return res.json
}

// Where Flutterwave sends the buyer back to. Prefer the fixed BKF_FRONTEND_URL.
function frontendOrigin(clientOrigin) {
  const fixed = ($os.getenv("BKF_FRONTEND_URL") || "").trim().replace(/\/+$/, "")
  if (fixed) return fixed
  const o = String(clientOrigin || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\/[^\/\s]+$/.test(o)) throw new BadRequestError("Could not work out where to return you after payment.")
  return o
}

// Asks Flutterwave for the real state of a transaction (never trust the browser or the webhook body).
function flwVerify(transactionId, reference) {
  const r = transactionId
    ? flwRequest("GET", "/transactions/" + encodeURIComponent(transactionId) + "/verify")
    : flwRequest("GET", "/transactions/verify_by_reference?tx_ref=" + encodeURIComponent(reference))
  return r.data || null
}

// Delivers what was bought once Flutterwave confirms payment. `data` is the VERIFIED
// transaction from flwVerify. Safe to call many times (webhook + return page): only the first call acts.
function fulfillFlutterwave(app, reference, data) {
  let out = { status: "pending" }
  app.runInTransaction((tx) => {
    let p
    try { p = tx.findFirstRecordByFilter("payments", "reference = {:r}", { r: reference }) }
    catch (_) { out = { status: "unknown" }; return }
    const kind = p.getString("kind")
    const prior = p.getString("status")
    if (prior !== "pending") {
      let result = {}
      try { result = JSON.parse(p.getString("result") || "{}") } catch (_) {}
      out = Object.assign({ status: prior, kind: kind }, result)
      return
    }
    if (!data) { out = { status: "pending", kind: kind }; return }
    const payload = JSON.parse(p.getString("payload") || "{}")
    if (data.status === "failed") { p.set("status", "failed"); tx.save(p); out = { status: "failed", kind: kind }; return }
    if (data.status !== "successful") { out = { status: "pending", kind: kind }; return }
    if (data.tx_ref !== reference || String(data.currency).toUpperCase() !== payload.currency || Number(data.amount) + 0.001 < payload.chargeAmount) {
      p.set("status", "failed"); tx.save(p)
      console.log("[bookitfest] flutterwave verification mismatch for", reference)
      out = { status: "failed", kind: kind }; return
    }
    const userId = p.getString("user")
    const amount = money(p.getFloat("amount"))
    let result = {}
    if (kind === "deposit") {
      const u = tx.findRecordById("users", userId)
      u.set("balance", money(u.getFloat("balance") + amount))
      tx.save(u)
      logTx(tx, userId, "deposit", "Flutterwave", amount, "completed", "Wallet top-up")
      result = { amount: amount }
    } else {
      const event = tx.findRecordById("events", payload.eventId)
      const short = shortfall(tx, event, payload.qty)
      if (short) {
        // Someone else took the last tickets while this buyer was on the payment page.
        // The money has been collected, so put it in their wallet rather than oversell.
        const u = tx.findRecordById("users", userId)
        u.set("balance", money(u.getFloat("balance") + amount))
        tx.save(u)
        logTx(tx, userId, "refund", "Flutterwave", amount, "completed", "Tickets sold out before payment cleared. Refunded to wallet.")
        result = { refunded: true, amount: amount, eventId: event.id, message: `${short} Your payment of the full amount was added to your Bookitfest wallet.` }
      } else {
        const tickets = issueTickets(tx, {
          userId: userId, event: event, qty: payload.qty, price: payload.price,
          name: payload.name, email: payload.email, method: "Flutterwave", total: amount,
        })
        result = { tickets: tickets, total: amount, eventId: event.id }
      }
    }
    p.set("status", "paid")
    p.set("result", JSON.stringify(result))
    tx.save(p)
    out = Object.assign({ status: "paid", kind: kind }, result)
  })
  return out
}

// ---------------------------------------------------------------------------
// Admin payments portal (deposits + withdrawals)
// ---------------------------------------------------------------------------
const PAY_STATUSES = ["pending", "completed", "failed"]

// Totals across every deposit / withdrawal ever made (not affected by the page filters).
function paymentsSummary(app) {
  const rows = arrayOf(new DynamicModel({ type: "", status: "", n: 0, total: 0 }))
  app.db().newQuery("SELECT type, status, COUNT(*) AS n, COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions WHERE type IN ('deposit', 'withdrawal') GROUP BY type, status").all(rows)
  const s = {
    depositsCount: 0, depositsTotal: 0,
    withdrawalsPendingCount: 0, withdrawalsPendingTotal: 0,
    withdrawalsPaidCount: 0, withdrawalsPaidTotal: 0,
    withdrawalsRejectedCount: 0,
  }
  for (const r of rows) {
    if (r.type === "deposit" && r.status === "completed") { s.depositsCount += r.n; s.depositsTotal = money(s.depositsTotal + r.total) }
    else if (r.type === "withdrawal" && r.status === "pending") { s.withdrawalsPendingCount += r.n; s.withdrawalsPendingTotal = money(s.withdrawalsPendingTotal + r.total) }
    else if (r.type === "withdrawal" && r.status === "completed") { s.withdrawalsPaidCount += r.n; s.withdrawalsPaidTotal = money(s.withdrawalsPaidTotal + r.total) }
    else if (r.type === "withdrawal" && r.status === "failed") { s.withdrawalsRejectedCount += r.n }
  }
  return s
}

// One page of deposits/withdrawals, newest first, with the account's name/email attached.
// Fetches one extra row to know whether there is a next page.
function listPayments(app, q) {
  const type = q.type === "deposit" || q.type === "withdrawal" || q.type === "adjustment" ? q.type : ""
  const status = PAY_STATUSES.includes(q.status) ? q.status : ""
  const search = String(q.q || "").trim().slice(0, 80)
  const perPage = Math.min(Math.max(int(q.perPage) || 20, 5), 100)
  const page = Math.max(int(q.page) || 1, 1)

  const where = [type ? "type = {:type}" : "(type = 'deposit' || type = 'withdrawal' || type = 'adjustment')"]
  const params = {}
  if (type) params.type = type
  if (status) { where.push("status = {:status}"); params.status = status }
  if (search) { where.push("(user.name ~ {:q} || user.email ~ {:q} || method ~ {:q})"); params.q = search }

  const rows = app.findRecordsByFilter("transactions", where.join(" && "), "-created", perPage + 1, (page - 1) * perPage, params)
  const hasMore = rows.length > perPage
  const pageRows = rows.slice(0, perPage)

  const ids = []
  for (const r of pageRows) { const id = r.getString("user"); if (id && !ids.includes(id)) ids.push(id) }
  const people = {}
  if (ids.length) for (const u of app.findRecordsByIds("users", ids)) people[u.id] = { id: u.id, name: u.getString("name"), email: u.email(), role: u.getString("role") || "user" }

  return {
    page: page, perPage: perPage, hasMore: hasMore,
    items: pageRows.map((t) => ({
      id: t.id, type: t.getString("type"), method: t.getString("method"), amount: t.getFloat("amount"),
      status: t.getString("status"), note: t.getString("note"), created: t.getString("created"), updated: t.getString("updated"),
      user: people[t.getString("user")] || { id: t.getString("user"), name: "", email: "", role: "" },
    })),
  }
}

// Everything an admin wants to see on one account: details, totals, recent wallet activity and tickets.
function userProfile(app, u) {
  const rows = arrayOf(new DynamicModel({ type: "", status: "", n: 0, total: 0 }))
  app.db().newQuery("SELECT type, status, COUNT(*) AS n, COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions WHERE user = {:id} GROUP BY type, status").bind({ id: u.id }).all(rows)
  const sum = (type, status) => rows.filter((r) => r.type === type && (!status || r.status === status)).reduce((a, r) => a + r.total, 0)
  const cnt = (type, status) => rows.filter((r) => r.type === type && (!status || r.status === status)).reduce((a, r) => a + r.n, 0)

  const txs = app.findRecordsByFilter("transactions", "user = {:id}", "-created", 15, 0, { id: u.id })
  const tickets = app.findRecordsByFilter("tickets", "user = {:id}", "-created", 8, 0, { id: u.id })
  const titles = {}
  const evIds = []
  for (const t of tickets) { const id = t.getString("event"); if (id && !evIds.includes(id)) evIds.push(id) }
  if (evIds.length) for (const ev of app.findRecordsByIds("events", evIds)) titles[ev.id] = ev.getString("title")

  return {
    user: { id: u.id, name: u.getString("name"), email: u.email(), role: u.getString("role") || "user", balance: u.getFloat("balance"), verified: u.verified(), created: u.getString("created") },
    stats: {
      tickets: app.countRecords("tickets", $dbx.hashExp({ user: u.id })),
      events: app.countRecords("events", $dbx.hashExp({ vendor: u.id })),
      deposited: money(sum("deposit", "completed")), depositCount: cnt("deposit", "completed"),
      withdrawn: money(sum("withdrawal", "completed")), withdrawalPending: money(sum("withdrawal", "pending")),
      credited: money(sum("adjustment", "completed")),
      salesEarned: money(sum("ticket_sale", "completed")),
    },
    transactions: txs.map((t) => ({ id: t.id, type: t.getString("type"), method: t.getString("method"), amount: t.getFloat("amount"), status: t.getString("status"), note: t.getString("note"), created: t.getString("created") })),
    tickets: tickets.map((t) => ({ id: t.id, event: titles[t.getString("event")] || "Event", tier: t.getString("tier"), price: t.getFloat("price"), status: t.getString("status"), code: t.getString("code"), created: t.getString("created") })),
  }
}

module.exports = {
  userProfile,
  TIERS, TIER_LABEL, tierSold, availability, shortfall, capacityProblem, paymentsSummary, listPayments,
  CFG, money, int, simulatedPaymentsEnabled, randomCode, logTx, findOpenDraw, ensureOpenDraw, seedDemo,
  issueTickets, flwEnabled, flwCurrency, flwChargeAmount, flwRequest, flwVerify, frontendOrigin, fulfillFlutterwave,
}
