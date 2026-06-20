import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '@/components/PageHeader';
import { Card, KPIBox, Badge, Button, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber, getTodayDateString } from '@/utils/calculations';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS, type ProductionWorker, type ProductionWorkerTarget } from '@/types';
import { ProductionWorkerLineAssignmentsSection } from '../components/ProductionWorkerLineAssignmentsSection';

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const ProductionWorkerDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canManageTargets = can('production.workerTargets.manage') || can('production.workers.manage');
  const canManageWorkers = can('production.workers.manage');

  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const workerSettings = useAppStore((s) => s.systemSettings.productionWorkerSettings ?? DEFAULT_PRODUCTION_WORKER_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [worker, setWorker] = useState<ProductionWorker | null>(null);
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof productionLineWorkerAssignmentService.getByWorker>>>([]);
  const [targets, setTargets] = useState<ProductionWorkerTarget[]>([]);
  const [dailyHistory, setDailyHistory] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getDailyAchievement>>[]>([]);
  const [monthStats, setMonthStats] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getMonthlyAchievement>> | null>(null);
  const [todayStats, setTodayStats] = useState<Awaited<ReturnType<typeof productionWorkerPerformanceService.getDailyAchievement>> | null>(null);
  const [targetForm, setTargetForm] = useState({
    productId: '',
    lineId: '',
    dailyTargetQty: 0,
    effectiveFrom: getTodayDateString(),
  });

  const activeTab = searchParams.get('tab') === 'targets' ? 'targets' : 'overview';
  const month = currentMonth();
  const today = getTodayDateString();

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [w, a, t, monthly, daily] = await Promise.all([
          productionWorkerService.getById(id),
          productionLineWorkerAssignmentService.getByWorker(id),
          productionWorkerTargetService.getByWorker(id),
          productionWorkerPerformanceService.getMonthlyAchievement(id, month, {
            settings: workerSettings,
            products: products as never[],
            lineProductConfigs,
          }),
          productionWorkerPerformanceService.getDailyAchievement(id, today, {
            products: products as never[],
            settings: workerSettings,
            lineProductConfigs,
          }),
        ]);
        if (cancelled) return;
        setWorker(w);
        setAssignments(a);
        setTargets(t);
        setMonthStats(monthly);
        setTodayStats(daily);
        const history: typeof dailyHistory = [];
        for (let i = 6; i >= 0; i -= 1) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          history.push(await productionWorkerPerformanceService.getDailyAchievement(id, date, {
            worker: w ?? undefined,
            targets: t,
            products: products as never[],
            settings: workerSettings,
            lineProductConfigs,
          }));
        }
        setDailyHistory(history);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, month, today, products, lineProductConfigs, workerSettings]);

  const linkedEmployee = useMemo(
    () => _rawEmployees.find((e) => e.id === worker?.employeeId) ?? null,
    [_rawEmployees, worker?.employeeId],
  );

  const getLineName = (lineId: string) => productionLines.find((l) => l.id === lineId)?.name ?? lineId;
  const getProductName = (productId: string) => products.find((p) => p.id === productId)?.name ?? productId;

  const saveTarget = async () => {
    if (!id || !targetForm.productId || !targetForm.dailyTargetQty) return;
    await productionWorkerTargetService.create({
      workerId: id,
      productId: targetForm.productId,
      lineId: targetForm.lineId || undefined,
      dailyTargetQty: targetForm.dailyTargetQty,
      unit: 'piece',
      isActive: true,
      effectiveFrom: targetForm.effectiveFrom,
    });
    const refreshed = await productionWorkerTargetService.getByWorker(id);
    setTargets(refreshed);
    setTargetForm({ productId: '', lineId: '', dailyTargetQty: 0, effectiveFrom: today });
  };

  if (loading) return <LoadingSkeleton rows={8} />;
  if (!worker) {
    return (
      <Card>
        <p className="p-4">العامل غير موجود</p>
        <Button variant="outline" onClick={() => navigate('/production-workers')}>رجوع</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={worker.name}
        subtitle={`كود: ${worker.code}`}
        secondaryAction={{ label: 'رجوع', onClick: () => navigate('/production-workers') }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIBox label="إنتاج اليوم" value={formatNumber(todayStats?.outputQty ?? 0)} icon="today" />
        <KPIBox label="إنجاز اليوم" value={`${todayStats?.achievementPercent ?? 0}%`} icon="speed" />
        <KPIBox label="إنجاز الشهر" value={`${monthStats?.monthlyAchievement ?? 0}%`} icon="calendar_month" />
        <KPIBox label="تقدير المكافأة" value={formatNumber(monthStats?.bonusEstimate ?? 0)} icon="payments" />
      </div>

      <Card title="الملف الشخصي">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <p><strong>الموظف المرتبط:</strong> {linkedEmployee?.name ?? '—'}</p>
          <p><strong>الحالة:</strong> <Badge variant={worker.isActive === false ? 'danger' : 'success'}>{worker.isActive === false ? 'غير نشط' : 'نشط'}</Badge></p>
          <p><strong>الخط الافتراضي:</strong> {worker.defaultLineId ? getLineName(worker.defaultLineId) : '—'}</p>
          <p><strong>نسبة الحضور:</strong> {monthStats?.attendanceRate ?? 0}%</p>
        </div>
      </Card>

      <ProductionWorkerLineAssignmentsSection
        workerId={id!}
        assignments={assignments}
        productionLines={productionLines}
        canManage={canManageWorkers}
        onAssignmentsChange={setAssignments}
      />

      {(activeTab === 'targets' || canManageTargets) && (
        <Card title="أهداف المنتجات">
          {canManageTargets && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <select className="border rounded-lg p-2" value={targetForm.productId} onChange={(e) => setTargetForm({ ...targetForm, productId: e.target.value })}>
                <option value="">المنتج</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="border rounded-lg p-2" value={targetForm.lineId} onChange={(e) => setTargetForm({ ...targetForm, lineId: e.target.value })}>
                <option value="">كل الخطوط</option>
                {productionLines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <input type="number" min={0} className="border rounded-lg p-2" placeholder="الهدف اليومي" value={targetForm.dailyTargetQty || ''} onChange={(e) => setTargetForm({ ...targetForm, dailyTargetQty: Number(e.target.value) || 0 })} />
              <Button onClick={() => void saveTarget()}>إضافة هدف</Button>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--color-text-muted)]">
                <th className="text-right py-2">المنتج</th>
                <th className="text-right py-2">الخط</th>
                <th className="text-center py-2">الهدف</th>
                <th className="text-right py-2">من</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id} className="border-t border-[var(--color-border)]">
                  <td className="py-2">{getProductName(t.productId)}</td>
                  <td className="py-2">{t.lineId ? getLineName(t.lineId) : 'عام'}</td>
                  <td className="py-2 text-center">{formatNumber(t.dailyTargetQty)}</td>
                  <td className="py-2">{t.effectiveFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="السجل اليومي (آخر 7 أيام)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="text-right py-2">التاريخ</th>
              <th className="text-center py-2">الهدف</th>
              <th className="text-center py-2">الإنتاج</th>
              <th className="text-center py-2">الإنجاز</th>
              <th className="text-right py-2">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {dailyHistory.map((row) => (
              <tr key={row.date} className="border-t border-[var(--color-border)]">
                <td className="py-2">{row.date}</td>
                <td className="py-2 text-center">{formatNumber(row.targetQty)}</td>
                <td className="py-2 text-center">{formatNumber(row.outputQty)}</td>
                <td className="py-2 text-center">{row.achievementPercent}%</td>
                <td className="py-2">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
