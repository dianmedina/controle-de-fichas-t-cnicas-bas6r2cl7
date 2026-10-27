migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('recipes')
    if (!col.fields.getByName('labor_cost')) {
      col.fields.add(new NumberField({ name: 'labor_cost', min: 0 }))
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('recipes')
      col.fields.removeByName('labor_cost')
      app.save(col)
    } catch (_) {}
  },
)
