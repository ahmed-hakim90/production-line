import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../UI';
import type { Warehouse, WarehouseLocationSettings } from '../../../inventory/types';
import { warehouseLocationSettingsService } from '../../../inventory/services/warehouseLocationSettingsService';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
type Props = {
  isAdmin: boolean;
  inventoryWarehouses: Warehouse[];
};
export const WarehouseLocationSettingsSection: React.FC<Props> = ({ isAdmin, inventoryWarehouses }) => {
  const [warehouseId, setWarehouseId] = useState('');
  const [settings, setSettings] = useState<WarehouseLocationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedWarehouse = inventoryWarehouses.find((w) => w.id === warehouseId);
  const load = async (id = warehouseId) => {
    const resolvedId = id || inventoryWarehouses[0]?.id || '';
    if (!resolvedId) return;
    const wh = inventoryWarehouses.find((w) => w.id === resolvedId);
    setWarehouseId(resolvedId);
    const row = await warehouseLocationSettingsService.get(resolvedId, wh?.name);
    setSettings(row);
  };
  useEffect(() => {
    void load();
  }, [inventoryWarehouses]);
  const patch = (next: Partial<WarehouseLocationSettings>) => {
    setSettings((prev) => prev ? { ...prev, ...next } : prev);
  };
  const save = async () => {
    if (!isAdmin || !selectedWarehouse?.id || !settings) return;
    setSaving(true);
    try {
      await warehouseLocationSettingsService.save({
        ...settings,
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
      });
      toast.success('تم حفظ إعدادات لوكيشن المخزن.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ إعدادات اللوكيشن.');
    } finally {
      setSaving(false);
    }
  };
  const toggle = (label: string, hint: string, checked: boolean, onToggle: () => void, disabled = false) => (
    <div className="flex items-start gap-4 p-4 bg-[var(--color-bg)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
      <div className="flex-1">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        disabled={!isAdmin || disabled}
        onClick={onToggle}
        className={`relative w-12 h-7 rounded-full shrink-0 disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${checked ? 'left-0.5' : 'left-[calc(100%-1.625rem)]'}`} />
      </button>
    </div>
  );
  if (!isAdmin) return null;
  return (
    <OpsDashPanel title="إعدادات لوكيشن المخازن">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--color-text)]">إلزام اللوكيشن حسب المخزن</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">هذه الإعدادات تتحكم في إدخال/صرف المكونات والمنتجات على مستوى الرف.</p>
          </div>
          <Button onClick={() => void save()} disabled={saving || !settings}>
            <Save size={14} />
            {saving ? 'جاري الحفظ...' : 'حفظ إعدادات اللوكيشن'}
          </Button>
        </div>
        <select
          className="w-full max-w-md border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm font-bold py-2.5 px-3"
          value={warehouseId}
          onChange={(e) => void load(e.target.value)}
        >
          {inventoryWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
        </select>
        {settings && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {toggle(
              'لوكيشن المكونات إجباري',
              'المواد الخام والمكونات لا تدخل أو تخرج إلا من رف محدد.',
              settings.requireComponentLocation !== false,
              () => patch({ requireComponentLocation: !settings.requireComponentLocation }),
            )}
            {toggle(
              'لوكيشن المنتج التام إجباري',
              'المنتجات التامة تحتاج رف عند الإدخال أو الإخراج.',
              settings.requireFinishedGoodLocation === true,
              () => patch({ requireFinishedGoodLocation: !settings.requireFinishedGoodLocation }),
            )}
            {toggle(
              'أكواد اللوكيشن تلقائية',
              'الكود يتولد من كود المخزن + كود الراك + كود الرف.',
              settings.autoGenerateLocationCode !== false,
              () => patch({ autoGenerateLocationCode: !settings.autoGenerateLocationCode }),
              true,
            )}
            {toggle(
              'السماح بتعديل اللوكيشن المقترح',
              'المستخدم يقدر يغير الرف المقترح في الصرف أو التفكيك قبل الاعتماد.',
              settings.allowSuggestedLocationOverride !== false,
              () => patch({ allowSuggestedLocationOverride: !settings.allowSuggestedLocationOverride }),
            )}
          </div>
        )}
      </div>
    </OpsDashPanel>
  );
};
