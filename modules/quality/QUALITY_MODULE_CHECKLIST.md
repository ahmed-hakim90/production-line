# Quality Module Checklist

## Environment
- [ ] Configure `.env.local` with all `VITE_FIREBASE_*` values.
- [ ] Deploy Firestore rules from `firestore.rules`.
- [ ] Deploy Firestore indexes from `firestore.indexes.json`.

## Line-sample analytics
- Line-pull sample counts created by the current UI use `sampleCount` for the base sample and `additionalSampleCount` for extra samples; the analytics total is their sum.
- Historical pulls without `sampleCountSemantics: "base_plus_additional"` retain the legacy interpretation that `sampleCount` already includes the additional sample.
- The tenant's `quality_settings/{tenantId}.lineSampleRejectLimit` defaults to 1; each pull stores its own editable `rejectLimit`, and completion rejects when the summed defect count exceeds that limit.
- Line-sample setup uses active production tags that pair a line name with its product and sector; manual line names are supported when a line is absent from production masters. Sector switching limits available tags and sample history to home appliances, seria, or all-factory records.
- Quality technicians have a tenant-scoped name/code directory. Stations select a technician from that directory, retain add order, and deactivation preserves historical references. New pulls capture the selected station technician automatically.
- Technician and production-tag directories are stored in the existing tenant `quality_settings` document, so their reads/writes use the already-deployed quality settings rules and require no new collection rules or indexes.
- `quality.settings.manage` also permits creating a pending line-sample pull, but does not grant inspection, completion, or other quality-record actions; the selected inspector must still match an active staff/station assignment.
- Pending pulls can be edited directly. Editing a completed pull requires `quality.records.reopen`, a reason, and re-completion; the selected decision mode (`auto`, `manual_accept`, or `manual_reject`) is stored on the pull. Manual accept/reject explicitly overrides the automatic reject-limit result.
- Deleting a pull removes its defect detail documents in the same Firestore batch so no orphaned defects remain.
- The analytics dashboard combines completed line pulls, completed pallet inspections, and hourly samples. Defect reason charts use each record's defect detail rows; overall defect totals use the parent record's defect count.
- The line-sample matrix distinguishes accepted, rejected, pending, stopped/no-sample, and unrecorded periods.

## End-to-End Scenarios
- [ ] Final Inspection `passed` saves inspection and updates work order quality summary.
- [ ] Final Inspection `failed` requires reason and creates defect.
- [ ] Final Inspection `rework` requires reason and creates both defect and rework order with valid `defectId`.
- [ ] IPQC `rework` creates rework order and updates work order quality status consistently.
- [ ] CAPA creation supports optional linking to `workOrderId` and `defectId`.
- [ ] Rework status transitions (`open`, `in_progress`, `done`, `scrap`) persist correctly.

## Printing and Reports
- [ ] Final Inspection print/PDF uses dedicated print template output.
- [ ] IPQC print/PDF uses dedicated print template output.
- [ ] Rework print/PDF uses dedicated print template output.
- [ ] CAPA print/PDF uses dedicated print template output.
- [ ] Quality Reports auto-load when `workOrderId` exists in query string.
- [ ] `PDF KPI` and `PDF Defects` export different report layouts.

## Permissions and Navigation
- [ ] Quality routes are visible only with matching `quality.*.view` permissions.
- [ ] Action buttons (inspect/manage/print) follow granular permissions.
- [ ] Quality pages are grouped under the `quality` menu group.
- [ ] Legacy quality permissions still map correctly through fallback compatibility.

## User Feedback and Reliability
- [ ] Save/export failures are surfaced to user (no silent failures).
- [ ] Save/export successes are surfaced to user.
- [ ] Notification fanout failures do not block main business action.

