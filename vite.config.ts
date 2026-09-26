import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { devLevelsPlugin } from './scripts/dev-levels.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devLevelsPlugin(), {
      name: 'validated-level-assets', apply: 'build',
      // Direct `vite build` must enforce the same boundary as npm's prebuild.
      buildStart() { execFileSync(process.execPath, [resolve('scripts/jumping-levels.mjs'), 'check'], { stdio: 'inherit' }) },
    }],
    build: { manifest: true },
    base: env.VITE_BASE ?? '/',
  }
})
