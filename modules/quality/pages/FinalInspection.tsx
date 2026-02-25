import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { FileAttachmentMeta, QualityInspectionStatus, QualityReasonCatalogItem } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { storageService } from '@/services/storageService';
import { eventBus, SystemEvents } from '@/shared/events';

export const FinalInspection: React.FC = () => {
  const { can } = usePermission();
  const canInspect = can('quality.finalInspection.inspect');
  const canPrint = can('quality.print');
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const [reasonCatalog, setReasonCatalog] = useState<QualityReasonCatalogItem[]>([]);
  const [workOrderId, setWorkOrderId] = useState('');
  const [status, setStatus] = useState<QualityInspectionStatus>('passed');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    qualitySettingsService.getReasons(true).then(setReasonCatalog);
  }, []);

  const activeWorkOrders = useMemo(
    () => workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress'),
    [workOrders],
  );
  const selectedWorkOrder = useMemo(
    () => activeWorkOrders.find((w) => w.id === workOrderId) ?? null,
    [activeWorkOrders, workOrderId],
  );

  const onSubmit = async () => {
    if (!selectedWorkOrder || !currentEmployee?.id || !canInspect) return;
    setBusy(true);
    try {
      const reason = reasonCatalog.find((r) => r.code === reasonCode);
      const attachments: FileAttachmentMeta[] = [];
      for (let i = 0; i < photoFiles.length; i += 1) {
        const uploaded = await storageService.uploadImage(
          photoFiles[i],
          'qc_reports',
          selectedWorkOrder.id!,
          {
            onProgress: (progress) => {
              const overall = Math.round(((i + progress / 100) / photoFiles.length) * 100);
              setUploadProgress(overall);
            },
          },
        );
        attachments.push(uploaded);
      }

      const inspectionId = await qualityInspectionService.createInspection({
        workOrderId: selectedWorkOrder.id!,
        lineId: selectedWorkOrder.lineId,
        productId: selectedWorkOrder.productId,
        type: 'final',
        status,
        inspectedBy: currentEmployee.id,
        notes,
        attachments,
      });

      if (inspectionId && (status === 'failed' || status === 'rework') && reason) {
        await qualityInspectionService.createDefect({
          workOrderId: selectedWorkOrder.id!,
          inspectionId,
          lineId: selectedWorkOrder.lineId,
          productId: selectedWorkOrder.productId,
          reasonCode: reason.code,
          reasonLabel: reason.labelAr,
          severity: reason.severityDefault,
          quantity: 1,
          status: status === 'rework' ? 'reworked' : 'open',
          createdBy: currentEmployee.id,
          notes,
          attachments,
        });
        if (status === 'rework') {
          await qualityInspectionService.createRework({
            workOrderId: selectedWorkOrder.id!,
            defectId: inspectionId,
            status: 'open',
            notes,
          });
        }
      }

      const summary = await qualityInspectionService.buildWorkOrderSummary(selectedWorkOrder.id!);
      await updateWorkOrder(selectedWorkOrder.id!, {
        qualitySummary: summary,
        qualityStatus: status === 'approved' || status === 'passed' ? 'approved' : 'pending',
        ...(status === 'approved' || status === 'passed'
          ? { qualityApprovedBy: currentEmployee.id, qualityApprovedAt: new Date().toISOString() }
          : {}),
      });

      eventBus.emit(
        status === 'approved' || status === 'passed'
          ? SystemEvents.QC_APPROVED
          : SystemEvents.QC_REJECTED,
        {
          module: 'quality',
          entityType: 'work_order',
          entityId: selectedWorkOrder.id!,
          action: status === 'approved' || status === 'passed' ? 'approve' : 'reject',
          description:
            status === 'approved' || status === 'passed'
              ? 'QC approved batch'
              : 'QC rejected batch',
          batchId: selectedWorkOrder.id!,
          actor: {
            userId: uid ?? currentEmployee?.id,
            userName: userDisplayName ?? userEmail ?? currentEmployee?.name,
          },
          metadata: {
            inspectionId: inspectionId ?? '',
            inspectionType: 'final',
            status,
            workOrderNumber: selectedWorkOrder.workOrderNumber,
          },
        },
      );

      const lineName = _rawLines.find((l) => l.id === selectedWorkOrder.lineId)?.name ?? selectedWorkOrder.lineId;
      const productName = _rawProducts.find((p) => p.id === selectedWorkOrder.productId)?.name ?? selectedWorkOrder.productId;
      await qualityNotificationService.notifyReportCreated({
        workOrderId: selectedWorkOrder.id!,
        workOrderNumber: selectedWorkOrder.workOrderNumber,
        lineName,
        productName,
        typeLabel: 'Final',
        statusLabel: status,
        summary,
        updatedAt: new Date().toLocaleString(),
        supervisorId: selectedWorkOrder.supervisorId,
      });

      setStatus('passed');
      setReasonCode('');
      setNotes('');
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setUploadProgress(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black">الفحص النهائي</h2>
          <p className="text-sm text-slate-500">تسجيل نتيجة الفحص النهائي لكل أمر شغل</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={!canPrint}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              await qualityPrintService.exportDocumentPdf(
                printRef.current,
                `quality-final-${selectedWorkOrder?.workOrderNumber ?? 'report'}`,
                'final_inspection',
                selectedWorkOrder?.id,
              );
            }}
            disabled={!canPrint}
          >
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <div ref={printRef}>
        <div className="grid md:grid-cols-2 gap-3">
          <select
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            disabled={!canInspect}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">اختر أمر شغل</option>
            {activeWorkOrders.map((wo) => (
              <option key={wo.id} value={wo.id}>#{wo.workOrderNumber}</option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as QualityInspectionStatus)}
            disabled={!canInspect}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="rework">Rework</option>
            <option value="approved">Approved</option>
          </select>

          <select
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            disabled={!canInspect}
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">سبب العيب (اختياري)</option>
            {reasonCatalog.map((reason) => (
              <option key={reason.id} value={reason.code}>{reason.labelAr}</option>
            ))}
          </select>

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canInspect}
            placeholder="ملاحظات"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />
          <div className="md:col-span-2 space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">صور الفحص</label>
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                disabled={!canInspect || busy}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []).slice(0, 3);
                  const urls = files.map((f) => URL.createObjectURL(f));
                  setPhotoFiles(files);
                  setPhotoPreviews(urls);
                  setUploadProgress(0);
                }}
                className="hidden"
              />
              <div className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 sm:p-5 bg-slate-50/70 dark:bg-slate-800/40 hover:border-primary/60 hover:bg-primary/5 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-xl">add_photo_alternate</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200 truncate">
                      {photoFiles.length > 0 ? `${photoFiles.length} صورة محددة` : 'اختيار صور الفحص'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">حد أقصى 3 صور — ضغط تلقائي حتى 500KB</p>
                  </div>
                </div>
              </div>
            </label>
            {photoPreviews.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {photoPreviews.map((url, idx) => (
                  <div key={url} className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <img src={url} alt={`qc-${idx}`} className="w-full h-full object-cover" />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPhotoFiles([]);
                    setPhotoPreviews([]);
                    setUploadProgress(0);
                  }}
                  className="px-3 py-2 text-xs font-bold rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-900/20 transition-all"
                >
                  إزالة الصور
                </button>
              </div>
            )}
            {busy && photoFiles.length > 0 && (
              <p className="mt-1 text-xs font-bold text-primary">رفع الصور... {uploadProgress}%</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" disabled={!canInspect || busy || !workOrderId || !currentEmployee?.id} onClick={onSubmit}>
            حفظ تقرير الفحص النهائي
          </Button>
        </div>
        </div>
      </Card>
    </div>
  );
};

