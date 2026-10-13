import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

// A local bootstrap may live under .local; otherwise use the developer's Cargo.
const local = resolve('.local/cargo/bin/cargo.exe')
const cargo = process.env.LAB_CARGO ?? (existsSync(local) ? local : 'cargo')
const env = { ...process.env, ...(existsSync(local) && !process.env.LAB_CARGO ? {
  CARGO_HOME: resolve('.local/cargo'), RUSTUP_HOME: resolve('.local/rustup'),
} : {}) }
const result = spawnSync(cargo, ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '--manifest-path', 'native/lab-rope/Cargo.toml'], { env, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
mkdirSync('public/wasm', { recursive: true })
copyFileSync('native/lab-rope/target/wasm32-unknown-unknown/release/lab_rope.wasm', 'public/wasm/lab-rope.wasm')
const hash = path => {
  const bytes = readFileSync(path)
  return createHash('sha256').update(path.endsWith('.wasm') ? bytes : bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')
}
writeFileSync('public/wasm/lab-rope.build.json', JSON.stringify({
  abi: 2, source: hash('native/lab-rope/src/lib.rs'), manifest: hash('native/lab-rope/Cargo.toml'),
  lock: hash('native/lab-rope/Cargo.lock'), wasm: hash('public/wasm/lab-rope.wasm'),
}, null, 2) + '\n')
console.log('Built public/wasm/lab-rope.wasm')
