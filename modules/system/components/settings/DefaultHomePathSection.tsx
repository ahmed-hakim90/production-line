import React from 'react';
import { Card } from '../UI';

type DefaultHomePathSectionProps = {
  value: string;
  onChange: (v: string) => void;
};

const OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'افتراضي — لوحات التحكم حسب الدور' },
  { value: '/online', label: 'لوحة الأونلاين (/online)' },
  { value: '/online/dashboard', label: 'لوحة الأونلاين (/online/dashboard)' },
];

/** Tenant default route after opening home `/` — requires onlineDispatch.view when set to online paths. */
export const DefaultHomePathSection: React.FC<DefaultHomePathSectionProps> = ({ value, onChange }) => (
  <Card title="الصفحة الرئيسية بعد تسجيل الدخول">
    <p className="text-xs text-[var(--color-text-muted)] mb-3">
      يحدد المسار المنطقي عند فتح الرئيسية <span dir="ltr">/</span> للمستخدمين الذين يملكون صلاحية المسار المختار.
    </p>
    <select
      className="w-full max-w-md border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
      value={OPTIONS.some((o) => o.value === value) ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {OPTIONS.map((o) => (
        <option key={o.value || 'default'} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </Card>
);
