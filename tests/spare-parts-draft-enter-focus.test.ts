/**
 * Contract: Enter on a filled qty line opens the next row AND moves focus
 * to that row's item search — not leaving the operator on the previous qty.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const replenish = readFileSync(
  join(root, 'modules/inventory/pages/SparePartsReplenishment.tsx'),
  'utf8',
);
const repairModal = readFileSync(
  join(root, 'modules/repair/components/CreateRepairReplenishmentModal.tsx'),
  'utf8',
);

for (const [label, source, itemId] of [
  ['SparePartsReplenishment', replenish, 'replenish-draft-item-'],
  ['CreateRepairReplenishmentModal', repairModal, 'repair-replenish-draft-item-'],
] as const) {
  assert.match(source, /if \(e\.key !== 'Enter'\) return/, `${label} must handle Enter on qty`);
  assert.match(
    source,
    /setDraftLines\(\(prev\) => \[/,
    `${label} must append a draft line on last-row Enter`,
  );
  assert.match(
    source,
    /setDraftItemFocusIndex\(nextIndex\)/,
    `${label} must move focus to the next item search after Enter`,
  );
  assert.equal(
    source.includes(`getElementById(\`${itemId}`),
    true,
    `${label} must focus the next item search by id`,
  );
  assert.match(
    source,
    /id=\{`[^`]*draft-item-\$\{/,
    `${label} must give the item combobox a focusable id`,
  );
}

console.log('spare-parts-draft-enter-focus.test.ts: ok');
