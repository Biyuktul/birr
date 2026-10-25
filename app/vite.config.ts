import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Stamped into the build so the app can show exactly which commit is
// running. That turns "did my change reach the phone?" into comparing two
// short strings, instead of guessing from a clock.
function buildId(): string {
  // GitHub Actions sets GITHUB_SHA; fall back to the local checkout.
  let sha = process.env.GITHUB_SHA ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim();
    } catch {
      sha = '';
    }
  }
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `${sha ? sha.slice(0, 7) : 'local'} · ${when}`;
}

const BUILD_ID = buildId();

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  // Relative base so the built app works from any path, including file://-ish
  // static hosts and sub-directories.
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Birr — household finance',
        short_name: 'Birr',
        description: 'Accounts, bills, loan, Ekub and an honest cash-flow forecast.',
        theme_color: '#0d0d0d',
        background_color: '#0d0d0d',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything is static and small; cache it all so the app opens offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        // Take over straight away rather than waiting for every tab to close —
        // an installed app on iOS may not be "closed" for days.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
