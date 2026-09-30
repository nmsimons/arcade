import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadLevelCatalog, loadLocalLevelFiles, decodeLevelFile, playableLevelFile } from '../src/games/jumping/levelAssets.ts'
import { readLocalLevelDirectory, writeLocalLevel, writeLevelOrder, deleteLocalLevel, readDeletedLevels, restoreDeletedLevel, emptyDeletedLevels } from '../src/games/jumping/levelFiles.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { levelProblems, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { JSON_LAB, FIRST_LEVEL } from './helpers/jumping-fixtures.mjs'

const root = new URL('../public/levels/jumping/', import.meta.url)
const index = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
const assets = new Map(await Promise.all(['index.json', ...index.levels].map(async name => [name, await readFile(new URL(name, root), 'utf8')])))
const fixtureIndex = { version: 1, levels: ['00-json-test-lab.json'] }
function server(data = new Map([['index.json', JSON.stringify(fixtureIndex)], [fixtureIndex.levels[0], JSON.stringify(JSON_LAB)]])) {
  const requests = []
  return { data, requests, fetch: async (url, options) => {
    requests.push({ url, options }); const name = decodeURIComponent(url.split('/levels/jumping/')[1])
    return data.has(name) ? new Response(data.get(name)) : new Response(null, { status: 404 })
  } }
}

test('the deployed catalog excludes automated test fixtures', async () => {
  assert.deepEqual((await readdir(root)).sort(), [...index.levels, 'index.json'].sort())
  const catalog = await loadLevelCatalog('/arcade/', server(assets).fetch)
  assert.deepEqual(catalog.errors, [])
  assert.deepEqual(catalog.files.map(file => file.fileName), index.order === 'listed' ? index.levels : [...index.levels].sort())
  assert.ok(catalog.files.every(file => file.level.id !== JSON_LAB.id))
  assert.deepEqual(levelProblems(JSON_LAB), [])
})

test('sync removes retired indexed levels and refuses unexpected deployment files without deleting them', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jumping-asset-sync-'))
  try {
    await writeFile(join(target, 'index.json'), JSON.stringify({ version: 1, levels: ['99-removed.json'] }))
    await writeFile(join(target, '99-removed.json'), '{}')
    await writeFile(join(target, 'notes.txt'), 'Keep this file')
    assert.throws(() => execFileSync(process.execPath, ['scripts/jumping-levels.mjs', 'sync', target], { stdio: 'pipe' }), /Unexpected level asset/)
    assert.equal(await readFile(join(target, 'notes.txt'), 'utf8'), 'Keep this file')
    await rm(join(target, 'notes.txt'))
    execFileSync(process.execPath, ['scripts/jumping-levels.mjs', 'sync', target])
    assert.deepEqual((await readdir(target)).sort(), [...index.levels, 'index.json'].sort())
    assert.deepEqual(JSON.parse(await readFile(join(target, 'index.json'), 'utf8')), index)
  } finally { await rm(target, { recursive: true, force: true }) }
})

test('runtime refresh discovers new files and changed geometry without rebuilding or reimporting code', async () => {
  const remote = server(), first = await loadLevelCatalog('/arcade/', remote.fetch)
  const edited = structuredClone(JSON_LAB); edited.width += 600; edited.name = 'Edited on disk'
  remote.data.set(fixtureIndex.levels[0], JSON.stringify(edited))
  remote.data.set('00-before.json', JSON.stringify({ ...edited, id: 'new-file', name: 'Added on disk' }))
  remote.data.set('index.json', JSON.stringify({ ...fixtureIndex, levels: [...fixtureIndex.levels].reverse().concat('00-before.json') }))
  const refreshed = await loadLevelCatalog('/arcade/', remote.fetch)
  assert.equal(first.files[0].level.name, JSON_LAB.name)
  assert.equal(refreshed.files[0].fileName, '00-before.json')
  assert.equal(refreshed.files[1].level.width, edited.width)
  assert.equal(refreshed.files[1].level.name, 'Edited on disk')
  assert.ok(remote.requests.every(r => r.url.startsWith('/arcade/levels/jumping/') && r.options.cache === 'no-store'))
})

test('bad and missing assets report their filenames without hiding valid levels', async () => {
  const remote = server()
  remote.data.set('01-broken.json', '{bad')
  remote.data.set('index.json', JSON.stringify({ ...fixtureIndex, levels: [...fixtureIndex.levels, '01-broken.json', '02-missing.json'] }))
  const catalog = await loadLevelCatalog('/', remote.fetch)
  assert.deepEqual(catalog.files.map(f => f.fileName), fixtureIndex.levels)
  assert.equal(catalog.errors.length, 2); assert.match(catalog.errors[0], /01-broken.json/); assert.match(catalog.errors[1], /HTTP 404/)
  remote.data.delete('index.json')
  await assert.rejects(loadLevelCatalog('/', remote.fetch), /index.json.*404/)
})

test('an invalid catalog cannot request arbitrary paths or origins', async () => {
  for (const name of ['../outside.json', 'https://example.com/map.json', 'nested/map.json', 'bad\\map.json', 'index.json', 'INDEX.JSON']) {
    const remote = server(); remote.data.set('index.json', JSON.stringify({ ...index, levels: [name] }))
    await assert.rejects(loadLevelCatalog('/', remote.fetch), /filenames/)
    assert.equal(remote.requests.length, 1)
  }
})

test('local folders sort filenames, preserve identity, ignore non-JSON files and isolate broken or duplicate levels', async () => {
  const files = [new File([JSON.stringify({ ...FIRST_LEVEL, id: 'third' })], '02-third.json'), new File(['notes'], 'notes.txt'),
    new File([JSON.stringify(FIRST_LEVEL)], '00-first.json'), new File(['not JSON'], '03-broken.json'),
    new File([JSON.stringify(FIRST_LEVEL)], '04-duplicate.json'), new File([JSON.stringify({ ...FIRST_LEVEL, id: 'second' })], '01-second.json')]
  const result = await loadLocalLevelFiles(files)
  assert.deepEqual(result.files.map(f => f.fileName), ['00-first.json', '01-second.json', '02-third.json'])
  assert.equal(result.files[0].level.id, FIRST_LEVEL.id)
  assert.equal(result.files[0].sourceText, await files[2].text())
  assert.equal(result.errors.length, 2); assert.match(result.errors[1], /unique ID/)
  const oversized = await loadLocalLevelFiles([new File([' '.repeat(1_000_001)], 'big.json')])
  assert.equal(oversized.files.length, 0); assert.match(oversized.errors[0], /1 MB/)
})

test('the JSON test lab exercises all geometry, attachments, saved rope paths and gameplay objects', () => {
  const level = decodeLevelFile(JSON.stringify(JSON_LAB))
  assert.deepEqual(level, JSON_LAB); assert.deepEqual(prepareLevelRopes(level), level)
  assert.ok(level.platforms.some(p => p.polygon)); assert.ok(level.platforms.some(p => p.profile)); assert.ok(level.platforms.some(p => !p.profile && !p.polygon))
  assert.ok(level.checkpoints[0].radius)
  assert.ok(level.climbables.ladders.some(l => l.platform === -1)); assert.ok(level.climbables.ladders.some(l => l.platform >= 0))
  assert.ok(level.climbables.ropes.some(r => !r.anchor)); assert.ok(level.climbables.ropes.some(r => r.anchor))
  assert.ok(level.climbables.ropes.some(r => r.rest.bends.some(Boolean)))
  for (const r of level.climbables.ropes) { assert.equal(r.rest.points.length, r.segments + 1); assert.equal(r.rest.distances.length, r.segments + 1) }
  assert.deepEqual(level.props.map(p => p.kind).sort(), ['ball', 'box'])
  assert.deepEqual(level.mechanisms.map(m => m.kind).sort(), ['gate', 'lift', 'lift'])
  assert.ok(level.mechanisms.some(m => m.kind === 'lift' && m.orientation === 'horizontal' && m.flipX))
  assert.deepEqual(level.triggers.map(t => t.mode).sort(), ['touch', 'weight']); assert.ok(level.robots.length)
  assert.equal(level.timers.length, 2)
  assert.equal(level.texts.length, 2); assert.ok(level.texts.every(t => t.text.includes('\n')))
  assert.ok(level.texts.some(t => t.style === 'graffiti' && t.rotation === -10))
  assert.deepEqual(level.pickups.map(p => p.kind), ['stopwatch', 'stopwatch', 'time-bonus', 'coin', 'time-penalty', 'fast-stopwatch', 'emp'])
  assert.equal(level.pickups.find(p => p.kind === 'time-bonus').seconds, 5)
  assert.equal(level.pickups.find(p => p.kind === 'time-penalty').seconds, 5)
  const run = createRun(level), original = createRun(level)
  for (let i = 0; i < 120; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(run.triggers[0].active, true); assert.equal(run.mechanisms[0].active, true); assert.ok(run.mechanisms[0].y < level.mechanisms[0].y)
  Object.assign(run.player, { x: 2740, y: 1400, grounded: true, footwork: null })
  for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.triggers[1].active, true); assert.equal(run.mechanisms[1].active, true)
  assert.equal(run.mechanisms[2].active, true); assert.ok(run.mechanisms[2].x > level.mechanisms[2].x)
  Object.assign(run.player, level.goal); stepRun(run, NEUTRAL_INPUT); assert.equal(run.goalLit, true); assert.equal(run.finished, false)
  assert.deepEqual(createRun(level), original, 'reset reconstructs every actor from the same JSON')
})

const malformed = {
  version: l => { l.version = 2 }, dimensions: l => { l.width = -1 }, spawn: l => { l.spawn.x = Infinity },
  checkpoint: l => { l.checkpoints[0].radius = 0 }, rectangle: l => { l.platforms[0].w = 0 },
  polygon: l => { l.platforms[1].polygon[2] = [9000, 0] }, profile: l => { l.platforms[2].profile[1][0] = 0 },
  mixedGeometry: l => { l.platforms[1].profile = [[0, 0], [340, 360]] },
  ladder: l => { l.climbables.ladders[0].bottom = l.climbables.ladders[0].top },
  ladderAttachment: l => { l.climbables.ladders[0].platform = 90 },
  ropeLength: l => { l.climbables.ropes[0].length = -10 }, ropeSegments: l => { l.climbables.ropes[0].segments = 1e9 },
  ropeAnchor: l => { l.climbables.ropes[0].anchor.x = 80; l.climbables.ropes[0].anchor.y = 80 },
  ropePoints: l => { l.climbables.ropes[0].rest.points.pop() }, ropeKey: l => { l.climbables.ropes[0].rest.key = 'bad' },
  ropeBends: l => { l.climbables.ropes[0].rest.bends[0] = [NaN, 0] }, ropeMaterial: l => { l.climbables.ropes[0].rest.distances[1] = 0 },
  prop: l => { l.props[0].size = 300 }, mechanism: l => { l.mechanisms[0].travel = -10 },
  duplicateMechanism: l => { l.mechanisms[1].id = l.mechanisms[0].id }, trigger: l => { l.triggers[0].mode = 'invalid' },
  pusher: l => { l.robots[0].left = l.robots[0].right }, medals: l => { l.times.gold = l.times.bronze }, goal: l => { l.goal.y = NaN },
  wallTimer: l => { l.timers[0].x = l.width },
}

test('legacy flags import as goal plates, and exports use only the new goal point', () => {
  const legacy = structuredClone(JSON_LAB); legacy.flag = legacy.goal; delete legacy.goal
  const imported = parseLevel(legacy)
  assert.deepEqual(imported.goal, JSON_LAB.goal); assert.equal('flag' in imported, false)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(imported))), imported)
  assert.deepEqual(parseLevel({ ...legacy, goal: { x: 2500, y: 1400 } }).goal, { x: 2500, y: 1400 })
  assert.throws(() => parseLevel({ ...legacy, goal: null }))
})

test('legacy player hints are ignored on import and omitted from subsequent saves', () => {
  const imported = decodeLevelFile(JSON.stringify({ ...JSON_LAB, description: 'An obsolete player hint.' }))
  assert.deepEqual(imported, JSON_LAB)
  assert.equal('description' in imported, false)
  assert.equal('description' in JSON.parse(JSON.stringify(imported)), false)
  assert.deepEqual(imported.texts, JSON_LAB.texts)
})

test('the whole goal plate needs a flat floor and its light must fit inside the level', () => {
  for (const goal of [{ x: 0, y: 1400 }, { x: 3190, y: 1400 }, { x: 3050, y: 1300 }]) {
    const level = structuredClone(JSON_LAB); level.goal = goal
    assert.ok(levelProblems(level).some(problem => problem.includes('goal plate')))
  }
})
for (const [name, mutate] of Object.entries(malformed)) test(`JSON test lab rejects invalid ${name}`, () => {
  const level = structuredClone(JSON_LAB); mutate(level); assert.throws(() => parseLevel(level))
})
test('structurally valid files still need valid terrain bounds and mechanism links before play', () => {
  for (const mutate of [l => { l.platforms[0].y = -10 }, l => { l.triggers[0].target = 'missing' }, l => { l.spawn.y -= 200 }]) {
    const level = structuredClone(JSON_LAB); mutate(level)
    assert.throws(() => playableLevelFile({ fileName: 'bad.json', level: parseLevel(level) }))
  }
})

function folder(initial = {}) {
  const contents = new Map(Object.entries(initial)), writes = [], directories = new Map()
  const directory = { async *values() {
    for (const name of contents.keys()) yield { kind: 'file', name, getFile: async () => new File([contents.get(name)], name) }
    for (const name of directories.keys()) yield { kind: 'directory', name }
  }, getDirectoryHandle: async (name, options) => {
    if (!directories.has(name)) {
      if (!options?.create) throw new DOMException('Missing', 'NotFoundError')
      directories.set(name, folder())
    }
    return directories.get(name).directory
  }, removeEntry: async name => {
    const child = directories.get(name)
    if (child && (child.contents.size || child.directories.size)) throw new DOMException('Not empty', 'InvalidModificationError')
    contents.delete(name); directories.delete(name)
  }, getFileHandle: async (name, options) => {
    if (!contents.has(name) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
    return { name, getFile: async () => new File([contents.get(name) ?? ''], name), createWritable: async () => {
      let staged
      return { write: async text => { staged = text }, close: async () => { contents.set(name, staged); writes.push(name) }, abort: async () => {} }
    } }
  } }
  return { directory, contents, writes, directories }
}
test('connecting a writable folder creates a filename manifest without changing level files', async () => {
  const initial = { 'z.json': JSON.stringify(FIRST_LEVEL), 'a.json': JSON.stringify({ ...FIRST_LEVEL, id: 'another' }), 'broken.json': '{repair me', 'notes.txt': 'Keep me' }
  const { directory, contents, writes } = folder(initial)
  const result = await readLocalLevelDirectory(directory, true)
  assert.deepEqual(result.manifest, { version: 1, order: 'filename', levels: ['a.json', 'broken.json', 'z.json'] })
  assert.equal(result.manifestSource, contents.get('index.json'))
  assert.deepEqual(result.files.map(file => file.fileName), ['a.json', 'z.json'])
  assert.match(result.errors[0], /broken.json/)
  for (const [name, text] of Object.entries(initial)) assert.equal(contents.get(name), text)
  assert.deepEqual(writes, ['index.json'])
  await readLocalLevelDirectory(directory, true)
  assert.deepEqual(writes, ['index.json'])
  const empty = folder()
  assert.deepEqual((await readLocalLevelDirectory(empty.directory, true)).manifest, { version: 1, order: 'filename', levels: [] })
})
test('connecting preserves existing manifests and does not write without permission', async () => {
  const text = JSON.stringify(FIRST_LEVEL)
  for (const manifest of [JSON.stringify({ version: 1, order: 'listed', levels: ['level.json'], title: 'Shared pack' }), '{invalid']) {
    const { directory, contents, writes } = folder({ 'level.json': text, 'index.json': manifest })
    const result = await readLocalLevelDirectory(directory, true)
    assert.equal(contents.get('index.json'), manifest)
    assert.deepEqual(writes, [])
    assert.equal(result.files.length, 1)
  }
  const { directory, contents, writes } = folder({ 'level.json': text })
  assert.equal((await readLocalLevelDirectory(directory)).files.length, 1)
  assert.equal(contents.has('index.json'), false)
  assert.deepEqual(writes, [])
  assert.equal((await readLocalLevelDirectory(directory, true)).manifest.order, 'filename')
})
test('failed automatic manifest creation leaves levels usable and can be retried', async () => {
  const { directory, contents } = folder({ 'level.json': JSON.stringify(FIRST_LEVEL) })
  const get = directory.getFileHandle.bind(directory)
  directory.getFileHandle = async (name, options) => {
    const handle = await get(name, options)
    if (name === 'index.json') handle.createWritable = async () => { throw new DOMException('Read only', 'NotAllowedError') }
    return handle
  }
  const result = await readLocalLevelDirectory(directory, true)
  assert.equal(result.files.length, 1)
  assert.match(result.errors[0], /Could not create index.json: Read only.*Refresh/)
  assert.equal(contents.has('index.json'), false)
  directory.getFileHandle = get
  assert.equal((await readLocalLevelDirectory(directory, true)).manifest.order, 'filename')
})
test('folder saves create portable files, update an explicitly loaded file and preserve its stable ID', async () => {
  const { directory, contents, writes } = folder(), before = structuredClone(FIRST_LEVEL)
  const { text: first } = await writeLocalLevel(directory, '00-test.json', FIRST_LEVEL)
  assert.deepEqual(decodeLevelFile(contents.get('00-test.json')), prepareLevelRopes(FIRST_LEVEL))
  const updated = { ...FIRST_LEVEL, name: 'Changed locally' }
  await writeLocalLevel(directory, '00-test.json', updated, first)
  assert.equal(decodeLevelFile(contents.get('00-test.json')).id, FIRST_LEVEL.id)
  assert.equal(decodeLevelFile(contents.get('00-test.json')).name, 'Changed locally')
  assert.deepEqual(writes, ['00-test.json', '00-test.json']); assert.deepEqual(FIRST_LEVEL, before)
})
test('saving cannot overwrite an unrelated file or external edits made since opening it', async () => {
  const original = JSON.stringify(FIRST_LEVEL), { directory, contents, writes } = folder({ '00-test.json': original })
  await assert.rejects(writeLocalLevel(directory, '00-test.json', FIRST_LEVEL), /already exists/)
  contents.set('00-test.json', 'External edit')
  await assert.rejects(writeLocalLevel(directory, '00-test.json', FIRST_LEVEL, original), /changed on disk/)
  await assert.rejects(writeLocalLevel(directory, '../outside.json', FIRST_LEVEL), /filename/)
  assert.deepEqual(writes, []); assert.equal(contents.get('00-test.json'), 'External edit')
})
test('write permission and disk failures are reported instead of claiming a successful save', async () => {
  const denied = { getFileHandle: async () => { throw new DOMException('Read only', 'NotAllowedError') } }
  await assert.rejects(writeLocalLevel(denied, '00-test.json', FIRST_LEVEL), /Read only/)
  let aborted = false
  const broken = { async *values() {}, getFileHandle: async name => { if (name === 'index.json') throw new DOMException('Missing', 'NotFoundError'); return ({ getFile: async () => new File(['original'], 'test.json'), createWritable: async () => ({ write: async () => { throw Error('Disk full') }, close: async () => {}, abort: async () => { aborted = true } }) }) } }
  await assert.rejects(writeLocalLevel(broken, 'test.json', FIRST_LEVEL, 'original'), /Disk full/); assert.ok(aborted)
})

test('local and built-in collections share manifest ordering, with filename order as the default', async () => {
  const levels = ['z-first.json', 'b-middle.json', 'a-last.json'].map(name => [name, { ...FIRST_LEVEL, id: name }])
  for (const order of [undefined, 'filename', 'listed']) {
    const manifest = { version: 1, levels: levels.map(([name]) => name), ...(order ? { order } : {}) }
    const expected = order === 'listed' ? manifest.levels : [...manifest.levels].sort()
    const local = await loadLocalLevelFiles([...levels.map(([name, level]) => new File([JSON.stringify(level)], name)), new File([JSON.stringify(manifest)], 'index.json')])
    assert.deepEqual(local.files.map(file => file.fileName), expected)
    const remote = server(new Map([['index.json', JSON.stringify(manifest)], ...levels.map(([name, level]) => [name, JSON.stringify(level)])]))
    assert.deepEqual((await loadLevelCatalog('/', remote.fetch)).files.map(file => file.fileName), expected)
  }
})

test('unlisted local files follow the manifest in filename order and invalid manifests fall back visibly', async () => {
  const files = ['z.json', 'b.json', 'a.json'].map(name => new File([JSON.stringify({ ...FIRST_LEVEL, id: name })], name))
  const local = await loadLocalLevelFiles([...files, new File([JSON.stringify({ version: 1, order: 'listed', levels: ['z.json', 'missing.json'] })], 'index.json')])
  assert.deepEqual(local.files.map(file => file.fileName), ['z.json', 'a.json', 'b.json'])
  assert.deepEqual(local.errors, [])
  assert.deepEqual(local.missing, [{ fileName: 'missing.json', missing: true }])
  for (const text of ['{broken', JSON.stringify({ version: 1, order: 'listed', levels: ['../escape.json'] })]) {
    const invalid = await loadLocalLevelFiles([...files, new File([text], 'index.json')])
    assert.deepEqual(invalid.files.map(file => file.fileName), ['a.json', 'b.json', 'z.json'])
    assert.match(invalid.errors[0], /index.json/)
  }
})

test('index generation preserves a promoted manifest and appends new assets without resetting its sequence', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jumping-promoted-levels-'))
  try {
    for (const name of ['z.json', 'a.json', 'new.json']) await writeFile(join(target, name), JSON.stringify({ ...FIRST_LEVEL, id: name }))
    await writeFile(join(target, 'index.json'), JSON.stringify({ version: 1, order: 'listed', title: 'Shared collection', levels: ['z.json', 'gone.json', 'a.json'] }))
    execFileSync(process.execPath, ['scripts/jumping-levels.mjs', 'index', target])
    assert.deepEqual(JSON.parse(await readFile(join(target, 'index.json'), 'utf8')), { version: 1, order: 'listed', title: 'Shared collection', levels: ['z.json', 'a.json', 'new.json'] })
  } finally { await rm(target, { recursive: true, force: true }) }
})

test('renaming saves the same level under its new name and removes only the old file', async () => {
  const original = JSON.stringify(FIRST_LEVEL), { directory, contents } = folder({ 'old.json': original, 'unrelated.json': 'Leave me alone' })
  const { text } = await writeLocalLevel(directory, 'new.json', { ...FIRST_LEVEL, name: 'Renamed' }, original, 'old.json')
  assert.equal(contents.has('old.json'), false)
  assert.equal(contents.get('unrelated.json'), 'Leave me alone')
  assert.equal(contents.get('new.json'), text)
  assert.equal(JSON.parse(text).id, FIRST_LEVEL.id)
  await writeLocalLevel(directory, 'new.json', { ...FIRST_LEVEL, name: 'Updated after rename' }, text)
})

test('rename collisions, missing sources, disk failures and external changes preserve originals', async () => {
  const original = JSON.stringify(FIRST_LEVEL)
  for (const mode of ['collision', 'changed', 'missing', 'write-failure', 'delete-failure', 'changed-during-write']) {
    const { directory, contents } = folder({ 'old.json': original })
    const get = directory.getFileHandle.bind(directory), remove = directory.removeEntry.bind(directory)
    if (mode === 'collision') contents.set('new.json', 'Other file')
    if (mode === 'changed') contents.set('old.json', 'External edit')
    if (mode === 'missing') contents.delete('old.json')
    if (mode === 'delete-failure') directory.removeEntry = async name => { if (name === 'old.json') throw Error('Cannot delete'); await remove(name) }
    directory.getFileHandle = async (name, options) => {
      const handle = await get(name, options), create = handle.createWritable
      handle.createWritable = async () => {
        const writer = await create(), close = writer.close
        if (mode === 'write-failure') writer.write = async () => { throw Error('Disk full') }
        writer.close = async () => { await close(); if (mode === 'changed-during-write') contents.set('old.json', 'External edit') }
        return writer
      }
      return handle
    }
    await assert.rejects(writeLocalLevel(directory, 'new.json', FIRST_LEVEL, original, 'old.json'))
    assert.equal(contents.get('old.json'), mode === 'missing' ? undefined : mode.startsWith('changed') ? 'External edit' : original, mode)
    assert.equal(contents.get('new.json'), mode === 'collision' ? 'Other file' : undefined, mode)
  }
})

test('organizing levels writes only the manifest and protects changes made outside the game', async () => {
  const initial = Object.fromEntries([1, 2, 3].map(n => [`${n}.json`, JSON.stringify({ ...FIRST_LEVEL, id: `level-${n}`, customMetadata: { keep: true } })]))
  const { directory, contents, writes } = folder(initial)
  const files = (await loadLocalLevelFiles(Object.entries(initial).map(([name, text]) => new File([text], name)))).files
  const next = await writeLevelOrder(directory, [files[2], files[0], files[1]])
  assert.deepEqual(next.manifest, { version: 1, order: 'listed', levels: ['3.json', '1.json', '2.json'] })
  for (const [name, text] of Object.entries(initial)) assert.equal(contents.get(name), text)
  assert.deepEqual(writes, ['index.json'])
  const filename = await writeLevelOrder(directory, files, next.manifestSource, 'filename')
  assert.equal(filename.manifest.order, 'filename')
  contents.set('index.json', JSON.stringify({ version: 1, levels: [], title: 'External edit' }))
  await assert.rejects(writeLevelOrder(directory, files, filename.manifestSource), /index.json changed on disk/)
  assert.equal(JSON.parse(contents.get('index.json')).title, 'External edit')
})

test('renaming updates the manifest in place, and failures restore both filename and manifest', async () => {
  const original = JSON.stringify(FIRST_LEVEL)
  const manifest = JSON.stringify({ version: 1, order: 'listed', levels: ['other.json', 'old.json'], title: 'Shared collection' })
  for (const mode of ['success', 'manifest-failure', 'delete-failure']) {
    const { directory, contents } = folder({ 'old.json': original, 'index.json': manifest }), get = directory.getFileHandle.bind(directory), remove = directory.removeEntry.bind(directory)
    directory.getFileHandle = async (name, options) => {
      const handle = await get(name, options)
      if (mode === 'manifest-failure' && name === 'index.json') handle.createWritable = async () => { throw Error('Manifest is read only') }
      return handle
    }
    if (mode === 'delete-failure') directory.removeEntry = async name => { if (name === 'old.json') throw Error('Cannot remove original'); await remove(name) }
    if (mode === 'success') {
      const saved = await writeLocalLevel(directory, 'renamed.json', FIRST_LEVEL, original, 'old.json')
      assert.deepEqual(saved.manifest, { version: 1, order: 'listed', levels: ['other.json', 'renamed.json'], title: 'Shared collection' })
      assert.equal(contents.has('old.json'), false)
    } else {
      await assert.rejects(writeLocalLevel(directory, 'renamed.json', FIRST_LEVEL, original, 'old.json'))
      assert.equal(contents.get('old.json'), original)
      assert.equal(contents.get('index.json'), manifest)
      assert.equal(contents.has('renamed.json'), false)
    }
  }
})

test('deleting moves exact contents to recovery and restoring keeps identity and metadata', async () => {
  const sourceText = JSON.stringify({ ...FIRST_LEVEL, authorNotes: 'preserve me' }, null, 4)
  const manifest = { version: 1, order: 'listed', levels: ['level.json', 'other.json'], title: 'Collection' }
  const manifestSource = JSON.stringify(manifest)
  const f = folder({ 'level.json': sourceText, 'other.json': JSON.stringify({ ...FIRST_LEVEL, id: 'other' }), 'index.json': manifestSource })
  const result = await deleteLocalLevel(f.directory, { fileName: 'level.json', level: FIRST_LEVEL, sourceText }, manifestSource)
  assert.equal(f.contents.has('level.json'), false)
  assert.deepEqual(result.manifest, { ...manifest, levels: ['other.json'] })
  const trash = await readDeletedLevels(f.directory)
  assert.equal(trash.deleted.length, 1); assert.deepEqual(trash.errors, [])
  const entry = trash.deleted[0]
  assert.equal(entry.sourceText, sourceText); assert.equal(entry.level.id, FIRST_LEVEL.id)
  assert.ok(Number.isFinite(Date.parse(entry.deletedAt)))
  const collection = await readLocalLevelDirectory(f.directory)
  assert.deepEqual(collection.files.map(file => file.fileName), ['other.json'])
  await restoreDeletedLevel(f.directory, entry, 'level.json', result.manifestSource)
  assert.equal(f.contents.get('level.json'), sourceText)
  assert.deepEqual(JSON.parse(f.contents.get('index.json')), { ...manifest, levels: ['other.json', 'level.json'] })
  assert.deepEqual((await readDeletedLevels(f.directory)).deleted, [])
})

test('missing entries delete only the manifest reference and cannot delete a reappearing file', async () => {
  const manifestSource = JSON.stringify({ version: 1, order: 'listed', levels: ['gone.json', 'keep.json'] })
  const f = folder({ 'index.json': manifestSource, 'keep.json': JSON.stringify(FIRST_LEVEL) })
  const entry = { fileName: 'gone.json', missing: true }
  const initial = await readLocalLevelDirectory(f.directory)
  assert.deepEqual(initial.errors, []); assert.deepEqual(initial.missing, [entry])
  f.contents.set('gone.json', 'Restored outside the game')
  await assert.rejects(deleteLocalLevel(f.directory, entry, manifestSource), /back in the folder/)
  assert.equal(f.contents.get('gone.json'), 'Restored outside the game')
  f.contents.delete('gone.json')
  await deleteLocalLevel(f.directory, entry, manifestSource)
  assert.deepEqual(JSON.parse(f.contents.get('index.json')).levels, ['keep.json'])
  assert.equal(f.directories.size, 0)
})

test('delete failures and external changes preserve the source and restore the manifest', async () => {
  const sourceText = JSON.stringify(FIRST_LEVEL), manifestSource = JSON.stringify({ version: 1, levels: ['level.json'] })
  for (const mode of ['backup', 'index', 'remove', 'external-file', 'external-index']) {
    const f = folder({ 'level.json': sourceText, 'index.json': manifestSource })
    if (mode === 'backup') f.directory.getDirectoryHandle = async () => { throw Error('Backup denied') }
    if (mode === 'index') {
      const get = f.directory.getFileHandle
      f.directory.getFileHandle = async (name, options) => {
        const handle = await get(name, options)
        if (name === 'index.json') handle.createWritable = async () => { throw Error('Index denied') }
        return handle
      }
    }
    if (mode === 'remove') f.directory.removeEntry = async () => { throw Error('Delete denied') }
    if (mode === 'external-file') f.contents.set('level.json', 'External file edit')
    if (mode === 'external-index') f.contents.set('index.json', JSON.stringify({ version: 1, levels: [] }))
    const before = new Map(f.contents)
    await assert.rejects(deleteLocalLevel(f.directory, { fileName: 'level.json', level: FIRST_LEVEL, sourceText }, manifestSource))
    assert.deepEqual(f.contents, before, mode)
  }
})

test('restore refuses collisions and changed backups, and survives a folder cleanup failure', async () => {
  const sourceText = JSON.stringify(FIRST_LEVEL), manifestSource = JSON.stringify({ version: 1, levels: ['level.json'] })
  const f = folder({ 'level.json': sourceText, 'index.json': manifestSource })
  const removed = await deleteLocalLevel(f.directory, { fileName: 'level.json', level: FIRST_LEVEL, sourceText }, manifestSource)
  const entry = (await readDeletedLevels(f.directory)).deleted[0]
  f.contents.set('level.json', 'New file')
  await assert.rejects(restoreDeletedLevel(f.directory, entry, 'level.json', removed.manifestSource), /already exists/)
  assert.equal(f.contents.get('level.json'), 'New file')
  const bin = f.directories.get('Deleted levels'), archive = bin.directories.get(entry.directoryName)
  archive.contents.set(entry.fileName, 'Changed backup')
  await assert.rejects(restoreDeletedLevel(f.directory, entry, 'restored.json', removed.manifestSource), /changed on disk/)
  assert.equal(f.contents.has('restored.json'), false)
  archive.contents.set(entry.fileName, sourceText)
  bin.directory.removeEntry = async () => { throw Error('Cannot clean directory') }
  await restoreDeletedLevel(f.directory, entry, 'restored.json', removed.manifestSource)
  assert.equal(f.contents.get('restored.json'), sourceText)
  assert.equal(f.contents.get('level.json'), 'New file')
  assert.equal(archive.contents.size, 0)
})

test('failed restore rolls back its new file and index while keeping the recovery copy', async () => {
  const sourceText = JSON.stringify(FIRST_LEVEL), manifestSource = JSON.stringify({ version: 1, levels: ['level.json'] })
  const f = folder({ 'level.json': sourceText, 'index.json': manifestSource })
  const removed = await deleteLocalLevel(f.directory, { fileName: 'level.json', level: FIRST_LEVEL, sourceText }, manifestSource)
  const entry = (await readDeletedLevels(f.directory)).deleted[0]
  const archive = f.directories.get('Deleted levels').directories.get(entry.directoryName)
  archive.directory.removeEntry = async () => { throw Error('Recovery file is busy') }
  await assert.rejects(restoreDeletedLevel(f.directory, entry, 'level.json', removed.manifestSource), /busy/)
  assert.equal(f.contents.has('level.json'), false)
  assert.equal(f.contents.get('index.json'), removed.manifestSource)
  assert.equal(archive.contents.get('level.json'), sourceText)
})

test('empty recycle bin removes only confirmed unchanged entries and keeps new or unrelated files', async () => {
  const f = folder(), sourceText = JSON.stringify(FIRST_LEVEL)
  const remove = async name => {
    f.contents.set(name, sourceText)
    await deleteLocalLevel(f.directory, { fileName: name, level: FIRST_LEVEL, sourceText })
  }
  await remove('first.json')
  const confirmed = (await readDeletedLevels(f.directory)).deleted
  await remove('later.json')
  const bin = f.directories.get('Deleted levels'), archive = bin.directories.get(confirmed[0].directoryName)
  archive.contents.set('notes.txt', 'Keep me')
  archive.contents.set('first.json', 'Changed')
  await assert.rejects(emptyDeletedLevels(f.directory, confirmed), /changed on disk/)
  assert.equal((await readDeletedLevels(f.directory)).deleted.length, 2)
  archive.contents.set('first.json', sourceText)
  await emptyDeletedLevels(f.directory, confirmed)
  assert.equal(archive.contents.get('notes.txt'), 'Keep me')
  const remaining = (await readDeletedLevels(f.directory)).deleted
  assert.deepEqual(remaining.map(entry => entry.fileName), ['later.json'])
  await emptyDeletedLevels(f.directory, remaining)
  assert.equal((await readDeletedLevels(f.directory)).deleted.length, 0)
  assert.equal(archive.contents.get('notes.txt'), 'Keep me')
})

function fillBudget(directory) {
  const original = directory.values.bind(directory)
  directory.values = async function* () {
    yield* original()
    for (let i = 0; i < 25; i++) yield { kind: 'file', name: `padding-${i}.json`, getFile: async () => ({ name: `padding-${i}.json`, size: 1_000_000,
      text: async () => { throw new Error('Must reject using metadata before reading contents') } }) }
  }
}

test('oversized collections cannot be loaded, saved, renamed, or given a manifest', async () => {
  const original = JSON.stringify(FIRST_LEVEL), f = folder({ 'level.json': original })
  fillBudget(f.directory)
  await assert.rejects(readLocalLevelDirectory(f.directory), /25 MB/)
  await assert.rejects(writeLocalLevel(f.directory, 'new.json', FIRST_LEVEL), /25 MB/)
  await assert.rejects(writeLocalLevel(f.directory, 'renamed.json', FIRST_LEVEL, original, 'level.json'), /25 MB/)
  await assert.rejects(writeLevelOrder(f.directory, [{ fileName: 'level.json' }]), /25 MB/)
  assert.deepEqual(f.writes, [])
  assert.deepEqual([...f.contents], [['level.json', original]])
})

test('directory enumeration stops at the file-count limit without reading level text', async () => {
  let visited = 0, metadata = 0
  const directory = { async *values() {
    for (let i = 0; i < 1000; i++) {
      visited++
      yield { kind: 'file', name: `${i}.json`, getFile: async () => { metadata++; return { name: `${i}.json`, size: 10, text: async () => { throw Error('Must not read') } } } }
    }
  } }
  await assert.rejects(readLocalLevelDirectory(directory), /500/)
  assert.equal(visited, 501); assert.equal(metadata, 500)
})

test('edits and collisions during budget preflight cannot be overwritten by a save', async () => {
  const source = JSON.stringify(FIRST_LEVEL)
  for (const creating of [false, true]) {
    const f = folder(creating ? {} : { 'level.json': source })
    f.directory.values = async function* () {
      f.contents.set('level.json', 'Concurrent edit')
      yield { kind: 'file', name: 'level.json', getFile: async () => new File(['Concurrent edit'], 'level.json') }
    }
    await assert.rejects(writeLocalLevel(f.directory, 'level.json', FIRST_LEVEL, creating ? undefined : source), creating ? /“level.json” already exists/ : /changed on disk/)
    assert.equal(f.contents.get('level.json'), 'Concurrent edit')
    assert.deepEqual(f.writes, [])
  }
})

test('recycle-bin loads, deletes and restores enforce budgets without losing either copy', async () => {
  const sourceText = JSON.stringify(FIRST_LEVEL), f = folder({ 'level.json': sourceText })
  await deleteLocalLevel(f.directory, { fileName: 'level.json', level: FIRST_LEVEL, sourceText })
  const entry = (await readDeletedLevels(f.directory)).deleted[0]
  const archive = f.directories.get('Deleted levels').directories.get(entry.directoryName)
  fillBudget(f.directory)
  await assert.rejects(restoreDeletedLevel(f.directory, entry, 'level.json'), /25 MB/)
  assert.equal(archive.contents.get('level.json'), sourceText)
  assert.equal(f.contents.has('level.json'), false)
  fillBudget(archive.directory)
  await assert.rejects(readDeletedLevels(f.directory), /25 MB/)
  f.contents.set('another.json', sourceText)
  await assert.rejects(deleteLocalLevel(f.directory, { fileName: 'another.json', level: FIRST_LEVEL, sourceText }), /recycle bin.*25 MB/)
  assert.equal(f.contents.get('another.json'), sourceText)
  assert.equal(archive.contents.get('level.json'), sourceText)
})
