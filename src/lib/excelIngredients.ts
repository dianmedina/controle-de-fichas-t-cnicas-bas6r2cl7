import * as XLSX from 'xlsx'
import {
  Ingredient,
  MeasurementUnit,
  getEffectiveIngredientPrice,
  getStandardUnitPrice,
} from '@/types/restaurant'
import { normalizeString } from '@/lib/excelSales'
import { normalizeName, areNamesEquivalent } from '@/lib/stringUtils'

export interface ParsedIngredientRow {
  rowIndex: number
  rawName: string
  rawPrice: any
  rawReductionPercent?: any
  rawPackageSize?: any
  rawPackageUnit?: string
  rawUnit: string
  rawCategory: string
  rawSupplier?: string
  rawMinStock?: any
  // Campos normalizados
  normalizedName?: string
  normalizedPrice?: number // Preço por medida padrão (convertido)
  rawPackagePrice?: number // Preço bruto da embalagem informado
  normalizedPackageSize?: number
  normalizedPackageUnit?: MeasurementUnit
  normalizedReductionPercent?: number
  effectivePrice?: number // Custo utilizável final após perda
  normalizedUnit?: MeasurementUnit // Medida padrão (kg, L, etc.)
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
    packageSizeCol?: string
    packageUnitCol?: string
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
    'preco embalagem',
    'preço embalagem',
  ]
  const packageSizeKeywords = [
    'tamanho embalagem',
    'capacidade embalagem',
    'tamanho',
    'capacidade',
    'qtd embalagem',
    'embalagem',
    'peso liquido',
    'peso líquido',
    'volume',
  ]
  const packageUnitKeywords = [
    'unidade embalagem',
    'unid embalagem',
    'medida embalagem',
    'unidade da embalagem',
  ]
  const reductionKeywords = [
    'perda',
    '% perda',
    'perda %',
    'perda no preparo',
    'quebra',
    '% quebra',
    'quebra %',
    'reducao',
    'redução',
    '% reducao',
    '% redução',
    'reducao %',
    'redução %',
    'fator de correcao',
    'desconto',
    '% desconto',
    'abatimento',
  ]
  const unitKeywords = [
    'unidade base',
    'unidade padrao',
    'medida padrao',
    'unidade',
    'unid',
    'medida',
    'um',
    'un',
  ]
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
  const packageUnitCol = findBestCol(packageUnitKeywords, [nameCol, reductionCol]) || ''
  const packageSizeCol =
    findBestCol(packageSizeKeywords, [nameCol, reductionCol, packageUnitCol]) || ''
  const priceCol =
    findBestCol(priceKeywords, [nameCol, reductionCol, packageSizeCol, packageUnitCol]) ||
    headers[1] ||
    ''
  const unitCol =
    findBestCol(unitKeywords, [nameCol, priceCol, reductionCol, packageSizeCol, packageUnitCol]) ||
    headers[2] ||
    ''
  const categoryCol =
    findBestCol(categoryKeywords, [
      nameCol,
      priceCol,
      unitCol,
      reductionCol,
      packageSizeCol,
      packageUnitCol,
    ]) || ''
  const supplierCol =
    findBestCol(supplierKeywords, [
      nameCol,
      priceCol,
      unitCol,
      categoryCol,
      reductionCol,
      packageSizeCol,
      packageUnitCol,
    ]) || ''
  const minStockCol =
    findBestCol(minStockKeywords, [
      nameCol,
      priceCol,
      unitCol,
      categoryCol,
      supplierCol,
      reductionCol,
      packageSizeCol,
      packageUnitCol,
    ]) || ''

  return {
    headers,
    detectedColumns: {
      nameCol,
      priceCol,
      reductionCol: reductionCol || undefined,
      packageSizeCol: packageSizeCol || undefined,
      packageUnitCol: packageUnitCol || undefined,
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
    packageSizeCol?: string
    packageUnitCol?: string
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
    const rawPkgSize = columnMapping.packageSizeCol ? row[columnMapping.packageSizeCol] : undefined
    const rawPkgUnit = columnMapping.packageUnitCol ? row[columnMapping.packageUnitCol] : undefined
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

    const normName = normalizeName(rawName)
    if (normName && seenNames.has(normName)) {
      errors.push('Insumo duplicado nesta mesma planilha')
    } else if (normName) {
      seenNames.add(normName)
    }

    // Unidade Base
    const normalizedUnit = normalizeUnit(rawUnit)
    if (!normalizedUnit) {
      errors.push(`Unidade "${rawUnit}" inválida (use kg, g, L, mL ou unidade)`)
    }

    // Preço bruto informado (da embalagem ou por unidade).
    // Se não informado ou 0, aceitamos como 0 (permitindo criação automática e ajuste posterior)
    let rawParsedPrice: number | undefined = 0
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
        rawParsedPrice = p
      }
    } else {
      rawParsedPrice = 0
    }

    // Embalagem (opcional)
    let normalizedPackageSize: number | undefined
    let normalizedPackageUnit: MeasurementUnit | undefined

    if (rawPkgSize !== undefined && rawPkgSize !== null && String(rawPkgSize).trim() !== '') {
      const cleanedSize = String(rawPkgSize).replace(',', '.').trim()
      const s = parseFloat(cleanedSize)
      if (!isNaN(s) && s > 0) {
        normalizedPackageSize = s
      }
    }

    if (rawPkgUnit) {
      const u = normalizeUnit(rawPkgUnit)
      if (u) normalizedPackageUnit = u
    }

    // Se informou tamanho de embalagem mas não informou unidade da embalagem, assume a própria unidade base (se houver)
    if (normalizedPackageSize && !normalizedPackageUnit && normalizedUnit) {
      normalizedPackageUnit = normalizedUnit
    }

    // Preço convertido por medida padrão
    let normalizedPrice: number | undefined
    if (rawParsedPrice !== undefined && normalizedUnit) {
      if (normalizedPackageSize && normalizedPackageUnit) {
        normalizedPrice = getStandardUnitPrice(
          rawParsedPrice,
          normalizedPackageSize,
          normalizedPackageUnit,
          normalizedUnit,
        )
      } else {
        normalizedPrice = rawParsedPrice
      }
    }

    // Redução / Perda no preparo (%)
    let normalizedReductionPercent = 0
    if (rawReduction !== undefined && rawReduction !== null && rawReduction !== '') {
      const cleaned = String(rawReduction).trim().replace('%', '').replace(',', '.')
      const red = parseFloat(cleaned)
      if (isNaN(red) || red < 0 || red >= 100) {
        errors.push('Perda no preparo inválida (deve estar entre 0% e 99,9%)')
      } else {
        normalizedReductionPercent = red
      }
    }

    const effectivePrice =
      normalizedPrice !== undefined
        ? getEffectiveIngredientPrice(normalizedPrice, normalizedReductionPercent)
        : undefined

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

    // Reconciliação com insumos existentes (usando normalização sem acentos, case insensitive)
    const matchedExisting = existingIngredients.find(
      (ing) => areNamesEquivalent(ing.name, rawName) || normalizeName(ing.name) === normName,
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
      rawPackageSize: rawPkgSize,
      rawPackageUnit: rawPkgUnit,
      rawUnit,
      rawCategory,
      rawSupplier: rawSupplier || undefined,
      rawMinStock,
      normalizedName: rawName,
      normalizedPrice,
      rawPackagePrice: rawParsedPrice,
      normalizedPackageSize,
      normalizedPackageUnit,
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

  const templateData = [
    {
      'Insumo / Ingrediente': 'Arroz Branco Tipo 1',
      'Preço da Embalagem / Compra': 20.0,
      'Tamanho da Embalagem': 5,
      'Unidade da Embalagem': 'kg',
      'Medida Padrão': 'kg',
      'Redução (%)': 0,
      Categoria: 'Grãos e Cereais',
      Fornecedor: 'Distribuidora Alvorada',
      'Estoque Mínimo': 2,
    },
    {
      'Insumo / Ingrediente': 'Azeite de Oliva Extra Virgem',
      'Preço da Embalagem / Compra': 20.0,
      'Tamanho da Embalagem': 500,
      'Unidade da Embalagem': 'mL',
      'Medida Padrão': 'L',
      'Redução (%)': 5,
      Categoria: 'Óleos e Azeites',
      Fornecedor: 'Importadora Central',
      'Estoque Mínimo': 4,
    },
    {
      'Insumo / Ingrediente': sample1.name,
      'Preço da Embalagem / Compra': sample1.price,
      'Tamanho da Embalagem': '',
      'Unidade da Embalagem': '',
      'Medida Padrão': sample1.unit,
      'Redução (%)': sample1.reduction_percent ?? 10,
      Categoria: sample1.category,
      Fornecedor: sample1.supplier || 'Fornecedor A',
      'Estoque Mínimo': sample1.min_stock || 5,
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo Insumos')

  worksheet['!cols'] = [
    { wch: 30 }, // Insumo
    { wch: 22 }, // Preço
    { wch: 20 }, // Tamanho Embalagem
    { wch: 20 }, // Unidade Embalagem
    { wch: 15 }, // Medida Padrão
    { wch: 14 }, // Redução (%)
    { wch: 20 }, // Categoria
    { wch: 26 }, // Fornecedor
    { wch: 16 }, // Estoque Mínimo
  ]

  XLSX.writeFile(workbook, 'modelo_importacao_insumos.xlsx')
}
