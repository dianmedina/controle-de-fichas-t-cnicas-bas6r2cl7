import pb from '@/lib/pocketbase/client'
import { Ingredient, IngredientPriceHistory } from '@/types/restaurant'

export const ingredientsService = {
  async getAll(): Promise<Ingredient[]> {
    const records = await pb.collection('ingredients').getFullList<Ingredient>({
      sort: 'name',
    })
    return records
  },

  async getById(id: string): Promise<Ingredient> {
    return await pb.collection('ingredients').getOne<Ingredient>(id)
  },

  async getPriceHistory(ingredientId: string): Promise<IngredientPriceHistory[]> {
    return await pb.collection('ingredient_price_history').getFullList<IngredientPriceHistory>({
      filter: `ingredient_id = "${ingredientId}"`,
      sort: '-date,-created',
    })
  },

  async recordPriceHistory(
    ingredientId: string,
    price: number,
    date?: string,
    notes?: string,
  ): Promise<IngredientPriceHistory> {
    const today = date || new Date().toISOString().slice(0, 10)
    return await pb.collection('ingredient_price_history').create<IngredientPriceHistory>({
      ingredient_id: ingredientId,
      price,
      date: today,
      notes: notes || undefined,
    })
  },

  async create(
    data: Omit<Ingredient, 'id' | 'created' | 'updated'>,
    historyNotes?: string,
  ): Promise<Ingredient> {
    const created = await pb.collection('ingredients').create<Ingredient>(data)
    if (typeof created.price === 'number' && created.price >= 0) {
      try {
        await pb.collection('ingredient_price_history').create({
          ingredient_id: created.id,
          price: created.price,
          date: new Date().toISOString().slice(0, 10),
          notes: historyNotes || 'Preço inicial de cadastro',
        })
      } catch (err) {
        console.error('Erro ao registrar histórico inicial de preço:', err)
      }
    }
    return created
  },

  async update(
    id: string,
    data: Partial<Omit<Ingredient, 'id' | 'created' | 'updated'>>,
    historyNotes?: string,
  ): Promise<Ingredient> {
    let oldPrice: number | undefined
    if (data.price !== undefined) {
      try {
        const current = await pb.collection('ingredients').getOne<Ingredient>(id)
        oldPrice = current.price
      } catch {
        /* intentionally ignored */
      }
    }

    const updated = await pb.collection('ingredients').update<Ingredient>(id, data)

    // Se o preço foi alterado e difere do preço anterior, grava histórico
    if (
      data.price !== undefined &&
      typeof data.price === 'number' &&
      (oldPrice === undefined || Math.abs(oldPrice - data.price) > 0.0001)
    ) {
      try {
        let note = historyNotes
        if (!note) {
          if (oldPrice !== undefined) {
            const diff = data.price - oldPrice
            note =
              diff > 0
                ? `Ajuste: aumento de R$ ${diff.toFixed(2)}`
                : `Ajuste: redução de R$ ${Math.abs(diff).toFixed(2)}`
          } else {
            note = 'Atualização de preço'
          }
        }
        await pb.collection('ingredient_price_history').create({
          ingredient_id: updated.id,
          price: data.price,
          date: new Date().toISOString().slice(0, 10),
          notes: note,
        })
      } catch (err) {
        console.error('Erro ao registrar alteração de preço no histórico:', err)
      }
    }

    return updated
  },

  async delete(id: string): Promise<boolean> {
    await pb.collection('ingredients').delete(id)
    return true
  },
}
