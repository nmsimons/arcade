import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadLevelCatalog, loadLocalLevelFiles, decodeLevelFile, playableLevelFile } from '../src/games/jumping/levelAssets.ts'
import { writeLocalLevel } from '../src/games/jumping/localLevels.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { levelProblems, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { JSON_LAB, FIRST_LEVEL } from './helpers/jumping-fixtures.mjs'

const root = new URL('../public/levels/jumping/', import.meta.url)
const index = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
const assets = new Map(await Promise.all(['index.json', ...index.levels].map(async name => [name, await readFile(new URL(name, root), 'utf8')])))
function server(data = new Map(assets)) {
  const requests = []
  return { data, requests, fetch: async (url, options) => {
    requests.push({ url, options }); const name = decodeURIComponent(url.split('/levels/jumping/')[1])
    return data.has(name) ? new Response(data.get(name)) : new Response(null, { status: 404 })
  } }
}

test('the deployed index includes only the JSON test lab and no other level assets', async () => {
  assert.deepEqual(index.levels, ['00-json-test-lab.json'])
  assert.deepEqual((await readdir(root)).sort(), ['00-json-test-lab.json', 'index.json'])
  const catalog = await loadLevelCatalog('/arcade/', server().fetch)
  assert.deepEqual(catalog.errors, []); assert.equal(catalog.files.length, 1)
  assert.deepEqual(catalog.files[0].level, JSON_LAB)
  assert.deepEqual(levelProblems(catalog.files[0].level), [])
})

test('sync removes retired built-in files from an existing deployment without removing unrelated files', async () => {
  const target = await mkdtemp(join(tmpdir(), 'jumping-asset-sync-'))
  try {
    await mkdir(join(target, 'campaign')); await mkdir(join(target, 'examples'))
    await writeFile(join(target, 'index.json'), JSON.stringify({ version: 1, campaign: ['00-old.json'], examples: ['01-old.json'], playground: 'playground.json', levels: ['99-removed.json'] }))
    for (const name of ['campaign/00-old.json', 'examples/01-old.json', 'playground.json', '99-removed.json']) await writeFile(join(target, name), '{}')
    await writeFile(join(target, 'notes.txt'), 'Keep this file')
    execFileSync(process.execPath, ['scripts/jumping-levels.mjs', 'sync', target])
    const files = (await readdir(target, { recursive: true })).filter(name => name.endsWith('.json')).sort()
    assert.deepEqual(files, ['00-json-test-lab.json', 'index.json'])
    assert.equal(await readFile(join(target, 'notes.txt'), 'utf8'), 'Keep this file')
    assert.deepEqual(JSON.parse(await readFile(join(target, '00-json-test-lab.json'), 'utf8')), JSON_LAB)
  } finally { await rm(target, { recursive: true, force: true }) }
})

test('runtime refresh discovers new files and changed geometry without rebuilding or reimporting code', async () => {
  const remote = server(), first = await loadLevelCatalog('/arcade/', remote.fetch)
  const edited = structuredClone(JSON_LAB); edited.width += 600; edited.name = 'Edited on disk'
  remote.data.set(index.levels[0], JSON.stringify(edited))
  remote.data.set('00-before.json', JSON.stringify({ ...edited, id: 'new-file', name: 'Added on disk' }))
  remote.data.set('index.json', JSON.stringify({ ...index, levels: [...index.levels].reverse().concat('00-before.json') }))
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
  remote.data.set('index.json', JSON.stringify({ ...index, levels: [...index.levels, '01-broken.json', '02-missing.json'] }))
  const catalog = await loadLevelCatalog('/', remote.fetch)
  assert.deepEqual(catalog.files.map(f => f.fileName), index.levels)
  assert.equal(catalog.errors.length, 2); assert.match(catalog.errors[0], /01-broken.json/); assert.match(catalog.errors[1], /HTTP 404/)
  remote.data.delete('index.json')
  await assert.rejects(loadLevelCatalog('/', remote.fetch), /index.json.*404/)
})

test('an invalid catalog cannot request arbitrary paths or origins', async () => {
  for (const name of ['../outside.json', 'https://example.com/map.json', 'nested/map.json', 'bad\\map.json', 'index.json']) {
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
  assert.deepEqual(level.mechanisms.map(m => m.kind).sort(), ['gate', 'lift'])
  assert.deepEqual(level.triggers.map(t => t.mode).sort(), ['touch', 'weight']); assert.ok(level.robots.length)
  assert.equal(level.timers.length, 2)
  assert.equal(level.texts.length, 2); assert.ok(level.texts.every(t => t.text.includes('\n')))
  assert.equal(level.pickups.length, 2); assert.ok(level.pickups.every(p => p.kind === 'stopwatch'))
  const run = createRun(level), original = createRun(level)
  for (let i = 0; i < 120; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(run.triggers[0].active, true); assert.equal(run.mechanisms[0].active, true); assert.ok(run.mechanisms[0].y < level.mechanisms[0].y)
  Object.assign(run.player, { x: 2740, y: 1400, grounded: true, footwork: null })
  for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.triggers[1].active, true); assert.equal(run.mechanisms[1].active, true)
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
  const contents = new Map(Object.entries(initial)), writes = []
  const directory = { getFileHandle: async (name, options) => {
    if (!contents.has(name) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
    return { name, getFile: async () => new File([contents.get(name) ?? ''], name), createWritable: async () => {
      let staged
      return { write: async text => { staged = text }, close: async () => { contents.set(name, staged); writes.push(name) }, abort: async () => {} }
    } }
  } }
  return { directory, contents, writes }
}
test('folder saves create portable files, update an explicitly loaded file and preserve its stable ID', async () => {
  const { directory, contents, writes } = folder(), before = structuredClone(FIRST_LEVEL)
  const first = await writeLocalLevel(directory, '00-test.json', FIRST_LEVEL)
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
  const broken = { getFileHandle: async () => ({ getFile: async () => new File(['original'], 'test.json'), createWritable: async () => ({ write: async () => { throw Error('Disk full') }, close: async () => {}, abort: async () => { aborted = true } }) }) }
  await assert.rejects(writeLocalLevel(broken, 'test.json', FIRST_LEVEL, 'original'), /Disk full/); assert.ok(aborted)
})
