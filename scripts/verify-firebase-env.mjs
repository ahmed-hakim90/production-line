/**
 * Confirms VITE_FIREBASE_PROJECT_ID in .env.local matches .firebaserc default project.
 * Run from repo root: node scripts/verify-firebase-env.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const firebasercPath = resolve(root, '.firebaserc');
const envLocalPath = resolve(root, '.env.local');

function readDefaultProject() {
  const raw = readFileSync(firebasercPath, 'utf8');
  const j = JSON.parse(raw);
  const id = j?.projects?.default;
  if (!id || typeof id !== 'string') {
    throw new Error('.firebaserc: missing projects.default');
  }
  return id;
}

function readViteProjectId() {
  if (!existsSync(envLocalPath)) {
    return { present: false, value: null };
  }
  const text = readFileSync(envLocalPath, 'utf8');
  const m = text.match(/^\s*VITE_FIREBASE_PROJECT_ID\s*=\s*(\S+)/m);
  if (!m) {
    return { present: true, value: null };
  }
  const value = m[1].replace(/^["']|["']$/g, '').trim();
  return { present: true, value: value || null };
}

const defaultProject = readDefaultProject();
const vite = readViteProjectId();

console.log(`[verify-firebase-env] .firebaserc default project: ${defaultProject}`);

if (!vite.present) {
  console.warn(
    '[verify-firebase-env] No .env.local found. Copy .env.example → .env.local and set VITE_FIREBASE_PROJECT_ID.',
  );
  process.exitCode = 0;
  process.exit();
}

if (!vite.value) {
  console.error(
    '[verify-firebase-env] .env.local exists but VITE_FIREBASE_PROJECT_ID is missing or empty.',
  );
  process.exitCode = 1;
  process.exit();
}

if (vite.value !== defaultProject) {
  console.error(
    `[verify-firebase-env] MISMATCH: VITE_FIREBASE_PROJECT_ID="${vite.value}" but .firebaserc default="${defaultProject}".`,
  );
  console.error(
    '[verify-firebase-env] The web app must use the same Firebase project as CLI deploys or you will see Auth/Firestore permission issues.',
  );
  process.exitCode = 1;
  process.exit();
}

console.log(`[verify-firebase-env] OK: VITE_FIREBASE_PROJECT_ID matches .firebaserc (${defaultProject}).`);
