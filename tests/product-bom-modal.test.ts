import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MODAL_KEYS } from '../components/modal-manager/modalKeys.ts';

function run() {
  assert.equal(MODAL_KEYS.PRODUCTS_BOM_MANAGE, 'products.bom.manage');
  assert.notEqual(MODAL_KEYS.PRODUCTS_BOM_MANAGE, MODAL_KEYS.PRODUCTS_CREATE);

  const host = readFileSync(
    join(process.cwd(), 'components/modal-manager/ModalHost.tsx'),
    'utf8',
  );
  assert.match(host, /GlobalProductBomModal/);
  assert.match(host, /modals\/GlobalProductBomModal/);

  console.log('product-bom-modal.test.ts: OK');
}

run();
