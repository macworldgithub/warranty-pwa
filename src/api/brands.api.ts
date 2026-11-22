import { apiClient } from './client';
import { Brand } from '../types';

export const brandsApi = {
  getBrands: async (): Promise<Brand[]> => {
    const brands = await apiClient.get<Brand[]>('/brands');
    return brands.filter(brand => brand.isActive !== false).sort((a, b) => a.name.localeCompare(b.name));
  },

  getBrandById: async (id: string): Promise<Brand> => {
    return apiClient.get<Brand>(`/brands/${id}`);
  },
};
