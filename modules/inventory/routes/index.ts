import type { AppRouteDef } from '../../shared/routes';
import { lazyNamed } from '../../shared/routes/lazyNamed';

const InventoryDashboard = lazyNamed(() => import('../pages/InventoryDashboard'), 'InventoryDashboard');
const StockBalances = lazyNamed(() => import('../pages/StockBalances'), 'StockBalances');
const StockTransactions = lazyNamed(() => import('../pages/StockTransactions'), 'StockTransactions');
const StockMovementForm = lazyNamed(() => import('../pages/StockMovementForm'), 'StockMovementForm');
const StockCounts = lazyNamed(() => import('../pages/StockCounts'), 'StockCounts');
const TransferApprovals = lazyNamed(() => import('../pages/TransferApprovals'), 'TransferApprovals');
const QuickWarehouseTransfer = lazyNamed(() => import('../pages/QuickWarehouseTransfer'), 'QuickWarehouseTransfer');
const Warehouses = lazyNamed(() => import('../pages/Warehouses'), 'Warehouses');
const WarehouseLocations = lazyNamed(() => import('../pages/WarehouseLocations'), 'WarehouseLocations');
const ProductionIssues = lazyNamed(() => import('../pages/ProductionIssues'), 'ProductionIssues');
const ProductionInventoryApprovals = lazyNamed(() => import('../pages/ProductionInventoryApprovals'), 'ProductionInventoryApprovals');
const ProductionConsumptionAnalysis = lazyNamed(() => import('../pages/ProductionConsumptionAnalysis'), 'ProductionConsumptionAnalysis');
const ProductionComponentRecords = lazyNamed(() => import('../pages/ProductionComponentRecords'), 'ProductionComponentRecords');
const Disassembly = lazyNamed(() => import('../pages/Disassembly'), 'Disassembly');
const SuppliesReceipt = lazyNamed(() => import('../pages/SuppliesReceipt'), 'SuppliesReceipt');
const DepartmentConsumables = lazyNamed(() => import('../pages/DepartmentConsumables'), 'DepartmentConsumables');
const SparePartsReplenishment = lazyNamed(() => import('../pages/SparePartsReplenishment'), 'SparePartsReplenishment');
const SparePartsCenterStock = lazyNamed(() => import('../pages/SparePartsCenterStock'), 'SparePartsCenterStock');
const SparePartsRecall = lazyNamed(() => import('../pages/SparePartsRecall'), 'SparePartsRecall');
const SparePartsPurchaseInvoice = lazyNamed(
  () => import('../pages/SparePartsPurchaseInvoice'),
  'SparePartsPurchaseInvoicePage',
);
const WarehouseWorkspace = lazyNamed(() => import('../pages/WarehouseWorkspace'), 'WarehouseWorkspace');
const ItemCard = lazyNamed(() => import('../pages/ItemCard'), 'ItemCard');
const InventoryAnalytics = lazyNamed(() => import('../pages/InventoryAnalytics'), 'InventoryAnalytics');
const InventoryExceptions = lazyNamed(() => import('../pages/InventoryExceptions'), 'InventoryExceptions');
const RawMaterialWarehouseControl = lazyNamed(
  () => import('../pages/RawMaterialWarehouseControl'),
  'RawMaterialWarehouseControl',
);
const ProductionFloorStock = lazyNamed(() => import('../pages/ProductionFloorStock'), 'ProductionFloorStock');
const RawMaterialWarehouseAlerts = lazyNamed(
  () => import('../pages/RawMaterialWarehouseAlerts'),
  'RawMaterialWarehouseAlerts',
);

export const INVENTORY_ROUTES: AppRouteDef[] = [
  { path: '/inventory', permission: 'inventory.view', component: InventoryDashboard, skeleton: 'dashboard' },
  {
    path: '/inventory/raw-materials/control',
    permission: 'inventory.view',
    component: RawMaterialWarehouseControl,
    skeleton: 'dashboard',
  },
  {
    path: '/inventory/raw-materials/alerts',
    permission: 'inventory.view',
    component: RawMaterialWarehouseAlerts,
    skeleton: 'dashboard',
  },
  {
    path: '/inventory/packaging/control',
    redirectTo: '/production/packaging/control',
  },
  {
    path: '/inventory/production-issue-requests',
    redirectTo: '/production/issue-requests',
  },
  {
    path: '/inventory/raw-materials/receive',
    permission: 'inventory.transactions.create',
    component: SuppliesReceipt,
    skeleton: 'form',
  },
  {
    path: '/inventory/department-consumables',
    permission: 'departmentConsumables.view',
    component: DepartmentConsumables,
    skeleton: 'dashboard',
  },
  {
    path: '/inventory/spare-parts-replenishment',
    permission: 'sparePartsReplenishment.view',
    component: SparePartsReplenishment,
    skeleton: 'dashboard',
  },
  {
    path: '/inventory/spare-parts-purchase',
    permission: 'inventory.transactions.create',
    component: SparePartsPurchaseInvoice,
    skeleton: 'form',
  },
  {
    path: '/inventory/spare-parts-center-stock',
    permission: 'sparePartsRecall.view',
    component: SparePartsCenterStock,
    skeleton: 'dashboard',
  },
  {
    path: '/inventory/spare-parts-recall',
    permission: 'sparePartsRecall.view',
    component: SparePartsRecall,
    skeleton: 'dashboard',
  },
  { path: '/inventory/warehouses', permission: 'inventory.view', component: Warehouses },
  {
    path: '/inventory/warehouses/:warehouseId',
    permission: 'inventory.view',
    component: WarehouseWorkspace,
    skeleton: 'dashboard',
  },
  { path: '/inventory/locations', permission: 'inventory.view', component: WarehouseLocations },
  { path: '/inventory/balances', permission: 'inventory.view', component: StockBalances },
  {
    path: '/inventory/item-card',
    permission: 'inventory.view',
    component: ItemCard,
    skeleton: 'dashboard',
  },
  { path: '/inventory/transactions', permission: 'inventory.view', component: StockTransactions },
  { path: '/inventory/production-issues', permission: 'inventory.view', component: ProductionIssues, skeleton: 'dashboard' },
  { path: '/inventory/production-floor', permission: 'inventory.view', component: ProductionFloorStock, skeleton: 'dashboard' },
  { path: '/inventory/production-approvals', permission: 'inventory.view', component: ProductionInventoryApprovals, skeleton: 'dashboard' },
  { path: '/inventory/production-consumption-analysis', permission: 'inventory.view', component: ProductionConsumptionAnalysis, skeleton: 'dashboard' },
  { path: '/inventory/production-component-records', permission: 'inventory.view', component: ProductionComponentRecords, skeleton: 'dashboard' },
  {
    path: '/quick-inventory-transfer',
    permission: 'inventory.transactions.create',
    component: QuickWarehouseTransfer,
    skeleton: 'form',
  },
  { path: '/inventory/movements', permission: 'inventory.transactions.create', component: StockMovementForm },
  { path: '/inventory/transfer-approvals', permission: 'inventory.view', component: TransferApprovals },
  { path: '/inventory/counts', permission: 'inventory.counts.manage', component: StockCounts },
  { path: '/inventory/disassembly', permission: 'inventory.disassembly.manage', component: Disassembly, skeleton: 'form' },
  { path: '/inventory/analytics', permission: 'inventory.analytics.view', component: InventoryAnalytics },
  { path: '/inventory/exceptions', permission: 'inventory.exceptions.view', component: InventoryExceptions },
];
