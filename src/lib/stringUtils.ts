/**
 * Utilitários para normalização de textos e correspondência sem acentos,
 * cedilha, diferenças de maiúsculas/minúsculas e espaços excedentes.
 */

/**
 * Normaliza uma string removendo acentos/diacríticos (via NFD), convertendo para minúsculas,
 * aparando espaços no início/fim e colapsando múltiplos espaços em um só.
 * Exemplo: " BACÃO " -> "bacao", "Filé  Mignon" -> "file mignon".
 */
export function normalizeName(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove marcas diacríticas/acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Normalização alfanumérica simplificada (mantém apenas letras a-z e números 0-9 com espaços únicos).
 * Mantém compatibilidade com a normalizeString usada nos parsers de Excel.
 */
export function normalizeAlphaNumeric(str: string | null | undefined): string {
  const norm = normalizeName(str)
  return norm
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Verifica se dois nomes são equivalentes ignorando acentos, cedilha, caixa e espaços extras.
 */
export function areNamesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const normA = normalizeName(a)
  const normB = normalizeName(b)
  if (!normA || !normB) return false
  return normA === normB
}
