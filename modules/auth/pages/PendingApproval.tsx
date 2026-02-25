import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';

export const PendingApproval: React.FC = () => {
  const logout = useAppStore((s) => s.logout);
  const checkApprovalStatus = useAppStore((s) => s.checkApprovalStatus);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);

  const [checking, setChecking] = useState(false);
  const [checkedMsg, setCheckedMsg] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setCheckedMsg('');
    const approved = await checkApprovalStatus();
    if (!approved) {
      setCheckedMsg('حسابك لا يزال قيد المراجعة. يرجى الانتظار.');
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-amber-50/30 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-200/50 dark:shadow-amber-900/20">
          <span className="material-icons-round text-amber-600 dark:text-amber-400 text-5xl">hourglass_top</span>
        </div>

        <h1 className="text-2xl font-black text-slate-800 dark:text-white mb-2">
          في انتظار موافقة المسؤول
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-8 leading-relaxed">
          تم إنشاء حسابك بنجاح. يرجى انتظار موافقة مسؤول النظام
          <br />
          حتى تتمكن من الوصول إلى النظام.
        </p>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 mb-6">
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-icons-round text-primary text-2xl">person</span>
            </div>
            <div className="text-right flex-1 min-w-0">
              <p className="font-bold text-slate-800 dark:text-white truncate">{userDisplayName}</p>
              <p className="text-xs text-slate-400 font-mono truncate" dir="ltr">{userEmail}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
            <span className="material-icons-round text-amber-500 text-lg">schedule</span>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-400">الحالة: بانتظار الموافقة</span>
          </div>
        </div>

        {checkedMsg && (
          <div className="mb-4 px-4 py-3 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2">
            <span className="material-icons-round text-slate-400 text-lg">info</span>
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{checkedMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                جاري التحقق...
              </>
            ) : (
              <>
                <span className="material-icons-round text-xl">refresh</span>
                التحقق من حالة الموافقة
              </>
            )}
          </button>

          <button
            onClick={logout}
            className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-icons-round text-xl">logout</span>
            تسجيل الخروج
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-8 font-medium">
          &copy; {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM
        </p>
      </div>
    </div>
  );
};
