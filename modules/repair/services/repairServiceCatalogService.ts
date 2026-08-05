import { mutateRepairServiceCatalogCallable } from '../../auth/services/firebase';
import type { RepairServiceCatalogItem } from '../../../types';

export const repairServiceCatalogService = {
  async get(): Promise<{ revision: number; services: RepairServiceCatalogItem[]; source: string }> {
    const result = await mutateRepairServiceCatalogCallable({ operation: 'get' });
    return {
      revision: Number(result.revision || 0),
      services: Array.isArray(result.services) ? result.services as RepairServiceCatalogItem[] : [],
      source: String(result.source || 'protected'),
    };
  },
  async save(services: RepairServiceCatalogItem[]): Promise<number> {
    const result = await mutateRepairServiceCatalogCallable({
      operation: 'save',
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        price: service.price,
        enabled: service.enabled !== false,
      })),
    });
    return Number(result.revision || 0);
  },
};
