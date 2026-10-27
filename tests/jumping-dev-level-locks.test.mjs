import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, open } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { devLevelDirectory } from '../scripts/dev-level-directory.ts'
import { directoryRepository } from '../src/games/jumping/levelRepository.ts'
import { FIRST_LEVEL } from './helpers/jumping-fixtures.mjs'

const windows = { skip: process.platform !== 'win32', timeout: 15000 }

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'arcade-save-lock-')), assets = join(root, 'public/levels/jumping')
  await mkdir(assets, { recursive: true })
  const level = JSON.stringify(FIRST_LEVEL), manifest = JSON.stringify({ version: 1, levels: ['first.json'] })
  await writeFile(join(assets, 'first.json'), level)
  await writeFile(join(assets, 'index.json'), manifest)
  t.after(() => rm(root, { recursive: true, force: true }))
  const directory = await devLevelDirectory(root)
  return { root, assets, level, manifest, directory, repository: directoryRepository(directory) }
}

async function hold(t, path, sharing = 'ReadWrite') {
  // Real Windows handle: reads/writes may proceed, but replacing the directory
  // entry is denied until this process releases its non-Delete sharing mode.
  const source = `
    $ErrorActionPreference='Stop'
    $held=[System.IO.File]::Open($env:ARCADE_LOCK_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::${sharing})
    try { [Console]::WriteLine('locked'); [Console]::Out.Flush(); [void][Console]::ReadLine() }
    finally { $held.Dispose() }
  `
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', source], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ARCADE_LOCK_FILE: path },
  })
  let stderr = '', released
  child.stderr.on('data', data => { stderr += data })
  const exited = once(child, 'exit')
  const release = () => released ??= (async () => { child.stdin.end('\n'); await exited })()
  t.after(release)
  const ready = await Promise.race([once(child.stdout, 'data').then(([data]) => String(data)), exited.then(() => { throw new Error(stderr || 'Lock holder exited early') })])
  assert.match(ready, /locked/)
  return { release }
}

async function cleanScratch(root) {
  assert.deepEqual(await readdir(join(root, '.local')), [], 'successful or rolled-back saves leave no temporary files')
}

test('a new level saves while the existing collection index is held open on Windows', windows, async t => {
  const f = await fixture(t), lock = await hold(t, join(f.assets, 'index.json'))
  const next = { ...FIRST_LEVEL, id: 'copy', name: 'Spelunk I copy' }
  const saved = await f.repository.save('copy.json', next)
  assert.equal(await readFile(join(f.assets, 'copy.json'), 'utf8'), saved.text)
  assert.deepEqual(JSON.parse(await readFile(join(f.assets, 'index.json'), 'utf8')).levels, ['first.json', 'copy.json'])
  assert.equal(await readFile(join(f.assets, 'first.json'), 'utf8'), f.level)
  await lock.release(); await cleanScratch(f.root)
})

test('overwriting a held level supports shorter UTF-8 contents without trailing bytes', windows, async t => {
  const f = await fixture(t), target = join(f.assets, 'first.json')
  const before = JSON.stringify({ ...FIRST_LEVEL, name: 'An original level with a considerably longer name' }, null, 2)
  await writeFile(target, before)
  const lock = await hold(t, target)
  const saved = await f.repository.save('first.json', { ...FIRST_LEVEL, name: 'Café 洞' }, before)
  assert.equal(await readFile(target, 'utf8'), saved.text)
  assert.equal(JSON.parse(saved.text).name, 'Café 洞')
  assert.equal(await readFile(join(f.assets, 'index.json'), 'utf8'), f.manifest)
  await lock.release(); await cleanScratch(f.root)
})

test('a transient Windows lock can release while replacement is retried', windows, async t => {
  const f = await fixture(t), target = join(f.assets, 'first.json'), lock = await hold(t, target)
  const timer = setTimeout(() => { void lock.release() }, 100)
  t.after(() => clearTimeout(timer))
  const saved = await f.repository.save('first.json', { ...FIRST_LEVEL, name: 'After transient lock' }, f.level)
  assert.equal(await readFile(target, 'utf8'), saved.text)
  await lock.release(); await cleanScratch(f.root)
})

test('an external edit during retry is preserved and never replaced by the draft', windows, async t => {
  const f = await fixture(t), target = join(f.assets, 'first.json'), lock = await hold(t, target)
  const writer = await (await f.directory.getFileHandle('first.json')).createWritable()
  await writer.write(JSON.stringify({ ...FIRST_LEVEL, name: 'Unsaved draft' }))
  const external = JSON.stringify({ ...FIRST_LEVEL, name: 'External editor' })
  let edit
  const timer = setTimeout(() => { edit = writeFile(target, external) }, 80)
  t.after(() => clearTimeout(timer))
  await assert.rejects(writer.close(), /changed on disk/)
  await edit
  assert.equal(await readFile(target, 'utf8'), external)
  await lock.release(); await cleanScratch(f.root)
})

test('a Windows reader denying writes leaves the original intact and rolls back the new copy', windows, async t => {
  const f = await fixture(t), lock = await hold(t, join(f.assets, 'index.json'), 'Read')
  await assert.rejects(f.repository.save('copy.json', { ...FIRST_LEVEL, id: 'copy' }))
  assert.equal(await readFile(join(f.assets, 'index.json'), 'utf8'), f.manifest)
  assert.deepEqual((await readdir(f.assets)).sort(), ['first.json', 'index.json'])
  await lock.release(); await cleanScratch(f.root)
})

test('a partial fallback write restores the original manifest and rolls back the new level', windows, async t => {
  const f = await fixture(t), target = join(f.assets, 'index.json'), lock = await hold(t, target)
  const sample = await open(target, 'r'), prototype = Object.getPrototypeOf(sample), write = prototype.write
  await sample.close()
  let failed = false
  t.mock.method(prototype, 'write', async function (buffer, offset, length, position) {
    if (!failed) {
      failed = true
      await write.call(this, buffer, offset, Math.min(length, 7), position)
      throw Object.assign(new Error('Simulated disk full after a partial write'), { code: 'ENOSPC' })
    }
    return write.call(this, buffer, offset, length, position)
  })
  await assert.rejects(f.repository.save('copy.json', { ...FIRST_LEVEL, id: 'copy' }), /Simulated disk full/)
  assert.ok(failed, 'the test reaches an actual partial write')
  assert.equal(await readFile(target, 'utf8'), f.manifest)
  assert.deepEqual((await readdir(f.assets)).sort(), ['first.json', 'index.json'])
  await lock.release(); await cleanScratch(f.root)
})

test('a failed rollback retains the original contents in the recovery path from the error', windows, async t => {
  const f = await fixture(t), target = join(f.assets, 'first.json'), lock = await hold(t, target)
  const sample = await open(target, 'r'), prototype = Object.getPrototypeOf(sample), write = prototype.write
  await sample.close()
  let attempts = 0
  t.mock.method(prototype, 'write', async function (buffer, offset, length, position) {
    if (++attempts === 1) await write.call(this, buffer, offset, Math.min(length, 7), position)
    throw Object.assign(new Error('Simulated persistent disk failure'), { code: 'ENOSPC' })
  })
  const writer = await (await f.directory.getFileHandle('first.json')).createWritable()
  await writer.write(JSON.stringify({ ...FIRST_LEVEL, name: 'A draft that cannot finish saving' }, null, 2))
  let failure
  try { await writer.close() } catch (error) { failure = error }
  assert.match(failure?.message ?? '', /Recovery copy kept at/)
  const backups = await readdir(join(f.root, '.local'))
  assert.equal(backups.length, 1)
  assert.match(backups[0], /\.tmp\.original$/)
  const backup = join(f.root, '.local', backups[0])
  assert.ok(failure.message.includes(backup))
  assert.equal(await readFile(backup, 'utf8'), f.level)
  assert.equal(await readFile(join(f.assets, 'index.json'), 'utf8'), f.manifest)
  await lock.release()
})
