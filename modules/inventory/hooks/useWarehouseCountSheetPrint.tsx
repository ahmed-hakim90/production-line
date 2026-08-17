import { useCallback, useState } from 'react';
import { toast } from '../../../components/Toast';
import { useAppStore } from '../../../store/useAppStore';
import { usePrintEngine } from '../../../utils/printManager';
import { WarehouseCountSheetPrint } from '../components/WarehouseCountSheetPrint';
import {
  buildCountSheetRowsForScope,
  loadWarehouseCountSheetSource,
  type WarehouseCountSheetScope,
} from '../lib/warehouseCountSheet';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';
import type { StockItemBalance, WarehouseLocation, WarehouseRack, WarehouseRole } from '../types';

export type PrintWarehouseCountInput = {
  warehouseId: string;
  warehouseName: string;
  warehouseRole?: WarehouseRole;
  balances: StockItemBalance[];
  scope?: WarehouseCountSheetScope;
  rack?: Pick<WarehouseRack, 'id' | 'code' | 'name'> | null;
  shelf?: Pick<WarehouseLocation, 'id' | 'code' | 'rackName' | 'rack' | 'shelfName' | 'shelf'> | null;
};

export function useWarehouseCountSheetPrint() {
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();
  const [printing, setPrinting] = useState(false);

  const printWarehouseCount = useCallback(
    async (input: PrintWarehouseCountInput) => {
      const warehouseId = String(input.warehouseId || '').trim();
      const scope: WarehouseCountSheetScope = input.scope || 'warehouse';
      if (!warehouseId) {
        toast.error('اختر مخزناً أولاً لطباعة ورقة الجرد.');
        return;
      }
      if (scope === 'rack' && !input.rack) {
        toast.error('اختر الراك لطباعة الجرد.');
        return;
      }
      if (scope === 'shelf' && !input.shelf) {
        toast.error('اختر الرف لطباعة الجرد.');
        return;
      }
      setPrinting(true);
      try {
        const source = await loadWarehouseCountSheetSource(warehouseId);
        const { rows, scopeLabel } = buildCountSheetRowsForScope({
          scope,
          itemBalances: input.balances,
          locationLabelMap: source.locationLabelMap,
          locationBalances: source.locationBalances,
          locations: source.locations,
          rack: input.rack,
          shelf: input.shelf,
        });
        if (scope === 'warehouse' && rows.length === 0) {
          toast.error('لا توجد أصناف في هذا المخزن لطباعة الجرد.');
          return;
        }
        if (scope === 'rack' && rows.length === 0) {
          toast.error('لا توجد أرفف في هذا الراك لطباعة الجرد.');
          return;
        }
        if (rows.length === 0) {
          toast.error('تعذر تجهيز ورقة الجرد لهذا الرف.');
          return;
        }
        printDocument({
          documentTitle: 'ورقة جرد مخزن',
          printSettings: printTemplate,
          render: (ref) => (
            <WarehouseCountSheetPrint
              ref={ref}
              rows={rows}
              warehouseName={input.warehouseName || '—'}
              warehouseRoleLabel={input.warehouseRole
                ? (WAREHOUSE_ROLE_LABELS[input.warehouseRole] || input.warehouseRole)
                : '—'}
              scopeLabel={scopeLabel}
              printSettings={printTemplate}
            />
          ),
        });
      } catch {
        toast.error('تعذر تجهيز ورقة الجرد. حاول مرة أخرى.');
      } finally {
        setPrinting(false);
      }
    },
    [printDocument, printTemplate],
  );

  return { printWarehouseCount, printing };
}
