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
  package_size?: number
  package_unit?: MeasurementUnit
  created?: string
  updated?: string
}

/**
 * Converte o preço pago de uma embalagem para a medida padrão (unit).
 * Suporta conversões compatíveis:
 * - Massa: kg ↔ g
 * - Volume: L ↔ mL
 * - Unidade ↔ Unidade
 *
 * Exemplos:
 * - Arroz pacote 5kg custa R$ 20 -> preço por kg = 20 / 5 = R$ 4,00 / kg
 * - Azeite garrafa 500mL custa R$ 20 -> medida padrão L -> 500mL = 0.5L -> 20 / 0.5 = R$ 40,00 / L
 * - Tempero pote 50g custa R$ 5 -> medida padrão kg -> 50g = 0.05kg -> 5 / 0.05 = R$ 100,00 / kg
 * - Caixa 12 unidades custa R$ 24 -> medida padrão unidade -> 24 / 12 = R$ 2,00 / unidade
 *
 * Se não houver embalagem configurada ou tamanhos forem inválidos, retorna o próprio packagePrice (comportamento padrão).
 */
export function getStandardUnitPrice(
  packagePrice: number | undefined | null,
  packageSize: number | undefined | null,
  packageUnit: MeasurementUnit | undefined | null,
  standardUnit: MeasurementUnit,
): number {
  const price =
    typeof packagePrice === 'number' && !isNaN(packagePrice) && packagePrice >= 0 ? packagePrice : 0
  if (price === 0) return 0

  if (!packageSize || packageSize <= 0 || !packageUnit) {
    return price
  }

  // 1. Unidades idênticas (ex: 5 kg com padrão kg, ou 10 unidades com padrão unidade)
  if (packageUnit === standardUnit) {
    return price / packageSize
  }

  // 2. Massa: g e kg
  if (packageUnit === 'g' && standardUnit === 'kg') {
    // Ex: pote 500g custa R$ 15 -> tamanho em kg = 500 / 1000 = 0.5kg -> R$ 15 / 0.5 = R$ 30/kg
    const sizeInStandard = packageSize / 1000
    return sizeInStandard > 0 ? price / sizeInStandard : price
  }
  if (packageUnit === 'kg' && standardUnit === 'g') {
    // Ex: saco 1kg com padrão g -> tamanho em g = 1000g -> R$ 20 / 1000 = R$ 0.02/g
    const sizeInStandard = packageSize * 1000
    return sizeInStandard > 0 ? price / sizeInStandard : price
  }

  // 3. Volume: mL e L
  if (packageUnit === 'mL' && standardUnit === 'L') {
    // Ex: garrafa 500mL custa R$ 20 -> tamanho em L = 500 / 1000 = 0.5L -> R$ 20 / 0.5 = R$ 40/L
    const sizeInStandard = packageSize / 1000
    return sizeInStandard > 0 ? price / sizeInStandard : price
  }
  if (packageUnit === 'L' && standardUnit === 'mL') {
    // Ex: garrafa 1L com padrão mL -> tamanho em mL = 1000mL -> R$ 30 / 1000 = R$ 0.03/mL
    const sizeInStandard = packageSize * 1000
    return sizeInStandard > 0 ? price / sizeInStandard : price
  }

  // Se forem unidades incompatíveis (ex: comprou em unidade e padrão é kg sem densidade), divide pelo tamanho bruto
  return price / packageSize
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

/**
 * Formata a informação de embalagem de forma concisa e legível.
 * Exemplo: "5 kg (R$ 20,00)" ou "500 mL (R$ 20,00)"
 */
export function formatPackageInfo(
  packageSize: number | undefined | null,
  packageUnit: MeasurementUnit | undefined | null,
  packagePrice?: number | null,
): string | null {
  if (!packageSize || packageSize <= 0 || !packageUnit) return null
  const sizeFormatted =
    packageSize % 1 === 0 ? packageSize.toString() : packageSize.toString().replace('.', ',')
  if (packagePrice !== undefined && packagePrice !== null && packagePrice > 0) {
    return `${sizeFormatted} ${packageUnit} (${formatCurrency(packagePrice)})`
  }
  return `${sizeFormatted} ${packageUnit}`
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

export type RecipeItemType = 'ingredient' | 'sub_recipe'

export interface RecipeItem {
  id: string
  recipe_id: string
  ingredient_id?: string
  sub_recipe_id?: string
  quantity: number
  unit: MeasurementUnit
  created?: string
  updated?: string
  expand?: {
    ingredient_id?: Ingredient
    sub_recipe_id?: Recipe
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
