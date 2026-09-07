
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './src/index.css';
import './src/i18n';
import App from './App';
import { queryClient } from './lib/queryClient';
import { ensureFreshClientWithoutPwaCache } from './src/purgeLegacyPwaCaches';
import { isFirebaseEmulatorMode } from './modules/auth/services/firebase';

async function bootstrap() {
  await ensureFreshClientWithoutPwaCache();

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Could not find root element to mount to');
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        {isFirebaseEmulatorMode && (
          <div
            role="status"
            style={{
              position: 'fixed', insetInline: 0, bottom: 0, zIndex: 100000,
              padding: '7px 12px', textAlign: 'center', background: '#7f1d1d',
              color: '#fff', font: '700 12px Cairo, sans-serif',
            }}
          >
            بيئة اختبار محلية — جميع بيانات Firebase داخل المحاكيات ولا تصل إلى الإنتاج
          </div>
        )}
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
