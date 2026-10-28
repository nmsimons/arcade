import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { parseEnvironment } from '../src/games/jumping/environment.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { clearExteriorProgress, restoreExteriorProgress, saveExteriorProgress } from '../src/games/jumping/exteriorProgress.ts'
import { daylightPortals, EnvironmentLighting } from '../src/games/jumping/environmentLighting.ts'
import { androidMaterials } from '../src/games/jumping/androidArtwork.ts'

const fixture = JSON.parse(readFileSync(new URL('fixtures/jumping-escape-runs.json', import.meta.url)))
const read = name => parseLevel(JSON.parse(readFileSync(new URL(`../public/levels/jumping/${name}`, import.meta.url))))
const ending = () => parseLevel(structuredClone(fixture.levels['spelunk3.jump-level.json']))
function replay(run, recording, finish = true) {
  for (const { frames, input } of finish ? recording.inputs : recording.inputs.slice(0, -1))
    for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }, STEP)
  return run
}

test('landscape schema preserves authored outlines and rejects malformed or unbounded artwork', () => {
  const level = ending()
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))).environment, level.environment)
  assert.deepEqual(levelProblems(level), [])
  const legacy = blankTrial()
  assert.equal('environment' in parseLevel(legacy), false)
  assert.throws(() => parseLevel({ ...level, version: 1, lighting: undefined }), /version 2/)
  for (const patch of [{ horizon: NaN }, { horizon: 2601 }, { walls: Array(41).fill(level.environment.walls[0]) },
    { walls: [{ kind: 'cave', x: 0, y: 0, w: 6201, h: 100 }] },
    { walls: [{ kind: 'facility', x: 0, y: 0, w: 100, h: 100, polygon: [[0, 0], [100, 100], [100, 0], [0, 100]] }] }])
    assert.throws(() => parseEnvironment({ ...level.environment, ...patch }, 6200, 2600), /Invalid environment/)
  assert.throws(() => parseLevel({ ...level, timing: undefined }), /valid jumping level/)
  assert.throws(() => parseLevel({ ...level, goal: { ...level.goal, id: 'locked', power: 'switched' } }), /valid jumping level/)
})

test('resizing follows the floor for the horizon, cave outlines and ground cover', () => {
  const level = ending(), next = resizeLevelHeight(level, 2800)
  assert.equal(next.environment.horizon, level.environment.horizon + 200)
  assert.equal(next.environment.walls[0].y, level.environment.walls[0].y + 200)
  assert.deepEqual(next.environment.walls[0].polygon, level.environment.walls[0].polygon)
  assert.equal(next.environment.groundCover[0].y, level.environment.groundCover[0].y + 200)
  assert.deepEqual(levelProblems(parseLevel(next)), [])
})

test('daylight enters the actual cave mouth while each terrain piece keeps its regional shade', () => {
  const level = ending(), run = createRun(level), light = new EnvironmentLighting()
  const portals = daylightPortals(level)
  assert.equal(portals.length, 3)
  assert.ok(portals.every(p => p.x > 1800 && p.x < 1805 && p.y > 800 && p.y < 1000))
  const exposures = [1500, 1600, 1700, 1750, 1790, 1810].map(x => light.exposureAt(run, x, 950))
  assert.ok(exposures.every((v, i) => i === 0 || v > exposures[i - 1]))
  assert.equal(light.exposureAt(run, 300, 2100), .35)
  assert.equal(exposures.at(-1), .95)
  assert.equal(light.terrainExposureAt(run, 1000, 465), .35, 'the roof belongs to a piece that also enters Night')
  assert.ok(light.terrainExposureAt(run, 1000, 1030) < .45, 'the underside of that same rock mass is shaded')
  assert.ok(light.terrainExposureAt(run, 100, 2200) < .45, 'an exposed upper edge cannot brighten the deep cavern wall')
  for (const [x, y] of [[3, 2497], [50, 1800], [103, 2400], [800, 2200], [1500, 1900]])
    assert.ok(light.terrainExposureAt(run, x, y) < .37, `deep terrain at ${x},${y} keeps the ordinary cave exposure`)
  assert.ok(light.terrainExposureAt(run, 2500, 1100) > .9, 'open outdoor ground retains its daylight material')
  const blocked = createRun({ ...level, platforms: [...level.platforms, { x: 1730, y: 780, w: 30, h: 240 }] })
  assert.equal(new EnvironmentLighting().exposureAt(blocked, 1700, 950), .35)
  for (const x of [300, 1600, 1700, 1900]) {
    const materials = light.playerMaterials({ ...run, player: { ...run.player, x, y: 981 } })
    assert.equal(androidMaterials(materials), materials)
    assert.ok(new Set(Object.values(materials)).size > 3, 'retain shell, face, joint and marking materials; never select the diagnostic mask')
  }
})

test('the enclosing frame keeps its dark regional shade independently of nearby light and actors', () => {
  const run = createRun(ending()), light = new EnvironmentLighting()
  assert.equal(light.frameExposureAt(run), .35)
  assert.equal(light.exposureAt(run, 2500, 950), .95, 'a bright exterior does not brighten the frame')
  const before = light.frameExposureAt(run)
  run.player.x = 1000; run.player.y = 2600
  assert.equal(light.frameExposureAt(run), before)
})

for (const recording of fixture.runs) test(`captured ${recording.file} ${recording.variant} completes using ordinary inputs`, () => {
  const run = replay(createRun(parseLevel(structuredClone(fixture.levels[recording.file]))), recording)
  assert.equal(run.finished, true)
  assert.ok(Math.abs(run.elapsed - recording.elapsed) < STEP)
  if (recording.file.includes('2')) {
    assert.equal(run.grade, recording.variant === 'ordinary' ? 'B' : 'A')
    if (recording.variant === 'ordinary') {
      assert.equal(run.triggers[0].active, true, 'the ball still holds the receiver after departure')
      assert.ok(Math.abs(run.props[0].x - 1130) < 1)
    } else assert.equal(run.triggers[1].active, true, 'the alternate route uses the manual release')
  } else {
    assert.equal(run.grade, null); assert.equal(run.elapsed, 0); assert.equal(run.exit, null)
    assert.ok(run.player.x > 5600 && run.player.y === 760)
    assert.equal(run.triggers[0].active, true, 'restore exterior access on the last service shelf')
  }
})

test('current finale assets are valid and follow the Ascent levels', () => {
  for (const name of ['spelunk.jump-level.json', 'exit.jump-level.json']) {
    const level = read(name)
    assert.deepEqual(levelProblems(level), [])
  }
  const catalog = JSON.parse(readFileSync(new URL('../public/levels/jumping/index.json', import.meta.url)))
  const start = catalog.levels.indexOf('Ascent.jump-level.json')
  assert.ok(start >= 0)
  const closing = catalog.levels.slice(start)
  assert.deepEqual(closing.slice(0, 2), ['Ascent.jump-level.json', 'ascent2.jump-level.json'])
  assert.equal(read(closing[2]).id, '13b9b9d7-7937-4989-bc03-21238e7e58f2', 'Spelunk keeps its identity when the author renames its file')
  assert.deepEqual(closing.slice(2), ['spelunk.jump-level.json', 'exit.jump-level.json'])
})

test('the overlook requires an explicit finish; outdoor resume keeps the last latch and rejects unsafe stale saves', () => {
  const recording = fixture.runs.find(r => r.file.includes('3') && r.variant === 'ordinary')
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  const run = createRun(ending())
  saveExteriorProgress(storage, run)
  assert.equal(data.size, 0, 'cave progress cannot masquerade as the exterior checkpoint')
  replay(run, recording, false)
  for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.finished, false); assert.equal(run.elapsed, 0)
  saveExteriorProgress(storage, run)
  const resumed = createRun(ending())
  assert.equal(restoreExteriorProgress(storage, resumed), true)
  assert.ok(resumed.player.x > 5600); assert.equal(resumed.entrance, null)
  stepRun(resumed, NEUTRAL_INPUT)
  assert.equal(resumed.mechanisms[0].active, true)
  assert.equal(resumed.finished, false)
  stepRun(resumed, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(resumed.finished, true)
  const key = [...data.keys()][0], saved = JSON.parse(data.get(key))
  for (const point of [{ ...saved, x: NaN }, { ...saved, x: 200, y: 2380 }, { ...saved, x: 4000, y: 100 }, { ...saved, id: 'other' }]) {
    data.set(key, JSON.stringify(point)); assert.equal(restoreExteriorProgress(storage, createRun(ending())), false)
  }
  clearExteriorProgress(storage); assert.equal(data.size, 0)
})
