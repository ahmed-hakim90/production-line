import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import {
  tenantService,
  sanitizeTenantSlugInput,
  getTenantSlugValidationError,
} from '../../../services/tenantService';
import { Button } from '@/components/ui/button';
import { useAppStore } from '../../../store/useAppStore';
import { AuthAlert, AuthCard, AuthField, AuthShell } from '../components';

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
      <AuthCard title="تسجيل شركة جديدة" description="املأ البيانات لإرسال طلب المراجعة من قبل المشرف العام.">
        {error ? (
          <AuthAlert variant="error" icon="error_outline" className="mb-3.5" role="alert">
            {error}
          </AuthAlert>
        ) : null}

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-0" autoComplete="on" noValidate>
          <AuthField
            id="reg-slug"
            label="معرّف الشركة في الرابط (بالإنجليزية)"
            icon="tag"
            value={slug}
            onChange={(e) => setSlug(sanitizeTenantSlugInput(e.target.value))}
            placeholder="acme-corp"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error && error.includes('معرّف الرابط'))}
            aria-describedby="reg-slug-hint"
            hintId="reg-slug-hint"
            hint={
              <>
                رابط الدخول لشركتك: <span dir="ltr">/t/{normalizedSlug || 'your-company'}/login</span>
                <span className="mt-1 block font-normal text-[var(--color-text-muted)]">
                  أحرف إنجليزية صغيرة وأرقام وشرطات فقط؛ لا يبدأ أو ينتهي بشرطة.
                </span>
              </>
            }
          />

          <div className="erp-auth-grid">
            <AuthField
              id="reg-name"
              label="اسم الشركة"
              icon="apartment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="organization"
              placeholder="مثال: مصنع الحكيم للصناعات"
              required
            />
            <AuthField
              id="reg-phone"
              label="رقم الهاتف"
              icon="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+20 10 0000 0000"
            />
          </div>

          <AuthField
            id="reg-address"
            label="العنوان"
            icon="place"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
            placeholder="المدينة - المنطقة الصناعية - الشارع"
          />

          <hr className="my-4 border-[var(--color-border)]" />

          <div className="erp-auth-grid">
            <AuthField
              id="reg-admin-name"
              label="اسم مسؤول الحساب"
              icon="badge"
              value={adminDisplayName}
              onChange={(e) => setAdminDisplayName(e.target.value)}
              autoComplete="name"
              placeholder="الاسم الكامل للمسؤول"
              required
            />
            <AuthField
              id="reg-admin-email"
              label="البريد الإلكتروني"
              icon="email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              dir="ltr"
              autoComplete="email"
              placeholder="admin@company.com"
              required
            />
          </div>

          <AuthField
            id="reg-pwd"
            label="كلمة المرور"
            icon="lock"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            autoComplete="new-password"
            placeholder="6 أحرف على الأقل"
            minLength={6}
            required
            hint="استخدم كلمة مرور قوية تحتوي أحرفًا وأرقامًا."
          />

          <div className="erp-auth-tip register-company-tip">
            <span className="material-icons-round">verified_user</span>
            <p>سيتم إرسال طلبك للمراجعة، وبعد الموافقة ستتمكن من تسجيل الدخول مباشرة.</p>
          </div>

          <Button type="submit" className="erp-auth-btn h-10 w-full border-0 font-bold shadow-md" disabled={loading}>
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
                <span className="material-icons-round text-[17px]">send</span>
                إرسال الطلب
              </>
            )}
          </Button>

          <div className="erp-auth-footer">
            لديك حساب؟{' '}
            <Link to={loginHref}>تسجيل الدخول</Link>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  );
};
