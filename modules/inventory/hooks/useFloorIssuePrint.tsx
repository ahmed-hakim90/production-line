import React from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { usePrintEngine } from '../../../utils/printManager';
import { ProductionIssuePrint } from '../components/ProductionIssuePrint';
import { floorIssueSourceLabel } from '../lib/productionFloorProductCards';
import type { ProductionIssueOrder } from '../types';

export function useFloorIssuePrint() {
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const { printDocument } = usePrintEngine();

  return (orders: ProductionIssueOrder[], title: string) => {
    if (!orders.length) return false;
    printDocument({
      documentTitle: title,
      printSettings: printTemplate,
      render: (ref) => (
        <div ref={ref}>
          {orders.map((order, index) => (
            <div
              key={order.id}
              style={{ pageBreakAfter: index < orders.length - 1 ? 'always' : undefined }}
            >
              <ProductionIssuePrint
                order={order}
                sourceLabel={floorIssueSourceLabel(order)}
                paperSize={printTemplate?.paperSize || 'a4'}
                printSettings={printTemplate}
              />
            </div>
          ))}
        </div>
      ),
    });
    return true;
  };
}
