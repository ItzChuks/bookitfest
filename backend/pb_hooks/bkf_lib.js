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

// Gateways other than the in-app wallet are simulated until a real provider
// (Paystack / Stripe) is wired in. They only work when this env var is set.
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
    const add = (title, category, iso, location, image, status, vendorName, early, regular, vip, description) => {
      const r = new Record(col)
      r.set("title", title); r.set("category", category); r.set("starts_at", iso)
      r.set("location", location); r.set("image_url", image); r.set("status", status)
      r.set("vendor", vendor.id); r.set("vendor_name", vendorName)
      r.set("price_early", early); r.set("price_regular", regular); r.set("price_vip", vip)
      r.set("description", description)
      app.save(r)
    }
    add("Bookitfest Mega Concert 2026", "Music Festival", "2026-11-15 18:00:00.000Z", "Eko Atlantic City, Lagos",
      "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80",
      "approved", "Afrobeat Empire Ltd", 45, 75, 200,
      "A full night of live Afrobeats on the Atlantic waterfront. Gates open at 4 PM, headline sets from 8 PM.")
    add("Global Web3 & Tech Summit", "Tech Conference", "2026-12-02 09:00:00.000Z", "Landmark Centre, Victoria Island",
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80",
      "approved", "NaijaTech Ventures", 30, 60, 250,
      "One day of talks, workshops and demos from builders across West Africa. VIP includes the speakers' dinner.")
    add("Lagos Cultural & Culinary Fair", "Cultural Fair", "2026-12-18 12:00:00.000Z", "TBS Square, Lagos Island",
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1200&q=80",
      "pending", "Heritage Festive Guild", 15, 35, 100,
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
// Tickets (shared by wallet purchases and Stripe fulfilment)
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
// Stripe (hosted Checkout). Secrets come from environment variables only:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, BKF_FRONTEND_URL
// ---------------------------------------------------------------------------
function stripeKey() { return ($os.getenv("STRIPE_SECRET_KEY") || "").trim() }
function stripeEnabled() { return stripeKey() !== "" }

// Stripe wants application/x-www-form-urlencoded with bracketed nested keys.
function formEncode(obj) {
  const out = []
  const walk = (prefix, v) => {
    if (v === null || v === undefined) return
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${prefix}[${i}]`, x))
    else if (typeof v === "object") Object.keys(v).forEach((k) => walk(prefix ? `${prefix}[${k}]` : k, v[k]))
    else out.push(encodeURIComponent(prefix) + "=" + encodeURIComponent(String(v)))
  }
  walk("", obj)
  return out.join("&")
}

function stripeRequest(method, path, params) {
  const res = $http.send({
    url: "https://api.stripe.com/v1" + path,
    method: method,
    headers: { "Authorization": "Bearer " + stripeKey(), "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? formEncode(params) : "",
    timeout: 30,
  })
  if (res.statusCode < 200 || res.statusCode >= 300) {
    const msg = (res.json && res.json.error && res.json.error.message) || ("HTTP " + res.statusCode)
    throw new Error("Stripe: " + msg)
  }
  return res.json
}

// Where Stripe sends the buyer back to. Prefer the fixed BKF_FRONTEND_URL.
function frontendOrigin(clientOrigin) {
  const fixed = ($os.getenv("BKF_FRONTEND_URL") || "").trim().replace(/\/+$/, "")
  if (fixed) return fixed
  const o = String(clientOrigin || "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\/[^\/\s]+$/.test(o)) throw new BadRequestError("Could not work out where to return you after payment.")
  return o
}

// Verifies the Stripe-Signature header (HMAC-SHA256 of "<t>.<raw body>").
function verifyStripeSignature(raw, header, secret) {
  if (!header || !secret) return false
  let t = "", sigs = []
  String(header).split(",").forEach((part) => {
    const i = part.indexOf("=")
    if (i < 0) return
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim()
    if (k === "t") t = v
    else if (k === "v1") sigs.push(v)
  })
  if (!t || !sigs.length) return false
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > 300) return false
  const expected = $security.hs256(`${t}.${raw}`, secret)
  return sigs.some((s) => $security.equal(s, expected))
}

// Marks a Stripe Checkout session as paid and delivers what was bought.
// Safe to call many times (webhook + return-page confirm): only the first call acts.
function fulfillStripeSession(app, session) {
  let out = { status: "pending" }
  app.runInTransaction((tx) => {
    let p
    try { p = tx.findFirstRecordByFilter("payments", "session_id = {:s}", { s: session.id }) }
    catch (_) { out = { status: "unknown" }; return }
    const kind = p.getString("kind")
    const prior = p.getString("status")
    if (prior !== "pending") {
      let result = {}
      try { result = JSON.parse(p.getString("result") || "{}") } catch (_) {}
      out = Object.assign({ status: prior, kind: kind }, result)
      return
    }
    if (session.payment_status !== "paid") { out = { status: "pending", kind: kind }; return }
    if (Number(session.amount_total) !== Math.round(p.getFloat("amount") * 100)) {
      p.set("status", "failed"); tx.save(p)
      console.log("[bookitfest] stripe amount mismatch for", session.id)
      out = { status: "failed", kind: kind }; return
    }
    const userId = p.getString("user")
    const amount = money(p.getFloat("amount"))
    const payload = JSON.parse(p.getString("payload") || "{}")
    let result = {}
    if (kind === "deposit") {
      const u = tx.findRecordById("users", userId)
      u.set("balance", money(u.getFloat("balance") + amount))
      tx.save(u)
      logTx(tx, userId, "deposit", "Stripe", amount, "completed", "Wallet top-up")
      result = { amount: amount }
    } else {
      const event = tx.findRecordById("events", payload.eventId)
      const tickets = issueTickets(tx, {
        userId: userId, event: event, qty: payload.qty, price: payload.price,
        name: payload.name, email: payload.email, method: "Stripe", total: amount,
      })
      result = { tickets: tickets, total: amount, eventId: event.id }
    }
    p.set("status", "paid")
    p.set("result", JSON.stringify(result))
    tx.save(p)
    out = Object.assign({ status: "paid", kind: kind }, result)
  })
  return out
}

module.exports = {
  CFG, money, int, simulatedPaymentsEnabled, randomCode, logTx, findOpenDraw, ensureOpenDraw, seedDemo,
  issueTickets, stripeEnabled, stripeRequest, frontendOrigin, verifyStripeSignature, fulfillStripeSession,
}
