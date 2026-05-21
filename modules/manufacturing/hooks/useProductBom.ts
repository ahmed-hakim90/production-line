import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bomService } from '../services/bomService';
import { materialService } from '../services/materialService';
import { calculateBomItemUnitCost } from '../engines/materialCostEngine';
import type { BomItem, BomOwnerType } from '../types';
import { manufacturingQueryKeys } from './useMaterials';

export type BomDisplayRow = BomItem & {
  directCost: number;
  indirectCost: number;
  totalCost: number;
  materialTypeLabel?: string;
};

async function loadBomDisplay(
  ownerType: BomOwnerType,
  ownerId: string,
): Promise<{ bomId: string | null; rows: BomDisplayRow[]; isLegacy: boolean }> {
  const { bom, items, isLegacy } = await bomService.getActiveBomWithLegacyFallback(ownerType, ownerId);
  const materials = await materialService.getAll();
  const matMap = new Map(materials.filter((m) => m.id).map((m) => [m.id!, m]));

  const rows: BomDisplayRow[] = items.map((item) => {
    const material = item.itemType === 'material' ? matMap.get(item.itemId) ?? null : null;
    const costs = calculateBomItemUnitCost(material, item, 1);
    return {
      ...item,
      directCost: costs.directCost,
      indirectCost: costs.indirectCost,
      totalCost: costs.totalCost,
      materialTypeLabel: costs.materialType,
    };
  });

  return { bomId: bom?.id ?? null, rows, isLegacy };
}

export function useProductBom(productId: string | undefined) {
  return useQuery({
    queryKey: manufacturingQueryKeys.productBom(productId || ''),
    queryFn: () => (productId ? loadBomDisplay('product', productId) : { bomId: null, rows: [], isLegacy: false }),
    enabled: Boolean(productId),
  });
}

export function useMaterialBom(materialId: string | undefined) {
  return useQuery({
    queryKey: manufacturingQueryKeys.materialBom(materialId || ''),
    queryFn: () =>
      materialId ? loadBomDisplay('material', materialId) : { bomId: null, rows: [], isLegacy: false },
    enabled: Boolean(materialId),
  });
}

export function useBomItemMutations(ownerType: BomOwnerType, ownerId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    if (ownerType === 'product') {
      qc.invalidateQueries({ queryKey: manufacturingQueryKeys.productBom(ownerId) });
    } else {
      qc.invalidateQueries({ queryKey: manufacturingQueryKeys.materialBom(ownerId) });
    }
  };

  const ensureBom = async () => bomService.ensureActiveBom(ownerType, ownerId);

  const addItem = useMutation({
    mutationFn: async (item: Omit<BomItem, 'id' | 'tenantId' | 'bomId'>) => {
      const bomId = await ensureBom();
      return bomService.addItem(bomId, item);
    },
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Partial<BomItem> }) =>
      bomService.updateItem(itemId, data),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => bomService.deleteItem(itemId),
    onSuccess: invalidate,
  });

  return { addItem, updateItem, deleteItem };
}
