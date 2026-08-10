import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import type { FileAttachmentMeta, QualityInspectionStatus, QualityReasonCatalogItem } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { createQualityInspection } from '../usecases/createQualityInspection';
import { unwrapOrThrow } from '@/shared/usecases';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { SingleFinalInspectionPrint } from '../components/QualityReportPrint';
import { storageService } from '@/services/storageService';
import { eventBus, SystemEvents } from '@/shared/events';
import { actionTrackerService } from '@/modules/system/audit';
import {
  WORK_ORDER_OPERATION_KEYS,
  WORK_ORDER_UPDATE_PATHS,
  isOperationPathEnabled,
} from '@/modules/system/lib/operationPathSettings';

export const FinalInspection: React.FC = () => {
  const { can } = usePermission();
  const canInspectPermission = can('quality.finalInspection.inspect');
  const canPrint = can('quality.print');
  const systemSettings = useAppStore((s) => s.systemSettings);
  const canInspect = canInspectPermission && isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.update,
    WORK_ORDER_UPDATE_PATHS.qualityFinalInspection,
  );
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: printTemplate });

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
  const selectedReason = useMemo(
    () => reasonCatalog.find((r) => r.code === reasonCode),
    [reasonCatalog, reasonCode],
  );
  const statusLabel = useMemo(() => {
    if (status === 'passed') return 'Passed';
    if (status === 'failed') return 'Failed';
    if (status === 'rework') return 'Rework';
    if (status === 'approved') return 'Approved';
    return status;
  }, [status]);
  const printData = useMemo(() => {
    if (!selectedWorkOrder) return null;
    const lineName = _rawLines.find((l) => l.id === selectedWorkOrder.lineId)?.name ?? selectedWorkOrder.lineId;
    const productName = _rawProducts.find((p) => p.id === selectedWorkOrder.productId)?.name ?? selectedWorkOrder.productId;
    return {
      date: new Date().toLocaleDateString('en-CA'),
      workOrderNumber: selectedWorkOrder.workOrderNumber,
      lineName,
      productName,
      inspectorName: currentEmployee?.name ?? userDisplayName ?? userEmail ?? '—',
      statusLabel,
      reasonLabel: selectedReason?.labelAr,
      notes: notes || undefined,
      photosCount: photoFiles.length,
    };
  }, [selectedWorkOrder, _rawLines, _rawProducts, currentEmployee?.name, userDisplayName, userEmail, statusLabel, selectedReason?.labelAr, notes, photoFiles.length]);
  const qualityReportCode = useMemo(
    () => `QR-${selectedWorkOrder?.workOrderNumber ?? 'NA'}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    [selectedWorkOrder?.workOrderNumber],
  );

  const onSubmit = async (printAfterSave = false) => {
    if (!selectedWorkOrder || !currentEmployee?.id || !canInspect) return;
    const trackedOperation = actionTrackerService.startOperation({
      module: 'quality',
      operation: 'quality.finalInspection.submit',
      action: 'submit',
      entityType: 'quality_inspection',
      entityId: selectedWorkOrder.id!,
      batchId: selectedWorkOrder.id!,
      actor: {
        userId: uid ?? currentEmployee?.id ?? undefined,
        userName: userDisplayName ?? userEmail ?? currentEmployee?.name ?? undefined,
      },
      metadata: {
        inspectionType: 'final',
        status,
        workOrderNumber: selectedWorkOrder.workOrderNumber,
      },
      description: 'Submit final inspection',
    });
    const requiresReason = status === 'failed' || status === 'rework';
    if (requiresReason && !reasonCode) {
      setMessage({ type: 'error', text: 'سبب العيب مطلوب عند الفشل أو إعادة التشغيل.' });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const reason = reasonCatalog.find((r) => r.code === reasonCode);
      const attachments: FileAttachmentMeta[] = [];
      for (let i = 0; i < photoFiles.length; i += 1) {
        const file = photoFiles[i];
        if (!(file instanceof File)) continue;
        const uploaded = await storageService.uploadImage(
          file,
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

      const inspectionId = unwrapOrThrow(await createQualityInspection({
        workOrderId: selectedWorkOrder.id!,
        lineId: selectedWorkOrder.lineId,
        productId: selectedWorkOrder.productId,
        type: 'final',
        status,
        inspectedBy: currentEmployee.id,
        notes,
        attachments,
      })).inspectionId;
      if (!inspectionId) {
        throw new Error('تعذر الحفظ: Backend غير مهيأ (Firebase).');
      }

      if ((status === 'failed' || status === 'rework') && reason) {
        const defectId = await qualityInspectionService.createDefect({
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
        if (status === 'rework' && defectId) {
          await qualityInspectionService.createRework({
            workOrderId: selectedWorkOrder.id!,
            defectId,
            status: 'open',
            notes,
          });
        }
      }

      const summary = await qualityInspectionService.buildWorkOrderSummary(selectedWorkOrder.id!);
      await updateWorkOrder(selectedWorkOrder.id!, {
        qualitySummary: summary,
        qualityReportCode,
        qualityStatus: status === 'approved' || status === 'passed' ? 'approved' : 'pending',
        ...(status === 'approved' || status === 'passed'
          ? { qualityApprovedBy: currentEmployee.id, qualityApprovedAt: new Date().toISOString() }
          : {}),
      }, { path: WORK_ORDER_UPDATE_PATHS.qualityFinalInspection });

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

      if (printAfterSave && canPrint && selectedWorkOrder) {
        handlePrint();
        // Give the print flow a brief tick before clearing form values.
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      setStatus('passed');
      setReasonCode('');
      setNotes('');
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setUploadProgress(0);
      setMessage({
        type: 'success',
        text: printAfterSave ? 'تم حفظ تقرير الفحص النهائي وإرسال أمر الطباعة.' : 'تم حفظ تقرير الفحص النهائي بنجاح.',
      });
      actionTrackerService.succeedOperation(trackedOperation, {
        metadata: {
          inspectionType: 'final',
          status,
          printAfterSave,
        },
      });
    } catch (error) {
      actionTrackerService.failOperation(trackedOperation, {
        error,
        metadata: {
          inspectionType: 'final',
          status,
          workOrderId: selectedWorkOrder.id,
        },
      });
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر حفظ التقرير. حاول مرة أخرى.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="الفحص النهائي"
      rangeLabel="تسجيل نتيجة الفحص النهائي لكل أمر شغل"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => handlePrint()} disabled={!canPrint || !selectedWorkOrder}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              try {
                await qualityPrintService.exportDocumentPdf(
                  printRef.current,
                  `quality-final-${selectedWorkOrder?.workOrderNumber ?? 'report'}`,
                  'final_inspection',
                  selectedWorkOrder?.id,
                  {
                    paperSize: printTemplate?.paperSize,
                    orientation: printTemplate?.orientation,
                    copies: printTemplate?.copies,
                  },
                );
                setMessage({ type: 'success', text: 'تم تصدير تقرير الفحص النهائي PDF بنجاح.' });
              } catch (error) {
                setMessage({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'تعذر تصدير تقرير الفحص النهائي.',
                });
              }
            }}
            disabled={!canPrint || !selectedWorkOrder}
          >
            PDF
          </Button>
        </div>
      )}
    >
      <OpsDashPanel title="نموذج الفحص النهائي" accent="quality">
        {message && (
          <div className={`mb-3 rounded-[var(--border-radius-base)] border px-3 py-2 text-sm font-semibold ${
            message.type === 'success'
              ? 'border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] dark:border-[rgb(var(--color-success))]/60'
              : 'border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] dark:border-[rgb(var(--color-danger))]/60'
          }`}>
            {message.text}
          </div>
        )}
        <div>
        <div className="grid md:grid-cols-2 gap-3">
          <select
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            disabled={!canInspect}
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
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
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
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
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
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
            placeholder="ملاحظات إضافية"
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />
          <div className="md:col-span-2 space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">صور الفحص</label>
            <label className="block cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                disabled={!canInspect || busy}
                onChange={(e) => {
                  const files = Array.from<File>(e.target.files ?? []).slice(0, 3);
                  const urls = files.map((f) => URL.createObjectURL(f));
                  setPhotoFiles(files);
                  setPhotoPreviews(urls);
                  setUploadProgress(0);
                }}
                className="hidden"
              />
              <div className="w-full border-2 border-dashed border-[var(--color-border)] rounded-[var(--border-radius-xl)] p-4 sm:p-5 bg-[var(--color-bg)]/70/40 hover:border-primary/60 hover:bg-primary/5 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-[var(--border-radius-lg)] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <ImagePlus size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[var(--color-text)] truncate">
                      {photoFiles.length > 0 ? `${photoFiles.length} صورة محددة` : 'اختيار صور الفحص'}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">حد أقصى 3 صور — ضغط تلقائي حتى 500KB</p>
                  </div>
                </div>
              </div>
            </label>
            {photoPreviews.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                {photoPreviews.map((url, idx) => (
                  <div key={url} className="w-20 h-20 rounded-[var(--border-radius-lg)] overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg)]">
                    <img src={url} alt={`qc-${idx}`} className="w-full h-full object-cover" />
                  </div>
                ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPhotoFiles([]);
                      setPhotoPreviews([]);
                      setUploadProgress(0);
                    }}
                  >
                    إزالة الصور
                  </Button>
              </div>
            )}
            {busy && photoFiles.length > 0 && (
              <p className="mt-1 text-xs font-bold text-primary">رفع الصور... {uploadProgress}%</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 flex-wrap">
          <Button
            variant="outline"
            disabled={!canInspect || busy || !workOrderId || !currentEmployee?.id || !canPrint}
            onClick={() => onSubmit(true)}
          >
            حفظ وطباعة
          </Button>
          <Button variant="primary" disabled={!canInspect || busy || !workOrderId || !currentEmployee?.id} onClick={() => onSubmit(false)}>
            حفظ تقرير الفحص النهائي
          </Button>
        </div>
        </div>
      </OpsDashPanel>
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <SingleFinalInspectionPrint ref={printRef} data={printData} printSettings={printTemplate} />
      </div>
    </ModuleOpsPageShell>
  );
};

