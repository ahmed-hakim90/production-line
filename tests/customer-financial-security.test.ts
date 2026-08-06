import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const analytics = readFileSync(new URL('../functions/src/customerFinancialAnalytics.ts', import.meta.url), 'utf8');
const invoices = readFileSync(new URL('../functions/src/repairFinancialOps.ts', import.meta.url), 'utf8');
const technician = readFileSync(new URL('../functions/src/repairTechnicianOps.ts', import.meta.url), 'utf8');

assert.match(analytics, /permissions\?\.\['customers\.view'\]/);
assert.match(analytics, /customerSnap\.data\(\)\?\.tenantId/);
assert.match(invoices, /اختيار العميل مطلوب قبل حفظ الفاتورة/);
assert.match(invoices, /String\(invoiceCustomer\?\.name/);
assert.match(invoices, /customerId:\s*requestedCustomerId/);
assert.match(technician, /\.map\(\(\{ id, name, enabled \}\) => \(\{ id, name, enabled \}\)\)/);
assert.doesNotMatch(technician, /unitInternalCost/);

console.log('customer-financial-security.test.ts: ok');
