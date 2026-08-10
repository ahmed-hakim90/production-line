import React, { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from './BrandMark';
import { dismissHtmlSplash } from '../../lib/dismissHtmlSplash';

export type AppSplashVariant = 'branded' | 'resume';

export type AppSplashScreenProps = {
  /** Status line under the app name (default: i18n splash.loading) */
  subtitle?: string;
  /**
   * `branded` — full cold-boot splash (panel + features).
   * `resume` — compact loader for returning sessions (same visual language, no marketing panel).
   */
  variant?: AppSplashVariant;
};

const SPLASH_FEATURES = [
  { icon: 'precision_manufacturing', key: 'production' as const },
  { icon: 'inventory_2', key: 'inventory' as const },
  { icon: 'build', key: 'repair' as const },
  { icon: 'groups', key: 'hr' as const },
];

/**
 * Full-screen branded splash for initial app boot (mobile + desktop).
 * Use `variant="resume"` for warm session restore — not for in-page data loading.
 */
export function AppSplashScreen({ subtitle, variant = 'branded' }: AppSplashScreenProps) {
  const { t } = useTranslation();
  const isResume = variant === 'resume';
  const statusLine =
    subtitle ?? (isResume ? t('splash.resuming') : t('splash.loading'));

  useLayoutEffect(() => {
    dismissHtmlSplash();
  }, []);

  return (
    <div
      className={isResume ? 'app-splash app-splash--resume' : 'app-splash'}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusLine}
    >
      {!isResume && (
        <div className="app-splash__panel" aria-hidden="true">
          <div className="app-splash__panel-glow app-splash__panel-glow--top" />
          <div className="app-splash__panel-glow app-splash__panel-glow--bottom" />

          <BrandMark size={56} className="app-splash__panel-logo" />

          <h1 className="app-splash__panel-title">{t('splash.appName')}</h1>
          <p className="app-splash__panel-desc">{t('splash.tagline')}</p>

          <ul className="app-splash__features">
            {SPLASH_FEATURES.map(({ icon, key }) => (
              <li key={key} className="app-splash__feature">
                <span className="material-icons-round">{icon}</span>
                <span>{t(`splash.features.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="app-splash__main">
        {!isResume && (
          <div className="app-splash__mobile-brand" aria-hidden="true">
            <BrandMark size={72} className="app-splash__mobile-logo" />
            <h1 className="app-splash__mobile-title">{t('splash.appName')}</h1>
          </div>
        )}

        <div className="app-splash__loader">
          <div className="app-splash__icon-shell">
            <BrandMark size={64} className="app-splash__icon" />
            <div className="app-splash__ring" />
          </div>

          <p className="app-splash__status">{statusLine}</p>

          <div className="erp-loading-dots app-splash__dots">
            <span />
            <span />
            <span />
          </div>

          <div className="app-splash__progress">
            <div className="app-splash__progress-bar" />
          </div>
        </div>

        {!isResume && <p className="app-splash__footer">{t('splash.footer')}</p>}
      </div>
    </div>
  );
}
