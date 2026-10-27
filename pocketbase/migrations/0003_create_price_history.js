migrate(
  (app) => {
    // Verificar se collection já existe
    try {
      app.findCollectionByNameOrId('ingredient_price_history')
      return
    } catch (_) {}

    const ingredientsCol = app.findCollectionByNameOrId('ingredients')
    const ingredientsId = ingredientsCol.id

    const priceHistory = new Collection({
      name: 'ingredient_price_history',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'ingredient_id',
          type: 'relation',
          required: true,
          collectionId: ingredientsId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'price', type: 'number', required: false, min: 0 },
        { name: 'date', type: 'text', required: true },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_price_history_ingredient ON ingredient_price_history (ingredient_id)',
        'CREATE INDEX idx_price_history_date ON ingredient_price_history (date)',
      ],
    })
    app.save(priceHistory)

    // Backfill inicial: para os insumos existentes que possuem preço, criar um registro inicial de histórico
    const existingIngredients = app.findRecordsByFilter('ingredients', 'price > 0', 'created', 0, 0)
    for (const ing of existingIngredients) {
      const rec = new Record(priceHistory)
      rec.set('ingredient_id', ing.id)
      rec.set('price', ing.getFloat('price'))
      const createdDate = ing.getString('created') || new Date().toISOString()
      rec.set('date', createdDate.slice(0, 10))
      rec.set('notes', 'Preço inicial de cadastro')
      app.save(rec)
    }
  },
  (app) => {
    try {
      const ph = app.findCollectionByNameOrId('ingredient_price_history')
      app.delete(ph)
    } catch (_) {}
  },
)
