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
  clampThermalGapMm,
  thermalPageHeightMm,
  thermalBarcodeFaceWidthMm,
  scaleJsBarcodeModuleWidth,
  resolveBarcodeLabelLayout,
  resolveThermalBarcodeBox,
  pickBarcodeLabelOptionsByIds,
  toggleSelectedBarcodeId,
  mergeVisibleBarcodeIds,
  filterBarcodeLabelChoices,
  parseStoredBarcodeLabelPrefs,
  mergeBarcodeLabelFields,
  defaultBarcodeLabelFields,
  DEFAULT_BARCODE_LABEL_LAYOUT,
  DEFAULT_BARCODE_LABEL_SIZE_ID,
  DEFAULT_THERMAL_GAP_MM,
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
  const defaults = defaultBarcodeLabelFields('locationBarcodeLabel');
  assert.equal(defaults.qrCode, false);
  assert.equal(defaults.code128, true);
}

{
  assert.equal(resolveBarcodeLabelSize(undefined).id, DEFAULT_BARCODE_LABEL_SIZE_ID);
  assert.equal(resolveBarcodeLabelSize('40x30').layout, 'thermal');
  assert.equal(resolveBarcodeLabelSize('a4').layout, 'grid');
  const thermalCss = buildBarcodeLabelPageStyle('40x30');
  assert.equal(DEFAULT_THERMAL_GAP_MM, 2);
  assert.match(thermalCss, /40mm 32mm/);
  assert.match(thermalCss, /margin: 0/);
  assert.match(thermalCss, /thermal-barcode-label/);
  assert.match(thermalCss, /overflow: hidden/);
  assert.doesNotMatch(thermalCss, /size: A4/);
  const noGapCss = buildBarcodeLabelPageStyle('40x30', null, 0);
  assert.match(noGapCss, /40mm 30mm/);
  assert.equal(clampThermalGapMm(Number.NaN), DEFAULT_THERMAL_GAP_MM);
  assert.equal(clampThermalGapMm(-1), 0);
  assert.equal(clampThermalGapMm(99), 8);
  assert.equal(thermalPageHeightMm(30, 2), 32);
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
  const customCss = buildBarcodeLabelPageStyle('custom', { widthMm: 32, heightMm: 25 }, 0);
  assert.match(customCss, /32mm 25mm/);
  const customWithGapCss = buildBarcodeLabelPageStyle('custom', { widthMm: 32, heightMm: 25 }, 2);
  assert.match(customWithGapCss, /32mm 27mm/);
}

{
  assert.equal(thermalBarcodeFaceWidthMm(40, 1), 38);
  assert.equal(thermalBarcodeFaceWidthMm(80, 1.4), 77.2);
  assert.equal(scaleJsBarcodeModuleWidth(200, 400, 1.4), 2.8);
  assert.equal(scaleJsBarcodeModuleWidth(0, 400, 1.4), 1.4);
  const wideCss = buildBarcodeLabelPageStyle('80x50');
  assert.match(wideCss, /80mm 52mm/);
  assert.match(wideCss, /min-width: 100%/);
  assert.match(wideCss, /max-width: none/);
}

{
  const layout = resolveBarcodeLabelLayout({ barcodeHeightMm: 10, barcodeWidthPct: 100 });
  assert.equal(layout.barcodeHeightMm, 10);
  assert.equal(resolveBarcodeLabelLayout({ nameMm: 99 }).nameMm, 10);
  assert.deepEqual(resolveBarcodeLabelLayout(null), DEFAULT_BARCODE_LABEL_LAYOUT);

  const withText = resolveThermalBarcodeBox({
    labelWidthMm: 80,
    labelHeightMm: 50,
    insetMm: 1.4,
    layout,
    textBlockMm: 18,
    showQr: false,
  });
  const hiddenText = resolveThermalBarcodeBox({
    labelWidthMm: 80,
    labelHeightMm: 50,
    insetMm: 1.4,
    layout,
    textBlockMm: 4,
    showQr: false,
  });
  assert.equal(withText.heightMm, 10);
  assert.equal(hiddenText.heightMm, 10);
  assert.equal(withText.widthMm, hiddenText.widthMm);
  assert.equal(withText.rowWidthMm, hiddenText.rowWidthMm);

  const withQr = resolveThermalBarcodeBox({
    labelWidthMm: 80,
    labelHeightMm: 50,
    insetMm: 1.4,
    layout,
    textBlockMm: 4,
    showQr: true,
  });
  assert.ok(hiddenText.widthMm > withQr.widthMm);
  assert.equal(hiddenText.heightMm, withQr.heightMm);

  const halfWidth = resolveThermalBarcodeBox({
    labelWidthMm: 80,
    labelHeightMm: 50,
    insetMm: 1.4,
    layout: { ...layout, barcodeWidthPct: 50 },
    textBlockMm: 4,
    showQr: false,
  });
  assert.ok(halfWidth.rowWidthMm < hiddenText.rowWidthMm);
  assert.equal(halfWidth.heightMm, hiddenText.heightMm);
}

{
  assert.equal(parseStoredBarcodeLabelPrefs(null), null);
  assert.equal(parseStoredBarcodeLabelPrefs({ sizeId: 'nope' }), null);
  const parsed = parseStoredBarcodeLabelPrefs({
    sizeId: '80x50',
    widthMm: 80,
    heightMm: 50,
    gapMm: 2,
    layout: { nameMm: 3.6, barcodeWidthPct: 100 },
    itemFields: { itemName: false, qrCode: false, extra: 'no' },
  });
  assert.equal(parsed?.sizeId, '80x50');
  assert.equal(parsed?.layout.nameMm, 3.6);
  assert.equal(parsed?.itemFields?.itemName, false);
  assert.equal(parsed?.itemFields?.extra, undefined);

  const merged = mergeBarcodeLabelFields('itemBarcodeLabel', undefined, {
    itemName: false,
    qrCode: true,
    unknown: true,
  });
  assert.equal(merged.itemName, false);
  assert.equal(merged.qrCode, true);
  assert.equal((merged as { unknown?: boolean }).unknown, undefined);
}

{
  const picked = pickBarcodeLabelOptionsByIds(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    ['c', 'a', 'missing'],
  );
  assert.deepEqual(picked.map((row) => row.id), ['a', 'c']);
  assert.deepEqual(pickBarcodeLabelOptionsByIds([{ id: 'a' }], []), []);
  assert.deepEqual(toggleSelectedBarcodeId(['a'], 'b', true).sort(), ['a', 'b']);
  assert.deepEqual(toggleSelectedBarcodeId(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(mergeVisibleBarcodeIds(['a'], ['b', 'c']).sort(), ['a', 'b', 'c']);
  assert.equal(
    filterBarcodeLabelChoices(
      [{ value: '1', label: 'ماتور مضرب' }, { value: '2', label: 'صاج' }],
      'ماتور',
    ).length,
    1,
  );
}

console.log('barcode-label-engine.test.ts: ok');
