import * as XLSX from 'xlsx'
import { Recipe } from '@/types/restaurant'

export interface ParsedSaleRow {
  rowIndex: number
  rawDish: string
  rawDate: string
  rawQuantity: string | number
  rawUnitPrice?: string | number
  matchedRecipe?: Recipe
  normalizedDate?: string // YYYY-MM-DD
  normalizedQuantity?: number
  error?: string
  isValid: boolean
}

export interface SheetDetectionResult {
  headers: string[]
  detectedColumns: {
    dishCol: string
    dateCol: string
    quantityCol: string
    priceCol?: string
  }
  rows: Record<string, any>[]
}

/**
 * Normaliza strings removendo acentos e convertendo para minúsculas
 */
export { normalizeName, normalizeAlphaNumeric, areNamesEquivalent } from './stringUtils'
import { normalizeName, normalizeAlphaNumeric, areNamesEquivalent } from './stringUtils'

export function normalizeString(str: string): string {
  return normalizeAlphaNumeric(str)
}

/**
 * Tenta casar o nome do prato na planilha com as fichas técnicas cadastradas
 */
export function findMatchingRecipe(rawName: string, recipes: Recipe[]): Recipe | undefined {
  if (!rawName) return undefined
  const targetNorm = normalizeName(rawName)
  const targetAlpha = normalizeAlphaNumeric(rawName)
  if (!targetNorm && !targetAlpha) return undefined

  // 1. Match exato sem acentos e caixa normalizada
  const exact = recipes.find(
    (r) => areNamesEquivalent(r.name, rawName) || normalizeAlphaNumeric(r.name) === targetAlpha,
  )
  if (exact) return exact

  // 2. Um contém o outro (se o tamanho for razoável)
  const partial = recipes.find((r) => {
    const norm = normalizeName(r.name)
    if (norm.length < 3 || targetNorm.length < 3) return false
    return norm.includes(targetNorm) || targetNorm.includes(norm)
  })
  if (partial) return partial

  return undefined
}

/**
 * Converte datas de diversos formatos (Excel serial, DD/MM/AAAA, AAAA-MM-DD, ISO) para YYYY-MM-DD
 */
export function parseFlexibleDate(val: any): string | null {
  if (val === undefined || val === null || val === '') return null

  // Se já for Date object
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear()
    const m = String(val.getMonth() + 1).padStart(2, '0')
    const d = String(val.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Se for número serial do Excel (ex: 45225)
  if (typeof val === 'number') {
    try {
      const parsed = XLSX.SSF.parse_date_code(val)
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const y = parsed.y
        const m = String(parsed.m).padStart(2, '0')
        const d = String(parsed.d).padStart(2, '0')
        return `${y}-${m}-${d}`
      }
    } catch {
      // continua para fallback
    }
  }

  const str = String(val).trim()

  // Se for formato YYYY-MM-DD (ISO simples)
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (isoMatch) {
    const y = isoMatch[1]
    const m = isoMatch[2].padStart(2, '0')
    const d = isoMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Se for formato DD/MM/AAAA ou DD-MM-YYYY
  const brMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0')
    const m = brMatch[2].padStart(2, '0')
    const y = brMatch[3]
    return `${y}-${m}-${d}`
  }

  // Tenta interpretar com Date.parse como fallback
  const dObj = new Date(str)
  if (!isNaN(dObj.getTime())) {
    const y = dObj.getFullYear()
    const m = String(dObj.getMonth() + 1).padStart(2, '0')
    const d = String(dObj.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}

/**
 * Lê e analisa a planilha .xlsx enviada pelo usuário
 */
export async function parseExcelSalesFile(file: File): Promise<SheetDetectionResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('A planilha está vazia ou não possui abas.')
  }

  const worksheet = workbook.Sheets[firstSheetName]
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  })

  if (!rows || rows.length === 0) {
    throw new Error('Nenhuma linha de dados encontrada na planilha.')
  }

  const headers = Object.keys(rows[0] || {})

  // Heurística de detecção de colunas
  const dishKeywords = ['prato', 'produto', 'receita', 'item', 'ficha', 'nome', 'descricao', 'dish']
  const dateKeywords = ['data', 'dia', 'date', 'periodo', 'data da venda']
  const qtyKeywords = ['quantidade', 'qtd', 'quant', 'volume', 'unidades', 'vendido', 'qtde', 'qty']
  const priceKeywords = ['valor', 'preco', 'preço', 'unitario', 'valor unitario', 'total']

  const findBestCol = (keywords: string[]): string => {
    for (const h of headers) {
      const norm = normalizeString(h)
      if (keywords.some((kw) => norm === kw || norm.startsWith(kw) || norm.includes(kw))) {
        return h
      }
    }
    return headers[0] || ''
  }

  const dishCol = findBestCol(dishKeywords)
  const dateCol =
    headers.find(
      (h) => h !== dishCol && dateKeywords.some((kw) => normalizeString(h).includes(kw)),
    ) ||
    headers[1] ||
    ''
  const quantityCol =
    headers.find(
      (h) =>
        h !== dishCol && h !== dateCol && qtyKeywords.some((kw) => normalizeString(h).includes(kw)),
    ) ||
    headers[2] ||
    ''
  const priceCol = headers.find(
    (h) =>
      h !== dishCol &&
      h !== dateCol &&
      h !== quantityCol &&
      priceKeywords.some((kw) => normalizeString(h).includes(kw)),
  )

  return {
    headers,
    detectedColumns: {
      dishCol: dishCol || headers[0] || '',
      dateCol: dateCol || headers[1] || '',
      quantityCol: quantityCol || headers[2] || '',
      priceCol: priceCol || undefined,
    },
    rows,
  }
}

/**
 * Valida as linhas extraídas contra as fichas técnicas cadastradas
 */
export function validateParsedRows(
  rows: Record<string, any>[],
  columnMapping: { dishCol: string; dateCol: string; quantityCol: string; priceCol?: string },
  recipes: Recipe[],
): ParsedSaleRow[] {
  return rows.map((row, index) => {
    const rawDish = String(row[columnMapping.dishCol] || '').trim()
    const rawDate = row[columnMapping.dateCol]
    const rawQuantity = row[columnMapping.quantityCol]
    const rawUnitPrice = columnMapping.priceCol ? row[columnMapping.priceCol] : undefined

    const matchedRecipe = findMatchingRecipe(rawDish, recipes)
    const normalizedDate = parseFlexibleDate(rawDate)

    let normalizedQuantity: number | undefined
    if (typeof rawQuantity === 'number') {
      normalizedQuantity = Math.floor(rawQuantity)
    } else if (rawQuantity !== undefined && rawQuantity !== null && rawQuantity !== '') {
      let strQ = String(rawQuantity).trim()
      if (strQ.includes(',') && strQ.includes('.')) {
        strQ = strQ.replace(/\./g, '').replace(',', '.')
      } else if (strQ.includes(',')) {
        strQ = strQ.replace(',', '.')
      }
      const parsed = parseFloat(strQ)
      if (!isNaN(parsed)) normalizedQuantity = Math.floor(parsed)
    }

    const errors: string[] = []
    if (!rawDish) {
      errors.push('Nome do prato vazio')
    } else if (!matchedRecipe) {
      errors.push(`Prato "${rawDish}" não encontrado nas fichas`)
    }

    if (!normalizedDate) {
      errors.push('Data inválida ou não reconhecida')
    }

    if (!normalizedQuantity || normalizedQuantity <= 0) {
      errors.push('Quantidade inválida (deve ser maior que zero)')
    }

    const isValid = errors.length === 0

    return {
      rowIndex: index + 2, // Considerando linha 1 como cabeçalho
      rawDish,
      rawDate: String(rawDate || ''),
      rawQuantity,
      rawUnitPrice,
      matchedRecipe,
      normalizedDate: normalizedDate || undefined,
      normalizedQuantity,
      error: errors.length > 0 ? errors.join(', ') : undefined,
      isValid,
    }
  })
}

/**
 * Gera e dispara o download de uma planilha modelo (.xlsx) para importação
 */
export function downloadSalesTemplate(sampleRecipes: Recipe[]): void {
  const sampleDish1 = sampleRecipes[0]?.name || 'Risoto de Filé Mignon ao Vinho Tinto'
  const sampleDish2 = sampleRecipes[1]?.name || 'Medalhão de Mignon com Cogumelos'
  const today = new Date().toISOString().slice(0, 10)

  const templateData = [
    {
      Prato: sampleDish1,
      Data: today,
      Quantidade: 15,
      'Valor Unitário (Opcional)': sampleRecipes[0]?.selling_price || 89.0,
    },
    {
      Prato: sampleDish2,
      Data: today,
      Quantidade: 8,
      'Valor Unitário (Opcional)': sampleRecipes[1]?.selling_price || 74.0,
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo Vendas')

  // Ajuste de largura das colunas
  worksheet['!cols'] = [
    { wch: 38 }, // Prato
    { wch: 14 }, // Data
    { wch: 14 }, // Quantidade
    { wch: 25 }, // Valor Unitário
  ]

  XLSX.writeFile(workbook, 'modelo_importacao_vendas.xlsx')
}
