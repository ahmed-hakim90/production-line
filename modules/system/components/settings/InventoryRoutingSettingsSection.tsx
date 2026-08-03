import React, { useState } from 'react';
import type { InventoryRoutingSettings, PlanSettings } from '../../../../types';
import type { Warehouse } from '../../../inventory/types';
import { migrateInventoryRoutingV1 } from '../../../inventory/services/inventoryMigrationService';
import { syncPlanSettingsWarehouseRouting } from '../../../inventory/lib/syncPlanSettingsWarehouseRouting';
import {
  applyRecommendedInventoryRoutingPolicy,
  createEmptyInventoryRouting,
  mapRoutingWarehouseIdsFromRoles,
} from '../../../inventory/lib/recommendedInventoryRouting';
import { WAREHOUSE_ROLE_LABELS } from '../../../inventory/lib/stockLabels';
import { useAppStore } from '../../../../store/useAppStore';

type Props = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  inventoryWarehouses: Warehouse[];
};

export const InventoryRoutingSettingsSection: React.FC<Props> = ({
  isAdmin,
  localPlanSettings,
  setLocalPlanSettings,
  inventoryWarehouses,
}) => {
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const [migrating, setMigrating] = useState(false);
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null);

  if (!isAdmin) return null;

  const synced = syncPlanSettingsWarehouseRouting(localPlanSettings);
  const routing = { ...createEmptyInventoryRouting(), ...synced.inventoryRouting };

  const patchRouting = (patch: Partial<InventoryRoutingSettings>) => {
    setLocalPlanSettings((prev) =>
      syncPlanSettingsWarehouseRouting({
        ...prev,
        ...(Object.prototype.hasOwnProperty.call(patch, 'requireApprovalForProductionEntry')
          ? { requireFinishedStockApprovalForReports: patch.requireApprovalForProductionEntry !== false }
          : {}),
        inventoryRouting: { ...createEmptyInventoryRouting(), ...prev.inventoryRouting, ...patch },
      }),
    );
  };

  const applyRecommendedPolicy = () => {
    setLocalPlanSettings((prev) =>
      syncPlanSettingsWarehouseRouting(
        applyRecommendedInventoryRoutingPolicy(prev, inventoryWarehouses),
      ),
    );
    setMigrateMsg(
      'تم تطبيق توصية المصنع + ربط الفراغات حسب دور كل مخزن (بدون تغيير الأسماء). احفظ الإعدادات.',
    );
  };

  const linkByWarehouseRole = (overwrite: boolean) => {
    setLocalPlanSettings((prev) =>
      syncPlanSettingsWarehouseRouting(
        mapRoutingWarehouseIdsFromRoles(prev, inventoryWarehouses, { overwrite }),
      ),
    );
    setMigrateMsg(
      overwrite
        ? 'تم إعادة ربط كل الأدوار بمخازنك حسب الدور التشغيلي. راجع القوائم ثم احفظ.'
        : 'تم ملء الخانات الفارغة فقط حسب دور كل مخزن. راجع القوائم ثم احفظ.',
    );
  };

  const runMigration = async () => {
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const result = await migrateInventoryRoutingV1();
      await fetchSystemSettings();
      const freshPlan = useAppStore.getState().systemSettings.planSettings;
      if (freshPlan) {
        setLocalPlanSettings(syncPlanSettingsWarehouseRouting({
          ...localPlanSettings,
          ...freshPlan,
          inventoryRouting: {
            ...createEmptyInventoryRouting(),
            ...localPlanSettings.inventoryRouting,
            ...freshPlan.inventoryRouting,
          },
        }));
      }
      setMigrateMsg(
        result.alreadyMigrated
          ? 'تمت المزامنة مسبقاً — تم التأكد من الإعدادات والأدوار.'
          : `اكتملت المزامنة: ${result.warehousesUpdated} مخزن، ${result.rolesAssigned} دور معيّن.`,
      );
    } catch (err) {
      setMigrateMsg(err instanceof Error ? err.message : 'فشلت المزامنة.');
    } finally {
      setMigrating(false);
    }
  };

  const select = (
    label: string,
    hint: string,
    value: string | undefined,
    onChange: (id: string) => void,
    roleHint?: string,
  ) => (
    <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
      <p className="text-sm font-bold text-[var(--color-text)]">{label}</p>
      {roleHint && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">دور تشغيلي: {roleHint} — اختَر مخزنك باسمه من القائمة</p>}
      <p className="text-xs text-[var(--color-text-muted)] mb-3">{hint}</p>
      <select
        className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">غير محدد</option>
        {inventoryWarehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} ({w.code}){w.warehouseRole ? ` — ${WAREHOUSE_ROLE_LABELS[w.warehouseRole] || w.warehouseRole}` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  const toggle = (label: string, hint: string, checked: boolean, onToggle: () => void) => (
    <div className="flex items-start gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
      <div className="flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-12 h-7 rounded-full shrink-0 ${checked ? 'bg-primary' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${checked ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">توجيه المخازن والإنتاج</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            أسماء المخازن عندك حرة تماماً. العناوين أدناه أدوار تشغيلية — اختَر من القائمة المخزن باسمه اللي أنت سمّيته.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={applyRecommendedPolicy}
            className="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-800 bg-emerald-50 text-sm font-bold"
          >
            تطبيق توصية المصنع
          </button>
          <button
            type="button"
            onClick={() => linkByWarehouseRole(false)}
            className="px-4 py-2 rounded-lg border border-sky-600 text-sky-900 bg-sky-50 text-sm font-bold"
          >
            ربط الفراغات حسب الدور
          </button>
          <button
            type="button"
            onClick={() => linkByWarehouseRole(true)}
            className="px-4 py-2 rounded-lg border border-amber-600 text-amber-950 bg-amber-50 text-sm font-bold"
          >
            إعادة ربط الكل حسب الدور
          </button>
          <button
            type="button"
            disabled={migrating}
            onClick={() => void runMigration()}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
          >
            {migrating ? 'جاري المزامنة...' : 'مزامنة إعدادات V1'}
          </button>
        </div>
      </div>
      {migrateMsg && <p className="text-sm font-medium text-slate-600">{migrateMsg}</p>}

      <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <p className="font-bold">اسم المخزن ≠ دور المخزن</p>
        <p className="mt-1 text-xs leading-relaxed">
          مثال: لو سمّيت المخزن «مخزن التجميع» أو «الجاهز»، سيّبه باسمه وعيّن له الدور المناسب من شاشة المخازن،
          ثم اضغط «ربط الفراغات حسب الدور» هنا. النظام يشتغل بالـ ID، مش باسم الدور المكتوب في الكود.
        </p>
      </div>

      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="font-bold">التوصية المعتمدة للمصنع (V2)</p>
        <ul className="mt-1 text-xs leading-relaxed list-disc pr-5 space-y-0.5">
          <li>صرف الإنتاج يحوّل المكونات من المفكك إلى صالة الإنتاج.</li>
          <li>تقرير الإنتاج يخصم BOM من الصالة ويضيف الناتج إلى «تحت التسليم».</li>
          <li>مشرف التغليف يؤكد الكمية الفعلية جزئياً قبل دخول «بانتظار التغليف».</li>
          <li>لا تحويل تلقائي لتجاوز استلام التغليف.</li>
        </ul>
        <p className="mt-2 text-[11px] text-emerald-900/80">
          «تطبيق توصية المصنع» يضبط أعلام الاعتماد ويملأ الخانات الفارغة من أدوار مخازنك الحالية دون تغيير أسمائها. ثم احفظ من أعلى الصفحة.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {select('مخزن المواد الخام', 'مخزن الخامات الوارد/الشراء. يُستخدم كاحتياطي فقط إذا لم يُحدد مخزن المفكك.', routing.rawMaterialWarehouseId, (v) => patchRouting({ rawMaterialWarehouseId: v }), WAREHOUSE_ROLE_LABELS.raw_material)}
        {select('مخزن المفكك (مستلزم إنتاج)', 'مصدر صرف الإنتاج لمكونات BOM.', routing.decomposedWarehouseId, (v) => patchRouting({ decomposedWarehouseId: v }), WAREHOUSE_ROLE_LABELS.decomposed)}
        {select('مخزن صالة الإنتاج', 'وجهة صرف المكونات؛ التقرير يخصم منها استهلاك BOM.', routing.productionFloorWarehouseId || '', (v) => patchRouting({ productionFloorWarehouseId: v }), WAREHOUSE_ROLE_LABELS.production_floor)}
        {select('مخزن تم الإنتاج — تحت التسليم', 'يدخل إليه كامل كمية تقرير الإنتاج بانتظار تأكيد مشرف التغليف.', routing.productionWipWarehouseId, (v) => patchRouting({ productionWipWarehouseId: v }), WAREHOUSE_ROLE_LABELS.production_wip)}
        {select('مخزن بانتظار التغليف', 'الكميات التي أكد مشرف التغليف استلامها فعلياً.', routing.finishedStagingWarehouseId, (v) => patchRouting({ finishedStagingWarehouseId: v }), WAREHOUSE_ROLE_LABELS.finished_staging)}
        {select('مخزن المنتج التام', 'بعد التغليف — البيع / التسليم.', routing.finalProductWarehouseId, (v) => patchRouting({ finalProductWarehouseId: v }), WAREHOUSE_ROLE_LABELS.final_product)}
        {select('مخزن الهالك', 'استقبال هالك التقارير والمكونات.', routing.wasteWarehouseId, (v) => patchRouting({ wasteWarehouseId: v }), WAREHOUSE_ROLE_LABELS.waste)}
        {select('مخزن التغليف (من)', 'يُفضّل نفس مخزن بانتظار التغليف.', routing.packagingSourceWarehouseId, (v) => patchRouting({ packagingSourceWarehouseId: v }), WAREHOUSE_ROLE_LABELS.finished_staging)}
        {select('مخزن التغليف (إلى)', 'يُفضّل نفس مخزن المنتج التام.', routing.packagingTargetWarehouseId, (v) => patchRouting({ packagingTargetWarehouseId: v }), WAREHOUSE_ROLE_LABELS.final_product)}
      </div>

      {(routing.decomposedWarehouseId
        && routing.productionFloorWarehouseId
        && routing.decomposedWarehouseId === routing.productionFloorWarehouseId) && (
        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
          مخزن المفكك وصالة الإنتاج يجب أن يكونا مختلفين.
        </p>
      )}
      {(routing.productionWipWarehouseId
        && routing.finishedStagingWarehouseId
        && routing.productionWipWarehouseId === routing.finishedStagingWarehouseId) && (
        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
          مخزن «تحت التسليم» و«بانتظار التغليف» يجب أن يكونا مختلفين.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {toggle('إلزام استلام مشرف التغليف', 'يمنع دخول الكمية إلى بانتظار التغليف قبل تأكيد الكمية الفعلية (جزئياً مسموح).', routing.requirePackagingHandoverReceipt !== false, () => patchRouting({ requirePackagingHandoverReceipt: !(routing.requirePackagingHandoverReceipt !== false) }))}
        {toggle('تحويل تلقائي إلى بانتظار التغليف', 'غير موصى به مع استلام التغليف. يتخطى تأكيد الكمية الفعلية.', Boolean(routing.autoTransferProductionToFinished), () => patchRouting({ autoTransferProductionToFinished: !routing.autoTransferProductionToFinished }))}
        {toggle('تحويل تلقائي بانتظار التغليف → منتج تام', 'غير موصى به إذا كان التغليف يمر عبر تقرير تغليف.', Boolean(routing.autoTransferFinishedToFinal), () => patchRouting({ autoTransferFinishedToFinal: !routing.autoTransferFinishedToFinal }))}
        {toggle('اعتماد إدخال الإنتاج (قديم)', 'مسار قديم: طلب اعتماد قبل ظهور الرصيد في تحت التسليم. مطفأ في توصية V2.', routing.requireApprovalForProductionEntry === true, () => patchRouting({ requireApprovalForProductionEntry: !routing.requireApprovalForProductionEntry }))}
        {toggle('اعتماد التحويلات التلقائية الأخرى', 'يؤثر على مسارات أخرى مثل بانتظار التغليف→التام.', routing.requireApprovalForAutoTransfers === true, () => patchRouting({ requireApprovalForAutoTransfers: !(routing.requireApprovalForAutoTransfers === true) }))}
      </div>

      {localPlanSettings.enablePackagingStockTransfer
        && (
          !routing.packagingSourceWarehouseId
          || !routing.packagingTargetWarehouseId
          || routing.packagingSourceWarehouseId === routing.packagingTargetWarehouseId
        ) && (
        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
          اختر مخزنين مختلفين للتغليف من/إلى لتفعيل تحويلات التغليف عند حفظ التقارير.
        </p>
      )}

      {routing.requireIssuedProductionIssueOnReport !== false && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-bold">مسار V2: صرف → صالة → تقرير → استلام تغليف</p>
          <p className="mt-1 text-xs leading-relaxed">
            1) صرف إنتاج من المفكك إلى صالة الإنتاج واعتماده.
            2) حفظ تقرير الإنتاج (خصم BOM من الصالة + إدخال تحت التسليم).
            3) مشرف التغليف يؤكد الكمية الفعلية (جزئياً أو كاملاً) → بانتظار التغليف.
            4) تقرير تغليف يحوّل إلى منتج تام.
          </p>
        </div>
      )}

      {Boolean(routing.autoConsumeBomOnProductionReport) && routing.requireIssuedProductionIssueOnReport === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">تنبيه: خصم مباشر من التقرير</p>
          <p className="mt-1 text-xs leading-relaxed">
            حفظ تقرير الإنتاج سيخصم مكونات الـ BOM مباشرة إذا لم يوجد أمر صرف صادر. مع V2 يُفضّل الخصم من صالة الإنتاج بعد الصرف.
          </p>
        </div>
      )}

      {localPlanSettings.inventoryRoutingMigratedAt && (
        <p className="text-xs text-emerald-700 font-medium">
          آخر مزامنة: {new Date(localPlanSettings.inventoryRoutingMigratedAt).toLocaleString('ar-EG')}
        </p>
      )}
    </div>
  );
};
