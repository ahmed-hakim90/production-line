import React from 'react';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
type DefaultHomePathSectionProps = {
  value: string;
  onChange: (v: string) => void;
};
const OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'افتراضي — لوحات التحكم حسب الدور' },
];
/** Tenant default route after opening home `/`. */
export const DefaultHomePathSection: React.FC<DefaultHomePathSectionProps> = ({ value, onChange }) => (
  <OpsDashPanel title="الصفحة الرئيسية بعد تسجيل الدخول">
    <p className="text-xs text-[var(--color-text-muted)] mb-3">
      حالياً المسار الوحيد المتاح هو لوحات التحكم حسب الدور. خيارات مسارات إضافية ستُضاف هنا عند تفعيلها في النظام.
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
  </OpsDashPanel>
);
