import {
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import {
  calculateAqlDecision,
  lookupAqlPlan,
  assertPalletInspectionQuantities,
  type AqlDecisionMode,
} from '../domain/aql';
import { assertIsoDate, assertRequiredText } from '../domain/samples';
import { assertSectorMatch, type QualitySector } from '../domain/sector';
import { localDateIso, localTimeHm } from '../domain/time';
import type { QualityDefectLine, QualityPallet } from '../model';
import { qualitySettingsService } from './qualitySettingsService';
import { qualityStaffService } from './qualityStaffService';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertAnyQualityPermission,
  assertQualityPermission,
  assertQualityTenant,
  auditQuality,
  currentQualityActor,
  listByTenantDate,
  listByTenantDateRange,
  qmsChildCollection,
  qmsChildDoc,
  qmsCollection,
  qmsDoc,
  readQualityDoc,
  requireQualityDb,
} from './qualityGateway';

const palletIdFor = (tenantId: string, lineId: string, date: string, palletNumber: number): string =>
  [tenantId, lineId, date, String(palletNumber)].map((part) => part.replace(/[^A-Za-z0-9_-]/g, '_')).join('__');

const defectsRef = (palletId: string) => qmsChildCollection(QMS_COLLECTIONS.PALLETS, palletId, 'defects');

async function loadDefects(palletId: string): Promise<QualityDefectLine[]> {
  const snap = await getDocs(defectsRef(palletId));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as QualityDefectLine);
}

async function replaceDefects(palletId: string, tenantId: string, defects: QualityDefectLine[]): Promise<void> {
  requireQualityDb();
  const existing = await getDocs(defectsRef(palletId));
  const batch = writeBatch(db);
  existing.docs.forEach((item) => batch.delete(item.ref));
  defects.forEach((defect) => {
    const ref = qmsChildDoc(QMS_COLLECTIONS.PALLETS, palletId, 'defects', defect.reasonId.replace(/[^A-Za-z0-9_-]/g, '_'));
    batch.set(ref, {
      tenantId,
      reasonId: defect.reasonId,
      reasonCode: defect.reasonCode,
      reasonLabel: defect.reasonLabel,
      count: defect.count,
      notes: defect.notes || '',
    });
  });
  await batch.commit();
}

export interface ReceivePalletInput {
  date: string;
  shiftId: string;
  shiftName: string;
  lineId: string;
  lineName: string;
  palletNumber: number;
  productId: string;
  productName: string;
  productCode: string;
  workOrderId?: string;
  workOrderNumber?: string;
  sector: QualitySector;
  lineSector?: QualitySector | null;
  productSector?: QualitySector | null;
  quantityOnPallet: number;
  inspectorEmployeeId?: string;
  inspectorName?: string;
  notes?: string;
}

export const qualityPalletService = {
  async listByDate(date: string): Promise<QualityPallet[]> {
    assertAnyQualityPermission(['quality.pallets.view', 'quality.reports.view']);
    const rows = await listByTenantDate<QualityPallet>(QMS_COLLECTIONS.PALLETS, activeTenantId(), 'date', date);
    return rows.sort((a, b) => a.palletNumber - b.palletNumber);
  },

  async listByDateRange(from: string, to: string): Promise<QualityPallet[]> {
    assertAnyQualityPermission(['quality.pallets.view', 'quality.reports.view']);
    const rows = await listByTenantDateRange<QualityPallet>(QMS_COLLECTIONS.PALLETS, activeTenantId(), 'date', from, to);
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.palletNumber - b.palletNumber);
  },

  async listByWorkOrder(workOrderId: string): Promise<QualityPallet[]> {
    assertAnyQualityPermission(['quality.pallets.view', 'quality.reports.view']);
    requireQualityDb();
    const snap = await getDocs(query(
      qmsCollection(QMS_COLLECTIONS.PALLETS),
      where('tenantId', '==', activeTenantId()),
      where('workOrderId', '==', workOrderId),
    ));
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as QualityPallet);
  },

  subscribeWaitingCount(onCount: (count: number) => void): () => void {
    try {
      const tenantId = activeTenantId();
      return onSnapshot(
        query(
          qmsCollection(QMS_COLLECTIONS.PALLETS),
          where('tenantId', '==', tenantId),
          where('inspectionStatus', '==', 'في انتظار الفحص'),
        ),
        (snap) => onCount(snap.size),
        () => onCount(0),
      );
    } catch {
      onCount(0);
      return () => undefined;
    }
  },

  async receive(input: ReceivePalletInput): Promise<string> {
    assertQualityPermission('quality.pallets.inspect');
    assertIsoDate(input.date);
    assertSectorMatch(input.lineSector, input.productSector);
    if (!input.lineId || !input.productId || !input.shiftId) throw new Error('الخط والمنتج والوردية مطلوبة.');
    if (!Number.isInteger(input.palletNumber) || input.palletNumber < 1) throw new Error('رقم البالتة غير صالح.');
    if (!Number.isInteger(input.quantityOnPallet) || input.quantityOnPallet < 0) throw new Error('كمية البالتة غير صالحة.');
    const actor = currentQualityActor();
    const tenantId = activeTenantId();
    const inspector = input.inspectorEmployeeId
      ? await qualityStaffService.requireSelectableInspector({ employeeId: input.inspectorEmployeeId, lineId: input.lineId })
      : null;
    const plans = await qualitySettingsService.effectiveAqlPlans();
    const aql = lookupAqlPlan(input.quantityOnPallet, plans);
    const id = palletIdFor(tenantId, input.lineId, input.date, input.palletNumber);
    await runTransaction(db, async (tx) => {
      const ref = qmsDoc(QMS_COLLECTIONS.PALLETS, id);
      const snap = await tx.get(ref);
      if (snap.exists()) throw new Error('هذه البالتة مسجلة بالفعل لهذا الخط في نفس اليوم.');
      tx.set(ref, {
        tenantId,
        moduleSource: 'qms',
        date: input.date,
        receivedTime: localTimeHm(),
        shiftId: input.shiftId,
        shiftName: input.shiftName,
        lineId: input.lineId,
        lineName: input.lineName,
        palletNumber: input.palletNumber,
        productId: input.productId,
        productName: input.productName,
        productCode: input.productCode,
        workOrderId: input.workOrderId || null,
        workOrderNumber: input.workOrderNumber || null,
        sector: input.sector,
        quantityOnPallet: input.quantityOnPallet,
        inspectionStatus: 'في انتظار الفحص',
        sampleSizeRequired: aql.sampleSize,
        maxAllowedDefects: aql.acceptLimit,
        rejectLimit: aql.rejectLimit,
        aqlLevel: aql.aqlLevel,
        inspectedQuantity: 0,
        rejectedQuantity: 0,
        palletDecision: 'قيد الفحص',
        decisionMode: 'auto',
        inspectorEmployeeId: inspector?.id || null,
        inspectorName: inspector?.name || null,
        notes: input.notes || '',
        createdByUid: actor.uid,
        createdByName: actor.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      });
    });
    await auditQuality('QUALITY_RECEIVE_PALLET', `استلام بالته ${input.palletNumber}`, {
      palletId: id,
      lineId: input.lineId,
      productId: input.productId,
      workOrderId: input.workOrderId || null,
    });
    return id;
  },

  async start(id: string): Promise<void> {
    assertQualityPermission('quality.pallets.inspect');
    const pallet = await readQualityDoc<QualityPallet>(QMS_COLLECTIONS.PALLETS, id);
    if (pallet.inspectionStatus === 'تم الفحص') throw new Error('الفحص مكتمل. إعادة الفتح تتطلب صلاحية مستقلة.');
    const actor = currentQualityActor();
    await updateDoc(qmsDoc(QMS_COLLECTIONS.PALLETS, id), {
      inspectionStatus: 'جاري الفحص',
      inspectionDate: pallet.inspectionDate || localDateIso(),
      inspectionStartedAt: pallet.inspectionStartedAt || localTimeHm(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_INSPECT_PALLET', 'بدء فحص بالته', { palletId: id });
  },

  async complete(id: string, input: {
    inspectedQuantity: number;
    rejectedQuantity: number;
    defects: QualityDefectLine[];
    notes?: string;
    inspectorEmployeeId: string;
    inspectorName: string;
  }): Promise<void> {
    assertQualityPermission('quality.pallets.inspect');
    if (input.rejectedQuantity > 0) assertQualityPermission('quality.defects.record');
    const pallet = await readQualityDoc<QualityPallet>(QMS_COLLECTIONS.PALLETS, id);
    if (pallet.inspectionStatus === 'تم الفحص') throw new Error('تم إنهاء فحص هذه البالتة بالفعل.');
    assertPalletInspectionQuantities({
      quantityOnPallet: pallet.quantityOnPallet,
      inspectedQuantity: input.inspectedQuantity,
      rejectedQuantity: input.rejectedQuantity,
    });
    const defectSum = input.defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
    if (defectSum !== input.rejectedQuantity) {
      throw new Error('مجموع بنود العيوب يجب أن يساوي عدد العيوب المسجل.');
    }
    const plans = await qualitySettingsService.effectiveAqlPlans();
    const aql = lookupAqlPlan(pallet.quantityOnPallet, plans);
    const decision = calculateAqlDecision(input.rejectedQuantity, aql.acceptLimit, aql.rejectLimit, 'auto');
    const inspector = await qualityStaffService.requireSelectableInspector({
      employeeId: input.inspectorEmployeeId,
      lineId: pallet.lineId,
    });
    const actor = currentQualityActor();
    await replaceDefects(id, pallet.tenantId, input.defects);
    await updateDoc(qmsDoc(QMS_COLLECTIONS.PALLETS, id), {
      inspectionStatus: 'تم الفحص',
      inspectionDate: localDateIso(),
      inspectionStartedAt: pallet.inspectionStartedAt || localTimeHm(),
      inspectionCompletedAt: localTimeHm(),
      sampleSizeRequired: aql.sampleSize,
      maxAllowedDefects: aql.acceptLimit,
      rejectLimit: aql.rejectLimit,
      aqlLevel: aql.aqlLevel,
      inspectedQuantity: input.inspectedQuantity,
      rejectedQuantity: input.rejectedQuantity,
      palletDecision: decision,
      decisionMode: 'auto',
      inspectorEmployeeId: inspector.id,
      inspectorName: inspector.name,
      notes: input.notes ?? pallet.notes ?? '',
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_INSPECT_PALLET', `اعتماد فحص بالته: ${decision}`, {
      palletId: id,
      decision,
      rejectedQuantity: input.rejectedQuantity,
    });
  },

  async override(id: string, mode: Exclude<AqlDecisionMode, 'auto'>, reason: string): Promise<void> {
    assertQualityPermission('quality.pallets.override');
    const text = assertRequiredText(reason, 'سبب تجاوز قرار AQL مطلوب.');
    const pallet = await readQualityDoc<QualityPallet>(QMS_COLLECTIONS.PALLETS, id);
    if (pallet.inspectionStatus !== 'تم الفحص') throw new Error('التجاوز اليدوي متاح بعد إتمام الفحص.');
    const decision = calculateAqlDecision(pallet.rejectedQuantity, pallet.maxAllowedDefects, pallet.rejectLimit, mode);
    const actor = currentQualityActor();
    await updateDoc(qmsDoc(QMS_COLLECTIONS.PALLETS, id), {
      decisionMode: mode,
      palletDecision: decision,
      overrideReason: text,
      overrideByUid: actor.uid,
      overrideByName: actor.name,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_OVERRIDE_PALLET', `تجاوز قرار بالته إلى ${decision}`, {
      palletId: id,
      mode,
      reason: text,
    });
  },

  async reopen(id: string, reason: string): Promise<void> {
    assertQualityPermission('quality.records.reopen');
    const text = assertRequiredText(reason, 'سبب إعادة الفتح مطلوب.');
    const pallet = await readQualityDoc<QualityPallet>(QMS_COLLECTIONS.PALLETS, id);
    if (pallet.inspectionStatus !== 'تم الفحص') throw new Error('يمكن إعادة فتح الفحص المكتمل فقط.');
    const actor = currentQualityActor();
    await updateDoc(qmsDoc(QMS_COLLECTIONS.PALLETS, id), {
      inspectionStatus: 'جاري الفحص',
      inspectionCompletedAt: null,
      palletDecision: 'قيد الفحص',
      decisionMode: 'auto',
      reopenReason: text,
      reopenedByUid: actor.uid,
      reopenedByName: actor.name,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_REOPEN_RECORD', 'إعادة فتح فحص بالته', { palletId: id, reason: text });
  },

  async remove(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    const pallet = await readQualityDoc<QualityPallet>(QMS_COLLECTIONS.PALLETS, id);
    assertQualityTenant(pallet.tenantId);
    const defects = await getDocs(defectsRef(id));
    const batch = writeBatch(db);
    defects.docs.forEach((item) => batch.delete(item.ref));
    batch.delete(qmsDoc(QMS_COLLECTIONS.PALLETS, id));
    await batch.commit();
    await auditQuality('QUALITY_REOPEN_RECORD', 'حذف بالته', { palletId: id });
  },

  async withDefects(rows: QualityPallet[]): Promise<QualityPallet[]> {
    assertAnyQualityPermission(['quality.pallets.view', 'quality.reports.view']);
    return Promise.all(rows.map(async (row) => ({ ...row, defects: await loadDefects(row.id) })));
  },
};

export { deleteDoc };
