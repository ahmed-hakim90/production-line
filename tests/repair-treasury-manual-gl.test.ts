import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const accountingOps = readFileSync(join(root, 'functions/src/accountingOps.ts'), 'utf8');
assert.match(accountingOps, /"611001".*مرتبات وأجور فنيين الصيانة/);
assert.match(accountingOps, /"612001".*تعبئة وتغليف/);
assert.match(accountingOps, /"612002".*كهرباء/);
assert.match(accountingOps, /"419002".*إيرادات متنوعة صيانة/);
assert.match(accountingOps, /export async function ensureDefaultAccounts/);

const treasuryOps = readFileSync(join(root, 'functions/src/repairTreasuryOps.ts'), 'utf8');
assert.match(treasuryOps, /post_manual_entry/);
assert.match(treasuryOps, /repair\.treasury\.manage/);
assert.match(treasuryOps, /expenseType/);
assert.match(treasuryOps, /repair_treasury_manual/);
assert.match(treasuryOps, /getRepairTreasuryExpenseType/);
assert.match(treasuryOps, /repair_treasury_expense_requests/);
assert.match(treasuryOps, /approve_expense/);
assert.match(treasuryOps, /reject_expense/);
assert.match(treasuryOps, /اعتماد المصروفات متاح لأدمن الصيانة فقط/);
assert.match(treasuryOps, /لا يمكن لمقدم طلب المصروف اعتماد طلبه/);

const indexSource = readFileSync(join(root, 'functions/src/index.ts'), 'utf8');
assert.match(indexSource, /mutateRepairTreasury/);

const clientTypes = readFileSync(join(root, 'modules/repair/lib/repairTreasuryExpenseTypes.ts'), 'utf8');
const serverTypes = readFileSync(join(root, 'functions/src/repairTreasuryExpenseTypes.ts'), 'utf8');
for (const key of ['salaries', 'packaging', 'electricity', 'internet', 'water', 'cleaning', 'office_supplies', 'other']) {
  assert.match(clientTypes, new RegExp(`key: '${key}'`));
  assert.match(serverTypes, new RegExp(`key: '${key}'`));
}

const service = readFileSync(join(root, 'modules/repair/services/repairTreasuryService.ts'), 'utf8');
assert.match(service, /mutateRepairTreasuryCallable/);
assert.doesNotMatch(service, /source:\s*'manual_treasury'/);
assert.match(service, /countPendingExpenseApprovals/);

const ui = readFileSync(join(root, 'modules/repair/pages/RepairTreasury.tsx'), 'utf8');
assert.match(ui, /REPAIR_TREASURY_EXPENSE_TYPES/);
assert.match(ui, /entryExpenseType/);
assert.match(ui, /إرسال المصروف لاعتماد الإدارة/);
assert.match(ui, /مصروفات بانتظار اعتماد الأدمن/);

const paymentOps = readFileSync(join(root, 'functions/src/repairPaymentOps.ts'), 'utf8');
assert.match(paymentOps, /repair\.discounts\.approve/);
assert.match(paymentOps, /لا يمكن لمقدم الطلب اعتماد طلبه/);

const salesInvoiceOps = readFileSync(join(root, 'functions/src/repairFinancialOps.ts'), 'utf8');
assert.match(salesInvoiceOps, /pending_discount_approval/);
assert.match(salesInvoiceOps, /repair\.discounts\.approve/);
assert.match(salesInvoiceOps, /لا يمكن لمقدم الخصم اعتماد طلبه/);

const menu = readFileSync(join(root, 'config/menu.config.ts'), 'utf8');
assert.match(menu, /accounting-repair-pnl/);
assert.match(menu, /\/accounting\/repair-pnl/);

console.log('repair-treasury-manual-gl.test.ts: ok');
