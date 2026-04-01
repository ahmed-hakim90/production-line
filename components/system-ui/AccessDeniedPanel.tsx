import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type AccessDeniedPanelProps = {
  title: string;
  description?: string;
  /** e.g. tenant dashboard home */
  homeHref: string;
  homeLabel?: string;
};

/**
 * Centered card for permission / access-denied states (matches `erp-auth-card` patterns).
 */
export function AccessDeniedPanel({
  title,
  description,
  homeHref,
  homeLabel,
}: AccessDeniedPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="erp-auth-page">
      <div className="erp-auth-container flex items-center justify-center min-h-[calc(100vh-2rem)] py-8 px-4">
        <div className="erp-auth-card text-center p-8 max-w-md w-full">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-rose-500/10 p-3 text-rose-600">
              <ShieldOff size={28} strokeWidth={2} aria-hidden />
            </div>
          </div>
          <h2 className="erp-auth-card-title text-lg font-bold text-[var(--color-text)] mb-2">{title}</h2>
          {description ? (
            <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">{description}</p>
          ) : null}
          <Link
            to={homeHref}
            className="erp-auth-btn inline-flex items-center justify-center w-full no-underline"
          >
            {homeLabel || t('accessDenied.backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
