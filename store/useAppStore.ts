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
  Supervisor,
  ProductionReport,
  ProductionPlan,
  LineStatus,
  LineProductConfig,
  CostCenter,
  CostCenterValue,
  CostAllocation,
  LaborSettings,
  FirestoreProduct,
  FirestoreProductionLine,
  FirestoreSupervisor,
  FirestoreRole,
  FirestoreUser,
} from '../types';

import {
  signInWithEmail,
  signOut,
  createUserWithEmail,
  resetPassword,
  auth,
} from '../services/firebase';
import { productService } from '../services/productService';
import { lineService } from '../services/lineService';
import { supervisorService } from '../services/supervisorService';
import { reportService } from '../services/reportService';
import { lineStatusService } from '../services/lineStatusService';
import { lineProductConfigService } from '../services/lineProductConfigService';
import { productionPlanService } from '../services/productionPlanService';
import { costCenterService } from '../services/costCenterService';
import { costCenterValueService } from '../services/costCenterValueService';
import { costAllocationService } from '../services/costAllocationService';
import { laborSettingsService } from '../services/laborSettingsService';
import { roleService } from '../services/roleService';
import { userService } from '../services/userService';
import { activityLogService } from '../services/activityLogService';
import { ALL_PERMISSIONS } from '../utils/permissions';
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
  supervisors: Supervisor[];

  // Raw Firestore data (used for rebuilding UI data)
  _rawProducts: FirestoreProduct[];
  _rawLines: FirestoreProductionLine[];
  _rawSupervisors: FirestoreSupervisor[];
  productionReports: ProductionReport[];
  todayReports: ProductionReport[];
  monthlyReports: ProductionReport[];
  lineStatuses: LineStatus[];
  lineProductConfigs: LineProductConfig[];
  productionPlans: ProductionPlan[];
  planReports: Record<string, ProductionReport[]>;

  // Cost management
  costCenters: CostCenter[];
  costCenterValues: CostCenterValue[];
  costAllocations: CostAllocation[];
  laborSettings: LaborSettings | null;

  // Loading & error
  loading: boolean;
  productsLoading: boolean;
  linesLoading: boolean;
  reportsLoading: boolean;
  error: string | null;
  authError: string | null;

  // Auth
  isAuthenticated: boolean;
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
  fetchSupervisors: () => Promise<void>;
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

  // Mutations — Supervisors
  createSupervisor: (data: Omit<FirestoreSupervisor, 'id'>) => Promise<string | null>;
  updateSupervisor: (id: string, data: Partial<FirestoreSupervisor>) => Promise<void>;
  deleteSupervisor: (id: string) => Promise<void>;

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

  // Internal helpers
  _loadAppData: () => Promise<void>;
  _rebuildProducts: () => void;
  _rebuildLines: () => void;
  _applyRole: (role: FirestoreRole) => void;
  _logActivity: (action: Parameters<typeof activityLogService.log>[2], description: string, metadata?: Record<string, any>) => void;

  // Legacy setters (backward compat)
  setProductionLines: (lines: ProductionLine[]) => void;
  setProducts: (products: Product[]) => void;
  setSupervisors: (supervisors: Supervisor[]) => void;
  setLoading: (loading: boolean) => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  productionLines: [],
  products: [],
  supervisors: [],

  _rawProducts: [],
  _rawLines: [],
  _rawSupervisors: [],
  productionReports: [],
  todayReports: [],
  monthlyReports: [],
  lineStatuses: [],
  lineProductConfigs: [],
  productionPlans: [],
  planReports: {},

  costCenters: [],
  costCenterValues: [],
  costAllocations: [],
  laborSettings: null,

  loading: false,
  productsLoading: false,
  linesLoading: false,
  reportsLoading: false,
  error: null,
  authError: null,
  isAuthenticated: false,
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
      const cred = await createUserWithEmail(email, password);
      const uid = cred.user.uid;

      const roles = await roleService.seedIfEmpty();
      set({ roles });

      // Assign the last role (most basic — "مشرف") by default
      const defaultRole = roles[roles.length - 1] ?? roles[0];
      if (!defaultRole) throw new Error('Failed to seed roles');

      await userService.set(uid, {
        email,
        displayName,
        roleId: defaultRole.id!,
        isActive: true,
        createdBy: 'self-register',
      });

      set({
        isAuthenticated: true,
        uid,
        userEmail: email,
        userDisplayName: displayName,
        userProfile: { id: uid, email, displayName, roleId: defaultRole.id!, isActive: true },
      });

      get()._applyRole(defaultRole);
      await get()._loadAppData();

      activityLogService.log(uid, email, 'LOGIN', `إنشاء حساب جديد: ${displayName}`);

      set({ loading: false });
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

      // Fetch roles
      const roles = await roleService.seedIfEmpty();
      set({ roles });

      // Fetch user profile from Firestore
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

      // Check isActive
      if (!userDoc.isActive) {
        await signOut();
        set({
          loading: false,
          authError: 'حسابك معطل. تواصل مع مدير النظام.',
          isAuthenticated: false,
        });
        return;
      }

      // Resolve role
      const role = roles.find((r) => r.id === userDoc.roleId) ?? roles[0];

      set({
        isAuthenticated: true,
        uid,
        userEmail: userDoc.email,
        userDisplayName: userDoc.displayName,
        userProfile: userDoc,
      });

      get()._applyRole(role);

      // Load app data
      await get()._loadAppData();

      // Log login activity
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
      supervisors: [],
      _rawProducts: [],
      _rawLines: [],
      _rawSupervisors: [],
      productionReports: [],
      todayReports: [],
      monthlyReports: [],
      lineStatuses: [],
      lineProductConfigs: [],
      productionPlans: [],
      planReports: {},
      costCenters: [],
      costCenterValues: [],
      costAllocations: [],
      laborSettings: null,
      roles: [],
      error: null,
      authError: null,
    });
  },

  // ── Admin: Create User ───────────────────────────────────────────────────

  createUser: async (email, password, displayName, roleId) => {
    try {
      const cred = await createUserWithEmail(email, password);
      const newUid = cred.user.uid;

      await userService.set(newUid, {
        email,
        displayName,
        roleId,
        isActive: true,
        createdBy: get().uid ?? '',
      });

      // If creating a user logs us out of the current session (Firebase limitation),
      // we need to handle re-auth. For now, the admin should stay logged in via
      // the Firebase Auth Admin SDK approach. In client-side, creating a user with
      // createUserWithEmailAndPassword signs in as that user, so we sign back in.
      // This is handled by the caller re-authenticating if needed.

      get()._logActivity('CREATE_USER', `إنشاء مستخدم: ${displayName} (${email})`, { newUid, roleId });

      return newUid;
    } catch (error: any) {
      let msg = 'فشل إنشاء المستخدم';
      if (error?.code === 'auth/email-already-in-use') {
        msg = 'البريد الإلكتروني مستخدم بالفعل';
      }
      set({ error: msg });
      return null;
    }
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
    // Check if user is already signed in (e.g. page refresh with persistent session)
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
      if (!userDoc || !userDoc.isActive) {
        await signOut();
        set({
          loading: false,
          isAuthenticated: false,
          authError: !userDoc ? 'لم يتم العثور على حساب المستخدم.' : 'حسابك معطل.',
        });
        return;
      }

      const role = roles.find((r) => r.id === userDoc.roleId) ?? roles[0];

      set({
        isAuthenticated: true,
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

  // ── Internal: Load all app data (after auth) ────────────────────────────

  _loadAppData: async () => {
    const [rawProducts, rawLines, rawSupervisors, configs, productionPlans, costCenters, costCenterValues, costAllocations, laborSettings] =
      await Promise.all([
        productService.getAll(),
        lineService.getAll(),
        supervisorService.getAll(),
        lineProductConfigService.getAll(),
        productionPlanService.getAll(),
        costCenterService.getAll(),
        costCenterValueService.getAll(),
        costAllocationService.getAll(),
        laborSettingsService.get(),
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

    set({
      _rawProducts: rawProducts,
      _rawLines: rawLines,
      _rawSupervisors: rawSupervisors,
      lineProductConfigs: configs,
      todayReports,
      monthlyReports,
      lineStatuses,
      productionPlans,
      planReports,
      costCenters,
      costCenterValues,
      costAllocations,
      laborSettings,
    });

    const products = buildProducts(rawProducts, todayReports, configs);
    const productionLines = buildProductionLines(
      rawLines, rawProducts, rawSupervisors, todayReports, lineStatuses, configs,
      productionPlans, planReports
    );
    const supervisors: Supervisor[] = rawSupervisors.map((s) => ({
      id: s.id!,
      name: s.name,
      role: s.role ?? 'supervisor',
      isActive: s.isActive !== false,
      efficiency: 0,
      monthlyHours: 0,
      monthlyShifts: 0,
      status: 'offline' as const,
    }));

    set({ products, productionLines, supervisors });
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

  fetchSupervisors: async () => {
    try {
      const rawSupervisors = await supervisorService.getAll();
      set({ _rawSupervisors: rawSupervisors });
      const supervisors: Supervisor[] = rawSupervisors.map((s) => ({
        id: s.id!,
        name: s.name,
        role: s.role ?? 'supervisor',
        isActive: s.isActive !== false,
        efficiency: 0,
        monthlyHours: 0,
        monthlyShifts: 0,
        status: 'offline' as const,
      }));
      set({ supervisors });
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

  // ── Supervisors ──

  createSupervisor: async (data) => {
    try {
      const id = await supervisorService.create(data);
      if (id) await get().fetchSupervisors();
      return id;
    } catch (error) {
      set({ error: (error as Error).message });
      return null;
    }
  },

  updateSupervisor: async (id, data) => {
    try {
      await supervisorService.update(id, data);
      await get().fetchSupervisors();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  deleteSupervisor: async (id) => {
    try {
      await supervisorService.delete(id);
      await get().fetchSupervisors();
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  // ── Reports (with automatic activity logging) ──

  createReport: async (data) => {
    try {
      const id = await reportService.create(data);
      const today = getTodayDateString();
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
      ]);
      set({ todayReports, monthlyReports, productionReports: monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();

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
      _rawSupervisors,
      todayReports,
      lineStatuses,
      lineProductConfigs,
      productionPlans,
      planReports,
    } = get();
    const productionLines = buildProductionLines(
      _rawLines,
      _rawProducts,
      _rawSupervisors,
      todayReports,
      lineStatuses,
      lineProductConfigs,
      productionPlans,
      planReports
    );
    set({ productionLines });
  },

  // ── Legacy Setters (kept for backward compat) ─────────────────────────────

  setProductionLines: (productionLines) => set({ productionLines }),
  setProducts: (products) => set({ products }),
  setSupervisors: (supervisors) => set({ supervisors }),
  setLoading: (loading) => set({ loading }),
}));

// ─── Shallow Selector Helper (avoid unnecessary re-renders) ─────────────────

export const useShallowStore = <T>(selector: (state: AppState) => T): T =>
  useAppStore(useShallow(selector));
