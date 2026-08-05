import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  classifyCustomerSizeTier,
  CUSTOMER_SIZE_TIER_THRESHOLDS,
} from '../modules/customers/lib/customerSizeTier';
import {
  parseCustomerMetricsSheet,
  parseMetricsNumericCell,
} from '../modules/customers/lib/importCustomerMetricsSheet';
import type { Customer } from '../modules/customers/types';

function sampleCustomer(partial: Partial<Customer> & Pick<Customer, 'code' | 'name' | 'phone'>): Customer {
  return {
    tenantId: 't1',
    type: 'consumer',
    phoneDigits: String(partial.phone || '').replace(/\D/g, ''),
    isActive: true,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

{
  assert.equal(classifyCustomerSizeTier(undefined), 'unclassified');
  assert.equal(classifyCustomerSizeTier(null), 'unclassified');
  assert.equal(classifyCustomerSizeTier(-1), 'unclassified');
  assert.equal(classifyCustomerSizeTier(0), 'small');
  assert.equal(classifyCustomerSizeTier(CUSTOMER_SIZE_TIER_THRESHOLDS.mediumMin - 1), 'small');
  assert.equal(classifyCustomerSizeTier(CUSTOMER_SIZE_TIER_THRESHOLDS.mediumMin), 'medium');
  assert.equal(classifyCustomerSizeTier(CUSTOMER_SIZE_TIER_THRESHOLDS.largeMin - 1), 'medium');
  assert.equal(classifyCustomerSizeTier(CUSTOMER_SIZE_TIER_THRESHOLDS.largeMin), 'large');
  assert.equal(classifyCustomerSizeTier(1_000_000), 'large');
}

{
  assert.equal(parseMetricsNumericCell(''), null);
  assert.equal(parseMetricsNumericCell(null), null);
  assert.equal(parseMetricsNumericCell(12_500), 12_500);
  assert.equal(parseMetricsNumericCell('12,500.5'), 12_500.5);
  assert.equal(parseMetricsNumericCell('-3200'), -3200);
  assert.equal(parseMetricsNumericCell('abc'), null);
}

{
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['الكود', 'الاسم', 'حجم الشغل', 'الرصيد'],
    ['CST-00001', 'أحمد', 25_000, 1_500],
    ['TRD-00001', 'النور', 180_000, -3_200],
    ['TRD-00002', 'كبير', 450_000, 12_000],
    ['MISSING-01', 'غير موجود', 10_000, 0],
    ['CST-00001', 'مكرر', 1_000, 0],
    ['', '', '', ''],
    ['CST-00002', 'بدون حجم', '', 100],
    ['CST-00003', 'حجم سالب', -5, 0],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'المؤشرات');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const existing = new Map<string, Customer>([
    ['CST-00001', sampleCustomer({ id: '1', code: 'CST-00001', name: 'أحمد', phone: '01012345678' })],
    ['TRD-00001', sampleCustomer({ id: '2', code: 'TRD-00001', name: 'النور', phone: '01123456789', type: 'trader' })],
    ['TRD-00002', sampleCustomer({ id: '3', code: 'TRD-00002', name: 'كبير', phone: '01234567890', type: 'trader' })],
    ['CST-00002', sampleCustomer({ id: '4', code: 'CST-00002', name: 'بدون حجم', phone: '01000000001' })],
    ['CST-00003', sampleCustomer({ id: '5', code: 'CST-00003', name: 'حجم سالب', phone: '01000000002' })],
  ]);

  const parsed = parseCustomerMetricsSheet(buffer, existing);
  assert.equal(parsed.readyCount, 3);
  assert.ok(parsed.errorCount >= 4);

  const ready = parsed.rows.filter((r) => r.status === 'ready');
  assert.equal(ready.find((r) => r.code === 'CST-00001')?.sizeTier, 'small');
  assert.equal(ready.find((r) => r.code === 'TRD-00001')?.sizeTier, 'medium');
  assert.equal(ready.find((r) => r.code === 'TRD-00002')?.sizeTier, 'large');

  const missing = parsed.rows.find((r) => r.code === 'MISSING-01');
  assert.equal(missing?.status, 'error');
  assert.match(String(missing?.error || ''), /غير موجود/);

  const dup = parsed.rows.find((r) => r.code === 'CST-00001' && r.status === 'error');
  assert.ok(dup);
  assert.match(String(dup?.error || ''), /مكرر/);

  const badVolume = parsed.rows.find((r) => r.code === 'CST-00002');
  assert.equal(badVolume?.status, 'error');

  const negative = parsed.rows.find((r) => r.code === 'CST-00003');
  assert.equal(negative?.status, 'error');
}

{
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['code', 'name', 'businessVolume', 'balance'],
    ['CST-00001', 'Ahmed', 60_000, 200],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'metrics');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const existing = new Map<string, Customer>([
    ['CST-00001', sampleCustomer({ id: '1', code: 'CST-00001', name: 'Ahmed', phone: '01012345678' })],
  ]);
  const parsed = parseCustomerMetricsSheet(buffer, existing);
  assert.equal(parsed.readyCount, 1);
  assert.equal(parsed.rows[0]?.sizeTier, 'medium');
}

console.log('customers-kpi-metrics.test.ts: ok');
