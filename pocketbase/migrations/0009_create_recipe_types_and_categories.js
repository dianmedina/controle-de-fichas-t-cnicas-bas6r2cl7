migrate(
  (app) => {
    // 1. Criar collection recipe_types (Tipos de Fichas Técnicas / Pratos)
    let recipeTypesCol
    try {
      recipeTypesCol = app.findCollectionByNameOrId('recipe_types')
    } catch (_) {
      recipeTypesCol = new Collection({
        name: 'recipe_types',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'slug', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'color', type: 'text' },
          { name: 'sort_order', type: 'number', min: 0 },
          { name: 'is_garnish', type: 'bool' }, // Flag: identifica se este tipo atua como guarnição/sub-ficha
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_recipe_types_slug ON recipe_types (slug)',
          'CREATE INDEX idx_recipe_types_name ON recipe_types (name)',
          'CREATE INDEX idx_recipe_types_order ON recipe_types (sort_order)',
        ],
      })
      app.save(recipeTypesCol)
    }

    // 2. Criar collection ingredient_categories (Categorias de Insumos)
    let ingredientCategoriesCol
    try {
      ingredientCategoriesCol = app.findCollectionByNameOrId('ingredient_categories')
    } catch (_) {
      ingredientCategoriesCol = new Collection({
        name: 'ingredient_categories',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'slug', type: 'text', required: true },
          { name: 'description', type: 'text' },
          { name: 'color', type: 'text' },
          { name: 'sort_order', type: 'number', min: 0 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_ingredient_categories_slug ON ingredient_categories (slug)',
          'CREATE INDEX idx_ingredient_categories_name ON ingredient_categories (name)',
          'CREATE INDEX idx_ingredient_categories_order ON ingredient_categories (sort_order)',
        ],
      })
      app.save(ingredientCategoriesCol)
    }

    // 3. Adicionar campos de relation opcionais em recipes e ingredients
    // recipes: type_id (relation -> recipe_types)
    // ingredients: category_id (relation -> ingredient_categories)
    const recipesCol = app.findCollectionByNameOrId('recipes')
    if (!recipesCol.fields.getByName('type_id')) {
      recipesCol.fields.add(
        new RelationField({
          name: 'type_id',
          collectionId: recipeTypesCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      recipesCol.addIndex('idx_recipes_type_id', false, 'type_id', '')
      app.save(recipesCol)
    }

    const ingredientsCol = app.findCollectionByNameOrId('ingredients')
    if (!ingredientsCol.fields.getByName('category_id')) {
      ingredientsCol.fields.add(
        new RelationField({
          name: 'category_id',
          collectionId: ingredientCategoriesCol.id,
          maxSelect: 1,
          cascadeDelete: false,
        }),
      )
      ingredientsCol.addIndex('idx_ingredients_category_id', false, 'category_id', '')
      app.save(ingredientsCol)
    }

    // 4. Seed padrão de recipe_types (prato e guarnicao)
    // Função auxiliar para criar slug
    const toSlug = (str) => {
      if (!str) return ''
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
    }

    const defaultTypes = [
      {
        name: 'Prato Principal',
        slug: 'prato',
        description: 'Pratos principais do cardápio servidos individualmente ou compartilhados',
        color: 'amber',
        sort_order: 1,
        is_garnish: false,
      },
      {
        name: 'Guarnição / Acompanhamento',
        slug: 'guarnicao',
        description:
          'Acompanhamentos que podem ser servidos avulsos ou compor a batelada de pratos principais',
        color: 'orange',
        sort_order: 2,
        is_garnish: true,
      },
      {
        name: 'Sobremesa',
        slug: 'sobremesa',
        description: 'Doces, tortas, frutas e sobremesas da casa',
        color: 'rose',
        sort_order: 3,
        is_garnish: false,
      },
      {
        name: 'Bebida / Drinque',
        slug: 'bebida',
        description: 'Bebidas artesanais, coquetéis, sucos e cafés',
        color: 'blue',
        sort_order: 4,
        is_garnish: false,
      },
      {
        name: 'Entrada / Aperitivo',
        slug: 'entrada',
        description: 'Petiscos, entradas e aperitivos servidos antes do prato principal',
        color: 'emerald',
        sort_order: 5,
        is_garnish: false,
      },
    ]

    for (const dt of defaultTypes) {
      try {
        app.findFirstRecordByData('recipe_types', 'slug', dt.slug)
      } catch (_) {
        const rec = new Record(recipeTypesCol)
        rec.set('name', dt.name)
        rec.set('slug', dt.slug)
        rec.set('description', dt.description)
        rec.set('color', dt.color)
        rec.set('sort_order', dt.sort_order)
        rec.set('is_garnish', dt.is_garnish)
        app.save(rec)
      }
    }

    // 5. Vincular receitas existentes ao respectivo recipe_types
    const allRecipeTypes = app.findRecordsByFilter('recipe_types', '', 'sort_order', 100, 0)
    const typeBySlug = {}
    for (const rt of allRecipeTypes) {
      typeBySlug[rt.getString('slug')] = rt.id
    }

    const existingRecipes = app.findRecordsByFilter('recipes', '', '', 500, 0)
    for (const r of existingRecipes) {
      const legacyType = r.getString('type') // 'prato' ou 'guarnicao'
      const matchedTypeId = typeBySlug[legacyType] || typeBySlug['prato']
      if (matchedTypeId && !r.getString('type_id')) {
        r.set('type_id', matchedTypeId)
        app.save(r)
      }
    }

    // 6. Popular ingredient_categories a partir das categorias já existentes nos insumos
    const existingIngredients = app.findRecordsByFilter('ingredients', '', '', 1000, 0)
    const foundCategories = new Set()
    for (const ing of existingIngredients) {
      const c = ing.getString('category')
      if (c && c.trim()) {
        foundCategories.add(c.trim())
      }
    }

    // Adiciona algumas categorias padrão caso a base esteja limpa
    const defaultCategoriesList = [
      'Carnes',
      'Peixe & Crustáceos',
      'Laticínios',
      'Hortifruti',
      'Grãos e Cereais',
      'Óleos e Azeites',
      'Bebidas & Temperos',
      'Embalagens',
      'Geral',
    ]
    for (const dc of defaultCategoriesList) {
      foundCategories.add(dc)
    }

    let catOrder = 1
    for (const catName of Array.from(foundCategories)) {
      const slug = toSlug(catName) || `cat-${catOrder}`
      let catRecord
      try {
        catRecord = app.findFirstRecordByData('ingredient_categories', 'slug', slug)
      } catch (_) {
        try {
          catRecord = new Record(ingredientCategoriesCol)
          catRecord.set('name', catName)
          catRecord.set('slug', slug)
          catRecord.set('description', `Categoria para insumos do grupo ${catName}`)
          catRecord.set('sort_order', catOrder)
          app.save(catRecord)
        } catch (_) {}
      }
      catOrder++
    }

    // 7. Vincular insumos existentes à sua respectiva category_id
    const allCategories = app.findRecordsByFilter('ingredient_categories', '', '', 500, 0)
    const catByName = {}
    const catBySlug = {}
    for (const cat of allCategories) {
      catByName[cat.getString('name').toLowerCase()] = cat.id
      catBySlug[cat.getString('slug')] = cat.id
    }

    for (const ing of existingIngredients) {
      const catName = ing.getString('category')
      if (catName && !ing.getString('category_id')) {
        const targetId = catByName[catName.toLowerCase()] || catBySlug[toSlug(catName)]
        if (targetId) {
          ing.set('category_id', targetId)
          app.save(ing)
        }
      }
    }
  },
  (app) => {
    try {
      const ingredientsCol = app.findCollectionByNameOrId('ingredients')
      if (ingredientsCol.fields.getByName('category_id')) {
        ingredientsCol.fields.removeByName('category_id')
        ingredientsCol.removeIndex('idx_ingredients_category_id')
        app.save(ingredientsCol)
      }
    } catch (_) {}

    try {
      const recipesCol = app.findCollectionByNameOrId('recipes')
      if (recipesCol.fields.getByName('type_id')) {
        recipesCol.fields.removeByName('type_id')
        recipesCol.removeIndex('idx_recipes_type_id')
        app.save(recipesCol)
      }
    } catch (_) {}

    try {
      const ic = app.findCollectionByNameOrId('ingredient_categories')
      app.delete(ic)
    } catch (_) {}

    try {
      const rt = app.findCollectionByNameOrId('recipe_types')
      app.delete(rt)
    } catch (_) {}
  },
)
