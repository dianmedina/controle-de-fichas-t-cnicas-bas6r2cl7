migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // 1. Usuário Gestor/Chef
    let adminId = ''
    try {
      const existing = app.findAuthRecordByEmail('_pb_users_auth_', 'medinafiles@gmail.com')
      adminId = existing.id
    } catch (_) {
      const record = new Record(users)
      record.setEmail('medinafiles@gmail.com')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', 'Chef Gestor')
      app.save(record)
      adminId = record.id
    }

    // 2. Insumos iniciais representativos
    const ingredientsCol = app.findCollectionByNameOrId('ingredients')
    const recipesCol = app.findCollectionByNameOrId('recipes')
    const recipeItemsCol = app.findCollectionByNameOrId('recipe_items')
    const salesCol = app.findCollectionByNameOrId('sales')

    // Verificar se já possui insumos
    if (app.countRecords('ingredients') > 0) {
      return
    }

    const sampleIngredients = [
      {
        name: 'Filé Mignon Bovino',
        price: 68.9,
        unit: 'kg',
        category: 'Carnes',
        supplier: 'Frigorífico Boi Nobre',
        min_stock: 5,
      },
      {
        name: 'Arroz Arbóreo',
        price: 24.5,
        unit: 'kg',
        category: 'Grãos e Cereais',
        supplier: 'Distribuidora Grão Real',
        min_stock: 10,
      },
      {
        name: 'Queijo Parmesão Ralado Fresco',
        price: 95.0,
        unit: 'kg',
        category: 'Laticínios',
        supplier: 'Laticínios Serra',
        min_stock: 2,
      },
      {
        name: 'Manteiga Extra Sem Sal',
        price: 42.0,
        unit: 'kg',
        category: 'Laticínios',
        supplier: 'Laticínios Serra',
        min_stock: 3,
      },
      {
        name: 'Vinho Branco Seco Culinário',
        price: 28.0,
        unit: 'L',
        category: 'Bebidas & Temperos',
        supplier: 'Adega Central',
        min_stock: 4,
      },
      {
        name: 'Cebola Amarela',
        price: 6.5,
        unit: 'kg',
        category: 'Hortifruti',
        supplier: 'Ceasa Distribuidora',
        min_stock: 8,
      },
      {
        name: 'Alho Descascado',
        price: 32.0,
        unit: 'kg',
        category: 'Hortifruti',
        supplier: 'Ceasa Distribuidora',
        min_stock: 2,
      },
      {
        name: 'Azeite de Oliva Extra Virgem',
        price: 48.0,
        unit: 'L',
        category: 'Óleos e Azeites',
        supplier: 'Distribuidora Grão Real',
        min_stock: 5,
      },
      {
        name: 'Batata Inglesa Especial',
        price: 7.2,
        unit: 'kg',
        category: 'Hortifruti',
        supplier: 'Ceasa Distribuidora',
        min_stock: 15,
      },
      {
        name: 'Creme de Leite Fresco',
        price: 34.0,
        unit: 'L',
        category: 'Laticínios',
        supplier: 'Laticínios Serra',
        min_stock: 4,
      },
      {
        name: 'Ovos Caipiras (dúzia)',
        price: 14.0,
        unit: 'unidade',
        category: 'Hortifruti',
        supplier: 'Granja São Bento',
        min_stock: 6,
      },
      {
        name: 'Cogumelo Paris Fresco',
        price: 54.0,
        unit: 'kg',
        category: 'Hortifruti',
        supplier: 'Fazenda Cogumelos',
        min_stock: 3,
      },
    ]

    const ingredientMap = {}

    for (const item of sampleIngredients) {
      const rec = new Record(ingredientsCol)
      rec.set('name', item.name)
      rec.set('price', item.price)
      rec.set('unit', item.unit)
      rec.set('category', item.category)
      rec.set('supplier', item.supplier)
      rec.set('min_stock', item.min_stock)
      app.save(rec)
      ingredientMap[item.name] = rec.id
    }

    // 3. Fichas Técnicas (Pratos e Guarnições)
    // Prato 1: Risoto de Filé Mignon ao Vinho
    const r1 = new Record(recipesCol)
    r1.set('name', 'Risoto de Filé Mignon ao Vinho Tinto')
    r1.set('type', 'prato')
    r1.set('yield_portions', 2)
    r1.set('selling_price', 89.0)
    r1.set('notes', 'Prato principal clássico da casa. Servido quente com toque de parmesão.')
    app.save(r1)

    // Itens do Risoto
    const r1Items = [
      { ing: 'Arroz Arbóreo', qty: 250, unit: 'g' },
      { ing: 'Filé Mignon Bovino', qty: 300, unit: 'g' },
      { ing: 'Manteiga Extra Sem Sal', qty: 40, unit: 'g' },
      { ing: 'Queijo Parmesão Ralado Fresco', qty: 60, unit: 'g' },
      { ing: 'Vinho Branco Seco Culinário', qty: 100, unit: 'mL' },
      { ing: 'Cebola Amarela', qty: 60, unit: 'g' },
      { ing: 'Azeite de Oliva Extra Virgem', qty: 30, unit: 'mL' },
    ]

    for (const item of r1Items) {
      if (ingredientMap[item.ing]) {
        const rec = new Record(recipeItemsCol)
        rec.set('recipe_id', r1.id)
        rec.set('ingredient_id', ingredientMap[item.ing])
        rec.set('quantity', item.qty)
        rec.set('unit', item.unit)
        app.save(rec)
      }
    }

    // Prato 2: Medalhão de Filé Mignon com Molho de Cogumelos
    const r2 = new Record(recipesCol)
    r2.set('name', 'Medalhão de Mignon com Cogumelos')
    r2.set('type', 'prato')
    r2.set('yield_portions', 1)
    r2.set('selling_price', 74.0)
    r2.set('notes', 'Grelhado ao ponto do cliente acompanhado de emulsão de cogumelos.')
    app.save(r2)

    const r2Items = [
      { ing: 'Filé Mignon Bovino', qty: 220, unit: 'g' },
      { ing: 'Cogumelo Paris Fresco', qty: 80, unit: 'g' },
      { ing: 'Creme de Leite Fresco', qty: 70, unit: 'mL' },
      { ing: 'Manteiga Extra Sem Sal', qty: 20, unit: 'g' },
      { ing: 'Alho Descascado', qty: 10, unit: 'g' },
    ]

    for (const item of r2Items) {
      if (ingredientMap[item.ing]) {
        const rec = new Record(recipeItemsCol)
        rec.set('recipe_id', r2.id)
        rec.set('ingredient_id', ingredientMap[item.ing])
        rec.set('quantity', item.qty)
        rec.set('unit', item.unit)
        app.save(rec)
      }
    }

    // Guarnição 1: Purê de Batatas Aveludado
    const r3 = new Record(recipesCol)
    r3.set('name', 'Purê de Batatas Aveludado')
    r3.set('type', 'guarnicao')
    r3.set('yield_portions', 4)
    r3.set('selling_price', 28.0)
    r3.set('notes', 'Guarnição clássica rica em manteiga e creme de leite.')
    app.save(r3)

    const r3Items = [
      { ing: 'Batata Inglesa Especial', qty: 800, unit: 'g' },
      { ing: 'Manteiga Extra Sem Sal', qty: 80, unit: 'g' },
      { ing: 'Creme de Leite Fresco', qty: 120, unit: 'mL' },
    ]

    for (const item of r3Items) {
      if (ingredientMap[item.ing]) {
        const rec = new Record(recipeItemsCol)
        rec.set('recipe_id', r3.id)
        rec.set('ingredient_id', ingredientMap[item.ing])
        rec.set('quantity', item.qty)
        rec.set('unit', item.unit)
        app.save(rec)
      }
    }

    // 4. Vendas diárias de exemplo (dos últimos 3 dias)
    const today = new Date().toISOString().slice(0, 10)
    const d1 = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const d2 = new Date(Date.now() - 172800000).toISOString().slice(0, 10)

    const sampleSales = [
      { recipe_id: r1.id, date: d2, quantity: 12 },
      { recipe_id: r2.id, date: d2, quantity: 18 },
      { recipe_id: r3.id, date: d2, quantity: 9 },

      { recipe_id: r1.id, date: d1, quantity: 15 },
      { recipe_id: r2.id, date: d1, quantity: 22 },
      { recipe_id: r3.id, date: d1, quantity: 14 },

      { recipe_id: r1.id, date: today, quantity: 10 },
      { recipe_id: r2.id, date: today, quantity: 16 },
      { recipe_id: r3.id, date: today, quantity: 8 },
    ]

    for (const s of sampleSales) {
      const saleRec = new Record(salesCol)
      saleRec.set('recipe_id', s.recipe_id)
      saleRec.set('date', s.date)
      saleRec.set('quantity', s.quantity)
      app.save(saleRec)
    }
  },
  (app) => {
    try {
      const s = app.findCollectionByNameOrId('sales')
      app.truncateCollection(s)
      const ri = app.findCollectionByNameOrId('recipe_items')
      app.truncateCollection(ri)
      const r = app.findCollectionByNameOrId('recipes')
      app.truncateCollection(r)
      const i = app.findCollectionByNameOrId('ingredients')
      app.truncateCollection(i)
    } catch (_) {}
  },
)
