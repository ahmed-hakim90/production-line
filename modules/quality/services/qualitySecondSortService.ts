import { addDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { assertIsoDate } from '../domain/samples';
import type { QualityScrapReport, QualitySecondSortReport } from '../model';
import { storageService } from '@/services/storageService';
import {
  QMS_COLLECTIONS,
  activeTenantId,
  assertQualityPermission,
  auditQuality,
  currentQualityActor,
  listByTenantDate,
  listByTenantDateRange,
  qmsCollection,
  qmsDoc,
  readQualityDoc,
  stampTenant,
} from './qualityGateway';

export const qualityScrapService = {
  async list(date: string): Promise<QualityScrapReport[]> {
    assertQualityPermission('quality.scrap.view');
    return listByTenantDate<QualityScrapReport>(QMS_COLLECTIONS.SCRAP, activeTenantId(), 'reportDate', date);
  },

  async listRange(from: string, to: string): Promise<QualityScrapReport[]> {
    assertQualityPermission('quality.scrap.view');
    assertIsoDate(from);
    assertIsoDate(to);
    if (to < from) throw new Error('نطاق التاريخ غير صالح.');
    return listByTenantDateRange<QualityScrapReport>(QMS_COLLECTIONS.SCRAP, activeTenantId(), 'reportDate', from, to);
  },

  async save(input: Omit<QualityScrapReport, 'id' | 'tenantId' | 'moduleSource' | 'createdByUid' | 'createdByName'> & { id?: string }): Promise<void> {
    assertQualityPermission('quality.scrap.manage');
    assertIsoDate(input.reportDate);
    if (!input.lineId || !input.productId || !input.reasonId || !input.reasonLabel.trim()) {
      throw new Error('الخط والمنتج وسبب الهالك من قائمة العيوب مطلوبة.');
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 0) throw new Error('كمية الهالك غير صالحة.');
    const actor = currentQualityActor();
    const payload = stampTenant({
      moduleSource: 'qms',
      reportDate: input.reportDate,
      reportType: input.reportType,
      lineId: input.lineId,
      lineName: input.lineName,
      productId: input.productId || null,
      productName: input.productName,
      sector: input.sector,
      quantity: input.quantity,
      reasonId: input.reasonId || null,
      reasonLabel: input.reasonLabel,
      slotKey: input.slotKey || null,
      slotName: input.slotName || null,
      productionSupervisorName: input.productionSupervisorName,
      qualitySupervisorName: input.qualitySupervisorName,
      recommendation: input.recommendation,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await readQualityDoc(QMS_COLLECTIONS.SCRAP, input.id);
      await updateDoc(qmsDoc(QMS_COLLECTIONS.SCRAP, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.SCRAP), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      });
    }
    await auditQuality('QUALITY_RECORD_SCRAP', 'حفظ تقرير هالك', { reportType: input.reportType, quantity: input.quantity });
  },

  async remove(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    await readQualityDoc(QMS_COLLECTIONS.SCRAP, id);
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.SCRAP, id));
    await auditQuality('QUALITY_RECORD_SCRAP', 'حذف تقرير هالك', { scrapId: id });
  },
};

export const qualitySecondSortService = {
  async list(date: string): Promise<QualitySecondSortReport[]> {
    assertQualityPermission('quality.secondSort.view');
    return listByTenantDate<QualitySecondSortReport>(QMS_COLLECTIONS.SECOND_SORT, activeTenantId(), 'reportDate', date);
  },

  async save(input: {
    id?: string;
    reportDate: string;
    productId: string;
    productName: string;
    productCode: string;
    problem: string;
    discountPercent: number;
    quantity: number;
    approval: string;
    fontScale: number;
    sector: QualitySecondSortReport['sector'];
    signatures: QualitySecondSortReport['signatures'];
    photos: File[];
    existingPhotos: QualitySecondSortReport['photos'];
  }): Promise<void> {
    assertQualityPermission('quality.secondSort.manage');
    assertIsoDate(input.reportDate);
    if (!input.productId) throw new Error('الموديل مطلوب.');
    if (!input.problem.trim()) throw new Error('وصف المشكلة مطلوب.');
    if (!Number.isFinite(input.quantity) || input.quantity < 0) throw new Error('الكمية غير صالحة.');
    if (input.discountPercent < 0 || input.discountPercent > 100) throw new Error('نسبة الخصم يجب أن تكون بين 0 و100.');
    if (!input.sector) throw new Error('اختر قطاع الجودة.');
    const signatures = (input.signatures || []).slice(0, 8).map((signature) => ({
      title: String(signature.title || '').trim() || 'توقيع',
      name: String(signature.name || '').trim(),
    }));
    const fontScale = Math.min(150, Math.max(80, Math.round(input.fontScale || 100)));
    const actor = currentQualityActor();
    const tenantId = activeTenantId();
    if (input.photos.length > 0) assertQualityPermission('quality.photos.manage');
    const uploaded = [];
    for (const file of input.photos) {
      if (!file.type.startsWith('image/')) throw new Error('يُقبل ملف صورة فقط.');
      uploaded.push(await storageService.uploadImage(file, 'quality', input.productId, { companyId: tenantId }));
    }
    const photos = [...input.existingPhotos, ...uploaded];
    const payload = stampTenant({
      moduleSource: 'qms',
      reportDate: input.reportDate,
      productId: input.productId,
      productName: input.productName,
      productCode: input.productCode,
      problem: input.problem.trim(),
      discountPercent: input.discountPercent,
      quantity: input.quantity,
      approval: input.approval.trim(),
      fontScale,
      sector: input.sector,
      signatures,
      photos,
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByName: actor.name,
    });
    if (input.id) {
      await readQualityDoc(QMS_COLLECTIONS.SECOND_SORT, input.id);
      await updateDoc(qmsDoc(QMS_COLLECTIONS.SECOND_SORT, input.id), payload);
    } else {
      await addDoc(qmsCollection(QMS_COLLECTIONS.SECOND_SORT), {
        ...payload,
        createdAt: serverTimestamp(),
        createdByUid: actor.uid,
        createdByName: actor.name,
      });
    }
    await auditQuality('QUALITY_SECOND_SORT', 'حفظ تسليم فرز ثانٍ', {
      productId: input.productId,
      photoCount: photos.length,
    });
  },

  async remove(id: string): Promise<void> {
    assertQualityPermission('quality.records.delete');
    await readQualityDoc(QMS_COLLECTIONS.SECOND_SORT, id);
    await deleteDoc(qmsDoc(QMS_COLLECTIONS.SECOND_SORT, id));
    await auditQuality('QUALITY_SECOND_SORT', 'حذف تسليم فرز ثانٍ', { reportId: id });
  },
};
