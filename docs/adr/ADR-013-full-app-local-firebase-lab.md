# ADR-013: Full-application local Firebase lab

## Status

Accepted as the prerequisite for the work-order-cycle implementation.

## Context

The normal Vite development application uses the configured live Firebase project. Running new work-order, quality, packaging, or inventory mutations against that configuration would modify operational data even when the frontend itself is only running locally.

## Decision

The new cycle is developed inside the real application modules and routes, not in a separate prototype. Local integration testing uses `npm run dev:lab`. That mode forces a fixed demo Firebase project identity and connects Auth, Firestore, Functions, and Storage clients to localhost emulators.

The regular `npm run dev` command remains unchanged. Production builds do not load `.env.lab`, and emulator mode must never be enabled in a deployed environment.

## Operator workflow

Run these commands in separate terminals:

```bash
npm run emulators:lab
npm run dev:lab
```

The application displays a persistent red environment banner whenever emulator mode is active.

## Cutover rule

No work-order-cycle change may be deployed until its full journey passes local emulator tests and rendered QA. Server-side validation, tenant isolation, permission checks, idempotency, migration compatibility, and rollback must be reviewed before production activation.
