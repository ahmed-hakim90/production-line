import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';

const db = getDb();

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
};

type ServiceRow = { id: string; name: string; price: number; internalCost: number; enabled: boolean };

const money = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
};

const loadActor = async (request: CallableRequest): Promise<Actor> => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data()?.isActive === false) {
    throw new HttpsError('permission-denied', 'الحساب غير صالح أو غير نشط.');
  }
  const user = userSnap.data() as Record<string, unknown>;
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    if (!roleSnap.exists || String(roleSnap.data()?.tenantId || '') !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    permissions = (roleSnap.data()?.permissions || {}) as Record<string, boolean>;
  }
  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.name || user.email || uid),
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
  };
};

const assertManage = (actor: Actor) => {
  if (!actor.isSuperAdmin && actor.permissions['repair.settings.manage'] !== true) {
    throw new HttpsError('permission-denied', 'ليس لديك صلاحية إدارة أسعار خدمات الصيانة.');
  }
};

const normalizeServices = (value: unknown): ServiceRow[] => {
  if (!Array.isArray(value) || value.length > 200) {
    throw new HttpsError('invalid-argument', 'كتالوج الخدمات غير صالح.');
  }
  const ids = new Set<string>();
  return value.map((raw, index) => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const id = String(row.id || `svc-${index + 1}`).trim().slice(0, 100);
    const name = String(row.name || '').trim().slice(0, 160);
    if (!id || !name || ids.has(id)) {
      throw new HttpsError('invalid-argument', 'معرفات وأسماء الخدمات مطلوبة ويجب ألا تتكرر.');
    }
    ids.add(id);
    return { id, name, price: money(row.price), internalCost: money(row.internalCost), enabled: row.enabled !== false };
  });
};

const legacyCatalog = async (tenantId: string): Promise<ServiceRow[]> => {
  const snap = await db.collection('system_settings').doc(tenantId).get();
  const repairSettings = (snap.data()?.repairSettings || {}) as Record<string, unknown>;
  const raw = Array.isArray(repairSettings.serviceCatalog) ? repairSettings.serviceCatalog : [];
  return normalizeServices(raw);
};

export const loadProtectedRepairServiceCatalog = async (tenantId: string) => {
  const ref = db.collection('repair_service_catalog').doc(tenantId);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as Record<string, unknown>;
    return {
      revision: Math.max(1, Number(data.revision || 1)),
      services: normalizeServices(data.services),
      source: 'protected' as const,
    };
  }
  return { revision: 0, services: await legacyCatalog(tenantId), source: 'legacy' as const };
};

export const mutateRepairServiceCatalogHandler = async (request: CallableRequest) => {
  const actor = await loadActor(request);
  assertManage(actor);
  const data = (request.data || {}) as Record<string, unknown>;
  const operation = String(data.operation || 'get');
  if (operation === 'get') {
    const catalog = await loadProtectedRepairServiceCatalog(actor.tenantId);
    return { ok: true as const, ...catalog };
  }
  if (operation !== 'save') throw new HttpsError('invalid-argument', 'عملية كتالوج غير مدعومة.');
  const services = normalizeServices(data.services);
  const ref = db.collection('repair_service_catalog').doc(actor.tenantId);
  const settingsRef = db.collection('system_settings').doc(actor.tenantId);
  const at = new Date().toISOString();
  const revision = await db.runTransaction(async (tx) => {
    const [catalogSnap, settingsSnap] = await Promise.all([tx.get(ref), tx.get(settingsRef)]);
    const nextRevision = Math.max(0, Number(catalogSnap.data()?.revision || 0)) + 1;
    tx.set(ref, {
      tenantId: actor.tenantId,
      revision: nextRevision,
      services,
      createdAt: String(catalogSnap.data()?.createdAt || at),
      createdBy: String(catalogSnap.data()?.createdBy || actor.uid),
      updatedAt: at,
      updatedBy: actor.uid,
      updatedByName: actor.displayName,
    }, { merge: true });
    if (settingsSnap.exists) {
      const settings = settingsSnap.data() as Record<string, unknown>;
      const repairSettings = (settings.repairSettings || {}) as Record<string, unknown>;
      tx.set(settingsRef, {
        repairSettings: {
          ...repairSettings,
          serviceCatalog: services.map(({ id, name, enabled }) => ({ id, name, enabled })),
        },
        updatedAt: at,
      }, { merge: true });
    }
    return nextRevision;
  });
  return { ok: true as const, revision, services };
};
