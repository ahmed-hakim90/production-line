import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lifecycle = fs.readFileSync(path.join(root, 'functions/src/generalStockVoucherLifecycle.ts'), 'utf8');
const issues = fs.readFileSync(path.join(root, 'modules/inventory/pages/GeneralStockIssues.tsx'), 'utf8');
const receipts = fs.readFileSync(path.join(root, 'modules/inventory/pages/GeneralStockReceipts.tsx'), 'utf8');

assert.match(lifecycle, /status: 'draft'/, 'drafts must be persisted with draft status');
assert.match(lifecycle, /manual_movement_reversal/, 'void must append reversal ledger entries');
assert.match(lifecycle, /status: 'voided'/, 'void must preserve and mark the original voucher');
assert.match(lifecycle, /nextQty < -0\.0001/, 'receipt reversal must prevent negative aggregate stock');
assert.match(lifecycle, /nextLocationQty < -0\.0001/, 'receipt reversal must prevent negative location stock');
assert.match(lifecycle, /يجب إلغاء أذونات المرتجع المرتبطة أولًا/, 'issue void must block while returns exist');
assert.match(issues, /حفظ مسودة/, 'general issue must expose draft save');
assert.match(receipts, /حفظ مسودة/, 'general receipt must expose draft save');
assert.match(issues, /StockTransferPrint/, 'general issue must support printing');
assert.match(receipts, /StockTransferPrint/, 'general receipt must support printing');
assert.match(issues, /إلغاء بقيد عكسي/, 'general issue must expose reversal');
assert.match(receipts, /إلغاء بقيد عكسي/, 'general receipt must expose reversal');

console.log('general-stock-voucher-lifecycle.test.ts: OK');
