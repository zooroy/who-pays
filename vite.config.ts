/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The new service worker waits; src/lib/appUpdate.ts activates it at a safe
      // moment so a reload never interrupts a form (app-auto-update design §1).
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false, // already matched by globPatterns
      manifest: {
        name: '誰付錢',
        short_name: '誰付錢',
        description: '朋友出國旅行的分帳本：記下誰付了錢，回國前一次結清。',
        lang: 'zh-Hant',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#e3eee8', // 車票綠
        background_color: '#e3eee8',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Static assets only (design.md: no offline data). Includes the 2.2MB CJK font and avatars.
        globPatterns: ['**/*.{js,css,html,woff2,webp,png,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Supabase API, storage and functions are cross-origin and never cached.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than app code, so each gets its own
        // chunk: a deploy only re-downloads the app chunk, and no chunk is over 500 kB.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/]react-router[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
})
