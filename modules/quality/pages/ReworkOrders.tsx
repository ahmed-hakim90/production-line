import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import type { QualityReworkOrder } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { ReworkOrdersPrint } from '../components/QualityReportPrint';

const STATUS_OPTIONS: QualityReworkOrder['status'][] = ['open', 'in_progress', 'done', 'scrap'];
const STATUS_LABELS: Record<QualityReworkOrder['status'], string> = {
  open: 'مفتوح',
  in_progress: 'قيد التنفيذ',
  done: 'مكتمل',
  scrap: 'سكراب',
};
const STATUS_BADGE_CLASS: Record<QualityReworkOrder['status'], string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scrap: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const ReworkOrders: React.FC = () => {
  const { can } = usePermission();
  const canManageRework = can('quality.rework.manage');
  const canPrint = can('quality.print');
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const workOrders = useAppStore((s) => s.workOrders);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [rows, setRows] = useState<QualityReworkOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: printTemplate });
  const displayRows = useMemo(() => rows.map((row) => {
    const workOrder = workOrders.find((w) => w.id === row.workOrderId);
    return {
      ...row,
      workOrderNumber: workOrder?.workOrderNumber ?? row.workOrderId,
      lineName: lines.find((line) => line.id === workOrder?.lineId)?.name ?? workOrder?.lineId ?? '—',
      productName: products.find((product) => product.id === workOrder?.productId)?.name ?? workOrder?.productId ?? '—',
      statusLabel: STATUS_LABELS[row.status] ?? row.status,
    };
  }), [rows, workOrders, lines, products]);
  const printRows = useMemo(
    () =>
      displayRows.map((row) => ({
        workOrderNumber: row.workOrderNumber,
        lineName: row.lineName,
        productName: row.productName,
        defectId: row.defectId,
        serialBarcode: row.serialBarcode,
        statusLabel: row.statusLabel,
      })),
    [displayRows],
  );

  useEffect(() => qualityInspectionService.subscribeRework(setRows), []);

  return (
    <div className="space-y-6">
      <div className="erp-page-head">
        <div>
          <h2 className="page-title">Rework Orders</h2>
          <p className="page-subtitle">متابعة حالات إعادة التشغيل</p>
        </div>
        <div className="erp-page-actions">
          <Button variant="outline" onClick={() => handlePrint()} disabled={!canPrint || rows.length === 0}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              try {
                await qualityPrintService.exportDocumentPdf(
                  printRef.current,
                  'quality-rework-orders',
                  'rework',
                  undefined,
                  {
                    paperSize: printTemplate?.paperSize,
                    orientation: printTemplate?.orientation,
                    copies: printTemplate?.copies,
                  },
                );
                setMessage({ type: 'success', text: 'تم تصدير تقرير إعادة التشغيل PDF بنجاح.' });
              } catch (error) {
                setMessage({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'تعذر تصدير التقرير.',
                });
              }
            }}
            disabled={!canPrint || rows.length === 0}
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
        <div>
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr className="border-b border-[var(--color-border)] text-slate-500">
                <th className="erp-th">أمر الشغل</th>
                <th className="erp-th">العيب</th>
                <th className="erp-th">السيريال</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th">تحديث</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 px-2 text-center text-slate-500">
                    لا توجد أوامر إعادة تشغيل حالياً.
                  </td>
                </tr>
              ) : displayRows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2 font-mono">
                    <div>{row.workOrderNumber}</div>
                    <div className="text-xs text-slate-500">{row.lineName} — {row.productName}</div>
                  </td>
                  <td className="py-2 px-2 font-mono">{row.defectId}</td>
                  <td className="py-2 px-2">{row.serialBarcode ?? '—'}</td>
                  <td className="py-2 px-2">
                    <span className={`inline-flex px-2 py-1 rounded-full border text-xs font-bold ${STATUS_BADGE_CLASS[row.status]}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          onClick={async () => {
                            if (!row.id) return;
                            setBusyId(row.id);
                            try {
                              await qualityInspectionService.updateRework(row.id, { status });
                              const workOrder = workOrders.find((item) => item.id === row.workOrderId);
                              if (!workOrder) return;
                              const summary = await qualityInspectionService.buildWorkOrderSummary(workOrder.id!);
                              await qualityNotificationService.notifyReportStatusChanged({
                                workOrderId: workOrder.id!,
                                workOrderNumber: workOrder.workOrderNumber,
                                lineName: lines.find((line) => line.id === workOrder.lineId)?.name ?? workOrder.lineId,
                                productName: products.find((product) => product.id === workOrder.productId)?.name ?? workOrder.productId,
                                typeLabel: 'Rework',
                                statusLabel: status,
                                summary,
                                updatedAt: new Date().toLocaleString(),
                                supervisorId: workOrder.supervisorId,
                              });
                              setMessage({ type: 'success', text: 'تم تحديث حالة أمر إعادة التشغيل.' });
                            } catch (error) {
                              setMessage({
                                type: 'error',
                                text: error instanceof Error ? error.message : 'تعذر تحديث حالة إعادة التشغيل.',
                              });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          disabled={!canManageRework || busyId === row.id || row.status === status}
                          className={`px-2 py-1 rounded text-xs font-bold border ${
                            row.status === status ? 'bg-primary/10 border-primary/30 text-primary' : 'border-[var(--color-border)]'
                          }`}
                        >
                          {STATUS_LABELS[status]}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </Card>
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ReworkOrdersPrint ref={printRef} rows={printRows} printSettings={printTemplate} />
      </div>
    </div>
  );
};

