import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';

export const Login: React.FC = () => {
  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const loading = useAppStore((s) => s.loading);
  const authError = useAppStore((s) => s.authError);

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLocalError('');
    await login(email, password);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    if (!email || !password || !displayName) return;
    if (password.length < 6) {
      setLocalError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    await register(email, password, displayName);
  };

  const switchMode = () => {
    setIsRegister(!isRegister);
    setLocalError('');
  };

  const errorMsg = localError || authError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/30 mx-auto mb-4">
            <span className="material-icons-round text-4xl">factory</span>
          </div>
          <h1 className="text-3xl font-black text-primary tracking-tight">HAKIMO</h1>
          <p className="text-sm text-slate-400 font-bold mt-1">نظام إدارة الإنتاج</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-5 sm:p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black text-slate-800 dark:text-white">
              {isRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {isRegister ? 'أدخل بياناتك لإنشاء حساب' : 'أدخل بيانات حسابك للمتابعة'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3">
              <span className="material-icons-round text-rose-500 text-xl">error</span>
              <span className="text-sm font-bold text-rose-700 dark:text-rose-400">{errorMsg}</span>
            </div>
          )}

          {isRegister ? (
            /* ═══════ Register Form ═══════ */
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">الاسم الكامل</label>
                <div className="relative">
                  <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">badge</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="مثال: أحمد محمد"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">البريد الإلكتروني</label>
                <div className="relative">
                  <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="user@example.com"
                    autoComplete="email"
                    required
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">كلمة المرور</label>
                <div className="relative">
                  <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-11 pl-11 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="6 أحرف على الأقل"
                    minLength={6}
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="material-icons-round text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password || !displayName}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>جاري الإنشاء...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons-round text-xl">person_add</span>
                    <span>إنشاء الحساب</span>
                  </>
                )}
              </button>

              <p className="text-center text-sm text-slate-400 mt-4">
                عندك حساب بالفعل؟{' '}
                <button type="button" onClick={switchMode} className="text-primary font-bold hover:underline">
                  تسجيل الدخول
                </button>
              </p>
            </form>
          ) : (
            /* ═══════ Login Form ═══════ */
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">البريد الإلكتروني</label>
                <div className="relative">
                  <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="admin@example.com"
                    autoComplete="email"
                    required
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">كلمة المرور</label>
                <div className="relative">
                  <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pr-11 pl-11 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="material-icons-round text-xl">{showPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>جاري تسجيل الدخول...</span>
                  </>
                ) : (
                  <>
                    <span className="material-icons-round text-xl">login</span>
                    <span>تسجيل الدخول</span>
                  </>
                )}
              </button>

              <p className="text-center text-sm text-slate-400 mt-4">
                ليس لديك حساب؟{' '}
                <button type="button" onClick={switchMode} className="text-primary font-bold hover:underline">
                  إنشاء حساب جديد
                </button>
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          © {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM
        </p>
      </div>
    </div>
  );
};
