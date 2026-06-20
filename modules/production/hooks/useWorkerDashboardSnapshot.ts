import { useEffect, useMemo, useState } from 'react';
import { productionWorkerService } from '@/modules/production/services/productionWorkerService';
import { productionWorkerTargetService } from '@/modules/production/services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '@/modules/production/services/productionWorkerPerformanceService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { getTodayDateString } from '@/utils/calculations';
import { useAppStore } from '@/store/useAppStore';

export type WorkerDashboardSnapshot = {
  topWorkers: Array<{ name: string; achievement: number }>;
  belowTarget: Array<{ name: string; achievement: number }>;
  todayAvgAchievement: number;
  monthAvgAchievement: number;
  absentToday: string[];
  totalBonusEstimate: number;
  missingTargetsCount: number;
};

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function useWorkerDashboardSnapshot(): WorkerDashboardSnapshot {
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
  }), [rawWorkerSettings]);
  const [snapshot, setSnapshot] = useState<WorkerDashboardSnapshot>({
    topWorkers: [],
    belowTarget: [],
    todayAvgAchievement: 0,
    monthAvgAchievement: 0,
    absentToday: [],
    totalBonusEstimate: 0,
    missingTargetsCount: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [workers, targets] = await Promise.all([
        productionWorkerService.getAll(),
        productionWorkerTargetService.getAll(),
      ]);
      const active = workers.filter((w) => w.isActive !== false && w.id);
      if (active.length === 0) {
        if (!cancelled) {
          setSnapshot({
            topWorkers: [],
            belowTarget: [],
            todayAvgAchievement: 0,
            monthAvgAchievement: 0,
            absentToday: [],
            totalBonusEstimate: 0,
            missingTargetsCount: 0,
          });
        }
        return;
      }

      const today = getTodayDateString();
      const month = currentMonth();
      const { monthlyByWorkerId, dailyByWorkerId } =
        await productionWorkerPerformanceService.getWorkersListPerformanceSnapshot({
          workers: active,
          targets,
          month,
          date: today,
          settings: workerSettings,
          products: products as never[],
          lineProductConfigs,
        });

      if (cancelled) return;

      const monthlyStats = active.map((worker) => ({
        worker,
        monthly: monthlyByWorkerId.get(worker.id!)!,
        daily: dailyByWorkerId.get(worker.id!)!,
      }));

      const ranked = [...monthlyStats]
        .sort((a, b) => b.monthly.monthlyAchievement - a.monthly.monthlyAchievement)
        .slice(0, 10)
        .map((row) => ({ name: row.worker.name, achievement: row.monthly.monthlyAchievement }));
      const below = monthlyStats
        .filter((row) => row.monthly.monthlyAchievement < 100)
        .map((row) => ({ name: row.worker.name, achievement: row.monthly.monthlyAchievement }));
      const todayAvg = monthlyStats.length > 0
        ? Math.round(monthlyStats.reduce((s, r) => s + r.daily.achievement, 0) / monthlyStats.length)
        : 0;
      const monthAvg = monthlyStats.length > 0
        ? Math.round(monthlyStats.reduce((s, r) => s + r.monthly.monthlyAchievement, 0) / monthlyStats.length)
        : 0;
      const absentToday = monthlyStats
        .filter((row) => {
          const daily = dailyByWorkerId.get(row.worker.id!);
          return daily?.status === 'absent';
        })
        .map((row) => row.worker.name);
      const workersWithTargets = new Set(targets.filter((t) => t.isActive).map((t) => t.workerId));
      const missingTargetsCount = active.filter((w) => w.id && !workersWithTargets.has(w.id)).length;
      const totalBonusEstimate = monthlyStats.reduce((s, r) => s + r.monthly.bonusEstimate, 0);

      setSnapshot({
        topWorkers: ranked,
        belowTarget: below,
        todayAvgAchievement: todayAvg,
        monthAvgAchievement: monthAvg,
        absentToday,
        totalBonusEstimate,
        missingTargetsCount,
      });
    })();
    return () => { cancelled = true; };
  }, [products, lineProductConfigs, workerSettings]);

  return snapshot;
}
