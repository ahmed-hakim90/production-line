import React from 'react';
import { Button, Card } from '../UI';
import type { QuickActionColor, QuickActionItem } from '../../../../types';

type QuickActionDef = {
  key: string;
  label: string;
  actionType: QuickActionItem['actionType'];
  target?: string;
  permission?: string;
  icon: string;
  color: QuickActionColor;
};

type QuickActionColorOption = {
  value: QuickActionColor;
  label: string;
  classes: string;
};

type QuickActionsSectionProps = {
  isAdmin: boolean;
  saving: boolean;
  localQuickActions: QuickActionItem[];
  editingQuickActionId: string | null;
  setEditingQuickActionId: React.Dispatch<React.SetStateAction<string | null>>;
  moveQuickAction: (id: string, direction: 'up' | 'down') => void;
  removeQuickAction: (id: string) => void;
  getQuickActionMatch: (item: QuickActionItem) => string;
  updateQuickAction: (id: string, patch: Partial<QuickActionItem>) => void;
  addQuickAction: () => void;
  onSave: () => void;
  availableQuickActions: QuickActionDef[];
  quickActionIcons: string[];
  quickActionColors: QuickActionColorOption[];
};

export const QuickActionsSection: React.FC<QuickActionsSectionProps> = ({
  isAdmin,
  saving,
  localQuickActions,
  editingQuickActionId,
  setEditingQuickActionId,
  moveQuickAction,
  removeQuickAction,
  getQuickActionMatch,
  updateQuickAction,
  addQuickAction,
  onSave,
  availableQuickActions,
  quickActionIcons,
  quickActionColors,
}) => {
  if (!isAdmin) return null;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">الإجراءات السريعة — لوحة مدير المصنع</h3>
          <p className="page-subtitle">أنشئ أزرار تنقل أو تصدير بسرعة، وخصص الاسم والأيقونة واللون.</p>
        </div>
        <Button onClick={onSave} disabled={saving}>
          {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
          <span className="material-icons-round text-sm">save</span>
          حفظ التغييرات
        </Button>
      </div>

      <Card title="قائمة الأزرار السريعة" subtitle="الترتيب هنا هو نفس ترتيب الأزرار في لوحة مدير المصنع">
        <div className="space-y-3">
          {localQuickActions.length === 0 && (
            <div className="text-center py-10 bg-[#f8f9fa]/50 border border-dashed border-[var(--color-border)] rounded-[var(--border-radius-lg)]">
              <span className="material-icons-round text-3xl text-[var(--color-text-muted)] dark:text-slate-600">bolt</span>
              <p className="mt-2 text-sm font-bold text-slate-500">لا توجد إجراءات سريعة حتى الآن</p>
            </div>
          )}

          {localQuickActions.map((item, index) => {
            const selectedColor = quickActionColors.find((c) => c.value === item.color) ?? quickActionColors[0];
            return (
              <div key={item.id} className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4 space-y-4 bg-[var(--color-card)]">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] border ${selectedColor.classes}`}>
                    <span className="material-icons-round text-base">{item.icon}</span>
                    <span className="text-sm font-bold">{item.label || 'بدون اسم'}</span>
                  </div>
                  <span className="text-[11px] font-bold text-[var(--color-text-muted)] bg-[#f0f2f5] px-2 py-1 rounded-full sm:mr-auto">
                    ترتيب #{index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveQuickAction(item.id, 'up')}
                      disabled={index === 0}
                      className="w-8 h-8 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title="تحريك لأعلى"
                    >
                      <span className="material-icons-round text-sm">keyboard_arrow_up</span>
                    </button>
                    <button
                      onClick={() => moveQuickAction(item.id, 'down')}
                      disabled={index === localQuickActions.length - 1}
                      className="w-8 h-8 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title="تحريك لأسفل"
                    >
                      <span className="material-icons-round text-sm">keyboard_arrow_down</span>
                    </button>
                    <button
                      onClick={() => setEditingQuickActionId((prev) => (prev === item.id ? null : item.id))}
                      className="w-8 h-8 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 transition-all"
                      title="تعديل"
                    >
                      <span className="material-icons-round text-sm">edit</span>
                    </button>
                    <button
                      onClick={() => removeQuickAction(item.id)}
                      className="w-8 h-8 rounded-[var(--border-radius-base)] border border-rose-200 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 transition-all"
                      title="حذف"
                    >
                      <span className="material-icons-round text-sm">delete</span>
                    </button>
                  </div>
                </div>

                {editingQuickActionId === item.id && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 rounded-[var(--border-radius-lg)] bg-[#f8f9fa]/40 border border-[var(--color-border)]">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">اسم الزر</label>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => updateQuickAction(item.id, { label: e.target.value })}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                        placeholder="مثال: إدخال سريع"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">الإجراء</label>
                      <select
                        value={getQuickActionMatch(item)}
                        onChange={(e) => {
                          const selected = availableQuickActions.find((def) => def.key === e.target.value);
                          if (!selected) return;
                          updateQuickAction(item.id, {
                            actionType: selected.actionType,
                            target: selected.target,
                            permission: selected.permission,
                            icon: selected.icon,
                            color: selected.color,
                          });
                        }}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                      >
                        <option value="custom">مخصص (تعديل يدوي)</option>
                        {availableQuickActions.map((def) => (
                          <option key={def.key} value={def.key}>{def.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">الأيقونة</label>
                      <select
                        value={item.icon}
                        onChange={(e) => updateQuickAction(item.id, { icon: e.target.value })}
                        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                      >
                        {quickActionIcons.map((icon) => (
                          <option key={icon} value={icon}>{icon}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500">اللون</label>
                      <div className="flex flex-wrap gap-2">
                        {quickActionColors.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => updateQuickAction(item.id, { color: color.value })}
                            className={`px-3 py-1.5 rounded-[var(--border-radius-base)] border text-xs font-bold transition-all ${color.classes} ${item.color === color.value ? 'ring-2 ring-primary/30' : ''}`}
                          >
                            {color.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="lg:col-span-2 text-[11px] font-medium text-[var(--color-text-muted)] flex flex-wrap items-center gap-3">
                      <span>النوع: <span className="font-bold text-[var(--color-text-muted)]">{item.actionType}</span></span>
                      {item.target && <span>المسار: <span className="font-mono">{item.target}</span></span>}
                      {item.permission && <span>الصلاحية: <span className="font-mono">{item.permission}</span></span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <Button variant="outline" onClick={addQuickAction}>
            <span className="material-icons-round text-sm">add</span>
            إضافة زر سريع
          </Button>
        </div>
      </Card>
    </>
  );
};
