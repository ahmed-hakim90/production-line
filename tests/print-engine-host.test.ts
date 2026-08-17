import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRINT_TEMPLATE } from '../utils/dashboardConfig.ts';
import { resolveStockVoucherPrintDocId } from '../modules/inventory/components/StockTransferPrint.tsx';
import {
  buildGlobalPrintPageStyle,
  resolvePrintEnginePageStyle,
} from '../utils/print/printPageStyle.ts';
import { PRINT_ENGINE_IFRAME_CSS } from '../utils/print/printSurface.ts';

{
  assert.equal(resolveStockVoucherPrintDocId('إذن إضافة'), 'stockReceipt');
  assert.equal(resolveStockVoucherPrintDocId('إذن منصرف'), 'stockIssue');
  assert.equal(resolveStockVoucherPrintDocId('إذن تحويل مخزون'), 'stockTransfer');
  assert.equal(resolveStockVoucherPrintDocId(undefined), 'stockTransfer');
}

{
  const style = buildGlobalPrintPageStyle(DEFAULT_PRINT_TEMPLATE);
  assert.match(style, /@page/);
  assert.match(style, /print-brand-header/);
  assert.ok(style.includes(PRINT_ENGINE_IFRAME_CSS.trim().slice(0, 40)));
}

{
  const custom = '@page { size: 40mm 30mm; }';
  assert.equal(resolvePrintEnginePageStyle({ pageStyle: custom }), custom);
  const fromSettings = resolvePrintEnginePageStyle({ printSettings: DEFAULT_PRINT_TEMPLATE });
  assert.match(fromSettings, /size: A4/);
}

{
  const app = readFileSync(join(import.meta.dirname, '../App.tsx'), 'utf8');
  assert.match(app, /PrintEngineProvider/);
  const host = readFileSync(join(import.meta.dirname, '../utils/print/PrintEngineHost.tsx'), 'utf8');
  assert.match(host, /useReactToPrint/);
  const manager = readFileSync(join(import.meta.dirname, '../utils/printManager.ts'), 'utf8');
  assert.match(manager, /engine\.printFromRef/);
  assert.doesNotMatch(manager, /useReactToPrint/);
}

{
  const movementForm = readFileSync(
    join(import.meta.dirname, '../modules/inventory/pages/StockMovementForm.tsx'),
    'utf8',
  );
  assert.match(movementForm, /printDocument\(/);
  assert.doesNotMatch(movementForm, /isMobilePrint/);
  assert.doesNotMatch(movementForm, /exportToPDF/);
}

{
  const inventoryPrintPages = [
    'modules/inventory/pages/ProductionIssues.tsx',
    'modules/inventory/pages/DepartmentConsumables.tsx',
    'modules/inventory/pages/TransferApprovals.tsx',
    'modules/inventory/pages/SuppliesReceipt.tsx',
    'modules/inventory/pages/ProductionInventoryApprovals.tsx',
    'modules/inventory/pages/ItemCard.tsx',
    'modules/repair/pages/RepairSpareIssues.tsx',
    'modules/repair/pages/SparePartsInventory.tsx',
    'modules/production/pages/WorkOrders/index.tsx',
    'modules/production/pages/ProductionIssueRequests.tsx',
    'modules/production/pages/Supervisors.tsx',
    'modules/production/pages/SupervisorDetails.tsx',
    'modules/hr/pages/Payroll.tsx',
    'modules/hr/pages/EmployeeSelfService.tsx',
    'modules/catalog/pages/ProductDetails.tsx',
    'modules/dashboards/pages/EmployeeDashboard.tsx',
    'modules/accounting/pages/AccountingJournals.tsx',
    'modules/accounting/pages/AccountingLedger.tsx',
    'modules/accounting/pages/AccountingTrialBalance.tsx',
    'modules/accounting/pages/AccountingInventoryValuation.tsx',
    'modules/quality/pages/CAPA.tsx',
    'modules/quality/pages/ReworkOrders.tsx',
    'modules/quality/pages/IPQC.tsx',
    'modules/quality/pages/FinalInspection.tsx',
    'modules/quality/pages/QualityReports.tsx',
    'modules/production/pages/Reports.tsx',
    'modules/repair/pages/RepairPayments.tsx',
    'modules/repair/pages/RepairJobDetail.tsx',
    'modules/repair/pages/RepairTreasuryMonthlyReport.tsx',
    'modules/repair/components/RepairJobQuickDrawer.tsx',
  ];
  for (const rel of inventoryPrintPages) {
    const src = readFileSync(join(import.meta.dirname, '..', rel), 'utf8');
    assert.match(src, /printDocument\(/, `${rel} must print via the engine`);
    assert.doesNotMatch(src, /PrintOffscreenHost/, `${rel} must not mount a local print host`);
  }
}

console.log('print-engine-host.test.ts: ok');
