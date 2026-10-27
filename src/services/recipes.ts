import pb from '@/lib/pocketbase/client'
import { Recipe, RecipeItem, calculateItemCost } from '@/types/restaurant'

export interface RecipeWithCost extends Recipe {
  items: RecipeItem[]
  ingredientsCost: number
  laborCost: number
  totalCost: number
  costPerPortion: number
  marginPercent: number
  profitPerPortion: number
}

export const recipesService = {
  async getAll(): Promise<Recipe[]> {
    return await pb.collection('recipes').getFullList<Recipe>({
      sort: 'name',
    })
  },

  async getById(id: string): Promise<Recipe> {
    return await pb.collection('recipes').getOne<Recipe>(id)
  },

  async getItemsByRecipeId(recipeId: string): Promise<RecipeItem[]> {
    return await pb.collection('recipe_items').getFullList<RecipeItem>({
      filter: `recipe_id = "${recipeId}"`,
      expand: 'ingredient_id',
      sort: 'created',
    })
  },

  async getAllRecipeItems(): Promise<RecipeItem[]> {
    return await pb.collection('recipe_items').getFullList<RecipeItem>({
      expand: 'ingredient_id',
    })
  },

  async create(data: Omit<Recipe, 'id' | 'created' | 'updated'>): Promise<Recipe> {
    return await pb.collection('recipes').create<Recipe>(data)
  },

  async update(
    id: string,
    data: Partial<Omit<Recipe, 'id' | 'created' | 'updated'>> | FormData,
  ): Promise<Recipe> {
    return await pb.collection('recipes').update<Recipe>(id, data)
  },

  getPhotoUrl(recipe: { id: string }, filename: string, thumb?: string): string {
    if (!filename) return ''
    return pb.files.getUrl(recipe as never, filename, thumb ? { thumb } : undefined)
  },

  async delete(id: string): Promise<boolean> {
    await pb.collection('recipes').delete(id)
    return true
  },

  async addItem(data: {
    recipe_id: string
    ingredient_id: string
    quantity: number
    unit: string
  }): Promise<RecipeItem> {
    return await pb.collection('recipe_items').create<RecipeItem>(data, {
      expand: 'ingredient_id',
    })
  },

  async updateItem(
    itemId: string,
    data: { quantity?: number; unit?: string; ingredient_id?: string },
  ): Promise<RecipeItem> {
    return await pb.collection('recipe_items').update<RecipeItem>(itemId, data, {
      expand: 'ingredient_id',
    })
  },

  async deleteItem(itemId: string): Promise<boolean> {
    await pb.collection('recipe_items').delete(itemId)
    return true
  },

  /**
   * Calcula o custo total e indicadores financeiros de uma receita a partir de seus itens
   */
  computeCosts(recipe: Recipe, items: RecipeItem[]): RecipeWithCost {
    let ingredientsCost = 0

    for (const item of items) {
      const ing = item.expand?.ingredient_id
      if (ing) {
        const itemCost = calculateItemCost(item.quantity, item.unit, ing.price, ing.unit)
        ingredientsCost += itemCost
      }
    }

    const laborCost = recipe.labor_cost && recipe.labor_cost > 0 ? recipe.labor_cost : 0
    const totalCost = ingredientsCost + laborCost

    const portions = recipe.yield_portions && recipe.yield_portions > 0 ? recipe.yield_portions : 1
    const costPerPortion = totalCost / portions
    const sellingPrice = recipe.selling_price || 0
    const profitPerPortion = sellingPrice - costPerPortion
    const marginPercent = sellingPrice > 0 ? (profitPerPortion / sellingPrice) * 100 : 0

    return {
      ...recipe,
      items,
      ingredientsCost,
      laborCost,
      totalCost,
      costPerPortion,
      profitPerPortion,
      marginPercent,
    }
  },
}
