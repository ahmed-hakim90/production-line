# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
Arabic (RTL) multi-tenant Factory ERP. It is a **Vite + React 19 SPA** (repo root) whose "backend" is **Firebase** (Auth + Cloud Firestore + Cloud Functions + Storage/FCM). There is **no traditional backend server to start** — do not try to `docker compose up` or run an API server. The `functions/` folder is a separate npm package (Firebase Cloud Functions, Node 22 engine) that is deployed to Firebase, not run as a local server.

### Standard commands (defined in `package.json`)
- Dev server: `npm run dev` (Vite, serves on `http://localhost:3000`, host `0.0.0.0`).
- Build: `npm run build` (app) / `npm --prefix functions run build` (functions).
- Typecheck: `npm run typecheck` and `npm run typecheck:functions`.
- Tests: `npm run test:all` (runs every `tests/*.test.*` via `tsx`/node). Domain suites also exist: `test:manufacturing`, `test:inventory`, `test:categories`, `test:operations`, `test:foundation`.
- Firestore rules tests: `npm run test:rules`.
- Full CI gate: `npm run ci` (typecheck app+functions + arch checks + `test:all` + compose rules). See `.github/workflows/ci.yml`.

### Non-obvious gotchas
- **The app requires a live Firebase project to do anything past rendering.** Copy `.env.example` to `.env.local` and fill in `VITE_FIREBASE_*`. The client (`modules/auth/services/firebase.ts`) has **no emulator wiring** — it always points at real Firebase cloud. Without `VITE_FIREBASE_API_KEY`, `isConfigured` is `false`; the login/register UI still renders but every auth/data/Cloud-Function call fails. So login, company registration, and all CRUD/report flows are **blocked without real Firebase credentials** (provide them as `VITE_FIREBASE_*` secrets). The `firestore` emulator in `firebase.json` is used only by `npm run test:rules`, not by the running app.
- **`npm run test:rules`** needs Java (already installed) and downloads the Firestore emulator via `firebase-tools` on first run (needs network). The run prints many `PERMISSION_DENIED` / "maximum of 1000 expressions" lines — these are **expected negative-case assertions**; success is the final `Script exited successfully (code 0)`.
- **Tests run TypeScript on the fly via `npx --yes tsx`** (tsx is not a pinned dependency). The first invocation may fetch `tsx` from the network; it is cached afterward.
- **`functions/` pins Node 22** (Cloud Functions runtime). Typecheck/build work on the local Node version as long as it is ≥18.
- Lint/typecheck/test/build do **not** require Firebase credentials — only the running app does.
