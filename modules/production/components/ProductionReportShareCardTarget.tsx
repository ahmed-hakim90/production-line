import type { Ref } from 'react';
import type { PrintTemplateSettings } from '../../../types';
import type { ReportPrintRow } from './ProductionReportPrint';
import { ProductionReportShareCard } from './ProductionReportShareCard';

type ProductionReportShareCardTargetProps = {
  row: ReportPrintRow | null;
  printSettings?: PrintTemplateSettings;
  targetRef: Ref<HTMLDivElement>;
};

export function ProductionReportShareCardTarget({
  row,
  printSettings,
  targetRef,
}: ProductionReportShareCardTargetProps) {
  if (!row) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '-99999px',
        top: 0,
        width: 1080,
        background: 'white',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    >
      <div ref={targetRef} style={{ width: 1080, background: 'white' }}>
        <ProductionReportShareCard report={row} printSettings={printSettings} />
      </div>
    </div>
  );
}
