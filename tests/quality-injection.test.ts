import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  injectionMachineNumberKey,
  injectionRowsFromSheet,
  normalizeInjectionMachineNumber,
  normalizeInjectionQualityRecord,
} from '../modules/quality/domain/incomingReceipt.ts';

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
assert.equal(record.acceptedQuantity + record.rejectedQuantity, record.totalQuantity);

const imported = injectionRowsFromSheet([{
  'رقم الماكينة': 'ماكينة رقم 4',
  'اسم الصنف': 'فانوس 70',
  'التاريخ': '22/11/2026',
  'الوردية': 'شيفت نهاري',
  'إجمالي الكمية': 420,
  'المقبول': '',
  'المرفوض': '✓',
  'الكمية المقبول': 0,
  'الكمية المرفوض': 420,
  'ملاحظات': 'يوجد كسور واضحة',
}]);
assert.equal(imported[0]?.date, '2026-11-22');
assert.equal(imported[0]?.acceptedQuantity, 0);
assert.equal(imported[0]?.rejectedQuantity, 420);
assert.equal(imported[0]?.totalQuantity, 420);

assert.throws(() => normalizeInjectionQualityRecord({
  ...record,
  acceptedQuantity: 839,
}), /إجمالي الكمية/);
assert.throws(() => normalizeInjectionQualityRecord({
  ...record,
  rejectedQuantity: -1,
}), /غير سالب/);
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
assert.match(injectionPage, /qualitySettingsService\.listShifts/);
assert.match(injectionPage, /إدارة أرقام الماكينات/);
assert.match(injectionPage, /— اختر رقم الماكينة —/);
assert.match(injectionPage, /— اختر الوردية —/);
assert.ok(indexes.indexes.some((index) => index.collectionGroup === 'quality_injection_records'
  && index.fields.some((field) => field.fieldPath === 'tenantId')
  && index.fields.some((field) => field.fieldPath === 'date')));

console.log('quality injection checks passed');
