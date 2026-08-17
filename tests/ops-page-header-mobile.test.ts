/**
 * Contract: ops page headers stay stacked on phones.
 * rangeLabel is a subtitle in the page head — never squeezed beside action buttons
 * (that wrapped into a vertical strip next to KPIs).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const shell = readFileSync(
  join(root, 'modules/dashboards/components/ModuleOpsPageShell.tsx'),
  'utf8',
);
const css = readFileSync(join(root, 'App.css'), 'utf8');

assert.match(shell, /className="ops-dash-page-head"/);
assert.match(shell, /className="ops-dash-page-subtitle"/);
assert.doesNotMatch(
  shell,
  /ops-dash-toolbar__range/,
  'ModuleOpsPageShell must not put rangeLabel in the action toolbar',
);

const homeShell = readFileSync(
  join(root, 'modules/dashboards/components/DomainHomeShell.tsx'),
  'utf8',
);
assert.match(homeShell, /className="ops-dash-page-head"/);
assert.match(homeShell, /className="ops-dash-page-subtitle"/);
assert.doesNotMatch(
  homeShell,
  /ops-dash-toolbar__range/,
  'DomainHomeShell must not put rangeLabel in the action toolbar',
);
assert.match(shell, /\{!hasHero && actions \?/);

assert.match(css, /@media \(max-width: 767px\)/);
assert.match(css, /\.ops-dash-page-head \{\s*flex-direction: column;/);
assert.match(
  css,
  /\.ops-dash-kpi-grid:has\(> :nth-child\(3\):last-child\)/,
);
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /\.erp-page-head \{\s*align-items: stretch;\s*flex-direction: column;/);
assert.match(css, /\.ops-action-strip \{/);
assert.match(css, /\.ops-action-strip \{\s*display: grid;/);

const replenish = readFileSync(
  join(root, 'modules/inventory/pages/SparePartsReplenishment.tsx'),
  'utf8',
);
assert.match(replenish, /className="ops-action-strip sticky/);

const menu = readFileSync(join(root, 'config/menu.config.ts'), 'utf8');
assert.match(
  menu,
  /key: 'inv-dashboard'[\s\S]*?exact: true/,
  'Inventory dashboard must not steal the topbar title of child pages',
);

console.log('ops-page-header-mobile.test.ts: ok');
