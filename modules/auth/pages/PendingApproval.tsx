import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';

export const PendingApproval: React.FC = () => {
  const logout               = useAppStore((s) => s.logout);
  const checkApprovalStatus  = useAppStore((s) => s.checkApprovalStatus);
  const userDisplayName      = useAppStore((s) => s.userDisplayName);
  const userEmail            = useAppStore((s) => s.userEmail);

  const [checking, setChecking]     = useState(false);
  const [checkedMsg, setCheckedMsg] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setCheckedMsg('');
    const approved = await checkApprovalStatus();
    if (!approved) setCheckedMsg('حسابك لا يزال قيد المراجعة. يرجى المحاولة لاحقًا.');
    setChecking(false);
  };

  return (
    <div className="erp-auth-page">
      <div className="erp-auth-container" style={{ maxWidth: 480 }}>

        {/* Brand */}
        <div className="erp-auth-brand">
          <div className="erp-auth-logo">
            <span className="material-icons-round" style={{ fontSize: 28 }}>factory</span>
          </div>
          <div className="erp-auth-app-name">HAKIMO ERP</div>
          <div className="erp-auth-app-subtitle">نظام إدارة الإنتاج</div>
        </div>

        {/* Card */}
        <div className="erp-auth-card">
          <div className="erp-auth-card-body">

            {/* Status icon */}
            <div className="text-center mb-5">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#fffbeb', border: '2px solid #fde68a' }}
              >
                <span className="material-icons-round" style={{ fontSize: 32, color: '#d97706' }}>hourglass_top</span>
              </div>
              <h1 className="text-[16px] font-bold text-[var(--color-text)]">
                شركة قيد اعتماد المنصة
              </h1>
              <p className="text-[12.5px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
                تم إنشاء حسابك وتسجيل الشركة بنجاح. يرجى انتظار موافقة إدارة المنصة على تفعيل الشركة؛ بعدها يمكنك
                استخدام النظام بالكامل.
              </p>
            </div>

            {/* User info card */}
            <div
              className="rounded-[var(--border-radius-lg)] border p-4 mb-4"
              style={{ background: '#f8f9fa', borderColor: 'var(--color-border)' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'rgb(var(--color-primary)/0.1)' }}
                >
                  <span className="material-icons-round text-[rgb(var(--color-primary))]" style={{ fontSize: 20 }}>person</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[var(--color-text)] truncate">{userDisplayName}</p>
                  <p className="text-[11.5px] text-[var(--color-text-muted)] font-mono truncate" dir="ltr">{userEmail}</p>
                </div>
              </div>

              {/* Status badge */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-[var(--border-radius-base)]"
                style={{ background: '#fffbeb', border: '1px solid #fde68a' }}
              >
                <span className="material-icons-round text-amber-500" style={{ fontSize: 18 }}>schedule</span>
                <span className="text-[12.5px] font-semibold text-amber-700">الحالة: بانتظار الموافقة</span>
              </div>
            </div>

            {/* Info message after check */}
            {checkedMsg && (
              <div className="erp-alert erp-alert-info mb-4">
                <span className="material-icons-round text-[18px] shrink-0">info</span>
                <span>{checkedMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleCheck}
                disabled={checking}
                className="erp-auth-btn"
              >
                {checking ? (
                  <>
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity=".25" />
                      <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري التحقق...
                  </>
                ) : (
                  <>
                    <span className="material-icons-round" style={{ fontSize: 18 }}>refresh</span>
                    التحقق من حالة الموافقة
                  </>
                )}
              </button>

              <button
                onClick={logout}
                className="w-full h-[40px] flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--color-text-muted)] rounded-[var(--border-radius-base)] transition-colors"
                style={{ background: '#f0f2f5', border: '1px solid var(--color-border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e8eaed')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#f0f2f5')}
              >
                <span className="material-icons-round" style={{ fontSize: 18 }}>logout</span>
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>

        {/* Steps hint */}
        <div
          className="mt-4 rounded-[var(--border-radius-lg)] border p-4"
          style={{ background: 'var(--color-card)', borderColor: 'var(--color-border)' }}
        >
          <p className="text-[11.5px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-3">مراحل التفعيل</p>
          {[
            { icon: 'check_circle', label: 'تم إنشاء الحساب بنجاح', done: true },
            { icon: 'pending', label: 'مراجعة الطلب من المسؤول', done: false },
            { icon: 'lock_open', label: 'الوصول إلى النظام', done: false },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2.5 mb-2 last:mb-0">
              <span
                className="material-icons-round text-[18px] shrink-0"
                style={{ color: step.done ? '#16a34a' : 'var(--color-text-muted)' }}
              >
                {step.icon}
              </span>
              <span
                className="text-[12.5px]"
                style={{ color: step.done ? '#16a34a' : 'var(--color-text-muted)', fontWeight: step.done ? 600 : 400 }}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <p className="erp-auth-copyright">
          &copy; {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM
        </p>
      </div>
    </div>
  );
};
