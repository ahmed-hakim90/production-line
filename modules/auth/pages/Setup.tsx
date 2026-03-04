/**
 * Setup Page — First-time admin account creation.
 * Only accessible when zero users exist in the system.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmail, signOut, isConfigured } from '../../../services/firebase';
import { userService } from '../../../services/userService';
import { roleService } from '../../system/services/roleService';

type Step = 'name' | 'email' | 'password';

export const Setup: React.FC = () => {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [hasUsers, setHasUsers] = useState(false);

  const [name, setName]                       = useState('');
  const [email, setEmail]                     = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd]                 = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState(false);

  useEffect(() => {
    if (!isConfigured) { setChecking(false); return; }
    userService.getAll()
      .then((users) => { if (users.length > 0) setHasUsers(true); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!checking && hasUsers) navigate('/login', { replace: true });
  }, [checking, hasUsers, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name || !email || !password) { setError('جميع الحقول مطلوبة'); return; }
    if (password.length < 6) { setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (password !== confirmPassword) { setError('كلمة المرور غير متطابقة'); return; }

    setLoading(true);
    try {
      const roles    = await roleService.seedIfEmpty();
      const adminRole = roles[0];
      const cred     = await createUserWithEmail(email, password);
      await userService.set(cred.user.uid, {
        email,
        displayName: name,
        roleId: adminRole.id!,
        isActive: true,
        createdBy: 'setup',
      });
      await signOut();
      setSuccess(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: any) {
      const code = err?.code ?? '';
      setError(
        code === 'auth/email-already-in-use' ? 'البريد الإلكتروني مستخدم بالفعل' :
        code === 'auth/weak-password'         ? 'كلمة المرور ضعيفة جداً' :
        code === 'auth/invalid-email'         ? 'البريد الإلكتروني غير صالح' :
        'فشل إنشاء الحساب',
      );
      setLoading(false);
    }
  };

  /* ── Loading ── */
  if (checking) {
    return (
      <div className="erp-auth-page">
        <div className="text-center">
          <div className="erp-auth-logo mx-auto mb-3 animate-pulse">
            <span className="material-icons-round" style={{ fontSize: 28 }}>factory</span>
          </div>
          <p className="text-[13px] text-[var(--color-text-muted)] font-semibold">جاري التحقق...</p>
        </div>
      </div>
    );
  }

  /* ── Firebase not configured ── */
  if (!isConfigured) {
    return (
      <div className="erp-auth-page">
        <div className="erp-auth-card" style={{ maxWidth: 440, width: '100%' }}>
          <div className="erp-auth-card-body text-center">
            <span className="material-icons-round text-rose-500 mb-3 block" style={{ fontSize: 48 }}>error</span>
            <h2 className="text-[16px] font-bold text-[var(--color-text)] mb-2">Firebase غير مُعَد</h2>
            <p className="text-[12.5px] text-[var(--color-text-muted)]">
              أضف متغيرات{' '}
              <code className="bg-[#f0f2f5] px-1.5 py-0.5 rounded text-[11px] font-mono">VITE_FIREBASE_*</code>{' '}
              في ملف{' '}
              <code className="bg-[#f0f2f5] px-1.5 py-0.5 rounded text-[11px] font-mono">.env.local</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-auth-page">
      <div className="erp-auth-container">

        {/* Brand */}
        <div className="erp-auth-brand">
          <div className="erp-auth-logo">
            <span className="material-icons-round" style={{ fontSize: 28 }}>factory</span>
          </div>
          <div className="erp-auth-app-name">HAKIMO ERP</div>
          <div className="erp-auth-app-subtitle">إعداد النظام</div>
        </div>

        <div className="erp-auth-card">
          {success ? (
            /* ── Success state ── */
            <div className="erp-auth-card-body text-center py-10">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#e8f5e9' }}
              >
                <span className="material-icons-round text-emerald-500" style={{ fontSize: 36 }}>check_circle</span>
              </div>
              <h2 className="text-[16px] font-bold text-[var(--color-text)] mb-1">تم الإعداد بنجاح!</h2>
              <p className="text-[13px] text-[var(--color-text-muted)]">جاري التحويل لصفحة تسجيل الدخول...</p>
              <div className="erp-progress-wrap mt-6" style={{ maxWidth: 200, margin: '24px auto 0' }}>
                <div className="erp-progress-bar striped" style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <div className="erp-auth-card-body">
              {/* Badge */}
              <div className="flex justify-center mb-5">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-bold"
                  style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
                >
                  <span className="material-icons-round text-[14px]">star</span>
                  إعداد أولي — أول مدير للنظام
                </span>
              </div>

              {/* Error */}
              {error && (
                <div className="erp-alert erp-alert-error mb-4">
                  <span className="material-icons-round text-[18px] shrink-0">error_outline</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} autoComplete="off">
                {/* Full name */}
                <div className="erp-auth-field">
                  <label htmlFor="setup-name">الاسم الكامل</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">person</span>
                    <input
                      id="setup-name"
                      type="text"
                      className="erp-auth-input"
                      placeholder="م. أحمد محمد"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Email */}
                <div className="erp-auth-field">
                  <label htmlFor="setup-email">البريد الإلكتروني</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">email</span>
                    <input
                      id="setup-email"
                      type="email"
                      className="erp-auth-input"
                      placeholder="admin@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="erp-auth-field">
                  <label htmlFor="setup-pwd">كلمة المرور</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">lock</span>
                    <input
                      id="setup-pwd"
                      type={showPwd ? 'text' : 'password'}
                      className="erp-auth-input has-right-action"
                      placeholder="6 أحرف على الأقل"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={6}
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      className="erp-auth-input-right-action"
                      onClick={() => setShowPwd(!showPwd)}
                      tabIndex={-1}
                    >
                      <span className="material-icons-round" style={{ fontSize: 20 }}>
                        {showPwd ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div className="erp-auth-field">
                  <label htmlFor="setup-confirm">تأكيد كلمة المرور</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">lock_reset</span>
                    <input
                      id="setup-confirm"
                      type="password"
                      className={`erp-auth-input${confirmPassword && confirmPassword !== password ? ' border-rose-400!' : ''}`}
                      placeholder="أعد كتابة كلمة المرور"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={6}
                      dir="ltr"
                      required
                    />
                  </div>
                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-[11.5px] text-rose-600 mt-1">كلمة المرور غير متطابقة</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="erp-auth-btn"
                  disabled={loading || !name || !email || !password || password !== confirmPassword}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                        <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      جاري الإنشاء...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round" style={{ fontSize: 18 }}>rocket_launch</span>
                      إنشاء الحساب وبدء النظام
                    </>
                  )}
                </button>
              </form>

              <p
                className="text-center text-[11.5px] mt-4"
                style={{ color: 'var(--color-text-muted)' }}
              >
                سيتم إنشاء حساب بصلاحيات مدير النظام الكاملة
              </p>
            </div>
          )}
        </div>

        <p className="erp-auth-copyright">
          © {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM
        </p>
      </div>
    </div>
  );
};
