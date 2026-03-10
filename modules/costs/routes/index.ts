import type { AppRouteDef } from '../../shared/routes';
import { CostCenters } from '../pages/CostCenters';
import { CostCenterDistribution } from '../pages/CostCenterDistribution';
import { CostSettings } from '../pages/CostSettings';
import { MonthlyProductionCosts } from '../pages/MonthlyProductionCosts';
import { AssetsList } from '../pages/AssetsList';
import { AssetDetails } from '../pages/AssetDetails';
import { DepreciationReport } from '../pages/DepreciationReport';

export const COST_ROUTES: AppRouteDef[] = [
  { path: '/cost-centers', permission: 'costs.view', component: CostCenters },
  { path: '/cost-centers/:id', permission: 'costs.view', component: CostCenterDistribution },
  { path: '/cost-settings', permission: 'costs.manage', component: CostSettings },
  { path: '/monthly-costs', permission: 'costs.view', component: MonthlyProductionCosts },
  { path: '/costs/assets', permission: 'assets.view', component: AssetsList },
  { path: '/costs/assets/:id', permission: 'assets.view', component: AssetDetails },
  { path: '/costs/depreciation-report', permission: 'assets.depreciation.view', component: DepreciationReport },
];
