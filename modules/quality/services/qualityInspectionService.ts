import {
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { activityLogService } from '@/services/activityLogService';
import type {
  FileAttachmentMeta,
  QualityCAPA,
  QualityDefect,
  QualityInspection,
  QualityInspectionStatus,
  QualityInspectionType,
  QualityReworkOrder,
  WorkOrderQualitySummary,
} from '@/types';
import {
  qualityCAPARef,
  qualityDefectsRef,
  qualityInspectionsRef,
  qualityReworkOrdersRef,
} from '../collections';

const toMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

const asSummary = (inspections: QualityInspection[], defects: QualityDefect[]): WorkOrderQualitySummary => {
  const inspectedUnits = inspections.length;
  const passedUnits = inspections.filter((i) => i.status === 'passed' || i.status === 'approved').length;
  const failedUnits = inspections.filter((i) => i.status === 'failed' || i.status === 'rejected').length;
  const reworkUnits = inspections.filter((i) => i.status === 'rework').length;
  const defectRate = inspectedUnits > 0 ? Number((((failedUnits + reworkUnits) / inspectedUnits) * 100).toFixed(2)) : 0;
  const firstPassYield = inspectedUnits > 0 ? Number(((passedUnits / inspectedUnits) * 100).toFixed(2)) : 0;
  const sortedInspections = [...inspections].sort((a, b) => toMillis(b.inspectedAt) - toMillis(a.inspectedAt));
  const topDefectReason = defects.length === 0
    ? undefined
    : Object.entries(defects.reduce<Record<string, number>>((acc, d) => {
        acc[d.reasonLabel] = (acc[d.reasonLabel] ?? 0) + (d.quantity || 1);
        return acc;
      }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];

  return {
    inspectedUnits,
    passedUnits,
    failedUnits,
    reworkUnits,
    defectRate,
    firstPassYield,
    lastInspectionAt: sortedInspections[0]?.inspectedAt,
    topDefectReason,
  };
};

export const qualityInspectionService = {
  async createInspection(payload: {
    workOrderId: string;
    lineId: string;
    productId: string;
    sessionId?: string;
    serialBarcode?: string;
    type: QualityInspectionType;
    status: QualityInspectionStatus;
    inspectedBy: string;
    notes?: string;
    attachments?: FileAttachmentMeta[];
  }): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(qualityInspectionsRef(), {
      ...payload,
      inspectedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_CREATE_INSPECTION',
      `تسجيل فحص جودة (${payload.type})`,
      { inspectionId: ref.id, workOrderId: payload.workOrderId, status: payload.status },
    );
    return ref.id;
  },

  async updateInspection(id: string, payload: Partial<Omit<QualityInspection, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(qualityInspectionsRef(), id), payload as Record<string, any>);
    await activityLogService.logCurrentUser(
      'QUALITY_UPDATE_INSPECTION',
      'تحديث فحص جودة',
      { inspectionId: id, changes: payload },
    );
  },

  async createDefect(payload: Omit<QualityDefect, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(qualityDefectsRef(), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_CREATE_DEFECT',
      `تسجيل عيب جودة: ${payload.reasonLabel}`,
      { defectId: ref.id, workOrderId: payload.workOrderId, severity: payload.severity },
    );
    return ref.id;
  },

  async createRework(payload: Omit<QualityReworkOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(qualityReworkOrdersRef(), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_CREATE_REWORK',
      'إنشاء أمر إعادة تشغيل',
      { reworkId: ref.id, workOrderId: payload.workOrderId, defectId: payload.defectId },
    );
    return ref.id;
  },

  async updateRework(id: string, payload: Partial<Omit<QualityReworkOrder, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(qualityReworkOrdersRef(), id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_UPDATE_REWORK',
      'تحديث أمر إعادة تشغيل',
      { reworkId: id, changes: payload },
    );
  },

  async createCAPA(payload: Omit<QualityCAPA, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(qualityCAPARef(), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_CREATE_CAPA',
      `إنشاء CAPA: ${payload.title}`,
      { capaId: ref.id, workOrderId: payload.workOrderId, reasonCode: payload.reasonCode },
    );
    return ref.id;
  },

  async updateCAPA(id: string, payload: Partial<Omit<QualityCAPA, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(qualityCAPARef(), id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_UPDATE_CAPA',
      'تحديث CAPA',
      { capaId: id, changes: payload },
    );
  },

  async getInspectionsByWorkOrder(workOrderId: string): Promise<QualityInspection[]> {
    if (!isConfigured) return [];
    const q = query(qualityInspectionsRef(), where('workOrderId', '==', workOrderId), orderBy('inspectedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityInspection));
  },

  async getDefectsByWorkOrder(workOrderId: string): Promise<QualityDefect[]> {
    if (!isConfigured) return [];
    const q = query(qualityDefectsRef(), where('workOrderId', '==', workOrderId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityDefect));
  },

  async getReworkByWorkOrder(workOrderId: string): Promise<QualityReworkOrder[]> {
    if (!isConfigured) return [];
    const q = query(qualityReworkOrdersRef(), where('workOrderId', '==', workOrderId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityReworkOrder));
  },

  async getCAPA(): Promise<QualityCAPA[]> {
    if (!isConfigured) return [];
    const q = query(qualityCAPARef(), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityCAPA));
  },

  async buildWorkOrderSummary(workOrderId: string): Promise<WorkOrderQualitySummary> {
    const [inspections, defects] = await Promise.all([
      this.getInspectionsByWorkOrder(workOrderId),
      this.getDefectsByWorkOrder(workOrderId),
    ]);
    return asSummary(inspections, defects);
  },

  subscribeInspectionsByType(type: QualityInspectionType, cb: (rows: QualityInspection[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(qualityInspectionsRef(), where('type', '==', type), orderBy('inspectedAt', 'desc'));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityInspection))));
  },

  subscribeRework(cb: (rows: QualityReworkOrder[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(qualityReworkOrdersRef(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityReworkOrder))));
  },

  subscribeCAPA(cb: (rows: QualityCAPA[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(qualityCAPARef(), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityCAPA))));
  },
};
