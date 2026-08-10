/**
 * Spare-parts / repair-consumables purchase invoices.
 * On post: stock IN to spare_parts_central + weighted moving average on stock_items.avgUnitCost,
 * dual-writing materials.purchaseCost so issue/replenishment keep using existing cost helpers.
 */
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { getDb } from './adminApp.js';

const db = getDb();
const STOCK_ITEMS = 'stock_items';
const STOCK_TX = 'stock_transactions';
const INVOICES = 'spare_parts_purchase_invoices';
const CENTRAL_ROLE = 'spare_parts_central';

type Actor = {
  uid: string;
  tenantId: string;
  displayName: string;
  permissions: Record<string, boolean>;
  isSuperAdmin: boolean;
};

type LineInput = { materialId?: string; quantity?: number; unitPrice?: number };

const roundMoney = (value: unknown): number => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
};

const roundQty = (value: unknown): number => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 1000) / 1000);
};

const requireAuth = (request: CallableRequest): string => {
  const uid = String(request.auth?.uid || '').trim();
  if (!uid) throw new HttpsError('unauthenticated', 'يجب تسجيل الدخول.');
  return uid;
};

const loadActor = async (uid: string): Promise<Actor> => {
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'المستخدم غير موجود.');
  const user = userSnap.data() as Record<string, unknown>;
  if (user.isActive === false) throw new HttpsError('permission-denied', 'الحساب غير نشط.');
  const tenantId = String(user.tenantId || '').trim();
  if (!tenantId) throw new HttpsError('failed-precondition', 'لا توجد شركة مرتبطة بالحساب.');
  let permissions: Record<string, boolean> = {};
  const roleId = String(user.roleId || '').trim();
  if (roleId) {
    const roleSnap = await db.collection('roles').doc(roleId).get();
    const role = roleSnap.data() as Record<string, unknown> | undefined;
    if (!roleSnap.exists || String(role?.tenantId || '').trim() !== tenantId) {
      throw new HttpsError('permission-denied', 'دور المستخدم غير صالح.');
    }
    permissions = (role?.permissions || {}) as Record<string, boolean>;
  }
  return {
    uid,
    tenantId,
    displayName: String(user.displayName || user.name || user.email || uid),
    permissions,
    isSuperAdmin: user.isSuperAdmin === true,
  };
};

const requirePermission = (actor: Actor, keys: string[], message: string) => {
  if (actor.isSuperAdmin || keys.some((key) => actor.permissions[key] === true)) return;
  throw new HttpsError('permission-denied', message);
};

const balanceDocId = (warehouseId: string, materialId: string) =>
  `${warehouseId}__material__${materialId}`;

const weightedAverage = (oldQty: number, oldAvg: number, recvQty: number, unitPrice: number): number => {
  const q0 = Math.max(0, oldQty);
  const q1 = Math.max(0, recvQty);
  if (q1 <= 0) return roundMoney(oldAvg);
  if (q0 <= 0) return roundMoney(unitPrice);
  return roundMoney(((q0 * oldAvg) + (q1 * unitPrice)) / (q0 + q1));
};

const resolveCentralWarehouse = async (tenantId: string) => {
  const snap = await db.collection('warehouses')
    .where('tenantId', '==', tenantId)
    .where('warehouseRole', '==', CENTRAL_ROLE)
    .limit(5)
    .get();
  const rows = snap.docs.filter((doc) => doc.data()?.isActive !== false);
  if (rows.length === 0) {
    throw new HttpsError('failed-precondition', 'لا يوجد مخزن قطع غيار مركزي نشط.');
  }
  if (rows.length > 1) {
    throw new HttpsError('failed-precondition', 'يوجد أكثر من مخزن قطع مركزي. أبقِ مخزنًا واحدًا نشطًا.');
  }
  return { id: rows[0].id, name: String(rows[0].data()?.name || rows[0].id), code: String(rows[0].data()?.code || '') };
};

const normalizeLines = (raw: unknown): Array<{ materialId: string; quantity: number; unitPrice: number }> => {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpsError('invalid-argument', 'أضف بندًا واحدًا على الأقل.');
  }
  if (raw.length > 80) throw new HttpsError('invalid-argument', 'تجاوزت الحد الأقصى لبنود الفاتورة.');
  const out: Array<{ materialId: string; quantity: number; unitPrice: number }> = [];
  const seen = new Set<string>();
  for (const row of raw as LineInput[]) {
    const materialId = String(row?.materialId || '').trim();
    const quantity = roundQty(row?.quantity);
    const unitPrice = roundMoney(row?.unitPrice);
    if (!materialId) throw new HttpsError('invalid-argument', 'معرّف الصنف مطلوب.');
    if (!(quantity > 0)) throw new HttpsError('invalid-argument', 'كمية كل بند يجب أن تكون أكبر من صفر.');
    if (!(unitPrice >= 0)) throw new HttpsError('invalid-argument', 'سعر الوحدة غير صالح.');
    if (seen.has(materialId)) {
      throw new HttpsError('invalid-argument', 'كرّر الصنف في سطر واحد فقط (اجمع الكميات).');
    }
    seen.add(materialId);
    out.push({ materialId, quantity, unitPrice });
  }
  return out;
};

const assertSpareEligibleMaterial = (material: Record<string, unknown>, materialId: string) => {
  if (material.isActive === false) {
    throw new HttpsError('failed-precondition', `الصنف ${materialId} غير نشط.`);
  }
  if (material.availableForSpareParts === false) {
    throw new HttpsError('failed-precondition', `الصنف ${materialId} غير متاح لقطع الغيار.`);
  }
  const type = String(material.type || material.itemType || 'raw_material');
  // Phase-1: spare parts + repair consumables/tools (raw_material / consumable / material).
  if (!['raw_material', 'consumable', 'material'].includes(type)) {
    throw new HttpsError(
      'failed-precondition',
      `الصنف ${materialId} ليس من أنواع قطع/مستهلكات الصيانة المسموحة.`,
    );
  }
};

export const mutateSparePartsPurchaseInvoiceHandler = async (request: CallableRequest) => {
  const actor = await loadActor(requireAuth(request));
  requirePermission(
    actor,
    ['inventory.transactions.create', 'sparePartsReplenishment.prepare', 'repair.parts.manage'],
    'ليس لديك صلاحية ترحيل فاتورة شراء قطع الغيار.',
  );

  const payload = (request.data || {}) as Record<string, unknown>;
  const operation = String(payload.operation || '').trim();
  if (operation !== 'post') {
    throw new HttpsError('invalid-argument', 'عملية فاتورة الشراء غير مدعومة.');
  }

  const requestId = String(payload.requestId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
  if (!requestId) throw new HttpsError('invalid-argument', 'معرّف الطلب مطلوب.');
  const supplierName = String(payload.supplierName || '').trim();
  const supplierInvoiceNo = String(payload.supplierInvoiceNo || '').trim();
  const notes = String(payload.notes || '').trim();
  const linesIn = normalizeLines(payload.lines);
  const warehouse = await resolveCentralWarehouse(actor.tenantId);

  const materialSnaps = await Promise.all(
    linesIn.map((line) => db.collection('materials').doc(line.materialId).get()),
  );

  const resolvedLines = linesIn.map((line, index) => {
    const snap = materialSnaps[index];
    const material = (snap.exists ? snap.data() : null) as Record<string, unknown> | null;
    if (!snap.exists || !material || String(material.tenantId || '') !== actor.tenantId) {
      throw new HttpsError('not-found', `الصنف ${line.materialId} غير موجود في الشركة.`);
    }
    assertSpareEligibleMaterial(material, line.materialId);
    const lineTotal = roundMoney(line.quantity * line.unitPrice);
    return {
      ...line,
      materialName: String(material.name || line.materialId),
      materialCode: String(material.code || ''),
      unit: String(material.unit || material.baseUnit || 'قطعة'),
      conversionRate: roundQty(material.conversionRate) || 0,
      lineTotal,
    };
  });

  const grossAmount = roundMoney(resolvedLines.reduce((sum, row) => sum + row.lineTotal, 0));
  const invoiceRef = db.collection(INVOICES).doc(`${actor.tenantId}__${requestId}`);
  const at = new Date().toISOString();

  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(invoiceRef);
    if (existing.exists) {
      return {
        invoiceId: invoiceRef.id,
        invoiceNo: String(existing.data()?.invoiceNo || ''),
        duplicated: true,
      };
    }

    const counterRef = db.collection('repair_counters').doc(`${actor.tenantId}__spare_purchase_invoice`);
    const counterSnap = await tx.get(counterRef);
    const sequence = Math.max(0, Math.floor(Number(counterSnap.data()?.value || 0))) + 1;
    const invoiceNo = `SPI-${String(sequence).padStart(5, '0')}`;

    // Reads first (Firestore txn rule).
    const balanceRefs = resolvedLines.map((line) =>
      db.collection(STOCK_ITEMS).doc(balanceDocId(warehouse.id, line.materialId)),
    );
    const materialRefs = resolvedLines.map((line) => db.collection('materials').doc(line.materialId));
    const balanceSnaps = await Promise.all(balanceRefs.map((ref) => tx.get(ref)));
    const materialLiveSnaps = await Promise.all(materialRefs.map((ref) => tx.get(ref)));

    const postedLines: Array<Record<string, unknown>> = [];

    for (let i = 0; i < resolvedLines.length; i += 1) {
      const line = resolvedLines[i];
      const balRef = balanceRefs[i];
      const balSnap = balanceSnaps[i];
      const matSnap = materialLiveSnaps[i];
      const material = (matSnap.data() || {}) as Record<string, unknown>;
      const oldQty = balSnap.exists ? roundQty(balSnap.data()?.quantity) : 0;
      const oldAvgFromStock = balSnap.exists ? roundMoney(balSnap.data()?.avgUnitCost) : 0;
      const rate = roundQty(material.conversionRate);
      const masterBase = rate > 0
        ? roundMoney(roundMoney(material.purchaseCost) / rate)
        : roundMoney(material.purchaseCost);
      const oldAvg = oldAvgFromStock > 0 ? oldAvgFromStock : masterBase;
      const newAvg = weightedAverage(oldQty, oldAvg, line.quantity, line.unitPrice);
      const newQty = roundQty(oldQty + line.quantity);
      const txRef = db.collection(STOCK_TX).doc(`${actor.tenantId}__spi__${requestId}__${line.materialId}`);

      if (balSnap.exists) {
        tx.update(balRef, {
          quantity: newQty,
          availableQty: Math.max(0, newQty - roundQty(balSnap.data()?.reservedQty)),
          avgUnitCost: newAvg,
          unitCost: newAvg,
          updatedAt: at,
          lastMovementAt: at,
          warehouseName: warehouse.name,
          warehouseRole: CENTRAL_ROLE,
        });
      } else {
        tx.set(balRef, {
          tenantId: actor.tenantId,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          warehouseRole: CENTRAL_ROLE,
          itemType: 'material',
          itemId: line.materialId,
          itemName: line.materialName,
          itemCode: line.materialCode,
          quantity: newQty,
          reservedQty: 0,
          availableQty: newQty,
          avgUnitCost: newAvg,
          unitCost: newAvg,
          unit: line.unit,
          minStock: 0,
          updatedAt: at,
          lastMovementAt: at,
        });
      }

      // Dual-write master so issue/replenishment (purchaseCost helpers) pick up WMA immediately.
      const nextPurchaseCost = rate > 0 ? roundMoney(newAvg * rate) : newAvg;
      tx.update(matSnap.ref, {
        purchaseCost: nextPurchaseCost,
        updatedAt: at,
      });

      tx.create(txRef, {
        tenantId: actor.tenantId,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        itemType: 'material',
        itemId: line.materialId,
        itemName: line.materialName,
        itemCode: line.materialCode,
        movementType: 'IN',
        quantity: line.quantity,
        unitCost: line.unitPrice,
        totalCost: line.lineTotal,
        unitCostSnapshot: line.unitPrice,
        totalCostSnapshot: line.lineTotal,
        avgUnitCostAfter: newAvg,
        sourceModule: 'spare_parts_purchase',
        sourceId: invoiceRef.id,
        referenceNo: invoiceNo,
        note: supplierInvoiceNo ? `فاتورة مورّد ${supplierInvoiceNo}` : 'فاتورة شراء قطع',
        createdBy: actor.uid,
        createdByName: actor.displayName,
        createdAt: at,
      });

      postedLines.push({
        materialId: line.materialId,
        materialName: line.materialName,
        materialCode: line.materialCode,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        avgUnitCostAfter: newAvg,
        stockQtyAfter: newQty,
      });
    }

    if (!counterSnap.exists) {
      tx.set(counterRef, { tenantId: actor.tenantId, value: sequence, updatedAt: at });
    } else {
      tx.update(counterRef, { value: sequence, updatedAt: at });
    }

    tx.create(invoiceRef, {
      tenantId: actor.tenantId,
      invoiceNo,
      status: 'posted',
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      supplierName: supplierName || null,
      supplierInvoiceNo: supplierInvoiceNo || null,
      notes: notes || null,
      lines: postedLines,
      grossAmount,
      total: grossAmount,
      postedAt: at,
      postedBy: actor.uid,
      postedByName: actor.displayName,
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdAt: at,
      updatedAt: at,
    });

    return { invoiceId: invoiceRef.id, invoiceNo, duplicated: false };
  });

  return { ok: true as const, operation, ...result, warehouseId: warehouse.id, total: grossAmount };
};
