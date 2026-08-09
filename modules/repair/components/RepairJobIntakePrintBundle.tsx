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

/**
 * One print job after intake / from job detail:
 * page 1 = customer receipt, page 2 = internal A5 card.
 * Both sheets share A5 so the card is not clipped.
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

    return (
      <div ref={ref} dir="rtl" className="print-root arabic-export-root">
        <div
          style={{
            pageBreakAfter: 'always',
            breakAfter: 'page',
          }}
        >
          <RepairJobPrint
            job={job}
            branch={branch}
            products={products}
            trackUrl={trackUrl}
            printSettings={bundleSettings}
            statusMap={statusMap}
          />
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
