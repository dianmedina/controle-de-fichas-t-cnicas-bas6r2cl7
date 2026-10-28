import pb from '@/lib/pocketbase/client'
import { IngredientCategory } from '@/types/restaurant'
import { toSlug } from './dishTypes'
import { normalizeName, areNamesEquivalent } from '@/lib/stringUtils'

export const ingredientCategoriesService = {
  async getAll(): Promise<IngredientCategory[]> {
    return await pb.collection('ingredient_categories').getFullList<IngredientCategory>({
      sort: 'sort_order,name',
    })
  },

  async getById(id: string): Promise<IngredientCategory> {
    return await pb.collection('ingredient_categories').getOne<IngredientCategory>(id)
  },

  async create(data: {
    name: string
    slug?: string
    description?: string
    color?: string
    sort_order?: number
  }): Promise<IngredientCategory> {
    const slug = data.slug?.trim() ? toSlug(data.slug) : toSlug(data.name)
    return await pb.collection('ingredient_categories').create<IngredientCategory>({
      ...data,
      slug,
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
    }>,
  ): Promise<IngredientCategory> {
    const payload = { ...data }
    if (payload.slug) {
      payload.slug = toSlug(payload.slug)
    }
    return await pb.collection('ingredient_categories').update<IngredientCategory>(id, payload)
  },

  /**
   * Encontra uma categoria existente por slug ou nome (case-insensitive),
   * ou cria automaticamente se não existir.
   */
  async findOrCreate(name: string, description?: string): Promise<IngredientCategory> {
    const trimmed = name.trim()
    const slug = toSlug(trimmed)
    if (!slug) throw new Error('Nome de categoria inválido')

    // Primeiro busca todas e compara com areNamesEquivalent para não duplicar por causa de acentos
    try {
      const all = await this.getAll()
      const match = all.find(
        (c) =>
          c.slug === slug ||
          areNamesEquivalent(c.name, trimmed) ||
          normalizeName(c.name) === normalizeName(trimmed),
      )
      if (match) return match
    } catch {
      // continua para fallback
    }

    try {
      const existing = await pb
        .collection('ingredient_categories')
        .getFirstListItem<IngredientCategory>(`slug = "${slug}" || name ~ "${trimmed}"`)
      return existing
    } catch {
      return await this.create({
        name: trimmed,
        slug,
        description: description || `Categoria ${trimmed}`,
      })
    }
  },

  /**
   * Conta quantos insumos utilizam esta categoria (por category_id ou pelo nome texto category).
   */
  async countUsage(category: IngredientCategory): Promise<number> {
    try {
      const records = await pb.collection('ingredients').getList(1, 1, {
        filter: `category_id = "${category.id}" || category = "${category.name}" || category = "${category.slug}"`,
      })
      return records.totalItems
    } catch (err) {
      console.error('Erro ao verificar uso da categoria:', err)
      return 0
    }
  },

  /**
   * Exclusão segura de categoria:
   * Reclassifica os insumos vinculados para uma categoria fallback (ou 'Geral')
   * antes de deletar, evitando campos vazios ou inconsistentes.
   */
  async deleteSafe(id: string, fallbackCategoryId?: string): Promise<boolean> {
    const target = await this.getById(id)

    // Busca fallback
    let fallback = fallbackCategoryId ? await this.getById(fallbackCategoryId) : null

    if (!fallback && target.slug !== 'geral') {
      try {
        fallback = await pb
          .collection('ingredient_categories')
          .getFirstListItem<IngredientCategory>('slug = "geral" || name ~ "Geral"')
      } catch {
        /* fallback opcional */
      }
    }

    try {
      const affectedIngredients = await pb.collection('ingredients').getFullList({
        filter: `category_id = "${target.id}" || category = "${target.name}"`,
      })
      for (const ing of affectedIngredients) {
        await pb.collection('ingredients').update(ing.id, {
          category_id: fallback ? fallback.id : null,
          category: fallback ? fallback.name : 'Geral',
        })
      }
    } catch (err) {
      console.warn('Erro ao reclassificar insumos associados:', err)
    }

    await pb.collection('ingredient_categories').delete(id)
    return true
  },
}
