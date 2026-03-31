import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthUiSlice } from '../store/selectors';
import { useAppStore } from '../store/useAppStore';
import { usePermission } from '../utils/permissions';
import { compareSemVer, parseSemVerTriplet } from '../utils/semverCompare';
import { hardClientReload } from '../utils/hardClientReload';
import { Button } from '@/components/UI';

const CLIENT_VERSION = __APP_VERSION__;

export const ForcedClientUpdateGate: React.FC = () => {
  const { isAuthenticated, isPendingApproval, loading } = useAuthUiSlice();
  const { can } = usePermission();
  const isSystemAdmin = can('roles.manage');
  const systemSettings = useAppStore((s) => s.systemSettings);
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const [applying, setApplying] = useState(false);

  const mustUpdate = useMemo(() => {
    if (!systemSettings.forceClientUpdate) return false;
    const min = (systemSettings.minimumClientVersion ?? '').trim();
    if (!min || !parseSemVerTriplet(min) || !parseSemVerTriplet(CLIENT_VERSION)) return false;
    return compareSemVer(CLIENT_VERSION, min) < 0;
  }, [systemSettings.forceClientUpdate, systemSettings.minimumClientVersion]);

  useEffect(() => {
    if (!isAuthenticated || isPendingApproval || loading) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchSystemSettings();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isAuthenticated, isPendingApproval, loading, fetchSystemSettings]);

  const onUpdate = useCallback(() => {
    setApplying(true);
    void hardClientReload();
  }, []);

  if (!isAuthenticated || isPendingApproval || loading || !mustUpdate || isSystemAdmin) return null;

  const message =
    (systemSettings.clientUpdateMessageAr ?? '').trim() ||
    'يتوفر إصدار أحدث من التطبيق. يلزم التحديث للمتابعة.';

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-[var(--color-bg)]/95 backdrop-blur-sm"
      dir="rtl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="forced-update-title"
      aria-describedby="forced-update-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xl p-6 space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <span className="material-icons-round text-amber-700 dark:text-amber-400 text-3xl">system_update</span>
        </div>
        <h2 id="forced-update-title" className="text-lg font-bold text-[var(--color-text)]">
          تحديث مطلوب
        </h2>
        <p id="forced-update-desc" className="text-sm text-[var(--color-text-muted)] leading-relaxed">
          {message}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          الإصدار الحالي: <span className="font-mono font-medium text-[var(--color-text)]">{CLIENT_VERSION}</span>
          {' — '}
          المطلوب:{' '}
          <span className="font-mono font-medium text-[var(--color-text)]">
            {(systemSettings.minimumClientVersion ?? '').trim() || '—'}
          </span>
        </p>
        <Button type="button" className="w-full justify-center" disabled={applying} onClick={onUpdate}>
          {applying ? 'جاري التحديث…' : 'تحديث الآن'}
        </Button>
      </div>
    </div>
  );
};
