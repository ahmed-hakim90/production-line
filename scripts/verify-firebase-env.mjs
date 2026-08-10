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

function readViteVapidKey() {
  const text = readFileSync(envLocalPath, 'utf8');
  const m = text.match(/^\s*VITE_FIREBASE_VAPID_KEY\s*=\s*(\S+)/m);
  if (!m) return { present: false, value: null };
  const value = m[1].replace(/^["']|["']$/g, '').trim();
  return { present: true, value: value || null };
}

function isValidWebPushPublicKey(key) {
  if (!key || !/^[A-Za-z0-9_-]{80,100}$/.test(key)) return false;
  try {
    const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (normalized.length % 4)) % 4);
    const bytes = Buffer.from(`${normalized}${pad}`, 'base64');
    return bytes.length === 65 && bytes[0] === 0x04;
  } catch {
    return false;
  }
}

const vapid = readViteVapidKey();
if (!vapid.present || !vapid.value) {
  console.warn(
    '[verify-firebase-env] VITE_FIREBASE_VAPID_KEY is unset. Web push will use Firebase default key. Optional: generate a Web Push certificate in Firebase Console → Cloud Messaging.',
  );
} else if (!isValidWebPushPublicKey(vapid.value)) {
  console.error(
    '[verify-firebase-env] VITE_FIREBASE_VAPID_KEY is present but invalid (expected ~87-char base64url P-256 public key, 65 bytes starting with 0x04).',
  );
  console.error(
    '[verify-firebase-env] Invalid keys cause FCM registration 401. Clear the value or paste the public key from Firebase Console → Project settings → Cloud Messaging → Web Push certificates.',
  );
  process.exitCode = 1;
  process.exit();
} else {
  console.log('[verify-firebase-env] OK: VITE_FIREBASE_VAPID_KEY looks like a Web Push public key.');
}