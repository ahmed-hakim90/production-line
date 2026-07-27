import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FirestoreProduct, ProductionReportWorkerOutput, ProductionWorkerSettings } from '@/types';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { lineAssignmentWorkerBridge } from '../services/lineAssignmentWorkerBridge';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import {
  buildTeamPlanWorkerOutputs,
  computeAchievementPercent,
  getProductAssemblyMode,
  hasLineSpecificWorkerTarget,
} from '../selectors/workerTargetSelector';
import { filterProductionLaborWorkers } from '../utils/lineWorkerLaborRoles';
import { getVisibleWorkerOutputRows } from '../utils/workerOutputRows';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber } from '@/utils/calculations';

type Props = {
  lineId: string;
  productId: string;
  date: string;
  assignmentDate?: string;
  lineName: string;
  productName: string;
  products: FirestoreProduct[];
  reportQty: number;
  /** Plan avgDailyTarget — enables team shared performance mode when product is team. */
  planDailyTarget?: number;
  settings?: ProductionWorkerSettings;
  value: ProductionReportWorkerOutput[];
  onChange: (rows: ProductionReportWorkerOutput[]) => void;
  disabled?: boolean;
};

export const ReportWorkerOutputsSection: React.FC<Props> = ({
  lineId,
  productId,
  date,
  assignmentDate,
  lineName,
  productName,
  products,
  reportQty,
  planDailyTarget = 0,
  settings = DEFAULT_PRODUCTION_WORKER_SETTINGS,
  value,
  onChange,
  disabled,
}) => {
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const [loading, setLoading] = useState(false);
  const [workerSource, setWorkerSource] = useState<'daily' | 'permanent' | null>(null);
  const lastLoadedContextRef = useRef('');
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [products, productId],
  );
  const assemblyMode = getProductAssemblyMode(selectedProduct);
  const teamPlanTarget = Math.max(0, Number(planDailyTarget) || 0);
  const isTeamSharedMode = assemblyMode === 'team' && teamPlanTarget > 0;
  const canShowWorkerTargets = (
    assemblyMode === 'individual'
    && hasLineSpecificWorkerTarget(lineProductConfigs, lineId, productId)
  ) || isTeamSharedMode;

  const displayRows = useMemo(
    () => (isTeamSharedMode ? value : getVisibleWorkerOutputRows(value)),
    [isTeamSharedMode, value],
  );
  const totalWorkerOutput = useMemo(
    () => value.reduce((sum, row) => (
      row.isPresent === false ? sum : sum + Number(row.outputQty || 0)
    ), 0),
    [value],
  );
  const hasVisibleWorkerRows = displayRows.length > 0;
  const hasReportQtyWithoutWorkerRows = reportQty > 0 && !hasVisibleWorkerRows;
  const teamAchievement = useMemo(() => {
    if (!isTeamSharedMode) return 0;
    return computeAchievementPercent(reportQty, teamPlanTarget);
  }, [isTeamSharedMode, reportQty, teamPlanTarget]);

  const mismatch = !isTeamSharedMode
    && settings.performance.productionWorkerOutputMustMatchReportQty
    && reportQty > 0
    && hasVisibleWorkerRows
    && totalWorkerOutput !== reportQty;

  const applyTeamShares = useCallback((rows: ProductionReportWorkerOutput[], qty: number) => (
    buildTeamPlanWorkerOutputs({
      quantityProduced: qty,
      planDailyTarget: teamPlanTarget,
      workers: rows.map((row) => ({
        workerId: row.workerId,
        workerName: row.workerName,
        isPresent: row.isPresent,
        productId: row.productId || productId,
        productName: row.productName || productName,
        lineId: row.lineId || lineId,
        lineName: row.lineName || lineName,
        notes: row.notes,
      })),
    })
  ), [teamPlanTarget, productId, productName, lineId, lineName]);

  const loadWorkers = useCallback(async () => {
    if (!lineId || !productId || !date || !canShowWorkerTargets) return;
    setLoading(true);
    try {
      const workerAssignmentDate = assignmentDate || date;
      const [workers, targets, resolvedWorkers] = await Promise.all([
        productionWorkerService.getAll(),
        productionWorkerTargetService.getAll(),
        lineAssignmentWorkerBridge.resolveWorkersForLineDate(lineId, workerAssignmentDate),
      ]);
      setWorkerSource(
        resolvedWorkers.length > 0 ? resolvedWorkers[0].source : null,
      );
      const productionAssignments = filterProductionLaborWorkers(resolvedWorkers);
      const activeWorkers = workers.filter((w) => w.isActive !== false);
      const workerMap = new Map(activeWorkers.map((w) => [String(w.id), w]));

      let rows: ProductionReportWorkerOutput[] = [];
      if (isTeamSharedMode) {
        rows = productionAssignments.map((assignment) => {
          const worker = workerMap.get(assignment.workerId);
          return {
            workerId: assignment.workerId,
            workerName: worker?.name ?? assignment.workerId,
            productId,
            productName,
            lineId,
            lineName,
            dailyTargetQty: 0,
            outputQty: 0,
            achievementPercent: 0,
            isPresent: assignment.isPresent ?? true,
          };
        });
        rows = applyTeamShares(rows, reportQty);
      } else {
        rows = await productionWorkerPerformanceService.getWorkerOutputRowsForReport({
          lineId,
          productId,
          date,
          products,
          workers: activeWorkers,
          targets,
          assignments: productionAssignments.map((row) => ({
            workerId: row.workerId,
            isPresent: row.isPresent,
          })),
          lineName,
          productName,
          lineProductConfigs,
        });
      }

      const contextKey = `${lineId}|${productId}|${date}|${workerAssignmentDate}|${assemblyMode}|${teamPlanTarget}`;
      const savedContextRows = value.filter((row) => row.productId === productId && row.lineId === lineId);
      if (rows.length === 0 && savedContextRows.length > 0) {
        onChange(
          isTeamSharedMode
            ? applyTeamShares(savedContextRows, reportQty)
            : savedContextRows.map((row) => {
              const isPresent = row.isPresent ?? true;
              const outputQty = isPresent ? Number(row.outputQty || 0) : 0;
              return {
                ...row,
                lineName: row.lineName || lineName,
                productName: row.productName || productName,
                isPresent,
                outputQty,
                achievementPercent: computeAchievementPercent(outputQty, row.dailyTargetQty),
              };
            }),
        );
        lastLoadedContextRef.current = contextKey;
        return;
      }
      // On the very first load (e.g. when editing an existing report) the parent
      // already supplies the saved per-worker outputs, so keep them instead of
      // resetting every quantity to zero — except team shares which recompute from Q/T.
      const isFirstLoad = lastLoadedContextRef.current === '';
      const shouldPreserveValues = lastLoadedContextRef.current === contextKey || isFirstLoad;
      const existingByWorker = new Map(
        shouldPreserveValues
          ? value
            .filter((row) => row.productId === productId && row.lineId === lineId)
            .map((row) => [row.workerId, row])
          : [],
      );
      const merged = rows.map((row) => {
        const prev = existingByWorker.get(row.workerId);
        const isPresent = row.isPresent ?? prev?.isPresent ?? true;
        if (isTeamSharedMode) {
          return {
            ...row,
            isPresent,
            notes: prev?.notes ?? row.notes,
          };
        }
        const outputQty = isPresent ? (prev?.outputQty ?? 0) : 0;
        return {
          ...row,
          isPresent,
          outputQty,
          achievementPercent: computeAchievementPercent(outputQty, row.dailyTargetQty),
          notes: prev?.notes ?? row.notes,
        };
      });
      onChange(isTeamSharedMode ? applyTeamShares(merged, reportQty) : merged);
      lastLoadedContextRef.current = contextKey;
    } finally {
      setLoading(false);
    }
  }, [
    lineId,
    productId,
    date,
    assignmentDate,
    products,
    lineProductConfigs,
    lineName,
    productName,
    onChange,
    value,
    canShowWorkerTargets,
    assemblyMode,
    isTeamSharedMode,
    teamPlanTarget,
    reportQty,
    applyTeamShares,
  ]);

  useEffect(() => {
    if (!lineId || !productId || !date || !canShowWorkerTargets) {
      onChange([]);
      return;
    }
    void loadWorkers();
  }, [lineId, productId, date, lineName, productName, canShowWorkerTargets, isTeamSharedMode, teamPlanTarget]);

  // Keep team shares in sync when report quantity changes after workers are loaded.
  useEffect(() => {
    if (!isTeamSharedMode || value.length === 0) return;
    const next = applyTeamShares(value, reportQty);
    const changed = next.some((row, index) => {
      const prev = value[index];
      return !prev
        || prev.workerId !== row.workerId
        || prev.outputQty !== row.outputQty
        || prev.dailyTargetQty !== row.dailyTargetQty
        || prev.achievementPercent !== row.achievementPercent
        || (prev.isPresent ?? true) !== (row.isPresent ?? true);
    }) || next.length !== value.length;
    if (changed) onChange(next);
  }, [isTeamSharedMode, reportQty, teamPlanTarget, applyTeamShares]);

  const updateRow = (workerId: string, patch: Partial<ProductionReportWorkerOutput>) => {
    if (isTeamSharedMode) return;
    onChange(value.map((row) => {
      if (row.workerId !== workerId) return row;
      const isPresent = patch.isPresent ?? row.isPresent ?? true;
      const outputQty = isPresent ? (patch.outputQty ?? row.outputQty) : 0;
      const dailyTargetQty = patch.dailyTargetQty ?? row.dailyTargetQty;
      return {
        ...row,
        ...patch,
        isPresent,
        outputQty,
        achievementPercent: computeAchievementPercent(outputQty, dailyTargetQty),
      };
    }));
  };

  if (!lineId || !productId || !date || !canShowWorkerTargets) return null;

  return (
    <div className="space-y-3 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">
            {isTeamSharedMode ? 'أداء العمال المشترك (من الخطة)' : 'إنتاج العمال'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {isTeamSharedMode ? (
              <>
                الأداء مشترك من إنجاز الخطة — يُوزَّع بالتساوي على الحاضرين فقط.
                {' '}
                هدف اليوم من الخطة: <strong>{formatNumber(teamPlanTarget)}</strong>
                {' · '}
                إنجاز الفريق: <strong>{formatNumber(teamAchievement)}%</strong>
              </>
            ) : (
              <>
                أدخل <strong>إنتاج كل عامل على حدة</strong> (قطعة). «هدف العامل» = كمية عامل واحد وليس إجمالي الخط.
                يُعرض هنا <strong>عمال الإنتاج فقط</strong> — الجودة والتغليف والصيانة والخارجية لا يدخلون في جدول الأهداف.
              </>
            )}
            {' '}
            {workerSource === 'daily'
              ? 'العمالة من بيانات يومية قديمة للتوافق.'
              : workerSource === 'permanent'
                ? 'العمالة من الربط الدائم مع حالة اليوم إن وجدت.'
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
      ) : !hasVisibleWorkerRows ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            لا توجد تفاصيل إنتاج عمال محفوظة لهذا التقرير.
          </p>
          {hasReportQtyWithoutWorkerRows ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              كمية التقرير ({formatNumber(reportQty)}) محفوظة كإجمالي على التقرير، وليست موزعة على العمال بعد.
              اضغط «تحديث العمال» أو سجّل عمال الإنتاج ثم أدخل إنتاج كل عامل.
            </p>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">
              لا يوجد عمال إنتاج حاضرون على هذا الخط في هذا التاريخ — سجّل الحضور من صفحة «ربط العمالة الدائم».
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-center py-2 w-10">#</th>
                <th className="text-right py-2">العامل</th>
                {isTeamSharedMode ? <th className="text-center py-2">الحضور</th> : null}
                <th className="text-center py-2">{isTeamSharedMode ? 'حصة الهدف' : 'هدف العامل'}</th>
                <th className="text-center py-2">{isTeamSharedMode ? 'حصة الإنتاج' : 'إنتاج العامل'}</th>
                {isTeamSharedMode ? <th className="text-center py-2">الإنجاز</th> : null}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, index) => {
                const isPresent = row.isPresent !== false;
                return (
                  <tr
                    key={row.workerId}
                    className={`border-t border-[var(--color-border)] ${isPresent ? '' : 'opacity-60'}`}
                  >
                    <td className="py-2 text-center text-[var(--color-text-muted)] tabular-nums font-bold">{index + 1}</td>
                    <td className="py-2 font-medium">{row.workerName}</td>
                    {isTeamSharedMode ? (
                      <td className="py-2 text-center text-xs font-bold">
                        {isPresent ? 'حاضر' : 'غائب'}
                      </td>
                    ) : null}
                    <td className="py-2 text-center tabular-nums">{formatNumber(row.dailyTargetQty)}</td>
                    <td className="py-2 text-center">
                      {isTeamSharedMode ? (
                        <span className="tabular-nums font-bold">{formatNumber(row.outputQty)}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          className="w-24 border border-[var(--color-border)] rounded-md text-center py-1 disabled:bg-[#f0f2f5]/70 disabled:text-[var(--color-text-muted)]"
                          value={row.outputQty || ''}
                          disabled={disabled}
                          onChange={(e) => updateRow(row.workerId, { outputQty: Number(e.target.value) || 0 })}
                        />
                      )}
                    </td>
                    {isTeamSharedMode ? (
                      <td className="py-2 text-center tabular-nums font-bold">
                        {isPresent ? `${formatNumber(row.achievementPercent)}%` : '—'}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
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
