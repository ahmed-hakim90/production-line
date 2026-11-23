import { getDoc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, doc, runTransaction } from 'firebase/firestore';
import { assertAqlPlanRange, STANDARD_AQL_LEVEL_II, type AqlPlanRange } from '../domain/aql';
import { assertSlotWindow, STANDARD_SAMPLE_SLOTS } from '../domain/time';
import type {
  QualityProductionTag,
  QualityReason,
  QualitySampleSlot,
  QualitySectorTag,
  QualityShiftOption,
  QualityStation,
  QualityTechnician,
} from '../model';
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
  lineSampleRejectLimit: number;
}

const DEFAULT_POLICIES: QualityPolicySettings = {
  closeRequiresQualityApproval: false,
  lineSampleRejectLimit: 1,
};

function createdAtOrder(row: { createdAt?: { toMillis?: () => number } | string }): number {
  if (typeof row.createdAt === 'string') return Date.parse(row.createdAt) || 0;
  return typeof row.createdAt?.toMillis === 'function' ? row.createdAt.toMillis() : 0;
}

async function settingsRef() {
  requireQualityDb();
  return qmsDoc(QMS_COLLECTIONS.SETTINGS, activeTenantId());
}

async function readSettingsArray<T>(field: string): Promise<T[]> {
  const snap = await getDoc(await settingsRef());
  if (!snap.exists()) return [];
  const value = snap.data()[field];
  return Array.isArray(value) ? value as T[] : [];
}

async function updateSettingsArray<T>(field: string, update: (rows: T[]) => T[]): Promise<void> {
  const ref = await settingsRef();
  const actor = currentQualityActor();
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const value = snap.exists() ? snap.data()[field] : undefined;
    const rows = Array.isArray(value) ? value as T[] : [];
    transaction.set(ref, stampTenant({
      [field]: update(rows),
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    }), { merge: true });
  });
}

export const qualitySettingsService = {
  async getPolicies(): Promise<QualityPolicySettings> {
    requireQualityDb();
    const snap = await getDoc(await settingsRef());
    if (!snap.exists()) return DEFAULT_POLICIES;
    const data = snap.data();
    return {
      closeRequiresQualityApproval: data.closeRequiresQualityApproval === true,
      lineSampleRejectLimit: Number.isInteger(data.lineSampleRejectLimit) && data.lineSampleRejectLimit >= 0
        ? data.lineSampleRejectLimit
        : DEFAULT_POLICIES.lineSampleRejectLimit,
    };
  },

  async setPolicies(policies: Partial<QualityPolicySettings>): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    if (policies.lineSampleRejectLimit != null
      && (!Number.isInteger(policies.lineSampleRejectLimit) || policies.lineSampleRejectLimit < 0)) {
      throw new Error('حد الرفض يجب أن يكون عددًا صحيحًا غير سالب.');
    }
    const actor = currentQualityActor();
    const policyPatch = {
      ...(policies.closeRequiresQualityApproval == null
        ? {}
        : { closeRequiresQualityApproval: policies.closeRequiresQualityApproval === true }),
      ...(policies.lineSampleRejectLimit == null
        ? {}
        : { lineSampleRejectLimit: policies.lineSampleRejectLimit }),
    };
    await setDoc(await settingsRef(), stampTenant({
      ...policyPatch,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    }), { merge: true });
    await auditQuality('QUALITY_SET_POLICIES', 'تحديث سياسة إعدادات الجودة', {
      ...policyPatch,
    });
  },

  async listReasons(): Promise<QualityReason[]> {
    return listByTenant<QualityReason>(QMS_COLLECTIONS.REASONS, activeTenantId());
  },

  async saveReason(input: Omit<QualityReason, 'id' | 'tenantId' | 'code'> & { id?: string; code?: string }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const labelAr = input.labelAr.trim();
    if (!labelAr) throw new Error('اسم العيب مطلوب.');
    const actor = currentQualityActor();
    const tenantId = activeTenantId();
    const existing = await this.listReasons();
    const editing = existing.find((reason) => reason.id === input.id);
    const code = input.code?.trim() || editing?.code || `DEF-Q-${doc(qmsCollection(QMS_COLLECTIONS.REASONS)).id.slice(0, 8).toUpperCase()}`;
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

  async listManagedSlots(kind: 'hourly' | 'line'): Promise<QualitySampleSlot[]> {
    const stored = await listByTenant<QualitySampleSlot>(QMS_COLLECTIONS.SLOTS, activeTenantId());
    const custom = stored
      .filter((slot) => slot.kind === kind)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.startTime.localeCompare(b.startTime));
    if (custom.length > 0) return custom;
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

  async hideSlot(id: string): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const slot = (await listByTenant<QualitySampleSlot>(QMS_COLLECTIONS.SLOTS, activeTenantId()))
      .find((item) => item.id === id);
    if (!slot) throw new Error('فترة السحب غير موجودة.');
    const actor = currentQualityActor();
    await updateDoc(qmsDoc(QMS_COLLECTIONS.SLOTS, id), {
      isActive: false,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    await auditQuality('QUALITY_SET_POLICIES', 'إيقاف فترة سحب مع الإبقاء على السحبات السابقة', {
      slotId: id,
      slotName: slot.slotName,
    });
  },

  async listStations(options?: { includeInactive?: boolean }): Promise<QualityStation[]> {
    const rows = await listByTenant<QualityStation>(QMS_COLLECTIONS.STATIONS, activeTenantId());
    return rows
      .filter((station) => options?.includeInactive || station.isActive !== false)
      .sort((a, b) => createdAtOrder(a) - createdAtOrder(b)
        || (a.displayOrder || 0) - (b.displayOrder || 0)
        || a.name.localeCompare(b.name));
  },

  async listTechnicians(options?: { includeInactive?: boolean }): Promise<QualityTechnician[]> {
    const rows = await readSettingsArray<QualityTechnician>('qualityTechnicians');
    return rows
      .filter((technician) => options?.includeInactive || technician.isActive !== false)
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0) || a.name.localeCompare(b.name));
  },

  async saveTechnician(input: { id?: string; name: string; code: string }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const name = input.name.trim();
    const code = input.code.trim();
    if (!name || !code) throw new Error('اسم فني الجودة والكود مطلوبان.');
    const actor = currentQualityActor();
    const id = input.id || doc(qmsCollection(QMS_COLLECTIONS.SETTINGS)).id;
    await updateSettingsArray<QualityTechnician>('qualityTechnicians', (technicians) => {
      if (technicians.some((technician) => technician.code.toLocaleLowerCase() === code.toLocaleLowerCase()
        && technician.id !== id)) {
        throw new Error('كود فني الجودة مسجل بالفعل.');
      }
      const existing = technicians.find((technician) => technician.id === id);
      const technician: QualityTechnician = {
        id,
        tenantId: activeTenantId(),
        name,
        code,
        displayOrder: existing?.displayOrder ?? Math.max(0, ...technicians.map((item) => item.displayOrder || 0)) + 1,
        isActive: true,
      };
      return [...technicians.filter((item) => item.id !== id), technician];
    });
    await auditQuality('QUALITY_SET_POLICIES', `حفظ فني جودة: ${name}`, { code });
  },

  async hideTechnician(id: string): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const stations = await this.listStations();
    if (stations.some((station) => station.defaultInspectorTechnicianId === id)) {
      throw new Error('أعد تعيين فني المحطات النشطة قبل إيقاف هذا الفني.');
    }
    await updateSettingsArray<QualityTechnician>('qualityTechnicians', (technicians) => {
      if (!technicians.some((technician) => technician.id === id)) throw new Error('فني الجودة غير موجود.');
      return technicians.map((technician) => technician.id === id ? { ...technician, isActive: false } : technician);
    });
    await auditQuality('QUALITY_SET_POLICIES', 'إيقاف فني جودة مع الإبقاء على المحطات والسحبات السابقة', {
      technicianId: id,
    });
  },

  async saveStation(input: { id?: string; name: string; defaultInspectorTechnicianId: string }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const name = input.name.trim();
    if (!name) throw new Error('اسم محطة الفحص مطلوب.');
    const technician = (await this.listTechnicians()).find((item) => item.id === input.defaultInspectorTechnicianId);
    if (!technician) throw new Error('اختر فني جودة نشطًا من الدليل.');
    const stations = await this.listStations({ includeInactive: true });
    if (stations.some((station) => station.name === name && station.id !== input.id)) {
      throw new Error('اسم محطة الفحص مسجل بالفعل.');
    }
    const actor = currentQualityActor();
    const stationRef = input.id ? qmsDoc(QMS_COLLECTIONS.STATIONS, input.id) : doc(qmsCollection(QMS_COLLECTIONS.STATIONS));
    const existing = stations.find((station) => station.id === input.id);
    const payload = stampTenant({
      name,
      defaultInspectorName: technician.name,
      defaultInspectorEmployeeId: stationRef.id,
      defaultInspectorTechnicianId: technician.id,
      displayOrder: existing?.displayOrder ?? Math.max(0, ...stations.map((item) => item.displayOrder || 0)) + 1,
      isActive: true,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) await updateDoc(stationRef, payload);
    else await setDoc(stationRef, { ...payload, createdAt: serverTimestamp() });
    await auditQuality('QUALITY_SET_POLICIES', `حفظ محطة فحص: ${name}`, { name });
  },

  async hideStation(id: string): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    await updateDoc(qmsDoc(QMS_COLLECTIONS.STATIONS, id), { isActive: false, updatedAt: serverTimestamp() });
    await auditQuality('QUALITY_SET_POLICIES', 'إخفاء محطة فحص مع الإبقاء على السحبات السابقة', { stationId: id });
  },

  async listProductionTags(options?: { includeInactive?: boolean }): Promise<QualityProductionTag[]> {
    const rows = await readSettingsArray<QualityProductionTag>('qualityProductionTags');
    return rows
      .filter((tag) => options?.includeInactive || tag.isActive !== false)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  },

  async saveProductionTag(input: {
    id?: string;
    lineId?: string;
    lineName: string;
    productId: string;
    productName: string;
    sector: QualitySector;
  }): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    const lineName = input.lineName.trim();
    const productId = input.productId.trim();
    const productName = input.productName.trim();
    if (!lineName || !productId || !productName) {
      throw new Error('اسم الخط والمنتج مطلوبان لإضافة الوسم.');
    }
    const actor = currentQualityActor();
    const id = input.id || doc(qmsCollection(QMS_COLLECTIONS.SETTINGS)).id;
    await updateSettingsArray<QualityProductionTag>('qualityProductionTags', (existingTags) => {
      const duplicate = existingTags.find((tag) => tag.id !== id
        && tag.productId === productId
        && (input.lineId
          ? tag.lineId === input.lineId
          : !tag.lineId && tag.lineName.trim().toLocaleLowerCase() === lineName.toLocaleLowerCase()));
      if (duplicate) throw new Error('وسم الخط والمنتج مسجل بالفعل.');
      const existing = existingTags.find((tag) => tag.id === id);
      const tag: QualityProductionTag = {
        id,
        tenantId: activeTenantId(),
        lineId: input.lineId || '',
        lineName,
        productId,
        productName,
        sector: input.sector,
        displayOrder: existing?.displayOrder ?? Math.max(0, ...existingTags.map((item) => item.displayOrder || 0)) + 1,
        isActive: true,
      };
      return [...existingTags.filter((item) => item.id !== id), tag];
    });
    await auditQuality('QUALITY_SET_POLICIES', `حفظ وسم خط إنتاج: ${lineName} — ${productName}`, {
      lineId: input.lineId || '',
      productId,
      sector: input.sector,
    });
  },

  async hideProductionTag(id: string): Promise<void> {
    assertQualityPermission('quality.settings.manage');
    await updateSettingsArray<QualityProductionTag>('qualityProductionTags', (tags) => {
      if (!tags.some((tag) => tag.id === id)) throw new Error('وسم خط الإنتاج غير موجود.');
      return tags.map((tag) => tag.id === id ? { ...tag, isActive: false } : tag);
    });
    await auditQuality('QUALITY_SET_POLICIES', 'إيقاف وسم خط إنتاج مع الإبقاء على السحبات السابقة', { tagId: id });
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
