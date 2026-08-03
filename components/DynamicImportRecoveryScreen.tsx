import React from 'react';
import { resolvePreferredTenantHomePath } from '@/lib/navigationRecovery';
import { hardClientReload } from '@/utils/hardClientReload';

type DynamicImportRecoveryScreenProps = {
  homeHref?: string;
};

/** Full-page recovery when a lazy chunk failed after an automatic reload was already attempted. */
export const DynamicImportRecoveryScreen: React.FC<DynamicImportRecoveryScreenProps> = ({
  homeHref,
}) => {
  const targetHome = (homeHref || '').trim() || resolvePreferredTenantHomePath();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg)]" role="alert">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-sm p-6 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <span className="material-icons-round text-amber-700 dark:text-amber-400 text-3xl" aria-hidden>
            cloud_off
          </span>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-[var(--color-text)]">تعذّر تحميل جزء من التطبيق</h2>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            غالباً بسبب نسخة مخزّنة قديمة بعد تحديث النظام. حدّث الصفحة يدوياً أو ارجع للرئيسية.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:justify-center">
          <button
            type="button"
            onClick={() => {
              void hardClientReload();
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <span className="material-icons-round text-base" aria-hidden>
              refresh
            </span>
            تحديث الصفحة
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.assign(targetHome);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-card)]"
          >
            <span className="material-icons-round text-base" aria-hidden>
              home
            </span>
            الصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
};
