import type { LineWorkerLaborRole } from '@/types';

export const LINE_WORKER_LABOR_ROLES: LineWorkerLaborRole[] = [
  'production',
  'packaging',
  'quality',
  'maintenance',
  'external',
];

export const LINE_WORKER_LABOR_ROLE_LABELS: Record<LineWorkerLaborRole, string> = {
  production: 'إنتاج',
  packaging: 'تغليف',
  quality: 'جودة',
  maintenance: 'صيانة',
  external: 'خارجية',
};

export const LINE_WORKER_LABOR_ROLE_ABBREVIATIONS: Record<LineWorkerLaborRole, string> = {
  production: 'إ',
  packaging: 'ت',
  quality: 'ج',
  maintenance: 'ص',
  external: 'خ',
};

export const DEFAULT_LINE_WORKER_LABOR_ROLE: LineWorkerLaborRole = 'production';

export function resolveLineWorkerLaborRole(role?: LineWorkerLaborRole | null): LineWorkerLaborRole {
  if (role && LINE_WORKER_LABOR_ROLES.includes(role)) return role;
  return DEFAULT_LINE_WORKER_LABOR_ROLE;
}

export function isProductionLaborRole(role?: LineWorkerLaborRole | null): boolean {
  return resolveLineWorkerLaborRole(role) === 'production';
}

export function filterProductionLaborWorkers<T extends { laborRole?: LineWorkerLaborRole | null }>(
  rows: T[],
): T[] {
  return rows.filter((row) => isProductionLaborRole(row.laborRole));
}
