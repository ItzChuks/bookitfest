/// <reference path="../pb_data/types.d.ts" />
// Ticket tiers + admin payments portal.
//
// 1. Vendors now decide how many tickets they sell per tier (Early Bird / Regular / VIP).
//    `qty_<tier>` is the capacity; 0 means that tier is not offered for the event.
//    Events that already exist are given 500 per tier so nothing disappears from sale;
//    vendors can change it from their dashboard (it can never go below what is already sold).
// 2. Prices are no longer "required": a required number field rejects 0, which broke
//    "free" tickets and made it impossible to skip a tier.
// 3. Transactions get a "refund" type (used when an admin rejects a withdrawal).
// 4. Transaction updates are server-only now. Admins pay out / reject withdrawals through
//    /api/bkf/admin/withdrawal, which moves the money and the status together.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  for (const t of ["early", "regular", "vip"]) {
    events.fields.add(new NumberField({ name: `qty_${t}`, min: 0, onlyInt: true }))
    events.fields.getByName(`price_${t}`).required = false
  }
  app.save(events)
  app.db().newQuery("UPDATE events SET qty_early = 500, qty_regular = 500, qty_vip = 500").execute()

  const tx = app.findCollectionByNameOrId("transactions")
  const type = tx.fields.getByName("type")
  if (!type.values.includes("refund")) type.values = type.values.concat(["refund"])
  tx.updateRule = null
  app.save(tx)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  for (const t of ["early", "regular", "vip"]) events.fields.removeByName(`qty_${t}`)
  app.save(events)

  const tx = app.findCollectionByNameOrId("transactions")
  tx.updateRule = '@request.auth.role = "admin" && @request.body.amount:isset = false && @request.body.user:isset = false'
  app.save(tx)
})
