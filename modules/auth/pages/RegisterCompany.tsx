import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import {
  tenantService,
  sanitizeTenantSlugInput,
  getTenantSlugValidationError,
} from '../../../services/tenantService';
import { useAppStore } from '../../../store/useAppStore';
import { AuthShell } from '../components/AuthShell';

function mapRegisterCompanyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const msg = typeof (err as Error)?.message === 'string' ? (err as Error).message : '';
  if (code === 'auth/email-already-in-use') return 'البريد الإلكتروني مستخدم بالفعل.';
  if (code === 'auth/invalid-email') return 'صيغة البريد الإلكتروني غير صحيحة.';
  if (code === 'auth/weak-password') return 'كلمة المرور ضعيفة. جرّب مزيجاً من الأحرف والأرقام.';
  if (code === 'auth/network-request-failed') return 'تعذر الاتصال. تحقق من الشبكة وحاول مجدداً.';
  if (msg && /[\u0600-\u06FF]/.test(msg)) return msg;
  return msg || 'تعذر إرسال الطلب. حاول لاحقاً.';
}

export const RegisterCompany: React.FC = () => {
  const navigate = useTenantNavigate();
  const initializeApp = useAppStore((s) => s.initializeApp);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const normalizedSlug = sanitizeTenantSlugInput(slug);
  const loginHref = '/login';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const slugErr = getTenantSlugValidationError(slug);
    if (slugErr) {
      setError(slugErr);
      return;
    }
    if (!name.trim() || !adminEmail.trim() || !password || !adminDisplayName.trim()) {
      setError('يرجى تعبئة الحقول المطلوبة.');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setLoading(true);
    try {
      await tenantService.registerCompany({
        slug: normalizedSlug,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminDisplayName: adminDisplayName.trim(),
        password,
      });
      await initializeApp();
      navigate(`/t/${normalizedSlug}/pending`, { replace: true });
    } catch (err: unknown) {
      setError(mapRegisterCompanyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell panelClassName="register-company-auth-panel">
      <div className="erp-auth-card">
        <div className="erp-auth-card-body">
          <div className="erp-auth-headline">
            <h3>تسجيل شركة جديدة</h3>
            <p>املأ البيانات لإرسال طلب المراجعة من قبل المشرف العام.</p>
          </div>

          {error ? (
            <div className="erp-alert erp-alert-error" style={{ marginBottom: 14 }} role="alert">
              <span className="material-icons-round text-[17px] shrink-0">error_outline</span>
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-0" autoComplete="on" noValidate>
            <div className="erp-auth-field">
              <label htmlFor="reg-slug">معرّف الشركة في الرابط (بالإنجليزية)</label>
              <div className="erp-auth-input-wrap">
                <span className="erp-auth-input-icon material-icons-round">tag</span>
                <input
                  id="reg-slug"
                  className="erp-auth-input"
                  value={slug}
                  onChange={(e) => setSlug(sanitizeTenantSlugInput(e.target.value))}
                  placeholder="acme-corp"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error && error.includes('معرّف الرابط'))}
                  aria-describedby="reg-slug-hint"
                />
              </div>
              <p id="reg-slug-hint" className="erp-auth-field-hint">
                رابط الدخول لشركتك: <span dir="ltr">/t/{normalizedSlug || 'your-company'}/login</span>
                <span className="block mt-1 font-normal text-[var(--color-text-muted)]">
                  أحرف إنجليزية صغيرة وأرقام وشرطات فقط؛ لا يبدأ أو ينتهي بشرطة.
                </span>
              </p>
            </div>

            <div className="erp-auth-grid">
              <div className="erp-auth-field">
                <label htmlFor="reg-name">اسم الشركة</label>
                <div className="erp-auth-input-wrap">
                  <span className="erp-auth-input-icon material-icons-round">apartment</span>
                  <input
                    id="reg-name"
                    className="erp-auth-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="organization"
                    placeholder="مثال: مصنع الحكيم للصناعات"
                    required
                  />
                </div>
              </div>

              <div className="erp-auth-field">
                <label htmlFor="reg-phone">رقم الهاتف</label>
                <div className="erp-auth-input-wrap">
                  <span className="erp-auth-input-icon material-icons-round">phone</span>
                  <input
                    id="reg-phone"
                    className="erp-auth-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+20 10 0000 0000"
                  />
                </div>
              </div>
            </div>

            <div className="erp-auth-field">
              <label htmlFor="reg-address">العنوان</label>
              <div className="erp-auth-input-wrap">
                <span className="erp-auth-input-icon material-icons-round">place</span>
                <input
                  id="reg-address"
                  className="erp-auth-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoComplete="street-address"
                  placeholder="المدينة - المنطقة الصناعية - الشارع"
                />
              </div>
            </div>

            <hr className="border-[var(--color-border)] my-4" />

            <div className="erp-auth-grid">
              <div className="erp-auth-field">
                <label htmlFor="reg-admin-name">اسم مسؤول الحساب</label>
                <div className="erp-auth-input-wrap">
                  <span className="erp-auth-input-icon material-icons-round">badge</span>
                  <input
                    id="reg-admin-name"
                    className="erp-auth-input"
                    value={adminDisplayName}
                    onChange={(e) => setAdminDisplayName(e.target.value)}
                    autoComplete="name"
                    placeholder="الاسم الكامل للمسؤول"
                    required
                  />
                </div>
              </div>

              <div className="erp-auth-field">
                <label htmlFor="reg-admin-email">البريد الإلكتروني</label>
                <div className="erp-auth-input-wrap">
                  <span className="erp-auth-input-icon material-icons-round">email</span>
                  <input
                    id="reg-admin-email"
                    type="email"
                    className="erp-auth-input"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    dir="ltr"
                    autoComplete="email"
                    placeholder="admin@company.com"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="erp-auth-field">
              <label htmlFor="reg-pwd">كلمة المرور</label>
              <div className="erp-auth-input-wrap">
                <span className="erp-auth-input-icon material-icons-round">lock</span>
                <input
                  id="reg-pwd"
                  type="password"
                  className="erp-auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  autoComplete="new-password"
                  placeholder="6 أحرف على الأقل"
                  minLength={6}
                  required
                />
              </div>
              <p className="erp-auth-field-hint">استخدم كلمة مرور قوية تحتوي أحرفًا وأرقامًا.</p>
            </div>

            <div className="erp-auth-tip register-company-tip">
              <span className="material-icons-round">verified_user</span>
              <p>سيتم إرسال طلبك للمراجعة، وبعد الموافقة ستتمكن من تسجيل الدخول مباشرة.</p>
            </div>

            <button type="submit" className="erp-auth-btn" disabled={loading}>
              {loading ? (
                <>
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                    <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <span className="material-icons-round" style={{ fontSize: 17 }}>send</span>
                  إرسال الطلب
                </>
              )}
            </button>

            <div className="erp-auth-footer">
              لديك حساب؟{' '}
              <Link to={loginHref}>تسجيل الدخول</Link>
            </div>
          </form>
        </div>
      </div>
    </AuthShell>
  );
};
