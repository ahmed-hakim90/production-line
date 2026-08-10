import React from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/system-ui/BrandMark';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

/** Matches `Login.tsx` — left panel + container + mobile brand; optional panel background class. */
export const AuthShell: React.FC<{ children: React.ReactNode; panelClassName?: string }> = ({
  children,
  panelClassName,
}) => {
  const { dir } = useAppDirection();
  const { t } = useTranslation();

  return (
  <div className="erp-auth-page" dir={dir}>
    <div className={['erp-auth-panel', panelClassName].filter(Boolean).join(' ')}>
      <div className="erp-auth-panel-logo erp-auth-panel-logo--mark">
        <BrandMark size={44} />
      </div>
      <div className="erp-auth-panel-name">{t('appName')}</div>
      <p className="erp-auth-panel-desc">{t('appTagline')}</p>
      <div className="erp-auth-panel-features">
        {[
          { icon: 'precision_manufacturing', key: 'production' as const },
          { icon: 'inventory_2', key: 'inventory' as const },
          { icon: 'build', key: 'repair' as const },
          { icon: 'groups', key: 'hr' as const },
        ].map((f) => (
          <div key={f.key} className="erp-auth-panel-feature">
            <span className="material-icons-round">{f.icon}</span>
            <span>{t(`authLoading.features.${f.key}`)}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="erp-auth-container">
      <div className="erp-auth-brand">
        <div className="erp-auth-logo erp-auth-logo--mark">
          <BrandMark size={48} />
        </div>
        <div className="erp-auth-app-name">{t('appName')}</div>
        <div className="erp-auth-app-subtitle">{t('appSubtitle')}</div>
      </div>
      {children}
    </div>
  </div>
  );
};
