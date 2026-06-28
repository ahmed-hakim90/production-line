import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;
const RELOAD_GUARD_KEY = 'pwa-update-reload-in-progress';

export function registerPwaAutoUpdate(): void {
  if (!('serviceWorker' in navigator)) return;

  sessionStorage.removeItem(RELOAD_GUARD_KEY);

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void registration.update();
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
    window.location.reload();
  });
}
