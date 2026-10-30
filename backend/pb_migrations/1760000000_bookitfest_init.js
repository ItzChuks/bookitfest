/// <reference path="../pb_data/types.d.ts" />
// Bookitfest schema. Money is stored in USD; the UI converts to NGN for display.
// Anything that moves money (tickets, wallet, Lucky 5) has NO client create rule:
// it only happens through the /api/bkf/* routes in pb_hooks/main.pb.js.
migrate((app) => {
  const created = { type: "autodate", name: "created", onCreate: true, onUpdate: false }
  const updated = { type: "autodate", name: "updated", onCreate: true, onUpdate: true }

  // ---- users: add role + balance, lock them down ----
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new SelectField({ name: "role", values: ["user", "vendor", "admin"], maxSelect: 1 }))
  users.fields.add(new NumberField({ name: "balance", min: 0 }))
  users.listRule = 'id = @request.auth.id || @request.auth.role = "admin"'
  users.viewRule = 'id = @request.auth.id || @request.auth.role = "admin"'
  users.createRule = '@request.body.balance:isset = false && (@request.body.role = "user" || @request.body.role = "vendor")'
  users.updateRule = 'id = @request.auth.id && @request.body.role:isset = false && @request.body.balance:isset = false'
  app.save(users)

  // ---- events ----
  const events = new Collection({
    type: "base",
    name: "events",
    listRule: 'status = "approved" || vendor = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'status = "approved" || vendor = @request.auth.id || @request.auth.role = "admin"',
    createRule: '@request.auth.role = "vendor" && @request.body.vendor = @request.auth.id && @request.body.status = "pending"',
    updateRule: '@request.auth.role = "admin" || (vendor = @request.auth.id && status = "pending" && @request.body.status:isset = false && @request.body.vendor:isset = false)',
    deleteRule: '@request.auth.role = "admin" || (vendor = @request.auth.id && status = "pending")',
    fields: [
      { type: "text", name: "title", required: true, max: 140 },
      { type: "select", name: "category", required: true, maxSelect: 1,
        values: ["Music Festival", "Tech Conference", "Cultural Fair", "Sports & Gaming"] },
      { type: "date", name: "starts_at", required: true },
      { type: "text", name: "location", required: true, max: 200 },
      { type: "url", name: "image_url" },
      { type: "text", name: "description", max: 4000 },
      { type: "relation", name: "vendor", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "vendor_name", max: 120 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "approved", "rejected"] },
      { type: "number", name: "price_early", required: true, min: 0 },
      { type: "number", name: "price_regular", required: true, min: 0 },
      { type: "number", name: "price_vip", required: true, min: 0 },
      created, updated,
    ],
    indexes: ["CREATE INDEX idx_events_status ON events (status, starts_at)"],
  })
  app.save(events)

  // ---- tickets (one record per seat, created server-side only) ----
  const ownTicket = 'user = @request.auth.id || event.vendor = @request.auth.id || @request.auth.role = "admin"'
  app.save(new Collection({
    type: "base",
    name: "tickets",
    listRule: ownTicket,
    viewRule: ownTicket,
    fields: [
      { type: "relation", name: "event", required: true, collectionId: events.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "select", name: "tier", required: true, maxSelect: 1, values: ["early", "regular", "vip"] },
      { type: "number", name: "price", min: 0 },
      { type: "text", name: "code", required: true },
      { type: "text", name: "holder_name", max: 120 },
      { type: "email", name: "holder_email" },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["valid", "used"] },
      created, updated,
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_tickets_code ON tickets (code)",
      "CREATE INDEX idx_tickets_user ON tickets (user)",
    ],
  }))

  // ---- transactions (ledger; amount is signed USD) ----
  const ownTx = 'user = @request.auth.id || @request.auth.role = "admin"'
  app.save(new Collection({
    type: "base",
    name: "transactions",
    listRule: ownTx,
    viewRule: ownTx,
    updateRule: '@request.auth.role = "admin" && @request.body.amount:isset = false && @request.body.user:isset = false',
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "select", name: "type", required: true, maxSelect: 1,
        values: ["deposit", "withdrawal", "ticket", "ticket_sale", "lucky_entry", "lucky_win"] },
      { type: "text", name: "method", max: 80 },
      { type: "number", name: "amount" },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "completed", "failed"] },
      { type: "text", name: "note", max: 300 },
      created, updated,
    ],
    indexes: ["CREATE INDEX idx_tx_user ON transactions (user, created)"],
  }))

  // ---- draws (public read; winning_digits stays empty until the draw runs) ----
  const draws = new Collection({
    type: "base",
    name: "draws",
    listRule: "",
    viewRule: "",
    fields: [
      { type: "number", name: "number", required: true },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["open", "closed"] },
      { type: "number", name: "jackpot", min: 0 },
      { type: "text", name: "winning_digits", max: 5 },
      { type: "number", name: "winners", min: 0 },
      { type: "number", name: "payout", min: 0 },
      { type: "text", name: "mode", max: 20 },
      { type: "date", name: "drawn_at" },
      created, updated,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_draws_number ON draws (number)"],
  })
  app.save(draws)

  // ---- lucky_entries ----
  app.save(new Collection({
    type: "base",
    name: "lucky_entries",
    listRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    viewRule: 'user = @request.auth.id || @request.auth.role = "admin"',
    fields: [
      { type: "relation", name: "draw", required: true, collectionId: draws.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "digits", required: true, min: 5, max: 5, pattern: "^[0-9]{5}$" },
      { type: "number", name: "fee", min: 0 },
      { type: "bool", name: "won" },
      created, updated,
    ],
    indexes: [
      "CREATE INDEX idx_entries_draw ON lucky_entries (draw, digits)",
      "CREATE INDEX idx_entries_user ON lucky_entries (user)",
    ],
  }))
}, (app) => {
  for (const name of ["lucky_entries", "draws", "transactions", "tickets", "events"]) {
    try { app.delete(app.findCollectionByNameOrId(name)) } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("role")
  users.fields.removeByName("balance")
  app.save(users)
})
