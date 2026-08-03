/**
 * Production usecases — public export map.
 *
 * Layer: UI / store → usecases → services → Firebase.
 * Pages and modal-manager must not write Firestore directly
 * (see scripts/check-legacy-imports.mjs).
 *
 * Reports backlog (create / update / delete / import / reconcile still
 * largely in useAppStore + Reports.tsx):
 *   ./REPORTS_EXTRACTION_NOTES.md
 */
export {
  createProductionReport,
  type CreateProductionReportInput,
  type CreateProductionReportOutput,
} from './createProductionReport';

export {
  createProductionIssueRequest,
  type CreateProductionIssueRequestInput,
  type CreateProductionIssueRequestOutput,
} from './createProductionIssueRequest';

export {
  updateWorkOrderStatus,
  reopenCompletedWorkOrder,
  type UpdateWorkOrderStatusInput,
  type ReopenWorkOrderInput,
} from './updateWorkOrderStatus';
