import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { blankTrial, levelProblems, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { ROPE_BREAK_SECONDS, ropeGripLimit } from '../src/games/jumping/climbables.ts'
import { addItem, deleteItem, duplicateItem, moveItem, moveRopeAnchor, resizeItem, setRopeBreakaway, setRopeRelease, setRopeTied } from '../src/games/jumping/editor.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { switchedItems } from '../src/games/jumping/switchPower.ts'
import { drawRopes } from '../src/games/jumping/render.ts'
import { STEP } from '../src/games/jumping/model.ts'

// Two pillars with a rope tied between their tops, 600 apart, with 80 of slack.
const pillars = [{ x: 300, y: 500, w: 200, h: 420 }, { x: 1100, y: 500, w: 200, h: 420 }]
const tied = (extra = {}) => ({ x: 500, y: 500, length: 680, segments: 85, anchor: { platform: 0, x: 200, y: 0 },
  end: { x: 1100, y: 500, anchor: { platform: 1, x: 0, y: 0 } }, ...extra })
const course = (rope = tied(), extra = {}) => prepareLevelRopes(parseLevel({ ...blankTrial(), platforms: pillars, climbables: { ladders: [], ropes: [rope] }, ...extra }))
const lowest = points => points.reduce((low, p) => p[1] > low[1] ? p : low)

/** The points a rope's stroke passes through and the anchors drawn, as drawRopes paints them. */
function drawnRope(p, level) {
  const stroke = [], anchors = [], colors = []
  const ctx = { beginPath() {}, stroke() {}, fill() { colors.push(this.fillStyle) }, moveTo: (x, y) => stroke.push([x, y]), lineTo: (x, y) => stroke.push([x, y]),
    arc: (x, y) => anchors.push([x, y]) }
  drawRopes(ctx, p, level.climbables)
  return { stroke, anchors, colors }
}

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
    { ...tied(), release: { id: 'drop', anchor: 'end', weight: false } },
    { ...tied(), release: { id: 'drop', anchor: 'end', weight: 'yes' } },
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
  // Only the live rope is drawn: no anchor where it let go, and no taut line back to it.
  const drawn = drawnRope(p, level)
  assert.deepEqual(drawn.anchors, [kept], 'one anchor is drawn')
  assert.deepEqual(drawn.stroke[0], kept, 'the stroke starts at the kept anchor')
  assert.deepEqual(drawn.stroke, rope.nodes.map(n => [n.x, n.y]), 'the stroke follows the live rope')
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

for (const anchor of ['start', 'end']) test(`a breakaway ${anchor === 'start' ? 'first' : 'second'} anchor strains under a rider's weight, then lets go and the rider keeps hold`, () => {
  const level = course(tied({ release: { id: 'snap', anchor, weight: true } }))
  assert.deepEqual(levelProblems(level), [])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))).climbables.ropes[0].release, { id: 'snap', anchor, weight: true }, 'round trips')
  const run = createRun(level), p = run.player, rope = p.ropes[0]; run.started = true
  const step = (input = {}) => stepRun(run, { ...NEUTRAL_INPUT, ...input })
  // Unloaded, it holds indefinitely.
  for (let i = 0; i < 240; i++) step()
  assert.ok(rope.definition.end, 'still tied with nobody on it')
  assert.equal(rope.strain ?? 0, 0)
  const unloaded = drawnRope(p, level), breaking = anchor === 'start' ? 0 : 1
  assert.equal(unloaded.colors[breaking], unloaded.colors[1 - breaking], 'at rest the breakaway anchor looks like the other')
  // Catch the rope's middle.
  const low = lowest(level.climbables.ropes[0].rest.points)
  Object.assign(p, { x: low[0] - 10, y: low[1] + 60, grounded: false, facing: 1, vx: 0, vy: 0 })
  let frames = 0
  while (!p.climbing && frames < 30) { step({ climb: true }); frames++ }
  assert.ok(p.climbing?.rope, 'caught the rope')
  // It holds for a visible moment, shaking as it strains.
  const holding = Math.floor((ROPE_BREAK_SECONDS - (rope.strain ?? 0)) / STEP) - 1
  for (let i = 0; i < holding; i++) step()
  assert.ok(rope.definition.end, `held ${((rope.strain ?? 0)).toFixed(2)} s of weight`)
  assert.ok(rope.strain > ROPE_BREAK_SECONDS * .8)
  const strained = drawnRope(p, level), bolt = level.climbables.ropes[0][anchor === 'start' ? 'x' : 'end'], at = anchor === 'start' ? [level.climbables.ropes[0].x, level.climbables.ropes[0].y] : [bolt.x, bolt.y]
  assert.ok(Math.hypot(strained.anchors[breaking][0] - at[0], strained.anchors[breaking][1] - at[1]) > .1, 'the straining anchor shakes')
  assert.deepEqual(strained.anchors[1 - breaking], unloaded.anchors[1 - breaking], 'the sound anchor does not')
  const grip = p.climbing.distance
  for (let i = 0; i < 3; i++) step()
  const kept = anchor === 'start' ? [1100, 500] : [500, 500]
  assert.equal(rope.definition.end, undefined, 'the anchor let go')
  assert.deepEqual([rope.definition.x, rope.definition.y], kept, 'the rope hangs from the other anchor')
  assert.ok(p.climbing, 'the rider holds on')
  assert.ok(Math.abs(p.climbing.distance - (anchor === 'start' ? rope.definition.length - grip : grip)) < 6, 'at the same point on the rope')
  for (let i = 0; i < 240; i++) step()
  assert.ok(Math.hypot(rope.nodes.at(-1).x - kept[0], rope.nodes.at(-1).y - kept[1]) > 300, 'the released end has fallen away')
  assert.deepEqual(drawnRope(p, level).anchors, [kept], 'one anchor is drawn')
})

test('the strain on a breakaway anchor lasts after a rider lets go, and a switch can still release it', () => {
  const level = course(tied({ release: { id: 'snap', anchor: 'end', weight: true } }), {
    triggers: [{ x: 1500, y: 920, w: 80, mode: 'weight', behavior: 'toggle', targets: ['snap'] }] })
  const run = createRun(level), p = run.player, rope = p.ropes[0]; run.started = true
  const step = (input = {}) => stepRun(run, { ...NEUTRAL_INPUT, ...input })
  const low = lowest(level.climbables.ropes[0].rest.points)
  Object.assign(p, { x: low[0] - 10, y: low[1] + 60, grounded: false, facing: 1, vx: 0, vy: 0 })
  while (!p.climbing) step({ climb: true })
  for (let i = 0; i < 6; i++) step()
  // Drop off before it gives way; the strain stays.
  step({ detach: true })
  for (let i = 0; i < 120 && p.climbing; i++) step({ detach: true })
  assert.equal(p.climbing, null, 'let go')
  const strain = rope.strain
  assert.ok(strain > 0 && strain < ROPE_BREAK_SECONDS)
  for (let i = 0; i < 120; i++) step({ detach: true })
  assert.equal(rope.strain, strain, 'no strain while unloaded, and none recovered')
  assert.ok(rope.definition.end)
  // Its switch can still let it go.
  run.triggers[0].active = true
  step()
  assert.equal(rope.definition.end, undefined)
})

test('the studio lets a released anchor break under weight', () => {
  const level = course()
  assert.equal(setRopeBreakaway(level, 0, true), level, 'needs a release first')
  const released = setRopeRelease(level, 0, 'end'), breakaway = setRopeBreakaway(released, 0, true)
  assert.equal(breakaway.climbables.ropes[0].release.weight, true)
  assert.equal(released.climbables.ropes[0].release.weight, undefined, 'without changing the original')
  assert.equal(setRopeBreakaway(breakaway, 0, true), breakaway)
  assert.equal(setRopeBreakaway(breakaway, 0, false).climbables.ropes[0].release.weight, undefined)
  // Choosing the other anchor keeps it breakaway; removing the release removes it.
  assert.deepEqual(setRopeRelease(breakaway, 0, 'start').climbables.ropes[0].release.weight, true)
  assert.equal(setRopeRelease(breakaway, 0, null).climbables.ropes[0].release, undefined)
  assert.deepEqual(levelProblems(parseLevel(breakaway)), [])
})
