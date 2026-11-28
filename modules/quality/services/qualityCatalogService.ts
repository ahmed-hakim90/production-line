import { addDoc, deleteDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { namedCatalogKey, normalizeNamedCatalogLabel, normalizeSecondSortReturn } from '../domain/namedCatalog';
import type { QualityNamedReason, QualitySecondSortReturn } from '../model';
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
import type { Permission } from '@/utils/permissions';

interface CatalogSpec {
  collectionName: string;
  view: Permission;
  manage: Permission;
  emptyMessage: string;
  duplicateMessage: string;
  auditAction: 'QUALITY_SCRAP_REASON' | 'QUALITY_SECOND_SORT_REASON' | 'QUALITY_INCOMING_CATALOG';
  auditLabel: string;
  trackActive?: boolean;
  maxLength?: number;
}

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name, 'ar'));
}

function nameCatalog(spec: CatalogSpec) {
  return {
    async list(): Promise<QualityNamedReason[]> {
      assertQualityPermission(spec.view);
      const rows = await listByTenant<QualityNamedReason>(spec.collectionName, activeTenantId());
      return sortByName(rows);
    },

    async create(name: string): Promise<void> {
      assertQualityPermission(spec.manage);
      const label = normalizeNamedCatalogLabel(name, spec.emptyMessage, spec.maxLength);
      const nameKey = namedCatalogKey(label);
      const tenantId = activeTenantId();
      const existing = await getDocs(query(
        qmsCollection(spec.collectionName),
        where('tenantId', '==', tenantId),
        where('nameKey', '==', nameKey),
      ));
      if (!existing.empty) throw new Error(spec.duplicateMessage);
      const actor = currentQualityActor();
      await addDoc(qmsCollection(spec.collectionName), stampTenant({
        name: label,
        nameKey,
        ...(spec.trackActive ? { isActive: true } : {}),
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      }));
      await auditQuality(spec.auditAction, spec.auditLabel, { name: label });
    },

    async rename(id: string, name: string): Promise<void> {
      assertQualityPermission(spec.manage);
      const label = normalizeNamedCatalogLabel(name, spec.emptyMessage, spec.maxLength);
      const nameKey = namedCatalogKey(label);
      const current = await readQualityDoc<QualityNamedReason>(spec.collectionName, id);
      const tenantId = activeTenantId();
      const existing = await getDocs(query(
        qmsCollection(spec.collectionName),
        where('tenantId', '==', tenantId),
        where('nameKey', '==', nameKey),
      ));
      if (existing.docs.some((item) => item.id !== id)) throw new Error(spec.duplicateMessage);
      const actor = currentQualityActor();
      await updateDoc(qmsDoc(spec.collectionName, id), {
        name: label,
        nameKey,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      });
      await auditQuality(spec.auditAction, `${spec.auditLabel}: تعديل`, { id, from: current.name, to: label });
    },

    async remove(id: string): Promise<void> {
      assertQualityPermission(spec.manage);
      const current = await readQualityDoc<QualityNamedReason>(spec.collectionName, id);
      await deleteDoc(qmsDoc(spec.collectionName, id));
      await auditQuality(spec.auditAction, `${spec.auditLabel}: حذف`, { id, name: current.name });
    },

    async removeMany(ids: string[]): Promise<number> {
      assertQualityPermission(spec.manage);
      if (ids.length === 0) return 0;
      if (ids.length > 400) throw new Error('الحد الأقصى للحذف الجماعي هو 400 عنصر.');
      const uniqueIds = [...new Set(ids)];
      await Promise.all(uniqueIds.map((id) => readQualityDoc<QualityNamedReason>(spec.collectionName, id)));
      if (!db) throw new Error('خدمة البيانات غير متاحة.');
      const batch = writeBatch(db);
      uniqueIds.forEach((id) => batch.delete(qmsDoc(spec.collectionName, id)));
      await batch.commit();
      return uniqueIds.length;
    },

    async setActive(id: string, isActive: boolean): Promise<void> {
      assertQualityPermission(spec.manage);
      if (!spec.trackActive) throw new Error('هذه القائمة لا تدعم الإيقاف.');
      const current = await readQualityDoc<QualityNamedReason>(spec.collectionName, id);
      const actor = currentQualityActor();
      await updateDoc(qmsDoc(spec.collectionName, id), {
        isActive,
        updatedAt: serverTimestamp(),
        updatedByUid: actor.uid,
        updatedByName: actor.name,
      });
      await auditQuality(spec.auditAction, `${spec.auditLabel}: ${isActive ? 'تفعيل' : 'إيقاف'}`, { id, name: current.name });
    },
  };
}

export const qualityScrapReasonService = nameCatalog({
  collectionName: QMS_COLLECTIONS.SCRAP_REASONS,
  view: 'quality.scrap.view',
  manage: 'quality.scrap.manage',
  emptyMessage: 'اكتب سبب الهالك.',
  duplicateMessage: 'سبب الهالك موجود بالفعل.',
  auditAction: 'QUALITY_SCRAP_REASON',
  auditLabel: 'سبب هالك',
});

export const qualitySecondSortReasonService = nameCatalog({
  collectionName: QMS_COLLECTIONS.SECOND_SORT_REASONS,
  view: 'quality.secondSort.view',
  manage: 'quality.secondSort.manage',
  emptyMessage: 'اكتب سبب الفرز الثاني.',
  duplicateMessage: 'سبب الفرز الثاني موجود بالفعل.',
  auditAction: 'QUALITY_SECOND_SORT_REASON',
  auditLabel: 'سبب فرز ثانٍ',
});

export const qualitySecondSortReturnService = {
  async list(date: string): Promise<QualitySecondSortReturn[]> {
    assertQualityPermission('quality.secondSort.view');
    return listByTenantDate<QualitySecondSortReturn>(QMS_COLLECTIONS.SECOND_SORT_RETURNS, activeTenantId(), 'reportDate', date);
  },

  async listRange(from: string, to: string): Promise<QualitySecondSortReturn[]> {
    assertQualityPermission('quality.secondSort.view');
    if (to < from) throw new Error('نطاق التاريخ غير صالح.');
    return listByTenantDateRange<QualitySecondSortReturn>(QMS_COLLECTIONS.SECOND_SORT_RETURNS, activeTenantId(), 'reportDate', from, to);
  },

  async save(input: {
    id?: string;
    reportDate: string;
    productId: string;
    productName: string;
    productCode: string;
    sector: QualitySecondSortReturn['sector'];
    quantity: unknown;
    notes: unknown;
    signatures: unknown;
  }): Promise<void> {
    assertQualityPermission('quality.secondSort.manage');
    if (!input.sector) throw new Error('اختر قطاع الجودة.');
    const report = normalizeSecondSortReturn(input);
    const actor = currentQualityActor();
    const payload = stampTenant({
      moduleSource: 'qms' as const,
      reportDate: report.reportDate,
      productId: report.productId,
      productName: report.productName,
      productCode: String(input.productCode || '').trim(),
      sector: input.sector,
      quantity: report.quantity,
      notes: report.notes,
      signatures: report.signatures,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await readQualityDoc(QMS_COLLECTIONS.SECOND_SORT_RETURNS, input.id);
      await updateDoc(qmsDoc(QMS_COLLECTIONS.SECOND_SORT_RETURNS, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.SECOND_SORT_RETURNS), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      });
    }
    await auditQuality('QUALITY_SECOND_SORT_RETURN', 'حفظ إرجاع فرز ثانٍ', {
      productId: report.productId,
      quantity: report.quantity,
    });
  },

  async remove(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    await readQualityDoc(QMS_COLLECTIONS.SECOND_SORT_RETURNS, id);
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.SECOND_SORT_RETURNS, id));
    await auditQuality('QUALITY_SECOND_SORT_RETURN', 'حذف إرجاع فرز ثانٍ', { reportId: id });
  },
};

export const qualityCartonSupplierService = nameCatalog({
  collectionName: QMS_COLLECTIONS.CARTON_SUPPLIERS,
  view: 'quality.incoming.view',
  manage: 'quality.incoming.manage',
  emptyMessage: 'اكتب اسم المورد.',
  duplicateMessage: 'المورد موجود بالفعل.',
  auditAction: 'QUALITY_INCOMING_CATALOG',
  auditLabel: 'مورد كراتين',
  maxLength: 150,
});

export const qualityPlasticSupplierService = nameCatalog({
  collectionName: QMS_COLLECTIONS.PLASTIC_SUPPLIERS,
  view: 'quality.incoming.view',
  manage: 'quality.incoming.manage',
  emptyMessage: 'اكتب اسم المورد.',
  duplicateMessage: 'المورد موجود بالفعل.',
  auditAction: 'QUALITY_INCOMING_CATALOG',
  auditLabel: 'مورد بلاستيك',
  maxLength: 150,
});

export const qualityPlasticItemService = nameCatalog({
  collectionName: QMS_COLLECTIONS.PLASTIC_ITEMS,
  view: 'quality.incoming.view',
  manage: 'quality.incoming.manage',
  emptyMessage: 'اكتب اسم الصنف.',
  duplicateMessage: 'الصنف موجود بالفعل.',
  auditAction: 'QUALITY_INCOMING_CATALOG',
  auditLabel: 'صنف بلاستيك',
  maxLength: 150,
  trackActive: true,
});

export const qualityInjectionItemService = nameCatalog({
  collectionName: QMS_COLLECTIONS.INJECTION_ITEMS,
  view: 'quality.incoming.view',
  manage: 'quality.incoming.manage',
  emptyMessage: 'اكتب اسم الصنف.',
  duplicateMessage: 'الصنف موجود بالفعل.',
  auditAction: 'QUALITY_INCOMING_CATALOG',
  auditLabel: 'صنف حقن',
  maxLength: 150,
  trackActive: true,
});

export const qualityPlasticReasonService = nameCatalog({
  collectionName: QMS_COLLECTIONS.PLASTIC_REASONS,
  view: 'quality.incoming.view',
  manage: 'quality.incoming.manage',
  emptyMessage: 'اكتب سبب الرفض.',
  duplicateMessage: 'سبب الرفض موجود بالفعل.',
  auditAction: 'QUALITY_INCOMING_CATALOG',
  auditLabel: 'سبب رفض بلاستيك',
  maxLength: 250,
  trackActive: true,
});
