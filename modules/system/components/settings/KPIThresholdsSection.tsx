import React from 'react';
import { Button } from '../UI';
import { KPI_DEFINITIONS, DEFAULT_KPI_THRESHOLDS } from '../../../../utils/dashboardConfig';
import type { KPIThreshold } from '../../../../types';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
type KPIThresholdsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  localKPIs: Record<string, KPIThreshold>;
  setLocalKPIs: React.Dispatch<React.SetStateAction<Record<string, KPIThreshold>>>;
  onSave: () => void;
};
export const KPIThresholdsSection: React.FC<KPIThresholdsSectionProps> = ({
  isAdmin,
  saving,
  localKPIs,
  setLocalKPIs,
  onSave,
}) => {
  if (!isAdmin) return null;
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">حدود مؤشرات الأداء</h3>
          <p className="page-subtitle">حدد قيم "جيد" و"تحذير" لكل مؤشر. تُستخدم لتلوين المؤشرات في لوحات التحكم.</p>
        </div>
        <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
          {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
          <span className="material-icons-round text-sm">save</span>
          حفظ التغييرات
        </Button>
      </div>
      <OpsDashPanel>
        <div className="md:hidden space-y-2.5">
          {KPI_DEFINITIONS.map((kpi) => {
            const threshold = localKPIs[kpi.key] || DEFAULT_KPI_THRESHOLDS[kpi.key];
            return (
              <div key={kpi.key} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="material-icons-round text-primary">{kpi.icon}</span>
                  <p className="text-sm font-bold text-[var(--color-text)]">{kpi.label}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] mr-auto">{kpi.unit}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] font-bold text-[rgb(var(--color-success))] mb-1">جيد</p>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="w-full border border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] rounded-[var(--border-radius-base)] text-sm font-bold text-center py-2 px-2 outline-none focus:ring-2 focus:ring-[rgb(var(--color-success))]/20 transition-all"
                      value={threshold.good}
                      onChange={(e) =>
                        setLocalKPIs((prev) => ({
                          ...prev,
                          [kpi.key]: { ...prev[kpi.key], good: Number(e.target.value) },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-[rgb(var(--color-warning))] mb-1">تحذير</p>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="w-full border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] rounded-[var(--border-radius-base)] text-sm font-bold text-center py-2 px-2 outline-none focus:ring-2 focus:ring-[rgb(var(--color-warning))]/20 transition-all"
                      value={threshold.warning}
                      onChange={(e) =>
                        setLocalKPIs((prev) => ({
                          ...prev,
                          [kpi.key]: { ...prev[kpi.key], warning: Number(e.target.value) },
                        }))
                      }
                    />
                  </div>
                </div>
                <p className="text-xs font-bold text-[var(--color-text-muted)]">
                  {kpi.invertedScale ? `خطر إذا > ${threshold.warning}${kpi.unit}` : `خطر إذا < ${threshold.warning}${kpi.unit}`}
                </p>
              </div>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="erp-table w-full text-sm">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">المؤشر</th>
                <th className="erp-th text-center">الوحدة</th>
                <th className="erp-th text-center">المقياس</th>
                <th className="erp-th text-center">
                  <span className="text-[rgb(var(--color-success))]">جيد</span>
                </th>
                <th className="erp-th text-center">
                  <span className="text-[rgb(var(--color-warning))]">تحذير</span>
                </th>
                <th className="erp-th text-center">
                  <span className="text-[rgb(var(--color-danger))]">خطر</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {KPI_DEFINITIONS.map((kpi) => {
                const threshold = localKPIs[kpi.key] || DEFAULT_KPI_THRESHOLDS[kpi.key];
                return (
                  <tr key={kpi.key} className="hover:bg-[var(--color-bg)] transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <span className="material-icons-round text-primary">{kpi.icon}</span>
                        <span className="font-bold text-[var(--color-text)]">{kpi.label}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center text-[var(--color-text-muted)] font-bold">{kpi.unit}</td>
                    <td className="py-4 px-4 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        kpi.invertedScale
                          ? 'bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] text-[rgb(var(--color-primary))]'
                          : 'bg-[rgb(var(--color-secondary)/0.1)] dark:bg-[rgb(var(--color-secondary)/0.15)] text-[rgb(var(--color-secondary))] dark:text-[rgb(var(--color-secondary))]'
                      }`}>
                        {kpi.invertedScale ? 'أقل = أفضل' : 'أعلى = أفضل'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="w-20 border border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] rounded-[var(--border-radius-base)] text-sm font-bold text-center py-2 px-2 outline-none focus:ring-2 focus:ring-[rgb(var(--color-success))]/20 transition-all"
                        value={threshold.good}
                        onChange={(e) =>
                          setLocalKPIs((prev) => ({
                            ...prev,
                            [kpi.key]: { ...prev[kpi.key], good: Number(e.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="w-20 border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] rounded-[var(--border-radius-base)] text-sm font-bold text-center py-2 px-2 outline-none focus:ring-2 focus:ring-[rgb(var(--color-warning))]/20 transition-all"
                        value={threshold.warning}
                        onChange={(e) =>
                          setLocalKPIs((prev) => ({
                            ...prev,
                            [kpi.key]: { ...prev[kpi.key], warning: Number(e.target.value) },
                          }))
                        }
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-xs font-bold text-[var(--color-text-muted)]">
                        {kpi.invertedScale
                          ? `> ${threshold.warning}${kpi.unit}`
                          : `< ${threshold.warning}${kpi.unit}`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>
      <OpsDashPanel title="معاينة الألوان">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {KPI_DEFINITIONS.map((kpi) => {
            const threshold = localKPIs[kpi.key] || DEFAULT_KPI_THRESHOLDS[kpi.key];
            return (
              <div key={kpi.key} className="space-y-2">
                <p className="text-xs font-bold text-[var(--color-text-muted)] text-center">{kpi.label}</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] bg-[rgb(var(--color-success)/0.1)] dark:bg-[rgb(var(--color-success)/0.15)] border border-[rgb(var(--color-success)/0.25)]">
                    <span className="w-2 h-2 rounded-full bg-[rgb(var(--color-success)/0.1)]0"></span>
                    <span className="text-xs font-bold text-[rgb(var(--color-success))]">
                      {kpi.invertedScale ? `≤ ${threshold.good}${kpi.unit}` : `≥ ${threshold.good}${kpi.unit}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] border border-[rgb(var(--color-warning)/0.25)]">
                    <span className="w-2 h-2 rounded-full bg-[rgb(var(--color-warning)/0.1)]0"></span>
                    <span className="text-xs font-bold text-[rgb(var(--color-warning))]">
                      {kpi.invertedScale
                        ? `${threshold.good} — ${threshold.warning}${kpi.unit}`
                        : `${threshold.warning} — ${threshold.good}${kpi.unit}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] border border-[rgb(var(--color-danger)/0.25)]">
                    <span className="w-2 h-2 rounded-full bg-[rgb(var(--color-danger)/0.1)]0"></span>
                    <span className="text-xs font-bold text-[rgb(var(--color-danger))]">
                      {kpi.invertedScale ? `> ${threshold.warning}${kpi.unit}` : `< ${threshold.warning}${kpi.unit}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setLocalKPIs({ ...DEFAULT_KPI_THRESHOLDS })}
          className="mt-6 text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons-round text-sm">restart_alt</span>
          إعادة تعيين للقيم الافتراضية
        </button>
      </OpsDashPanel>
    </>
  );
};
