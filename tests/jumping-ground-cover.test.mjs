import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { moveItem, resizeItem, transformTerrain, moveVertex, insertTerrainNode, deleteTerrainNode, duplicateItem } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { groundCoverRoots, terrainGroundCover } from '../src/games/jumping/terrainGroundCover.ts'

const selection = { kind: 'platform', index: 0 }
const scene = () => ({ ...blankTrial(), platforms: [{ x: 200, y: 300, w: 400, h: 200, groundCover: 'grass' }] })

test('ground cover is optional terrain data in both level versions, with bounded types', () => {
  for (const version of [1, 2]) {
    const level = { ...scene(), version, ...(version === 2 ? { lighting: { nightMode: false, ambient: 0, lights: [] } } : {}) }
    for (const cover of ['none', 'grass', 'scrub', 'moss']) {
      level.platforms[0].groundCover = cover
      assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
    }
    delete level.platforms[0].groundCover
    assert.deepEqual(parseLevel(level), level)
    for (const invalid of [true, null, 'wood', '', {}, ['grass'], 1])
      assert.throws(() => parseLevel({ ...level, platforms: [{ ...level.platforms[0], groundCover: invalid }] }))
  }
})

test('terrain ground cover survives node conversion, transforms, duplicate and clipboard', () => {
  let level = scene()
  level = moveItem(level, selection, 20, 20)
  level = resizeItem(level, selection, 420, 220)
  level = insertTerrainNode(level, { index: 0, edge: 0, x: 400, y: 320 })
  level = moveVertex(level, 0, 1, 0, -20)
  level = deleteTerrainNode(level, 0, 1)
  level = transformTerrain(level, 0, 'flip-horizontal')
  assert.equal(level.platforms[0].groundCover, 'grass')
  const duplicate = duplicateItem(level, selection).level
  assert.deepEqual(duplicate.platforms.map(p => p.groundCover), ['grass', 'grass'])
  const pasted = pasteSelections(level, copySelections(level, [selection]), 80, 0)
  assert.equal(pasted.level.platforms.at(-1).groundCover, 'grass')
  assert.deepEqual(parseLevel(pasted.level), pasted.level)
})

test('cover follows exposed tops and slopes while solid joins and coincident terrain have one owner', () => {
  const level = scene(), roots = groundCoverRoots(level)
  assert.ok(roots.length > 15)
  assert.ok(roots.every(r => r.y === 300 && r.slope === 0 && r.terrain === 0))
  assert.equal(groundCoverRoots(level), roots)
  level.platforms.push({ x: 300, y: 250, w: 100, h: 100 })
  assert.ok(groundCoverRoots(level).every(r => r.x < 300 || r.x > 400), 'buried roots are hidden')
  level.platforms = [{ x: 200, y: 300, w: 400, h: 200, profile: [[0, 0], [400, 160]], groundCover: 'moss' }]
  assert.ok(groundCoverRoots(level).every(r => Math.abs(r.y - 300 - (r.x - 200) * .4) < 1e-8 && r.slope === .4))
  level.platforms.push({ ...level.platforms[0], groundCover: 'scrub' })
  assert.ok(groundCoverRoots(level).every(r => r.terrain === 1 && r.type === 'scrub'))
  level.platforms[0].zIndex = 1
  assert.ok(groundCoverRoots(level).every(r => r.terrain === 0 && r.type === 'moss'))
  level.platforms[0].groundCover = 'none'
  assert.deepEqual(groundCoverRoots(level), [], 'a bare foreground top hides cover on the coincident rear terrain')
})

test('curved cover remains sparse; edits invalidate the plan and backgrounds do not control terrain cover', () => {
  const level = scene()
  level.platforms[0].profile = [[0, 80], [400, 80]]
  level.platforms[0].bezier = [{ out: [120, -80] }, { in: [-120, -80] }, null, null]
  const roots = groundCoverRoots(level)
  assert.ok(roots.length > 10 && roots.length < 30)
  assert.ok(roots.some(r => r.y < 370))
  level.platforms[0].groundCover = 'moss'
  assert.ok(groundCoverRoots(level).every(r => r.type === 'moss'))
  level.environment = { kind: 'landscape', horizon: 200, walls: [] }
  const outside = groundCoverRoots(level)
  level.environment.kind = 'interior'
  assert.deepEqual(groundCoverRoots(level), outside)
  level.platforms[0].x += 20
  assert.notDeepEqual(groundCoverRoots(level), outside)
})

test('legacy spans attach to supporting terrain and explicit None or a new type overrides them', () => {
  const level = scene(); delete level.platforms[0].groundCover
  level.environment = { kind: 'landscape', horizon: 200, walls: [], groundCover: [{ x: 240, y: 300, w: 100 }] }
  assert.equal(terrainGroundCover(level, 0), 'scrub')
  assert.ok(groundCoverRoots(level).every(r => r.legacy && r.x >= 240 && r.x < 340))
  level.platforms[0].groundCover = 'none'
  assert.equal(terrainGroundCover(level, 0), 'none'); assert.deepEqual(groundCoverRoots(level), [])
  level.platforms[0].groundCover = 'grass'
  assert.ok(groundCoverRoots(level).some(r => r.x > 400))
  assert.ok(groundCoverRoots(level).every(r => !r.legacy && r.type === 'grass'))
  assert.deepEqual(level.environment.groundCover, [{ x: 240, y: 300, w: 100 }])
})

test('cover edits preserve settled rope geometry', () => {
  const level = scene()
  level.climbables.ropes = [{ x: 190, y: 200, length: 240, segments: 31 }]
  const prepared = prepareLevelRopes(level)
  const changed = { ...prepared, platforms: [{ ...prepared.platforms[0], groundCover: 'moss' }] }
  assert.equal(prepareLevelRopes(changed).climbables.ropes[0], prepared.climbables.ropes[0])
})
