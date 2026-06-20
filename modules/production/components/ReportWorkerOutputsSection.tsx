import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FirestoreProduct, ProductionReportWorkerOutput, ProductionWorkerSettings } from '@/types';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { lineAssignmentWorkerBridge } from '../services/lineAssignmentWorkerBridge';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { computeAchievementPercent } from '../selectors/workerTargetSelector';
import { filterProductionLaborWorkers } from '../utils/lineWorkerLaborRoles';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber } from '@/utils/calculations';

type Props = {
  lineId: string;
  productId: string;
  date: string;
  lineName: string;
  productName: string;
  products: FirestoreProduct[];
  reportQty: number;
  settings?: ProductionWorkerSettings;
  value: ProductionReportWorkerOutput[];
  onChange: (rows: ProductionReportWorkerOutput[]) => void;
  disabled?: boolean;
};

export const ReportWorkerOutputsSection: React.FC<Props> = ({
  lineId,
  productId,
  date,
  lineName,
  productName,
  products,
  reportQty,
  settings = DEFAULT_PRODUCTION_WORKER_SETTINGS,
  value,
  onChange,
  disabled,
}) => {
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const [loading, setLoading] = useState(false);
  const [workerSource, setWorkerSource] = useState<'daily' | 'permanent' | null>(null);

  const totalWorkerOutput = useMemo(
    () => value.reduce((sum, row) => sum + Number(row.outputQty || 0), 0),
    [value],
  );

  const mismatch = settings.performance.productionWorkerOutputMustMatchReportQty
    && reportQty > 0
    && totalWorkerOutput !== reportQty;

  const loadWorkers = useCallback(async () => {
    if (!lineId || !productId || !date) return;
    setLoading(true);
    try {
      const [workers, targets, resolvedWorkers] = await Promise.all([
        productionWorkerService.getAll(),
        productionWorkerTargetService.getAll(),
        lineAssignmentWorkerBridge.resolveWorkersForLineDate(lineId, date),
      ]);
      setWorkerSource(
        resolvedWorkers.length > 0 ? resolvedWorkers[0].source : null,
      );
      const productionAssignments = filterProductionLaborWorkers(resolvedWorkers);
      const rows = await productionWorkerPerformanceService.getWorkerOutputRowsForReport({
        lineId,
        productId,
        date,
        products,
        workers: workers.filter((w) => w.isActive !== false),
        targets,
        assignments: productionAssignments.map((row) => ({ workerId: row.workerId })),
        lineName,
        productName,
        lineProductConfigs,
      });
      const existingByWorker = new Map(value.map((row) => [row.workerId, row]));
      onChange(rows.map((row) => {
        const prev = existingByWorker.get(row.workerId);
        const outputQty = prev?.outputQty ?? 0;
        return {
          ...row,
          outputQty,
          achievementPercent: computeAchievementPercent(outputQty, row.dailyTargetQty),
          notes: prev?.notes ?? row.notes,
        };
      }));
    } finally {
      setLoading(false);
    }
  }, [lineId, productId, date, products, lineProductConfigs, lineName, productName, onChange, value]);

  useEffect(() => {
    if (!lineId || !productId || !date) {
      onChange([]);
      return;
    }
    void loadWorkers();
  }, [lineId, productId, date, lineName, productName]);

  const updateRow = (workerId: string, patch: Partial<ProductionReportWorkerOutput>) => {
    onChange(value.map((row) => {
      if (row.workerId !== workerId) return row;
      const outputQty = patch.outputQty ?? row.outputQty;
      const dailyTargetQty = patch.dailyTargetQty ?? row.dailyTargetQty;
      return {
        ...row,
        ...patch,
        outputQty,
        achievementPercent: computeAchievementPercent(outputQty, dailyTargetQty),
      };
    }));
  };

  if (!lineId || !productId || !date) return null;

  return (
    <div className="space-y-3 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">إنتاج العمال</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            أدخل <strong>إنتاج كل عامل على حدة</strong> (قطعة). «هدف العامل» = كمية عامل واحد وليس إجمالي الخط.
            يُعرض هنا <strong>عمال الإنتاج فقط</strong> — الجودة والتغليف والصيانة والخارجية لا يدخلون في جدول الأهداف.
            {' '}
            {workerSource === 'daily'
              ? 'العمالة من ربط العمالة اليومي على الخط.'
              : workerSource === 'permanent'
                ? 'العمالة من الربط الدائم (لا يوجد ربط يومي لهذا التاريخ).'
                : ''}
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-bold text-primary"
          onClick={() => void loadWorkers()}
          disabled={disabled || loading}
        >
          تحديث العمال
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)]">جاري تحميل العمال...</p>
      ) : value.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          لا يوجد عمال إنتاج مسجلون على هذا الخط في هذا التاريخ — سجّل عمال الإنتاج من صفحة «ربط العمالة بالخطوط»
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-right py-2">العامل</th>
                <th className="text-center py-2">هدف العامل</th>
                <th className="text-center py-2">إنتاج العامل</th>
              </tr>
            </thead>
            <tbody>
              {value.map((row) => (
                <tr key={row.workerId} className="border-t border-[var(--color-border)]">
                  <td className="py-2 font-medium">{row.workerName}</td>
                  <td className="py-2 text-center tabular-nums">{formatNumber(row.dailyTargetQty)}</td>
                  <td className="py-2 text-center">
                    <input
                      type="number"
                      min={0}
                      className="w-24 border border-[var(--color-border)] rounded-md text-center py-1"
                      value={row.outputQty || ''}
                      disabled={disabled}
                      onChange={(e) => updateRow(row.workerId, { outputQty: Number(e.target.value) || 0 })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          إجمالي إنتاج العمال: <strong>{formatNumber(totalWorkerOutput)}</strong>
        </span>
        <span>
          كمية التقرير: <strong>{formatNumber(reportQty)}</strong>
        </span>
      </div>
      {mismatch && (
        <p className="text-sm font-bold text-red-600">
          مجموع إنتاج العمال ({formatNumber(totalWorkerOutput)}) لا يطابق كمية التقرير ({formatNumber(reportQty)})
        </p>
      )}
    </div>
  );
};
