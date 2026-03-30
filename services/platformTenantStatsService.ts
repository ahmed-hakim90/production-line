import { getTenantFirestoreFootprintCallable, type TenantFirestoreFootprint } from './firebase';

export type { TenantFirestoreFootprint };

export const platformTenantStatsService = {
  getTenantFootprint: (tenantId: string) => getTenantFirestoreFootprintCallable(tenantId),
};
