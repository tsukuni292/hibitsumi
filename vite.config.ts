/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { version } from './package.json';

// GitHub Pages のサブパスでも動くように相対パスで出力する
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'ひびつみ',
        short_name: 'ひびつみ',
        description: '日々を積んで、まちを育てる。目標達成×街づくりの自己管理アプリ',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f6efe0',
        theme_color: '#3b2a2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 新しい版が届いたらすぐ切り替え、古い版の控えは消す
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // 通知の受け取り（public/push-sw.js）
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
