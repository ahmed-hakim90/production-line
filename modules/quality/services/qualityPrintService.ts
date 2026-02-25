import { addDoc, serverTimestamp } from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { activityLogService } from '@/services/activityLogService';
import { exportToPDF } from '@/utils/reportExport';
import { qualityPrintLogsRef } from '../collections';

type QualityPrintDocType = 'final_inspection' | 'ipqc' | 'defects' | 'rework' | 'capa' | 'quality_kpi';

export const qualityPrintService = {
  async exportDocumentPdf(
    element: HTMLElement,
    fileName: string,
    type: QualityPrintDocType,
    workOrderId?: string,
  ): Promise<void> {
    await exportToPDF(element, fileName, { paperSize: 'a4', orientation: 'portrait' });
    if (!isConfigured) return;
    await addDoc(qualityPrintLogsRef(), {
      type,
      fileName,
      workOrderId: workOrderId ?? null,
      printedAt: serverTimestamp(),
    });
    await activityLogService.logCurrentUser(
      'QUALITY_EXPORT_DOCUMENT',
      `تصدير تقرير جودة (${type})`,
      { type, fileName, workOrderId: workOrderId ?? null },
    );
  },
};
