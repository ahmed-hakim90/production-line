# ADR-013: Firestore cache is isolated per browser tab

**Status:** Accepted  
**Date:** 2026-09-03

## Context

With Firebase JS SDK 12.9, opening the ERP in multiple browser tabs could make
Firestore throw `INTERNAL ASSERTION FAILED: Unexpected state` (`b815` / `90f9`).
The previous configuration used persistent IndexedDB with a forced single-tab
owner. Multiple tabs could therefore compete over shared persistence state.

## Decision

- Initialize Firestore with `memoryLocalCache()`.
- Do not configure a persistent single-tab or multi-tab manager.
- Keep long polling enabled for the existing unreliable-network mitigation.
- Treat each browser tab as an independent online Firestore client.

## Consequences

- Opening the ERP in multiple tabs does not share cache ownership or Firestore
  coordination state between them.
- Firestore data is fetched again after a full page reload and is not available
  offline. The production-gate offline queue remains separate and unchanged.
- Re-enabling persistent cache requires a verified SDK upgrade and a real
  multi-tab regression test before changing this decision.
