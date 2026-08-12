import { useCallback, useRef, useState } from 'react';
import { PrintOffscreenHost } from '@/src/components/erp/PrintOffscreenHost';
import { toast } from '../../../components/Toast';
import { useAppStore } from '../../../store/useAppStore';
import { commitAndPrint, useManagedPrint } from '../../../utils/printManager';
import { WarehouseCountSheetPrint } from '../components/WarehouseCountSheetPrint';
import {
  balancesToCountSheetRows,
  loadWarehouseCountLocationLabels,
  type WarehouseCountSheetRow,
} from '../lib/warehouseCountSheet';
import { WAREHOUSE_ROLE_LABELS } from '../lib/stockLabels';
import type { StockItemBalance, WarehouseRole } from '../types';

type PrintPayload = {
  rows: WarehouseCountSheetRow[];
  warehouseName: string;
  warehouseRoleLabel: string;
};

export function useWarehouseCountSheetPrint() {
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const printRef = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<PrintPayload | null>(null);
  const [printing, setPrinting] = useState(false);
  const handlePrint = useManagedPrint({
    contentRef: printRef,
    printSettings: printTemplate,
    documentTitle: 'ورقة جرد مخزن',
  });

  const printWarehouseCount = useCallback(
    async (input: {
      warehouseId: string;
      warehouseName: string;
      warehouseRole?: WarehouseRole;
      balances: StockItemBalance[];
    }) => {
      const warehouseId = String(input.warehouseId || '').trim();
      if (!warehouseId) {
        toast.error('اختر مخزناً أولاً لطباعة ورقة الجرد.');
        return;
      }
      if (input.balances.length === 0) {
        toast.error('لا توجد أصناف في هذا المخزن لطباعة الجرد.');
        return;
      }
      setPrinting(true);
      try {
        const locations = await loadWarehouseCountLocationLabels(warehouseId);
        const rows = balancesToCountSheetRows(input.balances, locations);
        commitAndPrint(() => {
          setPayload({
            rows,
            warehouseName: input.warehouseName || '—',
            warehouseRoleLabel: input.warehouseRole
              ? (WAREHOUSE_ROLE_LABELS[input.warehouseRole] || input.warehouseRole)
              : '—',
          });
        }, handlePrint);
      } catch {
        toast.error('تعذر تجهيز ورقة الجرد. حاول مرة أخرى.');
      } finally {
        setPrinting(false);
      }
    },
    [handlePrint],
  );

  const countSheetHost = (
    <PrintOffscreenHost>
      <WarehouseCountSheetPrint
        ref={printRef}
        rows={payload?.rows || []}
        warehouseName={payload?.warehouseName}
        warehouseRoleLabel={payload?.warehouseRoleLabel}
        printSettings={printTemplate}
      />
    </PrintOffscreenHost>
  );

  return { printWarehouseCount, countSheetHost, printing };
}
