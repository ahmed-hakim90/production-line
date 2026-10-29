import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { auth, db, isConfigured } from '@/services/firebase';
import { activityLogService } from '@/services/activityLogService';
import { requireTenantIdOrThrow, assertSameTenant } from '@/core/auth/tenantContext';
import { checkPermission, type Permission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import type { ActivityAction } from '@/types';
import type { QualityActor } from '../model';

export const QMS_COLLECTIONS = {
  SETTINGS: 'quality_settings',
  REASONS: 'quality_reason_catalog',
  AQL_PLANS: 'quality_aql_plans',
  SLOTS: 'quality_sample_slots',
  STATIONS: 'quality_inspection_stations',
  SECTOR_TAGS: 'quality_sector_tags',
  PALLETS: 'quality_pallets',
  HOURLY_SAMPLES: 'quality_hourly_samples',
  LINE_PULLS: 'quality_line_sample_pulls',
  PERIOD_STATUSES: 'quality_line_period_statuses',
  SCRAP: 'quality_scrap_reports',
  SECOND_SORT: 'quality_second_sort_reports',
  PRINT_LOGS: 'quality_print_logs',
  SAVED_FILTERS: 'quality_saved_filters',
  WORKERS: 'quality_workers_assignments',
} as const;

export function qmsCollection(name: string): CollectionReference {
  return collection(db, name);
}

export function qmsDoc(name: string, id: string): DocumentReference {
  return doc(db, name, id);
}

export function qmsChildCollection(parent: string, parentId: string, child: string): CollectionReference {
  return collection(db, parent, parentId, child);
}

export function qmsChildDoc(parent: string, parentId: string, child: string, childId: string): DocumentReference {
  return doc(db, parent, parentId, child, childId);
}

export function requireQualityDb(): void {
  if (!isConfigured || !db) throw new Error('خدمة البيانات غير متاحة.');
}

export function currentQualityActor(): QualityActor {
  const state = useAppStore.getState();
  const user = auth?.currentUser;
  if (!user?.uid) throw new Error('يلزم تسجيل الدخول.');
  return {
    uid: user.uid,
    name: state.userDisplayName || state.currentEmployee?.name || user.email || 'مستخدم',
  };
}

export function assertQualityPermission(permission: Permission): void {
  const permissions = useAppStore.getState().userPermissions;
  if (!checkPermission(permissions, permission)) {
    throw new Error('ليست لديك صلاحية تنفيذ هذا الإجراء.');
  }
}

/** Read access follows the screen permission. `quality.print` is never enough on its own. */
export function assertAnyQualityPermission(required: Permission[]): void {
  const permissions = useAppStore.getState().userPermissions;
  if (!required.some((permission) => checkPermission(permissions, permission))) {
    throw new Error('ليست لديك صلاحية تنفيذ هذا الإجراء.');
  }
}

export function qualityUserMessage(error: unknown, fallback = 'تعذر تنفيذ العملية.'): string {
  const code = String((error as { code?: string }).code || '');
  const message = error instanceof Error ? error.message : '';
  if (code.includes('permission-denied') || message === 'Missing or insufficient permissions.') {
    return 'لا يمكن الوصول إلى بيانات الجودة. راجع الصلاحية، ثم انشر قواعد Firestore وفهرس الجودة بعد مراجعتها.';
  }
  return message || fallback;
}

export function activeTenantId(): string {
  return requireTenantIdOrThrow('تعذر تحديد الشركة الحالية.');
}

export function stampTenant<T extends Record<string, unknown>>(payload: T): T & { tenantId: string } {
  return { ...payload, tenantId: activeTenantId() };
}

export function assertQualityTenant(tenantId: string | undefined): void {
  assertSameTenant(tenantId, 'لا يمكن الوصول إلى سجل جودة لشركة أخرى.');
}

export async function auditQuality(
  action: ActivityAction,
  description: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await activityLogService.logCurrentUser(action, description, metadata);
}

export function qualityTimestamps(actor: QualityActor, creating: boolean): Record<string, unknown> {
  return {
    ...(creating ? { createdAt: serverTimestamp(), createdByUid: actor.uid, createdByName: actor.name } : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: actor.uid,
    updatedByName: actor.name,
  };
}

export async function listByTenant<T>(collectionName: string, tenantId: string): Promise<T[]> {
  requireQualityDb();
  const snap = await getDocs(query(qmsCollection(collectionName), where('tenantId', '==', tenantId)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
}

export async function listByTenantDate<T>(
  collectionName: string,
  tenantId: string,
  dateField: string,
  date: string,
): Promise<T[]> {
  requireQualityDb();
  const snap = await getDocs(query(
    qmsCollection(collectionName),
    where('tenantId', '==', tenantId),
    where(dateField, '==', date),
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
}

export async function listByTenantDateRange<T>(
  collectionName: string,
  tenantId: string,
  dateField: string,
  from: string,
  to: string,
): Promise<T[]> {
  requireQualityDb();
  const snap = await getDocs(query(
    qmsCollection(collectionName),
    where('tenantId', '==', tenantId),
    where(dateField, '>=', from),
    where(dateField, '<=', to),
  ));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as T);
}

export async function readQualityDoc<T>(collectionName: string, id: string): Promise<T & { id: string }> {
  requireQualityDb();
  const snap = await getDoc(qmsDoc(collectionName, id));
  if (!snap.exists()) throw new Error('السجل غير موجود.');
  const data = { id: snap.id, ...snap.data() } as T & { id: string; tenantId?: string };
  assertQualityTenant(data.tenantId);
  return data;
}

export { getDoc, getDocs, query, runTransaction, serverTimestamp, where, doc, collection };
