#!/usr/bin/env node
/**
 * Create Firebase custom token using firebase-tools OAuth + IAM signBlob.
 * No service account JSON file required.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function loadFirebaseToolsToken() {
  const cfgPath = path.join(
    process.env.HOME || '',
    '.config/configstore/firebase-tools.json',
  );
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Run: firebase login');
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const access = cfg?.tokens?.access_token;
  if (!access) throw new Error('firebase-tools.json missing access_token');
  return access;
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createCustomToken(uid, accessToken, serviceAccountEmail) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({
      iss: serviceAccountEmail,
      sub: serviceAccountEmail,
      aud:
        'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      iat: now,
      exp: now + 3600,
      uid,
    }),
  );
  const unsigned = `${header}.${body}`;
  const signUrl = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccountEmail)}:signBlob`;
  const signRes = await fetch(signUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payload: Buffer.from(unsigned).toString('base64'),
    }),
  });
  if (!signRes.ok) {
    const errText = await signRes.text();
    throw new Error(`signBlob failed (${signRes.status}): ${errText.slice(0, 300)}`);
  }
  const { signedBlob } = await signRes.json();
  const signature = Buffer.from(signedBlob, 'base64')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${unsigned}.${signature}`;
}

async function resolveAdminServiceAccount(accessToken) {
  const res = await fetch(
    'https://iam.googleapis.com/v1/projects/sokany-production/serviceAccounts',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const accounts = data.accounts || [];
  const sa = accounts.find((a) => a.email?.includes('firebase-adminsdk'));
  if (!sa?.email) throw new Error('firebase-adminsdk service account not found');
  return sa.email;
}

const env = loadEnvLocal();
const projectId = env.VITE_FIREBASE_PROJECT_ID || 'sokany-production';
const uid = process.env.HANDOVER_UID || 'COrJrAlQjXXCyt3XrpLm6q8mPDi2';
const accessToken = loadFirebaseToolsToken();
const serviceAccountEmail = await resolveAdminServiceAccount(accessToken);
const token = await createCustomToken(uid, accessToken, serviceAccountEmail);

let tenantId = null;
let email = null;
let roleId = null;
try {
  const userRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (userRes.ok) {
    const doc = await userRes.json();
    const fields = doc.fields || {};
    tenantId = fields.tenantId?.stringValue || null;
    email = fields.email?.stringValue || null;
    roleId = fields.roleId?.stringValue || null;
  }
} catch {
  /* optional */
}

console.log(
  JSON.stringify({
    token,
    uid,
    tenantId,
    email,
    roleId,
    projectId,
    serviceAccountEmail,
  }),
);
