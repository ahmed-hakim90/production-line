import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { GlobalModalPayload } from '../modalOpenPayload';
import type { PlanSettings, Warehouse } from '../../../types';
import { migrateInventoryRoutingV1 } from '../../../modules/inventory/services/inventoryMigrationService';
import { useAppStore } from '../../../store/useAppStore';

type Payload = GlobalModalPayload & {
  localPlanSettings: PlanSettings;
  setLocalPlanSettings: React.Dispatch<React.SetStateAction<PlanSettings>>;
  inventoryWarehouses: Warehouse[];
  onPersist?: () => void | Promise<void>;
};

export const GlobalProductionRoutingSettingsModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.INVENTORY_ROUTING_SETTINGS);
  const data = (payload || {}) as Payload;
  const fetchSystemSettings = useAppStore((s) => s.fetchSystemSettings);
  const [migrating, setMigrating] = useState(false);
  const [msg, setMsg] = useState('');

  if (!isOpen || !data.localPlanSettings) return null;

  const routing = { ...data.localPlanSettings.inventoryRouting };
  const patch = (p: Partial<NonNullable<PlanSettings['inventoryRouting']>>) => {
    data.setLocalPlanSettings((prev) => ({
      ...prev,
      inventoryRouting: { ...prev.inventoryRouting, ...p },
    }));
  };

  const runMigration = async () => {
    setMigrating(true);
    try {
      await migrateInventoryRoutingV1();
      await fetchSystemSettings();
      setMsg('تمت المزامنة.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'فشلت المزامنة');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => close()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto border" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
          <h3 className="font-bold">توجيه المخازن (سريع)</h3>
          <button type="button" onClick={() => close()}><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {msg && <p className="text-emerald-700 font-bold">{msg}</p>}
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={Boolean(routing?.autoTransferProductionToFinished)} onChange={() => patch({ autoTransferProductionToFinished: !routing?.autoTransferProductionToFinished })} />
            تحويل تلقائي WIP → تم الصنع
          </label>
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={Boolean(routing?.autoTransferFinishedToFinal)} onChange={() => patch({ autoTransferFinishedToFinal: !routing?.autoTransferFinishedToFinal })} />
            تحويل تلقائي → منتج تام
          </label>
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={routing?.requireApprovalForProductionEntry !== false} onChange={() => patch({ requireApprovalForProductionEntry: !routing?.requireApprovalForProductionEntry })} />
            اعتماد إدخال الإنتاج
          </label>
          <label className="flex items-center gap-2 font-bold">
            <input type="checkbox" checked={routing?.requireApprovalForAutoTransfers !== false} onChange={() => patch({ requireApprovalForAutoTransfers: !routing?.requireApprovalForAutoTransfers })} />
            اعتماد التحويلات التلقائية
          </label>
          <p className="text-xs text-slate-500">لتعديل المخازن بالكامل استخدم صفحة الإعدادات الرئيسية.</p>
        </div>
        <div className="p-4 border-t flex flex-wrap gap-2 justify-end sticky bottom-0 bg-white">
          <Button variant="outline" onClick={() => void runMigration()} disabled={migrating}>مزامنة V1</Button>
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
          <Button variant="primary" onClick={() => { void data.onPersist?.(); close(); }}>حفظ الإعدادات</Button>
        </div>
      </div>
    </div>
  );
};
