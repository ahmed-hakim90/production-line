import React, { useCallback, useEffect, useState } from 'react';
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
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">موافقة على تسجيل شركات جديدة</h1>
      {error ? <p className="text-rose-600 text-sm mb-3">{error}</p> : null}
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
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                disabled={busyId === row.id}
                onClick={() => void approve(row.id)}
              >
                {busyId === row.id ? 'جاري الموافقة...' : 'موافقة وتفعيل'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
