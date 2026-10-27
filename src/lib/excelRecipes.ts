import * as XLSX from 'xlsx'
import { Ingredient, Recipe, RecipeType, MeasurementUnit } from '@/types/restaurant'
import { normalizeString } from '@/lib/excelSales'
import { normalizeUnit } from '@/lib/excelIngredients'

export interface ParsedRecipeItemRow {
  rowIndex: number
  recipeName: string
  recipeType: RecipeType
  yieldPortions: number
  sellingPrice: number
  notes?: string
  ingredientName: string
  quantity: number
  unit: MeasurementUnit
  // Reconciliações
  matchedIngredient?: Ingredient
  error?: string
}

export interface GroupedRecipePreview {
  recipeName: string
  recipeType: RecipeType
  yieldPortions: number
  sellingPrice: number
  notes?: string
  items: {
    rowIndex: number
    ingredientName: string
    quantity: number
    unit: MeasurementUnit
    matchedIngredient?: Ingredient
    error?: string
    isValid: boolean
  }[]
  matchedExistingRecipe?: Recipe
  isUpdate: boolean
  isValid: boolean
  errors: string[]
}

export interface RecipeSheetDetectionResult {
  headers: string[]
  detectedColumns: {
    recipeNameCol: string
    typeCol?: string
    yieldCol?: string
    sellingPriceCol?: string
    notesCol?: string
    ingredientCol: string
    quantityCol: string
    unitCol: string
  }
  rows: Record<string, any>[]
}

/**
 * Lê e analisa a planilha de Fichas Técnicas
 */
export async function parseExcelRecipesFile(file: File): Promise<RecipeSheetDetectionResult> {
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

  const recipeKeywords = ['ficha', 'receita', 'prato', 'nome da ficha', 'nome do prato', 'dish']
  const ingredientKeywords = ['insumo', 'ingrediente', 'componente', 'item']
  const qtyKeywords = ['quantidade', 'qtd', 'quant', 'volume', 'peso', 'qtde']
  const unitKeywords = ['unidade', 'unid', 'medida', 'um']
  const typeKeywords = ['tipo', 'categoria da ficha', 'tipo de prato', 'classificacao']
  const yieldKeywords = ['rendimento', 'porcoes', 'porções', 'rendimento porcoes', 'yield']
  const priceKeywords = ['preco de venda', 'preço de venda', 'venda', 'preco', 'preço']
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
  const notesCol = findBestCol(notesKeywords, [
    recipeNameCol,
    ingredientCol,
    quantityCol,
    unitCol,
    typeCol,
    yieldCol,
    sellingPriceCol,
  ])

  return {
    headers,
    detectedColumns: {
      recipeNameCol,
      ingredientCol,
      quantityCol,
      unitCol,
      typeCol: typeCol || undefined,
      yieldCol: yieldCol || undefined,
      sellingPriceCol: sellingPriceCol || undefined,
      notesCol: notesCol || undefined,
    },
    rows,
  }
}

/**
 * Valida e agrupa linhas da planilha de Fichas Técnicas por ficha
 */
export function validateAndGroupRecipeRows(
  rows: Record<string, any>[],
  columnMapping: RecipeSheetDetectionResult['detectedColumns'],
  existingRecipes: Recipe[],
  existingIngredients: Ingredient[],
): GroupedRecipePreview[] {
  const groupsMap = new Map<string, GroupedRecipePreview>()

  rows.forEach((row, index) => {
    const rawRecipeName = String(row[columnMapping.recipeNameCol] || '').trim()
    const rawIngredientName = String(row[columnMapping.ingredientCol] || '').trim()
    const rawQuantity = row[columnMapping.quantityCol]
    const rawUnit = String(row[columnMapping.unitCol] || '').trim()

    // Se a linha estiver totalmente em branco, ignora
    if (!rawRecipeName && !rawIngredientName) return

    const normRecipeName = normalizeString(rawRecipeName)
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

    // Observações
    const notes = columnMapping.notesCol
      ? String(row[columnMapping.notesCol] || '').trim()
      : undefined

    // Se o grupo não existe, inicializa
    if (!groupsMap.has(recipeKey)) {
      const matchedExisting = existingRecipes.find(
        (r) => normalizeString(r.name) === normRecipeName,
      )

      groupsMap.set(recipeKey, {
        recipeName: rawRecipeName || '(Sem nome de ficha)',
        recipeType: parsedType,
        yieldPortions: parsedYield,
        sellingPrice: parsedPrice,
        notes,
        items: [],
        matchedExistingRecipe: matchedExisting,
        isUpdate: !!matchedExisting,
        isValid: true,
        errors: [],
      })
    }

    const group = groupsMap.get(recipeKey)!

    // Se as linhas seguintes da mesma ficha trouxerem tipo/rendimento/preço/notas que não estavam preenchidos antes, atualiza
    if (group.yieldPortions === 1 && parsedYield > 1) group.yieldPortions = parsedYield
    if (group.sellingPrice === 0 && parsedPrice > 0) group.sellingPrice = parsedPrice
    if (!group.notes && notes) group.notes = notes

    // Validação do ingrediente
    const itemErrors: string[] = []
    if (!rawIngredientName) {
      itemErrors.push('Nome do insumo está em branco')
    }

    // Quantidade
    let parsedQty: number | undefined
    if (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') {
      const q = parseFloat(String(rawQuantity).replace(',', '.'))
      if (isNaN(q) || q <= 0) {
        itemErrors.push('Quantidade deve ser maior que zero')
      } else {
        parsedQty = q
      }
    } else {
      itemErrors.push('Quantidade é obrigatória')
    }

    // Unidade
    const parsedUnit = normalizeUnit(rawUnit)
    if (!parsedUnit) {
      itemErrors.push(`Unidade "${rawUnit}" inválida (use kg, g, L, mL ou unidade)`)
    }

    // Busca insumo existente
    const normIngName = normalizeString(rawIngredientName)
    const matchedIngredient = existingIngredients.find(
      (ing) => normalizeString(ing.name) === normIngName,
    )

    if (!matchedIngredient && rawIngredientName) {
      itemErrors.push(`Insumo "${rawIngredientName}" não cadastrado no sistema`)
    }

    // Verifica compatibilidade de unidade (ex: kg/g, L/mL, unidade/unidade)
    if (matchedIngredient && parsedUnit) {
      const ingU = matchedIngredient.unit
      const isMass = (u: MeasurementUnit) => u === 'kg' || u === 'g'
      const isVolume = (u: MeasurementUnit) => u === 'L' || u === 'mL'
      const isCount = (u: MeasurementUnit) => u === 'unidade'

      if (isMass(ingU) && !isMass(parsedUnit)) {
        itemErrors.push(`Unidade "${parsedUnit}" incompatível com o insumo (cadastrado em ${ingU})`)
      } else if (isVolume(ingU) && !isVolume(parsedUnit)) {
        itemErrors.push(`Unidade "${parsedUnit}" incompatível com o insumo (cadastrado em ${ingU})`)
      } else if (isCount(ingU) && !isCount(parsedUnit)) {
        itemErrors.push(`Unidade "${parsedUnit}" incompatível com o insumo (cadastrado em unidade)`)
      }
    }

    const itemValid = itemErrors.length === 0

    group.items.push({
      rowIndex: index + 2,
      ingredientName: rawIngredientName,
      quantity: parsedQty || 0,
      unit: parsedUnit || 'g',
      matchedIngredient,
      error: itemErrors.length > 0 ? itemErrors.join(', ') : undefined,
      isValid: itemValid,
    })
  })

  // Validação final de cada grupo
  const result = Array.from(groupsMap.values())
  result.forEach((group) => {
    const groupErrors: string[] = []
    if (!group.recipeName || group.recipeName === '(Sem nome de ficha)') {
      groupErrors.push('Nome da ficha técnica não informado')
    }
    if (group.items.length === 0) {
      groupErrors.push('Ficha técnica sem ingredientes')
    }
    const hasInvalidItem = group.items.some((i) => !i.isValid)
    if (hasInvalidItem) {
      groupErrors.push('Contém insumos com erros de cadastro ou unidade')
    }

    group.errors = groupErrors
    group.isValid = groupErrors.length === 0
  })

  return result
}

/**
 * Baixa arquivo de modelo de planilha de Fichas Técnicas
 */
export function downloadRecipesTemplate(
  sampleRecipes: Recipe[] = [],
  sampleIngredients: Ingredient[] = [],
): void {
  const ing1 = sampleIngredients[0]?.name || 'Filé Mignon Bovino'
  const ing2 = sampleIngredients[1]?.name || 'Manteiga Extra Sem Sal'
  const ing3 = sampleIngredients[2]?.name || 'Alho Descascado'

  const templateData = [
    {
      'Ficha Técnica': 'Medalhão ao Molho de Ervas',
      Tipo: 'prato',
      'Rendimento (porções)': 1,
      'Preço de Venda': 75.0,
      Insumo: ing1,
      Quantidade: 250,
      Unidade: 'g',
      Observações: 'Grelhar e servir quente',
    },
    {
      'Ficha Técnica': 'Medalhão ao Molho de Ervas',
      Tipo: 'prato',
      'Rendimento (porções)': 1,
      'Preço de Venda': 75.0,
      Insumo: ing2,
      Quantidade: 30,
      Unidade: 'g',
      Observações: '',
    },
    {
      'Ficha Técnica': 'Medalhão ao Molho de Ervas',
      Tipo: 'prato',
      'Rendimento (porções)': 1,
      'Preço de Venda': 75.0,
      Insumo: ing3,
      Quantidade: 10,
      Unidade: 'g',
      Observações: '',
    },
    {
      'Ficha Técnica': 'Arroz Branco Soltinho',
      Tipo: 'guarnicao',
      'Rendimento (porções)': 4,
      'Preço de Venda': 18.0,
      Insumo:
        sampleIngredients.find((i) => normalizeString(i.name).includes('arroz'))?.name ||
        'Arroz Arbóreo',
      Quantidade: 300,
      Unidade: 'g',
      Observações: 'Cozinhar com alho e sal',
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo Fichas Técnicas')

  worksheet['!cols'] = [
    { wch: 30 }, // Ficha Técnica
    { wch: 14 }, // Tipo
    { wch: 22 }, // Rendimento
    { wch: 16 }, // Preço de Venda
    { wch: 30 }, // Insumo
    { wch: 14 }, // Quantidade
    { wch: 12 }, // Unidade
    { wch: 30 }, // Observações
  ]

  XLSX.writeFile(workbook, 'modelo_importacao_fichas_tecnicas.xlsx')
}
