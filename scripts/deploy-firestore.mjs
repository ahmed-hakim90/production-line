import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadFirebaseToolsAccessToken } from './lib/firestoreRestAdmin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIREBASE_CONFIG_PATH = resolve(ROOT, '.firebaserc');
const INDEXES_PATH = resolve(ROOT, 'firestore.indexes.json');
const FIRESTORE_DATABASE = '(default)';
const MAX_INDEX_CREATION_CONCURRENCY = 5;

function parseArgs(args) {
  const options = { projectId: '', indexesOnly: false, dryRun: false, confirmRules: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--project') {
      options.projectId = args[i + 1] || '';
      if (!options.projectId) throw new Error('--project requires a project ID');
      i += 1;
    } else if (arg === '--indexes-only') {
      options.indexesOnly = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--confirm-rules') {
      options.confirmRules = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.projectId && !/^[A-Za-z0-9][A-Za-z0-9:._-]*$/.test(options.projectId)) {
    throw new Error(`Invalid Firebase project ID: ${options.projectId}`);
  }
  if (options.dryRun && options.confirmRules) {
    throw new Error('--dry-run cannot be combined with --confirm-rules');
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/deploy-firestore.mjs [options]

Creates missing composite indexes without deleting live indexes. Rules are
deployed only after explicitly confirming that the full local ruleset should
replace the active ruleset.

Options:
  --project <project-id>  Firebase project (defaults to .firebaserc default)
  --indexes-only          Create missing indexes; do not deploy rules
  --dry-run               List missing indexes without creating them
  --confirm-rules         Explicitly authorize full ruleset replacement
  --help                  Show this help`);
}

async function getProjectId(override) {
  if (override) return override;
  const config = JSON.parse(await readFile(FIREBASE_CONFIG_PATH, 'utf8'));
  const projectId = config.projects?.default;
  if (!projectId) {
    throw new Error('No default project is configured in .firebaserc; pass --project <project-id>');
  }
  return projectId;
}

function indexSignature(index) {
  const fields = (index.fields || [])
    .filter((field) => field.fieldPath !== '__name__')
    .map((field) => ({
      fieldPath: field.fieldPath,
      order: field.order || '',
      arrayConfig: field.arrayConfig || '',
    }));
  return JSON.stringify({ queryScope: index.queryScope || '', fields });
}

export function getMissingIndexes(configuredIndexes, liveIndexes) {
  const live = new Set(liveIndexes.map(indexSignature));
  const seen = new Set();
  return configuredIndexes.filter((index) => {
    const signature = indexSignature(index);
    if (live.has(signature) || seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function indexPath(projectId, collectionGroup) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(FIRESTORE_DATABASE)}` +
    `/collectionGroups/${encodeURIComponent(collectionGroup)}/indexes`;
}

async function requestJson(url, { method = 'GET', body } = {}) {
  const token = loadFirebaseToolsAccessToken();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Firestore indexes API returned invalid JSON (${response.status})`);
    }
  }
  if (!response.ok) {
    const detail = payload.error?.message || text || response.statusText;
    const error = new Error(`Firestore indexes API ${response.status}: ${detail}`);
    error.status = response.status;
    error.apiStatus = payload.error?.status;
    throw error;
  }
  return payload;
}

async function listIndexes(projectId, collectionGroup) {
  const indexes = [];
  let pageToken = '';
  do {
    const url = new URL(indexPath(projectId, collectionGroup));
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await requestJson(url);
    indexes.push(...(page.indexes || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return indexes;
}

function asApiIndex(index) {
  return {
    queryScope: index.queryScope,
    fields: index.fields,
  };
}

async function createIndex(projectId, index) {
  const url = indexPath(projectId, index.collectionGroup);
  try {
    await requestJson(url, { method: 'POST', body: asApiIndex(index) });
  } catch (error) {
    if (error.status === 409 && error.apiStatus === 'ALREADY_EXISTS') return;
    throw error;
  }
}

async function deployMissingIndexes(projectId, config, dryRun) {
  if (config.fieldOverrides?.length) {
    throw new Error(
      'Additive deployment only supports composite indexes; fieldOverrides are present in firestore.indexes.json.',
    );
  }
  if (!Array.isArray(config.indexes)) {
    throw new Error('firestore.indexes.json must contain an indexes array');
  }

  const configuredByGroup = new Map();
  for (const index of config.indexes) {
    if (!index.collectionGroup || !index.queryScope || !Array.isArray(index.fields)) {
      throw new Error(`Invalid index definition: ${JSON.stringify(index)}`);
    }
    const groupIndexes = configuredByGroup.get(index.collectionGroup) || [];
    groupIndexes.push(index);
    configuredByGroup.set(index.collectionGroup, groupIndexes);
  }

  const missing = [];
  for (const [collectionGroup, indexes] of configuredByGroup) {
    const liveIndexes = await listIndexes(projectId, collectionGroup);
    missing.push(...getMissingIndexes(indexes, liveIndexes));
  }

  if (missing.length === 0) {
    console.log('All configured composite indexes already exist in the live project.');
    return;
  }
  console.log(`${dryRun ? 'Would create' : 'Creating'} ${missing.length} missing composite index(es) in ${projectId}:`);
  for (const index of missing) {
    console.log(`  ${index.collectionGroup}: ${index.fields.map((field) => field.fieldPath).join(', ')}`);
  }
  if (dryRun) return;

  const failures = [];
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(MAX_INDEX_CREATION_CONCURRENCY, missing.length) },
    async () => {
      while (nextIndex < missing.length) {
        const index = missing[nextIndex];
        nextIndex += 1;
        try {
          await createIndex(projectId, index);
        } catch (error) {
          failures.push({ index, error });
        }
      }
    },
  );
  await Promise.all(workers);
  if (failures.length) {
    const details = failures
      .map(({ index, error }) => `${index.collectionGroup}: ${error.message}`)
      .join('\n');
    throw new Error(`Failed to create ${failures.length} composite index(es):\n${details}`);
  }
  console.log(`Submitted ${missing.length} index creation request(s). Index builds continue in Firebase.`);
}

async function confirmRulesDeployment(projectId, explicitlyConfirmed) {
  if (explicitlyConfirmed) return true;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      `Rules were not deployed. Re-run with --confirm-rules to replace the complete active ruleset in ${projectId}.`,
    );
  }
  console.warn(
    `\nWARNING: deploying firestore.rules replaces the complete active Firestore ruleset in ${projectId}.`,
  );
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`Type "${projectId}" to confirm the replacement: `);
    return answer.trim() === projectId;
  } finally {
    rl.close();
  }
}

function deployRules(projectId) {
  const command = `npx --yes firebase-tools deploy --only firestore:rules --project ${projectId} --non-interactive`;
  const result = spawnSync(command, { cwd: ROOT, shell: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Firebase CLI rules deployment failed with exit code ${result.status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const projectId = await getProjectId(options.projectId);
  const config = JSON.parse(await readFile(INDEXES_PATH, 'utf8'));
  await deployMissingIndexes(projectId, config, options.dryRun);

  if (options.dryRun || options.indexesOnly) return;
  if (!(await confirmRulesDeployment(projectId, options.confirmRules))) {
    throw new Error('Rules deployment cancelled; the active ruleset was not changed.');
  }
  console.log(`Deploying the complete local Firestore ruleset to ${projectId}.`);
  deployRules(projectId);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[deploy-firestore] ${error.message}`);
    process.exitCode = 1;
  });
}