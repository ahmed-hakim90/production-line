import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  sanitizeTenantSlugInput,
  getTenantSlugValidationError,
} from '../../../services/tenantService';
import { Button } from '@/components/ui/button';
import { AuthAlert, AuthCard, AuthField, AuthShell } from '../components';

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
      <AuthCard
        title="تسجيل الدخول"
        description="أدخل معرّف شركتك في الرابط (كما حددته عند التسجيل) للانتقال إلى صفحة الدخول."
      >
        {error ? (
          <AuthAlert variant="error" icon="error_outline" className="mb-3.5" role="alert">
            {error}
          </AuthAlert>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-0" autoComplete="on" noValidate>
          <AuthField
            id="gateway-slug"
            label="معرّف الشركة في الرابط"
            icon="tag"
            value={slug}
            onChange={(e) => setSlug(sanitizeTenantSlugInput(e.target.value))}
            placeholder="acme-corp"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby="gateway-slug-hint"
            hintId="gateway-slug-hint"
            hint={
              <>
                سيتم فتح: <span dir="ltr">/t/{normalizedSlug || 'your-company'}/login</span>
              </>
            }
          />

          <Button type="submit" className="erp-auth-btn h-10 w-full border-0 font-bold shadow-md">
            متابعة إلى تسجيل الدخول
          </Button>
        </form>

        <p className="erp-auth-footer-text mt-4 text-center text-sm text-[var(--color-text-muted)]">
          ليس لديك حساب؟{' '}
          <Link to="/register-company" className="font-medium text-[rgb(var(--color-primary))] hover:underline">
            تسجيل شركة
          </Link>
          {' · '}
          <Link to="/" className="font-medium text-[rgb(var(--color-primary))] hover:underline">
            الصفحة الرئيسية
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
};
