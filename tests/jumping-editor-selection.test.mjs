import test from 'node:test'
import assert from 'node:assert/strict'
import { copySelections, deleteSelections, moveSelections, pasteSelections, selectionsInRect, transformSelections } from '../src/games/jumping/editorSelection.ts'
import { blankTrial, copyLevel, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { polygonPoints } from '../src/games/jumping/geometry.ts'
import { terrainDrawOrder } from '../src/games/jumping/terrainOrder.ts'
const pick = (kind, index = 0) => ({ kind, index })
function scene() {
  const level = { ...blankTrial(), width: 1400, height: 900, floor: 900, spawn: { x: 440, y: 400 }, goal: { x: 1200, y: 900 } }
  level.platforms = [{ x: 400, y: 400, w: 200, h: 100, name: 'A', zIndex: 2 }, { x: 600, y: 500, w: 100, h: 160, name: 'B', zIndex: 1 }]
  level.climbables.ropes = [{ x: 440, y: 400, length: 180, segments: 23, anchor: { platform: 0, x: 40, y: 0 } }]
  level.climbables.ladders = [{ x: 384, top: 400, bottom: 700, side: 1, platform: 0 }]
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 800, y: 600, w: 120, h: 20, travel: 100 }]
  level.triggers = [{ x: 810, y: 600, w: 80, mode: 'touch', targets: ['lift', 'field'], mount: { mechanism: 'lift', x: 10 } }]
  level.gravityPlates = [{ id: 'field', x: 1000, y: 0, w: 160, h: 900, gravity: -1, power: 'switched' }]
  return level
}
test('a selected terrain, rope, ladder and marker move exactly once with their bindings intact', () => {
  const level = scene(), original = copyLevel(level)
  const changed = moveSelections(level, [pick('spawn'), pick('ladder'), pick('rope'), pick('platform')], 40, 20)
  assert.deepEqual(changed.spawn, { x: 480, y: 420 })
  assert.deepEqual([changed.climbables.ropes[0].x, changed.climbables.ropes[0].y], [480, 420])
  assert.equal(changed.climbables.ropes[0].anchor.platform, 0)
  assert.deepEqual(changed.climbables.ladders[0], { x: 424, top: 420, bottom: 720, side: 1, platform: 0 })
  assert.deepEqual(changed.platforms[1], level.platforms[1])
  assert.deepEqual(level, original)
  assert.doesNotThrow(() => parseLevel(changed))
})
test('moving a mounted plate and its lift keeps the mount and uses one common clamped translation', () => {
  const level = scene()
  const changed = moveSelections(level, [pick('trigger'), pick('mechanism')], 80, 50)
  assert.deepEqual([changed.triggers[0].x, changed.triggers[0].y], [890, 650])
  assert.deepEqual(changed.triggers[0].mount, { mechanism: 'lift', x: 10 })
  const edge = moveSelections(level, [pick('platform', 0), pick('platform', 1)], -1000, 0)
  assert.equal(edge.platforms[0].x, 16, 'the attached ladder clears the room boundary')
  assert.equal(edge.platforms[1].x - edge.platforms[0].x, 200, 'spacing is preserved')
})
test('pasting terrain and its attachments remaps indices without moving any original marker', () => {
  const level = scene(), original = copyLevel(level), group = [pick('ladder'), pick('platform'), pick('rope'), pick('platform', 1)]
  const clipboard = copySelections(level, group)
  const result = pasteSelections(level, clipboard, 80, 40), changed = result.level
  assert.equal(changed.platforms.length, 4)
  assert.deepEqual(changed.spawn, original.spawn)
  assert.deepEqual(changed.goal, original.goal)
  assert.deepEqual(changed.platforms.slice(0, 2).map(({ zIndex, ...b }) => b), original.platforms.map(({ zIndex, ...b }) => b))
  assert.deepEqual([changed.climbables.ropes[1].x, changed.climbables.ropes[1].y], [520, 440])
  assert.equal(changed.climbables.ropes[1].anchor.platform, 2)
  assert.equal(changed.climbables.ladders[1].platform, 2)
  assert.deepEqual(terrainDrawOrder(changed.platforms).slice(-2), [3, 2])
  assert.doesNotThrow(() => parseLevel(changed))
  assert.deepEqual(level, original)
  level.platforms[0].x = 500
  assert.equal(clipboard.level.platforms[0].x, 400, 'copy captures a snapshot')
})
test('copied devices get independent IDs, internal wiring and copied mounts', () => {
  const level = scene(), clipboard = copySelections(level, [pick('trigger'), pick('mechanism'), pick('gravity-plate')])
  const changed = pasteSelections(level, clipboard, 40, 0).level
  const lift = changed.mechanisms[1], field = changed.gravityPlates[1], plate = changed.triggers[1]
  assert.notEqual(lift.id, 'lift'); assert.notEqual(field.id, 'field')
  assert.deepEqual(plate.targets, [lift.id, field.id]); assert.equal(plate.mount.mechanism, lift.id)
  assert.deepEqual([plate.x, plate.y], [850, 600])
  assert.deepEqual(changed.triggers[0], level.triggers[0])
  assert.doesNotThrow(() => parseLevel(changed))
})
test('copying an attached child alone detaches the copy, and foreign-level wiring does not leak', () => {
  const source = scene(), target = { ...scene(), id: 'another-level' }
  const result = pasteSelections(target, copySelections(source, [pick('rope'), pick('trigger')]), 40, 0).level
  assert.equal(result.climbables.ropes[1].anchor, undefined)
  assert.equal(result.triggers[1].mount, undefined)
  assert.deepEqual(result.triggers[1].targets, [])
})
test('paste limits fail atomically and unique markers cannot be duplicated', () => {
  const level = scene(), copy = copySelections(level, [pick('spawn'), pick('goal'), pick('platform')])
  assert.deepEqual(copy.selections, [pick('platform')])
  level.platforms = Array.from({ length: 160 }, () => structuredClone(level.platforms[0]))
  const before = copyLevel(level)
  assert.throws(() => pasteSelections(level, copy), /no room/)
  assert.deepEqual(level, before)
})
test('editing terrain near a rope does not prevent duplication or pasting other objects', () => {
  const saved = prepareLevelRopes(scene())
  const clipboard = copySelections(saved, [pick('platform')])
  const draft = prepareLevelRopes(moveSelections(saved, [pick('platform', 1)], 5, 0), true)
  assert.ok(draft.climbables.ropes[0].rest.key.startsWith('preview:'))
  const original = copyLevel(draft)
  assert.throws(() => parseLevel(draft), /not a valid jumping level/, 'temporary previews are still not valid saved data')
  for (const selection of [pick('platform'), pick('rope'), pick('ladder'), pick('mechanism'), pick('trigger'), pick('gravity-plate')]) {
    const result = pasteSelections(draft, copySelections(draft, [selection]), 40, 0)
    assert.equal(result.selections.length, 1, `duplicates ${selection.kind} without reloading the draft`)
    assert.doesNotThrow(() => parseLevel(result.level))
    assert.deepEqual(result.level.platforms.slice(0, 2).map(({ zIndex, ...b }) => b), draft.platforms.map(({ zIndex, ...b }) => b))
    assert.deepEqual(draft, original, 'validation and duplication do not mutate the source draft')
  }
  const pasted = pasteSelections(draft, clipboard, 40, 0).level
  assert.equal(pasted.platforms.length, 3, 'a clipboard captured before editing also pastes into the live draft')
  assert.doesNotThrow(() => parseLevel(pasted))
  const malformed = copyLevel(draft)
  malformed.climbables.ropes[0].rest.key = 'invalid-cache-key'
  assert.throws(() => pasteSelections(malformed, clipboard), /not a valid jumping level/, 'invalid saved caches still fail validation')
})
test('terrain group transforms preserve the layout through inverses and carry rope anchors', () => {
  const level = scene(), group = [pick('platform'), pick('platform', 1)]
  const points = l => l.platforms.flatMap(polygonPoints).map(p => p.join(',')).sort()
  for (const action of ['rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical']) {
    const changed = transformSelections(level, group, action)
    const rope = changed.climbables.ropes[0], b = changed.platforms[0]
    assert.equal(rope.x, b.x + rope.anchor.x); assert.equal(rope.y, b.y + rope.anchor.y)
    assert.deepEqual(changed.spawn, level.spawn)
    assert.deepEqual(changed.platforms.map(b => b.zIndex), [2, 1])
    assert.doesNotThrow(() => parseLevel(changed))
    const inverse = action === 'rotate-left' ? 'rotate-right' : action === 'rotate-right' ? 'rotate-left' : action
    assert.deepEqual(points(transformSelections(changed, group, inverse)), points(level))
  }
  const turned = transformSelections(level, group, 'rotate-right')
  assert.deepEqual(turned.platforms.map(b => [b.x,b.y,b.w,b.h]), [[580,380,100,200],[420,580,160,100]])
  assert.equal(transformSelections(level, [...group, pick('rope')], 'rotate-right'), level)
})
test('marquee tests actual terrain polygons rather than their empty bounding-box corners', () => {
  const level = scene()
  level.platforms = [{ x: 300, y: 300, w: 200, h: 200, polygon: [[0,200],[200,0],[200,200]] }]
  assert.equal(selectionsInRect(level, { x: 305, y: 305, w: 20, h: 20 }).length, 0)
  assert.deepEqual(selectionsInRect(level, { x: 460, y: 460, w: 20, h: 20 }), [pick('platform')])
})
test('group deletion removes the intended indices and retains unique markers', () => {
  const level = scene()
  const changed = deleteSelections(level, [pick('platform'), pick('platform', 1), pick('rope'), pick('spawn'), pick('goal')])
  assert.equal(changed.platforms.length, 0); assert.equal(changed.climbables.ropes.length, 0)
  assert.deepEqual(changed.spawn, level.spawn); assert.deepEqual(changed.goal, level.goal)
})

test('marquee follows upward and bent rope artwork and does not catch invisible gravity interiors', () => {
  const level=scene()
  level.climbables.ropes=[{x:200,y:800,length:200,segments:25,rest:{points:[[200,800],[220,700],[240,600]]}}]
  assert.deepEqual(selectionsInRect(level,{x:210,y:740,w:20,h:10}),[pick('rope')])
  assert.deepEqual(selectionsInRect(level,{x:1040,y:300,w:30,h:30}),[])
  assert.deepEqual(selectionsInRect(level,{x:1040,y:880,w:30,h:20}),[pick('gravity-plate')])
})
test('a robot with a room-wide patrol can move with a mixed group and retain bounded patrol limits',()=>{
  const level=scene();level.robots=[{x:900,y:900,left:50,right:1350}]
  const changed=moveSelections(level,[pick('robot'),pick('platform')],40,0)
  assert.equal(changed.robots[0].x,940);assert.equal(changed.platforms[0].x,440)
  assert.equal(changed.robots[0].left,90);assert.equal(changed.robots[0].right,1350)
  assert.doesNotThrow(()=>parseLevel(changed))
})
