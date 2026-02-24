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
} from '../types';

import {
  signInWithEmail,
  signOut,
  createUserWithEmail,
  registerWithEmail,
  resetPassword,
  auth,
} from '../services/firebase';
import { productService } from '../services/productService';
import { lineService } from '../services/lineService';
import { employeeService } from '../modules/hr/employeeService';
import { reportService } from '../services/reportService';
import { lineStatusService } from '../services/lineStatusService';
import { lineProductConfigService } from '../services/lineProductConfigService';
import { productionPlanService } from '../services/productionPlanService';
import { workOrderService } from '../services/workOrderService';
import { notificationService } from '../services/notificationService';
import { costCenterService } from '../services/costCenterService';
import { costCenterValueService } from '../services/costCenterValueService';
import { costAllocationService } from '../services/costAllocationService';
import { laborSettingsService } from '../services/laborSettingsService';
import { roleService } from '../services/roleService';
import { userService } from '../services/userService';
import { activityLogService } from '../services/activityLogService';
import { systemSettingsService } from '../services/systemSettingsService';
import { scanEventService } from '../services/scanEventService';
import { ALL_PERMISSIONS } from '../utils/permissions';
import { DEFAULT_SYSTEM_SETTINGS } from '../utils/dashboardConfig';
import { applyTheme, setupAutoThemeListener } from '../utils/themeEngine';
import {
  buildProducts,
  buildProductionLines,
  getTodayDateString,
  getMonthDateRange,
} from '../utils/calculations';

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

  // Real-time subscriptions (return unsubscribe fn)
  subscribeToDashboard: () => () => void;
  subscribeToLineStatuses: () => () => void;
  subscribeToScanEventsToday: () => () => void;
  subscribeToWorkOrderScans: (workOrderId: string) => () => void;
  toggleBarcodeScan: (payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    serialBarcode: string;
    employeeId?: string;
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
      const uid = cred.user.uid;

      const roles = await roleService.seedIfEmpty();
      set({ roles });

      const userDoc = await userService.get(uid);
      if (!userDoc) {
        await signOut();
        set({
          loading: false,
          authError: 'لم يتم العثور على حساب المستخدم. تواصل مع المدير.',
          isAuthenticated: false,
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

      activityLogService.log(uid, userDoc.email, 'LOGIN', `تسجيل دخول: ${userDoc.displayName}`);

      set({ loading: false });
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
    const [rawProducts, rawLines, rawEmployees, configs, productionPlans, workOrders, costCenters, costCenterValues, costAllocations, laborSettings, systemSettingsRaw] =
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
        systemSettingsService.get(),
      ]);

    const today = getTodayDateString();
    const { start: monthStart, end: monthEnd } = getMonthDateRange();
    const [todayReports, monthlyReports, lineStatuses] = await Promise.all([
      reportService.getByDateRange(today, today),
      reportService.getByDateRange(monthStart, monthEnd),
      lineStatusService.getAll(),
    ]);

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

    const mergedSettings = systemSettingsRaw
      ? { ...DEFAULT_SYSTEM_SETTINGS, ...systemSettingsRaw }
      : DEFAULT_SYSTEM_SETTINGS;

    // Resolve current employee record for the logged-in user
    const uid = get().uid;
    const currentEmployee = uid
      ? rawEmployees.find((e) => e.userId === uid) ?? null
      : null;

    set({
      _rawProducts: rawProducts,
      _rawLines: rawLines,
      _rawEmployees: rawEmployees,
      currentEmployee,
      lineProductConfigs: configs,
      todayReports,
      monthlyReports,
      productionReports: monthlyReports,
      lineStatuses,
      productionPlans,
      planReports,
      workOrders,
      costCenters,
      costCenterValues,
      costAllocations,
      laborSettings,
      systemSettings: mergedSettings,
    });

    applyTheme(mergedSettings.theme);
    setupAutoThemeListener(mergedSettings.theme);

    const allReports = monthlyReports.length > 0 ? monthlyReports : todayReports;
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
      set({ _rawProducts: rawProducts });
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
      let reports: ProductionReport[];
      if (startDate && endDate) {
        reports = await reportService.getByDateRange(startDate, endDate);
      } else {
        reports = await reportService.getAll();
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
      const id = await productionPlanService.create(data);
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
    try {
      const id = await workOrderService.create(data);
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
      }
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateWorkOrder: async (id, data) => {
    try {
      const existing = get().workOrders.find((w) => w.id === id);
      await workOrderService.update(id, data);
      await get().fetchWorkOrders();
      if (existing?.supervisorId && data.status !== existing.status) {
        const { _rawProducts } = get();
        const product = _rawProducts.find((p) => p.id === existing.productId);
        const statusLabels: Record<string, string> = { in_progress: 'بدأ التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' };
        const statusLabel = statusLabels[data.status || ''];
        if (statusLabel) {
          await notificationService.create({
            recipientId: existing.supervisorId,
            type: data.status === 'completed' ? 'work_order_completed' : 'work_order_updated',
            title: `تحديث أمر شغل — ${statusLabel}`,
            message: `أمر شغل ${existing.workOrderNumber} — ${product?.name ?? ''} — ${statusLabel}`,
            referenceId: id,
            isRead: false,
          });
        }
      }
    } catch (error) {
      set({ error: (error as Error).message });
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
      const notifications = await notificationService.getByRecipient(empId);
      set({ notifications });
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
    return notificationService.subscribeToRecipient(empId, (notifications) => {
      set({ notifications });
    });
  },

  // ── Mutations ─────────────────────────────────────────────────────────────

  createProduct: async (data) => {
    try {
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
    try {
      const { systemSettings, laborSettings } = get();
      const planSettings = systemSettings.planSettings ?? { allowReportWithoutPlan: true, allowOverProduction: true, allowMultipleActivePlans: true };

      const activePlans = await productionPlanService.getActiveByLineAndProduct(data.lineId, data.productId);
      const activePlan = activePlans[0] ?? null;

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

      const activeWOs = await workOrderService.getActiveByLineAndProduct(data.lineId, data.productId);
      const activeWO = activeWOs[0] ?? null;

      const reportData = { ...data, workOrderId: activeWO?.id || '' };
      const id = await reportService.create(reportData);

      const laborCost = (laborSettings?.hourlyRate ?? 0) * (data.workHours || 0) * (data.workersCount || 0);

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

      const today = getTodayDateString();
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

      get()._logActivity('CREATE_REPORT', `إنشاء تقرير إنتاج جديد`, { reportId: id, ...data });

      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateReport: async (id, data) => {
    try {
      await reportService.update(id, data);
      const today = getTodayDateString();
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();

      get()._logActivity('UPDATE_REPORT', `تعديل تقرير إنتاج`, { reportId: id, changes: data });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteReport: async (id) => {
    try {
      await reportService.delete(id);
      const today = getTodayDateString();
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();

      get()._logActivity('DELETE_REPORT', `حذف تقرير إنتاج`, { reportId: id });
    } catch (error) {
      set({ error: (error as Error).message });
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

  // ── System Settings ──────────────────────────────────────────────────────

  fetchSystemSettings: async () => {
    try {
      const data = await systemSettingsService.get();
      if (data) {
        const merged = { ...DEFAULT_SYSTEM_SETTINGS, ...data };
        set({ systemSettings: merged });
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
      applyTheme(data.theme);
      setupAutoThemeListener(data.theme);
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Real-time Subscriptions ───────────────────────────────────────────────

  subscribeToDashboard: () => {
    const today = getTodayDateString();
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

  subscribeToScanEventsToday: () => {
    const today = getTodayDateString();
    return scanEventService.subscribeLiveToday(today, (events) => {
      const byWorkOrder = new Map<string, WorkOrderScanEvent[]>();
      for (const evt of events) {
        const arr = byWorkOrder.get(evt.workOrderId) ?? [];
        arr.push(evt);
        byWorkOrder.set(evt.workOrderId, arr);
      }

      const liveProduction: Record<string, WorkOrderLiveSummary> = {};
      byWorkOrder.forEach((workOrderEvents, workOrderId) => {
        const sessions = scanEventService.sessionsFromEvents(workOrderEvents);
        liveProduction[workOrderId] = scanEventService.summaryFromSessions(sessions);
      });

      set({ scanEventsToday: events, liveProduction });
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
