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
    <div className="fixed inset-0 bg-black/40 z-[10050] flex items-center justify-center p-4" onClick={() => close()}>
      <div
        className="bg-[var(--color-card)] rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex justify-between items-center sticky top-0 bg-[var(--color-card)]">
          <div>
            <h3 className="font-bold text-lg">{data.title || 'تفاصيل احتياج المواد'}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              التكلفة التقديرية: {arNum(totalEstimatedCost(lines))} ج.م
            </p>
          </div>
          <button type="button" onClick={() => close()} aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="p-4 overflow-auto flex-1">
          {lines.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد بنود.</p>
          ) : (
            <table className="erp-table w-full text-right text-sm border-collapse">
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
                    <td className="px-2 py-2 text-[rgb(var(--color-danger))] font-bold">{arNum(line.shortageQty)}</td>
                    <td className="px-2 py-2">{arNum(line.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end sticky bottom-0 bg-[var(--color-card)]">
          <Button variant="outline" onClick={() => close()}>إغلاق</Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
