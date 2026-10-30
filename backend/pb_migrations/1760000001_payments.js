/// <reference path="../pb_data/types.d.ts" />
// Payments ledger for real card payments (Stripe Checkout). No client rules:
// only the server (pb_hooks) can read or write this collection.
migrate((app) => {
  const created = { type: "autodate", name: "created", onCreate: true, onUpdate: false }
  const updated = { type: "autodate", name: "updated", onCreate: true, onUpdate: true }
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base",
    name: "payments",
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { type: "select", name: "kind", required: true, maxSelect: 1, values: ["ticket", "deposit"] },
      { type: "text", name: "provider", max: 20 },
      { type: "text", name: "session_id", max: 200 },
      { type: "number", name: "amount", min: 0 },
      { type: "select", name: "status", required: true, maxSelect: 1, values: ["pending", "paid", "failed", "expired"] },
      { type: "text", name: "payload", max: 20000 },
      { type: "text", name: "result", max: 20000 },
      created, updated,
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_payments_session ON payments (session_id) WHERE session_id != ''",
      "CREATE INDEX idx_payments_user ON payments (user, created)",
    ],
  }))
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("payments")) } catch (_) {}
})
