import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const InventoryDashboard = lazyNamed(() => import('../pages/InventoryDashboard'), 'InventoryDashboard');
const StockBalances = lazyNamed(() => import('../pages/StockBalances'), 'StockBalances');
const StockTransactions = lazyNamed(() => import('../pages/StockTransactions'), 'StockTransactions');
const StockMovementForm = lazyNamed(() => import('../pages/StockMovementForm'), 'StockMovementForm');
const StockCounts = lazyNamed(() => import('../pages/StockCounts'), 'StockCounts');
const TransferApprovals = lazyNamed(() => import('../pages/TransferApprovals'), 'TransferApprovals');
const QuickWarehouseTransfer = lazyNamed(() => import('../pages/QuickWarehouseTransfer'), 'QuickWarehouseTransfer');

export const INVENTORY_ROUTES: AppRouteDef[] = [
  { path: '/inventory', permission: 'inventory.view', component: InventoryDashboard },
  { path: '/inventory/balances', permission: 'inventory.view', component: StockBalances },
  { path: '/inventory/transactions', permission: 'inventory.view', component: StockTransactions },
  { path: '/quick-inventory-transfer', permission: 'inventory.transactions.create', component: QuickWarehouseTransfer },
  { path: '/inventory/movements', permission: 'inventory.transactions.create', component: StockMovementForm },
  { path: '/inventory/transfer-approvals', permission: 'inventory.view', component: TransferApprovals },
  { path: '/inventory/counts', permission: 'inventory.counts.manage', component: StockCounts },
];
