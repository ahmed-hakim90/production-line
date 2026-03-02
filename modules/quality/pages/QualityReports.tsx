import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, KPIBox } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityPrintService } from '../services/qualityPrintService';
import { workOrderService } from '@/modules/production/services/workOrderService';
import type { QualityDefect } from '@/types';
import { QualityDefectsPrint, QualityReportPrint } from '../components/QualityReportPrint';

export const QualityReports: React.FC = () => {
  const { can } = usePermission();
  const canPrint = can('quality.print');
  const canDeleteQualityReports =
    can('quality.finalInspection.inspect') || can('quality.ipqc.inspect') || can('quality.rework.manage');
  const [searchParams] = useSearchParams();
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(searchParams.get('workOrderId') ?? '');
  const [summary, setSummary] = useState({
    inspectedUnits: 0,
    passedUnits: 0,
    failedUnits: 0,
    reworkUnits: 0,
    defectRate: 0,
    firstPassYield: 0,
  });
  const [loading, setLoading] = useState(false);
  const [defects, setDefects] = useState<QualityDefect[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deletingWorkOrderId, setDeletingWorkOrderId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const defectsPrintRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: printTemplate });

  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === selectedWorkOrderId) ?? null,
    [workOrders, selectedWorkOrderId],
  );
  const qualityStatusMeta = (status?: string) => {
    const normalized = status ?? 'pending';
    if (normalized === 'approved') {
      return { label: 'معتمد', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' };
    }
    if (normalized === 'rejected') {
      return { label: 'مرفوض', className: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' };
    }
    if (normalized === 'not_required') {
      return { label: 'غير مطلوب', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' };
    }
    return { label: 'قيد المراجعة', className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' };
  };
  const qualityReportRows = useMemo(
    () =>
      workOrders
        .filter((wo) => !!wo.qualitySummary || !!wo.qualityStatus || !!wo.qualityReportCode)
        .slice()
        .sort((a, b) => {
          const aMs = a.qualitySummary?.lastInspectionAt?.toDate?.()?.getTime?.() ?? new Date(a.qualityApprovedAt || 0).getTime();
          const bMs = b.qualitySummary?.lastInspectionAt?.toDate?.()?.getTime?.() ?? new Date(b.qualityApprovedAt || 0).getTime();
          return (bMs || 0) - (aMs || 0);
        })
        .slice(0, 8),
    [workOrders],
  );

  const runReport = async () => {
    if (!selectedWorkOrderId) return;
    setLoading(true);
    setMessage(null);
    try {
      const [built, defectsRows] = await Promise.all([
        qualityInspectionService.buildWorkOrderSummary(selectedWorkOrderId),
        qualityInspectionService.getDefectsByWorkOrder(selectedWorkOrderId),
      ]);
      setSummary(built);
      setDefects(defectsRows);
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر تحميل تقرير الجودة.',
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (selectedWorkOrderId) {
      void runReport();
    }
  }, [selectedWorkOrderId]);

  const topDefectReasons = useMemo(() => {
    const grouped = defects.reduce<Record<string, number>>((acc, item) => {
      acc[item.reasonLabel] = (acc[item.reasonLabel] ?? 0) + (item.quantity || 1);
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([reasonLabel, quantity]) => ({ reasonLabel, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [defects]);

  const printSubtitle = useMemo(() => {
    if (!selectedWorkOrder) return undefined;
    const productName = _rawProducts.find((p) => p.id === selectedWorkOrder.productId)?.name ?? '—';
    const lineName = _rawLines.find((l) => l.id === selectedWorkOrder.lineId)?.name ?? '—';
    const supervisorName = _rawEmployees.find((e) => e.id === selectedWorkOrder.supervisorId)?.name ?? '—';
    return `${selectedWorkOrder.workOrderNumber} — ${productName} — ${lineName} — المشرف: ${supervisorName}`;
  }, [_rawEmployees, _rawLines, _rawProducts, selectedWorkOrder]);
  const defectPrintRows = useMemo(
    () =>
      defects.map((row) => ({
        reasonLabel: row.reasonLabel,
        quantity: row.quantity || 1,
        severity: row.severity,
        status: row.status,
        serialBarcode: row.serialBarcode,
      })),
    [defects],
  );

  const handleDeleteQualityReport = async (workOrderId: string, workOrderNumber: string) => {
    if (!canDeleteQualityReports || !workOrderId) return;
    const confirmed = window.confirm(`هل تريد حذف تقرير الجودة لأمر الشغل #${workOrderNumber}؟`);
    if (!confirmed) return;

    setDeletingWorkOrderId(workOrderId);
    setMessage(null);
    try {
      const deleted = await qualityInspectionService.deleteWorkOrderQualityReport(workOrderId);
      await workOrderService.clearQualityData(workOrderId);
      if (selectedWorkOrderId === workOrderId) {
        setSelectedWorkOrderId('');
        setSummary({
          inspectedUnits: 0,
          passedUnits: 0,
          failedUnits: 0,
          reworkUnits: 0,
          defectRate: 0,
          firstPassYield: 0,
        });
        setDefects([]);
      }
      const totalDeleted = deleted.inspections + deleted.defects + deleted.rework + deleted.capa;
      setMessage({
        type: 'success',
        text: `تم حذف تقرير الجودة بنجاح (#${workOrderNumber}) — عناصر محذوفة: ${totalDeleted}.`,
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'تعذر حذف تقرير الجودة.',
      });
    } finally {
      setDeletingWorkOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-black">تقارير الجودة</h2>
          <p className="text-sm text-slate-500">ملخص جودة لكل أمر شغل + جاهز للطباعة</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handlePrint()} disabled={!canPrint || !selectedWorkOrder}>طباعة التقرير</Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!printRef.current) return;
              try {
                await qualityPrintService.exportDocumentPdf(
                  printRef.current,
                  `quality-kpi-${selectedWorkOrder?.workOrderNumber ?? 'snapshot'}`,
                  'quality_kpi',
                  selectedWorkOrder?.id,
                  {
                    paperSize: printTemplate?.paperSize,
                    orientation: printTemplate?.orientation,
                    copies: printTemplate?.copies,
                  },
                );
                setMessage({ type: 'success', text: 'تم تصدير تقرير KPI بنجاح.' });
              } catch (error) {
                setMessage({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'تعذر تصدير تقرير KPI.',
                });
              }
            }}
            disabled={!canPrint || !selectedWorkOrder?.id}
          >
            PDF KPI
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (!defectsPrintRef.current || !selectedWorkOrder?.id) return;
              try {
                await qualityPrintService.exportDocumentPdf(
                  defectsPrintRef.current,
                  `quality-defects-${selectedWorkOrder.workOrderNumber ?? 'snapshot'}`,
                  'defects',
                  selectedWorkOrder.id,
                  {
                    paperSize: printTemplate?.paperSize,
                    orientation: printTemplate?.orientation,
                    copies: printTemplate?.copies,
                  },
                );
                setMessage({ type: 'success', text: 'تم تصدير تقرير العيوب بنجاح.' });
              } catch (error) {
                setMessage({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'تعذر تصدير تقرير العيوب.',
                });
              }
            }}
            disabled={!canPrint || !selectedWorkOrder?.id}
          >
            PDF Defects
          </Button>
        </div>
      </div>
      {message && (
        <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
          message.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300'
            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <div className="grid md:grid-cols-4 gap-3">
            <select
              value={selectedWorkOrderId}
              onChange={(e) => setSelectedWorkOrderId(e.target.value)}
              className="md:col-span-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            >
              <option value="">اختر أمر شغل</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>#{wo.workOrderNumber}</option>
              ))}
            </select>
            <Button variant="primary" disabled={loading || !selectedWorkOrderId} onClick={runReport}>
              {loading ? 'جاري التحميل...' : 'تحميل التقرير'}
            </Button>
          </div>
        </Card>

        <Card title="ملخص تقارير الجودة (آخر أوامر الشغل)">
          {qualityReportRows.length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد تقارير جودة مرتبطة بأوامر الشغل حاليًا.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-2 px-2">أمر الشغل</th>
                    <th className="text-right py-2 px-2">كود تقرير الجودة</th>
                    <th className="text-right py-2 px-2">الحالة</th>
                    <th className="text-right py-2 px-2">Inspected</th>
                    <th className="text-right py-2 px-2">Failed</th>
                    <th className="text-right py-2 px-2">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {qualityReportRows.map((wo) => {
                    const qm = qualityStatusMeta(wo.qualityStatus);
                    return (
                      <tr key={wo.id} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-2 px-2 font-bold">#{wo.workOrderNumber}</td>
                        <td className="py-2 px-2 font-mono text-xs text-primary">{wo.qualityReportCode || '—'}</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full ${qm.className}`}>{qm.label}</span>
                        </td>
                        <td className="py-2 px-2">{wo.qualitySummary?.inspectedUnits ?? 0}</td>
                        <td className="py-2 px-2">{wo.qualitySummary?.failedUnits ?? 0}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="!px-2 !py-1"
                              onClick={() => setSelectedWorkOrderId(wo.id ?? '')}
                              disabled={!wo.id}
                            >
                              فتح
                            </Button>
                            {canDeleteQualityReports && (
                              <Button
                                variant="outline"
                                className="!px-2 !py-1 !border-rose-200 !text-rose-600 hover:!bg-rose-50"
                                onClick={() => void handleDeleteQualityReport(wo.id ?? '', wo.workOrderNumber)}
                                disabled={!wo.id || deletingWorkOrderId === wo.id}
                              >
                                {deletingWorkOrderId === wo.id ? 'جاري الحذف...' : 'حذف التقرير'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {selectedWorkOrder && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <KPIBox label="Inspected" value={summary.inspectedUnits} icon="fact_check" colorClass="bg-blue-100 text-blue-600" />
              <KPIBox label="Passed" value={summary.passedUnits} icon="check_circle" colorClass="bg-emerald-100 text-emerald-600" />
              <KPIBox label="Failed" value={summary.failedUnits} icon="error" colorClass="bg-rose-100 text-rose-600" />
              <KPIBox label="Rework" value={summary.reworkUnits} icon="build" colorClass="bg-amber-100 text-amber-600" />
              <KPIBox label="Defect Rate" value={summary.defectRate} unit="%" icon="priority_high" colorClass="bg-violet-100 text-violet-600" />
              <KPIBox label="FPY" value={summary.firstPassYield} unit="%" icon="insights" colorClass="bg-cyan-100 text-cyan-600" />
            </div>
            <Card title="أعلى أسباب العيوب">
              {topDefectReasons.length === 0 ? (
                <p className="text-sm text-slate-500">لا توجد عيوب مسجلة لأمر الشغل المحدد.</p>
              ) : (
                <div className="space-y-2">
                  {topDefectReasons.map((item) => (
                    <div key={item.reasonLabel} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{item.reasonLabel}</span>
                      <span className="font-black text-primary">{item.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <QualityReportPrint
          ref={printRef}
          title="تقرير الجودة"
          subtitle={printSubtitle}
          workOrderNumber={selectedWorkOrder?.workOrderNumber}
          summary={summary}
          topDefects={topDefectReasons}
          printSettings={printTemplate}
        />
      </div>
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <QualityDefectsPrint
          ref={defectsPrintRef}
          workOrderNumber={selectedWorkOrder?.workOrderNumber}
          rows={defectPrintRows}
          printSettings={printTemplate}
        />
      </div>
    </div>
  );
};

