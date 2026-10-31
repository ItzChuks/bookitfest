/// <reference path="../pb_data/types.d.ts" />
// Event cover images are now uploaded from the vendor's device and stored by PocketBase.
// The old `image_url` field stays so existing/demo events keep their pictures.
migrate((app) => {
  const events = app.findCollectionByNameOrId("events")
  events.fields.add(new FileField({
    name: "image",
    maxSelect: 1,
    maxSize: 5 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  }))
  app.save(events)
}, (app) => {
  const events = app.findCollectionByNameOrId("events")
  events.fields.removeByName("image")
  app.save(events)
})
