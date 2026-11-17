import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createGravityField, gravityAtPoint, sideGravityAtPoint, updateGravityField } from '../src/games/jumping/gravity.ts'
import { setGravityPlateFacing } from '../src/games/jumping/editor.ts'
import { TUNING } from '../src/games/jumping/movementTuning.ts'

const steps = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }

/** A room with a wall from x 100 to 200 and a field from it to x 900 that pulls toward that wall. */
function room({ gravity = 1, facing = 'right', props = [], extra = {} } = {}) {
  const level = blankTrial()
  level.entrance = { x: 1400, y: 920 }
  level.platforms = [{ x: 100, y: 0, w: 100, h: 920 }]
  level.gravityPlates = [{ id: 'pull', x: 200, y: 0, w: 700, h: 920, gravity, power: 'always', facing }]
  level.props = props
  Object.assign(level, extra)
  return parseLevel(level)
}

test('a wall emitter replaces gravity with a sideways pull toward its wall', () => {
  const field = createGravityField()
  updateGravityField(field, [{ id: 'a', x: 0, y: 0, w: 100, h: 100, gravity: 1, facing: 'right', power: 'always' }], new Map(), true)
  assert.equal(sideGravityAtPoint(field, 50, 50), -TUNING.gravity)
  assert.equal(gravityAtPoint(field, 50, 50), 0)
  assert.equal(sideGravityAtPoint(field, 150, 50), 0)
  assert.equal(gravityAtPoint(field, 150, 50), TUNING.gravity)
  // Each layout gets a fresh field: an unchanged power mask is not recomputed.
  const pushing = createGravityField()
  updateGravityField(pushing, [{ id: 'a', x: 0, y: 0, w: 100, h: 100, gravity: -2, facing: 'left', power: 'always' }], new Map(), true)
  assert.equal(sideGravityAtPoint(pushing, 50, 50), -2 * TUNING.gravity, 'negative gravity pushes away from a right-edge emitter')
  // Overlapping a floor field averages the two pulls.
  const mixed = createGravityField()
  updateGravityField(mixed, [{ id: 'a', x: 0, y: 0, w: 100, h: 100, gravity: 1, facing: 'left', power: 'always' }, { id: 'b', x: 0, y: 0, w: 100, h: 100, gravity: 1, power: 'always' }], new Map(), true)
  assert.deepEqual([sideGravityAtPoint(mixed, 50, 50), gravityAtPoint(mixed, 50, 50)], [TUNING.gravity / 2, TUNING.gravity / 2])
})

test('wall gravity plates parse with a facing, but not with a ceiling or over water', () => {
  assert.equal(room().gravityPlates[0].facing, 'right')
  const ceiling = room(); ceiling.gravityPlates[0].ceiling = true
  assert.throws(() => parseLevel(ceiling))
  const wet = room(); wet.gravityPlates.push({ id: 'pool', x: 300, y: 700, w: 200, h: 220, gravity: -1, effect: 'water' })
  assert.throws(() => parseLevel(wet))
})

for (const kind of ['box', 'ball']) test(`a ${kind} falls sideways onto the field's wall and rests there`, () => {
  const run = createRun(room({ props: [{ kind, x: 600, y: 600, size: 40 }] })); run.started = true
  steps(run, 240)
  const b = run.props[0]
  assert.ok(Math.abs(b.x - 220) < 2, `${kind} came to the wall at ${b.x}`)
  assert.ok(Math.abs(b.y - 600) < 2, `${kind} did not drop: ${b.y}`)
})

test('the studio moves a gravity plate emitter onto a side edge', () => {
  let level = blankTrial()
  level.gravityPlates = [{ id: 'f', x: 200, y: 0, w: 300, h: 600, gravity: 1, power: 'always', ceiling: true }]
  level = setGravityPlateFacing(level, 0, 'left')
  assert.deepEqual([level.gravityPlates[0].facing, level.gravityPlates[0].ceiling], ['left', undefined])
  level = setGravityPlateFacing(level, 0, 'up')
  assert.equal(level.gravityPlates[0].facing, undefined)
})

test('a free rope hangs toward a wall field', () => {
  const run = createRun(room({ extra: { climbables: { ladders: [], ropes: [{ x: 600, y: 100, length: 300, segments: 30 }] } } })); run.started = true
  steps(run, 600)
  const rope = run.player.ropes?.[0] ?? run.ropes?.[0]
  const nodes = rope?.nodes
  assert.ok(nodes, 'the rope is simulated')
  const tip = nodes.at(-1)
  assert.ok(tip.x < 350 && Math.abs(tip.y - 100) < 120, `tip at ${tip.x}, ${tip.y}`)
})

/** A wall at x 1000 and a field beside it from y 100 down, pulling toward it (or the mirror image). */
function wallRoom({ side = 'right', power = 'always', top = 100 } = {}) {
  const level = blankTrial()
  level.entrance = { x: side === 'right' ? 700 : 1400, y: 920 }
  level.platforms = [{ x: 1000, y: 0, w: 100, h: 920 }]
  level.gravityPlates = [{ id: 'g', x: side === 'right' ? 500 : 1100, y: top, w: 500, h: 920 - top, gravity: 1, power, facing: side === 'right' ? 'left' : 'right' }]
  if (power === 'switched') level.triggers = [{ x: 200, y: 920, w: 60, mode: 'touch', behavior: 'switch', startsOn: true, targets: ['g'] }]
  return parseLevel(level)
}
const RIGHT = { ...NEUTRAL_INPUT, move: 1 }, LEFT = { ...NEUTRAL_INPUT, move: -1 }

for (const side of ['right', 'left']) test(`the player turns onto a ${side}-hand wall field's wall, stands, walks along it and leaps off`, () => {
  const run = createRun(wallRoom({ side })); run.started = true
  const p = run.player, face = side === 'right' ? 1000 : 1100
  steps(run, 150)
  assert.equal(p.wall, side)
  assert.equal(p.grounded, true)
  assert.ok(Math.abs(p.x - face) < .5, `feet on the face at ${p.x}`)
  const y = p.y
  // Right walks up a right-hand wall and down a left-hand one, so each side walks up with a different key.
  const up = side === 'right' ? RIGHT : LEFT, down = side === 'right' ? LEFT : RIGHT
  steps(run, 40, up)
  assert.ok(y - p.y > 40, `walked up from ${y} to ${p.y}`)
  steps(run, 20, down); steps(run, 30)
  assert.equal(p.grounded, true, 'still standing on the wall after turning around')
  steps(run, 8, { ...NEUTRAL_INPUT, jump: true })
  assert.equal(p.grounded, false)
  assert.ok(Math.abs(p.x - face) > 20, 'the jump leaves the wall')
  steps(run, 120)
  assert.equal(p.grounded, true, 'the pull brings the body back to the wall')
  assert.equal(p.wall, side)
})

test('walking up out of the field turns the body back toward the floor, keeping its momentum', () => {
  const run = createRun(wallRoom({ top: 600 })); run.started = true
  const p = run.player
  steps(run, 150); assert.equal(p.wall, 'right')
  let left = false
  for (let i = 0; i < 200 && !left; i++) { stepRun(run, RIGHT); left = p.wall === undefined }
  assert.ok(left, 'the turn off the wall completed')
  assert.ok(p.y < 600 && p.vy < -200, `rising above the field at ${p.y}, ${p.vy}`)
})

test('switching the field off drops the body from the wall', () => {
  const run = createRun(wallRoom({ power: 'switched' })); run.started = true
  const p = run.player
  steps(run, 150)
  assert.equal(p.wall, 'right')
  run.triggers[0].active = false
  steps(run, 200)
  assert.equal(p.wall, undefined)
  assert.ok(Math.abs(p.y - 920) < .5, `fell to the floor: ${p.y}`)
})

test('a body on a wall poses, animates by drawn frame, and presses a wall plate underfoot', async () => {
  const { resolveAthletePose } = await import('../src/games/jumping/athletePose.ts')
  const { advanceCharacterAnimation } = await import('../src/games/jumping/characterAnimation.ts')
  const level = wallRoom()
  level.triggers = [{ x: 1000, y: 700, w: 220, facing: 'left', mode: 'touch', targets: ['lamp'] }]
  level.wallLights = [{ id: 'lamp', x: 300, y: 300 }]
  const run = createRun(parseLevel(level)); run.started = true
  run.player.anim.cadence = 'frame'
  for (let i = 0; i < 150; i++) { stepRun(run, NEUTRAL_INPUT); if (i % 2) advanceCharacterAnimation(run.player) }
  assert.equal(run.player.wall, 'right')
  const pose = resolveAthletePose(run.player)
  assert.ok(Number.isFinite(pose.head[0]) && Number.isFinite(pose.head[1]))
  assert.equal(run.triggers[0].active, true, 'standing on the wall plate presses it')
})

test('respawning returns a body on a wall to ordinary footing', async () => {
  const { respawn } = await import('../src/games/jumping/model.ts')
  const run = createRun(wallRoom()); run.started = true
  steps(run, 150); assert.equal(run.player.wall, 'right')
  respawn(run.player)
  assert.equal(run.player.wall, undefined)
})

test('a turn toward a wall unwinds when the field goes off part way, and the body keeps its floor', () => {
  const run = createRun(wallRoom({ power: 'switched' })); run.started = true
  const p = run.player
  for (let i = 0; i < 60 && !(p.releaseTurn && Math.abs(p.releaseTurn.angle) > .3); i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(p.releaseTurn?.toWall === 'right', 'the turn onto the wall is under way')
  run.triggers[0].active = false
  steps(run, 120)
  assert.equal(p.wall, undefined)
  assert.equal(p.releaseTurn, undefined)
  assert.equal(p.grounded, true)
})
