import * as XLSX from 'xlsx'
import { Ingredient, Recipe, RecipeType, MeasurementUnit } from '@/types/restaurant'
import { normalizeString } from '@/lib/excelSales'
import {
  normalizeUnit,
  normalizeUnitWithDetails,
  UnitNormalizationResult,
} from '@/lib/excelIngredients'
import { normalizeName, areNamesEquivalent } from '@/lib/stringUtils'

export type RecipeSpreadsheetFormat = 'tabular' | 'blocks'

export interface ParsedRecipeItemRow {
  rowIndex: number
  recipeName: string
  recipeType: RecipeType
  yieldPortions: number
  sellingPrice: number
  portionDescription?: string
  laborCost?: number
  notes?: string
  ingredientName: string
  quantity: number
  unit: MeasurementUnit
  originalUnit?: string
  unitWarning?: string
  // Reconciliações
  matchedIngredient?: Ingredient
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
  matchedIngredient?: Ingredient
  isMissingIngredient?: boolean
  error?: string
  warning?: string
  isValid: boolean
}

export interface GroupedRecipePreview {
  recipeName: string
  recipeType: RecipeType
  yieldPortions: number
  sellingPrice: number
  portionDescription?: string
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
 * Heurística para o valor de rendimento da coluna 6:
 * - Se for <= 0 ou nulo -> 1
 * - Se for > 100 (ex: 3400, 1800, 3500), representa o peso total da batelada em gramas/mL
 *   e não o número de porções servidas. Quando a porção for informada (ex: "PORÇÃO 400G"),
 *   calcula o rendimento em porções = batelada / porção (ex: 3400 / 400 = 8.5). Se não der para calcular, 1.
 * - Se for entre 0.1 e 100 -> é o número direto de porções (ex: 6, 12, 5.625, 10.58, 8.75).
 */
function resolveYieldPortions(
  subTotalPortionsVal: any,
  firstIngYieldVal: any,
  portionDesc?: string,
): number {
  const pSub = parseNumericValue(subTotalPortionsVal)
  if (pSub !== null && pSub > 0) {
    if (pSub <= 100) {
      return Math.round(pSub * 1000) / 1000
    }
    // Caso seja > 100, pode ter sido registrado o peso em gramas no subtotal por engano
    if (portionDesc) {
      const match = portionDesc.match(/(\d+[.,]?\d*)/)
      if (match) {
        const grams = parseFloat(match[1].replace(',', '.'))
        if (grams > 0) {
          return Math.round((pSub / grams) * 1000) / 1000
        }
      }
    }
    return Math.round(pSub)
  }

  // Tenta pelo valor da primeira linha de ingrediente se o subtotal não tiver
  const pFirst = parseNumericValue(firstIngYieldVal)
  if (pFirst !== null && pFirst > 0) {
    if (pFirst <= 100) {
      return Math.round(pFirst * 1000) / 1000
    }
    if (portionDesc) {
      const match = portionDesc.match(/(\d+[.,]?\d*)/)
      if (match) {
        const grams = parseFloat(match[1].replace(',', '.'))
        if (grams > 0) {
          return Math.round((pFirst / grams) * 1000) / 1000
        }
      }
    }
  }

  return 1
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
  const sellingPriceCol = findBestCol(priceKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
    yieldCol,
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
  const rawBlocks: {
    startRow: number
    recipeName: string
    portionDesc?: string
  }[] = []

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] || []
    const c0 = normalizeString(String(row[0] || ''))
    if (c0 === 'ficha tecnica' || c0.startsWith('ficha tecnica')) {
      const name = String(row[1] || '').trim()
      const portion = String(row[5] || '').trim() // Coluna 6 (índice 5): "PORÇÃO 400G"
      rawBlocks.push({
        startRow: r,
        recipeName: name,
        portionDesc: portion || undefined,
      })
    }
  }

  // 3. Processa cada bloco
  const blockPreviews: GroupedRecipePreview[] = []

  for (let b = 0; b < rawBlocks.length; b++) {
    const currentBlock = rawBlocks[b]
    const nextStartRow = b + 1 < rawBlocks.length ? rawBlocks[b + 1].startRow : matrix.length

    let subTotalPortionsVal: any = null
    let firstIngYieldVal: any = null
    let laborMinutes: number | undefined
    let laborRatePerMin: number | undefined
    let laborCost: number | undefined

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
        subTotalPortionsVal = row[5] // Coluna 6 (índice 5)
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
        // Ignora linhas vazias ou linhas de separador tipo coluna 5 = 0 e coluna 6 = 'porcoes'
        const c5Val = String(row[4] || '').trim()
        const c6Val = normalizeString(String(row[5] || ''))
        if (!c0 && (c5Val === '0' || c5Val === '') && (c6Val === 'porcoes' || c6Val === '')) {
          continue
        }
        if (!c0 && !row[1] && !row[2]) {
          continue
        }

        // Se tem nome de ingrediente
        if (c0) {
          if (rawItems.length === 0 && row[5] !== undefined && row[5] !== '') {
            firstIngYieldVal = row[5]
          }
          rawItems.push({
            rowIndex: r + 1,
            rawName: c0,
            rawQty: row[1],
            rawUnit: String(row[2] || '').trim(),
          })
        }
      }
    }

    const resolvedYield = resolveYieldPortions(
      subTotalPortionsVal,
      firstIngYieldVal,
      currentBlock.portionDesc,
    )

    // Infere tipo da ficha (se tiver no nome "farofa", "arroz", "pure", "legumes", "vinagrete", "salada" pode ser guarnicao,
    // mas por padrão prato a menos que seja acompanhamento ou o usuário classifique)
    let inferredType: RecipeType = 'prato'
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

    // Monta itens do bloco
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

    blockPreviews.push({
      recipeName: currentBlock.recipeName || '(Sem nome de ficha)',
      recipeType: inferredType,
      yieldPortions: resolvedYield,
      sellingPrice: 0,
      portionDescription: currentBlock.portionDesc,
      laborCost: laborCost !== undefined ? Math.round(laborCost * 100) / 100 : undefined,
      laborMinutes,
      laborRatePerMinute: laborRatePerMin,
      notes: notesParts.length > 0 ? notesParts.join(' • ') : undefined,
      items,
      isUpdate: false,
      isValid: true,
      errors: [],
      warnings: [],
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
): GroupedRecipePreview[] {
  // 1. Se for formato de blocos:
  if (sheetDetection.format === 'blocks' && sheetDetection.blockPreviews) {
    return sheetDetection.blockPreviews.map((block) => {
      const normRecipeName = normalizeName(block.recipeName)
      const matchedExisting = existingRecipes.find(
        (r) =>
          areNamesEquivalent(r.name, block.recipeName) || normalizeName(r.name) === normRecipeName,
      )

      const groupErrors: string[] = []
      const groupWarnings: string[] = []

      if (!block.recipeName || block.recipeName === '(Sem nome de ficha)') {
        groupErrors.push('Nome da ficha técnica não informado')
      }
      if (block.items.length === 0) {
        groupErrors.push('Ficha técnica sem ingredientes')
      }

      // Reconcilia cada item com a base de insumos cadastrada
      const reconciledItems = block.items.map((item) => {
        const itemErrors: string[] = []
        const itemWarnings: string[] = []
        if (item.error) itemErrors.push(item.error)
        if (item.warning) itemWarnings.push(item.warning)

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
          ...item,
          matchedIngredient,
          isMissingIngredient,
          isValid,
          error: itemErrors.length > 0 ? itemErrors.join(', ') : undefined,
          warning: itemWarnings.length > 0 ? itemWarnings.join(', ') : undefined,
        }
      })

      const hasInvalidItem = reconciledItems.some((i) => !i.isValid)
      if (hasInvalidItem) {
        groupErrors.push('Contém insumos com erros de preenchimento (nome ou quantidade)')
      }

      // Coleta avisos de insumos a criar ou unidades normalizadas
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

    // Tipo de receita (default: prato)
    let parsedType: RecipeType = 'prato'
    if (columnMapping.typeCol && row[columnMapping.typeCol]) {
      const t = normalizeString(row[columnMapping.typeCol])
      if (t.includes('guarn') || t.includes('acompanha')) {
        parsedType = 'guarnicao'
      }
    }

    // Rendimento (default: 1)
    let parsedYield = 1
    if (columnMapping.yieldCol && row[columnMapping.yieldCol]) {
      const y = parseFloat(String(row[columnMapping.yieldCol]).replace(',', '.'))
      if (!isNaN(y) && y > 0) parsedYield = y
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

    // Se o grupo não existe, inicializa
    if (!groupsMap.has(recipeKey)) {
      const matchedExisting = existingRecipes.find(
        (r) =>
          areNamesEquivalent(r.name, rawRecipeName) || normalizeName(r.name) === normRecipeName,
      )

      groupsMap.set(recipeKey, {
        recipeName: rawRecipeName || '(Sem nome de ficha)',
        recipeType: parsedType,
        yieldPortions: parsedYield,
        sellingPrice: parsedPrice,
        laborCost: parsedLaborCost,
        notes,
        items: [],
        matchedExistingRecipe: matchedExisting,
        isUpdate: !!matchedExisting,
        isValid: true,
        errors: [],
        warnings: [],
      })
    }

    const group = groupsMap.get(recipeKey)!

    if (group.yieldPortions === 1 && parsedYield > 1) group.yieldPortions = parsedYield
    if (group.sellingPrice === 0 && parsedPrice > 0) group.sellingPrice = parsedPrice
    if (!group.laborCost && parsedLaborCost) group.laborCost = parsedLaborCost
    if (!group.notes && notes) group.notes = notes

    // Validação do ingrediente
    const itemErrors: string[] = []
    const itemWarnings: string[] = []
    if (!rawIngredientName) {
      itemErrors.push('Nome do insumo está em branco')
    }

    // Quantidade com suporte a vírgula brasileira ("0,5", "1.500,50")
    let parsedQty: number | undefined
    if (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') {
      const q = parseNumericValue(rawQuantity)
      if (q === null || q <= 0) {
        itemErrors.push('Quantidade deve ser maior que zero')
      } else {
        parsedQty = q
      }
    } else {
      itemErrors.push('Quantidade é obrigatória')
    }

    // Unidade normalizada automaticamente com avisos informativos
    const unitDetails = normalizeUnitWithDetails(rawUnit)
    const parsedUnit = unitDetails.unit
    if (unitDetails.warning) {
      itemWarnings.push(unitDetails.warning)
    }

    // Busca insumo existente (normalização sem acentos)
    const normIngName = normalizeName(rawIngredientName)
    const matchedIngredient = existingIngredients.find(
      (ing) =>
        areNamesEquivalent(ing.name, rawIngredientName) || normalizeName(ing.name) === normIngName,
    )

    let isMissingIngredient = false
    if (!matchedIngredient && rawIngredientName) {
      isMissingIngredient = true
      // Insumo faltante vira aviso informativo, não erro bloqueante
      itemWarnings.push(`Insumo novo a ser criado com R$ 0,00: "${rawIngredientName}"`)
    }

    if (matchedIngredient && parsedUnit) {
      const ingU = matchedIngredient.unit
      const isMass = (u: MeasurementUnit) => u === 'kg' || u === 'g'
      const isVolume = (u: MeasurementUnit) => u === 'L' || u === 'mL'
      const isCount = (u: MeasurementUnit) => u === 'unidade'

      if (isMass(ingU) && !isMass(parsedUnit)) {
        itemWarnings.push(
          `Unidade na ficha (${parsedUnit}) difere do insumo (${ingU}); custo proporcional pode exigir ajuste`,
        )
      } else if (isVolume(ingU) && !isVolume(parsedUnit)) {
        itemWarnings.push(
          `Unidade na ficha (${parsedUnit}) difere do insumo (${ingU}); custo proporcional pode exigir ajuste`,
        )
      } else if (isCount(ingU) && !isCount(parsedUnit)) {
        itemWarnings.push(
          `Unidade na ficha (${parsedUnit}) difere do insumo (${ingU}); custo proporcional pode exigir ajuste`,
        )
      }
    }

    const itemValid = itemErrors.length === 0

    group.items.push({
      rowIndex: index + 2,
      ingredientName: rawIngredientName,
      quantity: parsedQty || 0,
      unit: parsedUnit,
      originalUnit: unitDetails.originalUnit,
      unitWarning: unitDetails.warning,
      matchedIngredient,
      isMissingIngredient,
      error: itemErrors.length > 0 ? itemErrors.join(', ') : undefined,
      warning: itemWarnings.length > 0 ? itemWarnings.join(', ') : undefined,
      isValid: itemValid,
    })
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
      'Preço de Venda': 75.0,
      'Mão de Obra (R$)': 4.5,
      Insumo: 'file mignon',
      Quantidade: 250,
      Unidade: 'g',
      Observações: 'PORÇÃO 300G • Servir grelhado',
    },
    {
      'Ficha Técnica': 'FILÉ MIGNON AO MOLHO',
      Tipo: 'prato',
      'Rendimento (porções)': 1,
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
