import React, { useCallback, useState } from 'react';
import { Card } from '../UI';
import { applyUiDensity, readUiDensity, writeUiDensity, type UiDensityMode } from '@/core/ui-engine/density/uiDensity';

/**
 * Per-browser preference (localStorage). Visible to all users — does not require saving system settings.
 */
export const UiDensitySection: React.FC = () => {
  const [mode, setMode] = useState<UiDensityMode>(() => readUiDensity());

  const onChange = useCallback((next: UiDensityMode) => {
    setMode(next);
    writeUiDensity(next);
    applyUiDensity(next);
  }, []);

  return (
    <Card title="كثافة الواجهة">
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        يضبط المسافات وحجم الخط محلياً على هذا المتصفح فقط — مريح للقراءة أو مضغوط لعرض أكبر للبيانات.
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'comfortable' as const, label: 'مريح' },
            { id: 'compact' as const, label: 'مضغوط' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={[
              'px-4 py-2.5 rounded-[var(--border-radius-lg)] text-sm font-semibold border transition-colors',
              mode === opt.id
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-[var(--color-bg)] text-[var(--color-text)] border-[var(--color-border)] hover:border-primary/40',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Card>
  );
};
