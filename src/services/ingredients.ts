import pb from '@/lib/pocketbase/client'
import { Ingredient, IngredientPriceHistory, getEffectiveIngredientPrice } from '@/types/restaurant'

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
      const effectivePrice = getEffectiveIngredientPrice(created.price, created.reduction_percent)
      try {
        let note = historyNotes
        if (!note) {
          if (created.reduction_percent && created.reduction_percent > 0) {
            note = `Preço inicial: R$ ${created.price.toFixed(2)} c/ ${created.reduction_percent}% de perda no preparo (efetivo: R$ ${effectivePrice.toFixed(2)})`
          } else {
            note = 'Preço inicial de cadastro'
          }
        }
        await pb.collection('ingredient_price_history').create({
          ingredient_id: created.id,
          price: effectivePrice,
          date: new Date().toISOString().slice(0, 10),
          notes: note,
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
    let currentRecord: Ingredient | undefined
    try {
      currentRecord = await pb.collection('ingredients').getOne<Ingredient>(id)
    } catch {
      /* intentionally ignored */
    }

    const updated = await pb.collection('ingredients').update<Ingredient>(id, data)

    // Verifica se houve mudança no preço base OU na redução percentual
    const priceChanged =
      data.price !== undefined &&
      currentRecord?.price !== undefined &&
      Math.abs(currentRecord.price - data.price) > 0.0001

    const oldRed = currentRecord?.reduction_percent ?? 0
    const newRed = data.reduction_percent !== undefined ? data.reduction_percent : oldRed
    const reductionChanged =
      data.reduction_percent !== undefined && Math.abs(oldRed - newRed) > 0.0001

    const oldEffective = currentRecord
      ? getEffectiveIngredientPrice(currentRecord.price, currentRecord.reduction_percent)
      : undefined
    const newEffective = getEffectiveIngredientPrice(updated.price, updated.reduction_percent)

    const effectiveDiffers =
      oldEffective === undefined || Math.abs(oldEffective - newEffective) > 0.0001

    if ((priceChanged || reductionChanged) && effectiveDiffers) {
      try {
        let note = historyNotes
        if (!note) {
          const diff = oldEffective !== undefined ? newEffective - oldEffective : 0
          const direction = diff >= 0 ? 'aumento' : 'redução'
          const diffStr = Math.abs(diff).toFixed(2)

          if (priceChanged && reductionChanged) {
            note = `Ajuste base (R$ ${updated.price.toFixed(2)}) e perda (${newRed}%): ${direction} de R$ ${diffStr}`
          } else if (reductionChanged) {
            note = `Alteração de perda no preparo: ${oldRed}% -> ${newRed}% (${direction} de R$ ${diffStr})`
          } else if (oldEffective !== undefined) {
            note = `Ajuste de preço base: ${direction} de R$ ${diffStr}`
          } else {
            note = 'Atualização de preço efetivo'
          }
        }

        await pb.collection('ingredient_price_history').create({
          ingredient_id: updated.id,
          price: newEffective,
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
