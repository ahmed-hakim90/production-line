import {
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { activityLogService } from '@/services/activityLogService';
import type {
  QualityInspectionTemplate,
  QualityPolicySettings,
  QualityPrintTemplateSettings,
  QualityReasonCatalogItem,
  QualityReworkPolicySettings,
  QualitySamplingPlan,
  QualitySettingsDocument,
} from '@/types';
import { qualityReasonCatalogRef, qualitySettingsDocRef } from '../collections';

const DEFAULT_POLICIES: QualityPolicySettings = {
  closeRequiresQualityApproval: false,
};

const DEFAULT_REWORK_POLICIES: QualityReworkPolicySettings = {
  autoCreateReworkOnFail: true,
  allowDirectScrap: false,
  requireCapaForCritical: true,
};

const DEFAULT_PRINT_TEMPLATES: QualityPrintTemplateSettings = {
  headerText: 'تقرير الجودة',
  footerText: 'تم الإنشاء بواسطة نظام الإنتاج',
  showSignatureInspector: true,
  showSignatureSupervisor: true,
  showSignatureQualityManager: true,
};

const DEFAULT_SETTINGS_HUB: QualitySettingsDocument = {
  closeRequiresQualityApproval: false,
  inspectionTemplates: [],
  samplingPlans: [],
  reworkPolicies: DEFAULT_REWORK_POLICIES,
  printTemplates: DEFAULT_PRINT_TEMPLATES,
};

export const qualitySettingsService = {
  async getSettingsHub(): Promise<QualitySettingsDocument> {
    if (!isConfigured) return DEFAULT_SETTINGS_HUB;
    const snap = await getDoc(qualitySettingsDocRef());
    if (!snap.exists()) return DEFAULT_SETTINGS_HUB;
    const data = snap.data() as Partial<QualitySettingsDocument>;
    return {
      ...DEFAULT_SETTINGS_HUB,
      ...data,
      inspectionTemplates: Array.isArray(data.inspectionTemplates) ? data.inspectionTemplates : [],
      samplingPlans: Array.isArray(data.samplingPlans) ? data.samplingPlans : [],
      reworkPolicies: {
        ...DEFAULT_REWORK_POLICIES,
        ...(data.reworkPolicies ?? {}),
      },
      printTemplates: {
        ...DEFAULT_PRINT_TEMPLATES,
        ...(data.printTemplates ?? {}),
      },
    };
  },

  async setSettingsHub(payload: Partial<QualitySettingsDocument>): Promise<void> {
    if (!isConfigured) return;
    await setDoc(
      qualitySettingsDocRef(),
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (payload.reworkPolicies) {
      await activityLogService.logCurrentUser(
        'QUALITY_UPDATE_REWORK_POLICIES',
        'تحديث سياسات إعادة التشغيل',
        { reworkPolicies: payload.reworkPolicies },
      );
    }
    if (payload.printTemplates) {
      await activityLogService.logCurrentUser(
        'QUALITY_UPDATE_PRINT_TEMPLATES',
        'تحديث إعدادات طباعة الجودة',
        { printTemplates: payload.printTemplates },
      );
    }
  },

  async getPolicies(): Promise<QualityPolicySettings> {
    if (!isConfigured) return DEFAULT_POLICIES;
    const snap = await getDoc(qualitySettingsDocRef());
    if (!snap.exists()) return DEFAULT_POLICIES;
    return {
      ...DEFAULT_POLICIES,
      ...(snap.data() as Partial<QualityPolicySettings>),
    };
  },

  async setPolicies(payload: QualityPolicySettings): Promise<void> {
    if (!isConfigured) return;
    await setDoc(
      qualitySettingsDocRef(),
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await activityLogService.logCurrentUser(
      'QUALITY_SET_POLICIES',
      'تحديث سياسات الجودة',
      { policies: payload },
    );
  },

  async getReasons(onlyActive = false): Promise<QualityReasonCatalogItem[]> {
    if (!isConfigured) return [];
    const q = query(qualityReasonCatalogRef(), orderBy('labelAr', 'asc'));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityReasonCatalogItem));
    return onlyActive ? rows.filter((row) => row.isActive) : rows;
  },

  async createReason(payload: Omit<QualityReasonCatalogItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    const ref = await addDoc(qualityReasonCatalogRef(), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_UPDATE_REASON',
      `إضافة سبب عيب: ${payload.labelAr}`,
      { reasonId: ref.id, code: payload.code, category: payload.category },
    );
    return ref.id;
  },

  async seedDefaultReasons(): Promise<void> {
    if (!isConfigured) return;
    const existing = await this.getReasons(false);
    if (existing.length > 0) return;
    const defaults: Omit<QualityReasonCatalogItem, 'id' | 'createdAt' | 'updatedAt'>[] = [
      { code: 'FIN-SCRATCH', labelAr: 'خدش في التشطيب', category: 'تشطيب', severityDefault: 'medium', isActive: true },
      { code: 'ASSY-MISS', labelAr: 'نقص في التجميع', category: 'تجميع', severityDefault: 'high', isActive: true },
      { code: 'COLOR-MISMATCH', labelAr: 'اختلاف لون', category: 'لون', severityDefault: 'low', isActive: true },
      { code: 'SIZE-OFF', labelAr: 'مقاس غير مطابق', category: 'مقاس', severityDefault: 'high', isActive: true },
      { code: 'PACK-DAMAGE', labelAr: 'تلف في التعبئة', category: 'تعبئة', severityDefault: 'medium', isActive: true },
    ];
    await Promise.all(defaults.map((item) => this.createReason(item)));
  },

  async updateReason(id: string, payload: Partial<Omit<QualityReasonCatalogItem, 'id'>>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(qualityReasonCatalogRef(), id), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_UPDATE_REASON',
      'تحديث سبب عيب',
      { reasonId: id, changes: payload },
    );
  },

  async deleteReason(id: string): Promise<void> {
    if (!isConfigured) return;
    await deleteDoc(doc(qualityReasonCatalogRef(), id));
    await activityLogService.logCurrentUser(
      'QUALITY_DELETE_REASON',
      'حذف سبب عيب',
      { reasonId: id },
    );
  },

  subscribePolicies(cb: (data: QualityPolicySettings) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    return onSnapshot(qualitySettingsDocRef(), (snap) => {
      cb({
        ...DEFAULT_POLICIES,
        ...((snap.data() ?? {}) as Partial<QualityPolicySettings>),
      });
    });
  },

  subscribeSettingsHub(cb: (data: QualitySettingsDocument) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    return onSnapshot(qualitySettingsDocRef(), (snap) => {
      const data = (snap.data() ?? {}) as Partial<QualitySettingsDocument>;
      cb({
        ...DEFAULT_SETTINGS_HUB,
        ...data,
        inspectionTemplates: Array.isArray(data.inspectionTemplates) ? data.inspectionTemplates : [],
        samplingPlans: Array.isArray(data.samplingPlans) ? data.samplingPlans : [],
        reworkPolicies: {
          ...DEFAULT_REWORK_POLICIES,
          ...(data.reworkPolicies ?? {}),
        },
        printTemplates: {
          ...DEFAULT_PRINT_TEMPLATES,
          ...(data.printTemplates ?? {}),
        },
      });
    });
  },

  async upsertInspectionTemplate(template: QualityInspectionTemplate): Promise<void> {
    const settings = await this.getSettingsHub();
    const next = settings.inspectionTemplates.some((item) => item.id === template.id)
      ? settings.inspectionTemplates.map((item) => (item.id === template.id ? template : item))
      : [template, ...settings.inspectionTemplates];
    await this.setSettingsHub({ inspectionTemplates: next });
    await activityLogService.logCurrentUser(
      'QUALITY_UPSERT_TEMPLATE',
      'حفظ نموذج فحص جودة',
      { templateId: template.id, name: template.name },
    );
  },

  async removeInspectionTemplate(id: string): Promise<void> {
    const settings = await this.getSettingsHub();
    await this.setSettingsHub({
      inspectionTemplates: settings.inspectionTemplates.filter((item) => item.id !== id),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_REMOVE_TEMPLATE',
      'حذف نموذج فحص جودة',
      { templateId: id },
    );
  },

  async upsertSamplingPlan(plan: QualitySamplingPlan): Promise<void> {
    const settings = await this.getSettingsHub();
    const next = settings.samplingPlans.some((item) => item.id === plan.id)
      ? settings.samplingPlans.map((item) => (item.id === plan.id ? plan : item))
      : [plan, ...settings.samplingPlans];
    await this.setSettingsHub({ samplingPlans: next });
    await activityLogService.logCurrentUser(
      'QUALITY_UPSERT_SAMPLING_PLAN',
      'حفظ خطة سحب عينات',
      { planId: plan.id, frequencyMinutes: plan.frequencyMinutes, sampleSize: plan.sampleSize },
    );
  },

  async removeSamplingPlan(id: string): Promise<void> {
    const settings = await this.getSettingsHub();
    await this.setSettingsHub({
      samplingPlans: settings.samplingPlans.filter((item) => item.id !== id),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_REMOVE_SAMPLING_PLAN',
      'حذف خطة سحب عينات',
      { planId: id },
    );
  },

  subscribeReasons(cb: (reasons: QualityReasonCatalogItem[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(qualityReasonCatalogRef(), orderBy('labelAr', 'asc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityReasonCatalogItem)));
    });
  },
};
