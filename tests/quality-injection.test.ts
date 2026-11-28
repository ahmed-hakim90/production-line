import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  INJECTION_SHIFTS,
  normalizeInjectionShift,
  injectionMachineNumberKey,
  injectionRowsFromSheet,
  normalizeInjectionMachineNumber,
  normalizeInjectionQualityRecord,
} from '../modules/quality/domain/incomingReceipt.ts';
import {
  filterInjectionRecordsByDateRange,
  isMissingFirestoreIndexError,
} from '../modules/quality/domain/injectionRange.ts';

const record = normalizeInjectionQualityRecord({
  machineNumber: ' ماكينة رقم 1 ',
  itemName: 'فانوس 47',
  date: '2026-11-25',
  shift: 'شيفت ليلي',
  totalQuantity: 840,
  acceptedQuantity: 840,
  rejectedQuantity: 0,
  notes: 'لا يوجد',
});
assert.equal(record.machineNumber, 'ماكينة رقم 1');
assert.equal(normalizeInjectionMachineNumber('  ماكينة   12  '), 'ماكينة 12');
assert.equal(injectionMachineNumberKey(' ماكينة 12 '), 'ماكينة 12');
assert.throws(() => normalizeInjectionMachineNumber(' '), /رقم الماكينة مطلوب/);
assert.deepEqual(INJECTION_SHIFTS, ['نهاري', 'ليلي']);
assert.equal(normalizeInjectionShift(' شيفت   نهاري '), 'نهاري');
assert.equal(normalizeInjectionShift('شيفت ليلي'), 'ليلي');
assert.equal(record.acceptedQuantity + record.rejectedQuantity, record.totalQuantity);
assert.equal(isMissingFirestoreIndexError({
  code: 'failed-precondition',
  message: 'The query requires an index.',
}), true);
assert.equal(isMissingFirestoreIndexError({
  code: 'permission-denied',
  message: 'The query requires an index.',
}), false);
assert.deepEqual(filterInjectionRecordsByDateRange([
  { ...record, id: 'before', date: '2026-10-31' },
  { ...record, id: 'in-range', date: '2026-11-25' },
  { ...record, id: 'after', date: '2026-12-01' },
] as Array<typeof record & { id: string; tenantId: string; moduleSource: 'qms'; createdByUid: string; createdByName: string; updatedByUid: string; updatedByName: string }>, '2026-11-01', '2026-11-30')
  .map((row) => row.id), ['in-range']);

const imported = injectionRowsFromSheet([{
  'رقم الماكينة': 'ماكينة رقم 4',
  'اسم الصنف': 'فانوس 70',
  'التاريخ': '22/112026',
  'الوردية': 'شيفت نهاري',
  'إجمالي الكمية': 420,
  'المقبول': '',
  'المرفوض': '✓',
  'الكمية المقبولة': 0,
  'الكمية المرفوضة': 420,
  'ملاحظات': 'يوجد كسور واضحة',
}]);
assert.equal(imported[0]?.date, '2026-11-22');
assert.equal(imported[0]?.acceptedQuantity, 0);
assert.equal(imported[0]?.rejectedQuantity, 420);
assert.equal(imported[0]?.totalQuantity, 420);

const acceptedWithMark = injectionRowsFromSheet([{
  'ملاحظات': 'لا يوجد',
  'الكمية المرفوضة': 0,
  'الكمية المقبولة': 200,
  'المرفوض': '',
  'المقبول': '✓',
  'إجمالي الكمية': 200,
  'الوردية': 'شيفت نهاري',
  'التاريخ': '2026-11-22',
  'اسم الصنف': 'هلال * فانوس استكريدجديد',
  'رقم الماكينة': 'ماكينة رقم 9',
}]);
assert.equal(acceptedWithMark[0]?.acceptedQuantity, 200);
assert.equal(acceptedWithMark[0]?.rejectedQuantity, 0);

const workbook = XLSX.utils.book_new();
const worksheet = XLSX.utils.aoa_to_sheet([
  ['رقم الماكينة', 'اسم الصنف', 'التاريخ', 'الوردية', 'إجمالي الكمية', 'المقبول', 'المرفوض', 'الكمية المقبولة', 'الكمية المرفوضة', 'ملاحظات', 'م'],
  ['ماكينة رقم 9', 'هلال * فانوس استكريدجديد', '22/112026', 'شيفت نهاري', 200, '✓', '', 200, 0, 'لا يوجد', 1],
  ['', '', '', '', '', '', '', '', '', '', 18],
  ['', '', '', '', '', '', '', '', '', '', 19],
]);
XLSX.utils.book_append_sheet(workbook, worksheet, 'متابعة الحقن');
const workbookBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
const parsedWorkbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: false });
const parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  parsedWorkbook.Sheets['متابعة الحقن'],
  { defval: '' },
);
const importedWorkbookRows = injectionRowsFromSheet(parsedRows);
assert.equal(importedWorkbookRows[0]?.date, '2026-11-22');
assert.equal(importedWorkbookRows[0]?.acceptedQuantity, 200);
assert.equal(importedWorkbookRows[0]?.rejectedQuantity, 0);
assert.equal(importedWorkbookRows.length, 1);

assert.throws(() => normalizeInjectionQualityRecord({
  ...record,
  acceptedQuantity: 839,
}), /إجمالي الكمية/);
assert.throws(() => normalizeInjectionQualityRecord({
  ...record,
  rejectedQuantity: -1,
}), /غير سالب/);
assert.throws(() => normalizeInjectionQualityRecord({
  ...record,
  shift: 'وردية ثالثة',
}), /اختر الوردية النهارية أو الليلية/);
assert.throws(() => injectionRowsFromSheet([{
  'رقم الماكينة': 'ماكينة 1',
  'اسم الصنف': 'صنف',
  'التاريخ': '2026-11-25',
  'الوردية': 'نهاري',
  'إجمالي الكمية': 3,
  'الكمية المقبول': 2,
  'الكمية المرفوض': 0,
}]), /الصف 2: إجمالي الكمية/);

const routes = readFileSync(new URL('../modules/quality/routes/index.ts', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../config/menu.config.ts', import.meta.url), 'utf8');
const indexes = JSON.parse(readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8')) as {
  indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order?: string }> }>;
};
assert.match(routes, /path: '\/quality\/injection', permission: 'quality\.incoming\.view', component: QualityInjection/);
assert.match(menu, /quality-injection[\s\S]{0,150}متابعة جودة قسم الحقن/);
const injectionPage = readFileSync(new URL('../modules/quality/pages/QualityInjection.tsx', import.meta.url), 'utf8');
assert.match(injectionPage, /إدارة أرقام الماكينات/);
assert.match(injectionPage, /— اختر رقم الماكينة —/);
assert.match(injectionPage, /— اختر الوردية —/);
assert.match(injectionPage, /INJECTION_SHIFTS\.map/);
assert.match(injectionPage, /تحديد كل سجلات الحقن المعروضة/);
assert.match(injectionPage, /حذف المحدد/);
assert.match(injectionPage, /quality\.records\.delete/);
const incomingService = readFileSync(new URL('../modules/quality/services/qualityIncomingService.ts', import.meta.url), 'utf8');
assert.match(incomingService, /async removeMany\(ids: string\[\]\)/);
assert.ok(indexes.indexes.some((index) => index.collectionGroup === 'quality_injection_records'
  && index.fields.some((field) => field.fieldPath === 'tenantId')
  && index.fields.some((field) => field.fieldPath === 'date')));

console.log('quality injection checks passed');
