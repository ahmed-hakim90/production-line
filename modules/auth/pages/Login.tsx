import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '../../../store/useAppStore';
import { AuthAlert, AuthCard, AuthField, AuthPasswordField } from '../components';
import { useTenantSlugResolve } from '../context/TenantSlugResolveContext';

export const Login: React.FC = () => {
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
    <div className="erp-auth-page" dir="rtl">

      {/* ── Left branding panel (desktop) ── */}
      <div className="erp-auth-panel">
        <div className="erp-auth-panel-logo">
          <span className="material-icons-round" style={{ fontSize: 26, color: '#fff' }}>factory</span>
        </div>
        <div className="erp-auth-panel-name">HAKIMO ERP</div>
        <p className="erp-auth-panel-desc">نظام متكامل لإدارة الإنتاج والمخزون والموارد البشرية</p>
        <div className="erp-auth-panel-features">
          {[
            { icon: 'inventory_2',   label: 'إدارة الإنتاج والمخزون' },
            { icon: 'groups',        label: 'إدارة الموظفين والحضور' },
            { icon: 'bar_chart',     label: 'تقارير وتحليلات مفصلة' },
            { icon: 'admin_panel_settings', label: 'نظام صلاحيات متقدم' },
          ].map((f) => (
            <div key={f.icon} className="erp-auth-panel-feature">
              <span className="material-icons-round">{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="erp-auth-container">

        {/* Logo (mobile only) */}
        <div className="erp-auth-brand">
          <div className="erp-auth-logo">
            <span className="material-icons-round" style={{ fontSize: 26 }}>factory</span>
          </div>
          <div className="erp-auth-app-name">HAKIMO ERP</div>
          <div className="erp-auth-app-subtitle">نظام إدارة الإنتاج</div>
        </div>

        <AuthCard
          title={mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          description={
            mode === 'login' ? 'أدخل بياناتك للوصول إلى النظام' : 'سيتم مراجعة الحساب من قِبل المسؤول'
          }
        >
          <div className="space-y-3">
            {pendingRegistration ? (
              <AuthAlert variant="info" icon="hourglass_top">
                تسجيل هذه الشركة ما زال بانتظار موافقة إدارة المنصة. سجّل الدخول بحساب المسؤول الذي أنشأته عند
                التسجيل؛ بعد الموافقة يُفعّل الوصول تلقائياً.
              </AuthAlert>
            ) : null}

            <Tabs value={mode} onValueChange={(v) => switchMode(v as 'login' | 'register')}>
              <TabsList className="grid h-10 w-full grid-cols-2 bg-[var(--color-surface-hover)]/80 p-1">
                <TabsTrigger
                  value="login"
                  className="text-xs font-semibold data-[state=active]:bg-[var(--color-card)] data-[state=active]:shadow-sm"
                >
                  تسجيل الدخول
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="text-xs font-semibold data-[state=active]:bg-[var(--color-card)] data-[state=active]:shadow-sm"
                >
                  حساب جديد
                </TabsTrigger>
              </TabsList>

              {errorMsg ? (
                <AuthAlert variant="error" icon="error_outline" className="mt-3">
                  {errorMsg}
                </AuthAlert>
              ) : null}
              {infoMsg ? (
                <AuthAlert variant="success" icon="check_circle" className="mt-3">
                  {infoMsg}
                </AuthAlert>
              ) : null}

              <TabsContent value="login" className="mt-4 space-y-0 outline-none">
                <form onSubmit={handleLogin} autoComplete="on" className="space-y-0">
                  <AuthField
                    id="login-email"
                    label="البريد الإلكتروني"
                    icon="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    dir="ltr"
                    required
                  />
                  <AuthPasswordField
                    id="login-pwd"
                    label="كلمة المرور"
                    icon="lock"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    dir="ltr"
                    required
                    showPassword={showPwd}
                    onTogglePassword={() => setShowPwd(!showPwd)}
                  />
                  <div className="mb-4 flex justify-end">
                    <button
                      type="button"
                      className="erp-auth-link-btn"
                      onClick={() => void handleForgotPassword()}
                      disabled={loading}
                    >
                      نسيت كلمة المرور؟
                    </button>
                  </div>
                  <Button
                    type="submit"
                    className="erp-auth-btn h-10 w-full border-0 font-bold shadow-md"
                    disabled={loading || !email || !password}
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                          <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        جاري تسجيل الدخول...
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round text-[17px]">login</span>
                        تسجيل الدخول
                      </>
                    )}
                  </Button>
                  <div className="erp-auth-footer">
                    ليس لديك حساب؟{' '}
                    <button type="button" onClick={() => switchMode('register')}>
                      إنشاء حساب جديد
                    </button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-4 space-y-0 outline-none">
                <form onSubmit={handleRegister} autoComplete="on" className="space-y-0">
                  <AuthField
                    id="reg-name"
                    label="الاسم الكامل"
                    icon="badge"
                    type="text"
                    placeholder="مثال: أحمد محمد"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                  <AuthField
                    id="reg-email"
                    label="البريد الإلكتروني"
                    icon="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    dir="ltr"
                    required
                  />
                  <AuthPasswordField
                    id="reg-pwd"
                    label="كلمة المرور"
                    icon="lock"
                    placeholder="6 أحرف على الأقل"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    dir="ltr"
                    required
                    showPassword={showPwd}
                    onTogglePassword={() => setShowPwd(!showPwd)}
                  />
                  <Button
                    type="submit"
                    className="erp-auth-btn h-10 w-full border-0 font-bold shadow-md"
                    disabled={loading || !email || !password || !displayName}
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                          <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        جاري الإنشاء...
                      </>
                    ) : (
                      <>
                        <span className="material-icons-round text-[17px]">person_add</span>
                        إنشاء الحساب
                      </>
                    )}
                  </Button>
                  <div className="erp-auth-footer">
                    عندك حساب بالفعل؟{' '}
                    <button type="button" onClick={() => switchMode('login')}>
                      تسجيل الدخول
                    </button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>

            <div className="erp-auth-tip mt-4">
              <span className="material-icons-round">verified_user</span>
              <p>الحسابات الجديدة تحتاج موافقة المسؤول قبل تفعيل الدخول.</p>
            </div>
          </div>
        </AuthCard>

        <p className="erp-auth-copyright">
          © {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM
        </p>
      </div>
    </div>
  );
};
