import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'functions/src/accountingOps.ts'), 'utf8');

assert.match(source, /ensureDefaultAccounts/);
assert.match(source, /useDefaultAccounts/);
assert.match(
  source,
  /اختر فرع الصيانة ومركز التكلفة\. الحسابات تُملأ تلقائيًا من الشجرة الافتراضية/,
);
assert.match(source, /discounts:\s*"419001"/);
assert.match(source, /discounts:\s*"contra_revenue"/);
assert.match(source, /serviceRevenue:\s*"411001"/);
assert.doesNotMatch(
  source,
  /اختر مركز التكلفة واربط جميع حسابات فرع الصيانة/,
);

const ui = readFileSync(join(root, 'modules/accounting/pages/AccountingSettings.tsx'), 'utf8');
assert.match(ui, /حفظ الربط بالحسابات الافتراضية/);
assert.match(ui, /تعديل متقدم للحسابات \(محاسب\)/);
assert.match(ui, /useDefaultAccounts:\s*true/);

console.log('accounting-repair-branch-link-defaults.test.ts: ok');
