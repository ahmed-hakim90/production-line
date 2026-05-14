/**
 * Composes root firestore.rules from:
 *   - firestore/storefront-files.rules.partial (shared store / files block)
 *   - firestore/production-line.rules.fragment (ERP multi-tenant rules, pl_* helpers)
 *
 * With --migrate-from-monolith: one-time extraction from a legacy firestore.rules that
 * still contains `function isAuthenticated()` — writes the two partial files + exits
 * (does not compose). Use only when importing an old single-file ruleset.
 * WARNING: overwrites firestore/production-line.rules.fragment; re-apply manual edits
 * (e.g. repair_jobs service_events) after migrate if needed.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = resolve(root, 'firestore.rules');
const headPath = resolve(root, 'firestore/storefront-files.rules.partial');
const fragmentPath = resolve(root, 'firestore/production-line.rules.fragment');
const outPath = resolve(root, 'firestore.rules');

/** Longest first so substrings of other identifiers are not corrupted. */
const RENAME_PAIRS = [
  ['canCreateRepairTreasuryEntryForOpenSession', 'pl_canCreateRepairTreasuryEntryForOpenSession'],
  ['customerDepositsCanCreatePendingEntry', 'pl_customerDepositsCanCreatePendingEntry'],
  ['depositEntryCreatorPendingUpdate', 'pl_depositEntryCreatorPendingUpdate'],
  ['isTechnicianAssignedToBranch', 'pl_isTechnicianAssignedToBranch'],
  ['depositEntrySerialUnchanged', 'pl_depositEntrySerialUnchanged'],
  ['depositEntryConfirmUpdate', 'pl_depositEntryConfirmUpdate'],
  ['customerDepositsReadPerm', 'pl_customerDepositsReadPerm'],
  ['canUpdateRepairBranchScoped', 'pl_canUpdateRepairBranchScoped'],
  ['canCreateRepairBranchScoped', 'pl_canCreateRepairBranchScoped'],
  ['canReadRepairBranchScoped', 'pl_canReadRepairBranchScoped'],
  ['currentUserHasRepairBranch', 'pl_currentUserHasRepairBranch'],
  ['currentUserRepairBranchIds', 'pl_currentUserRepairBranchIds'],
  ['currentUserRepairBranchId', 'pl_currentUserRepairBranchId'],
  ['sameTenantOrLegacyUpdate', 'pl_sameTenantOrLegacyUpdate'],
  ['sameTenantOrLegacyWrite', 'pl_sameTenantOrLegacyWrite'],
  ['sameTenantOrLegacyRead', 'pl_sameTenantOrLegacyRead'],
  ['isBusinessCollection', 'pl_isErpBusinessCollection'],
  ['roleBelongsToTenant', 'pl_roleBelongsToTenant'],
  ['isRepairBranchAdmin', 'pl_isRepairBranchAdmin'],
  ['depositEntryAmountOk', 'pl_depositEntryAmountOk'],
  ['depositEntryTenantOk', 'pl_depositEntryTenantOk'],
  ['isPresenceOwner', 'pl_isPresenceOwner'],
  ['sameTenantUpdate', 'pl_sameTenantUpdate'],
  ['sameTenantWrite', 'pl_sameTenantWrite'],
  ['isActiveUser', 'pl_isActiveUser'],
  ['hasPermission', 'pl_hasErpPermission'],
  ['isAuthenticated', 'pl_authSignedIn'],
  ['currentUserPath', 'pl_currentUserPath'],
  ['currentRolePath', 'pl_currentRolePath'],
  ['currentUserDoc', 'pl_currentUserDoc'],
  ['currentRoleDoc', 'pl_currentRoleDoc'],
  ['isBranchManager', 'pl_isBranchManager'],
  ['canAccessBranch', 'pl_canAccessRepairBranch'],
];

function applyRenames(text) {
  let out = text;
  for (const [from, to] of RENAME_PAIRS) {
    const re = new RegExp(`\\b${from}\\b`, 'g');
    out = out.replace(re, to);
  }
  // Field `users/{uid}.isSuperAdmin` must stay; only rename the helper `isSuperAdmin(...)`.
  out = out.replace(/(?<!\.)\bisSuperAdmin(?=\s*\()/g, 'pl_isSuperAdmin');
  return out;
}

function migrateFromMonolith() {
  const full = readFileSync(legacyPath, 'utf8');
  const lines = full.split(/\n/);

  const authIdx = lines.findIndex((l) => /^\s*function isAuthenticated\(\)/.test(l));
  const denyIdx = lines.findIndex((l) => /^\s*match \/{\s*document=\*\*\s*}\s*\{/.test(l));
  if (authIdx === -1) {
    console.error('[compose-firestore-rules] --migrate-from-monolith: no `function isAuthenticated()` found.');
    process.exit(1);
  }
  if (denyIdx === -1 || denyIdx <= authIdx) {
    console.error('[compose-firestore-rules] --migrate-from-monolith: no deny-all `match /{document=**}` found after ERP block.');
    process.exit(1);
  }

  // Inner content before ERP: lines 5–71 in legacy (1-based): indices 4..70 after `match /databases/...`
  const storeLines = lines.slice(4, 71);
  const storeNormalized = storeLines
    .map((line) => (line.startsWith('//') ? '    ' + line : line))
    .join('\n');
  writeFileSync(headPath, storeNormalized + '\n', 'utf8');

  let erpRaw = lines.slice(authIdx, denyIdx).join('\n');
  // Strip trailing comment left before legacy deny-all block.
  erpRaw = erpRaw.replace(/\n\s*\/\/\s*Final fallback:[^\n]*\n*$/, '\n');
  const fragment =
    [
      '    // Fragment: production-line ERP rules (multi-tenant). Paste inside `match /databases/{database}/documents { ... }`.',
      '    // Helpers use the `pl_` prefix for safe merge into a central rules file.',
      '    // Do not add rules_version / service wrapper here; do not add a deny-all catch-all.',
    ].join('\n') +
    '\n\n' +
    applyRenames(erpRaw) +
    '\n';

  writeFileSync(fragmentPath, fragment, 'utf8');
  console.log(`[compose-firestore-rules] Wrote ${headPath}`);
  console.log(`[compose-firestore-rules] Wrote ${fragmentPath}`);
}

function compose() {
  if (!existsSync(headPath) || !existsSync(fragmentPath)) {
    console.error(
      `[compose-firestore-rules] Missing ${headPath} or ${fragmentPath}. Run once with --migrate-from-monolith if importing legacy firestore.rules.`,
    );
    process.exit(1);
  }
  const head = readFileSync(headPath, 'utf8');
  const fragment = readFileSync(fragmentPath, 'utf8').trimEnd();
  const out = [
    "rules_version = '2';",
    '',
    'service cloud.firestore {',
    '  match /databases/{database}/documents {',
    head.trimEnd(),
    '',
    fragment,
    '',
    '  }',
    '}',
    '',
  ].join('\n');
  writeFileSync(outPath, out, 'utf8');
  console.log(`[compose-firestore-rules] Wrote ${outPath}`);
}

if (process.argv.includes('--migrate-from-monolith')) {
  migrateFromMonolith();
} else {
  compose();
}
