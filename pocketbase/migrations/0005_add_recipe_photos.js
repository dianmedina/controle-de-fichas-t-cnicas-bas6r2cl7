migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('recipes')
    if (!col.fields.getByName('photo_1')) {
      col.fields.add(
        new FileField({
          name: 'photo_1',
          maxSelect: 1,
          maxSize: 5242880, // 5MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        }),
      )
    }
    if (!col.fields.getByName('photo_2')) {
      col.fields.add(
        new FileField({
          name: 'photo_2',
          maxSelect: 1,
          maxSize: 5242880, // 5MB
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('recipes')
      col.fields.removeByName('photo_1')
      col.fields.removeByName('photo_2')
      app.save(col)
    } catch (_) {}
  },
)
