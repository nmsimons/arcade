import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { devLevelsPlugin } from './scripts/dev-levels.ts'

// https://vite.dev/config/
export default defineConfig(({ mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devLevelsPlugin(), {
      name: 'validated-level-assets', apply: 'build',
      // Direct `vite build` must enforce the same boundary as npm's prebuild.
      buildStart() { execFileSync(process.execPath, [resolve('scripts/jumping-levels.mjs'), 'check'], { stdio: 'inherit' }) },
    }],
    build: { manifest: true, rollupOptions: { input: { main: resolve('index.html'), auth: resolve('auth-redirect.html') } } },
    base: env.VITE_BASE ?? '/',
    preview: { headers: isPreview ? JSON.parse(readFileSync(resolve('public/staticwebapp.config.json'), 'utf8')).globalHeaders : undefined },
  }
})
