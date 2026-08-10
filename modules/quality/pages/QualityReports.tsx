import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { useManagedPrint } from '@/utils/printManager';
import { qualityInspectionService } from '../services/qualityInspectionService';
import { qualityPrintService } from '../services/qualityPrintService';
import { workOrderService } from '@/modules/production/services/workOrderService';
import type { QualityDefect } from '@/types';
import { QualityDefectsPrint, QualityReportPrint } from '../components/QualityReportPrint';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { formatNumber } from '@/utils/calculations';

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
  const dateFromQuery = String(searchParams.get('dateFrom') || '').trim();
  const dateToQuery = String(searchParams.get('dateTo') || '').trim();
  const [summary, setSummary] = useState({
    inspectedUnits: 0,
    passedUnits: 0,
    failedUnits: 0,
    reworkUnits: 0,
    defectRate: 0,
    firstPassYield: 0,
  });
  const [loading, setLoading] = useState(false);
  const [tableQuery, setTableQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'rejected' | 'pending' | 'not_required'>('all');
  const [defects, setDefects] = useState<QualityDefect[]>([]);
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
      return { label: 'معتمد', className: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' };
    }
    if (normalized === 'rejected') {
      return { label: 'مرفوض', className: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]' };
    }
    if (normalized === 'not_required') {
      return { label: 'غير مطلوب', className: 'bg-[var(--color-surface-hover)] text-[var(--color-text)]' };
    }
    return { label: 'قيد المراجعة', className: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]' };
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
        }),
    [workOrders],
  );
  const filteredQualityReportRows = useMemo(() => {
    const query = tableQuery.trim().toLowerCase();
    return qualityReportRows.filter((wo) => {
      const normalizedStatus = (wo.qualityStatus ?? 'pending') as 'approved' | 'rejected' | 'pending' | 'not_required';
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;
      if (dateFromQuery || dateToQuery) {
        const ts =
          wo.qualitySummary?.lastInspectionAt?.toDate?.()?.getTime?.()
          ?? new Date(wo.qualityApprovedAt || wo.createdAt || 0).getTime();
        if (Number.isFinite(ts) && ts > 0) {
          const day = new Date(ts).toISOString().slice(0, 10);
          if (dateFromQuery && day < dateFromQuery) return false;
          if (dateToQuery && day > dateToQuery) return false;
        }
      }
      if (!query) return true;
      const productName = (_rawProducts.find((p) => p.id === wo.productId)?.name ?? '').toLowerCase();
      const lineName = (_rawLines.find((l) => l.id === wo.lineId)?.name ?? '').toLowerCase();
      const orderNo = String(wo.workOrderNumber ?? '').toLowerCase();
      const reportCode = String(wo.qualityReportCode ?? '').toLowerCase();
      return (
        productName.includes(query) ||
        lineName.includes(query) ||
        orderNo.includes(query) ||
        reportCode.includes(query)
      );
    });
  }, [_rawLines, _rawProducts, qualityReportRows, statusFilter, tableQuery, dateFromQuery, dateToQuery]);

  const aggregateFromFiltered = useMemo(() => {
    let inspectedUnits = 0;
    let failedUnits = 0;
    let passedUnits = 0;
    let reworkUnits = 0;
    for (const wo of filteredQualityReportRows) {
      inspectedUnits += Number(wo.qualitySummary?.inspectedUnits ?? 0) || 0;
      failedUnits += Number(wo.qualitySummary?.failedUnits ?? 0) || 0;
      passedUnits += Number(wo.qualitySummary?.passedUnits ?? 0) || 0;
      reworkUnits += Number(wo.qualitySummary?.reworkUnits ?? 0) || 0;
    }
    const defectRate =
      inspectedUnits > 0
        ? Number((((failedUnits + reworkUnits) / inspectedUnits) * 100).toFixed(2))
        : 0;
    const firstPassYield =
      inspectedUnits > 0
        ? Number(((passedUnits / inspectedUnits) * 100).toFixed(2))
        : 0;
    return { inspectedUnits, passedUnits, failedUnits, reworkUnits, defectRate, firstPassYield };
  }, [filteredQualityReportRows]);

  const heroMetrics = selectedWorkOrder ? summary : aggregateFromFiltered;

  const hero = useMemo(
    () => [
      {
        key: 'inspected',
        label: 'تم الفحص',
        value: loading && selectedWorkOrder ? '…' : formatNumber(heroMetrics.inspectedUnits),
      },
      {
        key: 'passed',
        label: 'مقبول',
        value: loading && selectedWorkOrder ? '…' : formatNumber(heroMetrics.passedUnits),
      },
      {
        key: 'failed',
        label: 'مرفوض',
        value: loading && selectedWorkOrder ? '…' : formatNumber(heroMetrics.failedUnits),
        accent: heroMetrics.failedUnits > 0,
        toneClassName: heroMetrics.failedUnits > 0 ? 'ops-dash-kpi-card--tone-rose' : undefined,
      },
      {
        key: 'rework',
        label: 'إعادة تشغيل',
        value: loading && selectedWorkOrder ? '…' : formatNumber(heroMetrics.reworkUnits),
      },
      {
        key: 'defect_rate',
        label: 'نسبة العيوب',
        value: loading && selectedWorkOrder ? '…' : `${formatNumber(heroMetrics.defectRate)}%`,
      },
      {
        key: 'fpy',
        label: 'القبول من أول مرة',
        value: loading && selectedWorkOrder ? '…' : `${formatNumber(heroMetrics.firstPassYield)}%`,
      },
    ],
    [heroMetrics, loading, selectedWorkOrder],
  );

  const runReport = async () => {
    if (!selectedWorkOrderId) return;
    setLoading(true);
    try {
      const [built, defectsRows] = await Promise.all([
        qualityInspectionService.buildWorkOrderSummary(selectedWorkOrderId),
        qualityInspectionService.getDefectsByWorkOrder(selectedWorkOrderId),
      ]);
      setSummary(built);
      setDefects(defectsRows);
    } catch (error) {
      toast.error('تعذر تحميل تقرير الجودة.');
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
      .map(([reasonLabel, quantity]) => ({ reasonLabel, quantity: Number(quantity) || 0 }))
      .sort((a, b) => Number(b.quantity) - Number(a.quantity))
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
      toast.success(`تم حذف تقرير الجودة بنجاح (#${workOrderNumber}) — عناصر محذوفة: ${totalDeleted}.`);
    } catch (error) {
      toast.error('تعذر حذف تقرير الجودة.');
    } finally {
      setDeletingWorkOrderId(null);
    }
  };

  return (
    <ModuleOpsPageShell
      eyebrow="تقارير الجودة"
      hero={hero}
      onRefresh={selectedWorkOrderId ? () => void runReport() : undefined}
      refreshing={loading}
      rangeLabel={
        selectedWorkOrder
          ? `#${selectedWorkOrder.workOrderNumber}`
          : `التقارير: ${filteredQualityReportRows.length} / ${qualityReportRows.length}`
      }
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          {canPrint && selectedWorkOrder && (
            <Button variant="primary" onClick={() => handlePrint()}>
              طباعة
            </Button>
          )}
          {canPrint && selectedWorkOrder?.id && (
            <Button
              variant="secondary"
              title="تصدير PDF"
              onClick={async () => {
                if (!printRef.current) return;
                try {
                  await qualityPrintService.exportDocumentPdf(
                    printRef.current,
                    `quality-kpi-${selectedWorkOrder?.workOrderNumber ?? 'snapshot'}`,
                    'quality_kpi',
                    selectedWorkOrder?.id,
                    { paperSize: printTemplate?.paperSize, orientation: printTemplate?.orientation, copies: printTemplate?.copies },
                  );
                  toast.success('تم تصدير تقرير KPI بنجاح.');
                } catch (error) {
                  toast.error('تعذر تصدير تقرير KPI.');
                }
              }}
            >
              PDF KPI
            </Button>
          )}
          {canPrint && selectedWorkOrder?.id && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (!defectsPrintRef.current || !selectedWorkOrder?.id) return;
                try {
                  await qualityPrintService.exportDocumentPdf(
                    defectsPrintRef.current,
                    `quality-defects-${selectedWorkOrder.workOrderNumber ?? 'snapshot'}`,
                    'defects',
                    selectedWorkOrder.id,
                    { paperSize: printTemplate?.paperSize, orientation: printTemplate?.orientation, copies: printTemplate?.copies },
                  );
                  toast.success('تم تصدير تقرير العيوب بنجاح.');
                } catch (error) {
                  toast.error('تعذر تصدير تقرير العيوب.');
                }
              }}
            >
              PDF العيوب
            </Button>
          )}
        </div>
      )}
    >
      <OpsDashPanel title="اختيار أمر الشغل" accent="quality" bodyClassName="p-3 sm:p-4">
        <div className="grid md:grid-cols-4 gap-3">
          <select
            value={selectedWorkOrderId}
            onChange={(e) => setSelectedWorkOrderId(e.target.value)}
            className="md:col-span-3 px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm"
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
      </OpsDashPanel>

      <OpsDashPanel title="جدول تقارير الجودة" accent="quality" bodyClassName="p-0">
        <div className="p-3 sm:p-4 border-b">
          <SmartFilterBar
            pageId="quality-reports"
            searchPlaceholder="بحث برقم أمر الشغل / كود التقرير / المنتج / الخط"
            searchValue={tableQuery}
            onSearchChange={setTableQuery}
            quickFilters={[
              {
                key: 'status',
                placeholder: 'كل الحالات',
                options: [
                  { value: 'approved', label: 'معتمد' },
                  { value: 'rejected', label: 'مرفوض' },
                  { value: 'pending', label: 'قيد المراجعة' },
                  { value: 'not_required', label: 'غير مطلوب' },
                ],
                width: 'w-[160px]',
              },
            ]}
            quickFilterValues={{ status: statusFilter }}
            onQuickFilterChange={(key, value) => {
              if (key === 'status') setStatusFilter(value === 'all' ? 'all' : value as typeof statusFilter);
            }}
            className="mb-0 border-0 rounded-none"
          />
        </div>
        {qualityReportRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">لا توجد تقارير جودة مرتبطة بأوامر الشغل حاليًا.</p>
        ) : filteredQualityReportRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">لا توجد نتائج مطابقة للبحث/التصفية الحالية.</p>
        ) : (
          <div className="space-y-2.5 p-3 sm:p-4">
            <div className="md:hidden space-y-2.5">
              {filteredQualityReportRows.map((wo) => {
                const qm = qualityStatusMeta(wo.qualityStatus);
                const productName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '—';
                const lineName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                const lastInspectionDate =
                  wo.qualitySummary?.lastInspectionAt?.toDate?.()?.toLocaleString?.('ar-EG') ??
                  (wo.qualityApprovedAt ? new Date(wo.qualityApprovedAt).toLocaleString('ar-EG') : '—');
                return (
                  <div key={wo.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[var(--color-text)]">#{wo.workOrderNumber}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">{productName} - {lineName}</p>
                      </div>
                      <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full ${qm.className}`}>{qm.label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-[var(--border-radius-base)] bg-[var(--color-bg)] p-2">
                        <p className="text-[var(--color-text-muted)] mb-0.5">Inspected</p>
                        <p className="font-bold">{wo.qualitySummary?.inspectedUnits ?? 0}</p>
                      </div>
                      <div className="rounded-[var(--border-radius-base)] bg-[var(--color-bg)] p-2">
                        <p className="text-[var(--color-text-muted)] mb-0.5">Failed</p>
                        <p className="font-bold">{wo.qualitySummary?.failedUnits ?? 0}</p>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]"><span className="font-bold">آخر تحديث:</span> {lastInspectionDate}</p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="!px-2 !py-1"
                        onClick={() => setSelectedWorkOrderId(wo.id ?? '')}
                        disabled={!wo.id}
                      >
                        <span className="material-icons-round text-sm">open_in_new</span>
                        فتح
                      </Button>
                      {canDeleteQualityReports && (
                        <Button
                          variant="outline"
                          className="!px-2 !py-1 !border-[rgb(var(--color-danger)/0.25)] !text-[rgb(var(--color-danger))] hover:!bg-[rgb(var(--color-danger)/0.1)]"
                          onClick={() => void handleDeleteQualityReport(wo.id ?? '', wo.workOrderNumber)}
                          disabled={!wo.id || deletingWorkOrderId === wo.id}
                        >
                          <span className="material-icons-round text-sm">delete</span>
                          {deletingWorkOrderId === wo.id ? 'جاري الحذف...' : 'حذف التقرير'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="erp-table min-w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">أمر الشغل</th>
                    <th className="erp-th">المنتج</th>
                    <th className="erp-th">الخط</th>
                    <th className="erp-th">كود تقرير الجودة</th>
                    <th className="erp-th">الحالة</th>
                    <th className="erp-th">Inspected</th>
                    <th className="erp-th">Failed</th>
                    <th className="erp-th">آخر تحديث</th>
                    <th className="erp-th">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQualityReportRows.map((wo) => {
                    const qm = qualityStatusMeta(wo.qualityStatus);
                    const productName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '—';
                    const lineName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                    const lastInspectionDate =
                      wo.qualitySummary?.lastInspectionAt?.toDate?.()?.toLocaleString?.('ar-EG') ??
                      (wo.qualityApprovedAt ? new Date(wo.qualityApprovedAt).toLocaleString('ar-EG') : '—');
                    return (
                      <tr key={wo.id} className="border-b border-[var(--color-border)]">
                        <td className="py-2 px-2 font-bold">#{wo.workOrderNumber}</td>
                        <td className="py-2 px-2">{productName}</td>
                        <td className="py-2 px-2">{lineName}</td>
                        <td className="py-2 px-2 font-mono text-xs text-primary">{wo.qualityReportCode || '—'}</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full ${qm.className}`}>{qm.label}</span>
                        </td>
                        <td className="py-2 px-2">{wo.qualitySummary?.inspectedUnits ?? 0}</td>
                        <td className="py-2 px-2">{wo.qualitySummary?.failedUnits ?? 0}</td>
                        <td className="py-2 px-2 text-xs text-[var(--color-text-muted)]">{lastInspectionDate}</td>
                        <td className="py-2 px-2">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="!px-2 !py-1"
                              onClick={() => setSelectedWorkOrderId(wo.id ?? '')}
                              disabled={!wo.id}
                            >
                              <span className="material-icons-round text-sm">open_in_new</span>
                              فتح
                            </Button>
                            {canDeleteQualityReports && (
                              <Button
                                variant="outline"
                                className="!px-2 !py-1 !border-[rgb(var(--color-danger)/0.25)] !text-[rgb(var(--color-danger))] hover:!bg-[rgb(var(--color-danger)/0.1)]"
                                onClick={() => void handleDeleteQualityReport(wo.id ?? '', wo.workOrderNumber)}
                                disabled={!wo.id || deletingWorkOrderId === wo.id}
                              >
                                <span className="material-icons-round text-sm">delete</span>
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
          </div>
        )}
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          إجمالي التقارير: {filteredQualityReportRows.length} / {qualityReportRows.length}
        </p>
      </OpsDashPanel>

      {selectedWorkOrder && (
        <OpsDashPanel title="أعلى أسباب العيوب" accent="quality">
          {loading ? (
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              جاري التحميل...
            </p>
          ) : topDefectReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد عيوب مسجلة لأمر الشغل المحدد.</p>
          ) : (
            <div className="space-y-2">
              {topDefectReasons.map((item) => (
                <div key={item.reasonLabel} className="flex items-center justify-between text-sm py-2 border-b border-[var(--color-border)]">
                  <span className="font-semibold text-[var(--color-text)]">{item.reasonLabel}</span>
                  <span className="font-bold text-primary">{item.quantity}</span>
                </div>
              ))}
            </div>
          )}
        </OpsDashPanel>
      )}

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
    </ModuleOpsPageShell>
  );
};
