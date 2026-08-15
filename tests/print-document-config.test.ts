import assert from 'node:assert/strict';
import { DEFAULT_PRINT_TEMPLATE } from '../utils/dashboardConfig.ts';
import {
  migratePrintTemplateV1,
  syncProductionLegacyFlags,
} from '../utils/print/migratePrintTemplate.ts';
import { resolvePrintDocumentConfig } from '../utils/print/resolvePrintDocumentConfig.ts';
import {
  clampPrintFontSizePt,
  normalizePrintFontFamily,
  resolvePrintFont,
} from '../utils/print/printFont.ts';
import { PRINT_DOCUMENT_TYPE_IDS, getPrintDocumentEntry } from '../utils/print/printDocumentRegistry.ts';
import { PRINT_ENGINE_IFRAME_CSS } from '../utils/print/printSurface.ts';
import { resolvePrintTemplate } from '../modules/system/lib/resolveSystemSettings.ts';

{
  const legacy = migratePrintTemplateV1({
    ...DEFAULT_PRINT_TEMPLATE,
    documents: undefined,
    showWaste: false,
    showEmployee: true,
    showCosts: false,
    showWorkOrder: true,
    showSellingPrice: false,
    showQRCode: true,
  });
  assert.equal(legacy.documents?.productionReport?.fields?.waste, false);
  assert.equal(legacy.documents?.productionReport?.fields?.costs, false);
  assert.equal(legacy.documents?.productionReport?.fields?.qrCode, true);
  assert.equal(legacy.showWaste, false);
  assert.equal(legacy.showQRCode, true);
}

{
  const kept = migratePrintTemplateV1({
    ...DEFAULT_PRINT_TEMPLATE,
    showWaste: false,
    documents: {
      productionReport: {
        fields: { waste: true, employee: false },
      },
    },
  });
  // Explicit document fields win over legacy flat flags.
  assert.equal(kept.documents?.productionReport?.fields?.waste, true);
  assert.equal(kept.documents?.productionReport?.fields?.employee, false);
  assert.equal(kept.showWaste, true);
  assert.equal(kept.showEmployee, false);
}

{
  const resolved = resolvePrintDocumentConfig(
    {
      ...DEFAULT_PRINT_TEMPLATE,
      headerText: 'عام',
      footerText: 'تذييل عام',
      documents: {
        stockTransfer: {
          headerText: 'تحويل خاص',
          footerText: '',
          customLines: [
            { id: '1', text: 'سطر مفعّل', enabled: true },
            { id: '2', text: 'سطر معطّل', enabled: false },
            { id: '3', text: '   ', enabled: true },
          ],
          fields: { itemCode: false, signatures: true },
        },
      },
    },
    'stockTransfer',
  );
  assert.equal(resolved.headerText, 'تحويل خاص');
  assert.equal(resolved.footerText, 'تذييل عام');
  assert.deepEqual(resolved.customLines, ['سطر مفعّل']);
  assert.equal(resolved.isFieldVisible('itemCode'), false);
  assert.equal(resolved.isFieldVisible('signatures'), true);
  assert.equal(resolved.isFieldVisible('quantityPieces'), true);
}

{
  const fromResolve = resolvePrintTemplate({
    headerText: 'شركة',
    showWaste: false,
    showQRCode: true,
  } as Partial<typeof DEFAULT_PRINT_TEMPLATE>);
  assert.equal(fromResolve.documents?.productionReport?.fields?.waste, false);
  assert.equal(fromResolve.documents?.productionReport?.fields?.qrCode, true);
  assert.equal(fromResolve.headerText, 'شركة');
}

{
  const synced = syncProductionLegacyFlags({
    ...DEFAULT_PRINT_TEMPLATE,
    documents: {
      productionReport: {
        fields: {
          ...DEFAULT_PRINT_TEMPLATE.documents!.productionReport!.fields!,
          costs: false,
          qrCode: true,
        },
      },
    },
  });
  assert.equal(synced.showCosts, false);
  assert.equal(synced.showQRCode, true);
}

{
  assert.equal(normalizePrintFontFamily('Tajawal'), 'Tajawal');
  assert.equal(normalizePrintFontFamily('Comic Sans'), 'Cairo');
  assert.equal(clampPrintFontSizePt(99), 14);
  assert.equal(clampPrintFontSizePt(3), 8);
  const font = resolvePrintFont({ printFontFamily: 'Tajawal', printFontSizePt: 12 });
  assert.equal(font.family, 'Tajawal');
  assert.match(font.fontFamily, /Tajawal/);
  assert.equal(font.fontSize, '12pt');
  assert.equal(font.denseFontSize, '10pt');
}

{
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('payslip'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('qualityReport'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('accountingReport'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('repairJobReceipt'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('repairDeliveryReceipt'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('catalogProductDetail'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('productBomCountCard'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('workOrder'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('warehouseStockCount'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('productionIssue'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('departmentConsumableIssue'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('itemBarcodeLabel'), true);
  assert.equal(PRINT_DOCUMENT_TYPE_IDS.includes('locationBarcodeLabel'), true);
  for (const id of PRINT_DOCUMENT_TYPE_IDS) {
    assert.equal(getPrintDocumentEntry(id).id, id);
  }
  const payslipResolved = resolvePrintDocumentConfig(
    {
      ...DEFAULT_PRINT_TEMPLATE,
      documents: {
        payslip: {
          headerText: 'رواتب خاصة',
          fields: { deductions: false, signatures: true },
        },
      },
    },
    'payslip',
  );
  assert.equal(payslipResolved.headerText, 'رواتب خاصة');
  assert.equal(payslipResolved.isFieldVisible('deductions'), false);
  assert.equal(payslipResolved.isFieldVisible('earnings'), true);
  assert.equal(payslipResolved.isFieldVisible('signatures'), true);

  const repairReceipt = resolvePrintDocumentConfig(
    {
      ...DEFAULT_PRINT_TEMPLATE,
      documents: {
        repairJobReceipt: {
          fields: { costs: false, qrCode: true },
        },
      },
    },
    'repairJobReceipt',
  );
  assert.equal(repairReceipt.isFieldVisible('costs'), false);
  assert.equal(repairReceipt.isFieldVisible('qrCode'), true);
}

{
  assert.match(PRINT_ENGINE_IFRAME_CSS, /print-brand-header/);
  assert.match(PRINT_ENGINE_IFRAME_CSS, /print-kpi-card/);
  assert.match(PRINT_ENGINE_IFRAME_CSS, /print-kv-row/);
  assert.match(PRINT_ENGINE_IFRAME_CSS, /print-sign-grid/);
}

console.log('print-document-config.test.ts: ok');
