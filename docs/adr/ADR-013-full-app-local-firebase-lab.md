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
npm run seed:lab
npm run dev:lab
```

The application displays a persistent red environment banner whenever emulator mode is active.
The seed command refuses to run unless both emulator hosts point to localhost and the project ID starts with `demo-`.

## Cutover rule

No work-order-cycle change may be deployed until its full journey passes local emulator tests and rendered QA. Server-side validation, tenant isolation, permission checks, idempotency, migration compatibility, and rollback must be reviewed before production activation.

## Delivery 1: work-order preparation and hourly plan

New and safely edited work orders snapshot their operating hours in `hourlySlots`. Each slot records its date, start/end, allocated target, and lifecycle status. The generator excludes the configured break and prorates the daily target across actual operating minutes.

Legacy work orders remain readable without migration. Saving an old order generates its schedule. Once any hourly slot leaves `planned`, schedule regeneration is blocked so an edit cannot rewrite an execution record.

## Delivery 2: hourly execution handoff

An authorized work-order operator opens only the oldest planned slot. Opening snapshots the assigned worker count and moves a pending work order into progress. Only one slot may be open at a time.

The operator submits actual and rejected quantities plus optional execution notes. Submission moves the slot to `quality_pending`; it does not yet post inventory, create a production report, or count accepted output. Those mutations remain owned by their existing server-controlled journeys and will be connected only after the quality decision is implemented.
