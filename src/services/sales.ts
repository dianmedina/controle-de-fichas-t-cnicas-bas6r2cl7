import pb from '@/lib/pocketbase/client'
import { Sale } from '@/types/restaurant'

export interface SaleCreateInput {
  recipe_id: string
  date: string
  quantity: number
}

export const salesService = {
  async getAll(): Promise<Sale[]> {
    return await pb.collection('sales').getFullList<Sale>({
      sort: '-date,-created',
      expand: 'recipe_id',
    })
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Sale[]> {
    return await pb.collection('sales').getFullList<Sale>({
      filter: `date >= "${startDate}" && date <= "${endDate}"`,
      sort: '-date',
      expand: 'recipe_id',
    })
  },

  async create(data: SaleCreateInput): Promise<Sale> {
    return await pb.collection('sales').create<Sale>(data, {
      expand: 'recipe_id',
    })
  },

  async update(id: string, data: Partial<SaleCreateInput>): Promise<Sale> {
    return await pb.collection('sales').update<Sale>(id, data, {
      expand: 'recipe_id',
    })
  },

  async delete(id: string): Promise<boolean> {
    await pb.collection('sales').delete(id)
    return true
  },

  /**
   * Registra ou acumula uma venda do mesmo prato na mesma data.
   * Se já existir registro para (recipe_id, date), soma a quantidade ao invés de duplicar.
   */
  async upsertSale(
    recipeId: string,
    date: string,
    quantityToAdd: number,
  ): Promise<{ sale: Sale; action: 'created' | 'updated' }> {
    const existing = await pb.collection('sales').getFullList<Sale>({
      filter: `recipe_id = "${recipeId}" && date = "${date}"`,
      limit: 1,
    })

    if (existing.length > 0) {
      const current = existing[0]
      const newQty = (current.quantity || 0) + quantityToAdd
      const updated = await pb.collection('sales').update<Sale>(
        current.id,
        {
          quantity: newQty,
        },
        {
          expand: 'recipe_id',
        },
      )
      return { sale: updated, action: 'updated' }
    }

    const created = await pb.collection('sales').create<Sale>(
      {
        recipe_id: recipeId,
        date,
        quantity: quantityToAdd,
      },
      {
        expand: 'recipe_id',
      },
    )
    return { sale: created, action: 'created' }
  },

  /**
   * Importa uma lista de vendas reconhecidas, agrupando internamente itens duplicados
   * na mesma planilha e fazendo upsert no banco para somar aos registros existentes.
   */
  async importBatch(items: Array<{ recipeId: string; date: string; quantity: number }>): Promise<{
    createdCount: number
    updatedCount: number
    totalProcessed: number
  }> {
    // 1. Agrupar duplicatas dentro da própria planilha
    const aggregatedMap = new Map<string, { recipeId: string; date: string; quantity: number }>()
    for (const item of items) {
      const key = `${item.recipeId}___${item.date}`
      const prev = aggregatedMap.get(key)
      if (prev) {
        prev.quantity += item.quantity
      } else {
        aggregatedMap.set(key, {
          recipeId: item.recipeId,
          date: item.date,
          quantity: item.quantity,
        })
      }
    }

    let createdCount = 0
    let updatedCount = 0

    // 2. Executar upsert sequencial para cada item consolidado
    for (const item of aggregatedMap.values()) {
      const res = await this.upsertSale(item.recipeId, item.date, item.quantity)
      if (res.action === 'created') {
        createdCount++
      } else {
        updatedCount++
      }
    }

    return {
      createdCount,
      updatedCount,
      totalProcessed: items.length,
    }
  },
}
