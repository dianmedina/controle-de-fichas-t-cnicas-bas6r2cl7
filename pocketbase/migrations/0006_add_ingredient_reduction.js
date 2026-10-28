migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ingredients')
    if (!col.fields.getByName('reduction_percent')) {
      col.fields.add(new NumberField({ name: 'reduction_percent', min: 0, max: 100 }))
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('ingredients')
      col.fields.removeByName('reduction_percent')
      app.save(col)
    } catch (_) {}
  },
)
