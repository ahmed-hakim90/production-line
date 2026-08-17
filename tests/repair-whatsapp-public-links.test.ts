import assert from 'node:assert/strict';
import {
  buildRepairApprovalPublicUrl,
  buildRepairTrackPublicUrl,
} from '../modules/repair/lib/repairPublicLinks.ts';
import { normalizeWhatsAppPhone } from '../modules/repair/utils/customerPhone.ts';
import {
  formatRepairApprovalRequestMessage,
  formatRepairIntakeConfirmationMessage,
  formatRepairWhatsAppMessage,
} from '../modules/repair/utils/whatsappRepairMessage.ts';
import type { RepairJob } from '../modules/repair/types.ts';

{
  assert.equal(normalizeWhatsAppPhone('01001234567'), '201001234567');
  assert.equal(normalizeWhatsAppPhone('+20 100 123 4567'), '201001234567');
  assert.equal(normalizeWhatsAppPhone('201001234567'), '201001234567');
  assert.equal(normalizeWhatsAppPhone('00201001234567'), '201001234567');
  assert.equal(normalizeWhatsAppPhone(''), '');
}

{
  const track = buildRepairTrackPublicUrl({
    baseUrl: 'https://app.example.com',
    tenantSlug: 'acme',
    receiptNo: 'REP-1',
    customerPhone: '01001234567',
  });
  assert.equal(
    track,
    'https://app.example.com/track/acme?receipt=REP-1&phone=01001234567',
  );

  const approval = buildRepairApprovalPublicUrl({
    baseUrl: 'https://app.example.com/',
    tenantSlug: 'acme',
    jobId: 'job-1',
    token: 'tok-abc',
  });
  assert.equal(
    approval,
    'https://app.example.com/track/acme/approve?job=job-1&token=tok-abc',
  );

  assert.equal(
    buildRepairApprovalPublicUrl({
      baseUrl: 'https://app.example.com',
      tenantSlug: '',
      jobId: 'job-1',
      token: 'tok',
    }),
    '',
  );
}

const sampleJob = {
  id: 'j1',
  tenantId: 't1',
  receiptNo: 'REP-9',
  branchId: 'b1',
  customerName: 'أحمد',
  customerPhone: '01001234567',
  deviceType: 'موبايل',
  deviceBrand: 'Samsung',
  deviceModel: 'A54',
  problemDescription: 'شاشة',
  status: 'waiting_approval',
  warranty: 'none',
  estimatedCost: 1500,
  laborCost: 200,
  partsUsed: [
    { partId: 'p1', partName: 'شاشة', quantity: 1, unitCost: 1200 },
    { partId: 'p2', partName: 'لصق', quantity: 2, unitCost: 50 },
  ],
  createdAt: '',
  updatedAt: '',
} as RepairJob;

{
  const trackUrl = 'https://app.example.com/track/acme?receipt=REP-9&phone=01001234567';
  const statusMsg = formatRepairWhatsAppMessage(sampleJob, trackUrl);
  assert.match(statusMsg, /مرحباً أحمد/);
  assert.match(statusMsg, /رقم الإيصال: REP-9/);
  assert.match(statusMsg, /رابط متابعة الطلب:/);
  assert.ok(statusMsg.includes(trackUrl));
  assert.ok(statusMsg.includes('\n\n'));

  const intake = formatRepairIntakeConfirmationMessage(sampleJob, trackUrl);
  assert.match(intake, /تم استلام جهازكم/);
  assert.ok(intake.includes(trackUrl));

  const approval = formatRepairApprovalRequestMessage(
    sampleJob,
    'https://app.example.com/track/acme/approve?job=j1&token=tok',
  );
  assert.match(approval, /إجمالي التقدير/);
  assert.match(approval, /شاشة/);
  assert.match(approval, /قطعة/);
  assert.match(approval, /رابط الموافقة أو الرفض/);
  assert.ok(!approval.includes('(أنشئ الرابط أولاً)'));
}

console.log('repair-whatsapp-public-links.test.ts: ok');
