import type { SystemSettings } from '../../../types';
import { resolveInventoryRoutingV1 } from '../../inventory/lib/inventoryRoutingResolver';

export type TenantReadinessCheckId =
  | 'routing_wip_staging'
  | 'warehouses'
  | 'materials'
  | 'materials_cost'
  | 'boms'
  | 'lines'
  | 'cost_centers';

export interface TenantReadinessCheckInput {
  id: TenantReadinessCheckId;
  label: string;
  ok: boolean;
  detail: string;
  fixPath: string;
}

export interface TenantReadinessSnapshotInput {
  warehouseCount: number;
  materialCount: number;
  materialsWithCost: number;
  bomCount: number;
  lineCount: number;
  costCenterCount: number;
  settings: SystemSettings | null;
}

export interface TenantReadinessResult {
  checks: TenantReadinessCheckInput[];
  score: number;
  total: number;
  percent: number;
}

export function buildTenantReadinessChecks(input: TenantReadinessSnapshotInput): TenantReadinessResult {
  const routing = input.settings ? resolveInventoryRoutingV1(input.settings) : null;
  const routingOk = Boolean(
    routing?.productionWipWarehouseId?.trim() && routing?.finishedStagingWarehouseId?.trim(),
  );

  const checks: TenantReadinessCheckInput[] = [
    {
      id: 'routing_wip_staging',
      label: 'توجيه المخزون (WIP + تم الصنع)',
      ok: routingOk,
      detail: routingOk ? 'مكتمل' : 'غير مكتمل',
      fixPath: '/settings',
    },
    {
      id: 'warehouses',
      label: 'المستودعات (3 على الأقل)',
      ok: input.warehouseCount >= 3,
      detail: String(input.warehouseCount),
      fixPath: '/inventory/warehouses',
    },
    {
      id: 'materials',
      label: 'المواد التصنيعية',
      ok: input.materialCount > 0,
      detail: String(input.materialCount),
      fixPath: '/manufacturing/materials',
    },
    {
      id: 'materials_cost',
      label: 'مواد بتكلفة شراء',
      ok: input.materialCount === 0 || input.materialsWithCost > 0,
      detail: `${input.materialsWithCost}/${input.materialCount}`,
      fixPath: '/manufacturing/materials',
    },
    {
      id: 'boms',
      label: 'قوائم المواد (BOM)',
      ok: input.bomCount > 0,
      detail: String(input.bomCount),
      fixPath: '/products',
    },
    {
      id: 'lines',
      label: 'خطوط الإنتاج',
      ok: input.lineCount > 0,
      detail: String(input.lineCount),
      fixPath: '/lines',
    },
    {
      id: 'cost_centers',
      label: 'مراكز التكلفة',
      ok: input.costCenterCount > 0,
      detail: String(input.costCenterCount),
      fixPath: '/cost-centers',
    },
  ];

  const score = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  return { checks, score, total, percent };
}
