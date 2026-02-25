import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: [
            'icons/pwa-icon.svg',
            'icons/pwa-icon-180.png',
            'icons/pwa-icon-192.png',
            'icons/pwa-icon-512.png',
          ],
          manifest: {
            name: 'HAKIM PRODUCTION SYSTEM',
            short_name: 'HAKIM ERP',
            description: 'Production management and tracking system',
            theme_color: '#8f2424',
            background_color: '#f6f7f8',
            display: 'standalone',
            scope: '/',
            start_url: '/',
            lang: 'ar',
            orientation: 'portrait-primary',
            icons: [
              {
                src: '/icons/pwa-icon-192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/icons/pwa-icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
              },
              {
                src: '/icons/pwa-icon-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ]
          },
          workbox: {
            navigateFallback: '/index.html',
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                  cacheName: 'google-fonts-stylesheets'
                }
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-webfonts',
                  expiration: {
                    maxEntries: 20,
                    maxAgeSeconds: 60 * 60 * 24 * 365
                  }
                }
              }
            ]
          }
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
                if (id.includes('/jspdf/') || id.includes('/html2canvas/') || id.includes('/react-to-print/')) {
                  return 'vendor-print';
                }
                if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router-dom/')) {
                  return 'vendor-react';
                }
                return;
              }

              // Leave app code to Rollup's default graph-based chunking.
              return;
            },
          },
        },
      },
    };
});
