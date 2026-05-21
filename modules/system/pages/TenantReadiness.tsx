import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { PrimaryButton } from '@/src/components/erp/ActionButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { withTenantPath } from '@/lib/tenantPaths';
import { tenantReadinessService } from '../services/tenantReadinessService';
import type { TenantReadinessResult } from '../lib/tenantReadinessLib';

export const TenantReadiness: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TenantReadinessResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await tenantReadinessService.evaluate());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="جاهزية المستأجر"
        subtitle="فحص إعداد التشغيل الأساسي قبل الاعتماد على التقارير والمخزون"
        actions={
          <PrimaryButton onClick={() => void load()} disabled={loading}>
            إعادة الفحص
          </PrimaryButton>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : result ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard label="نسبة الجاهزية" value={`${result.percent}%`} iconType="metric" color="indigo" />
            <KPICard label="فحوصات ناجحة" value={`${result.score}/${result.total}`} iconType="metric" color="green" />
            <KPICard
              label="الحالة"
              value={result.percent >= 80 ? 'جاهز للتشغيل' : 'يتطلب إعداداً'}
              iconType="metric"
              color={result.percent >= 80 ? 'green' : 'amber'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>قائمة الفحوصات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.checks.map((check) => (
                <div
                  key={check.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    check.ok
                      ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10'
                      : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/10'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`material-icons-round text-xl ${check.ok ? 'text-emerald-600' : 'text-amber-600'}`}
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
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
};
