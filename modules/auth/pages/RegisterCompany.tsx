import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { signOut } from '../../../services/firebase';
import { tenantService } from '../../../services/tenantService';

const defaultSlug = import.meta.env.VITE_DEFAULT_TENANT_SLUG || 'default';

export const RegisterCompany: React.FC = () => {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!slug.trim() || !name.trim() || !adminEmail.trim() || !password || !adminDisplayName.trim()) {
      setError('يرجى تعبئة الحقول المطلوبة');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setLoading(true);
    try {
      await tenantService.registerCompany({
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminDisplayName: adminDisplayName.trim(),
        password,
      });
      await signOut();
      setDone(true);
    } catch (err: any) {
      const code = err?.code ?? '';
      setError(
        code === 'auth/email-already-in-use'
          ? 'البريد الإلكتروني مستخدم بالفعل'
          : err?.message || 'تعذر إرسال الطلب',
      );
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="erp-auth-page" dir="rtl">
        <div className="erp-auth-card" style={{ maxWidth: 440, width: '100%' }}>
          <div className="erp-auth-card-body text-center">
            <h2 className="text-lg font-bold mb-2">تم استلام طلبك</h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              سيتم مراجعة طلب تسجيل الشركة قريباً. يمكنك تسجيل الدخول لاحقاً من رابط شركتك بعد الموافقة.
            </p>
            <Link className="text-indigo-600 font-semibold text-sm" to={`/t/${slug.trim().toLowerCase() || defaultSlug}/login`}>
              الانتقال لتسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-auth-page" dir="rtl">
      <div className="erp-auth-card" style={{ maxWidth: 480, width: '100%' }}>
        <div className="erp-auth-card-body">
          <h1 className="text-lg font-bold mb-1">تسجيل شركة جديدة</h1>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">
            املأ البيانات لإرسال طلب المراجعة من قبل المشرف العام.
          </p>
          {error ? <p className="text-rose-600 text-sm mb-3">{error}</p> : null}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold mb-1">معرّف الشركة في الرابط (إنجليزي)</label>
              <input
                className="erp-input w-full"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme-corp"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">اسم الشركة</label>
              <input className="erp-input w-full" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">رقم الهاتف</label>
              <input className="erp-input w-full" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">العنوان</label>
              <input className="erp-input w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <hr className="border-[var(--color-border)]" />
            <div>
              <label className="block text-xs font-semibold mb-1">اسم مسؤول الحساب</label>
              <input
                className="erp-input w-full"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">البريد الإلكتروني</label>
              <input
                className="erp-input w-full"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">كلمة المرور</label>
              <input
                className="erp-input w-full"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            </div>
            <button type="submit" className="erp-btn-primary w-full py-2.5 rounded-lg font-semibold" disabled={loading}>
              {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </button>
          </form>
          <p className="text-center text-xs text-[var(--color-text-muted)] mt-4">
            لديك حساب؟{' '}
            <Link to={`/t/${defaultSlug}/login`} className="text-indigo-600 font-semibold">
              تسجيل الدخول
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
