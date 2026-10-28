migrate(
  (app) => {
    // 1. Atualizar sales: ativar cascadeDelete no campo recipe_id
    // Isso garante que ao excluir uma ficha técnica, os registros de vendas vinculados a ela não bloqueiem a exclusão no PocketBase.
    const salesCol = app.findCollectionByNameOrId('sales')
    const recipeIdField = salesCol.fields.getByName('recipe_id')
    if (recipeIdField) {
      recipeIdField.cascadeDelete = true
      app.save(salesCol)
    }

    // 2. Garantir que recipe_items.recipe_id tenha cascadeDelete = true
    const recipeItemsCol = app.findCollectionByNameOrId('recipe_items')
    const riRecipeIdField = recipeItemsCol.fields.getByName('recipe_id')
    if (riRecipeIdField && !riRecipeIdField.cascadeDelete) {
      riRecipeIdField.cascadeDelete = true
      app.save(recipeItemsCol)
    }
  },
  (app) => {
    try {
      const salesCol = app.findCollectionByNameOrId('sales')
      const recipeIdField = salesCol.fields.getByName('recipe_id')
      if (recipeIdField) {
        recipeIdField.cascadeDelete = false
        app.save(salesCol)
      }
    } catch (_) {}
  },
)
