import React from 'react';
import { Card } from '../UI';
import type { PlanSettings } from '../../../../types';

type GeneralSystemBehaviorSectionProps = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  allPermissions: string[];
  hrUsers: Array<{ id: string; label: string }>;
};

export const GeneralSystemBehaviorSection: React.FC<GeneralSystemBehaviorSectionProps> = ({
  isAdmin,
  localPlanSettings,
  setLocalPlanSettings,
  allPermissions,
  hrUsers,
}) => {
  if (!isAdmin) return null;

  return (
    <Card title="سلوك النظام">
      <div className="space-y-4">
        {([
          { key: 'allowMultipleActivePlans' as keyof PlanSettings, label: 'السماح بخطط متعددة نشطة على نفس الخط', icon: 'playlist_add', desc: 'عند التعطيل لن يُسمح بإنشاء خطة جديدة على خط يحتوي بالفعل على خطة نشطة.' },
          { key: 'autoClosePlan' as keyof PlanSettings, label: 'إغلاق الخطة تلقائياً عند الاكتمال', icon: 'event_available', desc: 'عند التفعيل، يتم تغيير حالة الخطة إلى "مكتملة" تلقائياً عند الوصول للكمية المخططة.' },
          { key: 'autoGenerateMaterialRequirements' as keyof PlanSettings, label: 'توليد احتياجات المواد تلقائياً', icon: 'checklist', desc: 'عند التفعيل، يُحدَّث احتياج المواد لكل خطة بعد الحفظ (يتطلب صلاحية توليد الاحتياجات).' },
          { key: 'allowNegativeDecomposedStock' as keyof PlanSettings, label: 'السماح بالسالب في مخزن المفكك', icon: 'remove_circle_outline', desc: 'عند التفعيل، يمكن خصم مواد خام من مخزن المفكك حتى لو الرصيد غير كافٍ في التقارير، واعتماد تحويلات صادرة من مخزن المفكك المحدد في الإعدادات بنفس الشرط (مع صلاحية الموافقة على التحويل بالسالب).' },
          { key: 'allowNegativeFinishedTransferStock' as keyof PlanSettings, label: 'السماح بتحويل تم الصنع بالسالب', icon: 'swap_horiz', desc: 'عند التفعيل، يمكن اعتماد تحويلات صادرة من مخزن "تم الصنع" حتى لو الرصيد أقل من الكمية (مع صلاحية الموافقة على التحويل بالسالب).' },
          { key: 'useOperationalPeriodDailyTarget' as keyof PlanSettings, label: 'هدف يومي من فترة التشغيل (٢٦→٢٦)', icon: 'calendar_month', desc: 'عند التفعيل وبدون تارجت يدوي: الهدف اليومي = كمية الخطة ÷ أيام الشغل في فترة التشغيل (الجمعة إجازة). مناسب للخطط الجماعية والتقييم بالخطة.' },
        ]).map((setting) => (
          <div key={setting.key} className="flex items-center gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary">{setting.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">{setting.label}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{setting.desc}</p>
            </div>
            <button
              onClick={() => setLocalPlanSettings((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${(localPlanSettings as any)[setting.key] ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${(localPlanSettings as any)[setting.key] ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'}`} />
            </button>
          </div>
        ))}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">delete_sweep</span>
              <p className="text-sm font-bold text-[var(--color-text)]">حد الهدر الأقصى</p>
            </div>
            <div className="erp-page-actions">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={localPlanSettings.maxWasteThreshold}
                onChange={(e) => setLocalPlanSettings((p) => ({ ...p, maxWasteThreshold: Number(e.target.value) }))}
              />
              <span className="text-sm font-bold text-[var(--color-text-muted)]">%</span>
            </div>
          </div>

          <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">speed</span>
              <p className="text-sm font-bold text-[var(--color-text)]">حساب الكفاءة</p>
            </div>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.efficiencyCalculationMode}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, efficiencyCalculationMode: e.target.value as 'standard' | 'weighted' }))}
            >
              <option value="standard">قياسي</option>
              <option value="weighted">مرجّح</option>
            </select>
          </div>

          <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">equalizer</span>
              <p className="text-sm font-bold text-[var(--color-text)]">متوسط الإنتاج</p>
            </div>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.averageProductionMode}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, averageProductionMode: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
            >
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
              <option value="monthly">شهري</option>
            </select>
          </div>

          <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] sm:col-span-3">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">event_repeat</span>
              <p className="text-sm font-bold text-[var(--color-text)]">يوم بداية شهر التشغيل</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              الفترة من هذا اليوم إلى نفس اليوم في الشهر التالي (نهاية حصرية). مثال: ٢٦ → الفترة ٢٦ يونيو حتى ٢٥ يوليو، والشهر التالي يبدأ ٢٦ يوليو.
            </p>
            <div className="erp-page-actions max-w-xs">
              <input
                type="number"
                min={1}
                max={28}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={localPlanSettings.operationalMonthStartDay ?? 26}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  const day = Number.isFinite(raw) ? Math.min(28, Math.max(1, Math.round(raw))) : 26;
                  setLocalPlanSettings((p) => ({ ...p, operationalMonthStartDay: day }));
                }}
              />
              <span className="text-sm font-bold text-[var(--color-text-muted)]">من كل شهر</span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-icons-round text-primary text-lg">inventory_2</span>
            <p className="text-sm font-bold text-[var(--color-text)]">بادئة كود دورة التوريد (باتش)</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            تُستخدم في الصيغة PREFIX-سنة-تسلسل (مثال SC-2026-0001). حروف وأرقام إنجليزية فقط، 2–6 أحرف.
          </p>
          <input
            type="text"
            maxLength={6}
            className="w-full max-w-xs border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono uppercase"
            value={localPlanSettings.supplyCycleBatchCodePrefix ?? 'SC'}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
              setLocalPlanSettings((p) => ({ ...p, supplyCycleBatchCodePrefix: v || 'SC' }));
            }}
            placeholder="SC"
          />
        </div>

        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-icons-round text-primary text-lg">qr_code_2</span>
            <p className="text-sm font-bold text-[var(--color-text)]">بادئات الأكواد التلقائية</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            تُستخدم عند إنشاء منتج أو مادة خام أو تصنيف بدون إدخال كود يدوي. الصيغة PREFIX-NNNN (البادئة حروف/أرقام إنجليزية، الخانات عدد الأرقام في التسلسل).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">منتجات — بادئة</p>
              <input
                type="text"
                maxLength={8}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none font-mono uppercase"
                value={localPlanSettings.productCodePrefix ?? 'PRD'}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                  setLocalPlanSettings((p) => ({ ...p, productCodePrefix: v || 'PRD' }));
                }}
                placeholder="PRD"
              />
              <p className="text-xs font-bold text-[var(--color-text-muted)]">عدد الخانات</p>
              <input
                type="number"
                min={2}
                max={12}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none"
                value={localPlanSettings.productCodePadding ?? 5}
                onChange={(e) =>
                  setLocalPlanSettings((p) => ({
                    ...p,
                    productCodePadding: Math.min(12, Math.max(2, Math.floor(Number(e.target.value) || 5))),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">مواد خام — بادئة</p>
              <input
                type="text"
                maxLength={8}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none font-mono uppercase"
                value={localPlanSettings.rawMaterialCodePrefix ?? 'RM'}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                  setLocalPlanSettings((p) => ({ ...p, rawMaterialCodePrefix: v || 'RM' }));
                }}
                placeholder="RM"
              />
              <p className="text-xs font-bold text-[var(--color-text-muted)]">عدد الخانات</p>
              <input
                type="number"
                min={2}
                max={12}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none"
                value={localPlanSettings.rawMaterialCodePadding ?? 4}
                onChange={(e) =>
                  setLocalPlanSettings((p) => ({
                    ...p,
                    rawMaterialCodePadding: Math.min(12, Math.max(2, Math.floor(Number(e.target.value) || 4))),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-[var(--color-text-muted)]">تصنيفات — بادئة</p>
              <input
                type="text"
                maxLength={8}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none font-mono uppercase"
                value={localPlanSettings.categoryCodePrefix ?? 'CAT'}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
                  setLocalPlanSettings((p) => ({ ...p, categoryCodePrefix: v || 'CAT' }));
                }}
                placeholder="CAT"
              />
              <p className="text-xs font-bold text-[var(--color-text-muted)]">عدد الخانات</p>
              <input
                type="number"
                min={2}
                max={12}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none"
                value={localPlanSettings.categoryCodePadding ?? 4}
                onChange={(e) =>
                  setLocalPlanSettings((p) => ({
                    ...p,
                    categoryCodePadding: Math.min(12, Math.max(2, Math.floor(Number(e.target.value) || 4))),
                  }))
                }
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">filter_alt</span>
            <p className="text-sm font-bold text-[var(--color-text)]">فلاتر فئة مكونات الحقن</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            اكتب كلمة أو أكثر (مفصولة بفاصلة) ليتم اعتمادها في تصفية خامات "تقرير مكون حقن". مثال: حقن, injection
          </p>
          <input
            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localPlanSettings.injectionRawMaterialCategoryKeywords ?? 'حقن'}
            onChange={(e) => setLocalPlanSettings((p) => ({ ...p, injectionRawMaterialCategoryKeywords: e.target.value }))}
            placeholder="حقن"
          />
        </div>

       
        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">verified_user</span>
            <p className="text-sm font-bold text-[var(--color-text)]">صلاحية معتمد تحويلات المخازن</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            أي مستخدم يملك هذه الصلاحية يمكنه قبول/رفض التحويلات المعلقة.
          </p>
          <select
            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localPlanSettings.transferApprovalPermission ?? ''}
            onChange={(e) => setLocalPlanSettings((p) => ({ ...p, transferApprovalPermission: e.target.value }))}
          >
            {allPermissions.map((permission) => (
              <option key={permission} value={permission}>{permission}</option>
            ))}
          </select>
        </div>
        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">straighten</span>
            <p className="text-sm font-bold text-[var(--color-text)]">وحدة عرض تحويلات المنتج النهائي</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            يحدد كيفية عرض كميات تحويلات المنتج النهائي في الشاشات ذات الصلة: قطعة أو كرتونة.
          </p>
          <select
            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localPlanSettings.transferDisplayUnit ?? 'piece'}
            onChange={(e) => setLocalPlanSettings((p) => ({ ...p, transferDisplayUnit: e.target.value as 'piece' | 'carton' }))}
          >
            <option value="piece">قطعة</option>
            <option value="carton">كرتونة</option>
          </select>
        </div>
 <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">badge</span>
            <p className="text-sm font-bold text-[var(--color-text)]">مستخدمو HR المعتمدون للموافقات</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            اختر المستخدمين الذين يمثلون HR في مرحلة الاعتماد النهائية.
          </p>
          {hrUsers.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">لا يوجد مستخدمون متاحون حالياً.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hrUsers.map((user) => {
                const selected = (localPlanSettings.hrApproverUserIds ?? []).includes(user.id);
                return (
                  <label key={user.id} className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)] p-2 rounded border border-[var(--color-border)] bg-[var(--color-card)]">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) => {
                        setLocalPlanSettings((prev) => {
                          const current = prev.hrApproverUserIds ?? [];
                          const next = e.target.checked
                            ? Array.from(new Set([...current, user.id]))
                            : current.filter((id) => id !== user.id);
                          return { ...prev, hrApproverUserIds: next };
                        });
                      }}
                    />
                    <span>{user.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </Card>
  );
};
