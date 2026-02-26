import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '@/src/shared/ui/atoms/Button';
import { Input } from '@/src/shared/ui/atoms/Input';

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
              <Input
                label="الاسم الكامل"
                icon="badge"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="مثال: أحمد محمد"
                required
              />

              <Input
                label="البريد الإلكتروني"
                icon="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                autoComplete="email"
                required
                dir="ltr"
              />

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">كلمة المرور</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-lg pointer-events-none">lock</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border bg-slate-50 dark:bg-slate-800 font-medium transition-all outline-none focus:ring-2 focus:bg-white dark:focus:bg-slate-800 border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-primary/20 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 placeholder-slate-400 pr-10 pl-11 h-11 text-sm"
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

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                disabled={!email || !password || !displayName}
                icon="person_add"
              >
                {loading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
              </Button>

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
              <Input
                label="البريد الإلكتروني"
                icon="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
                required
                dir="ltr"
              />

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">كلمة المرور</label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 material-icons-round text-slate-400 text-lg pointer-events-none">lock</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border bg-slate-50 dark:bg-slate-800 font-medium transition-all outline-none focus:ring-2 focus:bg-white dark:focus:bg-slate-800 border-slate-200 dark:border-slate-700 focus:border-primary focus:ring-primary/20 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 placeholder-slate-400 pr-10 pl-11 h-11 text-sm"
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

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                disabled={!email || !password}
                icon="login"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </Button>

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
