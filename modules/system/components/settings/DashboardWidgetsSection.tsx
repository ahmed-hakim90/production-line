import React from 'react';
import { Button, Card } from '../UI';
import { CUSTOM_WIDGET_TYPES } from '../../../../utils/dashboardConfig';
import type { CustomWidgetConfig, CustomWidgetType, WidgetConfig } from '../../../../types';

type WidgetFormState = {
  dashboardKey: string;
  type: CustomWidgetType;
  label: string;
  icon: string;
  permission: string;
  description: string;
  value: string;
  unit: string;
  target: string;
};

type DashboardWidgetsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  dashboardLabels: Record<string, string>;
  selectedDashboardKey: string;
  handleSelectDashboard: (dashboardKey: string) => void;
  localWidgets: Record<string, WidgetConfig[]>;
  selectedWidgetDefs: (dashboardKey: string) => Array<{ id: string; label: string; icon: string }>;
  localCustomWidgets: CustomWidgetConfig[];
  handleDragStart: (dashboardKey: string, index: number) => void;
  handleDragEnter: (dashboardKey: string, index: number) => void;
  handleDragEnd: (dashboardKey: string) => void;
  toggleWidget: (dashboardKey: string, widgetId: string) => void;
  removeCustomWidget: (dashboardKey: string, widgetId: string) => void;
  widgetForm: WidgetFormState;
  setWidgetForm: React.Dispatch<React.SetStateAction<WidgetFormState>>;
  addCustomWidget: () => void;
  onSave: () => void;
};

export const DashboardWidgetsSection: React.FC<DashboardWidgetsSectionProps> = ({
  isAdmin,
  saving,
  dashboardLabels,
  selectedDashboardKey,
  handleSelectDashboard,
  localWidgets,
  selectedWidgetDefs,
  localCustomWidgets,
  handleDragStart,
  handleDragEnter,
  handleDragEnd,
  toggleWidget,
  removeCustomWidget,
  widgetForm,
  setWidgetForm,
  addCustomWidget,
  onSave,
}) => {
  if (!isAdmin) return null;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">إعدادات عناصر لوحات التحكم</h3>
          <p className="page-subtitle">تحكم في ترتيب وظهور العناصر من مكان واحد، مع إمكانية إضافة Widget جديد.</p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
          <span className="material-icons-round text-sm">save</span>
          حفظ التغييرات
        </Button>
      </div>

      <Card title="اختيار لوحة التحكم">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Object.entries(dashboardLabels).map(([dashboardKey, dashboardLabel]) => (
            <button
              key={dashboardKey}
              onClick={() => handleSelectDashboard(dashboardKey)}
              className={`text-sm font-bold rounded-[var(--border-radius-lg)] px-4 py-3 border transition-all ${
                selectedDashboardKey === dashboardKey
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-primary/20'
              }`}
            >
              {dashboardLabel}
            </button>
          ))}
        </div>
      </Card>

      <Card title={`عناصر ${dashboardLabels[selectedDashboardKey] || 'لوحة التحكم'}`} subtitle="اسحب لإعادة الترتيب، وفعّل/عطّل العرض حسب الحاجة">
        <div className="space-y-1">
          {(localWidgets[selectedDashboardKey] || selectedWidgetDefs(selectedDashboardKey).map((def) => ({ id: def.id, visible: true }))).map((widget, index) => {
            const defs = selectedWidgetDefs(selectedDashboardKey);
            const def = defs.find((d) => d.id === widget.id);
            if (!def) return null;
            const isCustom = localCustomWidgets.some((custom) => custom.id === widget.id);

            return (
              <div
                key={widget.id}
                draggable
                onDragStart={() => handleDragStart(selectedDashboardKey, index)}
                onDragEnter={() => handleDragEnter(selectedDashboardKey, index)}
                onDragEnd={() => handleDragEnd(selectedDashboardKey)}
                onDragOver={(e) => e.preventDefault()}
                className={`flex items-center gap-3 p-3 rounded-[var(--border-radius-lg)] border transition-all cursor-grab active:cursor-grabbing group ${
                  widget.visible
                    ? 'bg-[var(--color-card)] border-[var(--color-border)] hover:border-primary/30'
                    : 'bg-[#f8f9fa]/50 border-[var(--color-border)] opacity-60'
                }`}
              >
                <span className="material-icons-round text-[var(--color-text-muted)] dark:text-slate-600 text-lg group-hover:text-primary transition-colors">
                  drag_indicator
                </span>
                <span className="w-8 h-8 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-primary text-sm">{def.icon}</span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--color-text)] truncate">{def.label}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{widget.id}</p>
                </div>
                {isCustom && (
                  <span className="text-[10px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-full">
                    مخصص
                  </span>
                )}
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-0.5 rounded-full">
                  #{index + 1}
                </span>
                {isCustom && (
                  <button
                    onClick={() => removeCustomWidget(selectedDashboardKey, widget.id)}
                    className="w-8 h-8 rounded-[var(--border-radius-base)] border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all"
                    title="حذف الـ Widget"
                  >
                    <span className="material-icons-round text-sm">delete</span>
                  </button>
                )}
                <button
                  onClick={() => toggleWidget(selectedDashboardKey, widget.id)}
                  className={`w-10 h-6 rounded-full transition-all relative shrink-0 ${
                    widget.visible
                      ? 'bg-emerald-500'
                      : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-[var(--color-card)] rounded-full shadow transition-all ${
                      widget.visible ? 'right-0.5' : 'right-[18px]'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="إنشاء Widget جديد" subtitle="Builder بسيط لعنصر Dashboard جديد">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">اللوحة المستهدفة</label>
            <select
              value={widgetForm.dashboardKey}
              onChange={(e) => setWidgetForm((prev) => ({ ...prev, dashboardKey: e.target.value }))}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              {Object.entries(dashboardLabels).map(([dashboardKey, label]) => (
                <option key={dashboardKey} value={dashboardKey}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">نوع الـ Widget</label>
            <select
              value={widgetForm.type}
              onChange={(e) => setWidgetForm((prev) => ({ ...prev, type: e.target.value as CustomWidgetType }))}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            >
              {CUSTOM_WIDGET_TYPES.map((typeDef) => (
                <option key={typeDef.type} value={typeDef.type}>{typeDef.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">الاسم</label>
            <input
              type="text"
              value={widgetForm.label}
              onChange={(e) => setWidgetForm((prev) => ({ ...prev, label: e.target.value }))}
              placeholder="اسم الـ Widget"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">الأيقونة</label>
            <input
              type="text"
              value={widgetForm.icon}
              onChange={(e) => setWidgetForm((prev) => ({ ...prev, icon: e.target.value }))}
              placeholder="widgets"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">الصلاحية (اختياري)</label>
            <input
              type="text"
              value={widgetForm.permission}
              onChange={(e) => setWidgetForm((prev) => ({ ...prev, permission: e.target.value }))}
              placeholder="مثال: reports.view"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">الوصف/النص</label>
            <input
              type="text"
              value={widgetForm.description}
              onChange={(e) => setWidgetForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="وصف قصير"
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>
          {widgetForm.type === 'kpi' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">القيمة</label>
                <input
                  type="text"
                  value={widgetForm.value}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, value: e.target.value }))}
                  placeholder="مثال: 1250"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500">الوحدة</label>
                <input
                  type="text"
                  value={widgetForm.unit}
                  onChange={(e) => setWidgetForm((prev) => ({ ...prev, unit: e.target.value }))}
                  placeholder="وحدة"
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </>
          )}
          {widgetForm.type === 'quick_link' && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">المسار</label>
              <input
                type="text"
                value={widgetForm.target}
                onChange={(e) => setWidgetForm((prev) => ({ ...prev, target: e.target.value }))}
                placeholder="/reports"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={addCustomWidget}>
            <span className="material-icons-round text-sm">add</span>
            إضافة Widget
          </Button>
        </div>
      </Card>
    </>
  );
};
