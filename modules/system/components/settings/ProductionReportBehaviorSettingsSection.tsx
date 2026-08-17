import React, { useState } from 'react';
import type { InventoryRoutingSettings, PlanSettings, ProductionWorkerSettings } from '../../../../types';
import { syncPlanSettingsWarehouseRouting } from '../../../inventory/lib/syncPlanSettingsWarehouseRouting';
import { createEmptyInventoryRouting } from '../../../inventory/lib/recommendedInventoryRouting';
import {
  normalizeOperationalDayStartHour,
  resolveReportBehaviorSettings,
} from '../../../production/lib/reportBehaviorSettings';
import { useAppStore } from '../../../../store/useAppStore';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
type Props = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  localProductionWorkerSettings: ProductionWorkerSettings;
  setLocalProductionWorkerSettings: React.Dispatch<React.SetStateAction<ProductionWorkerSettings>>;
};
export const ProductionReportBehaviorSettingsSection: React.FC<Props> = ({
  isAdmin,
  localPlanSettings,
  setLocalPlanSettings,
  localProductionWorkerSettings,
  setLocalProductionWorkerSettings,
}) => {
  const updateSystemSettings = useAppStore((s) => s.updateSystemSettings);
  const [savingIssueRequirement, setSavingIssueRequirement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!isAdmin) return null;
  const behavior = resolveReportBehaviorSettings({ planSettings: localPlanSettings });
  const synced = syncPlanSettingsWarehouseRouting(localPlanSettings);
  const routing = { ...createEmptyInventoryRouting(), ...synced.inventoryRouting };
  const conflictBomAndIssue =
    Boolean(routing.autoConsumeBomOnProductionReport) &&
    routing.requireIssuedProductionIssueOnReport !== false;
  const patchPlan = (patch: Partial<PlanSettings>) => {
    setLocalPlanSettings((prev) => syncPlanSettingsWarehouseRouting({ ...prev, ...patch }));
  };
  const patchBehavior = (patch: Partial<PlanSettings['reportBehavior']>) => {
    setLocalPlanSettings((prev) => ({
      ...prev,
      reportBehavior: {
        ...behavior,
        ...(prev.reportBehavior ?? {}),
        ...patch,
      },
    }));
  };
  const patchRouting = (patch: Partial<InventoryRoutingSettings>) => {
    setLocalPlanSettings((prev) =>
      syncPlanSettingsWarehouseRouting({
        ...prev,
        inventoryRouting: { ...createEmptyInventoryRouting(), ...prev.inventoryRouting, ...patch },
      }),
    );
  };
  const handleRequireIssuedProductionIssueToggle = async () => {
    if (savingIssueRequirement) return;
    const previousLocalPlan = localPlanSettings;
    const requireIssued = !(routing.requireIssuedProductionIssueOnReport !== false);
    const nextLocalPlan = syncPlanSettingsWarehouseRouting({
      ...previousLocalPlan,
      inventoryRouting: {
        ...createEmptyInventoryRouting(),
        ...previousLocalPlan.inventoryRouting,
        requireIssuedProductionIssueOnReport: requireIssued,
      },
    });
    setSavingIssueRequirement(true);
    setMessage('جار حفظ إعداد إذن الصرف...');
    setLocalPlanSettings(nextLocalPlan);
    try {
      const currentSettings = useAppStore.getState().systemSettings;
      const currentPlan = syncPlanSettingsWarehouseRouting({
        ...currentSettings.planSettings,
        inventoryRouting: {
          ...createEmptyInventoryRouting(),
          ...(currentSettings.planSettings?.inventoryRouting ?? {}),
          requireIssuedProductionIssueOnReport: requireIssued,
        },
      });
      await updateSystemSettings({
        ...currentSettings,
        planSettings: currentPlan,
      });
      setMessage(
        requireIssued
          ? 'تم حفظ الإعداد: تقارير الإنتاج تحتاج إذن صرف معتمد.'
          : 'تم حفظ الإعداد: يمكن حفظ تقارير الإنتاج بدون إذن صرف.',
      );
    } catch (error) {
      setLocalPlanSettings(previousLocalPlan);
      setMessage(error instanceof Error ? error.message : 'تعذر حفظ إعداد إذن الصرف.');
    } finally {
      setSavingIssueRequirement(false);
    }
  };
  const toggle = (label: string, hint: string, checked: boolean, onToggle: () => void, disabled = false) => (
    <div className="flex items-start gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--color-text)]">{label}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-5">{hint}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className={`relative w-12 h-7 rounded-full shrink-0 disabled:opacity-60 disabled:cursor-not-allowed ${checked ? 'bg-primary' : 'bg-[var(--color-border)]'}`}
      >
        <span className={`absolute top-0.5 w-6 h-6 bg-[var(--color-card)] rounded-full transition-all ${checked ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'}`} />
      </button>
    </div>
  );
  return (
    <OpsDashPanel title="قواعد تقارير الإنتاج">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">كل ما يمنع أو يسمح بحفظ التقرير من مكان واحد</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-6">
            هذه القواعد تقرأها شاشة الإدخال السريع، صفحة التقارير، مودال إنشاء التقرير، والاستيراد عبر نفس منطق الحفظ.
          </p>
        </div>
        {message && <p className="text-sm font-medium text-[var(--color-text-muted)]">{message}</p>}
        <div className="p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-icons-round text-primary text-lg">schedule</span>
            <p className="text-sm font-bold text-[var(--color-text)]">بداية يوم التشغيل للتقارير</p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            قبل هذه الساعة يعتبر النظام أن تقرير “اليوم” تابع لتاريخ أمس التشغيلي. مثال: 8 يعني قبل 08:00 يظهر تاريخ أمس.
          </p>
          <div className="erp-page-actions max-w-xs">
            <input
              type="number"
              min={0}
              max={23}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold text-center py-2.5 px-3 outline-none"
              value={behavior.operationalDayStartHour}
              onChange={(event) =>
                patchBehavior({ operationalDayStartHour: normalizeOperationalDayStartHour(event.target.value) })
              }
            />
            <span className="text-sm font-bold text-[var(--color-text-muted)]">ساعة</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {toggle('السماح بالتقارير بدون خطة', 'عند الإيقاف لن يحفظ النظام تقرير إنتاج بدون خطة أو أمر شغل مناسب.', localPlanSettings.allowReportWithoutPlan !== false, () => patchPlan({ allowReportWithoutPlan: !localPlanSettings.allowReportWithoutPlan }))}
          {toggle('السماح بالإنتاج الزائد', 'عند الإيقاف يمنع التقرير إذا كانت الخطة وصلت للكمية المخططة.', localPlanSettings.allowOverProduction !== false, () => patchPlan({ allowOverProduction: !localPlanSettings.allowOverProduction }))}
          {toggle('منع تكرار التقرير', 'عند التشغيل يمنع تقريرًا مكررًا لنفس اليوم والخط والمشرف/المكون والوردية.', behavior.preventDuplicateReports, () => patchBehavior({ preventDuplicateReports: !behavior.preventDuplicateReports }))}
          {toggle('إلزام ساعات العمل', 'عند التشغيل لا يحفظ التقرير بدون ساعات عمل أكبر من صفر.', behavior.requireWorkHoursOnReports, () => patchBehavior({ requireWorkHoursOnReports: !behavior.requireWorkHoursOnReports }))}
          {toggle('إلزام كمية إنتاج', 'عند التشغيل لا يحفظ التقرير بدون كمية إنتاج أكبر من صفر.', behavior.requirePositiveQuantityOnReports, () => patchBehavior({ requirePositiveQuantityOnReports: !behavior.requirePositiveQuantityOnReports }))}
          {toggle('إلزام أمر شغل في الإدخال السريع', 'عند التشغيل يجب اختيار أمر شغل موجّه للمشرف قبل الحفظ من الإدخال السريع. عند الإيقاف يمكن الحفظ بدون أمر شغل، والربط يتم فقط إذا اخترته. التسجيل باسم مشرف آخر ما زال يحتاج أمر شغل مطابق.', behavior.requireWorkOrderOnQuickAction, () => patchBehavior({ requireWorkOrderOnQuickAction: !behavior.requireWorkOrderOnQuickAction }))}
          {toggle('إلزام عمالة لتقرير المنتج التام', 'عند الإيقاف يسمح بتقرير منتج تام بدون عمالة، مع بقاء التغليف اختياريًا حسب الإعداد التالي.', behavior.requireLaborForFinishedReports, () => patchBehavior({ requireLaborForFinishedReports: !behavior.requireLaborForFinishedReports }))}
          {toggle('إلزام وردية تقرير الحقن', 'عند الإيقاف لا يمنع الحفظ بسبب عدم اختيار صباحي/مسائي.', behavior.requireInjectionShift, () => patchBehavior({ requireInjectionShift: !behavior.requireInjectionShift }))}
          {toggle('تقرير التغليف على خطوط التغليف فقط', 'عند التشغيل يجب تسجيل تقرير التغليف على خط معلّم كخط تغليف.', behavior.restrictPackagingReportsToPackagingLines, () => patchBehavior({ restrictPackagingReportsToPackagingLines: !behavior.restrictPackagingReportsToPackagingLines }))}
          {toggle('عمالة التغليف اختيارية', 'عند التشغيل يسمح لتقرير التغليف أو خط التغليف بالحفظ بدون عمالة.', behavior.allowPackagingLaborOptional, () => patchBehavior({ allowPackagingLaborOptional: !behavior.allowPackagingLaborOptional }))}
          {toggle('ربط دورة التوريد تلقائيًا', 'عند التشغيل يحاول النظام ربط التقرير بدورة توريد مناسبة أثناء الحفظ.', behavior.autoLinkSupplyCycleOnReportSave, () => patchBehavior({ autoLinkSupplyCycleOnReportSave: !behavior.autoLinkSupplyCycleOnReportSave }))}
          {toggle('تنفيذ أثر المخزون عند الحفظ', 'عند التشغيل ينشئ النظام حركات/طلبات المخزون الآلية المرتبطة بالتقرير.', behavior.autoApplyInventoryOnReportSave, () => patchBehavior({ autoApplyInventoryOnReportSave: !behavior.autoApplyInventoryOnReportSave }))}
          <div className="flex items-start gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-success)/0.25)] dark:border-[rgb(var(--color-success))]/50">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[var(--color-text)]">ترحيل التقرير إلى الخطة وأمر الشغل</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-5">
                تلقائي دائمًا: يحدّث التقرير الخطة وأمر الشغل المطابقين، أو المتاح منهما.
              </p>
            </div>
            <span className="rounded-full bg-[rgb(var(--color-success)/0.1)] px-2.5 py-1 text-xs font-bold text-[rgb(var(--color-success))] dark:bg-[rgb(var(--color-success)/0.2)] dark:text-[rgb(var(--color-success))]">
              تلقائي
            </span>
          </div>
          {toggle('إلزام صرف إنتاج معتمد قبل تقرير الإنتاج', savingIssueRequirement ? 'جار حفظ التغيير...' : 'افتراضي للخطط وأوامر الشغل التي لم يُحدَّد فيها خيار «تحتاج صرف إنتاج». تشغيله يمنع حفظ تقرير المنتج التام قبل إصدار إذن صرف إنتاج. إقفاله يسمح بالحفظ بدون إذن صرف عند غياب التحديد على الخطة/الأمر.', routing.requireIssuedProductionIssueOnReport !== false, () => void handleRequireIssuedProductionIssueToggle(), savingIssueRequirement)}
          {toggle('خصم BOM تلقائي عند حفظ التقرير', 'مطفأ افتراضياً. لا تستخدمه مع مسار صرف الإنتاج.', Boolean(routing.autoConsumeBomOnProductionReport), () => patchRouting({ autoConsumeBomOnProductionReport: !routing.autoConsumeBomOnProductionReport }))}
          {toggle('تأثير تقرير التغليف على المخزون', 'عند التفعيل، كل تقرير تغليف ينشئ حركة تحويل مباشرة من مخزن التغليف المصدر إلى الوجهة.', Boolean(localPlanSettings.enablePackagingStockTransfer), () => patchPlan({ enablePackagingStockTransfer: !localPlanSettings.enablePackagingStockTransfer }))}
          {toggle('مطابقة إنتاج العمال لكمية التقرير', 'عند التشغيل يجب أن يساوي مجموع إنتاج العمال كمية تقرير المنتج التام.', Boolean(localProductionWorkerSettings.performance.productionWorkerOutputMustMatchReportQty), () => setLocalProductionWorkerSettings((prev) => ({
            ...prev,
            performance: {
              ...prev.performance,
              productionWorkerOutputMustMatchReportQty: !prev.performance.productionWorkerOutputMustMatchReportQty,
            },
          })))}
        </div>
        {conflictBomAndIssue && (
          <div className="rounded-lg border border-[rgb(var(--color-danger)/0.35)] bg-[rgb(var(--color-danger)/0.1)] px-4 py-3 text-sm text-[rgb(var(--color-danger))]">
            <p className="font-bold">تعارض إعدادات</p>
            <p className="mt-1 text-xs leading-relaxed">
              لا تجمع بين «إلزام صرف إنتاج» و«خصم BOM من التقرير» حتى لا يحدث خصم مزدوج.
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-bold underline"
              onClick={() => patchRouting({ autoConsumeBomOnProductionReport: false })}
            >
              إيقاف خصم BOM من التقرير الآن
            </button>
          </div>
        )}
      </div>
    </OpsDashPanel>
  );
};
