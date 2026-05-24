import React, { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { dismissHtmlSplash } from '../../lib/dismissHtmlSplash';

export type AppSplashScreenProps = {
  /** Status line under the app name (default: i18n splash.loading) */
  subtitle?: string;
};

const SPLASH_FEATURES = [
  { icon: 'precision_manufacturing', key: 'production' as const },
  { icon: 'inventory_2', key: 'inventory' as const },
  { icon: 'groups', key: 'hr' as const },
  { icon: 'bar_chart', key: 'analytics' as const },
];

/**
 * Full-screen branded splash for initial app boot (mobile + desktop).
 */
export function AppSplashScreen({ subtitle }: AppSplashScreenProps) {
  const { t } = useTranslation();
  const statusLine = subtitle ?? t('splash.loading');

  useLayoutEffect(() => {
    dismissHtmlSplash();
  }, []);

  return (
    <div
      className="app-splash"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusLine}
    >
      <div className="app-splash__panel" aria-hidden="true">
        <div className="app-splash__panel-glow app-splash__panel-glow--top" />
        <div className="app-splash__panel-glow app-splash__panel-glow--bottom" />

        <img
          className="app-splash__panel-logo"
          src="/icons/pwa-icon.svg"
          alt=""
          width={56}
          height={56}
          decoding="async"
        />

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

      <div className="app-splash__main">
        <div className="app-splash__mobile-brand" aria-hidden="true">
          <img
            className="app-splash__mobile-logo"
            src="/icons/pwa-icon.svg"
            alt=""
            width={72}
            height={72}
            decoding="async"
          />
          <h1 className="app-splash__mobile-title">{t('splash.appName')}</h1>
        </div>

        <div className="app-splash__loader">
          <div className="app-splash__icon-shell">
            <img
              className="app-splash__icon"
              src="/icons/pwa-icon.svg"
              alt=""
              width={64}
              height={64}
              decoding="async"
            />
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

        <p className="app-splash__footer">{t('splash.footer')}</p>
      </div>
    </div>
  );
}
