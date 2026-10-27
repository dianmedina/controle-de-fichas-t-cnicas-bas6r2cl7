import pb from '@/lib/pocketbase/client'
import { Ingredient } from '@/types/restaurant'

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

  async create(data: Omit<Ingredient, 'id' | 'created' | 'updated'>): Promise<Ingredient> {
    return await pb.collection('ingredients').create<Ingredient>(data)
  },

  async update(
    id: string,
    data: Partial<Omit<Ingredient, 'id' | 'created' | 'updated'>>,
  ): Promise<Ingredient> {
    return await pb.collection('ingredients').update<Ingredient>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    await pb.collection('ingredients').delete(id)
    return true
  },
}
