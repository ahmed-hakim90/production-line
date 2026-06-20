import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button, LoadingSkeleton } from '../components/UI';
import { ProductionWorkerReportPrint } from '../components/ProductionWorkerReportPrint';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber, getTodayDateString } from '@/utils/calculations';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type ReportKind = 'daily' | 'monthly' | 'ranking' | 'low_performance';

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const ProductionWorkerReports: React.FC = () => {
  const { can } = usePermission();
  const canView = can('production.workerReports.view') || can('productionWorkers.view');
  const products = useAppStore((s) => s.products);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const rawWorkerSettings = useAppStore((s) => s.systemSettings.productionWorkerSettings);
  const workerSettings = useMemo(() => ({
    performance: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.performance,
      ...(rawWorkerSettings?.performance ?? {}),
    },
    bonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.bonus,
      ...(rawWorkerSettings?.bonus ?? {}),
    },
    supervisorBonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
      ...(rawWorkerSettings?.supervisorBonus ?? {}),
      tiers: rawWorkerSettings?.supervisorBonus?.tiers?.length
        ? rawWorkerSettings.supervisorBonus.tiers
        : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
    },
  }), [rawWorkerSettings]);

  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<ReportKind>('daily');
  const [date, setDate] = useState(getTodayDateString());
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const workers = await productionWorkerService.getAll();
      const activeWorkers = workers.filter((w) => w.isActive !== false);
      if (kind === 'daily') {
        const dailyRows = await Promise.all(activeWorkers.map(async (worker) => {
          if (!worker.id) return null;
          const achievement = await productionWorkerPerformanceService.getDailyAchievement(worker.id, date, {
            worker,
            products: products as never[],
            settings: workerSettings,
            lineProductConfigs,
          });
          return {
            العامل: worker.name,
            الكود: worker.code,
            التاريخ: date,
            الهدف: achievement.targetQty,
            الإنتاج: achievement.outputQty,
            'الإنجاز %': achievement.achievementPercent,
            الحالة: achievement.status,
          };
        }));
        setRows(dailyRows.filter(Boolean) as Record<string, unknown>[]);
      } else {
        const targets = await productionWorkerTargetService.getAll();
        const { monthlyByWorkerId } =
          await productionWorkerPerformanceService.getWorkersListPerformanceSnapshot({
            workers: activeWorkers,
            targets,
            month,
            date,
            settings: workerSettings,
            products: products as never[],
            lineProductConfigs,
          });
        let result = activeWorkers
          .filter((worker) => worker.id && monthlyByWorkerId.has(worker.id))
          .map((worker) => {
            const stats = monthlyByWorkerId.get(worker.id!)!;
            return {
              العامل: worker.name,
              الكود: worker.code,
              الشهر: month,
              'أيام العمل': stats.workingDays,
              الحضور: stats.presentDays,
              الغياب: stats.absentDays,
              'هدف الشهر': stats.monthlyTarget,
              'إنتاج الشهر': stats.monthlyOutput,
              'إنجاز الشهر %': stats.monthlyAchievement,
              'نسبة الحضور %': stats.attendanceRate,
              الدرجة: stats.performanceScore,
              'تقدير المكافأة': stats.bonusEstimate,
            };
          });
        if (kind === 'ranking') {
          result = [...result].sort((a, b) => Number(b['إنجاز الشهر %'] || 0) - Number(a['إنجاز الشهر %'] || 0));
        }
        if (kind === 'low_performance') {
          const threshold = workerSettings.performance.achievementWarningThreshold ?? 80;
          result = result.filter((row) => Number(row['إنجاز الشهر %'] || 0) < threshold);
        }
        setRows(result);
      }
    } finally {
      setLoading(false);
    }
  }, [canView, kind, date, month, products, lineProductConfigs, workerSettings]);

  useEffect(() => { void load(); }, [load]);

  const title = useMemo(() => {
    switch (kind) {
      case 'daily': return 'تقرير الإنجاز اليومي للعمال';
      case 'monthly': return 'تقرير الإنجاز الشهري للعمال';
      case 'ranking': return 'ترتيب العمال الشهري';
      case 'low_performance': return 'تقرير الأداء المنخفض';
      default: return 'تقارير عمال الإنتاج';
    }
  }, [kind]);

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `worker_report_${kind}_${kind === 'daily' ? date : month}.xlsx`);
  };

  const exportPdf = async () => {
    if (!printRef.current || rows.length === 0) return;
    setExportingPdf(true);
    try {
      await new Promise((r) => setTimeout(r, 150));
      const { exportToPDF } = await import('../../../utils/reportExport');
      const suffix = kind === 'daily' ? date : month;
      await exportToPDF(printRef.current, `worker_report_${kind}_${suffix}`, {
        paperSize: 'a4',
        orientation: 'landscape',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const printColumns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const printSubtitle = kind === 'daily' ? `التاريخ: ${date}` : `الشهر: ${month}`;

  if (!canView) {
    return <Card><p className="p-4 text-sm">غير مصرح بعرض تقارير عمال الإنتاج</p></Card>;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        subtitle="تقارير الأداء والمكافآت"
        secondaryAction={{ label: 'تصدير Excel', onClick: exportExcel }}
        primaryAction={{
          label: exportingPdf ? 'جاري التصدير...' : 'تصدير PDF',
          onClick: () => void exportPdf(),
          disabled: exportingPdf || loading || rows.length === 0,
        }}
      />
      <Card>
        <div className="flex flex-wrap gap-3 p-4 border-b border-[var(--color-border)]">
          <select className="border rounded-lg p-2" value={kind} onChange={(e) => setKind(e.target.value as ReportKind)}>
            <option value="daily">إنجاز يومي</option>
            <option value="monthly">إنجاز شهري</option>
            <option value="ranking">ترتيب شهري</option>
            <option value="low_performance">أداء منخفض</option>
          </select>
          {kind === 'daily' ? (
            <input type="date" className="border rounded-lg p-2" value={date} onChange={(e) => setDate(e.target.value)} />
          ) : (
            <input type="month" className="border rounded-lg p-2" value={month} onChange={(e) => setMonth(e.target.value)} />
          )}
          <Button onClick={() => void load()}>تحديث</Button>
        </div>
        {loading ? <LoadingSkeleton rows={6} /> : (
          <div className="overflow-x-auto p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--color-text-muted)]">
                  {rows[0] ? Object.keys(rows[0]).map((key) => <th key={key} className="text-right py-2 px-2">{key}</th>) : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t border-[var(--color-border)]">
                    {Object.values(row).map((val, i) => (
                      <td key={i} className="py-2 px-2 tabular-nums">{typeof val === 'number' ? formatNumber(val) : String(val ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">لا توجد بيانات</p>}
          </div>
        )}
      </Card>

      <ProductionWorkerReportPrint
        ref={printRef}
        title={title}
        subtitle={printSubtitle}
        columns={printColumns}
        rows={rows}
      />
    </div>
  );
};
