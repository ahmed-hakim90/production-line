import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Skeleton } from '@/components/ui/skeleton';
import { withTenantPath } from '@/lib/tenantPaths';
import { tenantReadinessService } from '../services/tenantReadinessService';
import type { TenantReadinessResult } from '../lib/tenantReadinessLib';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';

const CACHE_KEY = 'system:tenantReadiness';

export const TenantReadiness: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const {
    data: result,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<TenantReadinessResult>(
    CACHE_KEY,
    () => tenantReadinessService.evaluate(),
    { maxAgeMs: 60_000 },
  );

  const load = async () => {
    invalidatePageDataCache(CACHE_KEY);
    await reloadCached(true);
  };

  return (
    <ModuleOpsPageShell
      eyebrow="النظام"
      rangeLabel="فحص إعداد التشغيل الأساسي قبل الاعتماد على التقارير والمخزون"
      hero={result ? [
        { key: 'percent', label: 'نسبة الجاهزية', value: `${result.percent}%`, accent: true },
        { key: 'score', label: 'فحوصات ناجحة', value: `${result.score}/${result.total}` },
        {
          key: 'status',
          label: 'الحالة',
          value: result.percent >= 80 ? 'جاهز للتشغيل' : 'يتطلب إعداداً',
        },
      ] : undefined}
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {loading && !result ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : result ? (
        <OpsDashPanel title="قائمة الفحوصات" accent="quality">
          <div className="space-y-3">
            {result.checks.map((check) => (
              <div
                key={check.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                  check.ok
                    ? 'border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)]/50 dark:border-[rgb(var(--color-success))]/40 dark:bg-[rgb(var(--color-success)/0.15)]'
                    : 'border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/50 dark:border-[rgb(var(--color-warning))]/40 dark:bg-[rgb(var(--color-warning)/0.15)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`material-icons-round text-xl ${check.ok ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-warning))]'}`}
                  >
                    {check.ok ? 'check_circle' : 'error_outline'}
                  </span>
                  <div>
                    <p className="font-bold text-sm text-[var(--color-text)]">{check.label}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{check.detail}</p>
                  </div>
                </div>
                {!check.ok && (
                  <Link
                    to={withTenantPath(tenantSlug, check.fixPath)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    إصلاح ←
                  </Link>
                )}
              </div>
            ))}
          </div>
        </OpsDashPanel>
      ) : null}
    </ModuleOpsPageShell>
  );
};
