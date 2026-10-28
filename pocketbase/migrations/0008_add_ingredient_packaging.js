migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('ingredients')
    if (!col.fields.getByName('package_size')) {
      col.fields.add(new NumberField({ name: 'package_size', min: 0.0001 }))
    }
    if (!col.fields.getByName('package_unit')) {
      col.fields.add(
        new SelectField({
          name: 'package_unit',
          values: ['kg', 'g', 'L', 'mL', 'unidade'],
          maxSelect: 1,
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('ingredients')
      if (col.fields.getByName('package_unit')) {
        col.fields.removeByName('package_unit')
      }
      if (col.fields.getByName('package_size')) {
        col.fields.removeByName('package_size')
      }
      app.save(col)
    } catch (_) {}
  },
)
