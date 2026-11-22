# Deployment

Canonical English. Aligns with root `README.md` deploy section and `firebase.json`.

## Prerequisites

```bash
npm install
npm --prefix functions install
firebase login
firebase use <project-id>   # e.g. production project alias from .firebaserc
```

## Compose Firestore rules

Do **not** hand-merge monolith rules without the composer when using fragments:

```bash
npm run compose:firestore-rules
```

Script: `scripts/compose-firestore-rules.mjs`  
Outputs / updates `firestore.rules` from head + `firestore/production-line.rules.fragment` (see script help for `--migrate-from-monolith`).

`firebase.json` points `firestore.rules` at the composed file. `npm run test:rules` and `verify:firebase` compose before checks.

## Functions: build from `src`

Source of truth: `functions/src/**/*.ts`  
Runtime entry: `functions/lib/index.js` (`functions/package.json` `"main"`).

```bash
npm --prefix functions run build
# or typecheck only:
npm run typecheck:functions
```

Never hand-edit `functions/lib`. Rebuild before deploy and before tests that load compiled JS. ADR: [adr/ADR-003-functions-src-is-source-of-truth.md](./adr/ADR-003-functions-src-is-source-of-truth.md).

## Production frontend (Vercel)

The user-facing production frontend is `https://production-line.vercel.app`, linked to GitHub `main` (see README). Firebase Hosting is a separate mirror; publishing there alone does not update the production Vercel URL. Deploy the reviewed source through the linked Git integration or authenticated `vercel deploy --prod`, then verify the assets served from the Vercel production alias.

## Firebase Hosting mirror

```bash
npm run build          # Vite → dist/
firebase deploy --only hosting
```

Hosting (`firebase.json`):

- `public`: `dist`
- SPA rewrite `**` → `/index.html`
- Cache: `index.html` / SW files no-cache; `/assets/**` immutable long-cache

## Indexes

- File: `firestore.indexes.json`
- Deploy: `firebase deploy --only firestore:indexes`
- After new composite queries fail in console, add the suggested index to the JSON and redeploy (do not rely on console-only indexes for durable envs).

## Firestore rules and indexes only

After confirming the active Firebase project with `firebase use`, deploy only the Firestore rules and index definitions with:

```bash
npm run deploy:firestore
```

This composes `firestore.rules` first, then deploys only `firestore:rules` and `firestore:indexes`. It does not deploy or modify Firestore documents, Hosting, Functions, or Storage. Rules deployment replaces the live ruleset, and the index file is the desired index configuration; check that it contains every index you need before deploying.

## Full deploy recipe

```bash
npm run compose:firestore-rules
npm run build
npm --prefix functions run build
firebase deploy --only "hosting,functions,firestore:rules,firestore:indexes,storage"
```

Or split targets for safer rollouts (hosting vs functions vs rules).

Storage rules: `storage.rules` (tenant paths — see [security-tenancy.md](./security-tenancy.md)).

## Verify helpers

```bash
npm run verify:firebase-env
npm run verify:firebase          # env + compose + rules deploy verification script
```

## Rollback

See [rollback.md](./rollback.md).
