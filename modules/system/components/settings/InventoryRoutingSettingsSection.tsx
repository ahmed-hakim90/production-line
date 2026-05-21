import React, { useState } from 'react';
import type { InventoryRoutingSettings, PlanSettings } from '../../../../types';
import type { Warehouse } from '../../../inventory/types';
import { migrateInventoryRoutingV1 } from '../../../inventory/services/inventoryMigrationService';
import { useAppStore } from '../../../../store/useAppStore';

const WAREHOUSE_ROLE_LABELS: Record<string, string> = {
  raw_material: 'مواد خام',
  decomposed: 'مفكك / مكونات',
  production_wip: 'إنتاج تحت التشغيل',
  finished_staging: 'تم الصنع',
  final_product: 'منتج تام',
  packaging: 'تغليف',
  waste: 'هالك',
  general: 'عام',
};

type Props = {
  isAdmin: boolean;
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  inventoryWarehouses: Warehouse[];
};

const emptyRouting = (): InventoryRoutingSettings => ({
  rawMaterialWarehouseId: '',
  decomposedWarehouseId: '',
  productionWipWarehouseId: '',
  finishedStagingWarehouseId: '',
  finalProductWarehouseId: '',
  packagingSourceWarehouseId: '',
  packagingTargetWarehouseId: '',
  wasteWarehouseId: '',
  autoTransferProductionToFinished: false,
  autoTransferFinishedToFinal: false,
  requireApprovalForProductionEntry: true,
  requireApprovalForAutoTransfers: true,
});

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

  const routing = { ...emptyRouting(), ...localPlanSettings.inventoryRouting };

  const patchRouting = (patch: Partial<InventoryRoutingSettings>) => {
    setLocalPlanSettings((prev) => ({
      ...prev,
      inventoryRouting: { ...emptyRouting(), ...prev.inventoryRouting, ...patch },
    }));
  };

  const runMigration = async () => {
    setMigrating(true);
    setMigrateMsg(null);
    try {
      const result = await migrateInventoryRoutingV1();
      await fetchSystemSettings();
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
      {roleHint && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">دور مقترح: {roleHint}</p>}
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
            الإعدادات الجديدة تحكم مسار الإنتاج: WIP → تم الصنع → منتج تام. الحقول القديمة في «سلوك النظام» تبقى للتوافق حتى الحفظ.
          </p>
        </div>
        <button
          type="button"
          disabled={migrating}
          onClick={() => void runMigration()}
          className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50"
        >
          {migrating ? 'جاري المزامنة...' : 'مزامنة إعدادات V1'}
        </button>
      </div>
      {migrateMsg && <p className="text-sm font-medium text-slate-600">{migrateMsg}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {select('مخزن المواد الخام', 'استهلاك الخامات والمستهلكات من BOM.', routing.rawMaterialWarehouseId, (v) => patchRouting({ rawMaterialWarehouseId: v }), WAREHOUSE_ROLE_LABELS.raw_material)}
        {select('مخزن المفكك', 'خصم المكونات ونصف المصنع.', routing.decomposedWarehouseId, (v) => patchRouting({ decomposedWarehouseId: v }), WAREHOUSE_ROLE_LABELS.decomposed)}
        {select('مخزن إنتاج تحت التشغيل (WIP)', 'أول استقبال للكمية المنتجة من التقرير.', routing.productionWipWarehouseId, (v) => patchRouting({ productionWipWarehouseId: v }), WAREHOUSE_ROLE_LABELS.production_wip)}
        {select('مخزن تم الصنع', 'مرحلة ما بعد الإنتاج قبل التام.', routing.finishedStagingWarehouseId, (v) => patchRouting({ finishedStagingWarehouseId: v }), WAREHOUSE_ROLE_LABELS.finished_staging)}
        {select('مخزن المنتج التام', 'مخزن البيع / التسليم.', routing.finalProductWarehouseId, (v) => patchRouting({ finalProductWarehouseId: v }), WAREHOUSE_ROLE_LABELS.final_product)}
        {select('مخزن الهالك', 'استقبال هالك التقارير والمكونات.', routing.wasteWarehouseId, (v) => patchRouting({ wasteWarehouseId: v }), WAREHOUSE_ROLE_LABELS.waste)}
        {select('مخزن التغليف (من)', 'مصدر تحويل التغليف.', routing.packagingSourceWarehouseId, (v) => patchRouting({ packagingSourceWarehouseId: v }), WAREHOUSE_ROLE_LABELS.packaging)}
        {select('مخزن التغليف (إلى)', 'وجهة تحويل التغليف.', routing.packagingTargetWarehouseId, (v) => patchRouting({ packagingTargetWarehouseId: v }), WAREHOUSE_ROLE_LABELS.packaging)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {toggle('تحويل تلقائي WIP → تم الصنع', 'بعد التقرير، نقل الكمية من WIP إلى تم الصنع.', Boolean(routing.autoTransferProductionToFinished), () => patchRouting({ autoTransferProductionToFinished: !routing.autoTransferProductionToFinished }))}
        {toggle('تحويل تلقائي تم الصنع → منتج تام', 'نقل اختياري إلى مخزن المنتج التام.', Boolean(routing.autoTransferFinishedToFinal), () => patchRouting({ autoTransferFinishedToFinal: !routing.autoTransferFinishedToFinal }))}
        {toggle('اعتماد إدخال الإنتاج', 'إدخال WIP يتطلب اعتماداً قبل الترحيل.', routing.requireApprovalForProductionEntry !== false, () => patchRouting({ requireApprovalForProductionEntry: !routing.requireApprovalForProductionEntry }))}
        {toggle('اعتماد التحويلات التلقائية', 'التحويلات التلقائية تمر باعتماد التحويلات.', routing.requireApprovalForAutoTransfers !== false, () => patchRouting({ requireApprovalForAutoTransfers: !routing.requireApprovalForAutoTransfers }))}
      </div>

      {localPlanSettings.inventoryRoutingMigratedAt && (
        <p className="text-xs text-emerald-700 font-medium">
          آخر مزامنة: {new Date(localPlanSettings.inventoryRoutingMigratedAt).toLocaleString('ar-EG')}
        </p>
      )}
    </div>
  );
};
