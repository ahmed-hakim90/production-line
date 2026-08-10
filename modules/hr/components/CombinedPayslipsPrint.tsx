import React from 'react';
import type { PrintTemplateSettings } from '@/types';
import type { PayslipData } from '../utils/payslipGenerator';
import { PayslipPrint } from './PayslipPrint';

export type CombinedPayslipsPrintProps = {
  items: PayslipData[];
  printSettings?: PrintTemplateSettings;
};

/** Multi-page payslip print surface (one page-break per employee). */
export const CombinedPayslipsPrint = React.forwardRef<HTMLDivElement, CombinedPayslipsPrintProps>(
  function CombinedPayslipsPrint({ items, printSettings }, ref) {
    if (!items.length) return <div ref={ref} />;

    return (
      <div ref={ref} className="print-root">
        {items.map((data, index) => (
          <div
            key={`${data.record.employeeId || data.record.employeeName}-${index}`}
            style={{
              pageBreakAfter: index < items.length - 1 ? 'always' : 'auto',
              breakAfter: index < items.length - 1 ? 'page' : 'auto',
            }}
          >
            <PayslipPrint data={data} printSettings={printSettings} />
          </div>
        ))}
      </div>
    );
  },
);
