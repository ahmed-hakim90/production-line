import React from 'react';
import { renderAuthIcon } from './authIcons';

const PANEL_FEATURES: { icon: string; text: string }[] = [
  { icon: 'precision_manufacturing', text: 'إدارة خطوط وخطط الإنتاج' },
  { icon: 'inventory_2', text: 'متابعة المخزون والمواد الخام' },
  { icon: 'groups', text: 'إدارة الموارد البشرية والحضور' },
  { icon: 'bar_chart', text: 'تقارير وتحليلات متقدمة' },
];

export type AuthLoadingStateProps = {
  /** Main heading under the icon (default: Hakimo ERP) */
  title?: string;
  /** Status line below the title */
  subtitle: string;
};

/**
 * Centered spinner + progress using `erp-auth-loading-*` classes from App.css.
 */
export function AuthLoadingState({ title = 'Hakimo ERP', subtitle }: AuthLoadingStateProps) {
  return (
    <div className="erp-auth-container erp-auth-loading-wrap">
      <div className="erp-auth-loading-content">
        <div className="erp-auth-loading-icon-shell">
          <div className="erp-auth-loading-icon">{renderAuthIcon('factory', undefined, 20)}</div>
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
  return (
    <div className="erp-auth-page has-panel" dir="rtl">
      <div className="erp-auth-panel">
        <div className="erp-auth-panel-logo">{renderAuthIcon('factory', undefined, 26)}</div>
        <h1 className="erp-auth-panel-name">Hakimo ERP</h1>
        <p className="erp-auth-panel-desc">نظام متكامل لإدارة الإنتاج والمخزون والموارد البشرية</p>
        <div className="erp-auth-panel-features">
          {PANEL_FEATURES.map(({ icon, text }) => (
            <div key={icon} className="erp-auth-panel-feature">
              {renderAuthIcon(icon, undefined, 20)}
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>

      <AuthLoadingState title={title} subtitle={subtitle} />
    </div>
  );
}
