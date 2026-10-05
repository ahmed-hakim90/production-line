import React, { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PRODUCT_BRAND } from '@/lib/productBrand';
import { dismissHtmlSplash } from '../../lib/dismissHtmlSplash';

export type AppSplashVariant = 'branded' | 'resume';

export type AppSplashScreenProps = {
  /** Status line under the slogan (default: i18n splash.loading / splash.resuming) */
  subtitle?: string;
  /**
   * `branded` — cold boot: logo + slogan + progress.
   * `resume` — same El Maghraby splash with a session-restore status line.
   */
  variant?: AppSplashVariant;
};

/**
 * Full-screen El Maghraby CI splash for initial app boot (mobile + desktop).
 * Visually identical to the static `#html-splash` in index.html so the hand-off is seamless.
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
      className="app-splash"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusLine}
    >
      <svg
        className="app-splash__watermark"
        viewBox="0 0 900 900"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path d="M120 900V500a300 300 0 0 1 600 0v400" stroke="white" strokeOpacity="0.09" strokeWidth="40" />
        <path d="M420 900V500a300 300 0 0 1 600 0v400" stroke="white" strokeOpacity="0.09" strokeWidth="40" />
      </svg>
      <div className="app-splash__glow" aria-hidden="true" />

      <div className="app-splash__stack">
        <img
          className="app-splash__logo"
          src={PRODUCT_BRAND.logoWhiteSrc}
          alt="المغربي EL MAGHRABY"
          width={720}
          height={172}
          decoding="async"
          draggable={false}
        />
        <p className="app-splash__slogan">{PRODUCT_BRAND.slogan}</p>
        <div className="app-splash__progress" aria-hidden="true">
          <span className="app-splash__progress-bar" />
        </div>
        {isResume || subtitle ? <p className="app-splash__status">{statusLine}</p> : null}
      </div>
    </div>
  );
}
