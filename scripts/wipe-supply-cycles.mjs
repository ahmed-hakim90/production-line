#!/usr/bin/env node
/**
 * Wipe supply cycles (+ waste lines) for a tenant, and clear supplyCycleId on production reports.
 *
 * Usage:
 *   node scripts/wipe-supply-cycles.mjs --tenant <tenantId>           # dry-run
 *   node scripts/wipe-supply-cycles.mjs --tenant <tenantId> --apply  # execute
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const PROJECT_ID = 'sokany-production';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const tenantIdx = args.indexOf('--tenant');
const TENANT_ID = tenantIdx >= 0 ? String(args[tenantIdx + 1] || '').trim() : '';

if (!TENANT_ID) {
  console.error('Usage: node scripts/wipe-supply-cycles.mjs --tenant <tenantId> [--apply]');
  process.exit(1);
}

function loadAccessToken() {
  const cfg = JSON.parse(
    readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'),
  );
  if ((cfg.tokens?.expires_at || 0) - Date.now() < 60_000) {
    throw new Error('Firebase access token expired. Run: npx firebase login --reauth');
  }
  return cfg.tokens.access_token;
}

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

async function listCollection(token, collectionId) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`,
    );
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: authHeader(token) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`List ${collectionId} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    docs.push(...(json.documents || []));
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function fieldString(fields, key) {
  return fields?.[key]?.stringValue;
}

async function commitWrites(token, writes, label) {
  const chunkSize = 400;
  let done = 0;
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: {
          ...authHeader(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ writes: chunk }),
      },
    );
    if (!res.ok) {
      throw new Error(`${label} commit failed: ${res.status} ${await res.text()}`);
    }
    done += chunk.length;
    console.log(`  ${label}: ${done}/${writes.length}`);
  }
  return done;
}

async function main() {
  const token = loadAccessToken();
  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
  }, null, 2));

  const cycles = (await listCollection(token, 'supply_cycles'))
    .filter((d) => fieldString(d.fields, 'tenantId') === TENANT_ID);
  const waste = (await listCollection(token, 'supply_cycle_waste_lines'))
    .filter((d) => fieldString(d.fields, 'tenantId') === TENANT_ID);
  const reports = (await listCollection(token, 'production_reports'))
    .filter((d) => {
      if (fieldString(d.fields, 'tenantId') !== TENANT_ID) return false;
      const sc = fieldString(d.fields, 'supplyCycleId');
      return Boolean(sc && sc.trim());
    });

  console.log(`supply_cycles: ${cycles.length}`);
  for (const d of cycles) {
    console.log(`  - ${d.name.split('/').pop()} ${fieldString(d.fields, 'batchCode')} (${fieldString(d.fields, 'status')})`);
  }
  console.log(`supply_cycle_waste_lines: ${waste.length}`);
  console.log(`production_reports to unlink: ${reports.length}`);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to execute.');
    return;
  }

  console.log('\nDeleting waste lines...');
  await commitWrites(
    token,
    waste.map((d) => ({ delete: d.name })),
    'waste deletes',
  );

  console.log('Deleting supply cycles...');
  await commitWrites(
    token,
    cycles.map((d) => ({ delete: d.name })),
    'cycle deletes',
  );

  console.log('Clearing supplyCycleId on production reports...');
  // Field named in updateMask but absent from fields → deleted
  await commitWrites(
    token,
    reports.map((d) => ({
      update: { name: d.name, fields: {} },
      updateMask: { fieldPaths: ['supplyCycleId'] },
      currentDocument: { exists: true },
    })),
    'report unlinks',
  );

  console.log('\nDone.');
  console.log(JSON.stringify({
    deletedCycles: cycles.length,
    deletedWasteLines: waste.length,
    unlinkedReports: reports.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
