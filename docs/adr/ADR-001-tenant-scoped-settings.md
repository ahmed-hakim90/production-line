# ADR-001: Tenant-scoped settings documents

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Multi-tenant ERP data must not share mutable singleton settings docs (`hr_settings/global`, `labor_settings/default`, `approval_settings/global`, `hr_config_modules/{module}`). Shared IDs allow cross-tenant bleed and make backup/restore unsafe.

`system_settings` already uses `{tenantId}` as the document id.

## Decision

- Read/write tenant settings at:
  - `hr_settings/{tenantId}`
  - `labor_settings/{tenantId}`
  - `approval_settings/{tenantId}`
  - `hr_config_modules/{tenantId}__{module}`
- Dual-read legacy docs during migration; prefer tenant doc once present.
- Backfill via `scripts/backfill-tenant-singleton-settings.ts` (dry-run default).
- Stamp `tenantId` on copied documents.

## Consequences

- New tenants get isolated settings without colliding on `global` / `default`.
- Operators must run backfill (or first-write) before turning off legacy dual-read.
- Rules and services must treat doc id as tenant-scoped, not a universal constant.
- As of this ADR date, `modules/hr/approval/collections.ts` still opens `approval_settings/global`; `modules/hr/collections.ts` already exposes tenant + legacy refs — finish switching the approval engine to the tenant doc after backfill.

## Rejected

- Keeping shared global settings with a `tenantId` field only (easy to query wrong doc id).
- Namespaced subcollections under `tenants/{id}` for this slice (larger migration than doc-id rename).
