import pb from '@/lib/pocketbase/client'
import { Ingredient, IngredientPriceHistory, getEffectiveIngredientPrice } from '@/types/restaurant'

export const ingredientsService = {
  async getAll(): Promise<Ingredient[]> {
    const records = await pb.collection('ingredients').getFullList<Ingredient>({
      sort: 'name',
      expand: 'category_id',
    })
    return records
  },

  async getById(id: string): Promise<Ingredient> {
    return await pb.collection('ingredients').getOne<Ingredient>(id, {
      expand: 'category_id',
    })
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
          const hasPackage = !!(
            created.package_size &&
            created.package_size > 0 &&
            created.package_unit
          )
          const packagePart = hasPackage
            ? ` (embalagem: ${created.package_size} ${created.package_unit} -> R$ ${created.price.toFixed(2)}/${created.unit})`
            : ''
          if (created.reduction_percent && created.reduction_percent > 0) {
            note = `Preço inicial: R$ ${created.price.toFixed(2)}/${created.unit}${packagePart} c/ ${created.reduction_percent}% de perda (efetivo: R$ ${effectivePrice.toFixed(2)}/${created.unit})`
          } else {
            note = `Preço inicial de cadastro: R$ ${created.price.toFixed(2)}/${created.unit}${packagePart}`
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

    // Verifica se houve mudança no preço padrão, na embalagem ou na perda
    const priceChanged =
      data.price !== undefined &&
      currentRecord?.price !== undefined &&
      Math.abs(currentRecord.price - data.price) > 0.0001

    const oldPackageSize = currentRecord?.package_size
    const newPackageSize = data.package_size !== undefined ? data.package_size : oldPackageSize
    const packageChanged =
      (data.package_size !== undefined && data.package_size !== oldPackageSize) ||
      (data.package_unit !== undefined && data.package_unit !== currentRecord?.package_unit)

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

    if ((priceChanged || reductionChanged || packageChanged) && effectiveDiffers) {
      try {
        let note = historyNotes
        if (!note) {
          const diff = oldEffective !== undefined ? newEffective - oldEffective : 0
          const direction = diff >= 0 ? 'aumento' : 'redução'
          const diffStr = Math.abs(diff).toFixed(2)

          const hasNewPackage = !!(
            updated.package_size &&
            updated.package_size > 0 &&
            updated.package_unit
          )
          const packageDesc = hasNewPackage
            ? ` [emb. ${updated.package_size} ${updated.package_unit}]`
            : ''

          if (packageChanged && priceChanged) {
            note = `Ajuste de embalagem${packageDesc} e preço: ${direction} de R$ ${diffStr} (novo custo: R$ ${newEffective.toFixed(2)}/${updated.unit})`
          } else if (priceChanged && reductionChanged) {
            note = `Ajuste base (R$ ${updated.price.toFixed(2)}/${updated.unit}${packageDesc}) e perda (${newRed}%): ${direction} de R$ ${diffStr}`
          } else if (reductionChanged) {
            note = `Alteração de perda no preparo: ${oldRed}% -> ${newRed}% (${direction} de R$ ${diffStr})`
          } else if (packageChanged) {
            note = `Alteração de embalagem${packageDesc}: ${direction} de R$ ${diffStr}`
          } else if (oldEffective !== undefined) {
            note = `Ajuste de preço base${packageDesc}: ${direction} de R$ ${diffStr}`
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

  /**
   * Unifica dois ou mais insumos em um sobrevivente.
   * 1. Reatribui todos os recipe_items que apontavam para os insumos absorvidos para o sobrevivente;
   *    Caso a receita já tenha o insumo sobrevivente, soma as quantidades e converte ou remove duplicatas;
   * 2. Reatribui o histórico de preços (ingredient_price_history) dos insumos absorvidos para o sobrevivente;
   * 3. Aplica os dados finais escolhidos no insumo sobrevivente;
   * 4. Deleta com segurança os insumos absorvidos.
   */
  async mergeIngredients(params: {
    survivorId: string
    absorbedIds: string[]
    survivorData?: Partial<Omit<Ingredient, 'id' | 'created' | 'updated'>>
  }): Promise<{
    survivor: Ingredient
    reassignedRecipeItemsCount: number
    reassignedPriceHistoriesCount: number
    deletedIngredientsCount: number
  }> {
    const { survivorId, absorbedIds, survivorData } = params
    const uniqueAbsorbed = absorbedIds.filter((id) => id && id !== survivorId)
    if (uniqueAbsorbed.length === 0) {
      throw new Error('Nenhum insumo absorvido selecionado para unificação.')
    }

    let reassignedRecipeItemsCount = 0
    let reassignedPriceHistoriesCount = 0
    let deletedIngredientsCount = 0

    // Atualiza dados no sobrevivente se informados
    let survivor: Ingredient
    if (survivorData && Object.keys(survivorData).length > 0) {
      survivor = await this.update(
        survivorId,
        survivorData,
        'Dados consolidados na unificação de insumos',
      )
    } else {
      survivor = await this.getById(survivorId)
    }

    // Processa cada insumo a ser absorvido
    for (const absorbedId of uniqueAbsorbed) {
      // 1. Reatribuição de recipe_items
      const recipeItems = await pb
        .collection('recipe_items')
        .getFullList({ filter: `ingredient_id = "${absorbedId}"` })

      for (const item of recipeItems) {
        try {
          // Verifica se a mesma receita já tem o insumo sobrevivente
          const existingItemInSameRecipe = await pb
            .collection('recipe_items')
            .getFirstListItem(`recipe_id = "${item.recipe_id}" && ingredient_id = "${survivorId}"`)
            .catch(() => null)

          if (existingItemInSameRecipe) {
            // Se as unidades forem iguais, podemos somar a quantidade
            if (existingItemInSameRecipe.unit === item.unit) {
              await pb.collection('recipe_items').update(existingItemInSameRecipe.id, {
                quantity: (existingItemInSameRecipe.quantity || 0) + (item.quantity || 0),
              })
            }
            // Exclui o item duplicado antigo que apontava para o absorvido
            await pb.collection('recipe_items').delete(item.id)
          } else {
            // Reatribui para o sobrevivente
            await pb.collection('recipe_items').update(item.id, {
              ingredient_id: survivorId,
            })
          }
          reassignedRecipeItemsCount++
        } catch (itemErr) {
          console.error(`Erro ao reatribuir recipe_item ${item.id}:`, itemErr)
        }
      }

      // 2. Reatribuição de histórico de preços
      const priceHistories = await pb
        .collection('ingredient_price_history')
        .getFullList({ filter: `ingredient_id = "${absorbedId}"` })

      for (const hist of priceHistories) {
        try {
          await pb.collection('ingredient_price_history').update(hist.id, {
            ingredient_id: survivorId,
            notes: hist.notes ? `${hist.notes} (importado de unificação)` : 'Histórico unificado',
          })
          reassignedPriceHistoriesCount++
        } catch (histErr) {
          console.error(`Erro ao reatribuir price_history ${hist.id}:`, histErr)
        }
      }

      // 3. Deleta o insumo absorvido após todas as relações serem transferidas
      try {
        await pb.collection('ingredients').delete(absorbedId)
        deletedIngredientsCount++
      } catch (delErr) {
        console.error(`Erro ao deletar insumo absorvido ${absorbedId}:`, delErr)
        throw new Error(`Falha ao remover insumo absorvido ${absorbedId} após reatribuição`)
      }
    }

    return {
      survivor,
      reassignedRecipeItemsCount,
      reassignedPriceHistoriesCount,
      deletedIngredientsCount,
    }
  },
}
