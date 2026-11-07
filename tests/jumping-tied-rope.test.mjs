import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { blankTrial, levelProblems, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { ropeGripLimit } from '../src/games/jumping/climbables.ts'
import { addItem, deleteItem, duplicateItem, moveItem, moveRopeAnchor, resizeItem, setRopeRelease, setRopeTied } from '../src/games/jumping/editor.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { switchedItems } from '../src/games/jumping/switchPower.ts'

// Two pillars with a rope tied between their tops, 600 apart, with 80 of slack.
const pillars = [{ x: 300, y: 500, w: 200, h: 420 }, { x: 1100, y: 500, w: 200, h: 420 }]
const tied = (extra = {}) => ({ x: 500, y: 500, length: 680, segments: 85, anchor: { platform: 0, x: 200, y: 0 },
  end: { x: 1100, y: 500, anchor: { platform: 1, x: 0, y: 0 } }, ...extra })
const course = (rope = tied(), extra = {}) => prepareLevelRopes(parseLevel({ ...blankTrial(), platforms: pillars, climbables: { ladders: [], ropes: [rope] }, ...extra }))
const lowest = points => points.reduce((low, p) => p[1] > low[1] ? p : low)

/** Catch the rope's middle in flight and settle into the hang. */
function hanging(level) {
  const run = createRun(level), p = run.player; run.started = true
  const low = lowest(level.climbables.ropes[0].rest.points)
  Object.assign(p, { x: low[0] - 10, y: low[1] + 60, grounded: false, facing: 1, vx: 0, vy: 0 })
  const step = (input, frames) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
  step({ climb: true }, 20); step({}, 60)
  assert.ok(p.climbing?.rope, 'caught the rope')
  return { run, p, step }
}

test('a tied rope reaches both anchors and sags between them', () => {
  const level = course(), rope = level.climbables.ropes[0]
  assert.deepEqual(levelProblems(level), [])
  assert.deepEqual(rope.rest.points[0], [500, 500])
  assert.deepEqual(rope.rest.points.at(-1), [1100, 500])
  assert.ok(lowest(rope.rest.points)[1] > 580, `sags to y ${lowest(rope.rest.points)[1].toFixed(0)}`)
  // A rope shorter than the span between its anchors is lengthened to reach them, taut.
  assert.equal(parseLevel({ ...blankTrial(), platforms: pillars, climbables: { ladders: [], ropes: [tied({ length: 300 })] } }).climbables.ropes[0].length, 600)
  // A saved shape that no longer ends at the second anchor is solved again.
  const stale = { ...tied(), rest: { key: rope.rest.key, points: rope.rest.points.map(([x, y]) => [x, y + (x > 1000 ? 5 : 0)]) } }
  stale.rest.points[0] = [500, 500]
  assert.equal(parseLevel({ ...blankTrial(), platforms: pillars, climbables: { ladders: [], ropes: [stale] } }).climbables.ropes[0].rest, undefined)
  for (const broken of [
    { x: 0, y: 0, length: 2000, segments: 167, end: { x: 1800, y: 920 } },
    { ...tied(), release: { id: 'drop', anchor: 'middle' } },
    { x: 500, y: 500, length: 300, segments: 38, release: { id: 'drop', anchor: 'start' } },
  ]) assert.throws(() => parseLevel({ ...blankTrial(), platforms: pillars, climbables: { ladders: [], ropes: [broken] } }), /not a valid jumping level/)
})

test('Left and Right shimmy along the level middle, side-on; Up climbs a steep end onto its pillar', () => {
  const { run, p, step } = hanging(course()), c = () => p.climbing, rope = p.ropes[0]
  assert.equal(c().shimmy, true)
  for (const move of [1, -1]) {
    const x = p.x, distance = c().distance
    // A careful shimmy keeps an unhurried rhythm; turning back, the robot first brakes and turns about.
    step({ move }, move > 0 ? 120 : 150)
    assert.ok((p.x - x) * move > 40, `moved ${move > 0 ? 'right' : 'left'} by ${(p.x - x).toFixed(1)}`)
    assert.ok((c().distance - distance) * move > 40, 'along the rope, toward the second anchor on the right')
    assert.ok(Math.abs(c().swing) < .05, 'shimmying does not pump a swing')
    assert.equal(p.facing, move)
    assert.equal(c().shimmyBlend, 1, 'side-on, hand over hand')
  }
  // The body follows the hands smoothly: no frame jumps while traveling.
  let previous = p.x, largest = 0
  for (let i = 0; i < 120; i++) { step({ move: 1 }, 1); largest = Math.max(largest, Math.abs(p.x - previous)); previous = p.x }
  assert.ok(largest < 1.5, `largest step ${largest.toFixed(2)} per frame`)
  // Stopping closes the hands onto one grip and faces the camera again.
  step({}, 60)
  assert.equal(c().shimmyBlend, 0)
  // Toward the right anchor the rope steepens; Right carries the robot up to it, and Up climbs on.
  step({ move: 1 }, 600)
  assert.ok(c(), 'still holding near the right anchor')
  const before = c().distance
  for (let i = 0; i < 400 && c(); i++) {
    step({ climb: true }, 1)
    if (c()) assert.ok(c().distance <= ropeGripLimit(rope.definition) && c().distance >= before - 1e-6, 'climbs toward the anchor without passing it')
  }
  // Up from the top of the rope catches the pillar's edge, and holding it pulls up.
  step({ climb: true }, 240); step({}, 60)
  assert.ok(p.grounded && Math.abs(p.y - 500) < 1 && p.x > 1100, `stands on the pillar at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`)
  assert.deepEqual([rope.nodes[0].x, rope.nodes[0].y, rope.nodes.at(-1).x, rope.nodes.at(-1).y], [500, 500, 1100, 500], 'both anchors hold')
  assert.equal(run.finished, false)
})

test('a rope hanging from one anchor never shimmies: Left and Right still swing it', () => {
  const level = course({ x: 800, y: 300, length: 300, segments: 38 })
  const run = createRun(level), p = run.player; run.started = true
  Object.assign(p, { x: 790, y: 560, grounded: false, facing: 1, vx: 0, vy: 0 })
  for (let i = 0; i < 20; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  for (let i = 0; i < 60; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(p.climbing)
  assert.ok(!p.climbing.shimmy)
  assert.ok(p.climbing.swing > .5, 'Right pumps a swing')
})

for (const anchor of ['start', 'end']) test(`a switch releases ${anchor === 'start' ? 'the first' : 'the second'} anchor for the rest of the run, and the rider keeps hold`, () => {
  const level = course(tied({ release: { id: 'drop', anchor } }), {
    triggers: [{ x: 1500, y: 920, w: 80, mode: 'weight', behavior: 'toggle', targets: ['drop'] }] })
  const { run, p, step } = hanging(level), rope = p.ropes[0], grip = p.climbing.distance
  assert.deepEqual(switchedItems(level).map(item => [item.kind, item.id]), [['rope', 'drop']])
  run.triggers[0].active = true
  step({}, 1)
  const kept = anchor === 'start' ? [1100, 500] : [500, 500]
  assert.equal(rope.definition.end, undefined, 'one anchor is left')
  assert.deepEqual([rope.definition.x, rope.definition.y], kept, 'the rope now hangs from the other anchor')
  assert.ok(p.climbing, 'the rider holds on')
  assert.ok(Math.abs(p.climbing.distance - (anchor === 'start' ? rope.definition.length - grip : grip)) < 3, 'at the same point on the rope')
  // Turning the switch off again does not re-tie the rope.
  run.triggers[0].active = false
  step({}, 240)
  assert.equal(rope.definition.end, undefined)
  assert.deepEqual([rope.nodes[0].x, rope.nodes[0].y], kept)
  const tail = rope.nodes.at(-1)
  assert.ok(Math.hypot(tail.x - kept[0], tail.y - kept[1]) > 300, 'the released end has fallen away from its anchor')
})

test('the studio ties a rope between two anchors and moves each anchor on its own', () => {
  const base = { ...blankTrial(), platforms: structuredClone(pillars), triggers: [{ x: 1500, y: 920, w: 80, mode: 'weight', behavior: 'toggle', targets: [] }] }
  const added = addItem(base, 'tied-rope', { x: 505, y: 495 }, { x: 1095, y: 495 })
  let level = added.level, rope = level.climbables.ropes[0]
  assert.deepEqual(added.selection, { kind: 'rope', index: 0 })
  assert.equal(objectLabel(level, added.selection), 'Tied rope 1')
  assert.deepEqual([rope.x, rope.y, rope.anchor, rope.end], [500, 500, { platform: 0, x: 200, y: 0 }, { x: 1100, y: 500, anchor: { platform: 1, x: 0, y: 0 } }], 'each end attached to the pillar it was dropped on')
  assert.ok(rope.length > 600, 'with some slack')
  assert.deepEqual(levelProblems(parseLevel(level)), [])

  // One anchor moves; the other stays attached. The rope lengthens to reach.
  const moved = moveRopeAnchor(level, 0, 'end', 1700, 200).climbables.ropes[0]
  assert.deepEqual([moved.x, moved.y, moved.anchor], [500, 500, rope.anchor])
  assert.deepEqual(moved.end, { x: 1700, y: 200 })
  assert.equal(moved.length, Math.ceil(Math.hypot(1200, 300)))
  // Dropped near a terrain edge, an anchor attaches to it.
  assert.deepEqual(moveRopeAnchor(level, 0, 'start', 290, 600).climbables.ropes[0].anchor, { platform: 0, x: 0, y: 100 })
  // Dragging the rope moves both anchors and frees them.
  const shifted = moveItem(level, { kind: 'rope', index: 0 }, 40, -100).climbables.ropes[0]
  assert.deepEqual([shifted.x, shifted.y, shifted.end], [540, 400, { x: 1140, y: 400 }])
  assert.equal(shifted.anchor, undefined)
  // Length never drops below the span between the anchors.
  assert.equal(resizeItem(level, { kind: 'rope', index: 0 }, 0, 100).climbables.ropes[0].length, 600)
  // Terrain carries the anchors attached to it; deleting it frees them.
  const raised = moveItem(level, { kind: 'platform', index: 1 }, 0, -50).climbables.ropes[0]
  assert.deepEqual([raised.end.x, raised.end.y], [1100, 450])
  const without = deleteItem(level, { kind: 'platform', index: 0 }).climbables.ropes[0]
  assert.equal(without.anchor, undefined)
  assert.deepEqual(without.end.anchor, { platform: 0, x: 0, y: 0 })

  // A release is a switched item; removing it or the rope removes its connections.
  level = setRopeRelease(level, 0, 'end')
  const id = level.climbables.ropes[0].release.id
  assert.deepEqual(switchedItems(level).map(item => [item.kind, item.index, item.id]), [['rope', 0, id]])
  level.triggers[0].targets = [id]
  assert.deepEqual(levelProblems(parseLevel(level)), [])
  assert.notEqual(duplicateItem(level, { kind: 'rope', index: 0 }).level.climbables.ropes[1].release.id, id, 'a copy gets its own switch ID')
  assert.deepEqual(deleteItem(level, { kind: 'rope', index: 0 }).triggers[0].targets, [])
  assert.deepEqual(setRopeRelease(level, 0, null).triggers[0].targets, [])
  // Untying keeps the rope, hanging from its first anchor; tying fixes its free end where it rests.
  const untied = setRopeTied(level, 0, false)
  assert.deepEqual([untied.climbables.ropes[0].end, untied.climbables.ropes[0].release, untied.triggers[0].targets], [undefined, undefined, []])
  // Unsolved, the free end hangs straight down to the floor, beside the pillar's foot.
  const retied = setRopeTied(untied, 0, true).climbables.ropes[0]
  assert.deepEqual([retied.end.x, retied.end.y], [500, 920])
})
