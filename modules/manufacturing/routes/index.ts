import type { AppRouteDef } from '../../shared/routes';
import { Materials } from '../pages/Materials';
import { MaterialDetails } from '../pages/MaterialDetails';
import { MaterialPlanningRun } from '../pages/MaterialPlanningRun';
import { MaterialCategories } from '../pages/MaterialCategories';
import { PurchaseGapReport } from '../pages/PurchaseGapReport';

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
