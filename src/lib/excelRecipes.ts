import * as XLSX from 'xlsx'
import { Ingredient, Recipe, RecipeType, MeasurementUnit, DishType } from '@/types/restaurant'
import { normalizeString } from '@/lib/excelSales'
import {
  normalizeUnit,
  normalizeUnitWithDetails,
  UnitNormalizationResult,
} from '@/lib/excelIngredients'
import { normalizeName, areNamesEquivalent } from '@/lib/stringUtils'

import { PortionUnit } from '@/types/restaurant'

export interface ParsedPortionSize {
  value: number
  unit: PortionUnit
  rawText: string
}

/**
 * Palavras ou abreviações de tamanho que devem ser removidas da comparação de nomes de guarnição.
 */
const SIZE_MODIFIER_REGEX =
  /\b(pequeno|pequena|medio|media|médio|média|grande|gigante|mini|micro|padrao|padrão|\(p\)|\(m\)|\(g\)|\(gg\)|tam\.?\s*[pmg]|p|m|g|gg)\b/gi

/**
 * Remove identificadores de tamanho do nome da guarnição para busca no cadastro.
 * Ex.: "Arroz Branco pequena" -> "Arroz Branco", tamanho "pequena"
 * Ex.: "ARROZ GRANDE grande" -> "ARROZ GRANDE", tamanho "grande"
 * Retorna o nome sem o tamanho e o modificador de tamanho encontrado.
 */
export function stripSizeModifier(name: string): { strippedName: string; sizeModifier?: string } {
  if (!name) return { strippedName: '' }

  let sizeModifier: string | undefined

  // Primeiro testa sufixos no final da string (o padrão mais comum em cardápios)
  // ex: "pequena", "pequeno", "grande", "media", "P", "M", "G"
  const suffixMatch = name.match(
    /(?:[-\s/,(]+)(pequeno|pequena|m[eé]dio|m[eé]dia|grande|gigante|mini|padr[aã]o|tam\.?\s*[pmg]|gg|p|m|g)[)\s]*$/i,
  )

  const cleanTrailingSeparators = (str: string): string => {
    let s = str.trim()
    while (s.endsWith('-') || s.endsWith(':') || s.endsWith(',') || s.endsWith('/')) {
      s = s.slice(0, -1).trim()
    }
    return s
  }

  if (suffixMatch) {
    sizeModifier = suffixMatch[1].trim()
    const cutPos = suffixMatch.index ?? name.length
    const stripped = cleanTrailingSeparators(name.slice(0, cutPos))
    if (stripped) {
      return { strippedName: stripped, sizeModifier }
    }
  }

  // Se não foi sufixo direto, tenta identificar se a última palavra é indicador de tamanho
  const words = name.trim().split(/\s+/)
  if (words.length > 1) {
    const lastWord = words[words.length - 1]
    const normLast = normalizeName(lastWord)
    if (
      [
        'pequena',
        'pequeno',
        'grande',
        'media',
        'medio',
        'mini',
        'gigante',
        'p',
        'm',
        'g',
        'gg',
      ].includes(normLast)
    ) {
      sizeModifier = lastWord
      const stripped = cleanTrailingSeparators(words.slice(0, words.length - 1).join(' '))
      if (stripped) {
        return { strippedName: stripped, sizeModifier }
      }
    }
  }

  return { strippedName: name.trim() }
}

/**
 * Verifica se uma receita pertence ao tipo guarnição (seja pelo campo `type`,
 * pelo `type_id` ou pela flag `is_garnish`).
 */
export function isGarnishRecipe(recipe: Recipe, dishTypes?: DishType[]): boolean {
  if (!recipe) return false
  const rType = normalizeName(recipe.type)
  if (rType === 'guarnicao' || rType.includes('guarn')) return true

  if (recipe.expand?.type_id?.is_garnish) return true
  const expandSlug = recipe.expand?.type_id?.slug
  if (expandSlug && (expandSlug === 'guarnicao' || expandSlug.includes('guarn'))) return true

  if (dishTypes && recipe.type_id) {
    const dt = dishTypes.find((t) => t.id === recipe.type_id || t.slug === recipe.type_id)
    if (
      dt &&
      (dt.is_garnish || dt.slug === 'guarnicao' || normalizeName(dt.name).includes('guarn'))
    ) {
      return true
    }
  }

  return false
}

/**
 * Analisa o nome de uma linha de ingrediente da planilha para determinar se é referência
 * a uma guarnição existente ou tentativa de guarnição.
 *
 * Exemplos aceitos:
 * - "Guarnição Arroz Branco pequena" -> guarnição "Arroz Branco", tamanho "pequena"
 * - "guarnicao ARROZ GRANDE grande" -> guarnição "ARROZ GRANDE", tamanho "grande"
 * - "Guarnição: Vinagrete" -> guarnição "Vinagrete"
 * - "Acompanhamento: Farofa de Bacon" -> guarnição "Farofa de Bacon"
 * - "Guarnição - Purê de Batata" -> guarnição "Purê de Batata"
 */
export function detectGarnishReference(
  rawItemName: string,
  garnishRecipes: Recipe[],
): ParsedGarnishInfo {
  if (!rawItemName || !rawItemName.trim()) {
    return { isGarnishReference: false }
  }

  const rawTrimmed = rawItemName.trim()

  // Prefixos comuns de guarnição: "guarnição", "guarnicao", "guarn.", "guarn:", "acompanhamento"
  const prefixRegex = /^(?:guarni[cç][aã]o|guarn\.?|acompanhamento|acompanha)\s*[:\-–—]?\s*(.+)$/i

  const prefixMatch = rawTrimmed.match(prefixRegex)
  const hasGarnishPrefix = !!prefixMatch

  // Nome do prato/guarnição após retirar o prefixo (ou o próprio nome se não tiver prefixo)
  const candidateName = (hasGarnishPrefix ? prefixMatch[1] : rawTrimmed).trim()

  // Extrai eventual modificador de tamanho ("pequena", "grande", "P", "M", etc.)
  const { strippedName, sizeModifier } = stripSizeModifier(candidateName)

  const normCandidate = normalizeName(candidateName)
  const normStripped = normalizeName(strippedName)

  // 1. Procura primeiro na coleção de receitas que são do tipo guarnição
  // Comparação ignorando acentos, maiúsculas/minúsculas e espaços extras
  const findMatchingGarnish = (targetName: string): Recipe | undefined => {
    const normTarget = normalizeName(targetName)
    if (!normTarget) return undefined

    return garnishRecipes.find((g) => {
      const normG = normalizeName(g.name)
      if (normG === normTarget || areNamesEquivalent(g.name, targetName)) {
        return true
      }

      // Também compara removendo modificadores de tamanho da própria guarnição cadastrada
      // caso na base esteja "Arroz Branco" e o stripped seja "Arroz Branco"
      const gStripped = normalizeName(stripSizeModifier(g.name).strippedName)
      if (gStripped && (gStripped === normTarget || gStripped === normStripped)) {
        return true
      }

      return false
    })
  }

  // Tenta encontrar usando o nome limpo (sem modificador de tamanho)
  let matched = findMatchingGarnish(strippedName)

  // Se não achou pelo stripped, tenta pelo candidateName original
  if (!matched && candidateName !== strippedName) {
    matched = findMatchingGarnish(candidateName)
  }

  if (matched) {
    return {
      isGarnishReference: true,
      matchedGarnishRecipe: matched,
      cleanGarnishName: strippedName,
      sizeModifier,
    }
  }

  // Se teve o prefixo explícito "guarnição:" / "guarnição Arroz..." mas NÃO encontrou
  // na coleção de guarnições salvas:
  if (hasGarnishPrefix) {
    return {
      isGarnishReference: true, // É referência a guarnição, porém não encontrada
      unmatchedGarnishName: candidateName,
      cleanGarnishName: strippedName,
      sizeModifier,
    }
  }

  // Não é referência a guarnição
  return { isGarnishReference: false }
}

/**
 * Extrai automaticamente o valor numérico e unidade de um texto de porção
 * Ex.: "PORÇÃO 400G" -> { value: 400, unit: 'g' }
 * Ex.: "300 mL" -> { value: 300, unit: 'mL' }
 * Ex.: "1 unidade" -> { value: 1, unit: 'unidade' }
 * Ex.: "0.5 kg" -> { value: 0.5, unit: 'kg' }
 */
export function extractPortionSize(raw?: string): ParsedPortionSize | null {
  if (!raw) return null
  const str = String(raw).trim()
  if (!str) return null

  // Procura padrão com valor numérico e unidade opcional
  // ex: "PORÇÃO: 400G", "400 g", "300mL", "1 un", "1 unidade", "0,5 kg"
  const regex =
    /(?:por[cç][aã]o\s*:?\s*)?(\d+[.,]?\d*)\s*(kg|kilos?|g|gramas?|ml|mililitros?|l|litros?|unidades?|unids?|un)?/i
  const match = str.match(regex)
  if (!match) return null

  const valStr = match[1]
  if (!valStr) return null
  const num = parseFloat(valStr.replace(',', '.'))
  if (isNaN(num) || num <= 0) return null

  const rawUnit = (match[2] || '').toLowerCase()
  let unit: PortionUnit = 'g'
  if (rawUnit === 'ml' || rawUnit.startsWith('mili')) {
    unit = 'mL'
  } else if (rawUnit === 'l' || rawUnit.startsWith('litro')) {
    unit = 'L'
  } else if (rawUnit === 'kg' || rawUnit.startsWith('kilo')) {
    unit = 'kg'
  } else if (rawUnit === 'un' || rawUnit.startsWith('unid')) {
    unit = 'unidade'
  } else {
    // Padrão em gastronomia quando só vem o número (ex.: "PORÇÃO 400"): g
    unit = 'g'
  }

  return {
    value: Math.round(num * 1000) / 1000,
    unit,
    rawText: str,
  }
}

export type RecipeSpreadsheetFormat = 'tabular' | 'blocks'

export type RecipeItemKind = 'ingredient' | 'sub_recipe'

export interface ParsedGarnishInfo {
  isGarnishReference: boolean
  matchedGarnishRecipe?: Recipe
  cleanGarnishName?: string
  sizeModifier?: string
  unmatchedGarnishName?: string
}

export interface ParsedRecipeItemRow {
  rowIndex: number
  recipeName: string
  recipeType: RecipeType
  yieldPortions: number
  sellingPrice: number
  portionDescription?: string
  portionSizeValue?: number
  portionSizeUnit?: PortionUnit
  laborCost?: number
  notes?: string
  ingredientName: string
  quantity: number
  unit: MeasurementUnit
  originalUnit?: string
  unitWarning?: string
  // Reconciliações
  itemKind?: RecipeItemKind
  matchedIngredient?: Ingredient
  matchedSubRecipe?: Recipe
  sizeModifier?: string
  isMissingIngredient?: boolean
  error?: string
  warning?: string
}

export interface GroupedRecipePreviewItem {
  rowIndex: number
  ingredientName: string
  quantity: number
  unit: MeasurementUnit
  originalUnit?: string
  unitWarning?: string
  itemKind?: RecipeItemKind
  matchedIngredient?: Ingredient
  matchedSubRecipe?: Recipe
  sizeModifier?: string
  isMissingIngredient?: boolean
  error?: string
  warning?: string
  isValid: boolean
}

export interface GroupedRecipePreview {
  recipeName: string
  recipeType: RecipeType
  rawDetectedType?: string
  matchedDishType?: DishType
  dishTypeId?: string
  yieldPortions: number
  sellingPrice: number
  portionDescription?: string
  portionSizeValue?: number
  portionSizeUnit?: PortionUnit
  laborCost?: number
  laborMinutes?: number
  laborRatePerMinute?: number
  rawSubtotal?: number
  notes?: string
  items: GroupedRecipePreviewItem[]
  matchedExistingRecipe?: Recipe
  isUpdate: boolean
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface RecipeSheetDetectionResult {
  format: RecipeSpreadsheetFormat
  sheetName: string
  globalRates?: {
    laborPerMinute?: number
    waterPerMl?: number
  }
  // No formato tabular (linha por ingrediente):
  headers?: string[]
  detectedColumns?: {
    recipeNameCol: string
    typeCol?: string
    yieldCol?: string
    portionCol?: string
    sellingPriceCol?: string
    laborCostCol?: string
    notesCol?: string
    ingredientCol: string
    quantityCol: string
    unitCol: string
  }
  rows?: Record<string, any>[]
  // No formato blocos (pré-estruturado):
  blockPreviews?: GroupedRecipePreview[]
  totalRawRows?: number
}

/**
 * Função utilitária para converter valor qualquer de célula em número seguro.
 */
function parseNumericValue(val: any): number | null {
  if (val === undefined || val === null || val === '') return null
  if (typeof val === 'number') {
    return isNaN(val) ? null : val
  }
  const str = String(val).trim()
  if (str.startsWith('#') || str.includes('#REF!')) return null
  let cleaned = str.replace('R$', '').replace(/\s/g, '')
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.')
  }
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

/**
 * Heurística para o valor de rendimento:
 * REGRA DO NEGÓCIO (Requisito 3):
 * "O número de porções REAL de cada bloco está na linha SubTotal, na mesma coluna de rendimento
 * (célula numérica plausível, tipo 6, 12, 5,625, 1). Ignore a coluna de rendimento das linhas de ingrediente;
 * use apenas a célula numérica da linha SubTotal — e se ela for implausível (ex.: > 1000), não quebre:
 * trate como sem porções (1 porção padrão) e avise."
 */
/**
 * Normaliza o valor de rendimento em porções para a realidade da cozinha:
 * 1. Valores muito próximos de inteiros (ex: 5.9999 ou 6.0001) viram inteiros.
 * 2. Em fichas técnicas, porções são contagens inteiras na imensa maioria das cozinhas.
 *    Quando o valor da planilha for calculado por divisão de massa (ex.: 5,625 porções de farofa 320g
 *    ou 10,588 de farofa 170g gerados por peso total da batelada / gramatura), pode ser arredondado
 *    para o número inteiro de porções padrão correspondente ou mantido como decimal simples caso pretendido.
 *    Se o valor estiver dentro de tolerância de arredondamento inteiro (< 0.1 de um inteiro ou resultado fracionário de massa),
 *    arredonda para o inteiro mais próximo.
 */
export function normalizeYieldPortions(rawVal: number | null | undefined): {
  yieldPortions: number
  warning?: string
} {
  if (rawVal === null || rawVal === undefined || isNaN(rawVal) || rawVal <= 0) {
    return { yieldPortions: 1 }
  }

  // Se for valor implausível (ex.: > 1000 ou peso solto sem sentido)
  if (rawVal > 1000) {
    return {
      yieldPortions: 1,
      warning: `Rendimento informado (${rawVal}) é implausível (> 1000); assumido 1 porção.`,
    }
  }

  // Arredonda para 4 casas decimais primeiro para evitar imprecisão de float
  const cleanVal = Math.round(rawVal * 10000) / 10000

  // Se já é inteiro
  if (Math.abs(cleanVal - Math.round(cleanVal)) < 0.0001) {
    return { yieldPortions: Math.round(cleanVal) }
  }

  // Se for fração decorrente de divisão de massa por porção (ex: 5.625 -> 6 porções; 10.588 -> 11 ou 10; 13.083 -> 13; 8.75 -> 9 ou 8; 17.5 -> 18; 24.5 -> 25; 2.5 -> 2 ou 3)
  // Na cozinha, o rendimento esperado é um número de porções arredondado.
  // Arredonda para o inteiro mais próximo quando for fração quebrada típica de porcionamento
  const roundedInt = Math.round(cleanVal)
  if (roundedInt >= 1) {
    return {
      yieldPortions: roundedInt,
      warning: `Rendimento fracionário (${cleanVal}) ajustado para ${roundedInt} ${roundedInt > 1 ? 'porções' : 'porção'}.`,
    }
  }

  return {
    yieldPortions: Math.max(1, Math.round(cleanVal)),
  }
}

/**
 * Heurística para o valor de rendimento:
 * REGRA DO NEGÓCIO (Requisito 3):
 * "O número de porções REAL de cada bloco está na linha SubTotal, na mesma coluna de rendimento
 * (célula numérica plausível, tipo 6, 12, 5,625, 1). Ignore a coluna de rendimento das linhas de ingrediente;
 * use apenas a célula numérica da linha SubTotal — e se ela for implausível (ex.: > 1000), não quebre:
 * trate como sem porções (1 porção padrão) e avise."
 * E garanta que o rendimento resultante não exija números quebrados que não condizem com a realidade da cozinha.
 */
function resolveYieldPortionsFromSubtotal(subTotalPortionsVal: any): {
  yieldPortions: number
  warning?: string
} {
  const pSub = parseNumericValue(subTotalPortionsVal)
  return normalizeYieldPortions(pSub)
}

/**
 * Lê e analisa a planilha de Fichas Técnicas.
 * Detecta se é formato de blocos verticais ("FICHA TECNICA") ou tabular convencional.
 */
export async function parseExcelRecipesFile(file: File): Promise<RecipeSheetDetectionResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('A planilha está vazia ou não possui abas.')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  // Converte a aba como matriz 2D para inspecionar linhas e posições absolutas
  const matrix: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  })

  if (!matrix || matrix.length === 0) {
    throw new Error('Nenhuma linha de dados encontrada na planilha.')
  }

  // Detecta formato de bloco procurando por células que contenham "FICHA TECNICA" ou cabeçalho global de mão de obra
  let isBlockFormat = false
  for (let r = 0; r < Math.min(matrix.length, 30); r++) {
    const row = matrix[r] || []
    for (const cell of row) {
      const norm = normalizeString(String(cell || ''))
      if (
        norm.includes('ficha tecnica') ||
        norm.includes('mao de obra (r$/min)') ||
        norm.includes('mao de obra (r$/minuto)')
      ) {
        isBlockFormat = true
        break
      }
    }
    if (isBlockFormat) break
  }

  if (isBlockFormat) {
    return parseBlockFormat(matrix, firstSheetName)
  }

  return parseTabularFormat(worksheet, firstSheetName)
}

/**
 * Parser para o formato tabular tradicional (1 linha = 1 ingrediente de ficha)
 */
function parseTabularFormat(
  worksheet: XLSX.WorkSheet,
  sheetName: string,
): RecipeSheetDetectionResult {
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
  })

  if (!rows || rows.length === 0) {
    throw new Error('Nenhuma linha de dados encontrada na planilha.')
  }

  const headers = Object.keys(rows[0] || {})

  const recipeKeywords = ['ficha', 'receita', 'prato', 'nome da ficha', 'nome do prato', 'dish']
  const ingredientKeywords = ['insumo', 'ingrediente', 'componente', 'item']
  const qtyKeywords = ['quantidade', 'qtd', 'quant', 'volume', 'peso', 'qtde']
  const unitKeywords = ['unidade', 'unid', 'medida', 'um']
  const typeKeywords = ['tipo', 'categoria da ficha', 'tipo de prato', 'classificacao']
  const yieldKeywords = ['rendimento', 'porcoes', 'porções', 'rendimento porcoes', 'yield']
  const portionKeywords = [
    'tamanho da porcao',
    'tamanho da porção',
    'tamanho porcao',
    'tamanho porção',
    'porcao',
    'porção',
    'gramatura',
    'peso da porcao',
    'peso da porção',
  ]
  const priceKeywords = ['preco de venda', 'preço de venda', 'venda', 'preco', 'preço']
  const laborKeywords = ['mao de obra', 'mão de obra', 'custo mao de obra', 'labor']
  const notesKeywords = [
    'observacao',
    'observacoes',
    'obs',
    'notas',
    'modo de preparo',
    'instrucoes',
  ]

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

  const recipeNameCol = findBestCol(recipeKeywords) || headers[0] || ''
  const ingredientCol = findBestCol(ingredientKeywords, [recipeNameCol]) || headers[1] || ''
  const quantityCol = findBestCol(qtyKeywords, [recipeNameCol, ingredientCol]) || headers[2] || ''
  const unitCol =
    findBestCol(unitKeywords, [recipeNameCol, ingredientCol, quantityCol]) || headers[3] || ''
  const typeCol = findBestCol(typeKeywords, [recipeNameCol, ingredientCol, quantityCol, unitCol])
  const yieldCol = findBestCol(yieldKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
  ])
  const portionCol = findBestCol(portionKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
    yieldCol,
  ])
  const sellingPriceCol = findBestCol(priceKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
    yieldCol,
    portionCol,
  ])
  const laborCostCol = findBestCol(laborKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
    yieldCol,
    sellingPriceCol,
  ])
  const notesCol = findBestCol(notesKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
    yieldCol,
    sellingPriceCol,
    laborCostCol,
  ])

  return {
    format: 'tabular',
    sheetName,
    headers,
    detectedColumns: {
      recipeNameCol,
      ingredientCol,
      quantityCol,
      unitCol,
      typeCol: typeCol || undefined,
      yieldCol: yieldCol || undefined,
      portionCol: portionCol || undefined,
      sellingPriceCol: sellingPriceCol || undefined,
      laborCostCol: laborCostCol || undefined,
      notesCol: notesCol || undefined,
    },
    rows,
    totalRawRows: rows.length,
  }
}

/**
 * Parser para o formato de bloco repetido verticalmente
 */
function parseBlockFormat(matrix: any[][], sheetName: string): RecipeSheetDetectionResult {
  let globalLaborRate: number | undefined
  let globalWaterRate: number | undefined

  // 1. Procura constantes globais no topo (primeiras 10 linhas)
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const row = matrix[r] || []
    const col0 = normalizeString(String(row[0] || ''))
    if (col0.includes('mao de obra')) {
      const val = parseNumericValue(row[1])
      if (val !== null && val > 0) globalLaborRate = val
    }
    if (col0.includes('agua')) {
      const val = parseNumericValue(row[1])
      if (val !== null && val > 0) globalWaterRate = val
    }
  }

  // 2. Identifica os blocos "FICHA TECNICA"
  // REGRA DO NEGÓCIO (Requisito 2):
  // (a) Reconhecer bloco por padrão "FICHA TECNICA" na coluna 1, mesmo sem dois-pontos ou com traço
  // (b) Extrair o tipo do sufixo após o hífen: "FICHA TECNICA - GUARNIÇÃO" -> tipo "GUARNIÇÃO"
  // (c) Pegar o nome da segunda célula (coluna 2, ex: "ARROZ GRANDE")
  // (d) Parsear "PORÇÃO XXXG" da linha do cabeçalho do bloco
  interface RawBlockHeader {
    startRow: number
    recipeName: string
    titleSuffixType?: string
    portionDesc?: string
  }
  const rawBlocks: RawBlockHeader[] = []

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] || []
    const cell0Str = String(row[0] || '').trim()
    const norm0 = normalizeString(cell0Str)

    // Cabeçalho de bloco: primeira célula contém ou inicia por "FICHA TECNICA"
    // Não confunda com linhas globais como "Mão de Obra (R$/min)" ou "Agua (R$/ml)"
    if (norm0.includes('ficha tecnica')) {
      // Extrai sufixo após hífen ou traço, se existir
      // Ex: "FICHA TECNICA - GUARNIÇÃO" -> "GUARNIÇÃO"
      // Ex: "FICHA TECNICA - PRATO PRINCIPAL" -> "PRATO PRINCIPAL"
      let suffixType: string | undefined
      const hyphenMatch = cell0Str.match(/ficha\s*t[eé]cnica\s*[-–—:]\s*(.+)$/i)
      if (hyphenMatch && hyphenMatch[1]?.trim()) {
        suffixType = hyphenMatch[1].trim()
      }

      // Nome da ficha técnica: SEGUNDA célula da mesma linha (row[1])
      let name = String(row[1] || '').trim()

      // Se a segunda célula estiver vazia ou com texto de ficha tecnica, procura em outras colunas
      if (!name || normalizeName(name) === 'ficha tecnica') {
        for (let c = 1; c < row.length; c++) {
          const val = String(row[c] || '').trim()
          if (!val) continue
          const normVal = normalizeName(val)
          if (
            normVal !== 'ficha tecnica' &&
            !normVal.startsWith('porcao') &&
            !normVal.startsWith('porção') &&
            !normVal.startsWith('tipo') &&
            normVal !== normalizeName(suffixType || '')
          ) {
            name = val
            break
          }
        }
      }

      // Procura descrição de porção (ex: "PORÇÃO 400G") em qualquer célula da linha do cabeçalho
      let portion: string | undefined
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim()
        if (extractPortionSize(val)) {
          portion = val
          break
        }
        if (normalizeName(val).includes('porcao') || normalizeName(val).includes('porção')) {
          portion = val
          break
        }
      }

      rawBlocks.push({
        startRow: r,
        recipeName: name,
        titleSuffixType: suffixType,
        portionDesc: portion,
      })
    }
  }

  // 3. Processa cada bloco
  const blockPreviews: GroupedRecipePreview[] = []

  for (let b = 0; b < rawBlocks.length; b++) {
    const currentBlock = rawBlocks[b]
    const nextStartRow = b + 1 < rawBlocks.length ? rawBlocks[b + 1].startRow : matrix.length

    let subTotalPortionsVal: any = null
    let laborMinutes: number | undefined
    let laborRatePerMin: number | undefined
    let laborCost: number | undefined
    const blockWarnings: string[] = []

    interface RawBlockItem {
      rowIndex: number
      rawName: string
      rawQty: any
      rawUnit: string
    }
    const rawItems: RawBlockItem[] = []

    let inIngredients = false

    for (let r = currentBlock.startRow + 1; r < nextStartRow; r++) {
      const row = matrix[r] || []
      const c0 = String(row[0] || '').trim()
      const norm0 = normalizeString(c0)

      // Linha de cabeçalho do bloco ("Ingrediente | Qtd | Unid. | Preço Unit. | Custo | Rendimento")
      if (
        norm0.includes('ingrediente') &&
        (norm0.includes('qtd') || String(row[1] || '').trim().length > 0)
      ) {
        inIngredients = true
        continue
      }

      // Linha de SubTotal
      if (norm0 === 'subtotal' || norm0.startsWith('subtotal')) {
        inIngredients = false
        // Coluna 6 (índice 5) é onde fica a porção real no SubTotal
        subTotalPortionsVal = row[5]
        continue
      }

      // Linha de Mão de Obra
      if (norm0 === 'mao de obra' || norm0.startsWith('mao de obra')) {
        inIngredients = false
        const mins = parseNumericValue(row[1]) // Coluna 2
        const rate = parseNumericValue(row[3]) || globalLaborRate // Coluna 4 ou global
        const cost = parseNumericValue(row[4]) // Coluna 5

        if (mins !== null) laborMinutes = mins
        if (rate !== null) laborRatePerMin = rate
        if (cost !== null) {
          laborCost = cost
        } else if (mins && rate) {
          laborCost = mins * rate
        }
        continue
      }

      // Linha de Total
      if (norm0 === 'total' || norm0.startsWith('total')) {
        inIngredients = false
        continue
      }

      // Se estamos na seção de ingredientes (ou antes de Subtotal)
      if (inIngredients) {
        // REGRA DO NEGÓCIO (Requisito 4):
        // Linhas-tampão: células de ingrediente vazias/brancas, custo 0 e/ou rendimento "porcoes".
        // Devem ser simplesmente puladas, nem virarem ingredientes nem gerarem erro.
        const c1Val = String(row[1] ?? '').trim()
        const c2Val = String(row[2] ?? '').trim()
        const c4Val = String(row[4] ?? '').trim()
        const c5Val = normalizeString(String(row[5] ?? ''))

        const isBufferLine =
          !c0 ||
          (c0 === '' &&
            (c4Val === '0' || c4Val === '' || c4Val === '#ref!') &&
            (c5Val === 'porcoes' || c5Val === ''))

        if (isBufferLine && (!c1Val || c1Val === '') && (!c2Val || c2Val === '')) {
          continue
        }

        // Se linha inteira não tem nome de ingrediente nem quantidade
        if (!c0 && !c1Val && !c2Val) {
          continue
        }

        // REGRA DO NEGÓCIO (Requisito 5):
        // Linha com nome "redução" / "reducao" / "perda" (ignorando acentos e caixa) no meio do bloco
        // NÃO é insumo: é a perda do preparo (ex.: batata frita 0.1).
        // Ignore com aviso informativo sem gerar ingrediente ou erro.
        const normIngName = normalizeName(c0)
        if (normIngName === 'reducao' || normIngName === 'perda' || normIngName === 'quebra') {
          blockWarnings.push(
            `Linha de perda/redução no preparo ignorada como insumo: "${c0}" (${c1Val || ''} ${c2Val || ''}).`,
          )
          continue
        }

        // Ignora linhas que são metadados como "Tipo: ...", "Categoria: ..." caso estejam dentro do bloco
        const normLine = normalizeName(row.map((x) => String(x || '').trim()).join(' '))
        if (
          normLine.startsWith('tipo') ||
          normLine.startsWith('categoria') ||
          normLine.startsWith('classificacao')
        ) {
          continue
        }

        // Se tem nome de ingrediente
        if (c0) {
          rawItems.push({
            rowIndex: r + 1,
            rawName: c0,
            rawQty: row[1],
            rawUnit: String(row[2] || '').trim(),
          })
        }
      }
    }

    // REGRA DO NEGÓCIO (Requisito 3):
    // Ignore a coluna de rendimento das linhas de ingrediente;
    // Use apenas a célula numérica da linha SubTotal
    const yieldResolution = resolveYieldPortionsFromSubtotal(subTotalPortionsVal)
    if (yieldResolution.warning) {
      blockWarnings.push(yieldResolution.warning)
    }

    // REGRA DO NEGÓCIO (Requisito 2):
    // O TIPO da ficha vem primariamente no SUFIXO do título do bloco ("FICHA TECNICA - <TIPO>")
    // Se não tiver no título, tenta procurar linha "Tipo:" no bloco
    let detectedTypeRaw: string | undefined = currentBlock.titleSuffixType

    if (!detectedTypeRaw) {
      for (let r = currentBlock.startRow; r < nextStartRow; r++) {
        const row = matrix[r] || []

        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] || '').trim()
          if (!cellStr) continue
          const normCell = normalizeName(cellStr)

          const inlineMatch = cellStr.match(
            /^(?:tipo|categoria|classifica[cç][aã]o)\s*[:\-–—]\s*(.+)$/i,
          )
          if (inlineMatch && inlineMatch[1]?.trim()) {
            detectedTypeRaw = inlineMatch[1].trim()
            break
          }

          if (
            normCell === 'tipo' ||
            normCell === 'tipo da ficha' ||
            normCell === 'categoria da ficha' ||
            normCell === 'tipo de prato'
          ) {
            for (let nc = c + 1; nc < row.length; nc++) {
              const nextVal = String(row[nc] || '').trim()
              if (nextVal) {
                detectedTypeRaw = nextVal
                break
              }
            }
            if (detectedTypeRaw) break
          }
        }
        if (detectedTypeRaw) break

        const rowCombined = row
          .map((cell) => String(cell || '').trim())
          .filter(Boolean)
          .join(' ')
        const rowMatch = rowCombined.match(
          /^(?:tipo|categoria|classifica[cç][aã]o)\s*[:\-–—]\s*(.+)$/i,
        )
        if (rowMatch && rowMatch[1]?.trim()) {
          detectedTypeRaw = rowMatch[1].trim()
          break
        }
      }
    }

    // Determina o tipo de receita ('prato' | 'guarnicao') a partir do tipo detectado
    let inferredType: RecipeType = 'prato'
    if (detectedTypeRaw) {
      const normDet = normalizeName(detectedTypeRaw)
      if (normDet.includes('guarn') || normDet.includes('acompanh')) {
        inferredType = 'guarnicao'
      } else {
        inferredType = 'prato'
      }
    } else {
      const normRecipeName = normalizeString(currentBlock.recipeName)
      if (
        normRecipeName.includes('arroz') ||
        normRecipeName.includes('farofa') ||
        normRecipeName.includes('pure') ||
        normRecipeName.includes('legumes') ||
        normRecipeName.includes('salada') ||
        normRecipeName.includes('pirao') ||
        normRecipeName.includes('guarn')
      ) {
        inferredType = 'guarnicao'
      }
    }

    // Monta itens do bloco
    // REGRA DO NEGÓCIO (Requisito 9):
    // Insumos não devem ser bloqueados por falta de cadastro.
    // Unidades "gr", "uni", "unid.", "ml" são normalizadas.
    const items = rawItems.map((ri) => {
      const q = parseNumericValue(ri.rawQty)
      const unitDetails = normalizeUnitWithDetails(ri.rawUnit)
      const itemErrors: string[] = []
      const itemWarnings: string[] = []

      if (!ri.rawName) itemErrors.push('Nome do insumo vazio')
      if (q === null || q <= 0) itemErrors.push('Quantidade inválida (deve ser maior que zero)')
      if (unitDetails.warning) itemWarnings.push(unitDetails.warning)

      return {
        rowIndex: ri.rowIndex,
        ingredientName: ri.rawName,
        quantity: q || 0,
        unit: unitDetails.unit,
        originalUnit: unitDetails.originalUnit,
        unitWarning: unitDetails.warning,
        isValid: itemErrors.length === 0,
        error: itemErrors.length > 0 ? itemErrors.join(', ') : undefined,
        warning: itemWarnings.length > 0 ? itemWarnings.join(', ') : undefined,
      }
    })

    const notesParts: string[] = []
    if (currentBlock.portionDesc) {
      notesParts.push(currentBlock.portionDesc)
    }
    if (laborMinutes) {
      notesParts.push(`Mão de obra: ${laborMinutes} min`)
    }

    const extractedPortion = extractPortionSize(currentBlock.portionDesc)

    blockPreviews.push({
      recipeName: currentBlock.recipeName || '(Sem nome de ficha)',
      recipeType: inferredType,
      rawDetectedType: detectedTypeRaw,
      yieldPortions: yieldResolution.yieldPortions,
      sellingPrice: 0,
      portionDescription: currentBlock.portionDesc,
      portionSizeValue: extractedPortion?.value,
      portionSizeUnit: extractedPortion?.unit,
      laborCost: laborCost !== undefined ? Math.round(laborCost * 100) / 100 : undefined,
      laborMinutes,
      laborRatePerMinute: laborRatePerMin,
      notes: notesParts.length > 0 ? notesParts.join(' • ') : undefined,
      items,
      isUpdate: false,
      isValid: true,
      errors: [],
      warnings: blockWarnings,
    })
  }

  return {
    format: 'blocks',
    sheetName,
    globalRates: {
      laborPerMinute: globalLaborRate,
      waterPerMl: globalWaterRate,
    },
    blockPreviews,
    totalRawRows: matrix.length,
  }
}

/**
 * Valida e agrupa linhas da planilha de Fichas Técnicas por ficha
 * Suporta tanto o resultado tabular quanto blocos já detectados
 */
export function validateAndGroupRecipeRows(
  sheetDetection: RecipeSheetDetectionResult,
  columnMapping: NonNullable<RecipeSheetDetectionResult['detectedColumns']>,
  existingRecipes: Recipe[],
  existingIngredients: Ingredient[],
  dishTypes?: DishType[],
): GroupedRecipePreview[] {
  // REGRA DO NEGÓCIO (Requisito 8):
  // "Blocos de PRATO PRINCIPAL têm linhas 'GUARNICAO <NOME> ...' com quantidade 1 e unidade unid.
  // A regra é vincular guarnição salva, nunca virar insumo. Como as guarnições DESTE MESMO arquivo
  // vêm em blocos anteriores, a importação deve processar os blocos em ordem para que as guarnições
  // já importadas/presentes no mesmo lote fiquem disponíveis para vincular nos pratos principais."
  //
  // Criamos uma lista sintética de guarnições conhecidas que combina:
  // 1. As guarnições já existentes no banco de dados
  // 2. As receitas do lote atual que foram classificadas como guarnição
  const combinedGarnishRecipes: Recipe[] = [
    ...existingRecipes.filter((r) => isGarnishRecipe(r, dishTypes)),
  ]

  // Se estiver em formato de blocos, pré-cadastra as guarnições do próprio lote na lista
  if (sheetDetection.format === 'blocks' && sheetDetection.blockPreviews) {
    sheetDetection.blockPreviews.forEach((b, idx) => {
      const isBlockGarnish =
        b.recipeType === 'guarnicao' ||
        (b.rawDetectedType && normalizeName(b.rawDetectedType).includes('guarn')) ||
        (b.matchedDishType &&
          (b.matchedDishType.is_garnish || b.matchedDishType.slug === 'guarnicao'))

      if (isBlockGarnish && b.recipeName) {
        const alreadyIn = combinedGarnishRecipes.some(
          (g) =>
            areNamesEquivalent(g.name, b.recipeName) ||
            normalizeName(g.name) === normalizeName(b.recipeName),
        )
        if (!alreadyIn) {
          // Receita sintética em memória com id temporário para identificação no lote
          combinedGarnishRecipes.push({
            id: `batch_recipe_${idx}`,
            name: b.recipeName,
            type: 'guarnicao',
            yield_portions: b.yieldPortions || 1,
            selling_price: b.sellingPrice || 0,
            labor_cost: b.laborCost,
          } as Recipe)
        }
      }
    })
  }

  // Função interna para reconciliar uma linha de item (seja do bloco ou tabular)
  const reconcileItem = (item: {
    rowIndex: number
    ingredientName: string
    quantity: number
    unit: MeasurementUnit
    originalUnit?: string
    unitWarning?: string
    error?: string
    warning?: string
  }): GroupedRecipePreviewItem => {
    const itemErrors: string[] = []
    const itemWarnings: string[] = []
    if (item.error) itemErrors.push(item.error)
    if (item.warning) itemWarnings.push(item.warning)

    // 1. Verifica se a linha refere-se a uma guarnição (do banco ou do lote atual)
    const garnishDetection = detectGarnishReference(item.ingredientName, combinedGarnishRecipes)

    if (garnishDetection.isGarnishReference && garnishDetection.matchedGarnishRecipe) {
      // Guarnição encontrada no sistema ou no lote! Vincula como sub_recipe
      const subRecipe = garnishDetection.matchedGarnishRecipe
      const garnishQty = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1

      return {
        rowIndex: item.rowIndex,
        ingredientName: item.ingredientName,
        quantity: garnishQty,
        unit: 'unidade',
        originalUnit: item.originalUnit,
        unitWarning: undefined,
        itemKind: 'sub_recipe',
        matchedSubRecipe: subRecipe,
        sizeModifier: garnishDetection.sizeModifier,
        matchedIngredient: undefined,
        isMissingIngredient: false,
        isValid: itemErrors.length === 0,
        error: itemErrors.length > 0 ? itemErrors.join(', ') : undefined,
        warning: itemWarnings.length > 0 ? itemWarnings.join(', ') : undefined,
      }
    }

    // 2. Se a linha tem indicação de guarnição mas NÃO foi encontrada nem no banco nem no lote:
    // Nunca deve quebrar a importação: trata como insumo a ser criado com R$ 0,00 ou cadastrado
    let unmatchedGarnishWarning: string | undefined
    if (garnishDetection.isGarnishReference && !garnishDetection.matchedGarnishRecipe) {
      const gName =
        garnishDetection.unmatchedGarnishName ||
        garnishDetection.cleanGarnishName ||
        item.ingredientName
      unmatchedGarnishWarning = `Guarnição "${gName}" não encontrada no sistema nem no arquivo — importada como insumo.`
      itemWarnings.push(unmatchedGarnishWarning)
    }

    // 3. Reconciliação como insumo tradicional
    const normIngName = normalizeName(item.ingredientName)
    const matchedIngredient = existingIngredients.find(
      (ing) =>
        areNamesEquivalent(ing.name, item.ingredientName) ||
        normalizeName(ing.name) === normIngName,
    )

    let isMissingIngredient = false
    if (!matchedIngredient && item.ingredientName) {
      isMissingIngredient = true
      // Em vez de erro bloqueante, insumo faltante gera aviso para criação automática com R$ 0,00
      itemWarnings.push(`Insumo novo a ser criado com R$ 0,00: "${item.ingredientName}"`)
    }

    // Verifica compatibilidade de unidade (se já cadastrado)
    if (matchedIngredient && item.unit) {
      const ingU = matchedIngredient.unit
      const isMass = (u: MeasurementUnit) => u === 'kg' || u === 'g'
      const isVolume = (u: MeasurementUnit) => u === 'L' || u === 'mL'
      const isCount = (u: MeasurementUnit) => u === 'unidade'

      if (isMass(ingU) && !isMass(item.unit)) {
        itemWarnings.push(
          `Unidade na ficha (${item.unit}) difere do insumo (${ingU}); custo proporcional pode exigir ajuste`,
        )
      } else if (isVolume(ingU) && !isVolume(item.unit)) {
        itemWarnings.push(
          `Unidade na ficha (${item.unit}) difere do insumo (${ingU}); custo proporcional pode exigir ajuste`,
        )
      } else if (isCount(ingU) && !isCount(item.unit)) {
        itemWarnings.push(
          `Unidade na ficha (${item.unit}) difere do insumo (${ingU}); custo proporcional pode exigir ajuste`,
        )
      }
    }

    const isValid = itemErrors.length === 0
    return {
      rowIndex: item.rowIndex,
      ingredientName: item.ingredientName,
      quantity: item.quantity,
      unit: item.unit,
      originalUnit: item.originalUnit,
      unitWarning: item.unitWarning,
      itemKind: 'ingredient',
      matchedIngredient,
      matchedSubRecipe: undefined,
      sizeModifier: garnishDetection.sizeModifier,
      isMissingIngredient,
      isValid,
      error: itemErrors.length > 0 ? itemErrors.join(', ') : undefined,
      warning: itemWarnings.length > 0 ? itemWarnings.join(', ') : undefined,
    }
  }

  // Função auxiliar para casar tipo de prato e determinar se é guarnição
  const resolveDishTypeMatch = (
    rawTypeStr: string | undefined,
    recipeName: string,
  ): {
    matchedDishType?: DishType
    dishTypeId?: string
    recipeType: RecipeType
    warning?: string
  } => {
    const trimmed = rawTypeStr ? rawTypeStr.trim() : ''
    const norm = normalizeName(trimmed)

    if (trimmed && dishTypes && dishTypes.length > 0) {
      // 1. Procura tipo cadastrado exatamente ou normalizado
      const matched = dishTypes.find((dt) => {
        return (
          areNamesEquivalent(dt.name, trimmed) ||
          normalizeName(dt.name) === norm ||
          dt.slug === norm ||
          dt.id === trimmed
        )
      })

      if (matched) {
        const isGarnish =
          matched.is_garnish ||
          matched.slug === 'guarnicao' ||
          normalizeName(matched.name).includes('guarn') ||
          normalizeName(matched.name).includes('acompanh')
        return {
          matchedDishType: matched,
          dishTypeId: matched.id,
          recipeType: isGarnish ? 'guarnicao' : 'prato',
        }
      }
    }

    // Se veio um tipo mas ainda não existe no cadastro (será criado na importação)
    if (trimmed) {
      const isGarnish = norm.includes('guarn') || norm.includes('acompanh')
      return {
        recipeType: isGarnish ? 'guarnicao' : 'prato',
      }
    }

    // Se não veio tipo informado na planilha:
    // Mantém fallback atual por nome da receita ou 'prato', e adiciona aviso informativo
    let inferredType: RecipeType = 'prato'
    const normRecipeName = normalizeString(recipeName)
    if (
      normRecipeName.includes('arroz') ||
      normRecipeName.includes('farofa') ||
      normRecipeName.includes('pure') ||
      normRecipeName.includes('legumes') ||
      normRecipeName.includes('salada') ||
      normRecipeName.includes('pirao') ||
      normRecipeName.includes('guarn')
    ) {
      inferredType = 'guarnicao'
    }

    // Tenta associar ao DishType 'prato' ou 'guarnicao' já cadastrado
    const fallbackDt = dishTypes?.find(
      (dt) => dt.slug === inferredType || (inferredType === 'guarnicao' && dt.is_garnish),
    )

    return {
      matchedDishType: fallbackDt,
      dishTypeId: fallbackDt?.id,
      recipeType: inferredType,
      warning: 'Tipo não especificado na planilha — classificado como padrão.',
    }
  }

  // 1. Se for formato de blocos:
  if (sheetDetection.format === 'blocks' && sheetDetection.blockPreviews) {
    return sheetDetection.blockPreviews.map((block) => {
      const normRecipeName = normalizeName(block.recipeName)
      const matchedExisting = existingRecipes.find(
        (r) =>
          areNamesEquivalent(r.name, block.recipeName) || normalizeName(r.name) === normRecipeName,
      )

      const groupErrors: string[] = []
      // Mantém os warnings já identificados no bloco (ex: avisos de perda ignorada, implausível)
      const groupWarnings: string[] = [...(block.warnings || [])]

      if (!block.recipeName || block.recipeName === '(Sem nome de ficha)') {
        groupErrors.push('Nome da ficha técnica não informado')
      }
      if (block.items.length === 0) {
        groupErrors.push('Ficha técnica sem ingredientes')
      }

      // Reconcilia cada item com a base de insumos ou guarnições
      const reconciledItems = block.items.map(reconcileItem)

      const hasInvalidItem = reconciledItems.some((i) => !i.isValid)
      if (hasInvalidItem) {
        groupErrors.push('Contém insumos com erros de preenchimento (nome ou quantidade)')
      }

      // Reconcilia tipo da ficha técnica
      const typeResolution = resolveDishTypeMatch(block.rawDetectedType, block.recipeName)
      if (typeResolution.warning) {
        groupWarnings.push(typeResolution.warning)
      }

      // Coleta avisos de insumos a criar, guarnições vinculadas ou não encontradas
      const garnishLinkedCount = reconciledItems.filter((i) => i.itemKind === 'sub_recipe').length
      if (garnishLinkedCount > 0) {
        groupWarnings.push(`${garnishLinkedCount} guarnição(ões) vinculada(s) como sub-ficha`)
      }

      const missingCount = reconciledItems.filter((i) => i.isMissingIngredient).length
      if (missingCount > 0) {
        groupWarnings.push(`${missingCount} insumo(s) novo(s) serão criados com preço R$ 0,00`)
      }

      const unitWarnings = reconciledItems.filter((i) => i.unitWarning).map((i) => i.unitWarning!)
      if (unitWarnings.length > 0) {
        groupWarnings.push(...Array.from(new Set(unitWarnings)))
      }

      return {
        ...block,
        recipeType: typeResolution.recipeType,
        matchedDishType: typeResolution.matchedDishType,
        dishTypeId: typeResolution.dishTypeId,
        items: reconciledItems,
        matchedExistingRecipe: matchedExisting,
        isUpdate: !!matchedExisting,
        isValid: groupErrors.length === 0,
        errors: groupErrors,
        warnings: groupWarnings,
      }
    })
  }

  // 2. Se for formato tabular tradicional (linhas avulsas):
  const rows = sheetDetection.rows || []
  const groupsMap = new Map<string, GroupedRecipePreview>()

  rows.forEach((row, index) => {
    const rawRecipeName = String(row[columnMapping.recipeNameCol] || '').trim()
    const rawIngredientName = String(row[columnMapping.ingredientCol] || '').trim()
    const rawQuantity = row[columnMapping.quantityCol]
    const rawUnit = String(row[columnMapping.unitCol] || '').trim()

    // Se a linha estiver totalmente em branco, ignora
    if (!rawRecipeName && !rawIngredientName) return

    const normRecipeName = normalizeName(rawRecipeName)
    const recipeKey = normRecipeName || `__empty_recipe_${index}`

    // Tipo de receita extraído da coluna de tipo
    const rawRowType =
      columnMapping.typeCol && row[columnMapping.typeCol]
        ? String(row[columnMapping.typeCol]).trim()
        : undefined

    const typeResolution = resolveDishTypeMatch(rawRowType, rawRecipeName)

    // Rendimento (default: 1)
    let parsedYield = 1
    if (columnMapping.yieldCol && row[columnMapping.yieldCol]) {
      const parsedNum = parseNumericValue(row[columnMapping.yieldCol])
      if (parsedNum !== null && parsedNum > 0) {
        parsedYield = normalizeYieldPortions(parsedNum).yieldPortions
      }
    }

    // Preço de venda (default: 0)
    let parsedPrice = 0
    if (columnMapping.sellingPriceCol && row[columnMapping.sellingPriceCol]) {
      let pClean = String(row[columnMapping.sellingPriceCol]).replace('R$', '').trim()
      if (pClean.includes(',') && pClean.includes('.')) {
        pClean = pClean.replace(/\./g, '').replace(',', '.')
      } else if (pClean.includes(',')) {
        pClean = pClean.replace(',', '.')
      }
      const p = parseFloat(pClean)
      if (!isNaN(p) && p >= 0) parsedPrice = p
    }

    // Mão de obra opcional
    let parsedLaborCost: number | undefined
    if (columnMapping.laborCostCol && row[columnMapping.laborCostCol]) {
      const lc = parseNumericValue(row[columnMapping.laborCostCol])
      if (lc !== null && lc >= 0) parsedLaborCost = lc
    }

    // Observações
    const notes = columnMapping.notesCol
      ? String(row[columnMapping.notesCol] || '').trim()
      : undefined

    // Tamanho da porção (se houver coluna dedicada de porção ou dentro de observações)
    const rawPortionText =
      (columnMapping.portionCol && row[columnMapping.portionCol]
        ? String(row[columnMapping.portionCol]).trim()
        : '') || (notes && notes.toLowerCase().includes('por') ? notes : '')
    const extractedPortion = extractPortionSize(rawPortionText)

    // Se o grupo não existe, inicializa
    if (!groupsMap.has(recipeKey)) {
      const matchedExisting = existingRecipes.find(
        (r) =>
          areNamesEquivalent(r.name, rawRecipeName) || normalizeName(r.name) === normRecipeName,
      )

      groupsMap.set(recipeKey, {
        recipeName: rawRecipeName || '(Sem nome de ficha)',
        recipeType: typeResolution.recipeType,
        rawDetectedType: rawRowType,
        matchedDishType: typeResolution.matchedDishType,
        dishTypeId: typeResolution.dishTypeId,
        yieldPortions: parsedYield,
        sellingPrice: parsedPrice,
        portionDescription: rawPortionText || undefined,
        portionSizeValue: extractedPortion?.value,
        portionSizeUnit: extractedPortion?.unit,
        laborCost: parsedLaborCost,
        notes,
        items: [],
        matchedExistingRecipe: matchedExisting,
        isUpdate: !!matchedExisting,
        isValid: true,
        errors: [],
        warnings: typeResolution.warning ? [typeResolution.warning] : [],
      })
    }

    const group = groupsMap.get(recipeKey)!

    if (group.yieldPortions === 1 && parsedYield > 1) group.yieldPortions = parsedYield
    if (group.sellingPrice === 0 && parsedPrice > 0) group.sellingPrice = parsedPrice
    if (!group.laborCost && parsedLaborCost) group.laborCost = parsedLaborCost
    if (!group.notes && notes) group.notes = notes
    if (!group.portionSizeValue && extractedPortion) {
      group.portionSizeValue = extractedPortion.value
      group.portionSizeUnit = extractedPortion.unit
      if (!group.portionDescription) group.portionDescription = rawPortionText
    }
    if (!group.rawDetectedType && rawRowType) {
      group.rawDetectedType = rawRowType
      group.recipeType = typeResolution.recipeType
      group.matchedDishType = typeResolution.matchedDishType
      group.dishTypeId = typeResolution.dishTypeId
    }

    // Validação e reconciliação do item usando reconcileItem
    const rawQ = parseNumericValue(rawQuantity)
    const unitDetails = normalizeUnitWithDetails(rawUnit)

    const baseItem = {
      rowIndex: index + 2,
      ingredientName: rawIngredientName,
      quantity: rawQ !== null && rawQ > 0 ? rawQ : 0,
      unit: unitDetails.unit,
      originalUnit: unitDetails.originalUnit,
      unitWarning: unitDetails.warning,
      error: !rawIngredientName
        ? 'Nome do insumo está em branco'
        : rawQ === null || rawQ <= 0
          ? 'Quantidade deve ser maior que zero'
          : undefined,
      warning: undefined,
    }

    const reconciled = reconcileItem(baseItem)
    group.items.push(reconciled)
  })

  const result = Array.from(groupsMap.values())
  result.forEach((group) => {
    const groupErrors: string[] = []
    const groupWarnings: string[] = []

    if (!group.recipeName || group.recipeName === '(Sem nome de ficha)') {
      groupErrors.push('Nome da ficha técnica não informado')
    }
    if (group.items.length === 0) {
      groupErrors.push('Ficha técnica sem ingredientes')
    }
    const hasInvalidItem = group.items.some((i) => !i.isValid)
    if (hasInvalidItem) {
      groupErrors.push('Contém insumos com erros de preenchimento (nome ou quantidade)')
    }

    const garnishLinkedCount = group.items.filter((i) => i.itemKind === 'sub_recipe').length
    if (garnishLinkedCount > 0) {
      groupWarnings.push(`${garnishLinkedCount} guarnição(ões) vinculada(s) como sub-ficha`)
    }

    const missingCount = group.items.filter((i) => i.isMissingIngredient).length
    if (missingCount > 0) {
      groupWarnings.push(`${missingCount} insumo(s) novo(s) serão criados com preço R$ 0,00`)
    }
    const unitWarnings = group.items.filter((i) => i.unitWarning).map((i) => i.unitWarning!)
    if (unitWarnings.length > 0) {
      groupWarnings.push(...Array.from(new Set(unitWarnings)))
    }

    group.errors = groupErrors
    group.warnings = groupWarnings
    group.isValid = groupErrors.length === 0
  })

  return result
}

/**
 * Baixa arquivo de modelo de planilha de Fichas Técnicas no formato de bloco vertical
 * e também inclui aba com formato tabular para flexibilidade do usuário.
 */
export function downloadRecipesTemplate(
  sampleRecipes: Recipe[] = [],
  sampleIngredients: Ingredient[] = [],
): void {
  const ing1 = sampleIngredients[0]?.name || 'arroz branco'
  const ing2 = sampleIngredients[1]?.name || 'oleo'
  const ing3 = sampleIngredients[2]?.name || 'alho'
  const ing4 = sampleIngredients[3]?.name || 'sal'

  // Aba 1: Modelo em Bloco (padrão solicitado)
  const blockRows: (string | number)[][] = [
    ['Mão de Obra (R$/min)', 0.2, '', '', '', ''],
    ['Agua (R$/ml)', 0.045, '', '', '', ''],
    ['FICHA TECNICA', 'ARROZ GRANDE', '', '', '', 'PORÇÃO 400G'],
    ['Tipo: GUARNICAO', '', '', '', '', ''],
    ['Ingrediente', 'Qtd', 'Unid.', 'Preço Unit. (R$)', 'Custo (R$)', 'Rendimento / Porções'],
    [ing1, 1.5, 'kg', '', '', 6],
    [ing2, 30, 'mL', '', '', ''],
    [ing3, 0.03, 'kg', '', '', ''],
    [ing4, 0.02, 'kg', '', '', 'porcoes'],
    ['SubTotal', '', '', '', '', 6],
    ['Mão de Obra', 15, 'min', 0.2, 3.0, ''],
    ['Total', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['FICHA TECNICA', 'ARROZ PEQUENO', '', '', '', 'PORÇÃO 200G'],
    ['Tipo: GUARNICAO', '', '', '', '', ''],
    ['Ingrediente', 'Qtd', 'Unid.', 'Preço Unit. (R$)', 'Custo (R$)', 'Rendimento / Porções'],
    [ing1, 1.5, 'kg', '', '', 12],
    [ing2, 30, 'mL', '', '', ''],
    [ing3, 0.03, 'kg', '', '', ''],
    [ing4, 0.02, 'kg', '', '', 'porcoes'],
    ['SubTotal', '', '', '', '', 12],
    ['Mão de Obra', 15, 'min', 0.2, 3.0, ''],
    ['Total', '', '', '', '', ''],
  ]

  const wsBlocks = XLSX.utils.aoa_to_sheet(blockRows)
  wsBlocks['!cols'] = [
    { wch: 28 }, // Col 1: Ingrediente / Header
    { wch: 14 }, // Col 2: Qtd / Minutos
    { wch: 12 }, // Col 3: Unid.
    { wch: 18 }, // Col 4: Preço Unit.
    { wch: 16 }, // Col 5: Custo
    { wch: 24 }, // Col 6: Rendimento / Porções
  ]

  // Aba 2: Modelo Tabular (Linha por Insumo)
  const tabularData = [
    {
      'Ficha Técnica': 'FILÉ MIGNON AO MOLHO',
      Tipo: 'prato',
      'Rendimento (porções)': 1,
      'Tamanho da Porção': '400g',
      'Preço de Venda': 75.0,
      'Mão de Obra (R$)': 4.5,
      Insumo: 'file mignon',
      Quantidade: 250,
      Unidade: 'g',
      Observações: 'Servir grelhado ao ponto',
    },
    {
      'Ficha Técnica': 'FILÉ MIGNON AO MOLHO',
      Tipo: 'prato',
      'Rendimento (porções)': 1,
      'Tamanho da Porção': '400g',
      'Preço de Venda': 75.0,
      'Mão de Obra (R$)': 4.5,
      Insumo: 'manteiga',
      Quantidade: 30,
      Unidade: 'g',
      Observações: '',
    },
  ]
  const wsTabular = XLSX.utils.json_to_sheet(tabularData)
  wsTabular['!cols'] = [
    { wch: 26 },
    { wch: 12 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 30 },
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, wsBlocks, 'Modelo em Blocos')
  XLSX.utils.book_append_sheet(workbook, wsTabular, 'Modelo Tabular')

  XLSX.writeFile(workbook, 'modelo_importacao_fichas_tecnicas.xlsx')
}
