import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTenantStoragePath, sanitizeStorageFileName } from '../modules/production/services/storagePaths.ts';

const rules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

assert.equal(
  buildTenantStoragePath('MNa4ceoo4E4tdxm8p3xY', 'quality', 'product-1', '171_photo.webp'),
  'company/MNa4ceoo4E4tdxm8p3xY/quality/product-1/171_photo.webp',
);
assert.equal(
  buildTenantStoragePath('tenantA', 'repair_jobs', 'job-1', '171_photo.jpg'),
  'company/tenantA/repair_jobs/job-1/171_photo.jpg',
);
assert.equal(
  buildTenantStoragePath('tenantA', 'documents', 'branding', 'logo.png'),
  'company/tenantA/documents/branding/logo.png',
);
assert.equal(sanitizeStorageFileName('صورة الفحص.jpg'), 'image.jpg');
assert.equal(buildTenantStoragePath('tenantA', 'documents', 'print-logo', 'a/../../logo.png').split('/').length, 5);
assert.throws(() => buildTenantStoragePath('', 'documents', 'branding', 'logo.png'));

assert.match(rules, /company\/\{tenantId\}\/\{module\}\/\{documentId\}\/\{fileName\}/);
assert.match(rules, /'repair_jobs'/);
assert.match(rules, /'documents'/);
assert.match(rules, /allow write: if false/);

const repair = readFileSync(new URL('../modules/repair/utils/repairPhotoStorage.ts', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../modules/system/pages/Settings.tsx', import.meta.url), 'utf8');
const uploader = readFileSync(new URL('../modules/production/services/storageService.ts', import.meta.url), 'utf8');
assert.match(repair, /uploadTenantFile\(file, 'repair_jobs'/);
assert.doesNotMatch(repair, /company\/repair_jobs\//);
assert.match(settings, /uploadTenantFile\(file, 'documents'/);
assert.doesNotMatch(settings, /print_settings\/logo/);
assert.doesNotMatch(settings, /branding\/logo_/);
assert.match(uploader, /uploadBytes\(/);
assert.doesNotMatch(uploader, /uploadBytesResumable/);
assert.match(uploader, /buildTenantStoragePath/);

console.log('storage upload paths passed');
