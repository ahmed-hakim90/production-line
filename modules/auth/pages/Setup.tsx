/**
 * Setup Page — First-time admin account creation.
 * Only accessible when zero users exist in the system.
 * After creating the first admin, redirects to /login.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmail, signOut, isConfigured } from '../../../services/firebase';
import { userService } from '../../../services/userService';
import { roleService } from '../../../services/roleService';

export const Setup: React.FC = () => {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [hasUsers, setHasUsers] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setChecking(false);
      return;
    }
    userService.getAll().then((users) => {
      if (users.length > 0) {
        setHasUsers(true);
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!checking && hasUsers) {
      navigate('/login', { replace: true });
    }
  }, [checking, hasUsers, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password) {
      setError('جميع الحقول مطلوبة');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمة المرور غير متطابقة');
      return;
    }

    setLoading(true);
    try {
      // 1. Seed default roles
      const roles = await roleService.seedIfEmpty();
      const adminRole = roles[0]; // First role = admin

      // 2. Create Firebase Auth account
      const cred = await createUserWithEmail(email, password);
      const uid = cred.user.uid;

      // 3. Create user document in Firestore with admin role
      await userService.set(uid, {
        email,
        displayName: name,
        roleId: adminRole.id!,
        isActive: true,
        createdBy: 'setup',
      });

      // 4. Sign out (user will log in via the login page)
      await signOut();

      setSuccess(true);

      // Redirect to login after 2 seconds
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err: any) {
      let msg = 'فشل إنشاء الحساب';
      if (err?.code === 'auth/email-already-in-use') {
        msg = 'البريد الإلكتروني مستخدم بالفعل';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'كلمة المرور ضعيفة جداً';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'البريد الإلكتروني غير صالح';
      }
      setError(msg);
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/30 mx-auto mb-4 animate-pulse">
            <span className="material-icons-round text-4xl">factory</span>
          </div>
          <p className="text-sm text-slate-400 font-bold">جاري التحقق...</p>
        </div>
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md border border-slate-200 dark:border-slate-800 shadow-xl text-center">
          <span className="material-icons-round text-rose-500 text-5xl mb-4 block">error</span>
          <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">Firebase غير مُعَد</h2>
          <p className="text-sm text-slate-500">أضف متغيرات <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-mono">VITE_FIREBASE_*</code> في ملف <code className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-mono">.env.local</code></p>
        </div>
      </div>
    );
  }

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

        {/* Setup Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-8">
          {success ? (
            <div className="text-center py-6">
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-icons-round text-emerald-500 text-4xl">check_circle</span>
              </div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">تم الإعداد بنجاح!</h2>
              <p className="text-sm text-slate-500">جاري التحويل لصفحة تسجيل الدخول...</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full mb-4">
                  <span className="material-icons-round text-amber-500 text-sm">star</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">إعداد أولي</span>
                </div>
                <h2 className="text-xl font-black text-slate-800 dark:text-white">إنشاء حساب المدير</h2>
                <p className="text-sm text-slate-400 mt-1">أنشئ أول حساب مدير للنظام</p>
              </div>

              {error && (
                <div className="mb-6 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-3">
                  <span className="material-icons-round text-rose-500 text-xl">error</span>
                  <span className="text-sm font-bold text-rose-700 dark:text-rose-400">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">الاسم الكامل</label>
                  <div className="relative">
                    <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">person</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="مثال: م. أحمد محمد"
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
                      placeholder="admin@example.com"
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
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="6 أحرف على الأقل"
                      minLength={6}
                      required
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">تأكيد كلمة المرور</label>
                  <div className="relative">
                    <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">lock</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pr-11 pl-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="أعد كتابة كلمة المرور"
                      minLength={6}
                      required
                      dir="ltr"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
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
                      <span className="material-icons-round text-xl">rocket_launch</span>
                      <span>إنشاء الحساب وبدء النظام</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 font-medium">
          سيتم إنشاء حساب بصلاحيات مدير النظام الكاملة
        </p>
      </div>
    </div>
  );
};
