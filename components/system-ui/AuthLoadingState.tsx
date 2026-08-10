import React from 'react';
import { useTranslation } from 'react-i18next';
import { PRODUCT_BRAND } from '@/lib/productBrand';
import { BrandMark } from './BrandMark';
import { renderAuthIcon } from './authIcons';

export type AuthLoadingStateProps = {
  /** Main heading under the icon (default: product brand) */
  title?: string;
  /** Status line below the title */
  subtitle: string;
};

/**
 * Centered spinner + progress using `erp-auth-loading-*` classes from App.css.
 */
export function AuthLoadingState({ title = PRODUCT_BRAND.name, subtitle }: AuthLoadingStateProps) {
  return (
    <div className="erp-auth-container erp-auth-loading-wrap">
      <div className="erp-auth-loading-content">
        <div className="erp-auth-loading-icon-shell">
          <div className="erp-auth-loading-icon erp-auth-loading-icon--mark">
            <BrandMark size={40} />
          </div>
          <div className="erp-auth-loading-ring" />
        </div>

        <h2 className="erp-auth-loading-title">{title}</h2>
        <p className="erp-auth-loading-subtitle">{subtitle}</p>

        <div className="erp-loading-dots erp-auth-loading-dots">
          <span />
          <span />
          <span />
        </div>

        <div className="erp-auth-loading-progress">
          <div className="erp-auth-loading-progress-bar" />
        </div>
      </div>
    </div>
  );
}

export type AuthBrandedLoadingPageProps = AuthLoadingStateProps;

/**
 * Full-screen auth layout with left branding panel (desktop) + {@link AuthLoadingState}.
 */
export function AuthBrandedLoadingPage({ title, subtitle }: AuthBrandedLoadingPageProps) {
  const { t } = useTranslation();
  const panelFeatures: { icon: string; key: 'production' | 'inventory' | 'repair' | 'hr' }[] = [
    { icon: 'precision_manufacturing', key: 'production' },
    { icon: 'inventory_2', key: 'inventory' },
    { icon: 'build', key: 'repair' },
    { icon: 'groups', key: 'hr' },
  ];

  return (
    <div className="erp-auth-page has-panel">
      <div className="erp-auth-panel">
        <div className="erp-auth-panel-logo erp-auth-panel-logo--mark">
          <BrandMark size={44} />
        </div>
        <h1 className="erp-auth-panel-name">{t('appName')}</h1>
        <p className="erp-auth-panel-desc">{t('authLoading.panelDescription')}</p>
        <div className="erp-auth-panel-features">
          {panelFeatures.map(({ icon, key }) => (
            <div key={key} className="erp-auth-panel-feature">
              {renderAuthIcon(icon, undefined, 20)}
              <span>{t(`authLoading.features.${key}`)}</span>
            </div>
          ))}
        </div>
      </div>

      <AuthLoadingState title={title ?? t('appName')} subtitle={subtitle} />
    </div>
  );
}
