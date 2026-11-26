import { addDoc, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { injectionMachineNumberKey, normalizeCartonReceipt, normalizeInjectionMachineNumber, normalizeInjectionQualityRecord, normalizePlasticReceipt, prepareCartonImport, type CartonReceiptInput, type InjectionQualityInput, type PlasticReceiptInput } from '../domain/incomingReceipt';
import type { QualityCartonReceipt, QualityInjectionMachine, QualityInjectionRecord, QualityNamedReason, QualityPlasticReceipt } from '../model';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertQualityPermission,
  auditQuality,
  currentQualityActor,
  listByTenant,
  listByTenantDate,
  listByTenantDateRange,
  qmsCollection,
  qmsDoc,
  readQualityDoc,
  stampTenant,
} from './qualityGateway';

function activeNamed(rows: QualityNamedReason[], name: string): QualityNamedReason | undefined {
  return rows.find((row) => row.name === name && row.isActive !== false);
}

async function cartonDay(date: string): Promise<QualityCartonReceipt[]> {
  return listByTenantDate<QualityCartonReceipt>(QMS_COLLECTIONS.CARTON_RECEIPTS, activeTenantId(), 'receivedDate', date);
}

async function syncShipmentGroup(date: string, supplier: string, shipmentNumber: string): Promise<void> {
  if (!shipmentNumber) return;
  const rows = (await cartonDay(date))
    .filter((row) => row.supplier === supplier && row.shipmentNumber === shipmentNumber)
    .sort((left, right) => left.id.localeCompare(right.id));
  await Promise.all(rows.map((row, index) => {
    const shipmentCount = index === 0 ? 1 : 0;
    if (row.shipmentCount === shipmentCount) return Promise.resolve();
    return updateDoc(qmsDoc(QMS_COLLECTIONS.CARTON_RECEIPTS, row.id), { shipmentCount });
  }));
}

export const qualityCartonService = {
  async list(date: string): Promise<QualityCartonReceipt[]> {
    assertQualityPermission('quality.incoming.view');
    return cartonDay(date);
  },

  async listRange(from: string, to: string): Promise<QualityCartonReceipt[]> {
    assertQualityPermission('quality.incoming.view');
    if (to < from) throw new Error('نطاق التاريخ غير صالح.');
    return listByTenantDateRange<QualityCartonReceipt>(QMS_COLLECTIONS.CARTON_RECEIPTS, activeTenantId(), 'receivedDate', from, to);
  },

  async save(input: CartonReceiptInput & { id?: string }): Promise<void> {
    assertQualityPermission('quality.incoming.manage');
    const receipt = normalizeCartonReceipt(input);
    const suppliers = await listByTenant<QualityNamedReason>(QMS_COLLECTIONS.CARTON_SUPPLIERS, activeTenantId());
    if (!suppliers.some((supplier) => supplier.name === receipt.supplier)) throw new Error('اختر مورداً من قائمة الكراتين');
    const day = await cartonDay(receipt.receivedDate);
    const duplicate = day.find((row) => row.id !== input.id
      && row.deliveryNoteNumber
      && row.deliveryNoteNumber === receipt.deliveryNoteNumber
      && row.supplier === receipt.supplier);
    if (duplicate) throw new Error('رقم إذن التسليم مكرر لنفس المورد والتاريخ');
    const previous = input.id ? await readQualityDoc<QualityCartonReceipt>(QMS_COLLECTIONS.CARTON_RECEIPTS, input.id) : null;
    const shipmentCount = !receipt.shipmentNumber || !day.some((row) => row.id !== input.id && row.supplier === receipt.supplier && row.shipmentNumber === receipt.shipmentNumber)
      ? 1
      : 0;
    const actor = currentQualityActor();
    const payload = stampTenant({
      moduleSource: 'qms' as const,
      ...receipt,
      shipmentCount,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await updateDoc(qmsDoc(QMS_COLLECTIONS.CARTON_RECEIPTS, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.CARTON_RECEIPTS), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      });
    }
    await syncShipmentGroup(receipt.receivedDate, receipt.supplier, receipt.shipmentNumber);
    if (previous && (previous.receivedDate !== receipt.receivedDate || previous.supplier !== receipt.supplier || previous.shipmentNumber !== receipt.shipmentNumber)) {
      await syncShipmentGroup(previous.receivedDate, previous.supplier, previous.shipmentNumber);
    }
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'حفظ وارد كراتين', { supplier: receipt.supplier, receivedDate: receipt.receivedDate });
  },

  async importRows(rows: CartonReceiptInput[]): Promise<number> {
    assertQualityPermission('quality.incoming.manage');
    const dates = [...new Set(rows.map((row) => row.receivedDate))];
    const existing = (await Promise.all(dates.map((date) => cartonDay(date)))).flat();
    const prepared = prepareCartonImport(rows, existing);
    if (prepared.length === 0) return 0;
    if (!db) throw new Error('خدمة البيانات غير متاحة.');
    const batch = writeBatch(db);
    const actor = currentQualityActor();
    prepared.forEach((row) => {
      const ref = doc(qmsCollection(QMS_COLLECTIONS.CARTON_RECEIPTS));
      batch.set(ref, stampTenant({
        moduleSource: 'qms',
        ...row,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      }));
    });
    await batch.commit();
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'استيراد وارد كراتين', { count: prepared.length });
    return prepared.length;
  },

  async remove(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    const current = await readQualityDoc<QualityCartonReceipt>(QMS_COLLECTIONS.CARTON_RECEIPTS, id);
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.CARTON_RECEIPTS, id));
    await syncShipmentGroup(current.receivedDate, current.supplier, current.shipmentNumber);
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'حذف وارد كراتين', { receiptId: id });
  },
};

export const qualityPlasticService = {
  async list(date: string): Promise<QualityPlasticReceipt[]> {
    assertQualityPermission('quality.incoming.view');
    return listByTenantDate<QualityPlasticReceipt>(QMS_COLLECTIONS.PLASTIC_RECEIPTS, activeTenantId(), 'receivedDate', date);
  },

  async listRange(from: string, to: string): Promise<QualityPlasticReceipt[]> {
    assertQualityPermission('quality.incoming.view');
    if (to < from) throw new Error('نطاق التاريخ غير صالح.');
    return listByTenantDateRange<QualityPlasticReceipt>(QMS_COLLECTIONS.PLASTIC_RECEIPTS, activeTenantId(), 'receivedDate', from, to);
  },

  async importRows(rows: PlasticReceiptInput[]): Promise<number> {
    assertQualityPermission('quality.incoming.manage');
    if (rows.length === 0) return 0;
    if (rows.length > 400) throw new Error('الحد الأقصى للاستيراد في المرة الواحدة هو 400 سجل');
    if (!db) throw new Error('خدمة البيانات غير متاحة.');
    const tenantId = activeTenantId();
    const [items, reasons] = await Promise.all([
      listByTenant<QualityNamedReason>(QMS_COLLECTIONS.PLASTIC_ITEMS, tenantId),
      listByTenant<QualityNamedReason>(QMS_COLLECTIONS.PLASTIC_REASONS, tenantId),
    ]);
    const prepared = rows.map((row) => {
      const receipt = normalizePlasticReceipt(row);
      if (!activeNamed(items, receipt.productName)) throw new Error('اختيار الصنف مطلوب');
      const selected = receipt.reasonIds.map((id) => reasons.find((reason) => reason.id === id && reason.isActive !== false));
      if (selected.some((reason) => !reason)) throw new Error('سبب الرفض غير موجود في القائمة النشطة');
      return { receipt, reasonLabels: selected.map((reason) => reason?.name || '') };
    });
    const batch = writeBatch(db);
    const actor = currentQualityActor();
    prepared.forEach(({ receipt, reasonLabels }) => {
      batch.set(doc(qmsCollection(QMS_COLLECTIONS.PLASTIC_RECEIPTS)), stampTenant({
        moduleSource: 'qms',
        ...receipt,
        reasonLabels,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      }));
    });
    await batch.commit();
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'استيراد وارد بلاستيك', { count: prepared.length });
    return prepared.length;
  },

  async save(input: Parameters<typeof normalizePlasticReceipt>[0] & { id?: string }): Promise<void> {
    assertQualityPermission('quality.incoming.manage');
    const receipt = normalizePlasticReceipt(input);
    const tenantId = activeTenantId();
    const [items, reasons, suppliers] = await Promise.all([
      listByTenant<QualityNamedReason>(QMS_COLLECTIONS.PLASTIC_ITEMS, tenantId),
      listByTenant<QualityNamedReason>(QMS_COLLECTIONS.PLASTIC_REASONS, tenantId),
      listByTenant<QualityNamedReason>(QMS_COLLECTIONS.PLASTIC_SUPPLIERS, tenantId),
    ]);
    if (!suppliers.some((supplier) => supplier.name === receipt.supplier)) throw new Error('اختر مورداً من قائمة البلاستيك');
    if (!activeNamed(items, receipt.productName)) throw new Error('اختيار الصنف مطلوب');
    const selected = receipt.reasonIds.map((id) => reasons.find((reason) => reason.id === id && reason.isActive !== false));
    if (selected.some((reason) => !reason)) throw new Error('سبب الرفض غير موجود في القائمة النشطة');
    if (input.id) await readQualityDoc(QMS_COLLECTIONS.PLASTIC_RECEIPTS, input.id);
    const actor = currentQualityActor();
    const payload = stampTenant({
      moduleSource: 'qms' as const,
      ...receipt,
      reasonLabels: selected.map((reason) => reason?.name || ''),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await updateDoc(qmsDoc(QMS_COLLECTIONS.PLASTIC_RECEIPTS, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.PLASTIC_RECEIPTS), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      });
    }
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'حفظ وارد بلاستيك', { supplier: receipt.supplier, receivedDate: receipt.receivedDate });
  },

  async remove(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    await readQualityDoc(QMS_COLLECTIONS.PLASTIC_RECEIPTS, id);
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.PLASTIC_RECEIPTS, id));
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'حذف وارد بلاستيك', { receiptId: id });
  },
};

export const qualityInjectionService = {
  async listMachines(includeInactive = false): Promise<QualityInjectionMachine[]> {
    assertQualityPermission('quality.incoming.view');
    const machines = await listByTenant<QualityInjectionMachine>(QMS_COLLECTIONS.INJECTION_MACHINES, activeTenantId());
    return machines
      .filter((machine) => includeInactive || machine.isActive !== false)
      .sort((left, right) => left.name.localeCompare(right.name, 'ar', { numeric: true }));
  },

  async saveMachineNumber(value: string): Promise<void> {
    assertQualityPermission('quality.incoming.manage');
    const name = normalizeInjectionMachineNumber(value);
    const tenantId = activeTenantId();
    const nameKey = injectionMachineNumberKey(name);
    const existing = (await listByTenant<QualityInjectionMachine>(QMS_COLLECTIONS.INJECTION_MACHINES, tenantId))
      .find((machine) => machine.nameKey === nameKey);
    const actor = currentQualityActor();
    if (existing) {
      if (existing.isActive !== false) throw new Error('رقم الماكينة موجود بالفعل في القائمة.');
      await updateDoc(qmsDoc(QMS_COLLECTIONS.INJECTION_MACHINES, existing.id), {
        isActive: true,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      });
    } else {
      const id = `${tenantId}__${encodeURIComponent(nameKey)}`;
      await setDoc(qmsDoc(QMS_COLLECTIONS.INJECTION_MACHINES, id), stampTenant({
        name,
        nameKey,
        isActive: true,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      }));
    }
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'إضافة رقم ماكينة لمتابعة الحقن', { machineNumber: name });
  },

  async setMachineActive(machine: QualityInjectionMachine, isActive: boolean): Promise<void> {
    assertQualityPermission('quality.incoming.manage');
    const current = (await listByTenant<QualityInjectionMachine>(QMS_COLLECTIONS.INJECTION_MACHINES, activeTenantId()))
      .find((row) => row.id === machine.id);
    if (!current) throw new Error('رقم الماكينة غير موجود في الشركة الحالية.');
    const actor = currentQualityActor();
    await updateDoc(qmsDoc(QMS_COLLECTIONS.INJECTION_MACHINES, machine.id), {
      isActive,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_INCOMING_RECEIPT', isActive ? 'تفعيل رقم ماكينة لمتابعة الحقن' : 'إيقاف رقم ماكينة لمتابعة الحقن', {
      machineNumber: current.name,
    });
  },

  async listRange(from: string, to: string): Promise<QualityInjectionRecord[]> {
    assertQualityPermission('quality.incoming.view');
    if (to < from) throw new Error('نطاق التاريخ غير صالح.');
    return listByTenantDateRange<QualityInjectionRecord>(
      QMS_COLLECTIONS.INJECTION_RECORDS,
      activeTenantId(),
      'date',
      from,
      to,
    );
  },

  async save(input: InjectionQualityInput & { id?: string }): Promise<void> {
    assertQualityPermission('quality.incoming.manage');
    const record = normalizeInjectionQualityRecord(input);
    if (input.id) await readQualityDoc<QualityInjectionRecord>(QMS_COLLECTIONS.INJECTION_RECORDS, input.id);
    const actor = currentQualityActor();
    const payload = stampTenant({
      moduleSource: 'qms' as const,
      ...record,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await updateDoc(qmsDoc(QMS_COLLECTIONS.INJECTION_RECORDS, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.INJECTION_RECORDS), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      });
    }
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'حفظ متابعة جودة قسم الحقن', {
      machineNumber: record.machineNumber,
      date: record.date,
    });
  },

  async importRows(rows: InjectionQualityInput[]): Promise<number> {
    assertQualityPermission('quality.incoming.manage');
    if (rows.length === 0) return 0;
    if (rows.length > 400) throw new Error('الحد الأقصى للاستيراد في المرة الواحدة هو 400 سجل');
    if (!db) throw new Error('خدمة البيانات غير متاحة.');
    const prepared = rows.map((row) => normalizeInjectionQualityRecord(row));
    const batch = writeBatch(db);
    const actor = currentQualityActor();
    prepared.forEach((record) => {
      batch.set(doc(qmsCollection(QMS_COLLECTIONS.INJECTION_RECORDS)), stampTenant({
        moduleSource: 'qms',
        ...record,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      }));
    });
    await batch.commit();
    await auditQuality('QUALITY_INCOMING_RECEIPT', 'استيراد متابعة جودة قسم الحقن', { count: prepared.length });
    return prepared.length;
  },
};
