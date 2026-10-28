import pb from '@/lib/pocketbase/client'
import { DishType } from '@/types/restaurant'

export function toSlug(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

import { normalizeName, areNamesEquivalent } from '@/lib/stringUtils'

export const dishTypesService = {
  async getAll(): Promise<DishType[]> {
    return await pb.collection('recipe_types').getFullList<DishType>({
      sort: 'sort_order,name',
    })
  },

  async getById(id: string): Promise<DishType> {
    return await pb.collection('recipe_types').getOne<DishType>(id)
  },

  async create(data: {
    name: string
    slug?: string
    description?: string
    color?: string
    sort_order?: number
    is_garnish?: boolean
  }): Promise<DishType> {
    const slug = data.slug?.trim() ? toSlug(data.slug) : toSlug(data.name)
    return await pb.collection('recipe_types').create<DishType>({
      ...data,
      slug,
      is_garnish: Boolean(data.is_garnish),
    })
  },

  async update(
    id: string,
    data: Partial<{
      name: string
      slug: string
      description: string
      color: string
      sort_order: number
      is_garnish: boolean
    }>,
  ): Promise<DishType> {
    const payload = { ...data }
    if (payload.slug) {
      payload.slug = toSlug(payload.slug)
    }
    return await pb.collection('recipe_types').update<DishType>(id, payload)
  },

  /**
   * Encontra um tipo existente por slug ou nome (case-insensitive),
   * ou cria automaticamente se não existir.
   */
  async findOrCreate(
    name: string,
    options?: { is_garnish?: boolean; color?: string },
  ): Promise<DishType> {
    const trimmed = name.trim()
    const slug = toSlug(trimmed)
    if (!slug) throw new Error('Nome de tipo inválido')

    try {
      const all = await this.getAll()
      const match = all.find(
        (t) =>
          t.slug === slug ||
          areNamesEquivalent(t.name, trimmed) ||
          normalizeName(t.name) === normalizeName(trimmed),
      )
      if (match) return match
    } catch {
      // fallback
    }

    try {
      const existing = await pb
        .collection('recipe_types')
        .getFirstListItem<DishType>(`slug = "${slug}" || name ~ "${trimmed}"`)
      return existing
    } catch {
      // Não existe -> cria
      return await this.create({
        name: trimmed,
        slug,
        is_garnish: options?.is_garnish ?? (slug.includes('guarn') || slug.includes('acompanh')),
        color: options?.color,
      })
    }
  },

  /**
   * Conta quantas fichas técnicas utilizam este tipo (por relation type_id ou legacy type slug).
   */
  async countUsage(dishType: DishType): Promise<number> {
    try {
      const records = await pb.collection('recipes').getList(1, 1, {
        filter: `type_id = "${dishType.id}" || type = "${dishType.slug}"`,
      })
      return records.totalItems
    } catch (err) {
      console.error('Erro ao verificar uso do tipo:', err)
      return 0
    }
  },

  /**
   * Exclusão segura de tipo:
   * Reclassifica as receitas para fallbackTypeId (ou 'prato') antes de deletar,
   * garantindo que nenhuma ficha fique órfã.
   */
  async deleteSafe(id: string, fallbackTypeId?: string): Promise<boolean> {
    const target = await this.getById(id)

    // Busca fallback
    let fallback = fallbackTypeId ? await this.getById(fallbackTypeId) : null

    if (!fallback && target.slug !== 'prato') {
      try {
        fallback = await pb.collection('recipe_types').getFirstListItem<DishType>('slug = "prato"')
      } catch {
        /* fallback opcional */
      }
    }

    // Se houver receitas usando este tipo, reclassifica
    try {
      const affectedRecipes = await pb.collection('recipes').getFullList({
        filter: `type_id = "${target.id}" || type = "${target.slug}"`,
      })
      for (const r of affectedRecipes) {
        await pb.collection('recipes').update(r.id, {
          type_id: fallback ? fallback.id : null,
          type: fallback ? fallback.slug : 'prato',
        })
      }
    } catch (err) {
      console.warn('Erro ao reclassificar receitas associadas:', err)
    }

    await pb.collection('recipe_types').delete(id)
    return true
  },
}
