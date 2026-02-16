
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
  roleId: string;
}
