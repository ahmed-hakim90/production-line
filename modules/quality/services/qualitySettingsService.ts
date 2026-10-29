import { getDoc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { assertAqlPlanRange, STANDARD_AQL_LEVEL_II, type AqlPlanRange } from '../domain/aql';
import { assertSlotWindow, STANDARD_SAMPLE_SLOTS } from '../domain/time';
import type { QualityReason, QualitySampleSlot, QualitySectorTag, QualityShiftOption, QualityStation } from '../model';
import { qualityStaffService } from './qualityStaffService';
import type { QualitySector } from '../domain/sector';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertQualityPermission,
  auditQuality,
  currentQualityActor,
  listByTenant,
  qmsCollection,
  qmsDoc,
  requireQualityDb,
  stampTenant,
} from './qualityGateway';
import { getDocs, query, where } from 'firebase/firestore';
import { HR_COLLECTIONS } from '@/modules/hr/collections';
import { collection } from 'firebase/firestore';
import { db } from '@/services/firebase';

export interface QualityPolicySettings {
  closeRequiresQualityApproval: boolean;
}

const DEFAULT_POLICIES: QualityPolicySettings = { closeRequiresQualityApproval: false };

async function settingsRef() {
  requireQualityDb();
  return qmsDoc(QMS_COLLECTIONS.SETTINGS, activeTenantId());
}

export const qualitySettingsService = {
  async getPolicies(): Promise<QualityPolicySettings> {
    requireQualityDb();
    const snap = await getDoc(await settingsRef());
    if (!snap.exists()) return DEFAULT_POLICIES;
    return { closeRequiresQualityApproval: snap.data().closeRequiresQualityApproval === true };
  },

  async setPolicies(policies: QualityPolicySettings): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const actor = currentQualityActor();
    await setDoc(await settingsRef(), stampTenant({
      closeRequiresQualityApproval: policies.closeRequiresQualityApproval === true,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    }), { merge: true });
    await auditQuality('QUALITY_SET_POLICIES', 'تحديث سياسة إغلاق أمر الشغل من الجودة', {
      closeRequiresQualityApproval: policies.closeRequiresQualityApproval,
    });
  },

  async listReasons(): Promise<QualityReason[]> {
    return listByTenant<QualityReason>(QMS_COLLECTIONS.REASONS, activeTenantId());
  },

  async saveReason(input: Omit<QualityReason, 'id' | 'tenantId'> & { id?: string }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const code = input.code.trim();
    const labelAr = input.labelAr.trim();
    if (!code || !labelAr) throw new Error('رمز السبب والاسم مطلوبان.');
    const actor = currentQualityActor();
    const tenantId = activeTenantId();
    const existing = await this.listReasons();
    const duplicate = existing.find((reason) => reason.code === code && reason.id !== input.id);
    if (duplicate) throw new Error('رمز سبب العيب مستخدم بالفعل.');
    const duplicateName = existing.find((reason) => reason.isActive !== false && reason.labelAr === labelAr && reason.id !== input.id);
    if (duplicateName) throw new Error('اسم سبب العيب مستخدم بالفعل.');
    const payload = stampTenant({
      code,
      labelAr,
      category: input.category.trim() || 'عام',
      sector: input.sector || null,
      isActive: input.isActive !== false,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await updateDoc(qmsDoc(QMS_COLLECTIONS.REASONS, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.REASONS), {
        ...payload,
        tenantId,
        createdAt: serverTimestamp(),
      });
    }
    await auditQuality('QUALITY_UPDATE_REASON', `حفظ سبب عيب: ${labelAr}`, { code });
  },

  async deactivateReason(id: string): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    await updateDoc(qmsDoc(QMS_COLLECTIONS.REASONS, id), { isActive: false, updatedAt: serverTimestamp() });
    await auditQuality('QUALITY_DELETE_REASON', 'إيقاف سبب عيب', { reasonId: id });
  },

  async listAqlPlans(): Promise<AqlPlanRange[]> {
    const rows = await listByTenant<AqlPlanRange>(QMS_COLLECTIONS.AQL_PLANS, activeTenantId());
    return rows.sort((a, b) => a.batchMin - b.batchMin);
  },

  /** Effective plans: saved tenant rows when any are active, otherwise the standard Level II table. */
  async effectiveAqlPlans(): Promise<AqlPlanRange[]> {
    const saved = await this.listAqlPlans();
    const active = saved.filter((plan) => plan.isActive);
    return active.length > 0 ? active : STANDARD_AQL_LEVEL_II;
  },

  async saveAqlPlan(input: AqlPlanRange): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    assertAqlPlanRange(input);
    const actor = currentQualityActor();
    const payload = stampTenant({
      batchMin: input.batchMin,
      batchMax: input.batchMax,
      sampleSize: input.sampleSize,
      acceptLimit: input.acceptLimit,
      rejectLimit: input.rejectLimit,
      aqlLevel: input.aqlLevel || 'المستوى العام الثاني (Level II)',
      notes: input.notes || '',
      isActive: input.isActive !== false,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) await updateDoc(qmsDoc(QMS_COLLECTIONS.AQL_PLANS, input.id), payload);
    else await addDoc(qmsCollection(QMS_COLLECTIONS.AQL_PLANS), { ...payload, createdAt: serverTimestamp() });
    await auditQuality('QUALITY_UPSERT_SAMPLING_PLAN', 'حفظ نطاق فحص AQL', {
      batchMin: input.batchMin,
      batchMax: input.batchMax,
    });
  },

  async listSlots(kind: 'hourly' | 'line'): Promise<QualitySampleSlot[]> {
    const rows = await listByTenant<QualitySampleSlot>(QMS_COLLECTIONS.SLOTS, activeTenantId());
    const custom = rows.filter((slot) => slot.kind === kind).sort((a, b) => a.displayOrder - b.displayOrder);
    if (custom.some((slot) => slot.isActive)) return custom.filter((slot) => slot.isActive);
    return STANDARD_SAMPLE_SLOTS.map((slot) => ({
      ...slot,
      id: slot.slotKey,
      tenantId: activeTenantId(),
      kind,
      isActive: true,
    }));
  },

  async saveSlot(input: Omit<QualitySampleSlot, 'tenantId' | 'id'> & { id?: string }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const stored = await listByTenant<QualitySampleSlot>(QMS_COLLECTIONS.SLOTS, activeTenantId());
    assertSlotWindow({
      startTime: input.startTime,
      endTime: input.endTime,
      kind: input.kind,
      id: input.id,
      existing: stored,
    });
    const actor = currentQualityActor();
    const payload = stampTenant({
      slotKey: input.slotKey || `${input.kind}-${input.startTime}-${input.endTime}`,
      slotName: input.slotName || `${input.startTime} - ${input.endTime}`,
      startTime: input.startTime,
      endTime: input.endTime,
      displayOrder: input.displayOrder || 1,
      kind: input.kind,
      isActive: input.isActive !== false,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id && !input.id.startsWith('standard-')) {
      await updateDoc(qmsDoc(QMS_COLLECTIONS.SLOTS, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.SLOTS), { ...payload, createdAt: serverTimestamp() });
    }
    await auditQuality('QUALITY_SET_POLICIES', 'حفظ فترة سحب عينات', { slotName: payload.slotName });
  },

  async listStations(options?: { includeInactive?: boolean }): Promise<QualityStation[]> {
    const rows = await listByTenant<QualityStation>(QMS_COLLECTIONS.STATIONS, activeTenantId());
    return options?.includeInactive ? rows : rows.filter((station) => station.isActive !== false);
  },

  async saveStation(input: { id?: string; name: string; defaultInspectorEmployeeId?: string }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const name = input.name.trim();
    if (!name) throw new Error('اسم محطة الفحص مطلوب.');
    if (!input.defaultInspectorEmployeeId) throw new Error('اختر المراقب المسؤول عن محطة الفحص.');
    await qualityStaffService.requireSelectableInspector({
      employeeId: input.defaultInspectorEmployeeId,
      stationId: input.id,
      stationIsNew: !input.id,
    });
    const stations = await this.listStations();
    if (stations.some((station) => station.name === name && station.id !== input.id)) {
      throw new Error('اسم محطة الفحص مسجل بالفعل.');
    }
    const actor = currentQualityActor();
    const payload = stampTenant({
      name,
      defaultInspectorEmployeeId: input.defaultInspectorEmployeeId || null,
      isActive: true,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) await updateDoc(qmsDoc(QMS_COLLECTIONS.STATIONS, input.id), payload);
    else await addDoc(qmsCollection(QMS_COLLECTIONS.STATIONS), { ...payload, createdAt: serverTimestamp() });
    await auditQuality('QUALITY_SET_POLICIES', `حفظ محطة فحص: ${name}`, { name });
  },

  async hideStation(id: string): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    await updateDoc(qmsDoc(QMS_COLLECTIONS.STATIONS, id), { isActive: false, updatedAt: serverTimestamp() });
    await auditQuality('QUALITY_SET_POLICIES', 'إخفاء محطة فحص مع الإبقاء على السحبات السابقة', { stationId: id });
  },

  async listSectorTags(): Promise<QualitySectorTag[]> {
    return listByTenant<QualitySectorTag>(QMS_COLLECTIONS.SECTOR_TAGS, activeTenantId());
  },

  async saveSectorTag(input: { entityType: 'product' | 'line'; entityId: string; sector: QualitySector }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const existing = await this.listSectorTags();
    const match = existing.find((tag) => tag.entityType === input.entityType && tag.entityId === input.entityId);
    const payload = stampTenant({
      entityType: input.entityType,
      entityId: input.entityId,
      sector: input.sector,
      updatedAt: serverTimestamp(),
    });
    if (match?.id) await updateDoc(qmsDoc(QMS_COLLECTIONS.SECTOR_TAGS, match.id), payload);
    else await addDoc(qmsCollection(QMS_COLLECTIONS.SECTOR_TAGS), payload);
  },

  async listShifts(): Promise<QualityShiftOption[]> {
    requireQualityDb();
    const tenantId = activeTenantId();
    const snap = await getDocs(query(collection(db, HR_COLLECTIONS.SHIFTS), where('tenantId', '==', tenantId)));
    return snap.docs
      .map((item) => ({ id: item.id, ...item.data() }) as QualityShiftOption & { isActive?: boolean })
      .filter((shift) => shift.isActive !== false && shift.id)
      .map((shift) => ({
        id: shift.id,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
      }));
  },

  subscribeReasons(onData: (rows: QualityReason[]) => void): () => void {
    const tenantId = activeTenantId();
    return onSnapshot(
      query(qmsCollection(QMS_COLLECTIONS.REASONS), where('tenantId', '==', tenantId)),
      (snap) => onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as QualityReason)),
      () => onData([]),
    );
  },
};

export { deleteDoc };
