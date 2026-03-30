import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  sanitizeTenantSlugInput,
  getTenantSlugValidationError,
} from '../../../services/tenantService';
import { AuthShell } from '../components/AuthShell';

/** Root `/login` — user enters company slug, then navigates to `/t/:slug/login`. */
export const TenantLoginGateway: React.FC = () => {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const normalizedSlug = sanitizeTenantSlugInput(slug);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const slugErr = getTenantSlugValidationError(slug);
    if (slugErr) {
      setError(slugErr);
      return;
    }
    navigate(`/t/${normalizedSlug}/login`, { replace: false });
  };

  return (
    <AuthShell>
      <div className="erp-auth-card">
        <div className="erp-auth-card-body">
          <div className="erp-auth-headline">
            <h3>تسجيل الدخول</h3>
            <p>أدخل معرّف شركتك في الرابط (كما حددته عند التسجيل) للانتقال إلى صفحة الدخول.</p>
          </div>

          {error ? (
            <div className="erp-alert erp-alert-error" style={{ marginBottom: 14 }} role="alert">
              <span className="material-icons-round text-[17px] shrink-0">error_outline</span>
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-0" autoComplete="on" noValidate>
            <div className="erp-auth-field">
              <label htmlFor="gateway-slug">معرّف الشركة في الرابط</label>
              <div className="erp-auth-input-wrap">
                <span className="erp-auth-input-icon material-icons-round">tag</span>
                <input
                  id="gateway-slug"
                  className="erp-auth-input"
                  value={slug}
                  onChange={(e) => setSlug(sanitizeTenantSlugInput(e.target.value))}
                  placeholder="acme-corp"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby="gateway-slug-hint"
                />
              </div>
              <p id="gateway-slug-hint" className="erp-auth-field-hint">
                سيتم فتح: <span dir="ltr">/t/{normalizedSlug || 'your-company'}/login</span>
              </p>
            </div>

            <button type="submit" className="erp-auth-btn">
              متابعة إلى تسجيل الدخول
            </button>
          </form>

          <p className="erp-auth-footer-text mt-4 text-center text-sm text-[var(--color-text-muted)]">
            ليس لديك حساب؟{' '}
            <Link to="/register-company" className="text-[rgb(var(--color-primary))] font-medium hover:underline">
              تسجيل شركة
            </Link>
            {' · '}
            <Link to="/" className="text-[rgb(var(--color-primary))] font-medium hover:underline">
              الصفحة الرئيسية
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
};
