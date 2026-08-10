import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/UI';
import { BrandMark } from '@/components/system-ui/BrandMark';
import { useAppStore } from '../../../store/useAppStore';
import { useTenantSlugResolve } from '../context/TenantSlugResolveContext';

export const Login: React.FC = () => {
  const { t } = useTranslation();
  const login    = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const resetUserPassword = useAppStore((s) => s.resetUserPassword);
  const loading  = useAppStore((s) => s.loading);
  const authError = useAppStore((s) => s.authError);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [localError, setLocalError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const { pendingRegistration } = useTenantSlugResolve();

  const errorMsg = localError || authError;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLocalError('');
    setInfoMsg('');
    await login(email, password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setInfoMsg('');
    if (!email || !password || !displayName) return;
    if (password.length < 6) { setLocalError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    await register(email, password, displayName);
  };

  const handleForgotPassword = async () => {
    setLocalError('');
    setInfoMsg('');
    if (!email.trim()) {
      setLocalError('اكتب البريد الإلكتروني أولًا ثم أعد المحاولة.');
      return;
    }
    await resetUserPassword(email.trim());
    setInfoMsg('إذا كان البريد مسجلًا، تم إرسال رابط إعادة تعيين كلمة المرور.');
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setLocalError('');
    setInfoMsg('');
  };

  return (
    <div className="erp-auth-page">

      {/* ── Left branding panel (desktop) ── */}
      <div className="erp-auth-panel">
        <div className="erp-auth-panel-logo erp-auth-panel-logo--mark">
          <BrandMark size={44} />
        </div>
        <div className="erp-auth-panel-name">{t('appName')}</div>
        <p className="erp-auth-panel-desc">{t('appTagline')}</p>
        <div className="erp-auth-panel-features">
          {[
            { icon: 'precision_manufacturing', key: 'production' as const },
            { icon: 'inventory_2', key: 'inventory' as const },
            { icon: 'build', key: 'repair' as const },
            { icon: 'groups', key: 'hr' as const },
          ].map((f) => (
            <div key={f.key} className="erp-auth-panel-feature">
              <span className="material-icons-round">{f.icon}</span>
              <span>{t(`authLoading.features.${f.key}`)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="erp-auth-container">

        {/* Logo (mobile only) */}
        <div className="erp-auth-brand">
          <div className="erp-auth-logo erp-auth-logo--mark">
            <BrandMark size={48} />
          </div>
          <div className="erp-auth-app-name">{t('appName')}</div>
          <div className="erp-auth-app-subtitle">{t('appSubtitle')}</div>
        </div>

        {/* Card */}
        <div className="erp-auth-card">
          <div className="erp-auth-card-body">
            <div className="erp-auth-headline">
              <h3>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</h3>
              <p>{mode === 'login' ? 'أدخل بياناتك للوصول إلى النظام' : 'سيتم مراجعة الحساب من قِبل المسؤول'}</p>
            </div>

            {pendingRegistration && (
              <div className="erp-alert erp-alert-info" style={{ marginBottom: 14 }}>
                <span className="material-icons-round text-[17px] shrink-0">hourglass_top</span>
                <span>
                  تسجيل هذه الشركة ما زال بانتظار موافقة إدارة المنصة. سجّل الدخول بحساب المسؤول الذي أنشأته عند
                  التسجيل؛ بعد الموافقة يُفعّل الوصول تلقائياً.
                </span>
              </div>
            )}

            {/* Tab switcher */}
            <div className="erp-auth-tabs">
              <button
                type="button"
                className={`erp-auth-tab${mode === 'login' ? ' active' : ''}`}
                onClick={() => switchMode('login')}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                className={`erp-auth-tab${mode === 'register' ? ' active' : ''}`}
                onClick={() => switchMode('register')}
              >
                حساب جديد
              </button>
            </div>

            {/* Alerts */}
            {errorMsg && (
              <div className="erp-alert erp-alert-error" style={{ marginBottom: 14 }}>
                <span className="material-icons-round text-[17px] shrink-0">error_outline</span>
                <span>{errorMsg}</span>
              </div>
            )}
            {infoMsg && (
              <div className="erp-alert erp-alert-success" style={{ marginBottom: 14 }}>
                <span className="material-icons-round text-[17px] shrink-0">check_circle</span>
                <span>{infoMsg}</span>
              </div>
            )}

            {/* ── Login form ── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} autoComplete="on">
                <div className="erp-auth-field">
                  <label htmlFor="login-email">البريد الإلكتروني</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">email</span>
                    <input
                      id="login-email"
                      type="email"
                      className="erp-auth-input"
                      placeholder="admin@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div className="erp-auth-field">
                  <label htmlFor="login-pwd">كلمة المرور</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">lock</span>
                    <input
                      id="login-pwd"
                      type={showPwd ? 'text' : 'password'}
                      className="erp-auth-input has-right-action"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      dir="ltr"
                      required
                    />
                    <button
                      type="button"
                      className="erp-auth-input-right-action"
                      onClick={() => setShowPwd(!showPwd)}
                      tabIndex={-1}
                    >
                      <span className="material-icons-round" style={{ fontSize: 19 }}>
                        {showPwd ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="erp-auth-helper-row" style={{ marginBottom: 16 }}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="erp-auth-link-btn"
                    onClick={() => void handleForgotPassword()}
                    disabled={loading}
                  >
                    نسيت كلمة المرور؟
                  </Button>
                </div>

                <button
                  type="submit"
                  className="erp-auth-btn"
                  disabled={loading || !email || !password}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                        <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      جاري تسجيل الدخول...
                    </>
                  ) : (
                    <>
                      <span className="material-icons-round" style={{ fontSize: 17 }}>login</span>
                      تسجيل الدخول
                    </>
                  )}
                </button>

                <div className="erp-auth-footer">
                  ليس لديك حساب؟{' '}
                  <Button type="button" variant="ghost" className="h-auto p-0" onClick={() => switchMode('register')}>إنشاء حساب جديد</Button>
                </div>
              </form>
            )}

            {/* ── Register form ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} autoComplete="on">
                <div className="erp-auth-field">
                  <label htmlFor="reg-name">الاسم الكامل</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">badge</span>
                    <input
                      id="reg-name"
                      type="text"
                      className="erp-auth-input"
                      placeholder="مثال: أحمد محمد"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                </div>

                <div className="erp-auth-field">
                  <label htmlFor="reg-email">البريد الإلكتروني</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">email</span>
                    <input
                      id="reg-email"
                      type="email"
                      className="erp-auth-input"
                      placeholder="user@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      dir="ltr"
                      required
                    />
                  </div>
                </div>

                <div className="erp-auth-field">
                  <label htmlFor="reg-pwd">كلمة المرور</label>
                  <div className="erp-auth-input-wrap">
                    <span className="erp-auth-input-icon material-icons-round">lock</span>
                    <input
                      id="reg-pwd"
                      type={showPwd ? 'text' : 'password'}
                      className="erp-auth-input has-right-action"
                      placeholder="6 أحرف على الأقل"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
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
                      <span className="material-icons-round" style={{ fontSize: 19 }}>
                        {showPwd ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="erp-auth-btn"
                  disabled={loading || !email || !password || !displayName}
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
                      <span className="material-icons-round" style={{ fontSize: 17 }}>person_add</span>
                      إنشاء الحساب
                    </>
                  )}
                </button>

                <div className="erp-auth-footer">
                  عندك حساب بالفعل؟{' '}
                  <Button type="button" variant="ghost" className="h-auto p-0" onClick={() => switchMode('login')}>تسجيل الدخول</Button>
                </div>
              </form>
            )}

            <div className="erp-auth-tip">
              <span className="material-icons-round">verified_user</span>
              <p>الحسابات الجديدة تحتاج موافقة المسؤول قبل تفعيل الدخول.</p>
            </div>
          </div>
        </div>

        <p className="erp-auth-copyright">
          © {new Date().getFullYear()} ForgeOps
        </p>
      </div>
    </div>
  );
};
