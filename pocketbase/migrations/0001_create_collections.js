migrate(
  (app) => {
    // 1. Insumos
    const ingredients = new Collection({
      name: 'ingredients',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'price', type: 'number', required: false, min: 0 },
        {
          name: 'unit',
          type: 'select',
          required: true,
          values: ['kg', 'g', 'L', 'mL', 'unidade'],
          maxSelect: 1,
        },
        { name: 'category', type: 'text', required: true },
        { name: 'supplier', type: 'text' },
        { name: 'min_stock', type: 'number', min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_ingredients_name ON ingredients (name)',
        'CREATE INDEX idx_ingredients_category ON ingredients (category)',
      ],
    })
    app.save(ingredients)

    // 2. Fichas Técnicas (Receitas / Pratos / Guarnições)
    const recipes = new Collection({
      name: 'recipes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'name', type: 'text', required: true },
        {
          name: 'type',
          type: 'select',
          required: true,
          values: ['prato', 'guarnicao'],
          maxSelect: 1,
        },
        { name: 'yield_portions', type: 'number', min: 0.1 },
        { name: 'selling_price', type: 'number', min: 0 },
        { name: 'notes', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_recipes_name ON recipes (name)',
        'CREATE INDEX idx_recipes_type ON recipes (type)',
      ],
    })
    app.save(recipes)

    const ingredientsId = ingredients.id
    const recipesId = recipes.id

    // 3. Recipe Items (Associação Ficha Técnica <-> Insumo com quantidade e unidade de uso)
    const recipeItems = new Collection({
      name: 'recipe_items',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'recipe_id',
          type: 'relation',
          required: true,
          collectionId: recipesId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'ingredient_id',
          type: 'relation',
          required: true,
          collectionId: ingredientsId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'quantity', type: 'number', required: true, min: 0.0001 },
        {
          name: 'unit',
          type: 'select',
          required: true,
          values: ['kg', 'g', 'L', 'mL', 'unidade'],
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_recipe_items_recipe ON recipe_items (recipe_id)',
        'CREATE INDEX idx_recipe_items_ingredient ON recipe_items (ingredient_id)',
      ],
    })
    app.save(recipeItems)

    // 4. Sales (Vendas por prato)
    const sales = new Collection({
      name: 'sales',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        {
          name: 'recipe_id',
          type: 'relation',
          required: true,
          collectionId: recipesId,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'date', type: 'text', required: true },
        { name: 'quantity', type: 'number', required: true, min: 1 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_sales_date ON sales (date)',
        'CREATE INDEX idx_sales_recipe ON sales (recipe_id)',
      ],
    })
    app.save(sales)
  },
  (app) => {
    try {
      const s = app.findCollectionByNameOrId('sales')
      app.delete(s)
    } catch (_) {}
    try {
      const ri = app.findCollectionByNameOrId('recipe_items')
      app.delete(ri)
    } catch (_) {}
    try {
      const r = app.findCollectionByNameOrId('recipes')
      app.delete(r)
    } catch (_) {}
    try {
      const i = app.findCollectionByNameOrId('ingredients')
      app.delete(i)
    } catch (_) {}
  },
)
