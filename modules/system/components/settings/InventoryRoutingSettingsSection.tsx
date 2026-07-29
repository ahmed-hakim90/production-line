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
        <p className="font-bold">التوصية المعتمدة للمصنع</p>
        <ul className="mt-1 text-xs leading-relaxed list-disc pr-5 space-y-0.5">
          <li>إيقاف خصم BOM من التقرير؛ الصرف يتم من صفحة صرف إنتاج عند تفعيل الإلزام.</li>
          <li>اعتماد إدخال الإنتاج مرة واحدة؛ الترحيل للدور «تم الإنتاج» يتم تلقائياً بعده</li>
          <li>تغليف: من = دور تم الإنتاج، إلى = دور منتج تام (بأسماء مخازنك أنت)</li>
        </ul>
        <p className="mt-2 text-[11px] text-emerald-900/80">
          «تطبيق توصية المصنع» يضبط أعلام الاعتماد ويملأ الخانات الفارغة من أدوار مخازنك الحالية دون تغيير أسمائها. ثم احفظ من أعلى الصفحة.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {select('مخزن المواد الخام', 'مخزن الخامات الوارد/الشراء. يُستخدم كاحتياطي فقط إذا لم يُحدد مخزن المفكك.', routing.rawMaterialWarehouseId, (v) => patchRouting({ rawMaterialWarehouseId: v }), WAREHOUSE_ROLE_LABELS.raw_material)}
        {select('مخزن المفكك (مستلزم إنتاج)', 'مصدر خصم صرف الإنتاج لمكونات BOM.', routing.decomposedWarehouseId, (v) => patchRouting({ decomposedWarehouseId: v }), WAREHOUSE_ROLE_LABELS.decomposed)}
        {select('مخزن إنتاج تحت التشغيل (WIP)', 'استقبال تقني أول بعد التقرير (داخلي). الاعتماد يرحّل منه تلقائياً إلى تم الإنتاج.', routing.productionWipWarehouseId, (v) => patchRouting({ productionWipWarehouseId: v }), WAREHOUSE_ROLE_LABELS.production_wip)}
        {select('مخزن تم الإنتاج', 'بانتظار التغليف — يظهر الرصيد هنا بعد اعتماد إدخال الإنتاج.', routing.finishedStagingWarehouseId, (v) => patchRouting({ finishedStagingWarehouseId: v }), WAREHOUSE_ROLE_LABELS.finished_staging)}
        {select('مخزن المنتج التام', 'بعد التغليف — البيع / التسليم.', routing.finalProductWarehouseId, (v) => patchRouting({ finalProductWarehouseId: v }), WAREHOUSE_ROLE_LABELS.final_product)}
        {select('مخزن الهالك', 'استقبال هالك التقارير والمكونات.', routing.wasteWarehouseId, (v) => patchRouting({ wasteWarehouseId: v }), WAREHOUSE_ROLE_LABELS.waste)}
        {select('مخزن التغليف (من)', 'يُفضّل نفس مخزن تم الإنتاج.', routing.packagingSourceWarehouseId, (v) => patchRouting({ packagingSourceWarehouseId: v }), WAREHOUSE_ROLE_LABELS.finished_staging)}
        {select('مخزن التغليف (إلى)', 'يُفضّل نفس مخزن المنتج التام.', routing.packagingTargetWarehouseId, (v) => patchRouting({ packagingTargetWarehouseId: v }), WAREHOUSE_ROLE_LABELS.final_product)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {toggle('تحويل تلقائي إلى تم الإنتاج', 'بعد اعتماد إدخال الإنتاج يُرحَّل الرصيد إلى تم الإنتاج (بانتظار التغليف).', Boolean(routing.autoTransferProductionToFinished), () => patchRouting({ autoTransferProductionToFinished: !routing.autoTransferProductionToFinished }))}
        {toggle('تحويل تلقائي تم الإنتاج → منتج تام', 'غير موصى به إذا كان التغليف يمر عبر تقرير تغليف.', Boolean(routing.autoTransferFinishedToFinal), () => patchRouting({ autoTransferFinishedToFinal: !routing.autoTransferFinishedToFinal }))}
        {toggle('اعتماد إدخال الإنتاج', 'طلب اعتماد واحد قبل أن يسمع الرصيد في تم الإنتاج.', routing.requireApprovalForProductionEntry !== false, () => patchRouting({ requireApprovalForProductionEntry: !routing.requireApprovalForProductionEntry }))}
        {toggle('اعتماد التحويلات التلقائية الأخرى', 'لا يشمل ترحيل WIP→تم الإنتاج بعد اعتماد الإدخال (يُنفَّذ تلقائياً). يؤثر على مسارات أخرى مثل تم الإنتاج→التام.', routing.requireApprovalForAutoTransfers === true, () => patchRouting({ requireApprovalForAutoTransfers: !(routing.requireApprovalForAutoTransfers === true) }))}
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
          <p className="font-bold">مسار: صرف إنتاج أولاً ثم التقرير</p>
          <p className="mt-1 text-xs leading-relaxed">
            1) صرف إنتاج من المستلزم واعتماده.
            2) حفظ تقرير الإنتاج.
            3) اعتماد إدخال الإنتاج → الرصيد يظهر في تم الإنتاج بانتظار التغليف.
            4) تقرير تغليف يحوّل إلى منتج تام.
          </p>
        </div>
      )}

      {Boolean(routing.autoConsumeBomOnProductionReport) && routing.requireIssuedProductionIssueOnReport === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">تنبيه: خصم مباشر من التقرير</p>
          <p className="mt-1 text-xs leading-relaxed">
            حفظ تقرير الإنتاج سيخصم مكونات الـ BOM من مخزن المستلزم/المفكك فوراً إذا لم يوجد أمر صرف صادر.
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
