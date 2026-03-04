# AGENTS.md

## Cursor Cloud specific instructions

### Overview

HAKIMO is a React 19 + Vite SPA for factory production management. It uses Firebase (Auth, Firestore, Storage) as its entire backend — there is no custom server. The UI is Arabic RTL.

### Running the app

- `npm run dev` starts the Vite dev server on port 3000 (host `0.0.0.0`).
- Firebase credentials are required in `.env.local` (see `.env.example`). Without them the app still loads the login page but all Firebase operations fail gracefully.

### Build & type-checking

- `npm run build` — Vite production build (uses esbuild; succeeds even with TS strict errors).
- `npx tsc --noEmit` — TypeScript type-checking. The codebase has pre-existing type errors; this is not a gate for shipping.
- There is **no ESLint** configuration and **no automated test framework** in this repo. No `lint` or `test` npm scripts exist.

### Firebase Cloud Functions

The `functions/` directory contains a small Cloud Functions project (`aggregateProductionReports`). It has its own `package.json` and requires a separate `npm install` inside `functions/`. It is optional for local development.

### Key caveats

- The app uses `HashRouter` — all client routes are under `/#/`.
- PWA service worker is configured via `vite-plugin-pwa`; in dev mode the SW is not active.
- Tailwind CSS is loaded via CDN in `index.html`, not via PostCSS (despite `tailwindcss` being in devDependencies).
