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
- Add missing indexes with `npm run deploy:firestore` (or `npm run deploy:firestore -- --indexes-only`).
- Avoid direct `firebase deploy --only firestore:indexes` for production: the Firebase CLI treats the file as the desired complete index set and can remove live indexes missing from it.
- After new composite queries fail in console, add the suggested index to the JSON and redeploy (do not rely on console-only indexes for durable envs).

## Additive Firestore deployment

Use the guarded deploy command to create configured composite indexes that are
missing from the active project, without deleting any live indexes:

```bash
npm run deploy:firestore
```

The project defaults to the `default` project in `.firebaserc`; pass
`--project <project-id>` to target another project, or `--indexes-only` to leave
rules untouched. To preview missing indexes without creating them, use
`--dry-run`.

Firestore rules cannot be appended to an active ruleset. Deploying rules replaces
the complete active ruleset, so this command asks you to type the target project
ID before deploying the composed local `firestore.rules`. For non-interactive
use, pass `--confirm-rules` explicitly. Review and test the complete rules file
before confirming. The command does not deploy documents, Hosting, Functions,
Storage, or delete indexes.

## Full deploy recipe

```bash
npm run build
npm --prefix functions run build
npm run deploy:firestore
firebase deploy --only "hosting,functions,storage"
```

The guarded Firestore command adds missing indexes and requests explicit
confirmation before replacing rules. Deploy other targets separately as needed.

Storage rules: `storage.rules` (tenant paths — see [security-tenancy.md](./security-tenancy.md)).

## Verify helpers

```bash
npm run verify:firebase-env
npm run verify:firebase          # env + compose + rules deploy verification script
```

## Rollback

See [rollback.md](./rollback.md).
