migrate(
  (app) => {
    const recipeItemsCol = app.findCollectionByNameOrId('recipe_items')
    const recipesCol = app.findCollectionByNameOrId('recipes')

    // 1. Tornar ingredient_id opcional (permitindo que o item seja uma guarnição sub-ficha)
    const ingredientField = recipeItemsCol.fields.getByName('ingredient_id')
    if (ingredientField) {
      ingredientField.required = false
    }

    // 2. Adicionar sub_recipe_id apontando para recipes
    if (!recipeItemsCol.fields.getByName('sub_recipe_id')) {
      recipeItemsCol.fields.add(
        new RelationField({
          name: 'sub_recipe_id',
          collectionId: recipesCol.id,
          cascadeDelete: false,
          maxSelect: 1,
          required: false,
        }),
      )
    }

    // 3. Adicionar índice em sub_recipe_id
    recipeItemsCol.addIndex('idx_recipe_items_sub_recipe', false, 'sub_recipe_id', '')

    app.save(recipeItemsCol)
  },
  (app) => {
    try {
      const recipeItemsCol = app.findCollectionByNameOrId('recipe_items')
      recipeItemsCol.removeIndex('idx_recipe_items_sub_recipe')
      const subRecipeField = recipeItemsCol.fields.getByName('sub_recipe_id')
      if (subRecipeField) {
        recipeItemsCol.fields.removeByName('sub_recipe_id')
      }
      const ingredientField = recipeItemsCol.fields.getByName('ingredient_id')
      if (ingredientField) {
        ingredientField.required = true
      }
      app.save(recipeItemsCol)
    } catch (_) {}
  },
)
