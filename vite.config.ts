import path from 'path';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

function buildFirebaseMessagingSwSource(env: Record<string, string>): string {
  const templatePath = path.resolve(__dirname, 'public/firebase-messaging-sw.js');
  const template = readFileSync(templatePath, 'utf-8');
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
  };
  return `/* Injected by vite firebase-messaging-sw-config plugin */\nself.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};\n${template}`;
}

/** Inject Firebase web config into the FCM service worker for Vite dev + production builds. */
function firebaseMessagingSwPlugin(env: Record<string, string>): Plugin {
  const swUrl = '/firebase-messaging-sw.js';
  return {
    name: 'firebase-messaging-sw-config',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== swUrl) {
          next();
          return;
        }
        const body = buildFirebaseMessagingSwSource(env);
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Service-Worker-Allowed', '/firebase-cloud-messaging-push-scope');
        res.end(body);
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, 'firebase-messaging-sw.js'), buildFirebaseMessagingSwSource(env), 'utf-8');
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    const analyzeBundle = mode === 'analyze';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        firebaseMessagingSwPlugin(env),
        ...(analyzeBundle
          ? [
              visualizer({
                filename: 'dist/stats.html',
                gzipSize: true,
                brotliSize: true,
                open: false,
              }),
            ]
          : []),
        VitePWA({
          // Manifest only — no Workbox precache / runtime cache (see src/purgeLegacyPwaCaches.ts).
          injectRegister: false,
          includeAssets: [
            'icons/forgeops-app-icon.svg',
            'icons/forgeops-app-icon-180.png',
            'icons/forgeops-app-icon-192.png',
            'icons/forgeops-app-icon-512.png',
            'icons/pwa-icon.svg',
            'icons/pwa-icon-180.png',
            'icons/pwa-icon-192.png',
            'icons/pwa-icon-512.png',
          ],
          manifest: {
            name: 'ForgeOps',
            short_name: 'ForgeOps',
            description: 'Factory operations platform — production, inventory, repair, and HR',
            theme_color: '#8f2424',
            background_color: '#f8fafc',
            display: 'standalone',
            scope: '/',
            // Fallback only — TenantPwaManifestSync rewrites start_url to /t/{slug}/ when in a company.
            start_url: '/',
            lang: 'ar',
            // Allow portrait + landscape (tablets / installed PWA).
            orientation: 'any',
            icons: [
              {
                src: '/icons/forgeops-app-icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/icons/forgeops-app-icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/icons/forgeops-app-icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ]
          },
          workbox: {
            globPatterns: [],
            runtimeCaching: [],
            cleanupOutdatedCaches: true,
          },
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        '__APP_VERSION__': JSON.stringify(pkg.version)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks(id) {
              // Vendor chunking
              if (id.includes('node_modules')) {
                if (id.includes('/firebase/')) return 'vendor-firebase';
                if (id.includes('/recharts/')) return 'vendor-recharts';
                if (id.includes('/xlsx/')) return 'vendor-xlsx';
                if (id.includes('/zustand/')) return 'vendor-state';
                if (id.includes('/jspdf/') || id.includes('/html2canvas/') || id.includes('/react-to-print/')) {
                  return 'vendor-print';
                }
                if (id.includes('/qrcode.react/') || id.includes('/html5-qrcode/')) return 'vendor-scan';
                if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
                  return 'vendor-react';
                }
                if (id.includes('@tanstack/react-query')) return 'vendor-query';
                return;
              }

              // Leave app code to Rollup's graph-based chunking to avoid circular chunk groups.
              return;
            },
          },
        },
      },
    };
});
