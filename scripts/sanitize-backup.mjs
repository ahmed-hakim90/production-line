#!/usr/bin/env node
/**
 * Sanitize a Firestore backup JSON (BackupFile v2.x) for demo/training.
 * See package.json script "backup:sanitize".
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

path.dirname(fileURLToPath(import.meta.url));

const BACKUP_VERSION_MAJOR = '2';

const PERSON_COLLECTIONS = new Set([
  'employees',
  'users',
  'supervisors',
]);

const TEXT_KEYS = new Set([
  'email',
  'phone',
  'mobile',
  'nationalId',
  'national_id',
  'address',
  'displayName',
  'fullName',
  'employeeName',
  'title',
  'description',
  'notes',
  'message',
  'details',
  'comment',
  'reason',
  'fileName',
  'materialName',
  'warehouseName',
  'supplierName',
  'customerName',
  'companyName',
  'createdBy',
]);

const FINANCIAL_KEYS = new Set([
  'baseSalary',
  'hourlyRate',
  'sellingPrice',
  'chineseUnitCost',
  'innerBoxCost',
  'outerCartonCost',
  'openingBalance',
  'unitCost',
  'quantityUsed',
  'amount',
  'total',
  'balance',
  'price',
  'cost',
  'value',
  'salary',
  'bonus',
  'deduction',
]);

function parseArgs(argv) {
  const out = {
    input: null,
    output: null,
    perCollectionCap: 5,
    demoTenantId: 'demoTenant0001',
    numberObfuscation: true,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--input' || a === '-i') {
      out.input = next;
      i++;
    } else if (a === '--output' || a === '-o') {
      out.output = next;
      i++;
    } else if (a === '--per-collection-cap' || a === '--cap') {
      out.perCollectionCap = Math.max(0, parseInt(next, 10) || 0);
      i++;
    } else if (a === '--demo-tenant-id') {
      out.demoTenantId = next;
      i++;
    } else if (a === '--no-number-obfuscation') {
      out.numberObfuscation = false;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function hashString(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function shortId(seed) {
  const h = hashString(seed);
  return (h % 100000).toString().padStart(5, '0');
}

function dummyEmail(seed) {
  return `demo-${shortId(seed)}@demo.local`;
}

function dummyPhone(seed) {
  const h = hashString(seed + 'p');
  return `01${(h % 900000000 + 100000000).toString()}`;
}

function dummyNamePerson(seed) {
  return `موظف تجريبي ${shortId(seed)}`;
}

function dummyNameProduct(seed) {
  return `منتج تجريبي ${shortId(seed)}`;
}

function dummyModel(seed) {
  return `موديل ${shortId(seed)}`;
}

function dummyText(key, seed) {
  const h = hashString(seed + key);
  return `[تجريبي ${key} #${h % 100000}]`;
}

function obfuscateNumber(n, key) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  const mix = 0.65 + (hashString(key) % 35) / 100;
  const rounded = Math.round(n * mix * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function sanitizeValue(value, key, docSeed, opts, collectionName) {
  const seed = docSeed || 'doc';

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (key === 'tenantId') return opts.demoTenantId;
    if (!value) return value;

    if (key === 'email') return dummyEmail(seed);
    if (key === 'phone' || key === 'mobile') return dummyPhone(seed);
    if (
      key === 'displayName' ||
      key === 'fullName' ||
      key === 'employeeName'
    ) {
      return dummyNamePerson(seed);
    }
    if (key === 'name') {
      if (collectionName === 'products' || collectionName === 'raw_materials') {
        return dummyNameProduct(seed);
      }
      if (PERSON_COLLECTIONS.has(collectionName)) {
        return dummyNamePerson(seed);
      }
      return dummyNameProduct(seed);
    }
    if (key === 'model') {
      return dummyModel(seed);
    }
    if (key === 'materialName') {
      return dummyNameProduct(seed);
    }
    if (TEXT_KEYS.has(key)) {
      return dummyText(key, seed);
    }
    return value;
  }

  if (typeof value === 'number') {
    if (opts.numberObfuscation !== false && FINANCIAL_KEYS.has(key)) {
      return obfuscateNumber(value, key);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, idx) =>
      sanitizeNode(item, collectionName, `${seed}:${idx}`, opts)
    );
  }

  if (typeof value === 'object') {
    if (value.type === 'firestore/timestamp/1.0') {
      return { ...value };
    }
    return sanitizeNode(value, collectionName, seed, opts);
  }

  return value;
}

function sanitizeNode(obj, collectionName, docSeed, opts) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item, idx) => {
      const childSeed =
        item && typeof item === 'object' && item._docId
          ? item._docId
          : item && typeof item === 'object' && item._path
            ? item._path
            : `${docSeed}:${idx}`;
      return sanitizeNode(item, collectionName, childSeed, opts);
    });
  }

  const out = {};
  const seed = obj._docId || obj._path || docSeed;

  for (const [k, v] of Object.entries(obj)) {
    if (k === '_docId' || k === '_path') {
      out[k] = v;
      continue;
    }
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (v.type === 'firestore/timestamp/1.0') {
        out[k] = { ...v };
        continue;
      }
      out[k] = sanitizeNode(v, collectionName, seed, opts);
      continue;
    }
    out[k] = sanitizeValue(v, k, seed, opts, collectionName);
  }
  return out;
}

function applyCollectionCap(data, cap) {
  if (!cap || cap <= 0) return data;

  if (data.collections && typeof data.collections === 'object') {
    for (const name of Object.keys(data.collections)) {
      const arr = data.collections[name];
      if (Array.isArray(arr) && arr.length > cap) {
        data.collections[name] = arr.slice(0, cap);
      }
    }
  }

  if (data.collectionGroups && typeof data.collectionGroups === 'object') {
    for (const name of Object.keys(data.collectionGroups)) {
      const arr = data.collectionGroups[name];
      if (Array.isArray(arr) && arr.length > cap) {
        data.collectionGroups[name] = arr.slice(0, cap);
      }
    }
  }
  return data;
}

function refreshMetadataCounts(data) {
  const documentCounts = { ...(data.metadata.documentCounts || {}) };
  let total = 0;

  if (data.collections) {
    for (const [name, arr] of Object.entries(data.collections)) {
      const n = Array.isArray(arr) ? arr.length : 0;
      documentCounts[name] = n;
      total += n;
    }
  }

  if (data.collectionGroups) {
    for (const [name, arr] of Object.entries(data.collectionGroups)) {
      const n = Array.isArray(arr) ? arr.length : 0;
      documentCounts[`group:${name}`] = n;
      total += n;
    }
  }

  data.metadata.documentCounts = documentCounts;
  data.metadata.totalDocuments = total;
}

function validateBackupShape(data) {
  if (!data?.metadata?.version) {
    return { valid: false, error: 'Missing metadata.version' };
  }
  const major = String(data.metadata.version).split('.')[0];
  if (major !== BACKUP_VERSION_MAJOR) {
    return {
      valid: false,
      error: `Version major must be ${BACKUP_VERSION_MAJOR}, got ${major}`,
    };
  }
  if (!data.collections || typeof data.collections !== 'object') {
    return { valid: false, error: 'Missing collections' };
  }
  return { valid: true };
}

function printHelp() {
  console.log(`
sanitize-backup.mjs — demo sanitizer for ERP BackupFile JSON

  --input, -i <path>     Input backup JSON
  --output, -o <path>    Output JSON (demo)
  --per-collection-cap, --cap <n>  Max docs per collection (default 5, 0 = unlimited)
  --demo-tenant-id <id>  Replace all tenantId values (default demoTenant0001)
  --no-number-obfuscation
  --help, -h

Example:
  node --max-old-space-size=8192 scripts/sanitize-backup.mjs -i backup_full.json -o backup_full.demo.json
`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.input || !args.output) {
    console.error('Error: --input and --output are required.');
    printHelp();
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading: ${inputPath}`);
  const raw = fs.readFileSync(inputPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Error: invalid JSON', e.message);
    process.exit(1);
  }

  const v = validateBackupShape(data);
  if (!v.valid) {
    console.error('Error:', v.error);
    process.exit(1);
  }

  const opts = {
    demoTenantId: args.demoTenantId,
    numberObfuscation: args.numberObfuscation,
  };

  applyCollectionCap(data, args.perCollectionCap);

  data.metadata = {
    ...data.metadata,
    createdAt: new Date().toISOString(),
    createdBy: 'demo@demo.local',
  };

  const sanitizedCollections = {};
  for (const [name, arr] of Object.entries(data.collections)) {
    sanitizedCollections[name] = Array.isArray(arr)
      ? arr.map((doc) => sanitizeNode(doc, name, doc?._docId || name, opts))
      : arr;
  }
  data.collections = sanitizedCollections;

  if (data.collectionGroups && typeof data.collectionGroups === 'object') {
    const cg = {};
    for (const [name, arr] of Object.entries(data.collectionGroups)) {
      cg[name] = Array.isArray(arr)
        ? arr.map((doc) => sanitizeNode(doc, name, doc?._path || name, opts))
        : arr;
    }
    data.collectionGroups = cg;
  }

  refreshMetadataCounts(data);

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Wrote: ${outputPath}`);
  console.log(
    `totalDocuments: ${data.metadata.totalDocuments}, cap: ${args.perCollectionCap || 'none'}`
  );
}

main();