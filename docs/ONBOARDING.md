# Onboarding — Day 1 / إعداد اليوم الأول

Short bilingual setup. Canonical commands and env names match the root `README.md`.

إعداد مختصر ثنائي اللغة. الأوامر وأسماء المتغيرات تطابق `README.md` في جذر المستودع.

## Prerequisites / المتطلبات

- **Node.js 20+** (Cloud Functions engine is Node 20)
- npm (comes with Node)
- Firebase CLI when deploying (`firebase-tools`)
- Access to a Firebase project with Auth (Email/Password), Firestore, Storage, Functions

## Clone & install / التثبيت

```bash
npm install
npm --prefix functions install
```

## Environment / المتغيرات

Create `.env.local` in the repo root (see also `.env.example`):

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_VAPID_KEY=your_web_push_vapid_key
# Optional full Web Push public key (~87 chars). Invalid/truncated keys cause FCM 401; unset = Firebase default.
```

لا تضع أسراراً حقيقية في Git. Never commit real secrets.

Optional: `VITE_DEFAULT_TENANT_SLUG` for preferred tenant home when no last-visited slug exists (`lib/tenantPaths.ts`).

Verify:

```bash
npm run verify:firebase-env
```

## Everyday scripts / أوامر يومية

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production web build → `dist/` |
| `npm run typecheck` | App TypeScript |
| `npm run typecheck:functions` | Functions TypeScript |
| `npm run arch:check:legacy-imports` | Block legacy imports + page Firestore writes |
| `npm run arch:verify` | typecheck + legacy imports + `test:foundation` |
| `npm run compose:firestore-rules` | Compose `firestore.rules` from fragments |
| `npm --prefix functions run build` | Compile `functions/src` → `functions/lib` |

See [testing.md](./testing.md) and [deployment.md](./deployment.md).

## First run / أول تشغيل

1. Enable **Authentication → Email/Password** in Firebase Console.
2. Deploy or sync rules when ready (`firestore.rules`, `storage.rules`) — prefer composed rules via `compose:firestore-rules` before deploy.
3. `npm run dev` → open the app → create account (or use existing).
4. Tenant URLs look like `/t/:tenantSlug/...` (see [routing-and-navigation.md](./routing-and-navigation.md)).

## Smoke paths / مسارات دخان مقترحة

After login on a real or emulator-backed project:

1. **Auth gate** — unauthenticated user redirects to login; active session restores.
2. **Tenant home** — `/t/<slug>` resolves; wrong-tenant users are blocked (non–super-admin).
3. **Reports list** — `/reports` (or tenant-prefixed equivalent) loads with permission.
4. **Inventory** — warehouses / stock balances list tenant-scoped empty or local data only.
5. **Settings** — system settings load via `system_settings/{tenantId}` after `resolveSystemSettings`.
6. **Architecture gate** — `npm run arch:verify` passes on a clean tree.

Manual isolation checklist: [TENANT_ISOLATION_CHECKLIST.md](./TENANT_ISOLATION_CHECKLIST.md).

## Where to read next / ماذا بعد

1. [ARCHITECTURE/overview.md](./ARCHITECTURE/overview.md)
2. [ARCHITECTURE/dependency-rules.md](./ARCHITECTURE/dependency-rules.md)
3. [security-tenancy.md](./security-tenancy.md)
4. [settings-contract.md](./settings-contract.md)
