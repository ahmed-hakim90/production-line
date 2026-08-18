import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildItemCardPath,
  findItemCardCatalogOption,
  isItemCardCatalogReady,
  itemCardQueryItemType,
  shouldWarnItemMissingFromCatalog,
} from '../modules/inventory/lib/itemCardCatalog';

assert.equal(itemCardQueryItemType('finished_good'), 'finished_good');
assert.equal(itemCardQueryItemType('material'), 'material');
assert.equal(itemCardQueryItemType('raw_material'), 'material');
assert.equal(itemCardQueryItemType(null), 'material');

assert.equal(
  buildItemCardPath({ itemType: 'raw_material', itemId: 'mat-1', warehouseId: 'wh-1' }),
  '/inventory/item-card?itemType=material&itemId=mat-1&warehouseId=wh-1',
);

assert.equal(
  isItemCardCatalogReady({
    itemType: 'material',
    materialsCatalogLoaded: false,
    productsLoading: false,
  }),
  false,
);
assert.equal(
  isItemCardCatalogReady({
    itemType: 'material',
    materialsCatalogLoaded: true,
    productsLoading: false,
  }),
  true,
);
assert.equal(
  isItemCardCatalogReady({
    itemType: 'finished_good',
    materialsCatalogLoaded: false,
    productsLoading: true,
  }),
  false,
);

assert.equal(
  shouldWarnItemMissingFromCatalog({
    itemId: 'mat-1',
    catalogReady: false,
    foundInCatalog: false,
  }),
  false,
  'must not toast while the catalog is still hydrating',
);
assert.equal(
  shouldWarnItemMissingFromCatalog({
    itemId: 'mat-1',
    catalogReady: true,
    foundInCatalog: true,
  }),
  false,
);
assert.equal(
  shouldWarnItemMissingFromCatalog({
    itemId: 'mat-1',
    catalogReady: true,
    foundInCatalog: false,
  }),
  true,
);

const options = [{ id: 'mat-new' }, { id: 'other' }];
assert.equal(findItemCardCatalogOption(options, 'mat-new')?.id, 'mat-new');
assert.equal(
  findItemCardCatalogOption(options, 'legacy-raw', [
    { id: 'mat-new', aliasIds: ['legacy-raw'] },
  ])?.id,
  'mat-new',
);
assert.equal(findItemCardCatalogOption(options, 'missing'), undefined);

const itemCardSrc = readFileSync(
  new URL('../modules/inventory/pages/ItemCard.tsx', import.meta.url),
  'utf8',
);
assert.match(itemCardSrc, /shouldWarnItemMissingFromCatalog/);
assert.match(itemCardSrc, /catalogReady/);
assert.doesNotMatch(itemCardSrc, /const selectedOption = catalogOptions\.find/);

console.log('item-card-catalog tests passed');
