import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const Materials = lazyNamed(() => import('../pages/Materials'), 'Materials');
const MaterialDetails = lazyNamed(() => import('../pages/MaterialDetails'), 'MaterialDetails');
const MaterialPlanningRun = lazyNamed(() => import('../pages/MaterialPlanningRun'), 'MaterialPlanningRun');
const MaterialCategories = lazyNamed(() => import('../pages/MaterialCategories'), 'MaterialCategories');
const PurchaseGapReport = lazyNamed(() => import('../pages/PurchaseGapReport'), 'PurchaseGapReport');

export const MANUFACTURING_ROUTES: AppRouteDef[] = [
  {
    path: '/manufacturing/materials',
    permission: 'materials.view',
    component: Materials,
  },
  {
    path: '/manufacturing/materials/:id',
    permission: 'materials.view',
    component: MaterialDetails,
  },
  {
    path: '/manufacturing/material-categories',
    permission: 'materials.manage',
    component: MaterialCategories,
  },
  {
    path: '/manufacturing/planning-run',
    permission: 'planning.materialRequirements.view',
    component: MaterialPlanningRun,
  },
  {
    path: '/manufacturing/purchase-gap',
    permission: 'manufacturing.purchaseGap.view',
    component: PurchaseGapReport,
  },
];
