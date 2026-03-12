/**
 * Global Zustand Store
 * Fetches from Firestore services, caches in state,
 * exposes loading / error states, and manages real-time subscriptions.
 *
 * Dynamic RBAC: roles & permissions are stored in Firestore.
 * Email/Password authentication with user profile & isActive check.
 * Automatic activity logging on all mutations.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  ProductionLine,
  Product,
  Employee,
  ProductionReport,
  ProductionPlan,
  LineStatus,
  LineProductConfig,
  CostCenter,
  CostCenterValue,
  CostAllocation,
  LaborSettings,
  SystemSettings,
  FirestoreProduct,
  FirestoreProductionLine,
  FirestoreEmployee,
  FirestoreRole,
  FirestoreUser,
  WorkOrder,
  AppNotification,
  WorkOrderScanEvent,
  WorkOrderLiveSummary,
  ReportComponentScrapItem,
  Asset,
  AssetDepreciation,
  AssetDepreciationRunResult,
} from '../types';

import {
  signInWithEmail,
  signOut,
  createUserWithEmail,
  registerWithEmail,
  resetPassword,
  auth,
  runAssetDepreciationCallable,
} from '../services/firebase';
import { catalogProductService as productService } from '../modules/catalog/services/catalogProductService';
import { lineService } from '../modules/production/services/lineService';
import { employeeService } from '../modules/hr/employeeService';
import { qualitySettingsService } from '../modules/quality/services/qualitySettingsService';
import { reportService } from '../modules/production/services/reportService';
import { lineStatusService } from '../modules/production/services/lineStatusService';
import { lineProductConfigService } from '../modules/production/services/lineProductConfigService';
import { productionPlanService } from '../modules/production/services/productionPlanService';
import { workOrderService } from '../modules/production/services/workOrderService';
import { notificationService } from '../services/notificationService';
import { costCenterService } from '../modules/costs/services/costCenterService';
import { costCenterValueService } from '../modules/costs/services/costCenterValueService';
import { costAllocationService } from '../modules/costs/services/costAllocationService';
import { laborSettingsService } from '../modules/costs/services/laborSettingsService';
import { roleService } from '../modules/system/services/roleService';
import { userService } from '../services/userService';
import { activityLogService } from '../modules/system/services/activityLogService';
import { systemSettingsService } from '../modules/system/services/systemSettingsService';
import { scanEventService } from '../modules/production/services/scanEventService';
import { stockService } from '../modules/inventory/services/stockService';
import { transferApprovalService } from '../modules/inventory/services/transferApprovalService';
import { warehouseService } from '../modules/inventory/services/warehouseService';
import { catalogRawMaterialService as rawMaterialService } from '../modules/catalog/services/catalogRawMaterialService';
import type { StockItemBalance } from '../modules/inventory/types';
import { productMaterialService } from '../modules/production/services/productMaterialService';
import { categoryService } from '../modules/catalog/services/categoryService';
import { assetService } from '../modules/production/services/assetService';
import { assetDepreciationService } from '../modules/production/services/assetDepreciationService';
import { assetDepreciationJobService } from '../modules/production/services/assetDepreciationJobService';
import { ALL_PERMISSIONS } from '../utils/permissions';
import { DEFAULT_SYSTEM_SETTINGS } from '../utils/dashboardConfig';
import { applyTheme, setupAutoThemeListener } from '../utils/themeEngine';
import {
  buildProducts,
  buildProductionLines,
  getTodayDateString,
  getOperationalDateString,
  getMonthDateRange,
} from '../utils/calculations';
import { eventBus, SystemEvents } from '../shared/events';
import { actionTrackerService } from '../modules/system/audit';
import { useJobsStore } from '../components/background-jobs/useJobsStore';
import { REPORT_DUPLICATE_MESSAGE, getReportDuplicateMessage } from '../modules/production/utils/reportDuplicateError';

// ─── Helper: build full admin permissions map (fallback) ─────────────────────

function adminPermissions(): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  ALL_PERMISSIONS.forEach((p) => { perms[p] = true; });
  return perms;
}

function emptyPermissions(): Record<string, boolean> {
  const perms: Record<string, boolean> = {};
  ALL_PERMISSIONS.forEach((p) => { perms[p] = false; });
  return perms;
}

function isBlockedNotification(notification: AppNotification): boolean {
  const title = String(notification.title || '').trim();
  if (notification.type === 'daily_report_missing') return true;
  if (title.startsWith('متابعة تقارير المشرفين')) return true;
  return false;
}

let _cachedProductionWarehouseId: string | null = null;

async function resolveProductionWarehouseId(systemSettings: SystemSettings): Promise<string> {
  const fromSettings = systemSettings.planSettings?.defaultProductionWarehouseId?.trim() ?? '';
  if (fromSettings) return fromSettings;

  if (_cachedProductionWarehouseId) return _cachedProductionWarehouseId;

  try {
    const warehouses = await warehouseService.getAll();
    const finishedWarehouse = warehouses.find((w) => {
      const name = (w.name || '').trim().toLowerCase();
      return name === 'تم الصنع' || name.includes('تم الصنع');
    });
    if (finishedWarehouse?.id) {
      _cachedProductionWarehouseId = finishedWarehouse.id;
      return finishedWarehouse.id;
    }
  } catch {
    // keep graceful fallback to empty when warehouse module is unavailable
  }

  return '';
}

type InventoryRoutingConfig = {
  decomposedSourceWarehouseId: string;
  finishedReceiveWarehouseId: string;
  wasteReceiveWarehouseId: string;
  finalProductWarehouseId: string;
  allowNegativeDecomposedStock: boolean;
};

async function resolveInventoryRouting(systemSettings: SystemSettings): Promise<InventoryRoutingConfig> {
  const fallbackFinished = await resolveProductionWarehouseId(systemSettings);
  const plan = systemSettings.planSettings ?? ({} as any);
  return {
    decomposedSourceWarehouseId: (plan.decomposedSourceWarehouseId || '').trim(),
    finishedReceiveWarehouseId: (plan.finishedReceiveWarehouseId || '').trim() || fallbackFinished,
    wasteReceiveWarehouseId: (plan.wasteReceiveWarehouseId || '').trim(),
    finalProductWarehouseId: (plan.finalProductWarehouseId || '').trim(),
    allowNegativeDecomposedStock: Boolean(plan.allowNegativeDecomposedStock),
  };
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function resolveReportType(
  reportType?: ProductionReport['reportType'],
): NonNullable<ProductionReport['reportType']> {
  return reportType === 'component_injection' ? 'component_injection' : 'finished_product';
}

function resolveWorkOrderReportType(
  workOrderType?: WorkOrder['workOrderType'],
): NonNullable<ProductionReport['reportType']> {
  return workOrderType === 'component_injection' ? 'component_injection' : 'finished_product';
}

function isActiveWorkOrderStatus(status?: WorkOrder['status']): boolean {
  return status === 'pending' || status === 'in_progress';
}

function getSortableDateMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function pickBestAutoLinkedWorkOrder(
  workOrders: WorkOrder[],
  criteria: {
    lineId: string;
    productId: string;
    supervisorId?: string;
    reportType: NonNullable<ProductionReport['reportType']>;
  },
): WorkOrder | null {
  const filtered = workOrders.filter((wo) => (
    Boolean(wo?.id)
    && isActiveWorkOrderStatus(wo.status)
    && wo.productId === criteria.productId
    && resolveWorkOrderReportType(wo.workOrderType) === criteria.reportType
  ));
  if (filtered.length === 0) return null;

  const supervisorId = String(criteria.supervisorId || '').trim();
  const ranked = [...filtered].sort((a, b) => {
    const score = (wo: WorkOrder) => {
      let value = 0;
      if (wo.lineId === criteria.lineId) value += 8;
      if (supervisorId && wo.supervisorId === supervisorId) value += 4;
      if (wo.status === 'in_progress') value += 2;
      if (wo.status === 'pending') value += 1;
      return value;
    };
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    const targetDateDiff = String(b.targetDate || '').localeCompare(String(a.targetDate || ''));
    if (targetDateDiff !== 0) return targetDateDiff;
    const createdAtDiff = getSortableDateMs(b.createdAt) - getSortableDateMs(a.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  return ranked[0] ?? null;
}

function hasPermission(
  permissions: Record<string, boolean>,
  key: string,
): boolean {
  return permissions[key] === true;
}

function collectHiddenProductIdsFromRawWarehouse(
  balances: StockItemBalance[],
  rawMaterialWarehouseId?: string,
): Set<string> {
  const targetWarehouseId = (rawMaterialWarehouseId || '').trim();
  if (!targetWarehouseId) return new Set();
  const hiddenIds = new Set<string>();
  for (const row of balances) {
    if (row.warehouseId !== targetWarehouseId) continue;
    if (row.itemType !== 'finished_good') continue;
    if (!row.itemId) continue;
    hiddenIds.add(row.itemId);
  }
  return hiddenIds;
}

function collectHiddenProductIdsFromRawMaster(
  rawProducts: FirestoreProduct[],
  rawMaterials: Array<{ name?: string; code?: string }>,
): Set<string> {
  const rawNameSet = new Set<string>();
  const rawCodeSet = new Set<string>();

  for (const raw of rawMaterials) {
    const name = normalizeText(String(raw.name || ''));
    const code = String(raw.code || '').trim().toUpperCase();
    if (name) rawNameSet.add(name);
    if (code) rawCodeSet.add(code);
  }

  const hiddenIds = new Set<string>();
  for (const product of rawProducts) {
    if (!product.id) continue;
    const productName = normalizeText(String(product.name || ''));
    const productCode = String(product.code || '').trim().toUpperCase();
    if ((productName && rawNameSet.has(productName)) || (productCode && rawCodeSet.has(productCode))) {
      hiddenIds.add(product.id);
    }
  }
  return hiddenIds;
}

async function filterProductsByRawMaterialWarehouse(
  rawProducts: FirestoreProduct[],
  rawMaterialWarehouseId?: string,
): Promise<FirestoreProduct[]> {
  const targetWarehouseId = (rawMaterialWarehouseId || '').trim();
  try {
    const [rawMaterials, balances] = await Promise.all([
      rawMaterialService.getAll(),
      targetWarehouseId ? stockService.getBalances() : Promise.resolve([]),
    ]);

    const hiddenByMaster = collectHiddenProductIdsFromRawMaster(rawProducts, rawMaterials);
    const hiddenIds = collectHiddenProductIdsFromRawWarehouse(balances, targetWarehouseId);
    const allHiddenIds = new Set<string>([...hiddenByMaster, ...hiddenIds]);
    if (allHiddenIds.size === 0) return rawProducts;
    return rawProducts.filter((product) => !product.id || !allHiddenIds.has(product.id));
  } catch {
    // If balances cannot be loaded, fail open to avoid blocking data.
    return rawProducts;
  }
}

async function syncProductAvgDailyProduction(productId: string): Promise<void> {
  if (!productId) return;

  const reports = await reportService.getByProduct(productId);
  const productiveReports = reports.filter(
    (report) => Number(report.quantityProduced || 0) > 0 && Boolean(report.date)
  );
  const uniqueDays = new Set(productiveReports.map((report) => report.date)).size;
  const totalProduced = productiveReports.reduce(
    (sum, report) => sum + Number(report.quantityProduced || 0),
    0
  );
  const avgDailyProduction = uniqueDays > 0
    ? Number((totalProduced / uniqueDays).toFixed(2))
    : 0;

  await productService.update(productId, { avgDailyProduction });
}

async function ensureCategoryFromModel(model: string | undefined): Promise<void> {
  const name = String(model || '').trim();
  if (!name) return;
  try {
    const categories = await categoryService.getAll();
    const exists = categories.some((category) => String(category.name || '').trim() === name);
    if (!exists) {
      await categoryService.create({
        name,
        isActive: true,
      });
    }
  } catch {
    // Keep product save resilient even when category sync fails.
  }
}

// ─── State Shape ────────────────────────────────────────────────────────────

interface AppState {
  // UI-ready data (consumed by components)
  productionLines: ProductionLine[];
  products: Product[];
  employees: Employee[];

  // Raw Firestore data (used for rebuilding UI data)
  _rawProducts: FirestoreProduct[];
  _rawLines: FirestoreProductionLine[];
  _rawEmployees: FirestoreEmployee[];

  // Current logged-in employee record (resolved after login)
  currentEmployee: FirestoreEmployee | null;
  productionReports: ProductionReport[];
  todayReports: ProductionReport[];
  monthlyReports: ProductionReport[];
  lineStatuses: LineStatus[];
  lineProductConfigs: LineProductConfig[];
  productionPlans: ProductionPlan[];
  planReports: Record<string, ProductionReport[]>;

  // Work Orders & Notifications
  workOrders: WorkOrder[];
  notifications: AppNotification[];
  scanEventsToday: WorkOrderScanEvent[];
  workOrderScanEvents: WorkOrderScanEvent[];
  liveProduction: Record<string, WorkOrderLiveSummary>;

  // Cost management
  costCenters: CostCenter[];
  costCenterValues: CostCenterValue[];
  costAllocations: CostAllocation[];
  laborSettings: LaborSettings | null;
  assets: Asset[];
  assetDepreciations: AssetDepreciation[];

  // System settings (dashboard config, alert thresholds, KPI thresholds)
  systemSettings: SystemSettings;

  // Loading & error
  loading: boolean;
  productsLoading: boolean;
  linesLoading: boolean;
  reportsLoading: boolean;
  error: string | null;
  authError: string | null;

  // Auth
  isAuthenticated: boolean;
  isPendingApproval: boolean;
  uid: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  userProfile: FirestoreUser | null;

  // Dynamic RBAC
  roles: FirestoreRole[];
  userRoleId: string;
  userRoleName: string;
  userRoleColor: string;
  userPermissions: Record<string, boolean>;

  // ── Actions ──

  // Auth
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  initializeApp: () => Promise<void>;
  checkApprovalStatus: () => Promise<boolean>;

  // Admin user management
  createUser: (email: string, password: string, displayName: string, roleId: string) => Promise<string | null>;
  resetUserPassword: (email: string) => Promise<void>;

  // Role switching (updates user doc + permissions)
  switchRole: (roleId: string) => Promise<void>;

  // Roles management (admin CRUD)
  fetchRoles: () => Promise<void>;
  createRole: (data: Omit<FirestoreRole, 'id'>) => Promise<string | null>;
  updateRole: (id: string, data: Partial<Omit<FirestoreRole, 'id'>>) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;

  // Fetch (one-time)
  fetchProducts: () => Promise<void>;
  fetchLines: () => Promise<void>;
  fetchEmployees: () => Promise<void>;
  fetchReports: (startDate?: string, endDate?: string) => Promise<void>;
  fetchLineStatuses: () => Promise<void>;
  fetchLineProductConfigs: () => Promise<void>;
  fetchProductionPlans: () => Promise<void>;

  // Mutations — Products
  createProduct: (data: Omit<FirestoreProduct, 'id'>) => Promise<string | null>;
  updateProduct: (id: string, data: Partial<FirestoreProduct>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Mutations — Lines
  createLine: (data: Omit<FirestoreProductionLine, 'id'>) => Promise<string | null>;
  updateLine: (id: string, data: Partial<FirestoreProductionLine>) => Promise<void>;
  deleteLine: (id: string) => Promise<void>;

  // Mutations — Employees
  createEmployee: (data: Omit<FirestoreEmployee, 'id'>) => Promise<string | null>;
  updateEmployee: (id: string, data: Partial<FirestoreEmployee>) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;

  // Mutations — Reports
  createReport: (data: Omit<ProductionReport, 'id' | 'createdAt'>) => Promise<string | null>;
  updateReport: (id: string, data: Partial<ProductionReport>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  syncMissingProductionEntryTransfers: (
    startDate: string,
    endDate: string
  ) => Promise<{ processed: number; created: number; skipped: number; failed: number }>;
  backfillUnlinkedReportsWorkOrders: (
    startDate: string,
    endDate: string,
    options?: {
      onStart?: (totalCandidates: number) => void;
      onProgress?: (snapshot: {
        processed: number;
        total: number;
        linked: number;
        skipped: number;
        failed: number;
      }) => void;
    }
  ) => Promise<{ processed: number; linked: number; skipped: number; failed: number }>;
  unlinkReportsWorkOrdersInRange: (
    startDate: string,
    endDate: string,
    options?: {
      onStart?: (totalCandidates: number) => void;
      onProgress?: (snapshot: {
        processed: number;
        total: number;
        unlinked: number;
        skipped: number;
        failed: number;
      }) => void;
    }
  ) => Promise<{ processed: number; unlinked: number; skipped: number; failed: number }>;

  // Mutations — Line Status & Config
  updateLineStatus: (id: string, data: Partial<LineStatus>) => Promise<void>;
  createLineStatus: (data: Omit<LineStatus, 'id' | 'updatedAt'>) => Promise<string | null>;
  createLineProductConfig: (data: Omit<LineProductConfig, 'id'>) => Promise<string | null>;
  updateLineProductConfig: (id: string, data: Partial<LineProductConfig>) => Promise<void>;
  deleteLineProductConfig: (id: string) => Promise<void>;

  // Mutations — Production Plans
  createProductionPlan: (data: Omit<ProductionPlan, 'id' | 'createdAt'>) => Promise<string | null>;
  updateProductionPlan: (id: string, data: Partial<ProductionPlan>) => Promise<void>;
  deleteProductionPlan: (id: string) => Promise<void>;

  // Mutations — Work Orders
  fetchWorkOrders: () => Promise<void>;
  createWorkOrder: (data: Omit<WorkOrder, 'id' | 'createdAt'>) => Promise<string | null>;
  updateWorkOrder: (id: string, data: Partial<WorkOrder>) => Promise<void>;
  deleteWorkOrder: (id: string) => Promise<void>;

  // Notifications
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  subscribeToNotifications: () => () => void;

  // System Settings
  fetchSystemSettings: () => Promise<void>;
  updateSystemSettings: (data: SystemSettings) => Promise<void>;

  // Mutations — Cost Management
  fetchCostData: () => Promise<void>;
  createCostCenter: (data: Omit<CostCenter, 'id' | 'createdAt'>) => Promise<string | null>;
  updateCostCenter: (id: string, data: Partial<CostCenter>) => Promise<void>;
  deleteCostCenter: (id: string) => Promise<void>;
  saveCostCenterValue: (data: Omit<CostCenterValue, 'id'>, existingId?: string) => Promise<void>;
  saveCostAllocation: (data: Omit<CostAllocation, 'id'>, existingId?: string) => Promise<void>;
  updateLaborSettings: (data: Omit<LaborSettings, 'id'>) => Promise<void>;
  fetchAssets: () => Promise<void>;
  createAsset: (data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string | null>;
  updateAsset: (id: string, data: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
  fetchDepreciationReport: (period: string) => Promise<void>;
  fetchAssetDepreciations: (assetId: string) => Promise<void>;
  fetchDepreciationYear: (year: string) => Promise<void>;
  runDepreciationJob: (period?: string) => Promise<AssetDepreciationRunResult>;

  // Real-time subscriptions (return unsubscribe fn)
  subscribeToDashboard: () => () => void;
  subscribeToLineStatuses: () => () => void;
  subscribeToWorkOrders: () => () => void;
  subscribeToScanEventsToday: () => () => void;
  subscribeToWorkOrderScans: (workOrderId: string) => () => void;
  toggleBarcodeScan: (payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    serialBarcode: string;
    employeeId?: string;
    timingConfig?: {
      breakStartTime?: string;
      breakEndTime?: string;
      pauseWindows?: { startAt: any; endAt?: any; reason: 'manual' }[];
    };
  }) => Promise<{ action: 'IN' | 'OUT'; cycleSeconds?: number }>;

  // Internal helpers
  _loadAppData: () => Promise<void>;
  _rebuildProducts: () => void;
  _rebuildLines: () => void;
  _applyRole: (role: FirestoreRole) => void;
  _logActivity: (action: Parameters<typeof activityLogService.log>[2], description: string, metadata?: Record<string, any>) => void;

  // Legacy setters (backward compat)
  setProductionLines: (lines: ProductionLine[]) => void;
  setProducts: (products: Product[]) => void;
  setEmployees: (employees: Employee[]) => void;
  setLoading: (loading: boolean) => void;
}

// Flag to prevent onAuthStateChanged from running initializeApp during admin user creation
let _creatingUser = false;

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  productionLines: [],
  products: [],
  employees: [],

  _rawProducts: [],
  _rawLines: [],
  _rawEmployees: [],
  currentEmployee: null,
  productionReports: [],
  todayReports: [],
  monthlyReports: [],
  lineStatuses: [],
  lineProductConfigs: [],
  productionPlans: [],
  planReports: {},

  workOrders: [],
  notifications: [],
  scanEventsToday: [],
  workOrderScanEvents: [],
  liveProduction: {},

  costCenters: [],
  costCenterValues: [],
  costAllocations: [],
  laborSettings: null,
  assets: [],
  assetDepreciations: [],

  systemSettings: DEFAULT_SYSTEM_SETTINGS,

  loading: false,
  productsLoading: false,
  linesLoading: false,
  reportsLoading: false,
  error: null,
  authError: null,
  isAuthenticated: false,
  isPendingApproval: false,
  uid: null,
  userEmail: null,
  userDisplayName: null,
  userProfile: null,

  // Dynamic RBAC defaults (empty until login)
  roles: [],
  userRoleId: '',
  userRoleName: '',
  userRoleColor: '',
  userPermissions: emptyPermissions(),

  // ── Internal: apply a role to the store ─────────────────────────────────────

  _applyRole: (role: FirestoreRole) => {
    set({
      userRoleId: role.id!,
      userRoleName: role.name,
      userRoleColor: role.color,
      userPermissions: role.permissions,
    });
  },

  // ── Internal: log activity (fire-and-forget) ──────────────────────────────

  _logActivity: (action, description, metadata) => {
    const { uid, userEmail } = get();
    if (uid && userEmail) {
      activityLogService.log(uid, userEmail, action, description, metadata);
    }
  },

  // ── Register: Create a new user account (no role selection) ─────────────────

  register: async (email: string, password: string, displayName: string) => {
    set({ loading: true, authError: null, error: null });
    try {
      const cred = await registerWithEmail(email, password);
      const uid = cred.user.uid;

      const roles = await roleService.seedIfEmpty();
      set({ roles });

      const defaultRole = roles[roles.length - 1] ?? roles[0];
      if (!defaultRole) throw new Error('Failed to seed roles');

      await userService.set(uid, {
        email,
        displayName,
        roleId: defaultRole.id!,
        isActive: false,
        createdBy: 'self-register',
      });

      set({
        isAuthenticated: true,
        isPendingApproval: true,
        uid,
        userEmail: email,
        userDisplayName: displayName,
        userProfile: { id: uid, email, displayName, roleId: defaultRole.id!, isActive: false },
        loading: false,
      });
    } catch (error: any) {
      let msg = 'فشل إنشاء الحساب';
      if (error?.code === 'auth/email-already-in-use') {
        msg = 'البريد الإلكتروني مستخدم بالفعل. جرب تسجيل الدخول بدلاً من ذلك.';
      } else if (error?.code === 'auth/weak-password') {
        msg = 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.';
      }
      console.error('register error:', error);
      set({ authError: msg, loading: false, isAuthenticated: false });
    }
  },

  // ── Auth: Login ─────────────────────────────────────────────────────────────

  login: async (email: string, password: string) => {
    set({ loading: true, authError: null, error: null });
    try {
      const cred = await signInWithEmail(email, password);
    
      // Single bootstrap source of truth: onAuthChange -> initializeApp
      // Keep loading=true until initializeApp completes.
    } catch (error: any) {
      let msg = 'فشل تسجيل الدخول';
      if (error?.code === 'auth/user-not-found' || error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      } else if (error?.code === 'auth/too-many-requests') {
        msg = 'تم تجاوز عدد المحاولات. حاول لاحقاً.';
      }
      set({ authError: msg, loading: false, isAuthenticated: false });
    }
  },

  // ── Auth: Logout ──────────────────────────────────────────────────────────

  logout: async () => {
    const { uid, userEmail } = get();
    if (uid && userEmail) {
      activityLogService.log(uid, userEmail, 'LOGOUT', 'تسجيل خروج');
    }
    await signOut();
    useJobsStore.getState().resetUiState();
    set({
      isAuthenticated: false,
      isPendingApproval: false,
      uid: null,
      userEmail: null,
      userDisplayName: null,
      userProfile: null,
      userRoleId: '',
      userRoleName: '',
      userRoleColor: '',
      userPermissions: emptyPermissions(),
      productionLines: [],
      products: [],
      employees: [],
      _rawProducts: [],
      _rawLines: [],
      _rawEmployees: [],
      currentEmployee: null,
      productionReports: [],
      todayReports: [],
      monthlyReports: [],
      lineStatuses: [],
      lineProductConfigs: [],
      productionPlans: [],
      planReports: {},
      workOrders: [],
      notifications: [],
      scanEventsToday: [],
      workOrderScanEvents: [],
      liveProduction: {},
      costCenters: [],
      costCenterValues: [],
      costAllocations: [],
      laborSettings: null,
      assets: [],
      assetDepreciations: [],
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
      roles: [],
      error: null,
      authError: null,
    });
  },

  // ── Admin: Create User ───────────────────────────────────────────────────

  createUser: async (email, password, displayName, roleId) => {
    const { uid: newUid } = await createUserWithEmail(email, password, {
      displayName,
      roleId,
      createdBy: get().uid ?? '',
    });

    get()._logActivity('CREATE_USER', `إنشاء مستخدم: ${displayName} (${email})`, { newUid, roleId });

    return newUid;
  },

  // ── Admin: Reset Password ────────────────────────────────────────────────

  resetUserPassword: async (email: string) => {
    try {
      await resetPassword(email);
    } catch (error) {
      set({ error: 'فشل إرسال رابط إعادة تعيين كلمة المرور' });
    }
  },

  // ── App Bootstrap (called after login) ─────────────────────────────────

  initializeApp: async () => {
    // Skip during admin user creation to avoid race condition
    if (_creatingUser) return;

    if (!auth) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      set({ loading: false, isAuthenticated: false });
      return;
    }

    set({ loading: true, error: null });
    try {
      const uid = currentUser.uid;

      const roles = await roleService.seedIfEmpty();
      set({ roles });

      const userDoc = await userService.get(uid);
      if (!userDoc) {
        await signOut();
        set({
          loading: false,
          isAuthenticated: false,
          authError: 'لم يتم العثور على حساب المستخدم.',
        });
        return;
      }

      if (!userDoc.isActive) {
        set({
          isAuthenticated: true,
          isPendingApproval: true,
          uid,
          userEmail: userDoc.email,
          userDisplayName: userDoc.displayName,
          userProfile: userDoc,
          loading: false,
        });
        return;
      }

      const role = roles.find((r) => r.id === userDoc.roleId) ?? roles[0];

      set({
        isAuthenticated: true,
        isPendingApproval: false,
        uid,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
        userProfile: userDoc,
      });

      get()._applyRole(role);
      await get()._loadAppData();
      set({ loading: false });
    } catch (error) {
      console.error('initializeApp error:', error);
      set({ error: (error as Error).message, loading: false });
    }
  },

  // ── Check Approval Status (called from PendingApproval page) ────────────

  checkApprovalStatus: async () => {
    const { uid } = get();
    if (!uid) return false;
    try {
      const userDoc = await userService.get(uid);
      if (!userDoc) return false;
      if (!userDoc.isActive) return false;

      const roles = get().roles.length > 0 ? get().roles : await roleService.seedIfEmpty();
      if (roles.length > 0 && get().roles.length === 0) set({ roles });
      const role = roles.find((r) => r.id === userDoc.roleId) ?? roles[0];

      set({
        isPendingApproval: false,
        userProfile: userDoc,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
      });

      get()._applyRole(role);
      await get()._loadAppData();
      return true;
    } catch {
      return false;
    }
  },

  // ── Internal: Load all app data (after auth) ────────────────────────────

  _loadAppData: async () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [rawProducts, rawLines, rawEmployees, configs, productionPlans, workOrders, costCenters, costCenterValues, costAllocations, laborSettings, assets, assetDepreciations, systemSettingsRaw] =
      await Promise.all([
        productService.getAll(),
        lineService.getAll(),
        employeeService.getAll(),
        lineProductConfigService.getAll(),
        productionPlanService.getAll(),
        workOrderService.getAll(),
        costCenterService.getAll(),
        costCenterValueService.getAll(),
        costAllocationService.getAll(),
        laborSettingsService.get(),
        assetService.getAll(),
        assetDepreciationService.getByPeriod(currentMonth),
        systemSettingsService.get(),
      ]);

    const today = getOperationalDateString(8);
    const [todayPage, lineStatuses] = await Promise.all([
      reportService.listByDateRangePaged({ startDate: today, endDate: today, limit: 100 }),
      lineStatusService.getAll(),
    ]);
    const todayReports = todayPage.items;
    const monthlyReports: ProductionReport[] = [];

    const activePlans = productionPlans.filter(
      (p) => p.status === 'in_progress' || p.status === 'planned'
    );
    const planReports: Record<string, ProductionReport[]> = {};
        const planReportResults = await Promise.allSettled(
          activePlans.map(async (plan) => {
            const key = `${plan.lineId}_${plan.productId}`;
            const reports = await reportService.getByLineAndProduct(
              plan.lineId, plan.productId, plan.startDate
            );
            return { key, reports };
          })
        );
        planReportResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            planReports[result.value.key] = result.value.reports;
          }
        });

    const mergedSettings = systemSettingsRaw
      ? { ...DEFAULT_SYSTEM_SETTINGS, ...systemSettingsRaw }
      : DEFAULT_SYSTEM_SETTINGS;
    const filteredRawProducts = await filterProductsByRawMaterialWarehouse(
      rawProducts,
      mergedSettings.planSettings?.rawMaterialWarehouseId,
    );

    // Resolve current employee record for the logged-in user
    const uid = get().uid;
    const currentEmployee = uid
      ? rawEmployees.find((e) => e.userId === uid) ?? null
      : null;

    set({
      _rawProducts: filteredRawProducts,
      _rawLines: rawLines,
      _rawEmployees: rawEmployees,
      currentEmployee,
      lineProductConfigs: configs,
      todayReports,
      monthlyReports,
      productionReports: [],
      lineStatuses,
      productionPlans,
      planReports,
      workOrders,
      costCenters,
      costCenterValues,
      costAllocations,
      laborSettings,
      assets,
      assetDepreciations,
      systemSettings: mergedSettings,
    });

    applyTheme(mergedSettings.theme);
    setupAutoThemeListener(mergedSettings.theme);

    const allReports = todayReports;
    const products = buildProducts(rawProducts, allReports, configs);
    const productionLines = buildProductionLines(
      rawLines, rawProducts, rawEmployees, todayReports, lineStatuses, configs,
      productionPlans, planReports, workOrders
    );
    const employees: Employee[] = rawEmployees.map((e) => ({
      id: e.id!,
      name: e.name,
      departmentId: e.departmentId ?? '',
      jobPositionId: e.jobPositionId ?? '',
      level: e.level ?? 1,
      managerId: e.managerId,
      employmentType: e.employmentType ?? 'full_time',
      baseSalary: e.baseSalary ?? 0,
      hourlyRate: e.hourlyRate ?? 0,
      shiftId: e.shiftId,
      vehicleId: e.vehicleId,
      hasSystemAccess: e.hasSystemAccess ?? false,
      isActive: e.isActive !== false,
      code: e.code,
    }));

    set({ products, productionLines, employees });
  },

  // ── Role Switching ─────────────────────────────────────────────────────────

  switchRole: async (roleId: string) => {
    const { uid, roles } = get();
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;

    get()._applyRole(role);

    if (uid) {
      try {
        await userService.updateRoleId(uid, roleId);
        get()._logActivity('UPDATE_USER_ROLE', `تبديل الدور إلى: ${role.name}`, { roleId });
      } catch (error) {
        console.error('switchRole: failed to persist roleId', error);
      }
    }
  },

  // ── Roles Management ───────────────────────────────────────────────────────

  fetchRoles: async () => {
    try {
      const roles = await roleService.getAll();
      set({ roles });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createRole: async (data) => {
    try {
      const id = await roleService.create(data);
      if (id) await get().fetchRoles();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateRole: async (id, data) => {
    try {
      await roleService.update(id, data);
      await get().fetchRoles();

      if (id === get().userRoleId) {
        const fresh = await roleService.getById(id);
        if (fresh) get()._applyRole(fresh);
      }
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteRole: async (id) => {
    try {
      await roleService.delete(id);
      await get().fetchRoles();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Fetch Actions ─────────────────────────────────────────────────────────

  fetchProducts: async () => {
    set({ productsLoading: true, error: null });
    try {
      const rawProducts = await productService.getAll();
      const rawMaterialWarehouseId = get().systemSettings.planSettings?.rawMaterialWarehouseId;
      const filteredRawProducts = await filterProductsByRawMaterialWarehouse(rawProducts, rawMaterialWarehouseId);
      set({ _rawProducts: filteredRawProducts });
      get()._rebuildProducts();
      set({ productsLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, productsLoading: false });
    }
  },

  fetchLines: async () => {
    set({ linesLoading: true, error: null });
    try {
      const rawLines = await lineService.getAll();
      set({ _rawLines: rawLines });
      get()._rebuildLines();
      set({ linesLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, linesLoading: false });
    }
  },

  fetchEmployees: async () => {
    try {
      const rawEmployees = await employeeService.getAll();
      set({ _rawEmployees: rawEmployees });
      const employees: Employee[] = rawEmployees.map((e) => ({
        id: e.id!,
        name: e.name,
        departmentId: e.departmentId ?? '',
        jobPositionId: e.jobPositionId ?? '',
        level: e.level ?? 1,
        managerId: e.managerId,
        employmentType: e.employmentType ?? 'full_time',
        baseSalary: e.baseSalary ?? 0,
        hourlyRate: e.hourlyRate ?? 0,
        shiftId: e.shiftId,
        vehicleId: e.vehicleId,
        hasSystemAccess: e.hasSystemAccess ?? false,
        isActive: e.isActive !== false,
        code: e.code,
      }));
      set({ employees });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchReports: async (startDate?: string, endDate?: string) => {
    set({ reportsLoading: true, error: null });
    try {
      const today = getOperationalDateString(8);
      const from = startDate || today;
      const to = endDate || today;
      const reports: ProductionReport[] = [];
      let cursor: any = null;
      const maxPages = 5;
      for (let pageIdx = 0; pageIdx < maxPages; pageIdx += 1) {
        const page = await reportService.listByDateRangePaged({
          startDate: from,
          endDate: to,
          limit: 100,
          cursor,
        });
        reports.push(...page.items);
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      set({ productionReports: reports, reportsLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, reportsLoading: false });
    }
  },

  fetchLineStatuses: async () => {
    try {
      const lineStatuses = await lineStatusService.getAll();
      set({ lineStatuses });
      get()._rebuildLines();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchLineProductConfigs: async () => {
    try {
      const configs = await lineProductConfigService.getAll();
      set({ lineProductConfigs: configs });
      get()._rebuildProducts();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchProductionPlans: async () => {
    try {
      const productionPlans = await productionPlanService.getAll();
      const activePlans = productionPlans.filter(
        (p) => p.status === 'in_progress' || p.status === 'planned'
      );
      const planReports: Record<string, ProductionReport[]> = {};
      await Promise.all(
        activePlans.map(async (plan) => {
          const key = `${plan.lineId}_${plan.productId}`;
          planReports[key] = await reportService.getByLineAndProduct(
            plan.lineId, plan.productId, plan.startDate
          );
        })
      );
      set({ productionPlans, planReports });
      get()._rebuildLines();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Production Plan Mutations ────────────────────────────────────────────

  createProductionPlan: async (data) => {
    try {
      const planType = data.planType === 'component_injection' ? 'component_injection' : 'finished_product';
      const permissions = get().userPermissions;
      if (planType === 'finished_product' && !hasPermission(permissions, 'plans.create')) {
        const msg = 'غير مصرح بإنشاء خطة إنتاج.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (planType === 'component_injection' && !hasPermission(permissions, 'plans.componentInjection.manage')) {
        const msg = 'غير مصرح بإنشاء خطة إنتاج لمكونات الحقن.';
        set({ error: msg });
        throw new Error(msg);
      }
      const id = await productionPlanService.create({
        ...data,
        planType,
      });
      if (id) await get().fetchProductionPlans();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateProductionPlan: async (id, data) => {
    try {
      await productionPlanService.update(id, data);
      await get().fetchProductionPlans();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteProductionPlan: async (id) => {
    try {
      await productionPlanService.delete(id);
      await get().fetchProductionPlans();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Work Orders ──────────────────────────────────────────────────────────

  fetchWorkOrders: async () => {
    try {
      const workOrders = await workOrderService.getAll();
      set({ workOrders });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createWorkOrder: async (data) => {
    const { uid, userDisplayName, userEmail } = get();
    const actor = {
      userId: uid ?? undefined,
      userName: userDisplayName ?? userEmail ?? undefined,
    };
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation: 'work_order.create',
      action: 'create',
      entityType: 'work_order',
      actor,
      metadata: {
        workOrderNumber: data.workOrderNumber,
        lineId: data.lineId,
        productId: data.productId,
        quantity: data.quantity,
        status: data.status,
      },
      description: 'Create work order',
    });
    try {
      let inferredType: WorkOrder['workOrderType'] = data.workOrderType;
      if (!inferredType && data.planId) {
        const linkedPlan = await productionPlanService.getById(data.planId);
        inferredType = linkedPlan?.planType;
      }
      const workOrderType = inferredType === 'component_injection' ? 'component_injection' : 'finished_product';
      const permissions = get().userPermissions;
      if (workOrderType === 'finished_product' && !hasPermission(permissions, 'workOrders.create')) {
        const msg = 'غير مصرح بإنشاء أمر شغل.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (workOrderType === 'component_injection' && !hasPermission(permissions, 'workOrders.componentInjection.manage')) {
        const msg = 'غير مصرح بإنشاء أمر شغل لمكونات الحقن.';
        set({ error: msg });
        throw new Error(msg);
      }
      const id = await workOrderService.create({
        ...data,
        workOrderType,
      });
      trackedOperation.entityId = id ?? trackedOperation.entityId;
      trackedOperation.batchId = id ?? trackedOperation.batchId;
      if (id) {
        await get().fetchWorkOrders();
        const { _rawProducts } = get();
        const product = _rawProducts.find((p) => p.id === data.productId);
        if (data.supervisorId) {
          await notificationService.create({
            recipientId: data.supervisorId,
            type: 'work_order_assigned',
            title: 'أمر شغل جديد',
            message: `أمر شغل ${data.workOrderNumber} — ${product?.name ?? ''} — ${data.quantity} وحدة`,
            referenceId: id,
            isRead: false,
          });
        }

        const { uid, userDisplayName, userEmail } = get();
        eventBus.emit(SystemEvents.WORK_ORDER_CREATED, {
          module: 'production',
          entityType: 'work_order',
          entityId: id,
          action: 'create',
          description: 'Work order created',
          batchId: id,
          actor: {
            userId: uid ?? undefined,
            userName: userDisplayName ?? userEmail ?? undefined,
          },
          metadata: {
            workOrderNumber: data.workOrderNumber,
            lineId: data.lineId,
            productId: data.productId,
            quantity: data.quantity,
            status: data.status,
          },
        });
      }
      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          workOrderId: id ?? null,
          status: id ? 'created' : 'empty_id',
        },
      });
      return id;
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          workOrderNumber: data.workOrderNumber,
          lineId: data.lineId,
        },
      });
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateWorkOrder: async (id, data) => {
    const { uid, userDisplayName, userEmail } = get();
    const operation =
      data.status === 'completed'
        ? 'work_order.close'
        : data.status === 'in_progress'
          ? 'work_order.start'
          : 'work_order.update';
    const action =
      data.status === 'completed'
        ? 'close'
        : data.status === 'in_progress'
          ? 'start'
          : 'update';
    const actor = {
      userId: uid ?? undefined,
      userName: userDisplayName ?? userEmail ?? undefined,
    };
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation,
      action,
      entityType: 'work_order',
      entityId: id,
      batchId: id,
      actor,
      metadata: {
        status: data.status ?? null,
        supervisorId: data.supervisorId ?? null,
      },
      description: `Update work order (${operation})`,
    });
    try {
      let existing = get().workOrders.find((w) => w.id === id);
      if (data.status === 'completed' && !existing) {
        const fetched = await workOrderService.getById(id);
        if (fetched) existing = fetched;
      }
      if (data.status === 'completed' && !existing) {
        const msg = 'تعذر تحميل أمر الشغل للتحقق قبل الإغلاق.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (data.status === 'completed' && existing) {
        const latest = await scanEventService.buildWorkOrderSummary(id);
        if (latest.openSessions.length > 0) {
          const msg = `لا يمكن إغلاق أمر الشغل لوجود ${latest.openSessions.length} قطعة قيد التشغيل بدون تسجيل خروج.`;
          set({ error: msg });
          throw new Error(msg);
        }

        const closingWorkHours = Number(data.actualWorkHours ?? existing.actualWorkHours ?? 0);
        if (!Number.isFinite(closingWorkHours) || closingWorkHours <= 0) {
          const msg = 'لا يمكن إغلاق أمر الشغل بدون تسجيل ساعات العمل الفعلية.';
          set({ error: msg });
          throw new Error(msg);
        }
        const policies = await qualitySettingsService.getPolicies();
        if (
          policies.closeRequiresQualityApproval &&
          existing.qualityStatus !== 'approved' &&
          existing.qualityStatus !== 'not_required'
        ) {
          const msg = 'لا يمكن إغلاق أمر الشغل قبل اعتماد الجودة (Policy: closeRequiresQualityApproval).';
          set({
            error: msg,
          });
          throw new Error(msg);
        }
      }
      await workOrderService.update(id, data);
      await get().fetchWorkOrders();
      const updatedWorkOrder = get().workOrders.find((w) => w.id === id) ?? (existing ? { ...existing, ...data } : null);

      if (existing && data.status && data.status !== existing.status) {
        if (data.status === 'in_progress') {
          eventBus.emit(SystemEvents.PRODUCTION_STARTED, {
            module: 'production',
            entityType: 'work_order',
            entityId: id,
            action: 'start',
            description: 'Production started for work order',
            batchId: id,
            actor,
            metadata: {
              workOrderNumber: existing.workOrderNumber,
              previousStatus: existing.status,
              nextStatus: data.status,
            },
          });
        }
        if (data.status === 'completed') {
          eventBus.emit(SystemEvents.PRODUCTION_CLOSED, {
            module: 'production',
            entityType: 'work_order',
            entityId: id,
            action: 'close',
            description: 'Production closed for work order',
            batchId: id,
            actor,
            metadata: {
              workOrderNumber: existing.workOrderNumber,
              previousStatus: existing.status,
              nextStatus: data.status,
            },
          });
        }
      }

      if (data.status === 'completed' && updatedWorkOrder) {
        const existingReports = await reportService.getByWorkOrderId(id);
        if (existingReports.length === 0) {
          const toLocalDateString = (value: any): string => {
            if (!value) return getOperationalDateString(8);
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
            const dt = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
            if (Number.isNaN(dt.getTime())) return getOperationalDateString(8);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const day = String(dt.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
          };

          if (!updatedWorkOrder.supervisorId) {
            throw new Error('تعذر إنشاء تقرير الإغلاق: المشرف غير محدد في أمر الشغل.');
          }

          const autoCloseReportId = await reportService.create({
            employeeId: updatedWorkOrder.supervisorId,
            productId: updatedWorkOrder.productId,
            lineId: updatedWorkOrder.lineId,
            reportType: updatedWorkOrder.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product',
            date: toLocalDateString(updatedWorkOrder.completedAt ?? data.completedAt),
            quantityProduced: Number(
              updatedWorkOrder.actualProducedFromScans ??
              updatedWorkOrder.producedQuantity ??
              0,
            ),
            workersCount: Number(
              updatedWorkOrder.actualWorkersCount ??
              updatedWorkOrder.maxWorkers ??
              0,
            ),
            workersProductionCount: 0,
            workersPackagingCount: 0,
            workersQualityCount: 0,
            workersMaintenanceCount: 0,
            workersExternalCount: 0,
            workHours: Number(updatedWorkOrder.actualWorkHours ?? data.actualWorkHours ?? 0),
            notes: updatedWorkOrder.notes ?? '',
            workOrderId: id,
          });

          const routing = await resolveInventoryRouting(get().systemSettings);
          const product = get()._rawProducts.find((p) => p.id === updatedWorkOrder.productId);
          const actorName = get().userDisplayName || get().userEmail || 'System';
          const producedQty = Number(
            updatedWorkOrder.actualProducedFromScans ??
            updatedWorkOrder.producedQuantity ??
            0,
          );
          if (product && routing.finishedReceiveWarehouseId && producedQty > 0) {
            await stockService.createMovement({
              warehouseId: routing.finishedReceiveWarehouseId,
              itemType: 'finished_good',
              itemId: updatedWorkOrder.productId,
              itemName: product.name,
              itemCode: product.code,
              movementType: 'IN',
              quantity: producedQty,
            note: updatedWorkOrder.workOrderType === 'component_injection'
              ? `Auto component production entry from work order close ${id}`
              : `Auto from work order close ${id}`,
              createdBy: actorName,
            });
          }
          if (routing.decomposedSourceWarehouseId && producedQty > 0) {
            const [materials, rawMaterials] = await Promise.all([
              productMaterialService.getByProduct(updatedWorkOrder.productId),
              rawMaterialService.getAll(),
            ]);
            const rawById = new Map(
              rawMaterials
                .filter((rm) => Boolean(rm.id))
                .map((rm) => [String(rm.id), rm]),
            );
            const rawByName = new Map(
              rawMaterials.map((rm) => [normalizeText(rm.name), rm]),
            );
            for (const material of materials) {
              const raw =
                (material.materialId ? rawById.get(material.materialId) : undefined) ??
                rawByName.get(normalizeText(material.materialName || ''));
              if (!raw?.id) continue;
              const qtyToConsume = Number(material.quantityUsed || 0) * producedQty;
              if (qtyToConsume <= 0) continue;
              await stockService.createMovement({
                warehouseId: routing.decomposedSourceWarehouseId,
                itemType: 'raw_material',
                itemId: raw.id,
                itemName: raw.name,
                itemCode: raw.code,
                movementType: 'OUT',
                quantity: qtyToConsume,
                note: `Auto raw consumption from work order close ${id}`,
                createdBy: actorName,
                allowNegative: routing.allowNegativeDecomposedStock,
              });
            }
          }

          const today = getOperationalDateString(8);
          const { start: monthStart, end: monthEnd } = getMonthDateRange();
          const [todayReports, monthlyReports] = await Promise.all([
            reportService.getByDateRange(today, today),
            reportService.getByDateRange(monthStart, monthEnd),
          ]);
          set({ todayReports, monthlyReports, productionReports: monthlyReports });
          get()._rebuildProducts();
          get()._rebuildLines();
        }
      }

      const notificationRecipientId = data.supervisorId ?? updatedWorkOrder?.supervisorId ?? existing?.supervisorId;
      if (notificationRecipientId && data.status !== existing?.status) {
        const { _rawProducts } = get();
        const productId = updatedWorkOrder?.productId ?? existing?.productId;
        const product = _rawProducts.find((p) => p.id === productId);
        const statusLabels: Record<string, string> = { in_progress: 'بدأ التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' };
        const statusLabel = statusLabels[data.status || ''];
        if (statusLabel) {
          await notificationService.create({
            recipientId: notificationRecipientId,
            type: data.status === 'completed' ? 'work_order_completed' : 'work_order_updated',
            title: `تحديث أمر شغل — ${statusLabel}`,
            message: `أمر شغل ${existing.workOrderNumber} — ${product?.name ?? ''} — ${statusLabel}`,
            referenceId: id,
            isRead: false,
          });
        }
      }
      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          status: data.status ?? null,
          previousStatus: existing?.status ?? null,
        },
      });
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          status: data.status ?? null,
        },
      });
      set({ error: (error as Error).message });
      throw error;
    }
  },

  deleteWorkOrder: async (id) => {
    try {
      await workOrderService.delete(id);
      await get().fetchWorkOrders();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Notifications ────────────────────────────────────────────────────────

  fetchNotifications: async () => {
    try {
      const empId = get().currentEmployee?.id;
      if (!empId) return;
      const isManager = get().userPermissions['roles.manage'] === true;
      if (isManager) {
        const notifications = (await notificationService.getAll()).filter((n) => !isBlockedNotification(n));
        set({ notifications });
        return;
      }
      const notifications = (await notificationService.getByRecipient(empId)).filter((n) => !isBlockedNotification(n));
      const scopedNotifications = notifications.filter((n) => {
        if (!n.type.startsWith('work_order')) return true;
        const linkedWO = get().workOrders.find((w) => w.id === n.referenceId);
        if (!linkedWO) return n.recipientId === empId;
        return linkedWO.supervisorId === empId;
      });
      set({ notifications: scopedNotifications });
    } catch (error) {
      console.error('fetchNotifications error:', error);
    }
  },

  markNotificationRead: async (id) => {
    try {
      await notificationService.markAsRead(id);
      set({ notifications: get().notifications.map((n) => n.id === id ? { ...n, isRead: true } : n) });
    } catch (error) {
      console.error('markNotificationRead error:', error);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      const empId = get().currentEmployee?.id;
      if (!empId) return;
      await notificationService.markAllAsRead(empId);
      set({ notifications: get().notifications.map((n) => ({ ...n, isRead: true })) });
    } catch (error) {
      console.error('markAllNotificationsRead error:', error);
    }
  },

  subscribeToNotifications: () => {
    const empId = get().currentEmployee?.id;
    if (!empId) return () => {};
    const isManager = get().userPermissions['roles.manage'] === true;
    const subscribe = isManager
      ? notificationService.subscribeAll.bind(notificationService)
      : (cb: (notifications: AppNotification[]) => void) =>
          notificationService.subscribeToRecipient(empId, cb);
    return subscribe((notifications) => {
      const visibleNotifications = notifications.filter((n) => !isBlockedNotification(n));
      if (isManager) {
        set({ notifications: visibleNotifications });
        return;
      }
      const scopedNotifications = visibleNotifications.filter((n) => {
        if (!n.type.startsWith('work_order')) return true;
        const linkedWO = get().workOrders.find((w) => w.id === n.referenceId);
        if (!linkedWO) return n.recipientId === empId;
        return linkedWO.supervisorId === empId;
      });
      set({ notifications: scopedNotifications });
    });
  },

  // ── Mutations ─────────────────────────────────────────────────────────────

  createProduct: async (data) => {
    try {
      await ensureCategoryFromModel(data.model);
      const id = await productService.create(data);
      if (id) await get().fetchProducts();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateProduct: async (id, data) => {
    try {
      await ensureCategoryFromModel(data.model);
      await productService.update(id, data);
      await get().fetchProducts();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteProduct: async (id) => {
    try {
      await productService.delete(id);
      await get().fetchProducts();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Lines ──

  createLine: async (data) => {
    try {
      const id = await lineService.create(data);
      if (id) await get().fetchLines();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateLine: async (id, data) => {
    try {
      await lineService.update(id, data);
      await get().fetchLines();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteLine: async (id) => {
    try {
      await lineService.delete(id);
      await get().fetchLines();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Employees ──

  createEmployee: async (data) => {
    try {
      const id = await employeeService.create(data);
      if (id) await get().fetchEmployees();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateEmployee: async (id, data) => {
    try {
      await employeeService.update(id, data);
      await get().fetchEmployees();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteEmployee: async (id) => {
    try {
      const employees = get()._rawEmployees;
      const emp = employees.find((e) => e.id === id);
      if (emp?.userId) {
        try { await userService.delete(emp.userId); } catch { /* best effort */ }
      }
      await employeeService.delete(id);
      await get().fetchEmployees();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Reports (with automatic activity logging) ──

  createReport: async (data) => {
    let trackedOperation: ReturnType<typeof actionTrackerService.startOperation> | null = null;
    let cachedRawMaterials: Awaited<ReturnType<typeof rawMaterialService.getAll>> | null = null;
    const getRawMaterialsOnce = async () => {
      if (cachedRawMaterials) return cachedRawMaterials;
      cachedRawMaterials = await rawMaterialService.getAll();
      return cachedRawMaterials;
    };
    try {
      const reportType = resolveReportType(data.reportType);
      const permissions = get().userPermissions;
      const canCreateFinishedReports = hasPermission(permissions, 'reports.create');
      const forceInjectionOnly =
        hasPermission(permissions, 'reports.componentInjection.only') && !canCreateFinishedReports;
      const canManageComponentInjection =
        hasPermission(permissions, 'reports.componentInjection.manage') || forceInjectionOnly;
      if (reportType === 'finished_product' && (forceInjectionOnly || !canCreateFinishedReports)) {
        const msg = 'غير مصرح بإنشاء تقرير إنتاج.';
        set({ error: msg });
        return null;
      }
      if (reportType === 'component_injection' && !canManageComponentInjection) {
        const msg = 'غير مصرح بإنشاء تقرير مكونات الحقن.';
        set({ error: msg });
        return null;
      }
      if (Number(data.quantityProduced || 0) <= 0 || Number(data.workHours || 0) <= 0) {
        const msg = 'لا يمكن حفظ تقرير بدون كمية منتجة وساعات عمل.';
        set({ error: msg });
        return null;
      }
      const detailedWorkersTotal = Number(data.workersProductionCount || 0)
        + Number(data.workersPackagingCount || 0)
        + Number(data.workersQualityCount || 0)
        + Number(data.workersMaintenanceCount || 0)
        + Number(data.workersExternalCount || 0);
      if (reportType === 'finished_product' && Number(data.workersCount || 0) <= 0 && detailedWorkersTotal <= 0) {
        const msg = 'لا يمكن حفظ تقرير بدون عمالة.';
        set({ error: msg });
        return null;
      }
      const { systemSettings, laborSettings } = get();
      const planSettings = systemSettings.planSettings ?? { allowReportWithoutPlan: true, allowOverProduction: true, allowMultipleActivePlans: true };
      const componentScrapItems = (Array.isArray((data as any).componentScrapItems) ? (data as any).componentScrapItems : [])
        .map((item: ReportComponentScrapItem) => ({
          materialId: String(item?.materialId || '').trim(),
          materialName: String(item?.materialName || '').trim(),
          quantity: Number(item?.quantity || 0),
        }))
        .filter((item: { materialId: string; quantity: number }) => item.materialId && item.quantity > 0);

      const sameDayReports = await reportService.getByDateRange(data.date, data.date);
      const hasDuplicate = sameDayReports.some(
        (r) =>
          r.lineId === data.lineId &&
          r.employeeId === data.employeeId &&
          r.productId === data.productId &&
          resolveReportType(r.reportType) === reportType,
      );
      if (hasDuplicate) {
        set({ error: REPORT_DUPLICATE_MESSAGE });
        return null;
      }

      const activePlans = await productionPlanService.getActiveByLineAndProduct(data.lineId, data.productId);
      const activePlan = activePlans.find((plan) => {
        const planType = plan.planType === 'component_injection' ? 'component_injection' : 'finished_product';
        return planType === reportType;
      }) ?? activePlans[0] ?? null;

      if (!planSettings.allowReportWithoutPlan && !activePlan) {
        set({ error: 'لا يمكن إنشاء تقرير بدون خطة إنتاج نشطة لهذا الخط والمنتج' });
        return null;
      }

      if (!planSettings.allowOverProduction && activePlan) {
        if ((activePlan.producedQuantity ?? 0) >= activePlan.plannedQuantity) {
          set({ error: 'تم الوصول للكمية المخططة — الإنتاج الزائد غير مسموح' });
          return null;
        }
      }

      let activeWO: WorkOrder | null = null;
      if (data.workOrderId) {
        const selectedWO = await workOrderService.getById(data.workOrderId);
        if (
          selectedWO
          && isActiveWorkOrderStatus(selectedWO.status)
          && resolveWorkOrderReportType(selectedWO.workOrderType) === reportType
        ) {
          activeWO = selectedWO;
        }
      }
      if (!activeWO) {
        const candidateMap = new Map<string, WorkOrder>();
        const upsertCandidate = (wo: WorkOrder | null | undefined) => {
          if (!wo?.id) return;
          candidateMap.set(String(wo.id), wo);
        };

        try {
          const activeWOs = await workOrderService.getActiveByLineAndProduct(data.lineId, data.productId);
          activeWOs.forEach(upsertCandidate);
        } catch {
          // fallback to cached/all work orders when index/query fails.
        }

        const cachedActiveWOs = get().workOrders.filter((wo) => (
          isActiveWorkOrderStatus(wo.status) && wo.productId === data.productId
        ));
        cachedActiveWOs.forEach(upsertCandidate);

        if (candidateMap.size === 0) {
          const allWorkOrders = await workOrderService.getAll();
          allWorkOrders.forEach(upsertCandidate);
        }

        activeWO = pickBestAutoLinkedWorkOrder(Array.from(candidateMap.values()), {
          lineId: data.lineId,
          productId: data.productId,
          supervisorId: data.employeeId,
          reportType,
        });
      }

      const reportData = { ...data, reportType, workOrderId: activeWO?.id || data.workOrderId || '' };
      const { uid, userDisplayName, userEmail } = get();
      trackedOperation = actionTrackerService.startOperation({
        module: 'production',
        operation: 'production_report.create',
        action: 'create',
        entityType: 'production_report',
        entityId: reportData.workOrderId || undefined,
        batchId: reportData.workOrderId || undefined,
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          lineId: data.lineId,
          productId: data.productId,
          quantityProduced: data.quantityProduced,
          reportType,
          workOrderId: activeWO?.id ?? data.workOrderId ?? '',
          productionPlanId: activePlan?.id ?? '',
        },
        description: 'Create production report',
      });

      const id = await reportService.create(reportData);
      if (!id) {
        if (trackedOperation) {
          actionTrackerService.failOperation(trackedOperation, {
            error: new Error('تعذر حفظ التقرير'),
            errorCode: 'REPORT_CREATE_EMPTY_ID',
          });
        }
        set({ error: 'تعذر حفظ التقرير' });
        return null;
      }
      trackedOperation.entityId = id;
      trackedOperation.batchId = reportData.workOrderId || id;

      let postSaveWarning: string | null = null;
      const laborCost = (laborSettings?.hourlyRate ?? 0) * (data.workHours || 0) * (data.workersCount || 0);

      try {
        await syncProductAvgDailyProduction(data.productId);
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تحديث متوسط الإنتاج اليومي';
      }

      try {
        const routing = await resolveInventoryRouting(systemSettings);
        const product = get()._rawProducts.find((p) => p.id === data.productId);
        const actorName = get().userDisplayName || get().userEmail || 'System';
        const actorUserId = get().uid || undefined;
        const producedQty = Number(data.quantityProduced || 0);
        const isComponentInjection = reportType === 'component_injection';
        const rawMaterials = isComponentInjection ? await getRawMaterialsOnce() : [];
        const componentMaterial = isComponentInjection
          ? rawMaterials.find((row) => String(row.id) === String(data.productId))
          : null;
        const reportItemType: 'finished_good' | 'raw_material' = isComponentInjection ? 'raw_material' : 'finished_good';
        const reportItemName = isComponentInjection
          ? String(componentMaterial?.name || '').trim()
          : String(product?.name || '').trim();
        const reportItemCode = isComponentInjection
          ? String(componentMaterial?.code || '').trim()
          : String(product?.code || '').trim();

        const requiresFinishedApproval = systemSettings.planSettings?.requireFinishedStockApprovalForReports !== false;
        if (reportItemName && routing.finishedReceiveWarehouseId && producedQty > 0) {
          if (requiresFinishedApproval) {
            await transferApprovalService.createRequest({
              requestType: 'production_entry',
              fromWarehouseId: '__production_report__',
              fromWarehouseName: 'تقارير الإنتاج',
              toWarehouseId: routing.finishedReceiveWarehouseId,
              toWarehouseName: 'مخزن تم الصنع',
              note: isComponentInjection
                ? `Pending component production entry from report ${id}`
                : `Pending production entry from report ${id}`,
              sourceReportId: id,
              lines: [{
                itemType: reportItemType,
                itemId: data.productId,
                itemName: reportItemName,
                itemCode: reportItemCode,
                quantity: producedQty,
                minStock: isComponentInjection ? 0 : (product as any)?.minStock ?? 0,
              }],
              createdBy: actorName,
              createdByUserId: actorUserId,
            });
          } else {
            await stockService.createMovement({
              warehouseId: routing.finishedReceiveWarehouseId,
              itemType: reportItemType,
              itemId: data.productId,
              itemName: reportItemName,
              itemCode: reportItemCode,
              movementType: 'IN',
              quantity: producedQty,
              note: isComponentInjection
                ? `Auto component production entry from report ${id}`
                : `Auto from production report ${id}`,
              createdBy: actorName,
            });
          }
        }

        if (!isComponentInjection && routing.decomposedSourceWarehouseId) {
          const baseUnits = producedQty;
          if (baseUnits > 0) {
            const [materials, rawMaterials] = await Promise.all([
              productMaterialService.getByProduct(data.productId),
              getRawMaterialsOnce(),
            ]);
            const rawById = new Map(
              rawMaterials
                .filter((rm) => Boolean(rm.id))
                .map((rm) => [String(rm.id), rm]),
            );
            const rawByName = new Map(
              rawMaterials.map((rm) => [normalizeText(rm.name), rm]),
            );
            for (const material of materials) {
              const raw =
                (material.materialId ? rawById.get(material.materialId) : undefined) ??
                rawByName.get(normalizeText(material.materialName || ''));
              if (!raw?.id) continue;
              const qtyToConsume = Number(material.quantityUsed || 0) * baseUnits;
              if (qtyToConsume <= 0) continue;
              await stockService.createMovement({
                warehouseId: routing.decomposedSourceWarehouseId,
                itemType: 'raw_material',
                itemId: raw.id,
                itemName: raw.name,
                itemCode: raw.code,
                movementType: 'OUT',
                quantity: qtyToConsume,
                note: `Auto raw consumption from production report ${id}`,
                createdBy: actorName,
                allowNegative: routing.allowNegativeDecomposedStock,
              });
            }
          }
        }

        if (
          !isComponentInjection &&
          product &&
          product.autoDeductComponentScrapFromDecomposed === true &&
          routing.decomposedSourceWarehouseId &&
          routing.wasteReceiveWarehouseId &&
          componentScrapItems.length > 0
        ) {
          const rawMaterials = await getRawMaterialsOnce();
          const rawById = new Map(
            rawMaterials
              .filter((rm) => Boolean(rm.id))
              .map((rm) => [String(rm.id), rm]),
          );
          for (const scrapItem of componentScrapItems) {
            const raw = rawById.get(scrapItem.materialId);
            if (!raw?.id) continue;
            const qty = Number(scrapItem.quantity || 0);
            if (qty <= 0) continue;

            await stockService.createMovement({
              warehouseId: routing.decomposedSourceWarehouseId,
              itemType: 'raw_material',
              itemId: raw.id,
              itemName: raw.name,
              itemCode: raw.code,
              movementType: 'OUT',
              quantity: qty,
              note: `Component scrap OUT from production report ${id}`,
              createdBy: actorName,
              allowNegative: routing.allowNegativeDecomposedStock,
            });

            await stockService.createMovement({
              warehouseId: routing.wasteReceiveWarehouseId,
              itemType: 'raw_material',
              itemId: raw.id,
              itemName: raw.name,
              itemCode: raw.code,
              movementType: 'IN',
              quantity: qty,
              note: `Component scrap IN from production report ${id}`,
              createdBy: actorName,
            });
          }
        }

        if (isComponentInjection && reportItemName && routing.finishedReceiveWarehouseId && componentScrapItems.length > 0) {
          for (const scrapItem of componentScrapItems) {
            const qty = Number(scrapItem.quantity || 0);
            if (qty <= 0) continue;

            await stockService.createMovement({
              warehouseId: routing.finishedReceiveWarehouseId,
              itemType: reportItemType,
              itemId: data.productId,
              itemName: reportItemName,
              itemCode: reportItemCode,
              movementType: 'OUT',
              quantity: qty,
              note: `Component scrap OUT from production report ${id}`,
              createdBy: actorName,
            });

            if (routing.wasteReceiveWarehouseId) {
              await stockService.createMovement({
                warehouseId: routing.wasteReceiveWarehouseId,
                itemType: reportItemType,
                itemId: data.productId,
                itemName: reportItemName,
                itemCode: reportItemCode,
                movementType: 'IN',
                quantity: qty,
                note: `Component scrap IN from production report ${id}`,
                createdBy: actorName,
              });
            }
          }
        }
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تنفيذ حركات المخزون الآلية';
      }

      try {
        if (activeWO?.id) {
          await workOrderService.incrementProduced(activeWO.id, data.quantityProduced, laborCost);
          const newProduced = (activeWO.producedQuantity ?? 0) + data.quantityProduced;
          if (newProduced >= activeWO.quantity) {
            await workOrderService.update(activeWO.id, { status: 'completed', completedAt: new Date().toISOString() });
          } else if (activeWO.status === 'pending') {
            await workOrderService.update(activeWO.id, { status: 'in_progress' });
          }
        }

        if (activePlan?.id) {
          await productionPlanService.incrementProduced(activePlan.id, data.quantityProduced, laborCost);
          const newProduced = (activePlan.producedQuantity ?? 0) + data.quantityProduced;
          if (newProduced >= activePlan.plannedQuantity) {
            await productionPlanService.update(activePlan.id, { status: 'completed' });
          }
        }
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تحديث أمر الشغل أو خطة الإنتاج';
      }

      try {
        const today = getOperationalDateString(8);
        const { start: monthStart, end: monthEnd } = getMonthDateRange();
        const [todayReports, monthlyReports, workOrders] = await Promise.all([
          reportService.getByDateRange(today, today),
          reportService.getByDateRange(monthStart, monthEnd),
          workOrderService.getAll(),
        ]);
        set({ todayReports, monthlyReports, productionReports: monthlyReports, workOrders });
        get()._rebuildProducts();
        get()._rebuildLines();
        if (activePlan) await get().fetchProductionPlans();
      } catch (error) {
        postSaveWarning = (error as Error)?.message || 'تم حفظ التقرير ولكن تعذر تحديث البيانات المعروضة';
      }

      try {
        const { uid, userDisplayName, userEmail } = get();
        eventBus.emit(SystemEvents.USER_ACTION, {
          module: 'production',
          entityType: 'production_report',
          entityId: id,
          action: 'create',
          description: 'Production report created',
          actor: {
            userId: uid ?? undefined,
            userName: userDisplayName ?? userEmail ?? undefined,
          },
          metadata: {
            lineId: data.lineId,
            productId: data.productId,
            quantityProduced: data.quantityProduced,
            reportType,
            workOrderId: activeWO?.id ?? '',
            productionPlanId: activePlan?.id ?? '',
          },
        });
      } catch {
        // keep save flow resilient even if telemetry fails
      }

      if (postSaveWarning) {
        console.warn('createReport post-save warning:', postSaveWarning);
      }
      set({ error: null });
      if (trackedOperation) {
        actionTrackerService.succeedOperation(trackedOperation, {
          metadata: {
            reportId: id,
            warning: postSaveWarning ?? null,
          },
        });
      }

      return id;
    } catch (error) {
      if (trackedOperation) {
        actionTrackerService.failOperation(trackedOperation, {
          error,
          metadata: {
            lineId: data.lineId,
            productId: data.productId,
          },
        });
      }
      set({ error: getReportDuplicateMessage(error, 'تعذر حفظ التقرير') });
      return null;
    }
  },

  updateReport: async (id, data) => {
    const { uid, userDisplayName, userEmail } = get();
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation: 'production_report.update',
      action: 'update',
      entityType: 'production_report',
      entityId: id,
      actor: {
        userId: uid ?? undefined,
        userName: userDisplayName ?? userEmail ?? undefined,
      },
      metadata: {
        reportId: id,
      },
      description: 'Update production report',
    });
    try {
      const existingReport = await reportService.getById(id);
      const nextReportType = resolveReportType(data.reportType ?? existingReport?.reportType);
      const permissions = get().userPermissions;
      const canEditFinishedReports = hasPermission(permissions, 'reports.edit');
      const forceInjectionOnly =
        hasPermission(permissions, 'reports.componentInjection.only') && !canEditFinishedReports;
      const canManageComponentInjection =
        hasPermission(permissions, 'reports.componentInjection.manage') || forceInjectionOnly;
      if (nextReportType === 'finished_product' && (forceInjectionOnly || !canEditFinishedReports)) {
        const msg = 'غير مصرح بتعديل تقارير الإنتاج.';
        set({ error: msg });
        throw new Error(msg);
      }
      if (nextReportType === 'component_injection' && !canManageComponentInjection) {
        const msg = 'غير مصرح بتعديل تقرير مكونات الحقن.';
        set({ error: msg });
        throw new Error(msg);
      }
      await reportService.update(id, data);
      const affectedProductIds = new Set<string>();
      if (existingReport?.productId) affectedProductIds.add(existingReport.productId);
      if (data.productId) affectedProductIds.add(data.productId);
      await Promise.all(
        Array.from(affectedProductIds).map((productId) =>
          syncProductAvgDailyProduction(productId)
        )
      );
      const today = getOperationalDateString(8);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();

      eventBus.emit(SystemEvents.USER_ACTION, {
        module: 'production',
        entityType: 'production_report',
        entityId: id,
        action: 'update',
        description: 'Production report updated',
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          changes: data,
        },
      });

      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          reportId: id,
          changedFields: Object.keys(data || {}),
        },
      });
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          reportId: id,
        },
      });
      set({ error: (error as Error).message });
    }
  },

  deleteReport: async (id) => {
    const { uid, userDisplayName, userEmail } = get();
    const trackedOperation = actionTrackerService.startOperation({
      module: 'production',
      operation: 'production_report.delete',
      action: 'delete',
      entityType: 'production_report',
      entityId: id,
      actor: {
        userId: uid ?? undefined,
        userName: userDisplayName ?? userEmail ?? undefined,
      },
      metadata: {
        reportId: id,
      },
      description: 'Delete production report',
    });
    try {
      const reportToDelete = await reportService.getById(id);
      if (!reportToDelete) {
        throw new Error('التقرير غير موجود أو تم حذفه بالفعل.');
      }
      const actorName = get().userDisplayName || get().userEmail || 'System';
      const linkedEntryRequests = await transferApprovalService.getBySourceReportId(id);
      for (const request of linkedEntryRequests) {
        if (!request.id) continue;
        if (request.status === 'approved') {
          throw new Error('لا يمكن حذف التقرير بعد اعتماد دخول مخزن تم الصنع. قم بإلغاء الحركة أولاً من شاشة اعتماد التحويلات.');
        }
        if (request.status === 'pending') {
          await transferApprovalService.rejectRequest(
            request.id,
            actorName,
            'تم إلغاء طلب دخول تم الصنع تلقائياً بسبب حذف التقرير المصدر.',
          );
        }
      }

      const autoWarehouseId = await resolveProductionWarehouseId(get().systemSettings);
      if (autoWarehouseId && Number(reportToDelete.quantityProduced || 0) > 0) {
        const noteKey = `Auto from production report ${id}`;
        const [byNote, byLegacyReference] = await Promise.all([
          stockService.getTransactionsByNote(noteKey),
          stockService.getTransactionsByReferenceNo(`PR-${id}`),
        ]);
        const linkedRows = [...byNote, ...byLegacyReference].filter(
          (tx) =>
            tx.movementType === 'IN' &&
            tx.itemType === 'finished_good' &&
            tx.itemId === reportToDelete.productId &&
            tx.warehouseId === autoWarehouseId,
        );
        const uniqueRows = Array.from(new Map(linkedRows.map((tx) => [tx.id, tx])).values());
        for (const tx of uniqueRows) {
          try {
            await stockService.deleteMovement(tx);
          } catch (error: any) {
            throw new Error(
              error?.message ||
              'لا يمكن حذف التقرير لأن كمية الإنتاج تم سحبها من مخزن تم الصنع. احذف التحويلة أولاً لإرجاع الرصيد.',
            );
          }
        }
      }

      if (reportToDelete?.workOrderId) {
        const linkedWorkOrder = await workOrderService.getById(reportToDelete.workOrderId);
        if (linkedWorkOrder?.id) {
          const removedProduced = Math.max(0, Number(reportToDelete.quantityProduced) || 0);
          const nextProduced = Math.max(0, (linkedWorkOrder.producedQuantity ?? 0) - removedProduced);

          const nextStatus =
            nextProduced <= 0
              ? 'pending'
              : nextProduced < (linkedWorkOrder.quantity ?? 0)
                ? 'in_progress'
                : 'completed';

          await workOrderService.update(linkedWorkOrder.id, {
            producedQuantity: nextProduced,
            status: nextStatus,
            completedAt: nextStatus === 'completed' ? (linkedWorkOrder.completedAt ?? new Date().toISOString()) : null,
          });
        }
      }

      await reportService.delete(id);
      await syncProductAvgDailyProduction(reportToDelete.productId);
      const today = getOperationalDateString(8);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports, workOrders] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
        workOrderService.getAll(),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports, workOrders });
      get()._rebuildProducts();
      get()._rebuildLines();

      eventBus.emit(SystemEvents.USER_ACTION, {
        module: 'production',
        entityType: 'production_report',
        entityId: id,
        action: 'delete',
        description: 'Production report deleted',
        actor: {
          userId: uid ?? undefined,
          userName: userDisplayName ?? userEmail ?? undefined,
        },
        metadata: {
          reportId: id,
        },
      });

      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          reportId: id,
          productId: reportToDelete.productId,
        },
      });
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          reportId: id,
        },
      });
      const message = (error as Error)?.message || 'تعذر حذف التقرير.';
      set({ error: message });
      throw error;
    }
  },

  syncMissingProductionEntryTransfers: async (startDate, endDate) => {
    set({ error: null });
    let processed = 0;
    let created = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const from = String(startDate || '').trim();
      const to = String(endDate || '').trim();
      if (!from || !to) {
        throw new Error('يرجى تحديد فترة صحيحة قبل المزامنة.');
      }

      const systemSettings = get().systemSettings;
      const requiresFinishedApproval = systemSettings.planSettings?.requireFinishedStockApprovalForReports !== false;
      if (!requiresFinishedApproval) {
        return { processed: 0, created: 0, skipped: 0, failed: 0 };
      }

      const routing = await resolveInventoryRouting(systemSettings);
      if (!routing.finishedReceiveWarehouseId) {
        throw new Error('لم يتم تحديد مخزن تم الصنع في الإعدادات.');
      }

      const reports = await reportService.getByDateRange(from, to);
      const actorName = get().userDisplayName || get().userEmail || 'System';
      const actorUserId = get().uid || undefined;
      const productById = new Map(get()._rawProducts.map((p) => [String(p.id || ''), p]));

      for (const report of reports) {
        if (!report.id) continue;
        if (Number(report.quantityProduced || 0) <= 0) continue;
        processed += 1;

        try {
          const existing = await transferApprovalService.getBySourceReportId(report.id);
          const hasLinkedProductionEntry = existing.some(
            (row) => (row.requestType || 'transfer') === 'production_entry',
          );
          if (hasLinkedProductionEntry) {
            skipped += 1;
            continue;
          }

          const product = productById.get(String(report.productId || ''));
          if (!product?.id) {
            failed += 1;
            continue;
          }

          await transferApprovalService.createRequest({
            requestType: 'production_entry',
            fromWarehouseId: '__production_report__',
            fromWarehouseName: 'تقارير الإنتاج',
            toWarehouseId: routing.finishedReceiveWarehouseId,
            toWarehouseName: 'مخزن تم الصنع',
            note: `Backfill production entry from report ${report.id}`,
            sourceReportId: report.id,
            lines: [{
              itemType: 'finished_good',
              itemId: report.productId,
              itemName: product.name,
              itemCode: product.code,
              quantity: Number(report.quantityProduced || 0),
              minStock: (product as any).minStock ?? 0,
            }],
            createdBy: actorName,
            createdByUserId: actorUserId,
          });
          created += 1;
        } catch {
          failed += 1;
        }
      }

      return { processed, created, skipped, failed };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  backfillUnlinkedReportsWorkOrders: async (startDate, endDate, options) => {
    set({ error: null });
    let processed = 0;
    let linked = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const from = String(startDate || '').trim();
      const to = String(endDate || '').trim();
      if (!from || !to) {
        throw new Error('يرجى تحديد فترة صحيحة قبل ربط التقارير القديمة.');
      }

      const reports = await reportService.getByDateRange(from, to);
      const candidates = reports.filter((report) => !String(report.workOrderId || '').trim());
      options?.onStart?.(candidates.length);
      if (candidates.length === 0) {
        options?.onProgress?.({ processed: 0, total: 0, linked: 0, skipped: 0, failed: 0 });
        return { processed: 0, linked: 0, skipped: 0, failed: 0 };
      }

      const workOrders = await workOrderService.getAll();
      const workOrderById = new Map(
        workOrders
          .filter((wo) => Boolean(wo.id))
          .map((wo) => [String(wo.id), wo]),
      );
      const laborRate = Number(get().laborSettings?.hourlyRate ?? 0);

      for (const report of candidates) {
        if (!report.id) continue;
        processed += 1;
        try {
          const target = pickBestAutoLinkedWorkOrder(workOrders, {
            lineId: report.lineId,
            productId: report.productId,
            supervisorId: report.employeeId,
            reportType: resolveReportType(report.reportType),
          });
          if (!target?.id) {
            skipped += 1;
            continue;
          }

          await reportService.update(report.id, { workOrderId: target.id });

          const qty = Number(report.quantityProduced || 0);
          const workers = Number(report.workersCount || 0);
          const hours = Number(report.workHours || 0);
          const laborCost = laborRate * hours * workers;
          if (qty > 0) {
            await workOrderService.incrementProduced(target.id, qty, laborCost);
          }

          const cached = workOrderById.get(String(target.id));
          const currentProduced = Number(cached?.producedQuantity ?? target.producedQuantity ?? 0);
          const nextProduced = Math.max(0, currentProduced + qty);
          const targetQty = Number(cached?.quantity ?? target.quantity ?? 0);
          const previousStatus = cached?.status ?? target.status;
          const nextStatus: WorkOrder['status'] =
            nextProduced <= 0
              ? 'pending'
              : nextProduced >= targetQty
                ? 'completed'
                : 'in_progress';

          if (nextStatus !== previousStatus || (nextStatus === 'completed' && !(cached?.completedAt ?? target.completedAt))) {
            await workOrderService.update(target.id, {
              status: nextStatus,
              completedAt:
                nextStatus === 'completed'
                  ? (cached?.completedAt ?? target.completedAt ?? new Date().toISOString())
                  : null,
            });
          }

          if (cached) {
            cached.producedQuantity = nextProduced;
            cached.actualCost = Number(cached.actualCost || 0) + (qty > 0 ? laborCost : 0);
            cached.status = nextStatus;
            cached.completedAt =
              nextStatus === 'completed'
                ? (cached.completedAt ?? new Date().toISOString())
                : null;
          }
          linked += 1;
        } catch {
          failed += 1;
        }
        options?.onProgress?.({
          processed,
          total: candidates.length,
          linked,
          skipped,
          failed,
        });
      }

      const today = getOperationalDateString(8);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports, latestWorkOrders] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
        workOrderService.getAll(),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports, workOrders: latestWorkOrders });
      get()._rebuildProducts();
      get()._rebuildLines();

      return { processed, linked, skipped, failed };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  unlinkReportsWorkOrdersInRange: async (startDate, endDate, options) => {
    set({ error: null });
    let processed = 0;
    let unlinked = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const from = String(startDate || '').trim();
      const to = String(endDate || '').trim();
      if (!from || !to) {
        throw new Error('يرجى تحديد فترة صحيحة قبل فك الربط.');
      }

      const reports = await reportService.getByDateRange(from, to);
      const candidates = reports.filter((report) => String(report.workOrderId || '').trim());
      options?.onStart?.(candidates.length);
      if (candidates.length === 0) {
        options?.onProgress?.({ processed: 0, total: 0, unlinked: 0, skipped: 0, failed: 0 });
        return { processed: 0, unlinked: 0, skipped: 0, failed: 0 };
      }

      const laborRate = Number(get().laborSettings?.hourlyRate ?? 0);

      for (const report of candidates) {
        if (!report.id) continue;
        processed += 1;
        try {
          const reportWorkOrderId = String(report.workOrderId || '').trim();
          if (!reportWorkOrderId) {
            skipped += 1;
            options?.onProgress?.({
              processed,
              total: candidates.length,
              unlinked,
              skipped,
              failed,
            });
            continue;
          }

          const linkedWorkOrder = await workOrderService.getById(reportWorkOrderId);
          if (linkedWorkOrder?.id) {
            const removedProduced = Math.max(0, Number(report.quantityProduced) || 0);
            const removedLaborCost = Math.max(
              0,
              laborRate * Number(report.workHours || 0) * Number(report.workersCount || 0),
            );

            const nextProduced = Math.max(
              0,
              Number(linkedWorkOrder.producedQuantity || 0) - removedProduced,
            );
            const nextActualCost = Math.max(
              0,
              Number(linkedWorkOrder.actualCost || 0) - removedLaborCost,
            );
            const nextStatus: WorkOrder['status'] =
              nextProduced <= 0
                ? 'pending'
                : nextProduced >= Number(linkedWorkOrder.quantity || 0)
                  ? 'completed'
                  : 'in_progress';

            await workOrderService.update(linkedWorkOrder.id, {
              producedQuantity: nextProduced,
              actualCost: nextActualCost,
              status: nextStatus,
              completedAt:
                nextStatus === 'completed'
                  ? (linkedWorkOrder.completedAt ?? new Date().toISOString())
                  : null,
            });
          }

          await reportService.update(report.id, { workOrderId: '' });
          unlinked += 1;
        } catch {
          failed += 1;
        }

        options?.onProgress?.({
          processed,
          total: candidates.length,
          unlinked,
          skipped,
          failed,
        });
      }

      const today = getOperationalDateString(8);
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports, latestWorkOrders] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
        workOrderService.getAll(),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports, workOrders: latestWorkOrders });
      get()._rebuildProducts();
      get()._rebuildLines();

      return { processed, unlinked, skipped, failed };
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  updateLineStatus: async (id, data) => {
    try {
      await lineStatusService.update(id, data);
      await get().fetchLineStatuses();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createLineStatus: async (data) => {
    try {
      const id = await lineStatusService.create(data);
      if (id) await get().fetchLineStatuses();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  createLineProductConfig: async (data) => {
    try {
      const id = await lineProductConfigService.create(data);
      if (id) await get().fetchLineProductConfigs();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateLineProductConfig: async (id, data) => {
    try {
      await lineProductConfigService.update(id, data);
      await get().fetchLineProductConfigs();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteLineProductConfig: async (id) => {
    try {
      await lineProductConfigService.delete(id);
      await get().fetchLineProductConfigs();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Cost Management ────────────────────────────────────────────────────────

  fetchCostData: async () => {
    try {
      const [costCenters, costCenterValues, costAllocations, laborSettings] =
        await Promise.all([
          costCenterService.getAll(),
          costCenterValueService.getAll(),
          costAllocationService.getAll(),
          laborSettingsService.get(),
        ]);
      set({ costCenters, costCenterValues, costAllocations, laborSettings });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createCostCenter: async (data) => {
    try {
      const id = await costCenterService.create(data);
      if (id) await get().fetchCostData();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateCostCenter: async (id, data) => {
    try {
      await costCenterService.update(id, data);
      await get().fetchCostData();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteCostCenter: async (id) => {
    try {
      await costCenterService.delete(id);
      await get().fetchCostData();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  saveCostCenterValue: async (data, existingId) => {
    try {
      if (existingId) {
        await costCenterValueService.update(existingId, data);
      } else {
        await costCenterValueService.create(data);
      }
      const costCenterValues = await costCenterValueService.getAll();
      set({ costCenterValues });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  saveCostAllocation: async (data, existingId) => {
    try {
      if (existingId) {
        await costAllocationService.update(existingId, data);
      } else {
        await costAllocationService.create(data);
      }
      const costAllocations = await costAllocationService.getAll();
      set({ costAllocations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  updateLaborSettings: async (data) => {
    try {
      await laborSettingsService.set(data);
      const laborSettings = await laborSettingsService.get();
      set({ laborSettings });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchAssets: async () => {
    try {
      const assets = await assetService.getAll();
      set({ assets });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createAsset: async (data) => {
    try {
      const id = await assetService.create(data);
      if (id) {
        await get().fetchAssets();
      }
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateAsset: async (id, data) => {
    try {
      await assetService.update(id, data);
      await get().fetchAssets();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteAsset: async (id) => {
    try {
      await assetService.delete(id);
      await get().fetchAssets();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchDepreciationReport: async (period) => {
    try {
      const assetDepreciations = await assetDepreciationService.getByPeriod(period);
      set({ assetDepreciations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchAssetDepreciations: async (assetId) => {
    try {
      const assetDepreciations = await assetDepreciationService.getByAsset(assetId);
      set({ assetDepreciations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  fetchDepreciationYear: async (year) => {
    try {
      const assetDepreciations = await assetDepreciationService.getByYear(year);
      set({ assetDepreciations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  runDepreciationJob: async (period) => {
    try {
      let result: AssetDepreciationRunResult;
      try {
        result = await runAssetDepreciationCallable({ period });
      } catch {
        // Fallback for local/dev when callable function is not deployed.
        result = await assetDepreciationJobService.runForPeriod(period);
      }
      await Promise.all([
        get().fetchAssets(),
        get().fetchDepreciationReport(result.period),
      ]);
      return result;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // ── System Settings ──────────────────────────────────────────────────────

  fetchSystemSettings: async () => {
    try {
      const data = await systemSettingsService.get();
      if (data) {
        const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...data };
        set({ systemSettings: merged });
        await get().fetchProducts();
        applyTheme(merged.theme);
        setupAutoThemeListener(merged.theme);
      }
    } catch (error) {
      console.error('fetchSystemSettings error:', error);
    }
  },

  updateSystemSettings: async (data: SystemSettings) => {
    try {
      await systemSettingsService.set(data);
      set({ systemSettings: data });
      await get().fetchProducts();
      applyTheme(data.theme);
      setupAutoThemeListener(data.theme);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Real-time Subscriptions ───────────────────────────────────────────────

  subscribeToDashboard: () => {
    const today = getOperationalDateString(8);
    return reportService.subscribeToday(today, (reports) => {
      set({ todayReports: reports });
      get()._rebuildProducts();
      get()._rebuildLines();
    });
  },

  subscribeToLineStatuses: () => {
    return lineStatusService.subscribeAll((statuses) => {
      set({ lineStatuses: statuses });
      get()._rebuildLines();
    });
  },

  subscribeToWorkOrders: () => {
    return workOrderService.subscribeAll((orders) => {
      const validWorkOrderIds = new Set(
        orders
          .map((order) => order.id)
          .filter((id): id is string => !!id),
      );

      set((state) => {
        const liveProduction = Object.fromEntries(
          Object.entries(state.liveProduction).filter(([workOrderId]) =>
            validWorkOrderIds.has(workOrderId),
          ),
        );
        const scanEventsToday = state.scanEventsToday.filter((event) =>
          validWorkOrderIds.has(event.workOrderId),
        );

        return {
          workOrders: orders,
          liveProduction,
          scanEventsToday,
        };
      });
      get()._rebuildLines();
    });
  },

  subscribeToScanEventsToday: () => {
    const today = getOperationalDateString(8);
    return scanEventService.subscribeLiveToday(today, (events) => {
      const validWorkOrderIds = new Set(
        get().workOrders
          .map((order) => order.id)
          .filter((id): id is string => !!id),
      );
      const normalizedEvents = validWorkOrderIds.size > 0
        ? events.filter((evt) => validWorkOrderIds.has(evt.workOrderId))
        : events;

      const byWorkOrder = new Map<string, WorkOrderScanEvent[]>();
      for (const evt of normalizedEvents) {
        const arr = byWorkOrder.get(evt.workOrderId) ?? [];
        arr.push(evt);
        byWorkOrder.set(evt.workOrderId, arr);
      }

      const liveProduction: Record<string, WorkOrderLiveSummary> = {};
      byWorkOrder.forEach((workOrderEvents, workOrderId) => {
        const sessions = scanEventService.sessionsFromEvents(workOrderEvents);
        liveProduction[workOrderId] = scanEventService.summaryFromSessions(sessions);
      });

      set({ scanEventsToday: normalizedEvents, liveProduction });
    });
  },

  subscribeToWorkOrderScans: (workOrderId: string) => {
    if (!workOrderId) return () => {};
    return scanEventService.subscribeByWorkOrder(workOrderId, (events) => {
      const sessions = scanEventService.sessionsFromEvents(events);
      const summary = scanEventService.summaryFromSessions(sessions);
      set((state) => ({
        workOrderScanEvents: events,
        liveProduction: {
          ...state.liveProduction,
          [workOrderId]: summary,
        },
      }));
    });
  },

  toggleBarcodeScan: async (payload) => {
    const result = await scanEventService.toggleScan(payload);
    // Persist live scan summary on the work order itself so dashboards
    // can render produced quantity without opening scanner page first.
    try {
      const latest = await scanEventService.buildWorkOrderSummary(payload.workOrderId);
      await workOrderService.update(payload.workOrderId, {
        actualProducedFromScans: latest.summary.completedUnits || 0,
        actualWorkersCount: latest.summary.activeWorkers || 0,
        scanSummary: latest.summary,
      });
    } catch (summaryError) {
      console.error('toggleBarcodeScan summary sync failed:', summaryError);
    }
    return {
      action: result.action,
      cycleSeconds: result.cycleSeconds,
    };
  },

  // ── Internal Rebuilders ───────────────────────────────────────────────────

  _rebuildProducts: () => {
    const { _rawProducts, todayReports, productionReports, lineProductConfigs } =
      get();
    const allReports =
      productionReports.length > 0 ? productionReports : todayReports;
    const products = buildProducts(_rawProducts, allReports, lineProductConfigs);
    set({ products });
  },

  _rebuildLines: () => {
    const {
      _rawLines,
      _rawProducts,
      _rawEmployees,
      todayReports,
      lineStatuses,
      lineProductConfigs,
      productionPlans,
      planReports,
      workOrders,
    } = get();
    const productionLines = buildProductionLines(
      _rawLines,
      _rawProducts,
      _rawEmployees,
      todayReports,
      lineStatuses,
      lineProductConfigs,
      productionPlans,
      planReports,
      workOrders
    );
    set({ productionLines });
  },

  // ── Legacy Setters (kept for backward compat) ─────────────────────────────

  setProductionLines: (productionLines) => set({ productionLines }),
  setProducts: (products) => set({ products }),
  setEmployees: (employees) => set({ employees }),
  setLoading: (loading) => set({ loading }),
}));

// ─── Shallow Selector Helper (avoid unnecessary re-renders) ─────────────────

export const useShallowStore = <T>(selector: (state: AppState) => T): T =>
  useAppStore(useShallow(selector));
