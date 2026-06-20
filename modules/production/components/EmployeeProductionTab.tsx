import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Card, KPIBox, LoadingSkeleton, Button } from '@/modules/production/components/UI';
import { productionWorkerService, resolveWorkerCodeFromEmployee } from '@/modules/production/services/productionWorkerService';
import { productionWorkerPerformanceService } from '@/modules/production/services/productionWorkerPerformanceService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber } from '@/utils/calculations';
import { getTodayDateString } from '@/utils/calculations';
import { usePermission } from '@/utils/permissions';

type Props = { employeeId: string };

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const EmployeeProductionTab: React.FC<Props> = ({ employeeId }) => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canView = can('production.workers.view') || can('productionWorkers.view');
  const canManage = can('production.workers.manage') || can('productionWorkers.view');
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
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
  const [linking, setLinking] = useState(false);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [today, setToday] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getDailyAchievement>> | null>(null);
  const [month, setMonth] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getMonthlyAchievement>> | null>(null);

  const employee = useMemo(
    () => _rawEmployees.find((e) => e.id === employeeId) ?? null,
    [_rawEmployees, employeeId],
  );

  const loadWorkerData = async (cancelledRef?: { current: boolean }) => {
    const worker = await productionWorkerService.getByEmployeeId(employeeId);
    if (cancelledRef?.current) return;
    if (!worker?.id) {
      setWorkerId(null);
      setToday(null);
      setMonth(null);
      setLoading(false);
      return;
    }
    const [daily, monthly] = await Promise.all([
      productionWorkerPerformanceService.getDailyAchievement(worker.id, getTodayDateString(), {
        worker,
        products: products as never[],
        settings: workerSettings,
        lineProductConfigs,
      }),
      productionWorkerPerformanceService.getMonthlyAchievement(worker.id, currentMonth(), {
        worker,
        products: products as never[],
        settings: workerSettings,
        lineProductConfigs,
      }),
    ]);
    if (cancelledRef?.current) return;
    setWorkerId(worker.id);
    setToday(daily);
    setMonth(monthly);
    setLoading(false);
  };

  useEffect(() => {
    if (!employeeId || !canView) { setLoading(false); return; }
    const cancelled = { current: false };
    setLoading(true);
    void loadWorkerData(cancelled);
    return () => { cancelled.current = true; };
  }, [employeeId, canView, products, lineProductConfigs, workerSettings]);

  const handleLinkEmployee = async () => {
    if (!employee?.id || linking) return;
    setLinking(true);
    try {
      const id = await productionWorkerService.linkEmployee({
        employeeId: employee.id,
        name: employee.name,
        code: resolveWorkerCodeFromEmployee(employee),
      });
      if (id) {
        setWorkerId(id);
        await loadWorkerData();
      }
    } finally {
      setLinking(false);
    }
  };

  if (!canView) return <p className="text-sm text-[var(--color-text-muted)] p-4">غير مصرح</p>;
  if (loading) return <LoadingSkeleton rows={4} />;
  if (!workerId) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-sm text-[var(--color-text-muted)]">لا يوجد ملف عامل إنتاج مرتبط بهذا الموظف</p>
        {canManage && employee ? (
          <Button disabled={linking} onClick={() => void handleLinkEmployee()}>
            {linking ? 'جاري الربط...' : 'ربط كعامل إنتاج'}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIBox label="إنتاج اليوم" value={formatNumber(today?.outputQty ?? 0)} icon="today" />
        <KPIBox label="إنجاز اليوم" value={`${today?.achievementPercent ?? 0}%`} icon="speed" />
        <KPIBox label="إنجاز الشهر" value={`${month?.monthlyAchievement ?? 0}%`} icon="calendar_month" />
        <KPIBox label="الدرجة" value={String(month?.performanceScore ?? 0)} icon="grade" />
      </div>
      <Card>
        <button type="button" className="text-primary font-bold text-sm" onClick={() => navigate(`/production-workers/${workerId}`)}>
          عرض تفاصيل الإنتاج الكاملة
        </button>
      </Card>
    </div>
  );
};
