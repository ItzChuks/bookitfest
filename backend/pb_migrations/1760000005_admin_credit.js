/// <reference path="../pb_data/types.d.ts" />
// Lets admins add funds to a user's wallet by hand. Those are logged as "adjustment" transactions
// (shown as "Admin credit"), so they stay separate from real deposits in the payments totals.
migrate((app) => {
  const tx = app.findCollectionByNameOrId("transactions")
  const type = tx.fields.getByName("type")
  if (!type.values.includes("adjustment")) type.values = type.values.concat(["adjustment"])
  app.save(tx)
}, (app) => {
  const tx = app.findCollectionByNameOrId("transactions")
  const type = tx.fields.getByName("type")
  type.values = type.values.filter((v) => v !== "adjustment")
  app.save(tx)
})
