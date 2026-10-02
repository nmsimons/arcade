import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { devLevelsPlugin } from './scripts/dev-levels.ts'

// https://vite.dev/config/
export default defineConfig(({ mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const desktop = mode === 'desktop'
  return {
    plugins: [react(), ...(desktop ? [] : [devLevelsPlugin()]), ...(desktop ? [{
      name: 'desktop-entry',
      transformIndexHtml: { order: 'pre' as const, handler(html: string) { return html.replace('/src/main.tsx', '/src/main.desktop.tsx') } },
    }] : []), {
      name: 'validated-level-assets', apply: 'build',
      // Direct `vite build` must enforce the same boundary as npm's prebuild.
      buildStart() { execFileSync(process.execPath, [resolve('scripts/jumping-levels.mjs'), 'check'], { stdio: 'inherit' }) },
    }],
    build: { outDir: desktop ? 'desktop/renderer' : 'dist/web', manifest: true, rollupOptions: { input: desktop ? resolve('index.html') : { main: resolve('index.html'), auth: resolve('auth-redirect.html'), downloads: resolve('downloads/index.html') } } },
    base: desktop ? '/' : env.VITE_BASE ?? '/',
    // Browser OAuth clients are configured only for the browser entry point.
    define: desktop ? Object.fromEntries(['VITE_GOOGLE_CLIENT_ID', 'VITE_GOOGLE_PICKER_API_KEY', 'VITE_GOOGLE_PROJECT_NUMBER', 'VITE_MICROSOFT_CLIENT_ID'].map(key => [`import.meta.env.${key}`, JSON.stringify('')])) : undefined,
    preview: { headers: isPreview ? JSON.parse(readFileSync(resolve('public/staticwebapp.config.json'), 'utf8')).globalHeaders : undefined },
  }
})
