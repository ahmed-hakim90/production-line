import React from 'react';
import { Card } from '../UI';
import type { PlanSettings } from '../../../../types';
import type { Warehouse } from '../../../inventory/types';

type GeneralSystemBehaviorSectionProps = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  inventoryWarehouses: Warehouse[];
  allPermissions: string[];
};

export const GeneralSystemBehaviorSection: React.FC<GeneralSystemBehaviorSectionProps> = ({
  isAdmin,
  localPlanSettings,
  setLocalPlanSettings,
  inventoryWarehouses,
  allPermissions,
}) => {
  if (!isAdmin) return null;

  return (
    <Card title="سلوك النظام">
      <div className="space-y-4">
        {([
          { key: 'allowMultipleActivePlans' as keyof PlanSettings, label: 'السماح بخطط متعددة نشطة على نفس الخط', icon: 'playlist_add', desc: 'عند التعطيل، لن يُسمح بإنشاء خطة جديدة على خط يحتوي بالفعل على خطة نشطة.' },
          { key: 'allowReportWithoutPlan' as keyof PlanSettings, label: 'السماح بالتقارير بدون خطة', icon: 'assignment', desc: 'عند التعطيل، لن يتمكن المشرفون من إنشاء تقارير إنتاج بدون خطة نشطة.' },
          { key: 'allowOverProduction' as keyof PlanSettings, label: 'السماح بالإنتاج الزائد', icon: 'trending_up', desc: 'عند التعطيل، لن يُسمح بإضافة تقارير بعد الوصول إلى الكمية المخططة.' },
          { key: 'autoClosePlan' as keyof PlanSettings, label: 'إغلاق الخطة تلقائياً عند الاكتمال', icon: 'event_available', desc: 'عند التفعيل، يتم تغيير حالة الخطة إلى "مكتملة" تلقائياً عند الوصول للكمية المخططة.' },
          { key: 'requireFinishedStockApprovalForReports' as keyof PlanSettings, label: 'اعتماد دخول تم الصنع من التقارير', icon: 'approval', desc: 'عند التفعيل، لا تتم إضافة المنتج التام تلقائياً للمخزن بعد التقرير، بل يظهر طلب اعتماد للمستخدم المخول.' },
          { key: 'allowNegativeDecomposedStock' as keyof PlanSettings, label: 'السماح بالسالب في مخزن المفكك', icon: 'remove_circle_outline', desc: 'عند التفعيل، يمكن خصم مواد خام من مخزن المفكك حتى لو الرصيد الحالي غير كافٍ.' },
          { key: 'allowNegativeFinishedTransferStock' as keyof PlanSettings, label: 'السماح بتحويل تم الصنع بالسالب', icon: 'swap_horiz', desc: 'عند التفعيل، يمكن اعتماد تحويلات مخزن "تم الصنع" حتى لو الرصيد الحالي أقل من الكمية المطلوبة.' },
        ]).map((setting) => (
          <div key={setting.key} className="flex items-center gap-4 p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
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
          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
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
              <span className="text-sm font-bold text-slate-400">%</span>
            </div>
          </div>

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
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

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
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
        </div>

        <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">warehouse</span>
            <p className="text-sm font-bold text-[var(--color-text)]">مخزن استقبال الإنتاج</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            أي تقرير إنتاج جديد أو إغلاق أمر شغل سيتم ترحيل الكمية المنتجة تلقائياً إلى هذا المخزن.
          </p>
          <select
            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            value={localPlanSettings.defaultProductionWarehouseId ?? ''}
            onChange={(e) => setLocalPlanSettings((p) => ({ ...p, defaultProductionWarehouseId: e.target.value }))}
          >
            <option value="">بدون ترحيل تلقائي</option>
            {inventoryWarehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] sm:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">science</span>
              <p className="text-sm font-bold text-[var(--color-text)]">مخزن المواد الخام</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              المنتجات التي لها رصيد في هذا المخزن يتم اعتبارها "خامات" ولن تظهر في الإنتاج أو التكاليف أو قوائم اختيار المنتج.
            </p>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.rawMaterialWarehouseId ?? ''}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, rawMaterialWarehouseId: e.target.value }))}
            >
              <option value="">غير محدد</option>
              {inventoryWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">call_split</span>
              <p className="text-sm font-bold text-[var(--color-text)]">مخزن المفكك (خصم الخامات)</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              عند تسجيل تقرير إنتاج، النظام يخصم مكونات المنتج (الخامات) من هذا المخزن.
            </p>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.decomposedSourceWarehouseId ?? ''}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, decomposedSourceWarehouseId: e.target.value }))}
            >
              <option value="">غير محدد</option>
              {inventoryWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">inventory_2</span>
              <p className="text-sm font-bold text-[var(--color-text)]">مخزن تم الصنع</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              الكمية المنتجة (تم الصنع) تُضاف تلقائيًا إلى هذا المخزن من تقرير الإنتاج.
            </p>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.finishedReceiveWarehouseId ?? ''}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, finishedReceiveWarehouseId: e.target.value }))}
            >
              <option value="">غير محدد</option>
              {inventoryWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">delete_sweep</span>
              <p className="text-sm font-bold text-[var(--color-text)]">مخزن الهالك</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              كمية الهالك في تقرير الإنتاج تُرحَّل تلقائيًا إلى هذا المخزن.
            </p>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.wasteReceiveWarehouseId ?? ''}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, wasteReceiveWarehouseId: e.target.value }))}
            >
              <option value="">غير محدد</option>
              {inventoryWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>

          <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-icons-round text-primary text-lg">inventory</span>
              <p className="text-sm font-bold text-[var(--color-text)]">مخزن المنتج التام</p>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              يستخدم للعرض في مؤشرات "منتج تام". لا يتم إضافة حركة إنتاج تلقائية عليه حاليًا.
            </p>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              value={localPlanSettings.finalProductWarehouseId ?? ''}
              onChange={(e) => setLocalPlanSettings((p) => ({ ...p, finalProductWarehouseId: e.target.value }))}
            >
              <option value="">غير محدد</option>
              {inventoryWarehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
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
        <div className="p-4 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">straighten</span>
            <p className="text-sm font-bold text-[var(--color-text)]">وحدة عرض تحويلات المنتج النهائي</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            يحدد طريقة عرض كميات تحويلات المنتج النهائي في الشاشات والطباعة: قطعة أو كرتونة.
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

      </div>
    </Card>
  );
};
