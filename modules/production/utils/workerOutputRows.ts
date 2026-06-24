import type { ProductionReportWorkerOutput } from '@/types';

export const getVisibleWorkerOutputRows = (
  rows: ProductionReportWorkerOutput[],
): ProductionReportWorkerOutput[] => rows.filter((row) => row.isPresent !== false);
