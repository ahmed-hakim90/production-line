import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../UI';
import { applyUiDensity, readUiDensity, writeUiDensity, type UiDensityMode } from '@/core/ui-engine/density/uiDensity';
import { useAppStore } from '@/store/useAppStore';

/**
 * تفضيل محلي (localStorage). عند وجود كثافة في «محرك المظهر» المحفوظة تُطبَّق على الجلسة عبر `applyAppTheme`
 * ويُفضّل مواءمة هذا القسم معها بعد التحميل أو تحديث الإعدادات.
 */
export const UiDensitySection: React.FC = () => {
  const [mode, setMode] = useState<UiDensityMode>(() => readUiDensity());
  const savedDensity = useAppStore((s) => s.systemSettings?.theme?.density);

  useEffect(() => {
    if (!savedDensity || savedDensity === readUiDensity()) return;
    setMode(savedDensity);
    writeUiDensity(savedDensity);
    applyUiDensity(savedDensity);
  }, [savedDensity]);

  const onChange = useCallback((next: UiDensityMode) => {
    setMode(next);
    writeUiDensity(next);
    applyUiDensity(next);
  }, []);

  return (
    <Card title="كثافة الواجهة (محلي)">
      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        يضبط المسافات والخطوط على هذا المتصفح فقط. الكثافة الافتراضية للمؤسسة تُحفظ من «محرك المظهر» في
        الإعدادات العامة؛ عند تغييرها هنا دون حفظ الثيم قد تُستبدل عند إعادة تحميل الصفحة.
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
