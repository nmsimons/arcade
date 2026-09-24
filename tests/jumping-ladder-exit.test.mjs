import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

const rules = { checkpoints: [], fallY: Infinity }
function setup(side, gap = 20, thickness = 400) {
  const wall = { x: side === 1 ? 400 : 0, y: 200, w: 400, h: thickness }
  const terrain = [wall, { x: -200, y: 600, w: 1200, h: 100 }]
  // The builder places independent ladders with no platform link, even on the left-facing cliff.
  const ladder = { x: 400 - side * gap, top: 200, bottom: 600, platform: -1, side: 1 }
  const world = { ladders: [ladder], ropes: [] }, p = createPlayer()
  Object.assign(p, { x: ladder.x, y: 600, spawnX: ladder.x, spawnY: 600, facing: side })
  return { p, terrain, world }
}
function advance(scene, seconds, input, observe = () => {}) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    stepPlayer(scene.p, { ...NEUTRAL_INPUT, ...input }, STEP, scene.terrain, scene.world, rules)
    observe(scene.p)
  }
}
const landmarks = p => {
  const pose = athletePose(p)
  return [pose.head, pose.shoulder, pose.waist, pose.hip,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(l => [l.root, l.joint, l.end])]
    .map(a => [p.x + a[0] * p.facing, p.y + a[1]])
}

test('grid-snapped free ladders climb onto either cliff and descend again with continuous poses', () => {
  for (const side of [-1, 1]) for (const gap of [16, 20, 24]) for (const thickness of [18, 400]) {
    const scene = setup(side, gap, thickness), { p, world, terrain } = scene
    const original = structuredClone(world), states = new Set()
    let previous, maxStep = 0
    const observe = p => {
      states.add(p.climbing ? 'ladder' : p.mantle ? 'mantle' : p.hang ? 'hang' : 'ground')
      if (!p.mantle) assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)), 'the body stays outside terrain')
      const points = landmarks(p)
      if (previous && p.y < 350) points.forEach((a, i) => { maxStep = Math.max(maxStep, Math.hypot(a[0] - previous[i][0], a[1] - previous[i][1])) })
      if (p.hang?.caught.climbing || p.climbing?.caught.hang) {
        const pose = athletePose(p)
        for (const [limb, upper, lower] of [[pose.frontArm, 10, 9], [pose.backArm, 10, 9], [pose.frontLeg, 15, 14.5], [pose.backLeg, 15, 14.5]]) {
          assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - upper) < 1e-6)
          assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - lower) < 1e-6)
        }
      }
      previous = points
    }
    advance(scene, 5.2, { climb: true }, observe)
    assert.equal(p.climbing, null, `free ladder must exit on side ${side}, gap ${gap}`)
    assert.equal(p.mantle, null); assert.equal(p.hang, null)
    assert.equal(p.grounded, true); assert.equal(p.x, 400 + side * 20); assert.equal(p.y, 200)
    assert.ok(states.has('ladder') && states.has('hang') && states.has('mantle'))
    advance(scene, 5, { descend: true }, observe)
    assert.equal(p.y, 600); assert.equal(p.grounded, true); assert.equal(p.climbing, null)
    assert.ok(maxStep < 7, `limbs should move continuously through transfers, largest step ${maxStep}`)
    assert.deepEqual(world, original, 'terrain discovery must not alter the authored ladder')
  }
})

test('a free ladder holds at the top when no reachable, clear ledge exists', () => {
  for (const side of [-1, 1]) for (const obstruction of ['distant', 'ceiling', 'missing', 'misaligned']) {
    const scene = setup(side, obstruction === 'distant' ? 80 : 20)
    if (obstruction === 'ceiling') scene.terrain.push({ x: 370, y: 110, w: 60, h: 40 })
    if (obstruction === 'missing') scene.terrain.shift()
    if (obstruction === 'misaligned') scene.terrain[0].y = 240
    advance(scene, 6, { climb: true }, p => {
      assert.ok(!scene.terrain.some(b => bodyIntersects(p.x, p.y, b)), 'a blocked exit cannot clip into terrain')
      assert.equal(p.hang, null); assert.equal(p.mantle, null)
    })
    assert.equal(scene.p.climbing?.kind, 'ladder', obstruction)
    assert.equal(scene.p.climbing.distance, 18)
    const y = scene.p.y
    advance(scene, .5, { descend: true })
    assert.ok(scene.p.y > y + 25, 'holding at the top must allow climbing back down')
  }
})
