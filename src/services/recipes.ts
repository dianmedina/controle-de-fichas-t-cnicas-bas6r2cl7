import pb from '@/lib/pocketbase/client'
import { Recipe, RecipeItem, calculateItemCost } from '@/types/restaurant'

export interface RecipeWithCost extends Recipe {
  items: RecipeItem[]
  ingredientsCost: number
  garnishesCost: number
  laborCost: number
  totalCost: number
  costPerPortion: number
  marginPercent: number
  profitPerPortion: number
  hasCycleWarning?: boolean
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
      expand: 'ingredient_id,sub_recipe_id',
      sort: 'created',
    })
  },

  async getAllRecipeItems(): Promise<RecipeItem[]> {
    return await pb.collection('recipe_items').getFullList<RecipeItem>({
      expand: 'ingredient_id,sub_recipe_id',
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
    ingredient_id?: string
    sub_recipe_id?: string
    quantity: number
    unit: string
  }): Promise<RecipeItem> {
    return await pb.collection('recipe_items').create<RecipeItem>(data, {
      expand: 'ingredient_id,sub_recipe_id',
    })
  },

  async updateItem(
    itemId: string,
    data: {
      quantity?: number
      unit?: string
      ingredient_id?: string
      sub_recipe_id?: string
    },
  ): Promise<RecipeItem> {
    return await pb.collection('recipe_items').update<RecipeItem>(itemId, data, {
      expand: 'ingredient_id,sub_recipe_id',
    })
  },

  async deleteItem(itemId: string): Promise<boolean> {
    await pb.collection('recipe_items').delete(itemId)
    return true
  },

  /**
   * Verifica se adicionar a guarnição (candidateSubRecipeId) dentro de recipeId criaria ciclo.
   * Retorna true se houver ciclo (ou seja, se a inclusão for proibida).
   */
  wouldCreateCycle(
    recipeId: string,
    candidateSubRecipeId: string,
    allItems: RecipeItem[],
  ): boolean {
    if (!recipeId || !candidateSubRecipeId) return false
    // Não pode incluir a si mesma
    if (recipeId === candidateSubRecipeId) return true

    // Monta mapa de adjacência subRecipeId -> lista de sub_recipe_id filhos
    const childrenMap = new Map<string, string[]>()
    for (const it of allItems) {
      if (it.sub_recipe_id) {
        const list = childrenMap.get(it.recipe_id) || []
        list.push(it.sub_recipe_id)
        childrenMap.set(it.recipe_id, list)
      }
    }

    // Se a candidateSubRecipe já alcançar recipeId através dos seus filhos, adicionar criará ciclo
    const visited = new Set<string>()
    const queue: string[] = [candidateSubRecipeId]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (current === recipeId) return true
      if (!visited.has(current)) {
        visited.add(current)
        const nextList = childrenMap.get(current) || []
        for (const nextId of nextList) {
          if (!visited.has(nextId)) {
            queue.push(nextId)
          }
        }
      }
    }

    return false
  },

  /**
   * Calcula o custo por porção de uma ficha técnica resolvendo guarnições aninhadas
   * com proteção contra ciclos infinitos.
   */
  calculatePortionCost(
    targetRecipeId: string,
    recipesMap: Map<string, Recipe>,
    recipeItemsMap: Map<string, RecipeItem[]>,
    visitedStack: Set<string> = new Set<string>(),
  ): { portionCost: number; batchCost: number; hasCycle: boolean } {
    if (visitedStack.has(targetRecipeId)) {
      return { portionCost: 0, batchCost: 0, hasCycle: true }
    }

    const recipe = recipesMap.get(targetRecipeId)
    if (!recipe) {
      return { portionCost: 0, batchCost: 0, hasCycle: false }
    }

    const newStack = new Set(visitedStack)
    newStack.add(targetRecipeId)

    const items = recipeItemsMap.get(targetRecipeId) || []
    let ingredientsCost = 0
    let garnishesCost = 0
    let hasCycle = false

    for (const item of items) {
      if (item.sub_recipe_id) {
        const subRes = this.calculatePortionCost(
          item.sub_recipe_id,
          recipesMap,
          recipeItemsMap,
          newStack,
        )
        if (subRes.hasCycle) hasCycle = true
        // Cada quantidade representa porções da guarnição incluídas na batelada do prato
        garnishesCost += item.quantity * subRes.portionCost
      } else {
        const ing = item.expand?.ingredient_id
        if (ing) {
          ingredientsCost += calculateItemCost(item.quantity, item.unit, ing)
        }
      }
    }

    const laborCost = recipe.labor_cost && recipe.labor_cost > 0 ? recipe.labor_cost : 0
    const totalCost = ingredientsCost + garnishesCost + laborCost
    const portions = recipe.yield_portions && recipe.yield_portions > 0 ? recipe.yield_portions : 1
    const portionCost = totalCost / portions

    return { portionCost, batchCost: totalCost, hasCycle }
  },

  /**
   * Calcula o custo total e indicadores financeiros de uma receita a partir de seus itens.
   * Suporta insumos diretos + fichas técnicas de guarnição como componentes.
   * Opcionalmente recebe allRecipes e allItems para resolver guarnições recursivas.
   */
  computeCosts(
    recipe: Recipe,
    items: RecipeItem[],
    allRecipes?: Recipe[],
    allItems?: RecipeItem[],
  ): RecipeWithCost {
    let ingredientsCost = 0
    let garnishesCost = 0
    let hasCycleWarning = false

    // Indexa dados para resolução rápida de sub-fichas
    const recipesMap = new Map<string, Recipe>()
    if (allRecipes) {
      allRecipes.forEach((r) => recipesMap.set(r.id, r))
    }
    recipesMap.set(recipe.id, recipe)

    const recipeItemsMap = new Map<string, RecipeItem[]>()
    if (allItems) {
      allItems.forEach((it) => {
        const list = recipeItemsMap.get(it.recipe_id) || []
        list.push(it)
        recipeItemsMap.set(it.recipe_id, list)
      })
    }
    // Garante que os itens passados para esta receita sobrescrevam o mapa
    recipeItemsMap.set(recipe.id, items)

    for (const item of items) {
      if (item.sub_recipe_id) {
        const subRecipe = item.expand?.sub_recipe_id || recipesMap.get(item.sub_recipe_id)
        if (subRecipe) {
          recipesMap.set(subRecipe.id, subRecipe)
          const visitedStack = new Set<string>([recipe.id])
          const subCostRes = this.calculatePortionCost(
            item.sub_recipe_id,
            recipesMap,
            recipeItemsMap,
            visitedStack,
          )
          if (subCostRes.hasCycle) hasCycleWarning = true
          garnishesCost += item.quantity * subCostRes.portionCost
        }
      } else {
        const ing = item.expand?.ingredient_id
        if (ing) {
          const itemCost = calculateItemCost(item.quantity, item.unit, ing)
          ingredientsCost += itemCost
        }
      }
    }

    const laborCost = recipe.labor_cost && recipe.labor_cost > 0 ? recipe.labor_cost : 0
    const totalCost = ingredientsCost + garnishesCost + laborCost

    const portions = recipe.yield_portions && recipe.yield_portions > 0 ? recipe.yield_portions : 1
    const costPerPortion = totalCost / portions
    const sellingPrice = recipe.selling_price || 0
    const profitPerPortion = sellingPrice - costPerPortion
    const marginPercent = sellingPrice > 0 ? (profitPerPortion / sellingPrice) * 100 : 0

    return {
      ...recipe,
      items,
      ingredientsCost,
      garnishesCost,
      laborCost,
      totalCost,
      costPerPortion,
      profitPerPortion,
      marginPercent,
      hasCycleWarning,
    }
  },
}
