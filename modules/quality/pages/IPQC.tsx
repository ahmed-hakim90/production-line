import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import type { FileAttachmentMeta, QualityInspectionStatus, QualityReasonCatalogItem } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';
import { SingleIPQCPrint } from '../components/QualityReportPrint';
import { storageService } from '@/services/storageService';
import { eventBus, SystemEvents } from '@/shared/events';

export const IPQC: React.FC = () => {
  const { can } = usePermission();
  const canInspect = can('quality.ipqc.inspect');
  const canPrint = can('quality.print');
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
  const [serialBarcode, setSerialBarcode] = useState('');
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
  const inspectorId = currentEmployee?.id ?? uid ?? '';
  const saveDisabledReason = useMemo(() => {
    if (!canInspect) return 'لا تملك صلاحية تنفيذ فحص IPQC.';
    if (!workOrderId) return 'اختر أمر شغل أولاً.';
    if (!inspectorId) return 'هذا المستخدم غير مرتبط بموظف. راجع بيانات الموظفين/المستخدمين.';
    if (busy) return 'جاري الحفظ...';
    return '';
  }, [canInspect, workOrderId, inspectorId, busy]);
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
      serialBarcode: serialBarcode || undefined,
      reasonLabel: selectedReason?.labelAr,
      notes: notes || undefined,
      photosCount: photoFiles.length,
    };
  }, [selectedWorkOrder, _rawLines, _rawProducts, currentEmployee?.name, userDisplayName, userEmail, statusLabel, serialBarcode, selectedReason?.labelAr, notes, photoFiles.length]);
  const qualityReportCode = useMemo(
    () => `QR-${selectedWorkOrder?.workOrderNumber ?? 'NA'}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
    [selectedWorkOrder?.workOrderNumber],
  );

  const onSubmit = async (printAfterSave = false) => {
    if (!selectedWorkOrder || !inspectorId || !canInspect) return;
    const requiresReason = status === 'failed' || status === 'rework';
    if (requiresReason && !reasonCode) {
      setMessage({ type: 'error', text: 'سبب العيب مطلوب عند الفشل أو إعادة التشغيل.' });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const isIndexError = (error: unknown): boolean =>
        error instanceof Error && error.message.toLowerCase().includes('requires an index');
      const reason = reasonCatalog.find((r) => r.code === reasonCode);
      const attachments: FileAttachmentMeta[] = [];
      // Temporarily disabled: image upload flow.
      // for (let i = 0; i < photoFiles.length; i += 1) {
      //   const uploaded = await storageService.uploadImage(
      //     photoFiles[i],
      //     'qc_reports',
      //     selectedWorkOrder.id!,
      //     {
      //       onProgress: (progress) => {
      //         const overall = Math.round(((i + progress / 100) / photoFiles.length) * 100);
      //         setUploadProgress(overall);
      //       },
      //     },
      //   );
      //   attachments.push(uploaded);
      // }

      const inspectionId = await qualityInspectionService.createInspection({
        workOrderId: selectedWorkOrder.id!,
        lineId: selectedWorkOrder.lineId,
        productId: selectedWorkOrder.productId,
        serialBarcode: serialBarcode || undefined,
        type: 'ipqc',
        status,
        inspectedBy: inspectorId,
        notes,
        attachments,
      });
      if (!inspectionId) {
        throw new Error('تعذر الحفظ: Backend غير مهيأ (Firebase).');
      }

      if ((status === 'failed' || status === 'rework') && reason) {
        const defectId = await qualityInspectionService.createDefect({
          workOrderId: selectedWorkOrder.id!,
          inspectionId,
          lineId: selectedWorkOrder.lineId,
          productId: selectedWorkOrder.productId,
          serialBarcode: serialBarcode || undefined,
          reasonCode: reason.code,
          reasonLabel: reason.labelAr,
          severity: reason.severityDefault,
          quantity: 1,
          status: status === 'rework' ? 'reworked' : 'open',
          createdBy: inspectorId,
          notes,
          attachments,
        });
        if (status === 'rework' && defectId) {
          await qualityInspectionService.createRework({
            workOrderId: selectedWorkOrder.id!,
            defectId,
            serialBarcode: serialBarcode || undefined,
            status: 'open',
            notes,
          });
        }
      }

      let summary;
      try {
        summary = await qualityInspectionService.buildWorkOrderSummary(selectedWorkOrder.id!);
      } catch (error) {
        if (isIndexError(error)) {
          await updateWorkOrder(selectedWorkOrder.id!, {
            qualityStatus: status === 'approved' || status === 'passed' ? 'approved' : 'pending',
            qualityReportCode,
            ...(status === 'approved' || status === 'passed'
              ? { qualityApprovedBy: inspectorId, qualityApprovedAt: new Date().toISOString() }
              : {}),
          });
          setStatus('passed');
          setReasonCode('');
          setSerialBarcode('');
          setNotes('');
          setPhotoFiles([]);
          setPhotoPreviews([]);
          setUploadProgress(0);
          setMessage({
            type: 'success',
            text: 'تم حفظ تقرير IPQC.',
          });
          return;
        }
        throw error;
      }
      await updateWorkOrder(selectedWorkOrder.id!, {
        qualitySummary: summary,
        qualityStatus: status === 'approved' || status === 'passed' ? 'approved' : 'pending',
        qualityReportCode,
        ...(status === 'approved' || status === 'passed'
          ? { qualityApprovedBy: inspectorId, qualityApprovedAt: new Date().toISOString() }
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
            inspectionType: 'ipqc',
            status,
            serialBarcode: serialBarcode || '',
            workOrderNumber: selectedWorkOrder.workOrderNumber,
          },
        },
      );

      const lineName = _rawLines.find((l) => l.id === selectedWorkOrder.lineId)?.name ?? selectedWorkOrder.lineId;
      const productName = _rawProducts.find((p) => p.id === selectedWorkOrder.productId)?.name ?? selectedWorkOrder.productId;
      try {
        await qualityNotificationService.notifyReportStatusChanged({
          workOrderId: selectedWorkOrder.id!,
          workOrderNumber: selectedWorkOrder.workOrderNumber,
          lineName,
          productName,
          typeLabel: 'IPQC',
          statusLabel: status,
          summary,
          updatedAt: new Date().toLocaleString(),
          supervisorId: selectedWorkOrder.supervisorId,
        });
      } catch (error) {
        if (!isIndexError(error)) throw error;
      }

      if (printAfterSave && canPrint && selectedWorkOrder) {
        handlePrint();
        // Give the print flow a brief tick before clearing form values.
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      setStatus('passed');
      setReasonCode('');
      setSerialBarcode('');
      setNotes('');
      setPhotoFiles([]);
      setPhotoPreviews([]);
      setUploadProgress(0);
      setMessage({
        type: 'success',
        text: printAfterSave ? 'تم حفظ تقرير IPQC وإرسال أمر الطباعة.' : 'تم حفظ تقرير IPQC بنجاح.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر حفظ التقرير. حاول مرة أخرى.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="erp-page-head">
        <div>
          <h2 className="page-title">IPQC</h2>
          <p className="page-subtitle">فحص أثناء التشغيل بعينة أو سيريال محدد</p>
        </div>
        <div className="erp-page-actions">
          <Button variant="outline" onClick={() => handlePrint()} disabled={!canPrint || !selectedWorkOrder}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              try {
                await qualityPrintService.exportDocumentPdf(
                  printRef.current,
                  `quality-ipqc-${selectedWorkOrder?.workOrderNumber ?? 'report'}`,
                  'ipqc',
                  selectedWorkOrder?.id,
                  {
                    paperSize: printTemplate?.paperSize,
                    orientation: printTemplate?.orientation,
                    copies: printTemplate?.copies,
                  },
                );
                setMessage({ type: 'success', text: 'تم تصدير تقرير IPQC PDF بنجاح.' });
              } catch (error) {
                setMessage({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'تعذر تصدير تقرير IPQC.',
                });
              }
            }}
            disabled={!canPrint || !selectedWorkOrder}
          >
            PDF
          </Button>
        </div>
      </div>

      <Card>
        {message && (
          <div className={`mb-3 rounded-[var(--border-radius-base)] border px-3 py-2 text-sm font-semibold ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60'
          }`}>
            {message.text}
          </div>
        )}
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

          <input
            value={serialBarcode}
            onChange={(e) => setSerialBarcode(e.target.value)}
            disabled={!canInspect}
            placeholder="Serial (اختياري)"
            className="px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
          />

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

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canInspect}
            placeholder="ملاحظات"
            className="md:col-span-2 px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm min-h-[90px]"
          />
          <div className="md:col-span-2 space-y-2">
            {/* Temporarily disabled: image upload UI. */}
            <p className="text-xs font-semibold text-amber-700">
              رفع الصور متوقف مؤقتًا.
            </p>
            {/*
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">صور الفحص</label>
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
              <div className="w-full border-2 border-dashed border-[var(--color-border)] rounded-[var(--border-radius-xl)] p-4 sm:p-5 bg-[#f8f9fa]/70/40 hover:border-primary/60 hover:bg-primary/5 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-[var(--border-radius-lg)] bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-xl">add_photo_alternate</span>
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
                  <div key={url} className="w-20 h-20 rounded-[var(--border-radius-lg)] overflow-hidden border border-[var(--color-border)] bg-[#f8f9fa]">
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
                  className="px-3 py-2 text-xs font-bold rounded-[var(--border-radius-base)] border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-900/20 transition-all"
                >
                  إزالة الصور
                </button>
              </div>
            )}
            {busy && photoFiles.length > 0 && (
              <p className="mt-1 text-xs font-bold text-primary">رفع الصور... {uploadProgress}%</p>
            )}
            */}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2 flex-wrap">
          <Button variant="outline" disabled={Boolean(saveDisabledReason) || !canPrint} onClick={() => onSubmit(true)}>
            حفظ وطباعة
          </Button>
          <Button variant="primary" disabled={Boolean(saveDisabledReason)} onClick={() => onSubmit(false)}>
            حفظ تقرير IPQC
          </Button>
        </div>
        {saveDisabledReason && (
          <p className="mt-2 text-xs font-semibold text-amber-700">{saveDisabledReason}</p>
        )}
      </Card>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <SingleIPQCPrint ref={printRef} data={printData} printSettings={printTemplate} />
      </div>
    </div>
  );
};

