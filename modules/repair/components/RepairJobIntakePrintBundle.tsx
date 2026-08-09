import React from 'react';
import type { PrintTemplateSettings } from '../../../types';
import { DEFAULT_PRINT_TEMPLATE } from '../../../utils/dashboardConfig';
import type { RepairPrintStatusMap } from '../lib/repairJobPrint';
import type { RepairBranch, RepairJob, RepairJobProduct } from '../types';
import { RepairJobPrint } from './RepairJobPrint';
import { RepairJobProductCardPrint } from './RepairJobProductCardPrint';

export type RepairJobIntakePrintBundleProps = {
  job: RepairJob | null;
  branch?: RepairBranch | null;
  products?: RepairJobProduct[];
  trackUrl?: string;
  workUrl?: string;
  printSettings?: PrintTemplateSettings;
  statusMap?: RepairPrintStatusMap;
};

const pageBreakStyle: React.CSSProperties = {
  pageBreakAfter: 'always',
  breakAfter: 'page',
};

/**
 * One print job after intake / from job detail on A5:
 * page 1 = receipt (center copy),
 * page 2 = receipt (customer copy),
 * page 3 = internal card.
 */
export const RepairJobIntakePrintBundle = React.forwardRef<HTMLDivElement, RepairJobIntakePrintBundleProps>(
  function RepairJobIntakePrintBundle(
    { job, branch, products, trackUrl, workUrl, printSettings, statusMap },
    ref,
  ) {
    const bundleSettings: PrintTemplateSettings = {
      ...DEFAULT_PRINT_TEMPLATE,
      ...printSettings,
      paperSize: 'a5',
    };

    const receiptProps = {
      job,
      branch,
      products,
      trackUrl,
      printSettings: bundleSettings,
      statusMap,
    } as const;

    return (
      <div ref={ref} dir="rtl" className="print-root arabic-export-root">
        <div style={pageBreakStyle}>
          <RepairJobPrint {...receiptProps} copyKind="center" />
        </div>
        <div style={pageBreakStyle}>
          <RepairJobPrint {...receiptProps} copyKind="customer" />
        </div>
        <RepairJobProductCardPrint
          job={job}
          branch={branch}
          products={products}
          printSettings={bundleSettings}
          workUrl={workUrl}
          statusMap={statusMap}
        />
      </div>
    );
  },
);
