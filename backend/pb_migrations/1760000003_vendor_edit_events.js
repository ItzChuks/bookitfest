/// <reference path="../pb_data/types.d.ts" />
// Vendors can now edit their own events at any status (pending, approved, rejected).
// They still can't change who owns the event, the vendor_name stamp, or approve it themselves.
// Editing a rejected event may set status back to "pending" to resubmit it for review.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  events.updateRule =
    '@request.auth.role = "admin" || (' +
      'vendor = @request.auth.id' +
      ' && @request.body.vendor:isset = false' +
      ' && @request.body.vendor_name:isset = false' +
      ' && ((status = "approved" && @request.body.status:isset = false)' +
      ' || (status != "approved" && (@request.body.status:isset = false || @request.body.status = "pending")))' +
    ')'
  app.save(events)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  events.updateRule = '@request.auth.role = "admin" || (vendor = @request.auth.id && status = "pending" && @request.body.status:isset = false && @request.body.vendor:isset = false)'
  app.save(events)
})
