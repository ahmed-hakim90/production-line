import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import type { QualityReworkOrder } from '@/types';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityNotificationService } from '../services/qualityNotificationService';
import { qualityPrintService } from '../services/qualityPrintService';
import { ReworkOrdersPrint } from '../components/QualityReportPrint';
import { useEnsureStoreData } from '@/hooks/useEnsureStoreData';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';

const STATUS_OPTIONS: QualityReworkOrder['status'][] = ['open', 'in_progress', 'done', 'scrap'];
const STATUS_LABELS: Record<QualityReworkOrder['status'], string> = {
  open: 'مفتوح',
  in_progress: 'قيد التنفيذ',
  done: 'مكتمل',
  scrap: 'سكراب',
};
const STATUS_BADGE_CLASS: Record<QualityReworkOrder['status'], string> = {
  open: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))] border-[rgb(var(--color-warning)/0.25)]',
  in_progress: 'bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))] border-[rgb(var(--color-primary)/0.25)] dark:bg-[rgb(var(--color-primary)/0.15)] dark:text-[rgb(var(--color-primary))] dark:border-[rgb(var(--color-primary)/0.25)]',
  done: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))] border-[rgb(var(--color-success)/0.25)]',
  scrap: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] border-[rgb(var(--color-danger)/0.25)]',
};

export const ReworkOrders: React.FC = () => {
  const referenceDataLoading = useEnsureStoreData(['products', 'lines', 'workOrders']);
  const { can } = usePermission();
  const canManageRework = can('quality.rework.manage');
  const canPrint = can('quality.print');
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const workOrders = useAppStore((s) => s.workOrders);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const [rows, setRows] = useState<QualityReworkOrder[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  if (referenceDataLoading) {
    return <PageContentSkeleton variant="list" showFilters tableRows={6} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="أوامر إعادة التشغيل"
      rangeLabel="متابعة حالات إعادة التشغيل"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
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
                toast.success('تم تصدير تقرير إعادة التشغيل PDF بنجاح.');
              } catch {
                toast.error('تعذر تصدير التقرير.');
              }
            }}
            disabled={!canPrint || rows.length === 0}
          >
            PDF
          </Button>
        </div>
      )}
    >
      <OpsDashPanel title="متابعة أوامر إعادة التشغيل" accent="quality">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
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
                  <td colSpan={5} className="py-6 px-2 text-center text-[var(--color-text-muted)]">
                    لا توجد أوامر إعادة تشغيل حالياً.
                  </td>
                </tr>
              ) : displayRows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--color-border)]">
                  <td className="py-2 px-2 font-mono">
                    <div>{row.workOrderNumber}</div>
                    <div className="text-xs text-[var(--color-text-muted)]">{row.lineName} — {row.productName}</div>
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
                              toast.success('تم تحديث حالة أمر إعادة التشغيل.');
                            } catch {
                              toast.error('تعذر تحديث حالة إعادة التشغيل.');
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
      </OpsDashPanel>
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ReworkOrdersPrint ref={printRef} rows={printRows} printSettings={printTemplate} />
      </div>
    </ModuleOpsPageShell>
  );
};
