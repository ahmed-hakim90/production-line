import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSrc = readFileSync(
  new URL('../modules/inventory/components/WarehouseItemSearchPanel.tsx', import.meta.url),
  'utf8',
);
assert.match(panelSrc, /hasActiveItemSearch/);
assert.match(panelSrc, /matchesItemSearch/);
assert.match(panelSrc, /ابحث بالاسم أو الكود/);
assert.match(panelSrc, /اكتب حرفين على الأقل/);
assert.match(panelSrc, /pageId/);
assert.match(panelSrc, /buildItemCardPath/);

const workspaceSrc = readFileSync(
  new URL('../modules/inventory/pages/WarehouseWorkspace.tsx', import.meta.url),
  'utf8',
);
assert.match(workspaceSrc, /WarehouseItemSearchPanel/);
assert.match(workspaceSrc, /balances=\{countBalances\}/);
assert.doesNotMatch(workspaceSrc, /title="أرصدة سريعة"/);

const controlSrc = readFileSync(
  new URL('../modules/inventory/pages/RawMaterialWarehouseControl.tsx', import.meta.url),
  'utf8',
);
assert.match(controlSrc, /WarehouseItemSearchPanel/);
assert.match(controlSrc, /balances=\{balances\}/);

const floorSrc = readFileSync(
  new URL('../modules/inventory/pages/ProductionFloorStock.tsx', import.meta.url),
  'utf8',
);
assert.match(floorSrc, /WarehouseItemSearchPanel/);

console.log('warehouse-item-search-panel tests passed');
