/**
 * Global Zustand Store
 * Fetches from Firestore services, caches in state,
 * exposes loading / error states, and manages real-time subscriptions.
 *
 * Dynamic RBAC: roles & permissions are stored in Firestore.
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  ProductionLine,
  Product,
  Supervisor,
  ProductionReport,
  LineStatus,
  LineProductConfig,
  FirestoreProduct,
  FirestoreProductionLine,
  FirestoreSupervisor,
  FirestoreRole,
} from '../types';

import { authenticateAnonymously } from '../services/firebase';
import { productService } from '../services/productService';
import { lineService } from '../services/lineService';
import { supervisorService } from '../services/supervisorService';
import { reportService } from '../services/reportService';
import { lineStatusService } from '../services/lineStatusService';
import { lineProductConfigService } from '../services/lineProductConfigService';
import { roleService, DEFAULT_ROLES } from '../services/roleService';
import { userService } from '../services/userService';
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

  // Loading & error
  loading: boolean;
  productsLoading: boolean;
  linesLoading: boolean;
  reportsLoading: boolean;
  error: string | null;

  // Auth
  isAuthenticated: boolean;
  uid: string | null;

  // Dynamic RBAC
  roles: FirestoreRole[];
  userRoleId: string;
  userRoleName: string;
  userRoleColor: string;
  userPermissions: Record<string, boolean>;

  // ── Actions ──

  // App bootstrap
  initializeApp: () => Promise<void>;

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

  // Real-time subscriptions (return unsubscribe fn)
  subscribeToDashboard: () => () => void;
  subscribeToLineStatuses: () => () => void;

  // Internal helpers
  _rebuildProducts: () => void;
  _rebuildLines: () => void;
  _applyRole: (role: FirestoreRole) => void;

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

  loading: false,
  productsLoading: false,
  linesLoading: false,
  reportsLoading: false,
  error: null,
  isAuthenticated: false,
  uid: null,

  // Dynamic RBAC defaults (full admin until Firestore loads)
  roles: [],
  userRoleId: '',
  userRoleName: 'مدير النظام',
  userRoleColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  userPermissions: adminPermissions(),

  // ── Internal: apply a role to the store ─────────────────────────────────────

  _applyRole: (role: FirestoreRole) => {
    set({
      userRoleId: role.id!,
      userRoleName: role.name,
      userRoleColor: role.color,
      userPermissions: role.permissions,
    });
  },

  // ── App Bootstrap ─────────────────────────────────────────────────────────

  initializeApp: async () => {
    set({ loading: true, error: null });
    try {
      // 1. Anonymous auth
      const uid = await authenticateAnonymously();
      set({ isAuthenticated: !!uid, uid });

      // 2. Seed default roles if needed + fetch all roles
      const roles = await roleService.seedIfEmpty();
      set({ roles });

      // 3. Get or create user document → resolve role
      if (uid && roles.length > 0) {
        let userDoc = await userService.get(uid);
        if (!userDoc) {
          const adminRole = roles[0];
          await userService.set(uid, { roleId: adminRole.id! });
          userDoc = { id: uid, roleId: adminRole.id! };
        }

        const role = roles.find((r) => r.id === userDoc!.roleId) ?? roles[0];
        get()._applyRole(role);
      }

      // 4. Parallel fetch of all base collections
      const [rawProducts, rawLines, rawSupervisors, configs] =
        await Promise.all([
          productService.getAll(),
          lineService.getAll(),
          supervisorService.getAll(),
          lineProductConfigService.getAll(),
        ]);

      // 5. Fetch today's reports & monthly reports
      const today = getTodayDateString();
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports, lineStatuses] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
        lineStatusService.getAll(),
      ]);

      // 6. Store raw data
      set({
        _rawProducts: rawProducts,
        _rawLines: rawLines,
        _rawSupervisors: rawSupervisors,
        lineProductConfigs: configs,
        todayReports,
        monthlyReports,
        lineStatuses,
      });

      // 7. Build UI data
      const products = buildProducts(rawProducts, todayReports, configs);
      const productionLines = buildProductionLines(
        rawLines,
        rawProducts,
        rawSupervisors,
        todayReports,
        lineStatuses,
        configs
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

      set({
        products,
        productionLines,
        supervisors,
        loading: false,
      });
    } catch (error) {
      console.error('initializeApp error:', error);
      set({ error: (error as Error).message, loading: false });
    }
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

      // If the updated role is the current user's role, refresh permissions
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

  // ── Reports ──

  createReport: async (data) => {
    try {
      const id = await reportService.create(data);
      const today = getTodayDateString();
      const { start: monthStart, end: monthEnd } = getMonthDateRange();
      const [todayReports, monthlyReports] = await Promise.all([
        reportService.getByDateRange(today, today),
        reportService.getByDateRange(monthStart, monthEnd),
      ]);
      set({ todayReports, monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();
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
      set({ todayReports, monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();
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
      set({ todayReports, monthlyReports });
      get()._rebuildProducts();
      get()._rebuildLines();
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
    } = get();
    const productionLines = buildProductionLines(
      _rawLines,
      _rawProducts,
      _rawSupervisors,
      todayReports,
      lineStatuses,
      lineProductConfigs
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
