#!/usr/bin/env node
/**
 * Tenant operational readiness report (Firestore via firebase-tools OAuth).
 * Usage: npm run handover:readiness
 * Env: HANDOVER_TENANT_SLUG, FIREBASE_PROJECT_ID (optional)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

function loadFirebaseToken() {
  const cfgPath = path.join(process.env.HOME || '', '.config/configstore/firebase-tools.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Run: firebase login');
  const token = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))?.tokens?.access_token;
  if (!token) throw new Error('firebase-tools.json missing access_token');
  return token;
}

function loadHandoverTenant() {
  const credPath = path.join(ROOT, 'docs/handover/.credentials');
  const examplePath = path.join(ROOT, 'docs/handover/.credentials.example');
  const file = fs.existsSync(credPath) ? credPath : examplePath;
  const parsed = loadEnvFile(file);
  return process.env.HANDOVER_TENANT_SLUG || parsed.HANDOVER_TENANT_SLUG || 'sokany-eg';
}

async function getTenantSlugDoc(projectId, token, slug) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/tenant_slugs/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Firestore auth failed (${res.status}). Run: firebase login — then npm run handover:readiness`,
    );
  }
  if (!res.ok) throw new Error(`tenant_slugs/${slug}: ${res.status}`);
  const doc = await res.json();
  return doc.fields ?? null;
}

async function firestoreQuery(projectId, token, structuredQuery) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Firestore query failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return res.json();
}

function fieldString(fields, key) {
  return fields?.[key]?.stringValue ?? '';
}

function countFromQuery(rows) {
  return rows.filter((r) => r.document).length;
}

async function resolveTenantId(projectId, token, slug) {
  const fields = await getTenantSlugDoc(projectId, token, slug);
  if (!fields) return null;
  return fieldString(fields, 'tenantId');
}

async function getSystemSettings(projectId, token, tenantId) {
  const rows = await firestoreQuery(projectId, token, {
    from: [{ collectionId: 'system_settings' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'tenantId' },
        op: 'EQUAL',
        value: { stringValue: tenantId },
      },
    },
    limit: 1,
  });
  const doc = rows.find((r) => r.document)?.document;
  return doc?.fields ?? null;
}

function extractRouting(fields) {
  const plan = fields?.planSettings?.mapValue?.fields ?? {};
  const routing = plan?.inventoryRouting?.mapValue?.fields ?? {};
  const s = (k) => routing[k]?.stringValue?.trim() || plan[k]?.stringValue?.trim() || '';
  return {
    productionWipWarehouseId: s('productionWipWarehouseId') || plan.defaultProductionWarehouseId?.stringValue || '',
    finishedStagingWarehouseId:
      s('finishedStagingWarehouseId') || plan.finishedReceiveWarehouseId?.stringValue || '',
    finalProductWarehouseId: s('finalProductWarehouseId') || plan.finalProductWarehouseId?.stringValue || '',
    rawMaterialWarehouseId: s('rawMaterialWarehouseId') || plan.rawMaterialWarehouseId?.stringValue || '',
  };
}

async function countCollection(projectId, token, collectionId, tenantId) {
  const rows = await firestoreQuery(projectId, token, {
    from: [{ collectionId }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'tenantId' },
        op: 'EQUAL',
        value: { stringValue: tenantId },
      },
    },
    limit: 500,
  });
  return countFromQuery(rows);
}

async function countMaterialsWithCost(projectId, token, tenantId) {
  const rows = await firestoreQuery(projectId, token, {
    from: [{ collectionId: 'materials' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'tenantId' },
        op: 'EQUAL',
        value: { stringValue: tenantId },
      },
    },
    limit: 500,
  });
  let withCost = 0;
  let total = 0;
  for (const row of rows) {
    if (!row.document) continue;
    total += 1;
    const f = row.document.fields;
    const cost =
      Number(f?.purchaseCost?.doubleValue ?? f?.purchaseCost?.integerValue ?? 0) ||
      Number(f?.unitCost?.doubleValue ?? 0);
    if (cost > 0) withCost += 1;
  }
  return { total, withCost };
}

function printCheck(id, ok, label, detail = '') {
  const mark = ok ? '✓' : '✗';
  const extra = detail ? ` — ${detail}` : '';
  console.log(`  ${mark} ${id}: ${label}${extra}`);
}

async function main() {
  const env = loadEnvFile(path.join(ROOT, '.env.local'));
  const projectId = process.env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || 'sokany-production';
  const slug = loadHandoverTenant();
  const token = loadFirebaseToken();

  console.log(`\nTenant readiness: ${slug} (${projectId})\n`);

  const tenantId = await resolveTenantId(projectId, token, slug);
  if (!tenantId) {
    console.error(`Tenant slug "${slug}" not found in tenant_slugs.`);
    process.exit(1);
  }
  printCheck('T0', true, 'Tenant resolved', tenantId);

  const settingsFields = await getSystemSettings(projectId, token, tenantId);
  const routing = settingsFields ? extractRouting(settingsFields) : {};
  const routingWipOk = Boolean(routing.productionWipWarehouseId && routing.finishedStagingWarehouseId);
  printCheck('A3', routingWipOk, 'Inventory routing WIP + finished staging', routingWipOk ? 'OK' : 'Incomplete');

  const warehouses = await countCollection(projectId, token, 'warehouses', tenantId);
  printCheck('A1', warehouses >= 3, 'Warehouses (>=3)', String(warehouses));

  const materials = await countMaterialsWithCost(projectId, token, tenantId);
  printCheck('B1', materials.total > 0, 'Manufacturing materials', String(materials.total));
  printCheck(
    'C1',
    materials.total === 0 || materials.withCost > 0,
    'Materials with purchase cost',
    `${materials.withCost}/${materials.total}`,
  );

  const boms = await countCollection(projectId, token, 'boms', tenantId);
  printCheck('B2', boms > 0, 'BOM records', String(boms));

  const lines = await countCollection(projectId, token, 'production_lines', tenantId);
  printCheck('D1', lines > 0, 'Production lines', String(lines));

  const costCenters = await countCollection(projectId, token, 'cost_centers', tenantId);
  printCheck('E1', costCenters > 0, 'Cost centers', String(costCenters));

  const checks = [routingWipOk, warehouses >= 3, materials.total > 0, boms > 0, lines > 0, costCenters > 0];
  const score = checks.filter(Boolean).length;
  const pct = Math.round((score / checks.length) * 100);
  console.log(`\nReadiness score: ${score}/${checks.length} (${pct}%)`);
  console.log('See docs/handover/TENANT_READINESS_CHECKLIST.md for manual steps.\n');

  process.exit(pct >= 80 ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
