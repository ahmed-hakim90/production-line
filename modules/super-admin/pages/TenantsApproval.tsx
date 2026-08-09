import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { tenantService } from '../../../services/tenantService';
import { useAppStore } from '../../../store/useAppStore';
import type { PendingTenant } from '../../../types';

export const TenantsApproval: React.FC = () => {
  const uid = useAppStore((s) => s.uid);
  const [items, setItems] = useState<(PendingTenant & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await tenantService.listPendingTenants();
      setItems(list);
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    if (!uid) return;
    setBusyId(id);
    setError('');
    try {
      await tenantService.approveTenant(id, uid);
      await load();
    } catch (e: any) {
      setError(e?.message || 'فشلت الموافقة');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModuleOpsPageShell
      className="max-w-4xl mx-auto"
      eyebrow="إدارة المنصة"
      rangeLabel="موافقة على تسجيل شركات جديدة وتفعيل المستأجرين"
      onRefresh={() => void load()}
      refreshing={loading}
    >
      {error ? (
        <OpsDashPanel accent="quality">
          <p className="text-rose-600 text-sm">{error}</p>
        </OpsDashPanel>
      ) : null}

      <OpsDashPanel title="طلبات التسجيل المعلقة" accent="quality">
        {loading ? (
          <p className="text-[var(--color-text-muted)]">جاري التحميل...</p>
        ) : items.length === 0 ? (
          <p className="text-[var(--color-text-muted)]">لا توجد طلبات معلقة.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((row) => (
              <li
                key={row.id}
                className="border border-[var(--color-border)] rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--color-card)]"
              >
                <div>
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    @{row.slug} — {row.adminEmail}
                  </p>
                </div>
                <Button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void approve(row.id)}
                >
                  {busyId === row.id ? 'جاري الموافقة...' : 'موافقة وتفعيل'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
