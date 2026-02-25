import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import type { QualityInspectionStatus, QualityReasonCatalogItem } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { qualitySettingsService } from '../services/qualitySettingsService';

export const IPQC: React.FC = () => {
  const { can } = usePermission();
  const canInspect = can('quality.ipqc.inspect');
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
  const [serialBarcode, setSerialBarcode] = useState('');
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
        serialBarcode: serialBarcode || undefined,
        type: 'ipqc',
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
          serialBarcode: serialBarcode || undefined,
          reasonCode: reason.code,
          reasonLabel: reason.labelAr,
          severity: reason.severityDefault,
          quantity: 1,
          status: status === 'rework' ? 'reworked' : 'open',
          createdBy: currentEmployee.id,
          notes,
        });
      }

      const summary = await qualityInspectionService.buildWorkOrderSummary(selectedWorkOrder.id!);
      await updateWorkOrder(selectedWorkOrder.id!, { qualitySummary: summary });

      const lineName = _rawLines.find((l) => l.id === selectedWorkOrder.lineId)?.name ?? selectedWorkOrder.lineId;
      const productName = _rawProducts.find((p) => p.id === selectedWorkOrder.productId)?.name ?? selectedWorkOrder.productId;
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

      setStatus('passed');
      setReasonCode('');
      setSerialBarcode('');
      setNotes('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black">IPQC</h2>
          <p className="text-sm text-slate-500">فحص أثناء التشغيل بعينة أو سيريال محدد</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={!canPrint}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              await qualityPrintService.exportDocumentPdf(
                printRef.current,
                `quality-ipqc-${selectedWorkOrder?.workOrderNumber ?? 'report'}`,
                'ipqc',
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

          <input
            value={serialBarcode}
            onChange={(e) => setSerialBarcode(e.target.value)}
            disabled={!canInspect}
            placeholder="Serial (اختياري)"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          />

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

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canInspect}
            placeholder="ملاحظات"
            className="md:col-span-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm min-h-[90px]"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" disabled={!canInspect || busy || !workOrderId || !currentEmployee?.id} onClick={onSubmit}>
            حفظ تقرير IPQC
          </Button>
        </div>
        </div>
      </Card>
    </div>
  );
};
