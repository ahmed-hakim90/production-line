import { buildRouteSkeletonMap } from '@/lib/routeSkeletonMap';
import { DASHBOARD_ROUTES } from '@/modules/dashboards/routes';
import { CATALOG_ROUTES } from '@/modules/catalog/routes';
import { PRODUCTION_ROUTES } from '@/modules/production/routes';
import { MANUFACTURING_ROUTES } from '@/modules/manufacturing/routes';
import { QUALITY_ROUTES } from '@/modules/quality/routes';
import { HR_ROUTES } from '@/modules/hr/routes';
import { COST_ROUTES } from '@/modules/costs/routes';
import { SYSTEM_ROUTES } from '@/modules/system/routes';
import { REPORTS_ROUTES } from '@/modules/reports/routes';
import { INVENTORY_ROUTES } from '@/modules/inventory/routes';
import { REPAIR_ROUTES } from '@/modules/repair/routes';

const ALL_PROTECTED_ROUTES = [
  ...DASHBOARD_ROUTES,
  ...CATALOG_ROUTES,
  ...PRODUCTION_ROUTES,
  ...MANUFACTURING_ROUTES,
  ...QUALITY_ROUTES,
  ...HR_ROUTES,
  ...COST_ROUTES,
  ...SYSTEM_ROUTES,
  ...REPORTS_ROUTES,
  ...INVENTORY_ROUTES,
  ...REPAIR_ROUTES,
];

export const routeSkeletonMap = buildRouteSkeletonMap(ALL_PROTECTED_ROUTES);
