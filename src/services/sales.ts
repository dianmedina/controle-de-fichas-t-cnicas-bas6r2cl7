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
}
