#!/usr/bin/env node
/**
 * Wipe inventory ledger/history for a tenant, keep shelf balances, rebuild warehouse balances.
 *
 * Usage:
 *   node scripts/wipe-inventory-keep-shelf-balances.mjs --tenant <tenantId>           # dry-run
 *   node scripts/wipe-inventory-keep-shelf-balances.mjs --tenant <tenantId> --apply  # execute
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
  console.error('Usage: node scripts/wipe-inventory-keep-shelf-balances.mjs --tenant <tenantId> [--apply]');
  process.exit(1);
}

const DELETE_COLLECTIONS = [
  'stock_transactions',
  'inventory_transfer_requests',
  'production_issue_orders',
  'stock_counts',
  'production_handover_receipts',
  'department_consumable_issues',
  'disassembly_orders',
  'component_return_records',
  'component_compensation_records',
  'supplies_receipt_orders',
  'supplies_receipts',
  'inventory_exceptions',
  'stock_daily_summaries',
  'stock_period_summaries',
  'stock_items', // rebuilt from shelf balances
];

const KEEP_COLLECTIONS = [
  'stock_location_balances',
  'warehouses',
  'warehouse_locations',
  'warehouse_racks',
  'default_item_locations',
  'inventory_counters', // reset after wipe
];

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

function fieldNumber(fields, key) {
  const f = fields?.[key];
  if (!f) return 0;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return Number(f.doubleValue);
  return 0;
}

function docIdFromName(name) {
  return String(name || '').split('/').pop();
}

async function commitDeletes(token, docNames) {
  // Firestore commit max 500 writes
  const chunkSize = 400;
  let deleted = 0;
  for (let i = 0; i < docNames.length; i += chunkSize) {
    const chunk = docNames.slice(i, i + chunkSize);
    const body = {
      writes: chunk.map((name) => ({ delete: name })),
    };
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
      {
        method: 'POST',
        headers: {
          ...authHeader(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(`Delete commit failed: ${res.status} ${await res.text()}`);
    }
    deleted += chunk.length;
    console.log(`  deleted ${deleted}/${docNames.length}`);
  }
  return deleted;
}

async function commitSets(token, writes) {
  const chunkSize = 200;
  let written = 0;
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
      throw new Error(`Set commit failed: ${res.status} ${await res.text()}`);
    }
    written += chunk.length;
    console.log(`  wrote ${written}/${writes.length}`);
  }
  return written;
}

function strField(v) {
  return { stringValue: String(v ?? '') };
}
function numField(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n };
}

function balanceDocId(warehouseId, itemType, itemId) {
  return `${warehouseId}__${itemType}__${itemId}`;
}

async function main() {
  const token = loadAccessToken();
  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    projectId: PROJECT_ID,
    tenantId: TENANT_ID,
    keep: KEEP_COLLECTIONS,
    delete: DELETE_COLLECTIONS,
  }, null, 2));

  const toDeleteByCollection = {};
  let totalDelete = 0;

  for (const coll of DELETE_COLLECTIONS) {
    const docs = await listCollection(token, coll);
    const tenantDocs = docs.filter((d) => fieldString(d.fields, 'tenantId') === TENANT_ID);
    // Some legacy docs may miss tenantId — only for this single-tenant inventory dump we also
    // include docs without tenantId if ALL inventory data is for this tenant.
    // Safer: only delete tenant-scoped docs. If a collection has unscoped docs, report them.
    const unscoped = docs.filter((d) => !fieldString(d.fields, 'tenantId'));
    toDeleteByCollection[coll] = {
      matched: tenantDocs.map((d) => d.name),
      unscopedCount: unscoped.length,
      totalInCollection: docs.length,
    };
    totalDelete += tenantDocs.length;
    console.log(
      `${coll}: delete ${tenantDocs.length}/${docs.length}`
      + (unscoped.length ? ` (unscoped skipped: ${unscoped.length})` : ''),
    );
  }

  const shelfDocs = (await listCollection(token, 'stock_location_balances'))
    .filter((d) => fieldString(d.fields, 'tenantId') === TENANT_ID);
  console.log(`stock_location_balances KEEP: ${shelfDocs.length}`);

  // Aggregate warehouse balances from shelf balances
  const agg = new Map();
  for (const doc of shelfDocs) {
    const f = doc.fields || {};
    const warehouseId = fieldString(f, 'warehouseId');
    const itemType = fieldString(f, 'itemType') || 'material';
    const itemId = fieldString(f, 'itemId');
    if (!warehouseId || !itemId) continue;
    const key = balanceDocId(warehouseId, itemType, itemId);
    const prev = agg.get(key) || {
      warehouseId,
      itemType,
      itemId,
      itemName: fieldString(f, 'itemName') || itemId,
      itemCode: fieldString(f, 'itemCode') || '',
      unit: fieldString(f, 'unit') || 'unit',
      quantity: 0,
      minStock: fieldNumber(f, 'minStock'),
    };
    prev.quantity += fieldNumber(f, 'quantity');
    if (!prev.itemName && fieldString(f, 'itemName')) prev.itemName = fieldString(f, 'itemName');
    if (!prev.itemCode && fieldString(f, 'itemCode')) prev.itemCode = fieldString(f, 'itemCode');
    if (!prev.unit && fieldString(f, 'unit')) prev.unit = fieldString(f, 'unit');
    agg.set(key, prev);
  }

  const rebuildBalances = [...agg.values()].filter((row) => Math.abs(row.quantity) > 0.000001);
  console.log(`stock_items REBUILD from shelves: ${rebuildBalances.length} non-zero lines`);
  console.log(`TOTAL docs to delete: ${totalDelete}`);

  if (!apply) {
    console.log('\nDry-run only. Re-run with --apply to execute.');
    return;
  }

  console.log('\nApplying deletes...');
  for (const coll of DELETE_COLLECTIONS) {
    const names = toDeleteByCollection[coll].matched;
    if (!names.length) continue;
    console.log(`Deleting ${coll} (${names.length})...`);
    await commitDeletes(token, names);
  }

  console.log('\nRebuilding stock_items from shelf balances...');
  const now = new Date().toISOString();
  const writes = rebuildBalances.map((row) => {
    const id = balanceDocId(row.warehouseId, row.itemType, row.itemId);
    return {
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/stock_items/${id}`,
        fields: {
          warehouseId: strField(row.warehouseId),
          itemType: strField(row.itemType),
          itemId: strField(row.itemId),
          itemName: strField(row.itemName),
          itemCode: strField(row.itemCode),
          unit: strField(row.unit),
          quantity: numField(row.quantity),
          minStock: numField(row.minStock),
          updatedAt: strField(now),
          tenantId: strField(TENANT_ID),
          rebuiltFromShelfBalancesAt: strField(now),
        },
      },
    };
  });
  if (writes.length) await commitSets(token, writes);

  // Reset inventory counters for clean INV sequence
  console.log('Resetting inventory_counters...');
  await commitSets(token, [{
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/inventory_counters/${TENANT_ID}`,
      fields: {
        tenantId: strField(TENANT_ID),
        lastInvSeq: { integerValue: '0' },
        lastProductionIssueSeq: { integerValue: '0' },
        updatedAt: strField(now),
        resetReason: strField('wipe-inventory-keep-shelf-balances'),
      },
    },
  }]);

  console.log('\nDone.');
  console.log(JSON.stringify({
    deleted: totalDelete,
    keptShelfBalances: shelfDocs.length,
    rebuiltStockItems: rebuildBalances.length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
