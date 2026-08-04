# Quality Gates

Automated checks that protect refactors and releases. Prefer the discovery runner (`test:all`) over hand-maintained suite lists so orphan `tests/*.test.ts` files are not skipped.

## Local commands

| Script | What it does | When to run |
|--------|----------------|-------------|
| `npm run typecheck` | App TypeScript (`tsc --noEmit`) | Before every PR; part of `ci` |
| `npm run typecheck:functions` | Cloud Functions TypeScript | Before every PR; part of `ci` |
| `npm run arch:check:legacy-imports` | Forbids deprecated `services/*` imports and page-level Firestore writes | Before architecture/migration PRs |
| `npm run test:foundation` | Tenant context, usecase helpers, portal home | Quick smoke after auth/tenant changes |
| `npm run arch:verify` | `typecheck` + legacy-imports + foundation | Local architecture gate |
| `npm run test:all` | Discovers and runs all `tests/*.test.ts` (and non-emulator `.mjs`) | Before merge; catches orphan suites |
| `npm run test:smoke-navigation` | Tenant path / chunk-recovery helpers | After navigation or white-screen fixes |
| `npm run compose:firestore-rules` | Rebuilds `firestore.rules` from fragments | After editing rules fragments; part of local `ci` |
| `npm run test:rules` | Compose rules + Firestore emulator unit tests | After rules/security changes |
| `npm run ci` | typecheck → functions typecheck → arch:verify → test:all → compose rules | Full local gate **without** emulator |

### Emulator note

`npm run ci` does **not** run `test:rules` (Firestore emulator is heavy/slow). Run `npm run test:rules` separately when touching security rules.

`scripts/run-all-tests.mjs` **skips** `tests/firestore.rules.test.mjs` for the same reason. List discovery with:

```bash
node scripts/run-all-tests.mjs --list
```

GitHub Actions workflows are **not** used for this repo. Run `npm run ci` (and `npm run test:rules` when needed) locally before merge.

## Failure triage

1. **Typecheck** — fix TS errors in app or `functions/`; do not weaken `tsconfig` to green the gate.
2. **Legacy imports** — move writes/imports to module services/usecases; see `scripts/check-legacy-imports.mjs`.
3. **Foundation / unit fail** — reproduce with the single file (`npx tsx tests/<name>.test.ts`) or `npm run test:all`.
4. **Rules fail** — ensure emulator host is set via `npm run test:rules`; check tenant isolation assertions in `tests/firestore.rules.test.mjs`.
5. **Orphan test not in package.json** — still must pass under `test:all`; add focused npm scripts only when useful for local iteration.

## Design rules

- Business suites live under `tests/` as `*.test.ts` (or `*.test.mjs`).
- Do not rely solely on `package.json` script chains (`test:inventory`, etc.) for CI completeness.
- Assert helpers (`tests/assertHarness.ts`) are not suites and are excluded from discovery.
- Server authorization and tenant isolation remain the security source of truth; client tests are regression guards only.
