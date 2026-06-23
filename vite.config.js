import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Auto-update the service worker when a new build is deployed.
      registerType: 'autoUpdate',
      // Cache the app shell + assets so the PWA loads fully offline.
      // (Firestore data offline-persistence is handled separately in firebase.js.)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'favicon.svg'],
      manifest: {
        name: 'Second Brain',
        short_name: 'Brain',
        description: 'Local-first, offline-capable note capture that syncs across devices.',
        theme_color: '#f7f4ee',
        background_color: '#f7f4ee',
        display: 'standalone',
        orientation: 'portrait',
        // Default landing view. A home-screen shortcut to "/" opens straight to it;
        // the app reads ?view=errands (set below) to land on the Errands view.
        start_url: '/?view=errands',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // App shortcuts (long-press the installed icon) jump to specific views.
        shortcuts: [
          { name: 'Errands', short_name: 'Errands', url: '/?view=errands' },
          { name: 'Inbox', short_name: 'Inbox', url: '/?view=inbox' },
          { name: 'Quick Capture', short_name: 'Capture', url: '/?view=inbox&focus=1' },
        ],
      },
      devOptions: {
        // Enable the service worker in `vite dev` so you can test PWA/offline locally.
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
