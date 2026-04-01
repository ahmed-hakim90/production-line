# Phase 3 Backlog (Ready, Not Started)

This backlog is prepared only for planning and prioritization. No Phase 3 coding is started in this delivery.

## A) Production + Inventory Lifecycle

1. BOM auto-consumption (Cloud Function on production report save)
   - Read BOM for produced item
   - Deduct raw material quantities from inventory balances
   - Block or flag insufficient stock
2. Batch/Expiry issuing with FEFO
   - Extend movement model with `batchNumber`, `mfgDate`, `expiryDate`
   - Issue from earliest expiry batches first
3. Reorder points and procurement alerts
   - Add `reorderPoint`, `maxStock` to material catalog
   - Daily scheduled function to generate low-stock alerts

## B) HR + Attendance Financial Core

1. Payroll callable engine
   - Formula target: base + allowances + overtime - absences/penalties - loans/advances
   - Audit-ready result payload and run logs
2. Shift roster and rules
   - Employee-to-shift-to-line mapping
   - Attendance reconciliation by roster for late/early/overtime/absent

## C) Production OEE Readiness

1. Downtime capture in production quick entry
   - Reasons: machine breakdown, no material, power outage, others
   - Track start/end/duration and line context
2. OEE data pipeline inputs
   - Feed Availability loss inputs from downtime records

## D) System-Wide Operations

1. Offline-first hardening
   - Firestore persistence behavior validation in unstable network
   - Conflict policy on reconnect (server-wins with merge rules where needed)
2. Observability
   - Backend alerting for failed scheduled/callable functions
   - Error grouping, ownership, and incident response path
3. Disaster recovery snapshots
   - Daily tenant-isolated snapshot process
   - Restore drill runbook and verification checklist

## Execution Gate

Start Phase 3 only after:
- Formal approval of Phase 1+2 closure evidence.
- Priority order confirmation across A/B/C/D tracks.
