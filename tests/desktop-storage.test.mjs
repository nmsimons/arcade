import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileStorage } from '../desktop/save-store.mjs'
import { createExpeditionSaveSession } from '../src/games/hardVacuum/expeditionSave.ts'
import { freshExpedition, SAVE_KEY } from '../src/games/hardVacuum/expedition.ts'
import { configurePlatform } from '../src/platform/runtime.ts'
import { desktopPlatform } from '../src/platform/desktop/index.ts'
import { gameStorage } from '../src/accounts/profileStorage.ts'
import { webPlatform } from '../src/platform/web/index.ts'

test('desktop game storage survives reopening with the shared expedition format and backups', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcade-saves-'))
  try {
    const store = fileStorage(directory)
    configurePlatform(desktopPlatform({ storage: store, toggleFullscreen: async () => {}, quit: async () => {} }))
    const session = createExpeditionSaveSession()
    assert.equal(session.load.status, 'missing')
    assert.equal(session.activate(), true)
    assert.equal(session.save(freshExpedition()).status, 'saved')
    const second = { ...freshExpedition(), banked: 12345 }
    assert.equal(session.save(second).status, 'saved')
    const reopened = fileStorage(directory)
    assert.equal(createExpeditionSaveSession(() => reopened).load.expedition.banked, 12345)
    assert.equal(createExpeditionSaveSession(() => reopened).backup.expedition.banked, 0)
    assert.equal(gameStorage().workspaceLock, undefined)
    assert.deepEqual(readdirSync(directory).filter(name => name.endsWith('.tmp')), [])
  } finally { configurePlatform(webPlatform); rmSync(directory, { recursive: true, force: true }) }
})

test('invalid paths and oversized writes cannot replace an existing save; unreadable bytes survive', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arcade-saves-'))
  try {
    const store = fileStorage(directory)
    store.setItem(SAVE_KEY, '{unreadable')
    assert.throws(() => store.setItem(SAVE_KEY, 'x'.repeat(4 * 1024 * 1024 + 1)))
    for (const key of ['../outside', '/absolute', 'a\\b', '', 'a'.repeat(121)]) assert.throws(() => store.setItem(key, '{}'))
    assert.equal(store.getItem(SAVE_KEY), '{unreadable')
    const session = createExpeditionSaveSession(() => store)
    assert.equal(session.activate(), false)
    assert.equal(session.save(freshExpedition()).status, 'inactive')
    session.startNew()
    assert.equal(session.save(freshExpedition()).status, 'saved')
    assert.equal(store.getItem(`${SAVE_KEY}-unreadable`), '{unreadable')
    const slot = join(directory, `${Buffer.from(SAVE_KEY).toString('base64url')}.json`)
    writeFileSync(slot, 'x'.repeat(4 * 1024 * 1024 + 1))
    assert.throws(() => store.getItem(SAVE_KEY))
    assert.equal(session.save(freshExpedition()).status, 'storage-unavailable')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
