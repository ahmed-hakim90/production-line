
export enum ProductionLineStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  IDLE = 'idle',
  WARNING = 'warning'
}

// ─── UI Types (consumed by components — do NOT change) ──────────────────────

export interface ProductionLine {
  id: string;
  name: string;
  code: string;
  supervisorName: string;
  status: ProductionLineStatus;
  currentProduct: string;
  achievement: number;
  target: number;
  workersCount: number;
  efficiency: number;
  hoursUsed: number;
}

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  stockLevel: number;
  stockStatus: 'available' | 'low' | 'out';
  openingStock: number;
  totalProduction: number;
  wasteUnits: number;
  avgAssemblyTime: number;
  imageUrl?: string;
}

export interface Supervisor {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  lineId?: string;
  efficiency: number;
  monthlyHours: number;
  monthlyShifts: number;
  status: 'online' | 'offline';
  imageUrl?: string;
}

// ─── Firestore Document Types (match collection schemas) ────────────────────

export interface FirestoreProduct {
  id?: string;
  name: string;
  model: string;
  code: string;
  openingBalance: number;
}

export interface FirestoreProductionLine {
  id?: string;
  name: string;
  dailyWorkingHours: number;
  maxWorkers: number;
  status: ProductionLineStatus;
}

export interface FirestoreSupervisor {
  id?: string;
  name: string;
  role?: 'supervisor' | 'hall_supervisor' | 'factory_manager' | 'admin';
  isActive?: boolean;
  /** Firebase Auth UID — links this supervisor to their login account */
  userId?: string;
  /** Email — for display (primary source of truth is in users collection) */
  email?: string;
}

// ─── Activity Log ────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_REPORT'
  | 'UPDATE_REPORT'
  | 'DELETE_REPORT'
  | 'CREATE_USER'
  | 'UPDATE_USER_ROLE'
  | 'TOGGLE_USER_ACTIVE';

export interface ActivityLog {
  id?: string;
  userId: string;
  userEmail: string;
  action: ActivityAction;
  description: string;
  metadata?: Record<string, any>;
  timestamp: any;
}

export interface LineProductConfig {
  id?: string;
  productId: string;
  lineId: string;
  standardAssemblyTime: number;
}

export interface ProductionReport {
  id?: string;
  supervisorId: string;
  productId: string;
  lineId: string;
  date: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workHours: number;
  createdAt?: any;
}

export interface LineStatus {
  id?: string;
  lineId: string;
  currentProductId: string;
  targetTodayQty: number;
  updatedAt?: any;
}

export interface ProductionPlan {
  id?: string;
  productId: string;
  lineId: string;
  plannedQuantity: number;
  startDate: string;
  status: 'planned' | 'in_progress' | 'completed' | 'paused';
  createdBy: string;
  createdAt?: any;
}

// ─── Dynamic Roles & Permissions ─────────────────────────────────────────────

/** @deprecated use FirestoreRole + dynamic permissions instead */
export type UserRole = 'admin' | 'factory_manager' | 'hall_supervisor' | 'supervisor';

export interface FirestoreRole {
  id?: string;
  name: string;
  color: string;
  permissions: Record<string, boolean>;
}

export interface FirestoreUser {
  id?: string;
  email: string;
  displayName: string;
  roleId: string;
  isActive: boolean;
  createdAt?: any;
  createdBy?: string;
}
