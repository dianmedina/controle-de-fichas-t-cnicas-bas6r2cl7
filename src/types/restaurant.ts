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
  reduction_percent?: number
  created?: string
  updated?: string
}

/**
 * Retorna o preço de custo efetivo do insumo após aplicar a perda no preparo (redução/quebra).
 * Como o insumo perde peso/volume ao ser limpo/descascado/desossado, o custo por unidade utilizável aumenta.
 * Fórmula: preço ÷ (1 - redução / 100). Exemplo: R$ 3,00 / kg com 10% de perda = 3,00 ÷ (1 - 0,10) = R$ 3,33 / kg utilizável.
 * Se a redução for 0, ausente ou inválida, retorna o próprio preço base (divisão por 1).
 * Protegido contra redução >= 100% para evitar divisão por zero (limite seguro em 99.9%).
 */
export function getEffectiveIngredientPrice(
  price: number | undefined | null,
  reductionPercent: number | undefined | null,
): number {
  const basePrice = typeof price === 'number' && !isNaN(price) && price >= 0 ? price : 0
  if (basePrice === 0) return 0

  const reduction =
    typeof reductionPercent === 'number' && !isNaN(reductionPercent) && reductionPercent > 0
      ? reductionPercent
      : 0

  if (reduction <= 0) return basePrice
  if (reduction >= 100) return basePrice // Evita divisão por zero ou negativa se passar de 100%

  const usableFactor = 1 - reduction / 100
  if (usableFactor <= 0) return basePrice

  return basePrice / usableFactor
}

export type RecipeType = 'prato' | 'guarnicao'

export interface Recipe {
  id: string
  name: string
  type: RecipeType
  yield_portions: number
  selling_price: number
  labor_cost?: number
  notes?: string
  photo_1?: string
  photo_2?: string
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
  ingredientPriceOrIngredient: number | Ingredient,
  ingredientUnit?: MeasurementUnit,
  reductionPercent?: number,
): number {
  if (!quantityUsed || quantityUsed <= 0) {
    return 0
  }

  let finalPrice = 0
  let baseUnit: MeasurementUnit = usedUnit

  if (typeof ingredientPriceOrIngredient === 'object' && ingredientPriceOrIngredient !== null) {
    const ing = ingredientPriceOrIngredient
    baseUnit = ing.unit
    finalPrice = getEffectiveIngredientPrice(ing.price, ing.reduction_percent)
  } else {
    baseUnit = ingredientUnit || usedUnit
    finalPrice = getEffectiveIngredientPrice(
      typeof ingredientPriceOrIngredient === 'number' ? ingredientPriceOrIngredient : 0,
      reductionPercent,
    )
  }

  if (!finalPrice || finalPrice <= 0) {
    return 0
  }

  // Se as unidades forem iguais
  if (usedUnit === baseUnit) {
    return quantityUsed * finalPrice
  }

  // Massa: g -> kg ou kg -> g
  if (usedUnit === 'g' && baseUnit === 'kg') {
    return (quantityUsed / 1000) * finalPrice
  }
  if (usedUnit === 'kg' && baseUnit === 'g') {
    return quantityUsed * 1000 * finalPrice
  }

  // Volume: mL -> L ou L -> mL
  if (usedUnit === 'mL' && baseUnit === 'L') {
    return (quantityUsed / 1000) * finalPrice
  }
  if (usedUnit === 'L' && baseUnit === 'mL') {
    return quantityUsed * 1000 * finalPrice
  }

  // Caso padrão / unidades incompatíveis (ex: unidade usada em receita por unidade)
  return quantityUsed * finalPrice
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
