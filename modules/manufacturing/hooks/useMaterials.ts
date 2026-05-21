import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { materialService } from '../services/materialService';
import type { Material } from '../types';

export const manufacturingQueryKeys = {
  materials: ['manufacturing', 'materials'] as const,
  material: (id: string) => ['manufacturing', 'material', id] as const,
  productBom: (productId: string) => ['manufacturing', 'productBom', productId] as const,
  materialBom: (materialId: string) => ['manufacturing', 'materialBom', materialId] as const,
  planRequirements: (planId: string) => ['manufacturing', 'planRequirements', planId] as const,
  requirementRuns: ['manufacturing', 'requirementRuns'] as const,
};

export function useMaterials() {
  return useQuery({
    queryKey: manufacturingQueryKeys.materials,
    queryFn: () => materialService.getAll(),
  });
}

export function useMaterial(id: string | undefined) {
  return useQuery({
    queryKey: manufacturingQueryKeys.material(id || ''),
    queryFn: () => (id ? materialService.getById(id) : null),
    enabled: Boolean(id),
  });
}

export function useMaterialMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: manufacturingQueryKeys.materials });

  const create = useMutation({
    mutationFn: (payload: Omit<Material, 'id' | 'createdAt' | 'tenantId'>) =>
      materialService.create(payload),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Material> }) =>
      materialService.update(id, data),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => materialService.delete(id),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
