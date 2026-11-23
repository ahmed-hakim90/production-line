import { addDoc, deleteDoc, getDocs, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { assertIsoDate, assertRequiredText, assertSampleCount, resolveLinePullDecision, totalLinePullSampleCount, validateAdditionalInspectorAssignments } from '../domain/samples';
import { assertSectorMatch, type QualitySector } from '../domain/sector';
import { localTimeHm } from '../domain/time';
import type { QualityAdditionalInspector, QualityDefectLine, QualityHourlySample, QualityLinePull, QualityPeriodStatus } from '../model';
import { qualityStaffService } from './qualityStaffService';
import { qualitySettingsService } from './qualitySettingsService';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertAnyQualityPermission,
  assertQualityPermission,
  auditQuality,
  currentQualityActor,
  listByTenantDate,
  listByTenantDateRange,
  qmsChildCollection,
  qmsChildDoc,
  qmsCollection,
  qmsDoc,
  readQualityDoc,
  stampTenant,
} from './qualityGateway';

async function loadSampleDefects(parentCollection: string, parentId: string): Promise<QualityDefectLine[]> {
  const snap = await getDocs(qmsChildCollection(parentCollection, parentId, 'defects'));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as QualityDefectLine);
}

async function replaceChildDefects(
  parentCollection: string,
  parentId: string,
  tenantId: string,
  defects: QualityDefectLine[],
  parentPatch?: Record<string, unknown>,
) {
  const existing = await getDocs(qmsChildCollection(parentCollection, parentId, 'defects'));
  const batch = writeBatch(db);
  existing.docs.forEach((item) => batch.delete(item.ref));
  const grouped = new Map<string, QualityDefectLine>();
  defects.forEach((defect) => {
    const previous = grouped.get(defect.reasonId);
    grouped.set(defect.reasonId, previous
      ? {
        ...previous,
        count: previous.count + defect.count,
        notes: [previous.notes, defect.notes].filter(Boolean).join(' · '),
      }
      : defect);
  });
  grouped.forEach((defect) => {
    const ref = qmsChildDoc(
      parentCollection,
      parentId,
      'defects',
      defect.reasonId.replace(/[^A-Za-z0-9_-]/g, '_'),
    );
    batch.set(ref, {
      tenantId,
      reasonId: defect.reasonId,
      reasonCode: defect.reasonCode,
      reasonLabel: defect.reasonLabel,
      count: defect.count,
      notes: defect.notes || '',
      inspectorEmployeeId: defect.inspectorEmployeeId || '',
      inspectorName: defect.inspectorName || '',
    });
  });
  if (parentPatch) batch.update(qmsDoc(parentCollection, parentId), parentPatch);
  await batch.commit();
}

export const qualitySampleService = {
  async listHourly(date: string): Promise<QualityHourlySample[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return listByTenantDate<QualityHourlySample>(QMS_COLLECTIONS.HOURLY_SAMPLES, activeTenantId(), 'date', date);
  },

  async listHourlyRange(from: string, to: string): Promise<QualityHourlySample[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return listByTenantDateRange<QualityHourlySample>(QMS_COLLECTIONS.HOURLY_SAMPLES, activeTenantId(), 'date', from, to);
  },

  async saveHourly(input: Omit<QualityHourlySample, 'id' | 'tenantId' | 'moduleSource' | 'createdByUid' | 'createdByName' | 'defectCount' | 'decision'> & {
    id?: string;
    defects: QualityDefectLine[];
  }): Promise<void> {
    assertQualityPermission('quality.samples.inspect');
    assertIsoDate(input.date);
    assertSampleCount(input.sampleCount);
    if (!input.lineId || !input.productId || !input.inspectorEmployeeId || !input.slotKey) {
      throw new Error('الفترة والخط والمنتج والمراقب مطلوبة.');
    }
    const defectCount = input.defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
    if (defectCount > input.sampleCount) throw new Error('عدد العيوب لا يمكن أن يتجاوز عدد العينات.');
    if (defectCount > 0) assertQualityPermission('quality.defects.record');
    const inspector = await qualityStaffService.requireSelectableInspector({
      employeeId: input.inspectorEmployeeId,
      lineId: input.lineId,
    });
    const actor = currentQualityActor();
    const decision = defectCount > 0 ? 'مرفوض' : 'مقبول';
    const payload = stampTenant({
      moduleSource: 'qms',
      date: input.date,
      slotKey: input.slotKey,
      slotName: input.slotName,
      lineId: input.lineId,
      lineName: input.lineName,
      productId: input.productId,
      productName: input.productName,
      shiftId: input.shiftId,
      shiftName: input.shiftName,
      inspectorEmployeeId: inspector.id,
      inspectorName: inspector.name,
      sampleCount: input.sampleCount,
      defectCount,
      decision,
      sector: input.sector,
      notes: input.notes || '',
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    const id = input.id
      ? input.id
      : (await addDoc(qmsCollection(QMS_COLLECTIONS.HOURLY_SAMPLES), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      })).id;
    if (input.id) await updateDoc(qmsDoc(QMS_COLLECTIONS.HOURLY_SAMPLES, input.id), payload);
    await replaceChildDefects(QMS_COLLECTIONS.HOURLY_SAMPLES, id, activeTenantId(), input.defects);
    await auditQuality('QUALITY_RECORD_SAMPLE', 'حفظ عينة ساعية', { sampleId: id, decision });
  },

  async deleteHourly(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    await readQualityDoc(QMS_COLLECTIONS.HOURLY_SAMPLES, id);
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.HOURLY_SAMPLES, id));
    await auditQuality('QUALITY_RECORD_SAMPLE', 'حذف عينة ساعية', { sampleId: id });
  },

  async listPulls(date: string): Promise<QualityLinePull[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return listByTenantDate<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, activeTenantId(), 'date', date);
  },

  async listPullsRange(from: string, to: string): Promise<QualityLinePull[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return listByTenantDateRange<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, activeTenantId(), 'date', from, to);
  },

  async createPull(input: {
    date: string;
    slotKey: string;
    startTime: string;
    endTime: string;
    lineId: string;
    lineName: string;
    productionTagId?: string;
    productId: string;
    productName: string;
    stationId: string;
    stationName: string;
    inspectorEmployeeId: string;
    inspectorName: string;
    additionalInspectorEmployeeId?: string;
    additionalInspectorName?: string;
    additionalSampleCount?: number;
    additionalInspectors?: QualityAdditionalInspector[];
    sampleCount: number;
    rejectLimit?: number;
    sector: QualitySector;
    lineSector?: QualitySector | null;
    productSector?: QualitySector | null;
    defects?: QualityDefectLine[];
    decisionMode?: 'auto' | 'manual_accept' | 'manual_reject';
    notes?: string;
  }): Promise<void> {
    assertAnyQualityPermission(['quality.samples.inspect', 'quality.settings.manage']);
    assertIsoDate(input.date);
    assertSampleCount(input.sampleCount);
    assertSectorMatch(input.lineSector, input.productSector);
    if (!input.slotKey || !input.lineId || !input.productId || !input.stationId || !input.inspectorEmployeeId) {
      throw new Error('يرجى اختيار فترة السحب والخط والمنتج ومحطة الفحص والمراقب.');
    }
    const inspector = await qualityStaffService.requireSelectableInspector({
      employeeId: input.inspectorEmployeeId,
      lineId: input.lineId,
      stationId: input.stationId,
    });
    const additionalInspectorInput = input.additionalInspectors?.length
      ? input.additionalInspectors
      : input.additionalInspectorEmployeeId
        ? [{
          employeeId: input.additionalInspectorEmployeeId,
          employeeName: input.additionalInspectorName || '',
          sampleCount: input.additionalSampleCount || 0,
        }]
        : [];
    const additionalInspectors = validateAdditionalInspectorAssignments(
      additionalInspectorInput,
      inspector.id,
      input.sampleCount,
    );
    const technicians = await qualitySettingsService.listTechnicians();
    const technicianIds = new Set(technicians.map((technician) => technician.id));
    for (const assignment of additionalInspectors) {
      if (!technicianIds.has(assignment.employeeId)) {
        throw new Error(`فني الجودة «${assignment.employeeName}» غير نشط أو غير مسجل في الدليل.`);
      }
    }
    const additional = additionalInspectors[0];
    const additionalSampleCount = additionalInspectors.reduce((sum, item) => sum + item.sampleCount, 0);
    const rejectLimit = input.rejectLimit ?? 1;
    if (!Number.isInteger(rejectLimit) || rejectLimit < 0) {
      throw new Error('حد الرفض يجب أن يكون عددًا صحيحًا غير سالب.');
    }
    const actor = currentQualityActor();
    await addDoc(qmsCollection(QMS_COLLECTIONS.LINE_PULLS), stampTenant({
      moduleSource: 'qms',
      date: input.date,
      slotKey: input.slotKey,
      startTime: input.startTime,
      endTime: input.endTime,
      lineId: input.lineId,
      lineName: input.lineName,
      productionTagId: input.productionTagId || '',
      productId: input.productId,
      productName: input.productName,
      stationId: input.stationId,
      stationName: input.stationName,
      inspectorEmployeeId: inspector.id,
      inspectorName: inspector.name,
      additionalInspectors,
      additionalInspectorEmployeeId: additional?.employeeId || '',
      additionalInspectorName: additional?.employeeName || '',
      sampleCount: input.sampleCount,
      additionalSampleCount,
      sampleCountSemantics: 'base_plus_additional',
      rejectLimit,
      status: 'pending',
      defectCount: 0,
      palletRejected: null,
      sector: input.sector,
      notes: input.notes || '',
      createdAt: serverTimestamp(),
      createdByUid: actor.uid,
      createdByName: actor.name,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    }));
    await auditQuality('QUALITY_RECORD_SAMPLE', 'تسجيل سحبة عينات خط', {
      lineId: input.lineId,
      sampleCount: input.sampleCount,
    });
  },

  async updatePendingPull(id: string, input: {
    date: string;
    slotKey: string;
    startTime: string;
    endTime: string;
    lineId: string;
    lineName: string;
    productionTagId?: string;
    productId: string;
    productName: string;
    stationId: string;
    stationName: string;
    inspectorEmployeeId: string;
    inspectorName: string;
    additionalInspectorEmployeeId?: string;
    additionalInspectorName?: string;
    additionalSampleCount?: number;
    additionalInspectors?: QualityAdditionalInspector[];
    sampleCount: number;
    rejectLimit: number;
    sector: QualitySector;
    lineSector?: QualitySector | null;
    productSector?: QualitySector | null;
  }): Promise<void> {
    assertQualityPermission('quality.samples.inspect');
    const pull = await readQualityDoc<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, id);
    assertIsoDate(input.date);
    assertSampleCount(input.sampleCount);
    assertSectorMatch(input.lineSector, input.productSector);
    if (!input.slotKey || !input.lineId || !input.productId || !input.stationId || !input.inspectorEmployeeId) {
      throw new Error('الفترة والخط والمنتج ومحطة الفحص والمراقب مطلوبة.');
    }
    if (!Number.isInteger(input.rejectLimit) || input.rejectLimit < 0) {
      throw new Error('حد الرفض يجب أن يكون عددًا صحيحًا غير سالب.');
    }
    const inspector = await qualityStaffService.requireSelectableInspector({
      employeeId: input.inspectorEmployeeId,
      lineId: input.lineId,
      stationId: input.stationId,
    });
    const additionalInspectorInput = input.additionalInspectors?.length
      ? input.additionalInspectors
      : input.additionalInspectorEmployeeId
        ? [{
          employeeId: input.additionalInspectorEmployeeId,
          employeeName: input.additionalInspectorName || '',
          sampleCount: input.additionalSampleCount || 0,
        }]
        : [];
    const additionalInspectors = validateAdditionalInspectorAssignments(
      additionalInspectorInput,
      inspector.id,
      input.sampleCount,
    );
    const technicians = await qualitySettingsService.listTechnicians();
    const technicianIds = new Set(technicians.map((technician) => technician.id));
    for (const assignment of additionalInspectors) {
      if (!technicianIds.has(assignment.employeeId)) {
        throw new Error(`فني الجودة «${assignment.employeeName}» غير نشط أو غير مسجل في الدليل.`);
      }
    }
    const additional = additionalInspectors[0];
    const additionalSampleCount = additionalInspectors.reduce((sum, item) => sum + item.sampleCount, 0);
    const actor = currentQualityActor();
    const completedPatch: Record<string, unknown> = {};
    if (pull.status === 'completed') {
      const defects = input.defects || [];
      const defectCount = defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
      if (defects.some((defect) => !Number.isInteger(defect.count) || defect.count < 1)) {
        throw new Error('كل عيب يجب أن يكون له عدد صحيح موجب.');
      }
      if (defectCount > input.sampleCount) throw new Error('عدد العيوب لا يمكن أن يتجاوز إجمالي العينات المفحوصة.');
      completedPatch.defectCount = defectCount;
      completedPatch.palletRejected = resolveLinePullDecision(
        defectCount,
        input.rejectLimit,
        input.decisionMode || pull.decisionMode || 'auto',
      );
      completedPatch.decisionMode = input.decisionMode || pull.decisionMode || 'auto';
    }
    await updateDoc(qmsDoc(QMS_COLLECTIONS.LINE_PULLS, id), {
      date: input.date,
      slotKey: input.slotKey,
      startTime: input.startTime,
      endTime: input.endTime,
      lineId: input.lineId,
      lineName: input.lineName,
      productionTagId: input.productionTagId || '',
      productId: input.productId,
      productName: input.productName,
      stationId: input.stationId,
      stationName: input.stationName,
      inspectorEmployeeId: inspector.id,
      inspectorName: inspector.name,
      additionalInspectors,
      additionalInspectorEmployeeId: additional?.employeeId || '',
      additionalInspectorName: additional?.employeeName || '',
      sampleCount: input.sampleCount,
      additionalSampleCount,
      sampleCountSemantics: 'base_plus_additional',
      rejectLimit: input.rejectLimit,
      sector: input.sector,
      ...completedPatch,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_RECORD_SAMPLE', 'تعديل بيانات سحبة عينات خط', { pullId: id });
  },

  async completePull(id: string, input: {
    defects: QualityDefectLine[];
    rejectLimit: number;
    decisionMode?: 'auto' | 'manual_accept' | 'manual_reject';
  }): Promise<{ palletRejected: boolean; defectCount: number }> {
    assertQualityPermission('quality.samples.inspect');
    const pull = await readQualityDoc<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, id);
    if (pull.status === 'completed') throw new Error('تم إنهاء فحص هذه السحبة بالفعل.');
    if (input.defects.some((defect) => !Number.isInteger(defect.count) || defect.count < 1)) {
      throw new Error('كل عيب يجب أن يكون له عدد صحيح موجب.');
    }
    const defectCount = input.defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
    const inspectedCount = pull.sampleCount + (pull.sampleCountSemantics === 'base_plus_additional'
      ? Number(pull.additionalSampleCount || 0)
      : 0);
    if (defectCount > inspectedCount) throw new Error('عدد العيوب لا يمكن أن يتجاوز إجمالي العينات المفحوصة.');
    const rejectLimit = input.rejectLimit;
    const decisionMode = input.decisionMode || 'auto';
    const palletRejected = resolveLinePullDecision(defectCount, rejectLimit, decisionMode);
    const existingDefects = await getDocs(qmsChildCollection(QMS_COLLECTIONS.LINE_PULLS, id, 'defects'));
    if (defectCount > 0 || existingDefects.size > 0) assertQualityPermission('quality.defects.record');
    const actor = currentQualityActor();
    await replaceChildDefects(QMS_COLLECTIONS.LINE_PULLS, id, pull.tenantId, input.defects, {
      status: 'completed',
      defectCount,
      rejectLimit,
      palletRejected,
      decisionMode,
      completedAt: `${localTimeHm()}`,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_RECORD_SAMPLE', 'إنهاء سحبة عينات خط', { pullId: id, palletRejected, decisionMode });
    return { palletRejected, defectCount };
  },

  async savePendingPullDefects(id: string, defects: QualityDefectLine[]): Promise<number> {
    assertQualityPermission('quality.samples.inspect');
    const pull = await readQualityDoc<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, id);
    if (pull.status !== 'pending') throw new Error('لا يمكن تعديل العيوب إلا في سحبة قيد الفحص.');
    if (defects.some((defect) => !Number.isInteger(defect.count) || defect.count < 1)) {
      throw new Error('كل عيب يجب أن يكون له عدد صحيح موجب.');
    }
    const defectCount = defects.reduce((sum, defect) => sum + defect.count, 0);
    const inspectedCount = totalLinePullSampleCount(pull);
    if (defectCount > inspectedCount) throw new Error('عدد العيوب لا يمكن أن يتجاوز إجمالي العينات المفحوصة.');
    const existingDefects = await getDocs(qmsChildCollection(QMS_COLLECTIONS.LINE_PULLS, id, 'defects'));
    if (defectCount > 0 || existingDefects.size > 0) assertQualityPermission('quality.defects.record');
    const actor = currentQualityActor();
    await replaceChildDefects(QMS_COLLECTIONS.LINE_PULLS, id, pull.tenantId, defects, {
      defectCount,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_RECORD_SAMPLE', 'حفظ عيوب سحبة قيد الفحص', { pullId: id, defectCount });
    return defectCount;
  },

  async savePullEdit(
    id: string,
    defects: QualityDefectLine[],
    rejectLimit: number,
    decisionMode: 'auto' | 'manual_accept' | 'manual_reject' = 'auto',
  ): Promise<void> {
    assertQualityPermission('quality.samples.inspect');
    const pull = await readQualityDoc<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, id);
    if (defects.some((defect) => !Number.isInteger(defect.count) || defect.count < 1)) {
      throw new Error('كل عيب يجب أن يكون له عدد صحيح موجب.');
    }
    const defectCount = defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
    const inspectedCount = totalLinePullSampleCount(pull);
    if (defectCount > inspectedCount) throw new Error('عدد العيوب لا يمكن أن يتجاوز إجمالي العينات المفحوصة.');
    if (!Number.isInteger(rejectLimit) || rejectLimit < 0) {
      throw new Error('حد الرفض يجب أن يكون عددًا صحيحًا غير سالب.');
    }
    const palletRejected = resolveLinePullDecision(defectCount, rejectLimit, decisionMode);
    await replaceChildDefects(QMS_COLLECTIONS.LINE_PULLS, id, pull.tenantId, defects, {
      defectCount,
      rejectLimit,
      palletRejected,
      decisionMode,
      updatedAt: serverTimestamp(),
      updatedByUid: currentQualityActor().uid,
      updatedByName: currentQualityActor().name,
    });
    await auditQuality('QUALITY_RECORD_SAMPLE', 'تعديل عيوب سحبة عينات خط', {
      pullId: id,
      defectCount,
      palletRejected,
      decisionMode,
    });
  },

  async reopenPull(id: string, reason: string): Promise<void> {
    assertQualityPermission('quality.records.reopen');
    const text = assertRequiredText(reason, 'سبب إعادة الفتح مطلوب.');
    const pull = await readQualityDoc<QualityLinePull>(QMS_COLLECTIONS.LINE_PULLS, id);
    if (pull.status !== 'completed') throw new Error('يمكن إعادة فتح السحبة المكتملة فقط.');
    const actor = currentQualityActor();
    await updateDoc(qmsDoc(QMS_COLLECTIONS.LINE_PULLS, id), {
      status: 'pending',
      palletRejected: null,
      reopenReason: text,
      reopenedByUid: actor.uid,
      reopenedByName: actor.name,
      completedAt: null,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_REOPEN_RECORD', 'إعادة فتح سحبة عينات', { pullId: id, reason: text });
  },

  async deletePull(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    await readQualityDoc(QMS_COLLECTIONS.LINE_PULLS, id);
    const defects = await getDocs(qmsChildCollection(QMS_COLLECTIONS.LINE_PULLS, id, 'defects'));
    const batch = writeBatch(db);
    defects.docs.forEach((item) => batch.delete(item.ref));
    batch.delete(qmsDoc(QMS_COLLECTIONS.LINE_PULLS, id));
    await batch.commit();
    await auditQuality('QUALITY_RECORD_SAMPLE', 'حذف سحبة عينات', { pullId: id });
  },

  async listPeriodStatuses(date: string): Promise<QualityPeriodStatus[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return listByTenantDate<QualityPeriodStatus>(QMS_COLLECTIONS.PERIOD_STATUSES, activeTenantId(), 'date', date);
  },

  async savePeriodStatus(input: { date: string; slotKey: string; lineId: string; isStopped: boolean; noSampleReason: string }): Promise<void> {
    assertQualityPermission('quality.samples.inspect');
    assertIsoDate(input.date);
    if (!input.slotKey || !input.lineId) throw new Error('الفترة والخط مطلوبان لتسجيل حالة عدم السحب.');
    if (!input.isStopped && !input.noSampleReason.trim()) {
      throw new Error('اكتب سبب عدم السحب أو سجّل أن الخط متوقف.');
    }
    const actor = currentQualityActor();
    const id = [activeTenantId(), input.date, input.slotKey, input.lineId]
      .map((part) => part.replace(/[^A-Za-z0-9_-]/g, '_'))
      .join('__');
    const { setDoc } = await import('firebase/firestore');
    await setDoc(qmsDoc(QMS_COLLECTIONS.PERIOD_STATUSES, id), stampTenant({
      date: input.date,
      slotKey: input.slotKey,
      lineId: input.lineId,
      isStopped: input.isStopped,
      noSampleReason: input.noSampleReason.trim(),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    }), { merge: true });
  },

  async withHourlyDefects(rows: QualityHourlySample[]): Promise<QualityHourlySample[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return Promise.all(rows.map(async (row) => ({
      ...row,
      defects: await loadSampleDefects(QMS_COLLECTIONS.HOURLY_SAMPLES, row.id),
    })));
  },

  async withPullDefects(rows: QualityLinePull[]): Promise<QualityLinePull[]> {
    assertAnyQualityPermission(['quality.samples.view', 'quality.reports.view']);
    return Promise.all(rows.map(async (row) => ({
      ...row,
      defects: await loadSampleDefects(QMS_COLLECTIONS.LINE_PULLS, row.id),
    })));
  },
};
