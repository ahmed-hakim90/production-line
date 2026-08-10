import React from 'react';
import { useTranslation } from 'react-i18next';

export interface OfflineConnectionBannerProps {
  online: boolean;
}

/**
 * Surfaces browser online/offline state so users know when Firestore cannot reach the network.
 * Transport errors (QUIC, ERR_NETWORK_CHANGED) often recover automatically; this covers true offline.
 */
export const OfflineConnectionBanner: React.FC<OfflineConnectionBannerProps> = ({ online }) => {
  const { t } = useTranslation();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[52px] left-0 right-0 z-[35] border-b border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)] px-4 py-2 text-center text-sm font-medium text-[rgb(var(--color-warning))] dark:border-[rgb(var(--color-warning)/0.25)] dark:bg-[rgb(var(--color-warning)/0.2)] dark:text-[rgb(var(--color-warning))]"
    >
      {t('layout.offlineConnectionMessage')}
    </div>
  );
};
