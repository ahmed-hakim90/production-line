import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppStore } from '../../../store/useAppStore';
import { opsInboxService, type OpsInboxItem, type OpsInboxSnapshot } from '../services/opsInboxService';

const severityClass: Record<OpsInboxItem['severity'], string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-amber-100 text-amber-800 border-amber-200',
  medium: 'bg-blue-100 text-blue-800 border-blue-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

const severityLabel: Record<OpsInboxItem['severity'], string> = {
  critical: 'حرج',
  high: 'مرتفع',
  medium: 'متوسط',
  low: 'منخفض',
};

export const OpsInbox: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const employees = useAppStore((s) => s.employees);
  const lines = useAppStore((s) => s.productionLines);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<OpsInboxSnapshot | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await opsInboxService.loadSnapshot({
        employees,
        lines,
        settings: systemSettings,
      });
      setSnapshot(data);
    } finally {
      setLoading(false);
    }
  }, [employees, lines, systemSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!snapshot) return [];
    if (filter === 'all') return snapshot.items;
    return snapshot.items.filter((i) => i.category === filter);
  }, [snapshot, filter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز العمليات"
        subtitle={snapshot ? `تاريخ التشغيل: ${snapshot.operationalDate}` : 'تجميع المهام التشغيلية'}
        actions={<PrimaryButton onClick={() => void load()} disabled={loading}>تحديث</PrimaryButton>}
      />

      {loading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : snapshot ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPICard label="تحويلات معلقة" value={snapshot.counts.transfers} iconType="trend" color="amber" />
            <KPICard label="تقارير ناقصة" value={snapshot.counts.missingReports} iconType="metric" color="red" />
            <KPICard label="تحذيرات تكلفة" value={snapshot.counts.costIssues} iconType="money" color="amber" />
            <KPICard label="خطط قديمة" value={snapshot.counts.stalePlans} iconType="metric" color="gray" />
            <KPICard label="تجاوز SLA" value={snapshot.counts.slaBreaches} iconType="trend" color="red" />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'الكل' },
              { key: 'transfer', label: 'تحويلات' },
              { key: 'report', label: 'تقارير' },
              { key: 'cost', label: 'تكاليف' },
              { key: 'plan', label: 'خطط' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  filter === tab.key ? 'bg-primary/10 border-primary/30 text-primary' : 'border-[var(--color-border)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>قائمة المهام ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">لا توجد عناصر في هذا الفلتر.</p>
              ) : (
                filtered.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-4 py-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${severityClass[item.severity]}`}>
                          {severityLabel[item.severity]}
                        </span>
                        <p className="font-bold text-sm">{item.title}</p>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">{item.detail}</p>
                    </div>
                    <Link
                      to={withTenantPath(tenantSlug, item.actionPath)}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      فتح ←
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
};
