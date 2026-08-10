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

/** Canonical cost app routes live under /accounting/* (MOD 08). */
export const COST_ROUTES: AppRouteDef[] = [
  {
    path: '/accounting/cost-centers',
    permissionsAny: ['costs.view', 'accounting.view'],
    component: CostCenters,
  },
  {
    path: '/accounting/cost-centers/:id',
    permissionsAny: ['costs.view', 'accounting.view'],
    component: CostCenterDistribution,
  },
  { path: '/accounting/cost-settings', permission: 'costs.manage', component: CostSettings },
  { path: '/accounting/monthly-costs', permission: 'costs.view', component: MonthlyProductionCosts },
  { path: '/accounting/cost-health', permission: 'costs.view', component: CostDataHealth },
  { path: '/accounting/assets', permission: 'assets.view', component: AssetsList },
  { path: '/accounting/assets/:id', permission: 'assets.view', component: AssetDetails },
  {
    path: '/accounting/depreciation-report',
    permission: 'assets.depreciation.view',
    component: DepreciationReport,
  },

  // Legacy paths → keep bookmarks/deep links working
  { path: '/cost-centers', redirectTo: '/accounting/cost-centers' },
  { path: '/cost-centers/:id', redirectTo: '/accounting/cost-centers/:id' },
  { path: '/cost-settings', redirectTo: '/accounting/cost-settings' },
  { path: '/monthly-costs', redirectTo: '/accounting/monthly-costs' },
  { path: '/costs/health', redirectTo: '/accounting/cost-health' },
  { path: '/costs/assets', redirectTo: '/accounting/assets' },
  { path: '/costs/assets/:id', redirectTo: '/accounting/assets/:id' },
  { path: '/costs/depreciation-report', redirectTo: '/accounting/depreciation-report' },
];
