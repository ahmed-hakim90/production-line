import assert from 'node:assert/strict';
import {
  expandLabelCopies,
  buildItemBarcodeLabels,
  buildLocationBarcodeLabels,
  withBarcodeLabelFieldOverrides,
  resolveBarcodeLabelSize,
  buildBarcodeLabelPageStyle,
  formatBarcodeLabelDisplayCode,
  formatDriverStockSize,
  mmToDriverInches,
  clampThermalLabelMm,
  DEFAULT_BARCODE_LABEL_SIZE_ID,
} from '../modules/inventory/lib/barcodeLabelEngine.ts';
import { DEFAULT_PRINT_TEMPLATE } from '../utils/dashboardConfig.ts';
import { resolvePrintDocumentConfig } from '../utils/print/resolvePrintDocumentConfig.ts';

{
  const expanded = expandLabelCopies([{ code: 'A' }], 3);
  assert.equal(expanded.length, 3);
  assert.equal(expandLabelCopies([{ code: 'A' }], 0).length, 1);
  assert.equal(expandLabelCopies([{ code: 'A' }], 999).length, 200);
}

{
  const items = buildItemBarcodeLabels({
    items: [
      { id: '1', code: 'SP-1', name: 'قطعة', barcode: '622' },
      { id: '2', code: '', name: 'بدون كود' },
    ],
    warehouseName: 'مركزي',
  });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.barcodeValue, '622');
  assert.equal(items[0]?.warehouseName, 'مركزي');
}

{
  const locs = buildLocationBarcodeLabels({
    locations: [
      { id: 'l1', code: 'A1-1', rackName: 'A' },
      { id: 'l2', code: '  ' },
    ],
  });
  assert.equal(locs.length, 1);
  assert.equal(locs[0]?.locationCode, 'A1-1');
}

{
  const overridden = withBarcodeLabelFieldOverrides(
    DEFAULT_PRINT_TEMPLATE,
    'itemBarcodeLabel',
    { qrCode: false, itemName: true },
  );
  const doc = resolvePrintDocumentConfig(overridden, 'itemBarcodeLabel');
  assert.equal(doc.isFieldVisible('qrCode'), false);
  assert.equal(doc.isFieldVisible('itemName'), true);
  assert.equal(doc.isFieldVisible('code128'), true);
}

{
  assert.equal(resolveBarcodeLabelSize(undefined).id, DEFAULT_BARCODE_LABEL_SIZE_ID);
  assert.equal(resolveBarcodeLabelSize('40x30').layout, 'thermal');
  assert.equal(resolveBarcodeLabelSize('a4').layout, 'grid');
  const thermalCss = buildBarcodeLabelPageStyle('40x30');
  assert.match(thermalCss, /40mm 30mm/);
  assert.match(thermalCss, /margin: 0/);
  assert.match(thermalCss, /thermal-barcode-label/);
  assert.match(thermalCss, /overflow: hidden/);
  assert.doesNotMatch(thermalCss, /size: A4/);
  const a4Css = buildBarcodeLabelPageStyle('a4');
  assert.match(a4Css, /A4/);
}

{
  assert.equal(formatBarcodeLabelDisplayCode('A1-1'), 'A1 - 1');
  assert.equal(formatBarcodeLabelDisplayCode('CENTRAL_A1/2'), 'CENTRAL - A1 - 2');
}

{
  const custom = resolveBarcodeLabelSize('custom', { widthMm: 32, heightMm: 25 });
  assert.equal(custom.id, 'custom');
  assert.equal(custom.widthMm, 32);
  assert.equal(custom.heightMm, 25);
  assert.equal(custom.layout, 'thermal');
  assert.equal(mmToDriverInches(40), '1.57');
  assert.equal(mmToDriverInches(30), '1.18');
  assert.equal(formatDriverStockSize(40, 30), '1.57 in × 1.18 in');
  assert.equal(clampThermalLabelMm(3, 40), 15);
  assert.equal(clampThermalLabelMm(400, 40), 120);
  const customCss = buildBarcodeLabelPageStyle('custom', { widthMm: 32, heightMm: 25 });
  assert.match(customCss, /32mm 25mm/);
}

console.log('barcode-label-engine.test.ts: ok');
