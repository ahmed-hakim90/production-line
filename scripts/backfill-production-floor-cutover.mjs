/**
 * Backfill helper notes for production-floor cutover (V2).
 *
 * Safe cutover policy (do NOT invent floor stock from old OUT-only issues):
 * 1. Configure productionFloorWarehouseId (distinct from decomposed / WIP / staging).
 * 2. Close or finish open production_issue_orders on the legacy OUT path.
 * 3. Take a physical count of components already on the production floor.
 * 4. Post an opening ADJUSTMENT (or stock count approval) into the floor warehouse.
 * 5. Enable requirePackagingHandoverReceipt and disable autoTransferProductionToFinished.
 *
 * Optional: replay stock_transactions into daily summary docs for faster period reports.
 * This script is documentation + dry-run scaffold; apply opening adjustments via the UI
 * (الجرد والمطابقة) so approvals and audit stay consistent.
 *
 * Usage:
 *   node scripts/backfill-production-floor-cutover.mjs --dry-run
 */
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run') || !args.has('--apply');

console.log(JSON.stringify({
  script: 'backfill-production-floor-cutover',
  dryRun,
  steps: [
    'Verify productionFloorWarehouseId is set and distinct',
    'Do not reconstruct floor balances from legacy production_issue OUT movements',
    'Post opening count/adjustment for physical floor stock via inventory counts UI',
    'Leave pending legacy issues on old path until closed',
    'New issues TRANSFER decomposed → floor; reports consume from floor',
    'New finished reports create production_handover for packaging supervisor receipt',
  ],
  message: dryRun
    ? 'Dry-run only. Use inventory counts UI for opening floor stock; no automatic rewrite of history.'
    : 'Apply mode reserved — use inventory counts UI for opening balances.',
}, null, 2));
