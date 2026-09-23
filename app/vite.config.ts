import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// vitest/config re-exports Vite's defineConfig with the `test` field typed —
// see https://vitest.dev/config/ ("Configuring Vite").
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // Deployed at https://atomictrxn.github.io/calculators/app/ alongside the
  // untouched legacy static site at the repo root — see
  // docs/retirement-react-rewrite-plan.md. Only the production build uses
  // that subpath; `vite dev` serves from `/` so local preview doesn't need
  // the GitHub Pages path prefix. Override with BASE_PATH for other targets.
  const base = process.env.BASE_PATH ?? (command === 'build' ? '/calculators/app/' : '/')

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Retirement Planner (React)',
          short_name: 'Retirement Planner',
          description:
            'Project savings year by year and run Monte Carlo simulations to see how likely your retirement plan is to last. Private, on-device, no account.',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
            { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  }
})
