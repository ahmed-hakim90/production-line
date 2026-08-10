import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { GlobalModalPayload } from '../modalOpenPayload';
import type { MaterialRequirementLine } from '../../../modules/manufacturing/types';
import { totalEstimatedCost } from '../../../modules/manufacturing/engines/productionPlanningEngine';

type Payload = GlobalModalPayload & {
  title?: string;
  lines: MaterialRequirementLine[];
};

const arNum = (n: number) => n.toLocaleString('ar-EG');

export const GlobalMaterialRequirementDetailsModal: React.FC = () => {
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.MANUFACTURING_MATERIAL_REQUIREMENTS);
  const data = (payload || {}) as Payload;
  const lines = data.lines || [];

  if (!isOpen) return null;

  return (
    <ManagedModalPortal>
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => close()}>
      <div
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-xl border bg-[var(--color-card)] shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-[var(--color-card)] px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold sm:text-lg">{data.title || 'تفاصيل احتياج المواد'}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              التكلفة التقديرية: {arNum(totalEstimatedCost(lines))} ج.م
            </p>
          </div>
          <button type="button" onClick={() => close()} className="shrink-0" aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">لا توجد بنود.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="erp-table w-full min-w-[520px] border-collapse text-right text-sm">
              <thead>
                <tr className="border-b bg-[var(--color-bg)]">
                  <th className="px-2 py-2">المادة</th>
                  <th className="px-2 py-2">مطلوب</th>
                  <th className="px-2 py-2">متاح</th>
                  <th className="px-2 py-2">نقص</th>
                  <th className="px-2 py-2">تكلفة</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.materialId}
                    className={line.shortageQty > 0 ? 'bg-[rgb(var(--color-danger)/0.1)]' : 'border-b border-[var(--color-border)]'}
                  >
                    <td className="px-2 py-2 font-medium">{line.materialName}</td>
                    <td className="px-2 py-2">{arNum(line.requiredQty)} {line.unit}</td>
                    <td className="px-2 py-2">{arNum(line.availableQty)}</td>
                    <td className="px-2 py-2 font-bold text-[rgb(var(--color-danger))]">{arNum(line.shortageQty)}</td>
                    <td className="px-2 py-2">{arNum(line.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <div className="flex shrink-0 justify-end border-t bg-[var(--color-card)] px-4 py-3 sm:px-5">
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
