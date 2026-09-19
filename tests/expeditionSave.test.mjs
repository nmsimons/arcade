import assert from 'node:assert/strict'
import test from 'node:test'
import { freshExpedition, SAVE_KEY } from '../src/games/hardVacuum/expedition.ts'
import { createExpeditionSaveSession, parseSave, readExpedition, SAVE_BACKUP_KEY, SAVE_RECOVERY_KEY } from '../src/games/hardVacuum/expeditionSave.ts'

const saved = (banked = 12345) => JSON.stringify({ ...freshExpedition(), banked })
const memory = (entries = []) => {
  const data = new Map(entries), writes = []
  const store = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { writes.push([key, value]); data.set(key, value) },
  }
  return { data, writes, store, storage: () => store }
}

test('load distinguishes missing, malformed, unsupported, valid, and inaccessible saves', () => {
  assert.equal(parseSave(null).status, 'missing')
  for (const raw of ['', '{bad json', 'null', '{}', saved().replace('12345', '-1')]) {
    assert.deepEqual(parseSave(raw), { status: 'invalid', raw })
  }
  for (const value of [
    { ...freshExpedition(), version: 999 },
    { ...freshExpedition(), finaleVersion: 3 },
    { ...freshExpedition(), campaign: { ...freshExpedition().campaign, version: 2 } },
  ]) assert.equal(parseSave(JSON.stringify(value)).status, 'unsupported')
  assert.equal(parseSave(saved()).expedition.banked, 12345)
  assert.equal(readExpedition(() => { throw new Error('SecurityError') }).status, 'storage-unavailable')
  assert.equal(readExpedition(() => ({ getItem() { throw new Error('read denied') } })).status, 'storage-unavailable')
})

test('opening and leaving the menu never writes a missing, valid, or unreadable save', () => {
  for (const raw of [null, saved(), '{bad json', JSON.stringify({ version: 999, banked: 12345 })]) {
    const m = memory(raw === null ? [] : [[SAVE_KEY, raw]])
    const session = createExpeditionSaveSession(m.storage)
    const fallback = session.load.status === 'valid' ? session.load.expedition : freshExpedition()
    assert.equal(session.save(fallback).status, 'inactive', 'menu exit must not save its fallback')
    assert.equal(m.store.getItem(SAVE_KEY), raw)
    assert.deepEqual(m.writes, [])
    if (session.load.status === 'invalid' || session.load.status === 'unsupported') {
      assert.equal(session.activate(), false, 'Continue cannot bypass recovery')
      assert.equal(session.save(fallback).status, 'inactive')
      assert.deepEqual(m.writes, [])
    }
  }
})

test('newly launched games create a validated backup and later saves keep the previous good slot', () => {
  const m = memory(), session = createExpeditionSaveSession(m.storage), state = freshExpedition()
  assert.equal(session.activate(), true)
  assert.equal(session.save(state).status, 'saved')
  const first = m.store.getItem(SAVE_KEY)
  assert.equal(m.store.getItem(SAVE_BACKUP_KEY), first)
  state.banked = 700
  assert.equal(session.save(state).status, 'saved')
  assert.equal(m.store.getItem(SAVE_BACKUP_KEY), first)
  assert.equal(parseSave(m.store.getItem(SAVE_KEY)).expedition.banked, 700)
  state.banked = -100
  const before = [...m.data]
  assert.equal(session.save(state).status, 'invalid')
  assert.deepEqual([...m.data], before, 'invalid runtime state cannot poison either slot')
})

test('legacy saves migrate through the normal parser and refunds apply exactly once', () => {
  const legacy = { ...freshExpedition('ring'), banked: 100, teleporterInstalled: true, teleportCharges: 1 };legacy.version=1;
  delete legacy.finaleVersion
  const raw = JSON.stringify(legacy), m = memory([[SAVE_KEY, raw]])
  const session = createExpeditionSaveSession(m.storage)
  assert.equal(session.load.status, 'valid')
  assert.equal(session.load.expedition.banked, 850)
  session.activate()
  assert.equal(session.save(session.load.expedition).status, 'saved')
  assert.equal(m.store.getItem(SAVE_BACKUP_KEY), raw, 'backup retains the exact pre-migration bytes')
  assert.equal(readExpedition(m.storage).expedition.banked, 850)
  assert.equal(parseSave(m.store.getItem(SAVE_BACKUP_KEY)).expedition.banked, 850)
})

test('backup recovery preserves malformed and unsupported primary bytes and the valid backup', () => {
  for (const raw of [null, 'broken', JSON.stringify({ version: 999, banked: 12345 })]) {
    const backup = saved(900), m = memory([[SAVE_BACKUP_KEY, backup], ...(raw === null ? [] : [[SAVE_KEY, raw]])])
    const session = createExpeditionSaveSession(m.storage)
    assert.equal(session.backup.status, 'valid')
    assert.equal(session.activate(), false, 'an existing backup requires recovery or confirmed New, even with no primary slot')
    assert.deepEqual(m.writes, [], 'loading must not automatically restore a backup')
    const recovered = session.recoverBackup()
    assert.equal(recovered.status, 'recovered')
    assert.equal(recovered.expedition.banked, 900)
    assert.equal(readExpedition(m.storage).expedition.banked, 900)
    assert.equal(m.store.getItem(SAVE_BACKUP_KEY), backup)
    assert.equal(m.store.getItem(SAVE_RECOVERY_KEY), raw)
    assert.equal(session.activate(), true)
  }
})

test('only deliberate New enables replacement of an unreadable slot, retaining a good backup', () => {
  const raw = '{broken', backup = saved(), m = memory([[SAVE_KEY, raw], [SAVE_BACKUP_KEY, backup]])
  const session = createExpeditionSaveSession(m.storage)
  session.startNew()
  assert.equal(session.save(freshExpedition()).status, 'saved')
  assert.equal(readExpedition(m.storage).expedition.banked, 0)
  assert.equal(m.store.getItem(SAVE_BACKUP_KEY), backup)
  assert.equal(m.store.getItem(SAVE_RECOVERY_KEY), raw)
})

test('unreadable storage cannot become writable just because access later succeeds', () => {
  let available = false
  const m = memory([[SAVE_KEY, saved()]]), session = createExpeditionSaveSession(() => {
    if (!available) throw new Error('SecurityError')
    return m.store
  })
  available = true
  assert.equal(session.load.status, 'storage-unavailable')
  assert.equal(session.activate(), false)
  assert.equal(session.save(freshExpedition()).status, 'inactive')
  assert.equal(m.store.getItem(SAVE_KEY), saved())
  session.startNew()
  available = false
  assert.equal(session.save(freshExpedition()).status, 'storage-unavailable')
  assert.deepEqual(m.writes, [])
  available = true
  assert.equal(session.save(freshExpedition()).status, 'saved')
  assert.equal(m.store.getItem(SAVE_BACKUP_KEY), saved())
})

test('quota or backup-read failures preserve the primary and report failure, then allow retry', () => {
  for (const failure of [SAVE_BACKUP_KEY, SAVE_KEY, 'read-backup']) {
    const raw = saved(), m = memory([[SAVE_KEY, raw]])
    const session = createExpeditionSaveSession(m.storage)
    session.activate()
    const get = m.store.getItem, set = m.store.setItem
    m.store.getItem = key => {
      if (failure === 'read-backup' && key === SAVE_BACKUP_KEY) throw new Error('SecurityError')
      return get(key)
    }
    m.store.setItem = (key, value) => {
      if (failure === key) throw new Error('QuotaExceededError')
      set(key, value)
    }
    assert.equal(session.save(freshExpedition()).status, 'storage-unavailable')
    assert.equal(m.data.get(SAVE_KEY), raw)
    if (m.data.has(SAVE_BACKUP_KEY)) assert.equal(parseSave(m.data.get(SAVE_BACKUP_KEY)).status, 'valid')
    m.store.getItem = get; m.store.setItem = set
    assert.equal(session.save(freshExpedition()).status, 'saved')
  }
})

test('failed recovery never enables a fallback autosave and never overwrites the valid backup', () => {
  for (const failure of [SAVE_RECOVERY_KEY, SAVE_KEY]) {
    const raw = 'broken', backup = saved(), m = memory([[SAVE_KEY, raw], [SAVE_BACKUP_KEY, backup]])
    const session = createExpeditionSaveSession(m.storage), set = m.store.setItem
    m.store.setItem = (key, value) => {
      if (key === failure) throw new Error('QuotaExceededError')
      set(key, value)
    }
    assert.equal(session.recoverBackup().status, 'failed')
    m.store.setItem = set
    assert.equal(session.save(freshExpedition()).status, 'inactive')
    assert.equal(m.store.getItem(SAVE_KEY), raw)
    assert.equal(m.store.getItem(SAVE_BACKUP_KEY), backup)
    assert.equal(session.recoverBackup().status, 'recovered')
  }
})

test('invalid, unsupported, or deleted backups cannot replace the primary during recovery', () => {
  for (const backup of ['broken', '{"version":999}', null]) {
    const m = memory([[SAVE_KEY, 'original']]), session = createExpeditionSaveSession(m.storage)
    if (backup !== null) m.data.set(SAVE_BACKUP_KEY, backup)
    assert.equal(session.recoverBackup().status, 'failed')
    assert.deepEqual(m.writes, [])
  }
})

test('an external save change blocks autosave and exit instead of overwriting another session', () => {
  const m = memory([[SAVE_KEY, saved()]]), session = createExpeditionSaveSession(m.storage)
  session.activate()
  const other = saved(50000)
  m.data.set(SAVE_KEY, other)
  assert.equal(session.save(freshExpedition()).status, 'blocked')
  assert.equal(m.store.getItem(SAVE_KEY), other)
  assert.deepEqual(m.writes, [])
})
