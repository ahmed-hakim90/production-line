import assert from 'node:assert/strict';
import { resolveTenantNavigationTarget } from '../lib/tenantPaths.ts';
import {
  buildCustomerPortalInviteMessage,
  buildCustomerPortalUrl,
} from '../modules/repair/lib/repairPublicLinks.ts';

{
  const url = buildCustomerPortalUrl({
    baseUrl: 'https://app.example.com/',
    tenantSlug: 'acme',
    customerCode: 'c-1001',
  });
  assert.equal(url, 'https://app.example.com/portal/acme?code=C-1001');

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('code'), 'C-1001');
  assert.equal(parsed.searchParams.get('pin'), null);
}

{
  assert.equal(
    buildCustomerPortalUrl({
      baseUrl: 'https://app.example.com',
      tenantSlug: '',
      customerCode: 'C-1001',
    }),
    '',
  );
}

{
  const portalUrl = buildCustomerPortalUrl({
    baseUrl: 'https://app.example.com',
    tenantSlug: 'acme',
    customerCode: 'C-1001',
  });
  const message = buildCustomerPortalInviteMessage({
    customerName: 'أحمد',
    customerCode: 'c-1001',
    pin: '482910',
    portalUrl,
  });
  assert.match(message, /مرحبًا أحمد/);
  assert.match(message, /كود العميل: C-1001/);
  assert.match(message, /رمز الدخول \(PIN\): 482910/);
  assert.ok(message.includes(portalUrl));
  assert.equal(portalUrl.includes('482910'), false);
  assert.equal(new URL(portalUrl).searchParams.has('pin'), false);
}

{
  assert.equal(
    resolveTenantNavigationTarget('acme', '/portal/acme?code=C-1001'),
    '/portal/acme?code=C-1001',
  );
  assert.equal(
    resolveTenantNavigationTarget('acme', '/track/acme'),
    '/track/acme',
  );
}

console.log('customer-portal-share.test.ts: ok');
