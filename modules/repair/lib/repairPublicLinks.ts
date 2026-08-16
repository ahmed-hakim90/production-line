import { tenantSlugFromPathname } from '@/lib/tenantPaths';

/** Public customer URLs must use the deployed app origin when configured. */
export function resolveRepairPublicAppBaseUrl(): string {
  const envUrl = String(import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_SITE_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window === 'undefined') return '';
  return String(window.location.origin || '').replace(/\/+$/, '');
}

export function resolveRepairPublicTenantSlug(tenantSlug?: string | null): string {
  const fromProp = String(tenantSlug || '').trim();
  if (fromProp) return fromProp;
  if (typeof window === 'undefined') return '';
  return String(tenantSlugFromPathname(window.location.pathname) || '').trim();
}

export function buildRepairTrackPublicUrl(input: {
  tenantSlug?: string | null;
  receiptNo?: string | null;
  customerPhone?: string | null;
  baseUrl?: string;
}): string {
  const base = (input.baseUrl || resolveRepairPublicAppBaseUrl()).replace(/\/+$/, '');
  if (!base) return '';
  const slug = resolveRepairPublicTenantSlug(input.tenantSlug);
  if (!slug) return `${base}/track`;
  const params = new URLSearchParams();
  const receipt = String(input.receiptNo || '').trim();
  const phone = String(input.customerPhone || '').trim();
  if (receipt) params.set('receipt', receipt);
  if (phone) params.set('phone', phone);
  const query = params.toString();
  return `${base}/track/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
}

export function buildRepairApprovalPublicUrl(input: {
  tenantSlug?: string | null;
  jobId: string;
  token: string;
  baseUrl?: string;
}): string {
  const base = (input.baseUrl || resolveRepairPublicAppBaseUrl()).replace(/\/+$/, '');
  if (!base) return '';
  const slug = resolveRepairPublicTenantSlug(input.tenantSlug);
  const jobId = String(input.jobId || '').trim();
  const token = String(input.token || '').trim();
  if (!slug || !jobId || !token) return '';
  const params = new URLSearchParams();
  params.set('job', jobId);
  params.set('token', token);
  return `${base}/track/${encodeURIComponent(slug)}/approve?${params.toString()}`;
}

/** Logged-in customer portal. Never put PIN in the URL. */
export function buildCustomerPortalUrl(input: {
  tenantSlug?: string | null;
  customerCode?: string | null;
  baseUrl?: string;
}): string {
  const base = (input.baseUrl || resolveRepairPublicAppBaseUrl()).replace(/\/+$/, '');
  if (!base) return '';
  const slug = resolveRepairPublicTenantSlug(input.tenantSlug);
  if (!slug) return '';
  const params = new URLSearchParams();
  const customerCode = String(input.customerCode || '').trim().toUpperCase();
  if (customerCode) params.set('code', customerCode);
  const query = params.toString();
  return `${base}/portal/${encodeURIComponent(slug)}${query ? `?${query}` : ''}`;
}

export function buildCustomerPortalInviteMessage(input: {
  customerName?: string;
  customerCode: string;
  pin: string;
  portalUrl: string;
}): string {
  const name = String(input.customerName || '').trim() || 'عميلنا';
  const code = String(input.customerCode || '').trim().toUpperCase();
  const pin = String(input.pin || '').trim();
  const portalUrl = String(input.portalUrl || '').trim();
  return [
    `مرحبًا ${name}`,
    'بوابة طلبات الصيانة',
    portalUrl ? `الرابط:\n${portalUrl}` : '',
    code ? `كود العميل: ${code}` : '',
    pin ? `رمز الدخول (PIN): ${pin}` : '',
    'افتح الرابط ثم أدخل كود العميل ورمز PIN لمتابعة طلباتك أو إنشاء طلب صيانة جديد.',
  ].filter(Boolean).join('\n\n');
}
