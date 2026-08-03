# ADR-003: `functions/src` is the source of truth

**Status:** Accepted  
**Date:** 2026-08-03

## Context

Cloud Functions historically risked drift between edited `functions/lib/**/*.js` and TypeScript sources. Baseline hardening treats compiled JS as build output only (`docs/BASELINE_HARDENING_REPORT.md`).

## Decision

- **Author** all Functions logic in `functions/src/**/*.ts`.
- **Build** with `npm --prefix functions run build` (`tsc`) → `functions/lib/**/*.js`.
- `functions/package.json` `"main": "lib/index.js"` remains the deploy entry.
- CI / deploy / emulator paths that execute Functions must rebuild from `src` first.
- Do not hand-edit `functions/lib` except as disposable compile output.

## Consequences

- Reviewers reject PRs that only change `lib/` for feature work.
- Backfill npm scripts already `npm run build && node lib/scripts/...`.
- Typecheck gate: `npm run typecheck:functions`.

## Rejected

- Maintaining dual hand-written JS + TS.
- Deploying uncommitted `lib` changes without a corresponding `src` change.
