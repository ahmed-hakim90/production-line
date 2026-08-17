/**
 * Contract: materials import opens a modal first (template + file pick + preview).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { parseMaterialsFromBuffer } from '../utils/importMaterials';
import { getMaterialsTemplateSheetRows } from '../utils/downloadTemplates';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = readFileSync(join(root, 'modules/manufacturing/pages/Materials.tsx'), 'utf8');

const uploadItem = page.match(
  /label: 'رفع\/تحديث بيانات المواد'[\s\S]*?onClick: \(\) => [^,]+,/,
);
assert.ok(uploadItem, 'upload menu item must exist');
assert.match(
  uploadItem[0],
  /openImportModal\(\)/,
  'رفع/تحديث بيانات المواد must open the import modal, not the OS file picker',
);
assert.doesNotMatch(
  uploadItem[0],
  /importInputRef\.current\?\.click\(\)/,
  'upload menu item must not jump straight to the file picker',
);

assert.match(page, /function openImportModal|const openImportModal/);
assert.match(page, />\s*تحميل القالب\s*</);
assert.match(page, /اختيار الملف/);
assert.match(page, /اختيار ملف آخر/);
assert.match(page, /downloadMaterialsTemplate\(\)/);
assert.match(page, /حمّل القالب أو اختر ملف Excel لمعاينة الصفوف قبل الحفظ/);
assert.match(page, /IMPORT_PREVIEW_LIMIT/);

const templateRows = getMaterialsTemplateSheetRows();
assert.equal(templateRows[0]?.[0], 'مصدر المادة');
assert.equal(templateRows[0]?.[1], 'كود المادة');
assert.equal(templateRows[0]?.[2], 'اسم المادة');

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(templateRows), 'المواد التصنيعية');
const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
const parsed = parseMaterialsFromBuffer(buffer, [], {
  categories: [
    { id: 'c-elec', name: 'كهرباء' },
    { id: 'c-plas', name: 'بلاستيك' },
    { id: 'c-inj', name: 'حقن' },
  ],
});
assert.equal(parsed.totalRows, 3);
assert.equal(parsed.errorCount, 0);
assert.equal(parsed.validCount, 3);
assert.equal(parsed.newCount, 3);
assert.equal(parsed.rows[0]?.type, 'raw_material');
assert.equal(parsed.rows[2]?.type, 'semi_finished');

console.log('materials-import-modal.test.ts: ok');
