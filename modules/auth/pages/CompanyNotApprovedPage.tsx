import React from 'react';
import { Link } from 'react-router-dom';

type Props = {
  tenantSlug: string;
  /** Raw status from backend when tenant exists but is not active (e.g. `pending`). */
  status?: string;
};

/**
 * Full-screen message when the tenant slug exists but the company is not active yet
 * (e.g. `tenants/{id}.status` is not `active`). Distinct from post-login PendingApproval.
 */
export const CompanyNotApprovedPage: React.FC<Props> = ({ tenantSlug, status }) => {
  const statusLabel = (status || '').trim() || 'غير مفعّل';

  return (
    <div className="erp-auth-page has-panel" dir="rtl">
      <div className="erp-auth-container" style={{ maxWidth: 480 }}>
        <div className="erp-auth-brand">
          <div className="erp-auth-logo">
            <span className="material-icons-round" style={{ fontSize: 28 }}>
              domain
            </span>
          </div>
          <div className="erp-auth-app-name">HAKIMO ERP</div>
          <div className="erp-auth-app-subtitle">نظام إدارة الإنتاج</div>
        </div>

        <div className="erp-auth-card">
          <div className="erp-auth-card-body">
            <div className="text-center mb-5">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#fff7ed', border: '2px solid #fed7aa' }}
              >
                <span className="material-icons-round" style={{ fontSize: 32, color: '#ea580c' }}>
                  gavel
                </span>
              </div>
              <h1 className="text-[17px] font-bold text-[var(--color-text)]">الشركة لم تُعتمد بعد</h1>
              <p className="text-[12.5px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
                حساب هذه الشركة على المنصة ما زال قيد المراجعة أو غير مفعّل. لا يمكن الدخول إلى النظام حتى تتم
                الموافقة من إدارة المنصة وتفعيل الحساب.
              </p>
            </div>

            <div
              className="rounded-[var(--border-radius-lg)] border p-4 mb-5 text-right"
              style={{ background: '#f8f9fa', borderColor: 'var(--color-border)' }}
            >
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide mb-2">
                معرّف الشركة في الرابط
              </p>
              <p className="text-[14px] font-mono font-semibold text-[var(--color-text)] break-all" dir="ltr">
                {tenantSlug}
              </p>
              <p className="text-[11.5px] text-[var(--color-text-muted)] mt-2">
                الحالة الحالية: <span className="font-semibold text-amber-700">{statusLabel}</span>
              </p>
            </div>

            <ul className="text-[12px] text-[var(--color-text-muted)] space-y-2 mb-6 list-disc list-inside">
              <li>إذا كنت قد سجّلت شركة جديدة، استخدم البريد الذي سجّلت به ثم سجّل الدخول من الرابط الصحيح بعد
                الموافقة.</li>
              <li>إن كان الطلب قيد المراجعة، سيُفعّل الحساب تلقائياً فور اعتماد إدارة المنصة.</li>
            </ul>

            <div className="flex flex-col gap-2.5">
              <Link
                to="/register-company"
                className="erp-auth-btn text-center no-underline flex items-center justify-center gap-2"
              >
                <span className="material-icons-round" style={{ fontSize: 18 }}>
                  app_registration
                </span>
                تسجيل شركة جديدة
              </Link>
              <p className="text-[11.5px] text-center text-[var(--color-text-muted)] leading-relaxed px-1">
                بعد اعتماد الشركة من إدارة المنصة، افتح رابط تسجيل الدخول الخاص بشركتك (نفس الرابط الذي يحتوي على
                معرّف الشركة) وسجّل الدخول بالبريد الذي استخدمته عند التسجيل.
              </p>
            </div>
          </div>
        </div>

        <p className="erp-auth-copyright">&copy; {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM</p>
      </div>
    </div>
  );
};
