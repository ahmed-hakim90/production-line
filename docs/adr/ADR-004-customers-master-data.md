# ADR-004: Customers master data and cross-module activity ledger

**Status:** Accepted  
**Date:** 2026-08-04

## Context

Repair jobs stored customer name/phone as free text. There was no CRM master, no customer codes, and no shared activity history. The business needs ~8k customers (مستهلك / تاجر) as master data that repair (and future modules) reference by `customerId`, with Excel import by business code and a per-customer timeline of movements.

## Decision

- Own master collection `customers` (tenant-scoped): `code` (unique via `entity_code_claims`), `type` (`consumer` | `trader`), name, phone, `phoneDigits`, address, notes, `isActive`.
- Own ledger `customer_activities` for cross-module timeline entries (module, action, reference, actor, at).
- Module `modules/customers/` owns CRUD, import template, list/detail UI, and `CustomerPicker`.
- Repair creates/selects a master customer and writes `customerId` on the job; denormalized name/phone remain for receipts/search display.
- Any future module that touches a customer must resolve/create master customer and append to `customer_activities`.

## Rejected

- Keeping customers only as text on repair documents (no 360°, duplicate identity).
- Embedding CRM inside the repair module (customers are shared master data).
- Client-only authorization without tenant-scoped Firestore docs.

## Consequences

- Repair job create requires selecting or creating a master customer.
- Import upserts by code; code collisions fail closed via claims.
- Activity timeline grows with every linked module event; readers must paginate/limit.
- Indexes needed for `customers` (`tenantId`+`code`, `tenantId`+`phoneDigits`) and `customer_activities` (`tenantId`+`customerId`+`at`).
