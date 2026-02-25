import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { QualityInspectionStatus, QualityReasonCatalogItem } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';

export const FinalInspection: React.FC = () => {
  const { can } = usePermission();
  const canInspect = can('quality.finalInspection.inspect');
  const canPrint = can('quality.print');
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const [reasonCatalog, setReasonCatalog] = useState<QualityReasonCatalogItem[]>([]);
  const [workOrderId, setWorkOrderId] = useState('');
  const [status, setStatus] = useState<QualityInspectionStatus>('passed');
  const [reasonCode, setReasonCode] = useState('');
  const [notes, setNotes] = useState('');
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
      const inspectionId = await qualityInspectionService.createInspection({
        workOrderId: selectedWorkOrder.id!,
        lineId: selectedWorkOrder.lineId,
        productId: selectedWorkOrder.productId,
        type: 'final',
        status,
        inspectedBy: currentEmployee.id,
        notes,
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
