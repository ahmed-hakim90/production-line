import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import {
  customerCodePrefixForType,
  maxCustomerSeqFromCodes,
  normalizeCustomerCode,
} from '../modules/customers/lib/customerCode';
import {
  chunkCustomerImportRows,
  CUSTOMER_IMPORT_CREATE_CHUNK,
  CUSTOMER_IMPORT_UPDATE_CHUNK,
  partitionCustomerImportWriteRows,
} from '../modules/customers/lib/customerImportBatch';
import { formatCustomerOptionLabel, matchCustomers } from '../modules/customers/lib/customerSearch';
import { parseCustomersExcel } from '../modules/customers/lib/importCustomers';
import { parseCustomerTypeLabel, type Customer } from '../modules/customers/types';

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
  assert.equal(normalizeCustomerCode(' cst-12 '), 'CST-12');
  assert.equal(customerCodePrefixForType('consumer'), 'CST');
  assert.equal(customerCodePrefixForType('trader'), 'TRD');
  assert.equal(maxCustomerSeqFromCodes(['CST-00003', 'CST-00010', 'TRD-00002'], 'CST'), 10);
  assert.equal(parseCustomerTypeLabel('مستهلك'), 'consumer');
  assert.equal(parseCustomerTypeLabel('تاجر'), 'trader');
  assert.equal(parseCustomerTypeLabel('xyz'), null);
}

{
  const customers = [
    sampleCustomer({ id: '1', code: 'CST-00001', name: 'أحمد محمد', phone: '01012345678', type: 'consumer' }),
    sampleCustomer({ id: '2', code: 'TRD-00001', name: 'مؤسسة النور', phone: '01123456789', type: 'trader' }),
    sampleCustomer({ id: '3', code: 'CST-00002', name: 'سارة علي', phone: '01234567890', type: 'consumer', isActive: false }),
  ];
  assert.equal(matchCustomers(customers, 'CST-00001')[0]?.id, '1');
  assert.equal(matchCustomers(customers, 'النور')[0]?.id, '2');
  assert.equal(matchCustomers(customers, '01012345678')[0]?.id, '1');
  assert.ok(formatCustomerOptionLabel(customers[0]).includes('CST-00001'));
  // inactive excluded from default search
  assert.equal(matchCustomers(customers, 'سارة').length, 0);
}

{
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['كود العميل', 'نوع العميل', 'اسم العميل', 'رقم الهاتف', 'العنوان', 'ملاحظات', 'الحالة'],
    ['CST-00001', 'مستهلك', 'أحمد', '01012345678', 'قاهرة', '', 'نشط'],
    ['TRD-00001', 'تاجر', 'النور', '01123456789', '', '', 'نشط'],
    ['', 'مستهلك', 'بدون كود', '01000000000', '', '', 'نشط'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'العملاء');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const existing = new Map<string, Customer>([
    ['CST-00001', sampleCustomer({ id: 'old', code: 'CST-00001', name: 'قديم', phone: '01012345678' })],
  ]);
  const parsed = parseCustomersExcel(buffer, existing);
  assert.equal(parsed.readyCount, 2);
  assert.equal(parsed.errorCount, 1);
  assert.equal(parsed.rows.find((r) => r.code === 'CST-00001')?.status, 'update');
  assert.equal(parsed.rows.find((r) => r.code === 'CST-00001')?.existingId, 'old');
  assert.equal(parsed.rows.find((r) => r.code === 'TRD-00001')?.status, 'create');
}

{
  // Phone format is not validated on import — store as uploaded.
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['الكود', 'النوع', 'الاسم', 'الهاتف'],
    ['CST-00099', 'مستهلك', 'قصير', '12'],
    ['CST-00100', 'تاجر', 'بدون هاتف', ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'العملاء');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const parsed = parseCustomersExcel(buffer);
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.readyCount, 2);
  assert.equal(parsed.rows.find((r) => r.code === 'CST-00099')?.phone, '12');
  assert.equal(parsed.rows.find((r) => r.code === 'CST-00100')?.phone, '');
}

{
  assert.ok(CUSTOMER_IMPORT_UPDATE_CHUNK <= 500);
  assert.ok(CUSTOMER_IMPORT_CREATE_CHUNK * 2 <= 500);
  const rows = [
    {
      rowNo: 2,
      code: 'CST-1',
      type: 'consumer' as const,
      name: 'أ',
      phone: '',
      isActive: true,
      existingId: 'id-1',
    },
    {
      rowNo: 3,
      code: 'CST-2',
      type: 'consumer' as const,
      name: 'ب',
      phone: '',
      isActive: true,
    },
  ];
  const parts = partitionCustomerImportWriteRows(rows);
  assert.equal(parts.updates.length, 1);
  assert.equal(parts.creates.length, 1);
  assert.equal(chunkCustomerImportRows(new Array(450).fill(0), CUSTOMER_IMPORT_UPDATE_CHUNK).length, 2);
  assert.equal(chunkCustomerImportRows(new Array(250).fill(0), CUSTOMER_IMPORT_CREATE_CHUNK).length, 2);
}

{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const applySrc = readFileSync(join(root, 'modules/customers/lib/applyCustomersImport.ts'), 'utf8');
  assert.match(applySrc, /importUpsertMany/);
  assert.doesNotMatch(applySrc, /upsertByCode/);
  const serviceSrc = readFileSync(join(root, 'modules/customers/services/customerService.ts'), 'utf8');
  assert.match(serviceSrc, /writeBatch/);
  assert.match(serviceSrc, /importUpsertMany/);
}

console.log('customers-master.test.ts: ok');
