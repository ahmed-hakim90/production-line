import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';

const db = getDb();

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
  repairBranchIds: string[];
  inventoryWarehouseId: string;
};

const roundQty = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 10000) / 10000;
};

const hasPerm = (actor: Actor, keys: string[]) =>
  actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true);

const resolveActor = async (request: CallableRequest): Promise<Actor> => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as Record<string, unknown>;
  if (user.isActive === false && user.isSuperAdmin !== true) {
    throw new HttpsError('permission-denied', 'الحساب غير مفعّل.');
  }
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا يوجد مستأجر مرتبط بالحساب.');

  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    if (roleSnap.exists) {
      const role = roleSnap.data() as { tenantId?: string; permissions?: Record<string, boolean> };
      if (String(role.tenantId || '').trim() === tenantId) {
        permissions = role.permissions || {};
      }
    }
  }

  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.email || uid).trim() || uid,
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
    repairBranchIds: Array.from(new Set([
      ...(Array.isArray(user.repairBranchIds) ? user.repairBranchIds : []),
      String(user.repairBranchId || ''),
    ].map((id) => String(id || '').trim()).filter(Boolean))),
    inventoryWarehouseId: String(user.inventoryWarehouseId || '').trim(),
  };
};

const nextSparePartCode = (codes: string[]) => {
  const maxSerial = codes.reduce((max, code) => {
    const match = String(code || '').trim().toUpperCase().match(/^SP-(\d{3})$/);
    if (!match) return max;
    const current = Number(match[1] || 0);
    return Number.isFinite(current) ? Math.max(max, current) : max;
  }, 0);
  return `SP-${String(maxSerial + 1).padStart(3, '0')}`;
};

const stockDocId = (branchId: string, warehouseId: string, partId: string) =>
  `${branchId}__${warehouseId}__${partId}`;

/**
 * Mirror inventory SoT (`stock_items`) into the repair center catalog + ledger.
 * Allowed for center managers (`repair.parts.manage`) — this is not free-hand +/-.
 */
export const syncRepairCenterCatalogFromInventory = onCall(
  { region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 },
  async (request) => {
    const actor = await resolveActor(request);
    if (!hasPerm(actor, [
      'repair.parts.manage',
      'repair.parts.stockAdjust',
      'inventory.counts.manage',
      'repair.adminDashboard.view',
      'repair.branches.manage',
    ])) {
      throw new HttpsError('permission-denied', 'ليس لديك صلاحية مزامنة كتالوج المركز.');
    }

    const data = (request.data || {}) as Record<string, unknown>;
    const branchId = String(data.branchId || '').trim();
    const warehouseId = String(data.warehouseId || '').trim();
    if (!branchId || !warehouseId) {
      throw new HttpsError('invalid-argument', 'الفرع والمخزن مطلوبان.');
    }

    const branchSnap = await db.collection('repair_branches').doc(branchId).get();
    if (!branchSnap.exists || String(branchSnap.data()?.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('not-found', 'فرع الصيانة غير موجود.');
    }
    const branchWarehouseId = String(branchSnap.data()?.warehouseId || '').trim();
    if (branchWarehouseId !== warehouseId) {
      throw new HttpsError('failed-precondition', 'المخزن غير مربوط بهذا الفرع.');
    }

    const canAllBranches = hasPerm(actor, [
      'repair.branches.manage',
      'repair.callCenter.viewAll',
      'repair.adminDashboard.view',
    ]);
    if (
      !canAllBranches
      && !actor.repairBranchIds.includes(branchId)
      && actor.inventoryWarehouseId !== warehouseId
    ) {
      throw new HttpsError('permission-denied', 'هذا الفرع خارج نطاق صلاحياتك.');
    }

    const warehouseSnap = await db.collection('warehouses').doc(warehouseId).get();
    if (!warehouseSnap.exists || String(warehouseSnap.data()?.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('not-found', 'المخزن غير موجود.');
    }
    const warehouseName = String(
      data.warehouseName || warehouseSnap.data()?.name || `مخزن ${branchSnap.data()?.name || branchId}`,
    ).trim();

    const balancesSnap = await db.collection('stock_items')
      .where('tenantId', '==', actor.tenantId)
      .where('warehouseId', '==', warehouseId)
      .limit(2000)
      .get();

    const materialBalances = balancesSnap.docs
      .map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          itemType: String(data.itemType || ''),
          itemId: String(data.itemId || ''),
          itemName: String(data.itemName || ''),
          itemCode: String(data.itemCode || ''),
          unit: String(data.unit || ''),
          minStock: Number(data.minStock || 0),
          quantity: Number(data.quantity || 0),
        };
      })
      .filter((row) => row.itemType === 'material' || row.itemType === 'raw_material');

    if (materialBalances.length === 0) {
      return { ok: true as const, createdParts: 0, synced: 0, failed: 0 };
    }

    const partsSnap = await db.collection('repair_spare_parts')
      .where('tenantId', '==', actor.tenantId)
      .where('branchId', '==', branchId)
      .get();

    type PartRow = {
      id: string;
      materialId?: string;
      rawMaterialId?: string;
      name?: string;
      code?: string;
    };
    const parts: PartRow[] = partsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<PartRow, 'id'>),
    }));
    const codes = parts.map((p) => String(p.code || ''));
    const byMaterial = new Map<string, PartRow>();
    for (const part of parts) {
      const linked = String(part.materialId || part.rawMaterialId || '').trim();
      if (linked) byMaterial.set(linked, part);
    }

    let createdParts = 0;
    let synced = 0;
    let failed = 0;
    const now = new Date().toISOString();

    for (const balance of materialBalances) {
      const materialId = String(balance.itemId || '').trim();
      if (!materialId) {
        failed += 1;
        continue;
      }
      try {
        let part = byMaterial.get(materialId);
        if (!part) {
          const materialSnap = await db.collection('materials').doc(materialId).get();
          const material = materialSnap.exists ? (materialSnap.data() as Record<string, unknown>) : null;
          if (material && String(material.tenantId || '') !== actor.tenantId) {
            failed += 1;
            continue;
          }
          const name = String(material?.name || balance.itemName || materialId).trim() || materialId;
          const code = String(balance.itemCode || material?.code || '').trim() || nextSparePartCode(codes);
          codes.push(code);
          const unitRaw = String(material?.baseUnit || balance.unit || 'piece').trim() || 'piece';
          const unit = unitRaw === 'piece' ? 'قطعة' : unitRaw;
          const category = String(material?.categoryName || 'قطع غيار').trim() || 'قطع غيار';
          const minStock = Number(material?.minStock ?? balance.minStock ?? 0) || 0;

          const partRef = db.collection('repair_spare_parts').doc();
          await partRef.set({
            tenantId: actor.tenantId,
            branchId,
            name,
            code,
            category,
            unit,
            minStock,
            materialId,
            createdAt: now,
            updatedAt: FieldValue.serverTimestamp(),
          });
          await db.collection('repair_spare_parts_stock').doc(`${branchId}__${partRef.id}`).set({
            tenantId: actor.tenantId,
            branchId,
            partId: partRef.id,
            partName: name,
            quantity: 0,
            updatedAt: now,
          }, { merge: true });

          part = { id: partRef.id, materialId, name, code };
          byMaterial.set(materialId, part);
          createdParts += 1;
        }

        const target = roundQty(balance.quantity);
        const stockRef = db.collection('repair_spare_parts_stock').doc(
          stockDocId(branchId, warehouseId, part.id),
        );
        const stockSnap = await stockRef.get();
        const current = stockSnap.exists ? roundQty(stockSnap.data()?.quantity) : 0;
        const delta = Math.round((target - current) * 10000) / 10000;

        await stockRef.set({
          tenantId: actor.tenantId,
          branchId,
          warehouseId,
          warehouseName,
          partId: part.id,
          partName: String(part.name || balance.itemName || part.id),
          quantity: target,
          updatedAt: now,
        }, { merge: true });

        if (Math.abs(delta) >= 0.00001) {
          await db.collection('repair_parts_transactions').add({
            tenantId: actor.tenantId,
            branchId,
            partId: part.id,
            partName: String(part.name || balance.itemName || part.id),
            type: delta > 0 ? 'IN' : 'OUT',
            quantity: Math.abs(delta),
            notes: `مزامنة كتالوج المركز من أرصدة المخزن · ${warehouseName}`,
            createdBy: actor.displayName,
            createdAt: now,
          });
        }
        synced += 1;
      } catch {
        failed += 1;
      }
    }

    return { ok: true as const, createdParts, synced, failed };
  },
);
