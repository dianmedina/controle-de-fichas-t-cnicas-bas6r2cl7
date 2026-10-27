export type MeasurementUnit = 'kg' | 'g' | 'L' | 'mL' | 'unidade'

export interface IngredientPriceHistory {
  id: string
  ingredient_id: string
  price: number
  date: string // YYYY-MM-DD
  notes?: string
  created?: string
  updated?: string
}

export interface Ingredient {
  id: string
  name: string
  price: number
  unit: MeasurementUnit
  category: string
  supplier?: string
  min_stock?: number
  created?: string
  updated?: string
}

export type RecipeType = 'prato' | 'guarnicao'

export interface Recipe {
  id: string
  name: string
  type: RecipeType
  yield_portions: number
  selling_price: number
  notes?: string
  created?: string
  updated?: string
}

export interface RecipeItem {
  id: string
  recipe_id: string
  ingredient_id: string
  quantity: number
  unit: MeasurementUnit
  created?: string
  updated?: string
  expand?: {
    ingredient_id?: Ingredient
  }
}

export interface Sale {
  id: string
  recipe_id: string
  date: string
  quantity: number
  created?: string
  updated?: string
  expand?: {
    recipe_id?: Recipe
  }
}

/**
 * Converte a quantidade utilizada para a unidade base de compra do insumo e calcula o custo proporcional.
 * Exemplos:
 * - Insumo custa R$ 68,90 / kg. Receita usa 300 g -> custo = (300 / 1000) * 68.90 = R$ 20.67
 * - Insumo custa R$ 28,00 / L. Receita usa 100 mL -> custo = (100 / 1000) * 28.00 = R$ 2.80
 * - Insumo custa R$ 14,00 / unidade. Receita usa 2 unidades -> custo = 2 * 14.00 = R$ 28.00
 */
export function calculateItemCost(
  quantityUsed: number,
  usedUnit: MeasurementUnit,
  ingredientPrice: number,
  ingredientUnit: MeasurementUnit,
): number {
  if (!quantityUsed || quantityUsed <= 0 || !ingredientPrice || ingredientPrice <= 0) {
    return 0
  }

  // Se as unidades forem iguais
  if (usedUnit === ingredientUnit) {
    return quantityUsed * ingredientPrice
  }

  // Massa: g -> kg ou kg -> g
  if (usedUnit === 'g' && ingredientUnit === 'kg') {
    return (quantityUsed / 1000) * ingredientPrice
  }
  if (usedUnit === 'kg' && ingredientUnit === 'g') {
    return quantityUsed * 1000 * ingredientPrice
  }

  // Volume: mL -> L ou L -> mL
  if (usedUnit === 'mL' && ingredientUnit === 'L') {
    return (quantityUsed / 1000) * ingredientPrice
  }
  if (usedUnit === 'L' && ingredientUnit === 'mL') {
    return quantityUsed * 1000 * ingredientPrice
  }

  // Caso padrão / unidades incompatíveis (ex: unidade usada em receita por unidade)
  return quantityUsed * ingredientPrice
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0,0%'
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100)
}
