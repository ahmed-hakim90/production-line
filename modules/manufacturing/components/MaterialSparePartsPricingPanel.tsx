import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { isRepairPartsPricingMaterial } from '../../repair/lib/repairPartsPricingMaterials';
import {
  downloadRepairPartsPricingSheet,
  parseRepairPartsPricingFile,
  type RepairPartsPricingImportResult,
} from '../../repair/lib/repairPartsPricingSheet';
import { repairPartsPricingService } from '../../repair/services/repairPartsPricingService';
import { normalizeRepairSalePrice } from '../../repair/utils/sparePartPricing';
import type { Material } from '../types';
import { materialShowsSparePartsPricing } from '../lib/materialSparePartsPricing';

export { materialShowsSparePartsPricing } from '../lib/materialSparePartsPricing';

type Props = {
  materials: Material[];
  canManagePricing: boolean;
  onUpdated: () => Promise<void> | void;
};

function priceValues(material: Material) {
  return {
    consumer: normalizeRepairSalePrice(material.defaultSalePrice),
    trader: normalizeRepairSalePrice(material.traderSalePrice),
    cost: normalizeRepairSalePrice(material.purchaseCost),
  };
}

/**
 * Excel export/import for company-wide spare-part prices on manufacturing materials.
 * Lives under Materials (master), not the repair module menu.
 */
export const MaterialSparePartsPricingPanel: React.FC<Props> = ({
  materials,
  canManagePricing,
  onUpdated,
}) => {
  const pricingMaterials = useMemo(
    () => materials.filter(isRepairPartsPricingMaterial),
    [materials],
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState<RepairPartsPricingImportResult | null>(null);

  if (!canManagePricing) return null;

  const handleImportFile = async (file: File) => {
    if (importParsing || importSaving) return;
    setImportParsing(true);
    setImportFileName(file.name);
    setImportResult(null);
    try {
      const result = await parseRepairPartsPricingFile(file, pricingMaterials);
      setImportResult(result);
      if (result.errors.length > 0) {
        toast.error(`تمت قراءة الملف مع ${result.errors.length} أخطاء مانعة.`);
      } else if (result.changes.length === 0) {
        toast.info('لا توجد أسعار مختلفة لتحديثها.');
      } else {
        toast.success(`الملف جاهز: ${result.changes.length} قطعة سيتم تحديثها.`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر قراءة ملف التسعير.');
    } finally {
      setImportParsing(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const closeImportPreview = () => {
    if (importSaving) return;
    setImportResult(null);
    setImportFileName('');
  };

  const confirmPricingImport = async () => {
    if (
      !importResult
      || importResult.errors.length > 0
      || importResult.changes.length === 0
      || importSaving
    ) return;
    setImportSaving(true);
    try {
      const updated = await repairPartsPricingService.update(importResult.changes);
      toast.success(`تم تحديث أسعار ${updated} قطعة غيار بنجاح.`);
      setImportResult(null);
      setImportFileName('');
      await onUpdated();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'تعذر تحديث أسعار قطع الغيار.');
      await onUpdated();
    } finally {
      setImportSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pricingMaterials.length === 0 || importSaving}
          onClick={() => downloadRepairPartsPricingSheet(pricingMaterials)}
        >
          تنزيل تسعير قطع الغيار
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pricingMaterials.length === 0 || importParsing || importSaving}
          onClick={() => importInputRef.current?.click()}
        >
          {importParsing ? 'جاري القراءة…' : 'رفع تسعير قطع الغيار'}
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          aria-label="رفع ملف تسعير قطع الغيار"
          disabled={importParsing || importSaving}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportFile(file);
          }}
        />
      </div>

      <Dialog open={importResult !== null} onOpenChange={(open) => {
        if (!open) closeImportPreview();
      }}>
        <DialogContent dir="rtl" className="max-w-4xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>معاينة تحديث تسعير قطع الغيار</DialogTitle>
            <DialogDescription>
              {importFileName || 'ملف Excel'} — الأسعار تُحفظ على ماستر المواد فقط.
            </DialogDescription>
          </DialogHeader>

          {importResult ? (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-4">
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">صفوف الملف</div>
                  <div className="font-bold tabular-nums">{importResult.totalRows}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">سيتم تحديثها</div>
                  <div className="font-bold tabular-nums">{importResult.changes.length}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">بدون تغيير</div>
                  <div className="font-bold tabular-nums">{importResult.unchangedRows}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-xs text-muted-foreground">أخطاء مانعة</div>
                  <div className={`font-bold tabular-nums ${importResult.errors.length ? 'text-destructive' : ''}`}>
                    {importResult.errors.length}
                  </div>
                </div>
              </div>

              {importResult.errors.length > 0 ? (
                <ul className="max-h-36 list-inside list-disc space-y-1 overflow-y-auto text-sm text-destructive">
                  {importResult.errors.slice(0, 50).map((error, index) => (
                    <li key={`${index}-${error}`}>{error}</li>
                  ))}
                </ul>
              ) : null}

              {importResult.changes.length > 0 ? (
                <div className="max-h-80 overflow-auto rounded border">
                  <table className="erp-table w-full text-xs">
                    <thead className="erp-thead sticky top-0">
                      <tr>
                        <th className="erp-th p-2 text-right">القطعة</th>
                        <th className="erp-th p-2 text-right">الكود</th>
                        <th className="erp-th p-2 text-right">المستهلك</th>
                        <th className="erp-th p-2 text-right">التاجر</th>
                        <th className="erp-th p-2 text-right">التكلفة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.changes.slice(0, 100).map((change) => (
                        <tr key={change.materialId} className="border-t">
                          <td className="p-2 font-medium">{change.name}</td>
                          <td className="p-2">{change.code}</td>
                          <td className="p-2 tabular-nums">
                            {change.current.consumer} ← {change.next.consumer}
                          </td>
                          <td className="p-2 tabular-nums">
                            {change.current.trader} ← {change.next.trader}
                          </td>
                          <td className="p-2 tabular-nums">
                            {change.current.cost} ← {change.next.cost}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={closeImportPreview} disabled={importSaving}>
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={() => void confirmPricingImport()}
              disabled={
                importSaving
                || !importResult
                || importResult.errors.length > 0
                || importResult.changes.length === 0
              }
            >
              {importSaving ? 'جاري تحديث الأسعار…' : `تأكيد تحديث ${importResult?.changes.length || 0} قطعة`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export function buildSparePartsPricingUpdate(input: {
  material: Material;
  consumer: number;
  trader: number;
  cost: number;
}) {
  const current = priceValues(input.material);
  const next = {
    consumer: normalizeRepairSalePrice(input.consumer),
    trader: normalizeRepairSalePrice(input.trader),
    cost: normalizeRepairSalePrice(input.cost),
  };
  if (
    current.consumer === next.consumer
    && current.trader === next.trader
    && current.cost === next.cost
  ) {
    return null;
  }
  return {
    materialId: String(input.material.id),
    code: String(input.material.code || '').trim().toUpperCase(),
    current,
    next,
  };
}
