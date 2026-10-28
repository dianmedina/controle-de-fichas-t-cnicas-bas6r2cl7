import * as XLSX from 'xlsx'
import { Ingredient, MeasurementUnit, getEffectiveIngredientPrice } from '@/types/restaurant'
import { normalizeString } from '@/lib/excelSales'

export interface ParsedIngredientRow {
  rowIndex: number
  rawName: string
  rawPrice: any
  rawReductionPercent?: any
  rawUnit: string
  rawCategory: string
  rawSupplier?: string
  rawMinStock?: any
  // Campos normalizados
  normalizedName?: string
  normalizedPrice?: number
  normalizedReductionPercent?: number
  effectivePrice?: number
  normalizedUnit?: MeasurementUnit
  normalizedCategory?: string
  normalizedSupplier?: string
  normalizedMinStock?: number
  // Reconciliação
  matchedExisting?: Ingredient
  isPriceChange?: boolean
  // Validação
  error?: string
  isValid: boolean
}

export interface IngredientSheetDetectionResult {
  headers: string[]
  detectedColumns: {
    nameCol: string
    priceCol: string
    reductionCol?: string
    unitCol: string
    categoryCol: string
    supplierCol?: string
    minStockCol?: string
  }
  rows: Record<string, any>[]
}

const VALID_UNITS: MeasurementUnit[] = ['kg', 'g', 'L', 'mL', 'unidade']

/**
 * Normaliza e identifica a unidade de medida a partir de strings comuns
 */
export function normalizeUnit(rawUnit: any): MeasurementUnit | null {
  if (!rawUnit) return null
  const str = normalizeString(rawUnit)

  if (['kg', 'kilo', 'quilo', 'quilograma', 'kilograma', 'kgs'].includes(str)) {
    return 'kg'
  }
  if (['g', 'gr', 'grama', 'gramas'].includes(str)) {
    return 'g'
  }
  if (['l', 'litro', 'litros', 'lt', 'lts'].includes(str)) {
    return 'L'
  }
  if (['ml', 'mililitro', 'mililitros', 'mls'].includes(str)) {
    return 'mL'
  }
  if (
    [
      'unidade',
      'unidades',
      'un',
      'und',
      'unid',
      'peca',
      'pc',
      'cx',
      'pct',
      'pacote',
      'dz',
      'duzia',
    ].includes(str)
  ) {
    return 'unidade'
  }

  // Verifica se casa com alguma exata
  const exact = VALID_UNITS.find((u) => u.toLowerCase() === str)
  if (exact) return exact

  return null
}

/**
 * Lê e analisa a planilha .xlsx enviada pelo usuário para Insumos
 */
export async function parseExcelIngredientsFile(
  file: File,
): Promise<IngredientSheetDetectionResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('A planilha está vazia ou não possui abas.')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
  })

  if (!rows || rows.length === 0) {
    throw new Error('Nenhuma linha de dados encontrada na planilha.')
  }

  const headers = Object.keys(rows[0] || {})

  const nameKeywords = ['insumo', 'ingrediente', 'nome', 'descricao', 'produto', 'item']
  const priceKeywords = [
    'preco',
    'preço',
    'valor',
    'custo',
    'preco de compra',
    'custo unitario',
    'unitario',
  ]
  const reductionKeywords = [
    'reducao',
    'redução',
    '% reducao',
    '% redução',
    'reducao %',
    'redução %',
    'desconto',
    '% desconto',
    'abatimento',
  ]
  const unitKeywords = ['unidade', 'unid', 'medida', 'um', 'un']
  const categoryKeywords = ['categoria', 'grupo', 'tipo', 'setor', 'departamento']
  const supplierKeywords = ['fornecedor', 'distribuidor', 'marca', 'empresa']
  const minStockKeywords = ['estoque minimo', 'minimo', 'min stock', 'estoque min']

  const findBestCol = (keywords: string[], exclude: string[] = []): string => {
    for (const h of headers) {
      if (exclude.includes(h)) continue
      const norm = normalizeString(h)
      if (keywords.some((kw) => norm === kw || norm.startsWith(kw) || norm.includes(kw))) {
        return h
      }
    }
    return ''
  }

  const nameCol = findBestCol(nameKeywords) || headers[0] || ''
  const reductionCol = findBestCol(reductionKeywords, [nameCol]) || ''
  const priceCol = findBestCol(priceKeywords, [nameCol, reductionCol]) || headers[1] || ''
  const unitCol = findBestCol(unitKeywords, [nameCol, priceCol, reductionCol]) || headers[2] || ''
  const categoryCol =
    findBestCol(categoryKeywords, [nameCol, priceCol, unitCol, reductionCol]) || ''
  const supplierCol =
    findBestCol(supplierKeywords, [nameCol, priceCol, unitCol, categoryCol, reductionCol]) || ''
  const minStockCol =
    findBestCol(minStockKeywords, [
      nameCol,
      priceCol,
      unitCol,
      categoryCol,
      supplierCol,
      reductionCol,
    ]) || ''

  return {
    headers,
    detectedColumns: {
      nameCol,
      priceCol,
      reductionCol: reductionCol || undefined,
      unitCol,
      categoryCol,
      supplierCol: supplierCol || undefined,
      minStockCol: minStockCol || undefined,
    },
    rows,
  }
}

/**
 * Valida e enriquece as linhas lidas com reconciliação aos insumos existentes
 */
export function validateIngredientRows(
  rows: Record<string, any>[],
  columnMapping: {
    nameCol: string
    priceCol: string
    reductionCol?: string
    unitCol: string
    categoryCol: string
    supplierCol?: string
    minStockCol?: string
  },
  existingIngredients: Ingredient[],
): ParsedIngredientRow[] {
  const seenNames = new Set<string>()

  return rows.map((row, index) => {
    const rawName = String(row[columnMapping.nameCol] || '').trim()
    const rawPrice = row[columnMapping.priceCol]
    const rawReduction = columnMapping.reductionCol ? row[columnMapping.reductionCol] : undefined
    const rawUnit = String(row[columnMapping.unitCol] || '').trim()
    const rawCategory = columnMapping.categoryCol
      ? String(row[columnMapping.categoryCol] || '').trim()
      : ''
    const rawSupplier = columnMapping.supplierCol
      ? String(row[columnMapping.supplierCol] || '').trim()
      : ''
    const rawMinStock = columnMapping.minStockCol ? row[columnMapping.minStockCol] : undefined

    const errors: string[] = []

    if (!rawName) {
      errors.push('Nome do insumo está vazio')
    }

    const normName = normalizeString(rawName)
    if (normName && seenNames.has(normName)) {
      errors.push('Insumo duplicado nesta mesma planilha')
    } else if (normName) {
      seenNames.add(normName)
    }

    // Preço
    let normalizedPrice: number | undefined
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
      let cleaned = String(rawPrice).trim().replace('R$', '').replace(/\s/g, '')
      if (cleaned.includes(',') && cleaned.includes('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.')
      } else if (cleaned.includes(',')) {
        cleaned = cleaned.replace(',', '.')
      }
      const p = parseFloat(cleaned)
      if (isNaN(p) || p < 0) {
        errors.push('Preço inválido (deve ser maior ou igual a zero)')
      } else {
        normalizedPrice = p
      }
    } else {
      errors.push('Preço é obrigatório')
    }

    // Redução (%)
    let normalizedReductionPercent = 0
    if (rawReduction !== undefined && rawReduction !== null && rawReduction !== '') {
      const cleaned = String(rawReduction).trim().replace('%', '').replace(',', '.')
      const red = parseFloat(cleaned)
      if (isNaN(red) || red < 0 || red > 100) {
        errors.push('Redução inválida (deve estar entre 0% e 100%)')
      } else {
        normalizedReductionPercent = red
      }
    }

    const effectivePrice =
      normalizedPrice !== undefined
        ? getEffectiveIngredientPrice(normalizedPrice, normalizedReductionPercent)
        : undefined

    // Unidade
    const normalizedUnit = normalizeUnit(rawUnit)
    if (!normalizedUnit) {
      errors.push(`Unidade "${rawUnit}" inválida (use kg, g, L, mL ou unidade)`)
    }

    // Categoria
    const normalizedCategory = rawCategory || 'Geral'

    // Estoque mínimo
    let normalizedMinStock: number | undefined
    if (rawMinStock !== undefined && rawMinStock !== null && rawMinStock !== '') {
      const ms = parseFloat(String(rawMinStock).replace(',', '.'))
      if (!isNaN(ms) && ms >= 0) {
        normalizedMinStock = ms
      }
    }

    // Reconciliação com insumos existentes
    const matchedExisting = existingIngredients.find(
      (ing) => normalizeString(ing.name) === normName,
    )
    const oldEffective = matchedExisting
      ? getEffectiveIngredientPrice(matchedExisting.price, matchedExisting.reduction_percent)
      : undefined
    const isPriceChange =
      matchedExisting && effectivePrice !== undefined && oldEffective !== undefined
        ? Math.abs(oldEffective - effectivePrice) > 0.001
        : false

    return {
      rowIndex: index + 2,
      rawName,
      rawPrice,
      rawReductionPercent: rawReduction,
      rawUnit,
      rawCategory,
      rawSupplier: rawSupplier || undefined,
      rawMinStock,
      normalizedName: rawName,
      normalizedPrice,
      normalizedReductionPercent,
      effectivePrice,
      normalizedUnit: normalizedUnit || undefined,
      normalizedCategory,
      normalizedSupplier: rawSupplier || undefined,
      normalizedMinStock,
      matchedExisting,
      isPriceChange,
      error: errors.length > 0 ? errors.join(', ') : undefined,
      isValid: errors.length === 0,
    }
  })
}

/**
 * Baixa arquivo de modelo de planilha de Insumos
 */
export function downloadIngredientsTemplate(sampleIngredients: Ingredient[] = []): void {
  const sample1 = sampleIngredients[0] || {
    name: 'Filé Mignon Bovino',
    price: 68.9,
    reduction_percent: 10,
    unit: 'kg',
    category: 'Carnes',
    supplier: 'Frigorífico Boi Nobre',
    min_stock: 5,
  }
  const sample2 = sampleIngredients[1] || {
    name: 'Azeite de Oliva Extra Virgem',
    price: 48.0,
    reduction_percent: 0,
    unit: 'L',
    category: 'Óleos e Azeites',
    supplier: 'Distribuidora Central',
    min_stock: 4,
  }

  const templateData = [
    {
      'Insumo / Ingrediente': sample1.name,
      'Preço de Compra': sample1.price,
      'Redução (%)': sample1.reduction_percent ?? 10,
      'Unidade Base': sample1.unit,
      Categoria: sample1.category,
      Fornecedor: sample1.supplier || 'Fornecedor A',
      'Estoque Mínimo': sample1.min_stock || 5,
    },
    {
      'Insumo / Ingrediente': sample2.name,
      'Preço de Compra': sample2.price,
      'Redução (%)': sample2.reduction_percent ?? 0,
      'Unidade Base': sample2.unit,
      Categoria: sample2.category,
      Fornecedor: sample2.supplier || 'Fornecedor B',
      'Estoque Mínimo': sample2.min_stock || 3,
    },
    {
      'Insumo / Ingrediente': 'Ovos Caipiras (dúzia)',
      'Preço de Compra': 14.5,
      'Redução (%)': 5,
      'Unidade Base': 'unidade',
      Categoria: 'Hortifruti',
      Fornecedor: 'Granja Esperança',
      'Estoque Mínimo': 6,
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo Insumos')

  worksheet['!cols'] = [
    { wch: 32 }, // Insumo
    { wch: 18 }, // Preço
    { wch: 14 }, // Redução (%)
    { wch: 15 }, // Unidade
    { wch: 20 }, // Categoria
    { wch: 28 }, // Fornecedor
    { wch: 16 }, // Estoque Mínimo
  ]

  XLSX.writeFile(workbook, 'modelo_importacao_insumos.xlsx')
}
