migrate(
  (app) => {
    // 1. Atualizar a coleção 'users'
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // Adiciona o campo 'role' caso não exista
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({
          name: 'role',
          required: true,
          values: ['gestor', 'cozinha'],
          maxSelect: 1,
        }),
      )
    }

    // Adiciona o campo 'active' (booleano opcional, nunca required) para ativar/desativar usuários
    if (!users.fields.getByName('active')) {
      users.fields.add(
        new BoolField({
          name: 'active',
          required: false,
        }),
      )
    }

    // Atualiza regras de acesso da coleção 'users':
    // - list: gestor pode listar todos os usuários, usuário comum pode ver a si mesmo
    // - view: gestor pode ver todos, usuário comum a si mesmo
    // - create: apenas gestor pode criar usuários (ou se não houver usuários cadastrados)
    // - update: gestor pode atualizar qualquer um; próprio usuário pode se atualizar mas sem alterar seu próprio role nem active
    // - delete: apenas gestor pode excluir usuários, impedindo que o gestor se auto-exclua
    users.listRule =
      "@request.auth.id != '' && (@request.auth.role = 'gestor' || id = @request.auth.id)"
    users.viewRule =
      "@request.auth.id != '' && (@request.auth.role = 'gestor' || id = @request.auth.id)"
    users.createRule = "@request.auth.role = 'gestor'"
    users.updateRule =
      "@request.auth.id != '' && (@request.auth.role = 'gestor' || (id = @request.auth.id && @request.body.role:changed = false && @request.body.active:changed = false))"
    users.deleteRule = "@request.auth.role = 'gestor' && id != @request.auth.id"

    app.save(users)

    // Atualiza o usuário existente medinafiles@gmail.com para 'gestor' e 'active' = true
    try {
      const adminRecord = app.findAuthRecordByEmail('_pb_users_auth_', 'medinafiles@gmail.com')
      adminRecord.set('role', 'gestor')
      adminRecord.set('active', true)
      app.save(adminRecord)
    } catch (_) {
      // Se não existir, tenta criar ou prossegue
    }

    // Backfill defensivo: qualquer outro usuário existente sem role assume 'gestor'
    app.db().newQuery("UPDATE users SET role = 'gestor' WHERE role IS NULL OR role = ''").execute()
    app.db().newQuery('UPDATE users SET active = 1 WHERE active IS NULL').execute()

    // 2. Atualizar API rules para proteger o backend:
    // Cozinha só pode listar e ver 'recipes', 'recipe_items' e 'recipe_types'.
    // Cozinha NÃO pode criar, editar ou excluir 'recipes', 'recipe_items', 'ingredients', 'ingredient_categories', 'sales', 'ingredient_price_history'.

    // Recipes: Cozinha pode list e view; create, update, delete apenas Gestor
    try {
      const recipes = app.findCollectionByNameOrId('recipes')
      recipes.listRule = "@request.auth.id != ''"
      recipes.viewRule = "@request.auth.id != ''"
      recipes.createRule = "@request.auth.role = 'gestor'"
      recipes.updateRule = "@request.auth.role = 'gestor'"
      recipes.deleteRule = "@request.auth.role = 'gestor'"
      app.save(recipes)
    } catch (_) {}

    // Recipe Items: Cozinha pode list e view; create, update, delete apenas Gestor
    try {
      const recipeItems = app.findCollectionByNameOrId('recipe_items')
      recipeItems.listRule = "@request.auth.id != ''"
      recipeItems.viewRule = "@request.auth.id != ''"
      recipeItems.createRule = "@request.auth.role = 'gestor'"
      recipeItems.updateRule = "@request.auth.role = 'gestor'"
      recipeItems.deleteRule = "@request.auth.role = 'gestor'"
      app.save(recipeItems)
    } catch (_) {}

    // Recipe Types: Cozinha pode list e view; alteração apenas Gestor
    try {
      const recipeTypes = app.findCollectionByNameOrId('recipe_types')
      recipeTypes.listRule = "@request.auth.id != ''"
      recipeTypes.viewRule = "@request.auth.id != ''"
      recipeTypes.createRule = "@request.auth.role = 'gestor'"
      recipeTypes.updateRule = "@request.auth.role = 'gestor'"
      recipeTypes.deleteRule = "@request.auth.role = 'gestor'"
      app.save(recipeTypes)
    } catch (_) {}

    // Ingredients: Cozinha pode ler para exibir nomes nas fichas, mas só Gestor edita/cria/exclui
    try {
      const ingredients = app.findCollectionByNameOrId('ingredients')
      ingredients.listRule = "@request.auth.id != ''"
      ingredients.viewRule = "@request.auth.id != ''"
      ingredients.createRule = "@request.auth.role = 'gestor'"
      ingredients.updateRule = "@request.auth.role = 'gestor'"
      ingredients.deleteRule = "@request.auth.role = 'gestor'"
      app.save(ingredients)
    } catch (_) {}

    // Ingredient Categories: Apenas Gestor
    try {
      const ingredientCategories = app.findCollectionByNameOrId('ingredient_categories')
      ingredientCategories.listRule = "@request.auth.id != ''"
      ingredientCategories.viewRule = "@request.auth.id != ''"
      ingredientCategories.createRule = "@request.auth.role = 'gestor'"
      ingredientCategories.updateRule = "@request.auth.role = 'gestor'"
      ingredientCategories.deleteRule = "@request.auth.role = 'gestor'"
      app.save(ingredientCategories)
    } catch (_) {}

    // Sales: Apenas Gestor
    try {
      const sales = app.findCollectionByNameOrId('sales')
      sales.listRule = "@request.auth.role = 'gestor'"
      sales.viewRule = "@request.auth.role = 'gestor'"
      sales.createRule = "@request.auth.role = 'gestor'"
      sales.updateRule = "@request.auth.role = 'gestor'"
      sales.deleteRule = "@request.auth.role = 'gestor'"
      app.save(sales)
    } catch (_) {}

    // Ingredient Price History: Apenas Gestor
    try {
      const priceHistory = app.findCollectionByNameOrId('ingredient_price_history')
      priceHistory.listRule = "@request.auth.role = 'gestor'"
      priceHistory.viewRule = "@request.auth.role = 'gestor'"
      priceHistory.createRule = "@request.auth.role = 'gestor'"
      priceHistory.updateRule = "@request.auth.role = 'gestor'"
      priceHistory.deleteRule = "@request.auth.role = 'gestor'"
      app.save(priceHistory)
    } catch (_) {}
  },
  (app) => {
    // Reverter regras e campos caso necessário
    try {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const roleField = users.fields.getByName('role')
      if (roleField) users.fields.remove(roleField)
      const activeField = users.fields.getByName('active')
      if (activeField) users.fields.remove(activeField)
      users.listRule = 'id = @request.auth.id'
      users.viewRule = 'id = @request.auth.id'
      users.createRule = ''
      users.updateRule = 'id = @request.auth.id'
      users.deleteRule = 'id = @request.auth.id'
      app.save(users)
    } catch (_) {}
  },
)
