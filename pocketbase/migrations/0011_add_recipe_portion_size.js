migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('recipes')
    if (!col.fields.getByName('portion_size_value')) {
      col.fields.add(new NumberField({ name: 'portion_size_value', min: 0 }))
    }
    if (!col.fields.getByName('portion_size_unit')) {
      col.fields.add(
        new SelectField({
          name: 'portion_size_unit',
          values: ['g', 'kg', 'mL', 'L', 'unidade'],
          maxSelect: 1,
        }),
      )
    }
    app.save(col)

    // Backfill opcional idempotente: se já houver registros com "PORÇÃO 400G" no campo notes, preencher se estiver vazio
    try {
      const records = app.findRecordsByFilter(
        'recipes',
        'portion_size_value = null || portion_size_value = 0',
        '',
        200,
        0,
      )
      for (const r of records) {
        const notes = r.getString('notes') || ''
        const match = notes.match(
          /por[cç][aã]o\s*:?\s*(\d+[.,]?\d*)\s*(kg|g|ml|l|unidade|unid|un)?/i,
        )
        if (match) {
          const val = parseFloat(match[1].replace(',', '.'))
          if (val > 0) {
            r.set('portion_size_value', val)
            let unit = (match[2] || 'g').toLowerCase()
            if (unit === 'ml') unit = 'mL'
            else if (unit === 'l') unit = 'L'
            else if (unit === 'unid' || unit === 'un') unit = 'unidade'
            else if (unit === 'kg') unit = 'kg'
            else unit = 'g'
            r.set('portion_size_unit', unit)
            app.save(r)
          }
        }
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('recipes')
      if (col.fields.getByName('portion_size_unit')) {
        col.fields.removeByName('portion_size_unit')
      }
      if (col.fields.getByName('portion_size_value')) {
        col.fields.removeByName('portion_size_value')
      }
      app.save(col)
    } catch (_) {}
  },
)
