import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  throw new Error('Firestore and Storage emulators are required. Run: npm run test:quality-security');
}

const projectId = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8')).projects.default;
const firestoreRules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const storageRules = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules: firestoreRules },
  storage: { rules: storageRules },
});

await testEnv.withSecurityRulesDisabled(async (context) => {
  const seedDb = context.firestore();
  const set = (coll, id, data) => seedDb.collection(coll).doc(id).set(data);

await set('roles', 'tenantA-inspector', {
  tenantId: 'tenantA',
  permissions: {
    'quality.pallets.view': true,
    'quality.pallets.inspect': true,
    'quality.samples.inspect': true,
    'quality.defects.record': true,
  },
});
await set('roles', 'tenantA-legacy-inspect', {
  tenantId: 'tenantA',
  permissions: { 'quality.inspect': true, 'quality.view': true },
});
await set('roles', 'tenantA-no-defects', {
  tenantId: 'tenantA',
  permissions: {
    'quality.pallets.view': true,
    'quality.pallets.inspect': true,
    'quality.defects.record': false,
  },
});
await set('roles', 'tenantA-viewer', {
  tenantId: 'tenantA',
  permissions: { 'quality.pallets.view': true },
});
await set('roles', 'tenantA-manager', {
  tenantId: 'tenantA',
  permissions: { 'quality.view': true, 'quality.settings.manage': true },
});
await set('roles', 'tenantA-closer', {
  tenantId: 'tenantA',
  permissions: { 'workOrders.edit': true },
});
await set('roles', 'tenantA-photo', {
  tenantId: 'tenantA',
  permissions: { 'quality.photos.view': true, 'quality.photos.manage': true },
});
await set('roles', 'tenantA-photo-denied', {
  tenantId: 'tenantA',
  permissions: {
    'quality.approve': true,
    'quality.photos.view': true,
    'quality.photos.manage': false,
  },
});
await set('roles', 'tenantA-stranger', {
  tenantId: 'tenantA',
  permissions: { 'products.view': true },
});
await set('roles', 'tenantA-legacy-photo', {
  tenantId: 'tenantA',
  permissions: { 'quality.view': true, 'quality.approve': true },
});
await set('roles', 'tenantB-quality', {
  tenantId: 'tenantB',
  permissions: { 'quality.view': true, 'quality.pallets.view': true, 'quality.photos.view': true },
});

const user = (id, tenantId, roleId) => set('users', id, {
  tenantId,
  isActive: true,
  isSuperAdmin: false,
  roleId,
});
await user('qualityInspector', 'tenantA', 'tenantA-inspector');
await user('qualityLegacy', 'tenantA', 'tenantA-legacy-inspect');
await user('qualityNoDefects', 'tenantA', 'tenantA-no-defects');
await user('qualityViewer', 'tenantA', 'tenantA-viewer');
await user('qualityManager', 'tenantA', 'tenantA-manager');
await user('qualityCloser', 'tenantA', 'tenantA-closer');
await user('qualityPhoto', 'tenantA', 'tenantA-photo');
await user('qualityPhotoDenied', 'tenantA', 'tenantA-photo-denied');
await user('qualityLegacyPhoto', 'tenantA', 'tenantA-legacy-photo');
await user('qualityStranger', 'tenantA', 'tenantA-stranger');
await user('qualityOther', 'tenantB', 'tenantB-quality');

await set('quality_settings', 'tenantA', {
  tenantId: 'tenantA',
  closeRequiresQualityApproval: true,
});
await set('quality_reason_catalog', 'scratch', {
  tenantId: 'tenantA',
  code: 'DEF-1',
  labelAr: 'خدش',
  isActive: false,
});
await set('quality_pallets', 'historical', {
  tenantId: 'tenantA',
  decisionMode: 'auto',
  inspectionStatus: 'تم الفحص',
  palletDecision: 'مرفوض',
});
await seedDb.collection('quality_pallets').doc('historical').collection('defects').doc('scratch').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonCode: 'DEF-1',
  reasonLabel: 'خدش',
  count: 1,
});
await set('quality_inspections', 'retired-a', {
  tenantId: 'tenantA',
  moduleSource: 'legacy',
});
await set('work_orders', 'open-a', {
  tenantId: 'tenantA',
  status: 'in_progress',
  actualWorkHours: 2,
});
await set('employees', 'emp-a', { tenantId: 'tenantA', name: 'مراقب', isActive: true });
await set('employees', 'emp-off', { tenantId: 'tenantA', name: 'موقوف', isActive: false });
await set('employees', 'emp-b', { tenantId: 'tenantB', name: 'آخر', isActive: true });
await set('roles', 'tenantA-print', { tenantId: 'tenantA', permissions: { 'quality.print': true } });
await user('qualityPrint', 'tenantA', 'tenantA-print');
});

const db = (uid) => testEnv.authenticatedContext(uid).firestore();
const inspector = db('qualityInspector');
const legacy = db('qualityLegacy');
const noDefects = db('qualityNoDefects');
const viewer = db('qualityViewer');
const manager = db('qualityManager');
const closer = db('qualityCloser');
const stranger = db('qualityStranger');
const other = db('qualityOther');
const printOnly = db('qualityPrint');
const anon = testEnv.unauthenticatedContext().firestore();

const staffDoc = (employeeId, extra = {}) => ({
  tenantId: 'tenantA',
  employeeId,
  employeeName: 'مراقب',
  userId: '',
  stationIds: [],
  lineIds: [],
  isActive: true,
  createdByUid: 'qualityManager',
  createdByName: 'مدير',
  updatedByUid: 'qualityManager',
  updatedByName: 'مدير',
  ...extra,
});

const waitingPallet = (tenantId) => ({
  tenantId,
  decisionMode: 'auto',
  inspectionStatus: 'في انتظار الفحص',
});

await assertFails(anon.collection('quality_pallets').doc('historical').get());
await assertFails(stranger.collection('quality_pallets').doc('historical').get());
await assertSucceeds(inspector.collection('quality_pallets').doc('new-a').set(waitingPallet('tenantA')));
await assertFails(inspector.collection('quality_pallets').doc('new-b').set(waitingPallet('tenantB')));
await assertFails(viewer.collection('quality_pallets').doc('viewer-write').set(waitingPallet('tenantA')));
await assertSucceeds(inspector.collection('quality_pallets').doc('historical').get());
await assertFails(other.collection('quality_pallets').doc('historical').get());

await assertSucceeds(inspector.collection('quality_pallets').doc('new-a').collection('defects').doc('d1').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertSucceeds(legacy.collection('quality_pallets').doc('new-a').collection('defects').doc('d2').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertFails(noDefects.collection('quality_pallets').doc('new-a').collection('defects').doc('d3').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertSucceeds(viewer.collection('quality_pallets').doc('historical').collection('defects').doc('scratch').get());
const historicalDefect = await inspector.collection('quality_pallets').doc('historical').collection('defects').doc('scratch').get();
assert.equal(historicalDefect.data().reasonLabel, 'خدش');
await assertFails(inspector.collection('quality_pallets').doc('historical').collection('defects').doc('late').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertFails(other.collection('quality_pallets').doc('new-a').collection('defects').doc('cross').set({
  tenantId: 'tenantB',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertFails(inspector.collection('quality_pallets').doc('missing').collection('defects').doc('orphan').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertFails(inspector.collection('quality_pallets').doc('new-a').collection('defects').doc('d1').update({
  tenantId: 'tenantB',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 2,
}));
await assertSucceeds(inspector.collection('quality_pallets').doc('new-a').collection('defects').doc('d1').update({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 2,
}));
await assertFails(inspector.collection('quality_pallets').doc('historical').collection('defects').doc('scratch').delete());
await assertSucceeds(inspector.collection('quality_pallets').doc('new-a').collection('defects').doc('d1').delete());

await assertSucceeds(manager.collection('quality_settings').doc('tenantA').update({
  tenantId: 'tenantA',
  closeRequiresQualityApproval: false,
}));
await assertFails(manager.collection('quality_settings').doc('tenantB').set({
  tenantId: 'tenantB',
  closeRequiresQualityApproval: false,
}));
await assertSucceeds(closer.collection('quality_settings').doc('tenantA').get());
await assertFails(closer.collection('quality_pallets').doc('historical').get());
await assertFails(other.collection('quality_settings').doc('tenantA').get());

await assertSucceeds(viewer.collection('quality_saved_filters').doc('mine').set({
  tenantId: 'tenantA',
  filterType: 'pallets',
  name: 'اليوم',
  createdByUid: 'qualityViewer',
}));
await assertFails(viewer.collection('quality_saved_filters').doc('spoofed').set({
  tenantId: 'tenantA',
  filterType: 'pallets',
  name: 'مزيف',
  createdByUid: 'qualityInspector',
}));
await assertFails(other.collection('quality_saved_filters').doc('mine').get());
await assertSucceeds(viewer.collection('quality_saved_filters').doc('mine').get());

await assertFails(inspector.collection('quality_inspections').doc('new-retired').set({ tenantId: 'tenantA' }));
await assertSucceeds(inspector.collection('quality_inspections').doc('retired-a').get());
await assertFails(other.collection('quality_inspections').doc('retired-a').get());

const photoPath = 'company/tenantA/quality/handover-1/photo.jpg';
const bytes = new Uint8Array([1, 2, 3, 4]);
const storageOf = (uid) => testEnv.authenticatedContext(uid).storage();
await assertSucceeds(uploadBytes(ref(storageOf('qualityPhoto'), photoPath), bytes));
await assertSucceeds(getBytes(ref(storageOf('qualityPhoto'), photoPath)));
await assertFails(uploadBytes(ref(storageOf('qualityViewer'), photoPath), bytes));
await assertFails(uploadBytes(ref(storageOf('qualityPhotoDenied'), photoPath), bytes));
await assertSucceeds(uploadBytes(ref(storageOf('qualityLegacyPhoto'), 'company/tenantA/quality/handover-1/legacy.jpg'), bytes));
await assertSucceeds(getBytes(ref(storageOf('qualityLegacyPhoto'), photoPath)));
await assertFails(getBytes(ref(storageOf('qualityOther'), photoPath)));
await assertFails(getBytes(ref(testEnv.unauthenticatedContext().storage(), photoPath)));
await assertFails(uploadBytes(ref(storageOf('qualityPhoto'), 'company/tenantB/quality/handover-1/photo.jpg'), bytes));

const repairPath = 'company/tenantA/repair_jobs/job-1/photo.jpg';
const logoPath = 'company/tenantA/documents/branding/logo.png';
await assertSucceeds(uploadBytes(ref(storageOf('qualityPhoto'), repairPath), bytes));
await assertSucceeds(getBytes(ref(storageOf('qualityViewer'), repairPath)));
await assertFails(uploadBytes(ref(storageOf('qualityPhoto'), 'company/repair_jobs/tenantA__job-1/photo.jpg'), bytes));
await assertFails(uploadBytes(ref(storageOf('qualityPhoto'), 'print_settings/logo.png'), bytes));
await assertFails(uploadBytes(ref(storageOf('qualityPhoto'), 'branding/logo.png'), bytes));
await assertSucceeds(uploadBytes(ref(storageOf('qualityViewer'), logoPath), bytes));
await assertFails(uploadBytes(ref(storageOf('qualityOther'), repairPath), bytes));
await assertFails(getBytes(ref(storageOf('qualityOther'), repairPath)));

await assertFails(closer.collection('work_orders').doc('open-a').update({
  tenantId: 'tenantA',
  status: 'completed',
}));
await assertFails(inspector.collection('work_orders').doc('closed-direct').set({
  tenantId: 'tenantA',
  status: 'completed',
}));
await assertSucceeds(closer.collection('work_orders').doc('open-a').update({
  tenantId: 'tenantA',
  notes: 'ملاحظة تشغيل',
}));
await assertSucceeds(closer.collection('work_orders').doc('open-a').update({
  tenantId: 'tenantA',
  status: 'paused',
}));

const inspectedPallet = (idSuffix, extra = {}) => ({
  tenantId: 'tenantA',
  decisionMode: 'auto',
  inspectionStatus: 'في انتظار الفحص',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
  ...extra,
});
await assertFails(inspector.collection('quality_pallets').doc('direct-before').set(inspectedPallet('before')));
await assertFails(inspector.collection('quality_hourly_samples').doc('hour-before').set({
  tenantId: 'tenantA',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertSucceeds(manager.collection('quality_workers_assignments').doc('tenantA__emp-a').set(staffDoc('emp-a')));
await assertSucceeds(inspector.collection('quality_pallets').doc('direct-after').set(inspectedPallet('after')));
await assertSucceeds(inspector.collection('quality_hourly_samples').doc('hour-ok').set({
  tenantId: 'tenantA',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertSucceeds(inspector.collection('quality_hourly_samples').doc('hour-ok').collection('defects').doc('scratch').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertFails(other.collection('quality_hourly_samples').doc('hour-ok').collection('defects').doc('cross').set({
  tenantId: 'tenantB',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertSucceeds(inspector.collection('quality_pallets').doc('direct-after').update({
  tenantId: 'tenantA',
  inspectionStatus: 'تم الفحص',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertFails(inspector.collection('quality_pallets').doc('direct-name').set(inspectedPallet('name', { inspectorName: 'اسم آخر' })));
await assertFails(inspector.collection('quality_pallets').doc('direct-other-employee').set(inspectedPallet('other', { inspectorEmployeeId: 'emp-b', inspectorName: 'آخر' })));
await assertSucceeds(manager.collection('quality_workers_assignments').doc('tenantA__emp-a').update({
  lineIds: ['line-1'],
  stationIds: ['station-1'],
  updatedByUid: 'qualityManager',
  updatedByName: 'مدير',
}));
await assertFails(inspector.collection('quality_pallets').doc('direct-line').set(inspectedPallet('line', { lineId: 'line-2' })));
await assertFails(inspector.collection('quality_line_sample_pulls').doc('pull-station').set({
  tenantId: 'tenantA',
  status: 'pending',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
  stationId: 'station-2',
}));
await assertSucceeds(inspector.collection('quality_line_sample_pulls').doc('pull-ok').set({
  tenantId: 'tenantA',
  status: 'pending',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
  stationId: 'station-1',
}));
await assertSucceeds(inspector.collection('quality_line_sample_pulls').doc('pull-ok').collection('defects').doc('scratch').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertSucceeds(inspector.collection('quality_line_sample_pulls').doc('pull-ok').update({
  tenantId: 'tenantA',
  status: 'completed',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
  stationId: 'station-1',
}));
await assertFails(inspector.collection('quality_line_sample_pulls').doc('pull-ok').collection('defects').doc('after').set({
  tenantId: 'tenantA',
  reasonId: 'scratch',
  reasonLabel: 'خدش',
  count: 1,
}));
await assertSucceeds(inspector.collection('quality_line_sample_pulls').doc('pull-ok').get());
await assertSucceeds(manager.collection('quality_workers_assignments').doc('tenantA__emp-a').update({
  lineIds: [],
  stationIds: [],
  updatedByUid: 'qualityManager',
  updatedByName: 'مدير',
}));
await assertSucceeds(manager.collection('quality_workers_assignments').doc('tenantA__emp-a').set(staffDoc('emp-a', { responsibility: 'supervisor' })));
await assertFails(viewer.collection('quality_pallets').doc('after-assignment').set(waitingPallet('tenantA')));
await assertSucceeds(manager.collection('quality_workers_assignments').doc('tenantA__emp-a').update({
  isActive: false,
  updatedByUid: 'qualityManager',
  updatedByName: 'مدير',
}));
await assertFails(inspector.collection('quality_pallets').doc('direct-inactive').set(inspectedPallet('inactive')));
await assertFails(inspector.collection('quality_hourly_samples').doc('hour-inactive').set({
  tenantId: 'tenantA',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertSucceeds(inspector.collection('quality_pallets').doc('historical').get());
await assertSucceeds(inspector.collection('quality_pallets').doc('direct-after').get());
await assertSucceeds(db('qualityLegacyPhoto').collection('quality_pallets').doc('direct-after').update({
  tenantId: 'tenantA',
  inspectionStatus: 'تم الفحص',
  decisionMode: 'manual_accept',
  overrideReason: 'مراجعة',
  overrideByUid: 'qualityLegacyPhoto',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertFails(inspector.collection('quality_pallets').doc('direct-after').update({
  tenantId: 'tenantA',
  inspectionStatus: 'جاري الفحص',
  decisionMode: 'auto',
  reopenReason: 'تصحيح',
  reopenedByUid: 'qualityInspector',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertSucceeds(db('qualityLegacyPhoto').collection('quality_pallets').doc('direct-after').update({
  tenantId: 'tenantA',
  inspectionStatus: 'جاري الفحص',
  decisionMode: 'auto',
  reopenReason: 'تصحيح',
  reopenedByUid: 'qualityLegacyPhoto',
  inspectorEmployeeId: 'emp-a',
  inspectorName: 'مراقب',
  lineId: 'line-1',
}));
await assertFails(viewer.collection('quality_workers_assignments').doc('tenantA__emp-a').set(staffDoc('emp-a', { createdByUid: 'qualityViewer', updatedByUid: 'qualityViewer' })));
await assertFails(inspector.collection('quality_workers_assignments').doc('tenantA__emp-a').set(staffDoc('emp-a', { createdByUid: 'qualityInspector', updatedByUid: 'qualityInspector' })));
await assertFails(manager.collection('quality_workers_assignments').doc('tenantA__emp-a').set(staffDoc('emp-a', { permissions: { 'quality.workers.manage': true } })));
await assertFails(manager.collection('quality_workers_assignments').doc('tenantA__emp-b').set(staffDoc('emp-b')));
await assertFails(manager.collection('quality_workers_assignments').doc('tenantA__emp-off').set(staffDoc('emp-off')));
await assertFails(manager.collection('roles').doc('tenantA-manager').update({
  tenantId: 'tenantA',
  permissions: { 'quality.view': true, 'quality.settings.manage': true, 'roles.manage': true },
}));
await assertFails(printOnly.collection('quality_pallets').doc('historical').get());
await assertFails(printOnly.collection('quality_workers_assignments').doc('tenantA__emp-a').get());
await assertSucceeds(inspector.collection('quality_workers_assignments').doc('tenantA__emp-a').get());

await testEnv.cleanup();
console.log(`quality security rules passed on firestore ${process.env.FIRESTORE_EMULATOR_HOST} storage ${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);
