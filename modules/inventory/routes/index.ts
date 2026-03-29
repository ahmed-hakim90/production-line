import type { AppRouteDef } from '../../shared/routes';
import {
  InventoryDashboard,
  StockBalances,
  StockTransactions,
  StockMovementForm,
  StockCounts,
  TransferApprovals,
  QuickWarehouseTransfer,
} from '../pages';

export const INVENTORY_ROUTES: AppRouteDef[] = [
  { path: '/inventory', permission: 'inventory.view', component: InventoryDashboard },
  { path: '/inventory/balances', permission: 'inventory.view', component: StockBalances },
  { path: '/inventory/transactions', permission: 'inventory.view', component: StockTransactions },
  { path: '/quick-inventory-transfer', permission: 'inventory.transactions.create', component: QuickWarehouseTransfer },
  { path: '/inventory/movements', permission: 'inventory.transactions.create', component: StockMovementForm },
  { path: '/inventory/transfer-approvals', permission: 'inventory.view', component: TransferApprovals },
  { path: '/inventory/counts', permission: 'inventory.counts.manage', component: StockCounts },
];
