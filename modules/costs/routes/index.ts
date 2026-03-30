import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const CostCenters = lazyNamed(() => import('../pages/CostCenters'), 'CostCenters');
const CostCenterDistribution = lazyNamed(() => import('../pages/CostCenterDistribution'), 'CostCenterDistribution');
const CostSettings = lazyNamed(() => import('../pages/CostSettings'), 'CostSettings');
const MonthlyProductionCosts = lazyNamed(() => import('../pages/MonthlyProductionCosts'), 'MonthlyProductionCosts');
const AssetsList = lazyNamed(() => import('../pages/AssetsList'), 'AssetsList');
const AssetDetails = lazyNamed(() => import('../pages/AssetDetails'), 'AssetDetails');
const DepreciationReport = lazyNamed(() => import('../pages/DepreciationReport'), 'DepreciationReport');
const CostDataHealth = lazyNamed(() => import('../pages/CostDataHealth'), 'CostDataHealth');

export const COST_ROUTES: AppRouteDef[] = [
  { path: '/cost-centers', permission: 'costs.view', component: CostCenters },
  { path: '/cost-centers/:id', permission: 'costs.view', component: CostCenterDistribution },
  { path: '/cost-settings', permission: 'costs.manage', component: CostSettings },
  { path: '/monthly-costs', permission: 'costs.view', component: MonthlyProductionCosts },
  { path: '/costs/health', permission: 'costs.view', component: CostDataHealth },
  { path: '/costs/assets', permission: 'assets.view', component: AssetsList },
  { path: '/costs/assets/:id', permission: 'assets.view', component: AssetDetails },
  { path: '/costs/depreciation-report', permission: 'assets.depreciation.view', component: DepreciationReport },
];
