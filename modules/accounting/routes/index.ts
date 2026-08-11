import type { AppRouteDef } from "../../shared/routes";
import { lazyNamed } from "../../shared/routes/lazyNamed";

const AccountingDashboard = lazyNamed(
  () => import("../pages/AccountingDashboard"),
  "AccountingDashboard",
);
const AccountingJournals = lazyNamed(
  () => import("../pages/AccountingJournals"),
  "AccountingJournals",
);
const AccountingLedger = lazyNamed(
  () => import("../pages/AccountingLedger"),
  "AccountingLedger",
);
const AccountingTrialBalance = lazyNamed(
  () => import("../pages/AccountingTrialBalance"),
  "AccountingTrialBalance",
);
const AccountingInventoryValuation = lazyNamed(
  () => import("../pages/AccountingInventoryValuation"),
  "AccountingInventoryValuation",
);
const AccountingChartOfAccounts = lazyNamed(
  () => import("../pages/AccountingChartOfAccounts"),
  "AccountingChartOfAccounts",
);
const AccountingSettingsPage = lazyNamed(
  () => import("../pages/AccountingSettings"),
  "AccountingSettingsPage",
);
const AccountingRepairPnl = lazyNamed(
  () => import("../pages/AccountingRepairPnl"),
  "AccountingRepairPnl",
);
const AccountingCostCenters = lazyNamed(
  () => import("../pages/AccountingCostCenters"),
  "AccountingCostCenters",
);

export const ACCOUNTING_ROUTES: AppRouteDef[] = [
  {
    path: "/accounting",
    permission: "accounting.view",
    component: AccountingDashboard,
  },
  {
    path: "/accounting/journals",
    permission: "accounting.view",
    component: AccountingJournals,
  },
  {
    path: "/accounting/ledger",
    permission: "accounting.view",
    component: AccountingLedger,
  },
  {
    path: "/accounting/trial-balance",
    permission: "accounting.view",
    component: AccountingTrialBalance,
  },
  {
    path: "/accounting/repair-pnl",
    permission: "accounting.view",
    component: AccountingRepairPnl,
  },
  {
    path: "/accounting/inventory-valuation",
    permission: "accounting.inventory.view",
    component: AccountingInventoryValuation,
  },
  {
    path: "/accounting/chart",
    permission: "accounting.view",
    component: AccountingChartOfAccounts,
  },
  {
    path: "/accounting/cost-centers",
    permission: "accounting.view",
    component: AccountingCostCenters,
  },
  {
    path: "/accounting/settings",
    permission: "accounting.view",
    component: AccountingSettingsPage,
  },
];
