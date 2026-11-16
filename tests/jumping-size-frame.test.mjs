import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { staticContactWorld, playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { presentedAthletePose } from '../src/games/jumping/athletePose.ts'
import { createRope } from '../src/games/jumping/climbables.ts'
import { enterSizeFrame, inSizeFrame, leaveSizeFrame } from '../src/games/jumping/sizeFrame.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'

// A body of size s in a world is the player in that world shrunk by s (src/games/jumping/sizeFrame.ts): stepped
// side by side with the same input, the large body stays exactly s times the small one, and poses alike.
const SIZE = 1.35

/** One world written in the player's units, and the same world enlarged by SIZE, with a body in each. */
function pair({ terrain, ladders = [], ropes = [], spawn }) {
  const grow = n => n * SIZE
  // The rope keeps its segments when enlarged: the small one is the large one's frame copy.
  const big = { terrain: terrain.map(b => ({ ...b, x: grow(b.x), y: grow(b.y), w: grow(b.w), h: grow(b.h) })),
    ladders: ladders.map(l => ({ ...l, x: grow(l.x), top: grow(l.top), bottom: grow(l.bottom) })),
    ropes: ropes.map(r => ({ ...r, x: grow(r.x), y: grow(r.y), length: grow(r.length) })) }
  const small = { terrain: big.terrain.map(b => ({ ...b, x: b.x / SIZE, y: b.y / SIZE, w: b.w / SIZE, h: b.h / SIZE })),
    ladders: big.ladders.map(l => ({ ...l, x: l.x / SIZE, top: l.top / SIZE, bottom: l.bottom / SIZE })),
    ropes: big.ropes.map(r => ({ ...r, x: r.x / SIZE, y: r.y / SIZE, length: r.length / SIZE, frame: SIZE })) }
  const bodies = [[big, createPlayer({ x: grow(spawn.x), y: grow(spawn.y) })], [small, createPlayer({ x: grow(spawn.x) / SIZE, y: grow(spawn.y) / SIZE })]]
  bodies[0][1].size = SIZE
  for (const [world, p] of bodies) { world.contact = staticContactWorld(world.terrain); p.ropes = world.ropes.map(createRope) }
  return bodies
}

function compare(script, scene, check = () => {}) {
  const bodies = pair(scene), [[, big], [, small]] = bodies
  let tick = 0, worst = 0, poseWorst = 0
  const states = new Set()
  for (const [frames, input] of script) for (let i = 0; i < frames; i++, tick++) {
    for (const [world, p] of bodies) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, world.contact.platforms,
      { ladders: world.ladders, ropes: world.ropes }, { checkpoints: [], fallY: Infinity }, world.contact)
    const where = `tick ${tick}`
    for (const key of ['x', 'y', 'vx', 'vy']) worst = Math.max(worst, Math.abs(big[key] - small[key] * SIZE) / SIZE)
    for (const key of ['grounded', 'facing', 'crouching']) assert.equal(big[key], small[key], `${key} at ${where}`)
    for (const key of ['climbing', 'hang', 'mantle']) assert.equal(!!big[key], !!small[key], `${key} at ${where}`)
    if (big.hang) assert.ok(Math.abs(big.hang.edgeX - small.hang.edgeX * SIZE) < 1e-6, `hang edge at ${where}`)
    if (big.climbing?.ladder) assert.equal(big.climbing.ladder, bodies[0][0].ladders[big.climbing.index], 'the climb keeps the world ladder')
    // Poses are in body units: the large body's matches the small one's.
    const a = presentedAthletePose(big), b = presentedAthletePose(small)
    for (const joint of ['hip', 'shoulder', 'head']) poseWorst = Math.max(poseWorst, Math.hypot(a[joint][0] - b[joint][0], a[joint][1] - b[joint][1]))
    for (const limb of ['frontArm', 'backArm', 'frontLeg', 'backLeg']) poseWorst = Math.max(poseWorst, Math.hypot(a[limb].end[0] - b[limb].end[0], a[limb].end[1] - b[limb].end[1]))
    states.add([big.grounded && 'grounded', big.climbing?.kind, big.hang && 'hang', big.mantle && 'mantle'].filter(Boolean).join('+') || 'airborne')
    check(big, small, where)
  }
  assert.ok(worst < 1e-6, `positions and velocities stay in proportion, worst ${worst}`)
  assert.ok(poseWorst < 1e-6, `poses stay alike, worst ${poseWorst}`)
  return { big, small, states }
}

test('a large body runs, jumps, catches a ledge and climbs on exactly as the player does in a smaller world', () => {
  const scene = { terrain: [{ x: 0, y: 1000, w: 1400, h: 100 }, { x: 700, y: 870, w: 500, h: 130 }], spawn: { x: 300, y: 1000 } }
  const { states } = compare([[30, {}], [50, { move: 1 }], [1, { move: 1, jump: true, jumpStrength: 1 }], [60, { move: 1, jump: true }], [120, { move: 1, climb: true }], [60, {}]], scene)
  assert.ok(states.has('airborne') && states.has('grounded'), [...states].join(', '))
})

test('a large body catches a high lip by its hands, hangs, and pulls up', () => {
  const scene = { terrain: [{ x: 0, y: 1000, w: 1400, h: 100 }, { x: 640, y: 780, w: 600, h: 220 }], spawn: { x: 480, y: 1000 } }
  const { states } = compare([[20, {}], [25, { move: 1 }], [1, { move: 1, jump: true, jumpStrength: 1 }], [40, { move: 1, jump: true }], [40, { move: 1 }], [160, { move: 1, climb: true }]], scene)
  assert.ok(states.has('hang') || states.has('mantle'), `it caught the lip: ${[...states].join(', ')}`)
})

test('a large body climbs a ladder to the top and steps off', () => {
  const scene = { terrain: [{ x: 0, y: 1000, w: 1400, h: 100 }, { x: 300, y: 640, w: 600, h: 25 }],
    ladders: [{ x: 500, top: 640, bottom: 1000, platform: -1, side: 1 }], spawn: { x: 500, y: 1000 } }
  const { states, big } = compare([[10, {}], [720, { climb: true }]], scene)
  assert.ok(states.has('ladder'), [...states].join(', '))
  assert.ok(big.grounded && big.y < 650 * SIZE, `it climbed out onto the deck, at ${big.y}`)
})

test('a large body leaps onto a hanging rope, swings and lets go, with the rope in proportion', () => {
  const scene = { terrain: [{ x: 0, y: 1000, w: 500, h: 100 }, { x: 1100, y: 1000, w: 500, h: 100 }],
    ropes: [{ x: 800, y: 600, length: 300, segments: 12 }], spawn: { x: 380, y: 1000 } }
  compare([[10, {}], [40, { move: 1 }], [1, { move: 1, jump: true, jumpStrength: 1 }], [80, { move: 1, jump: true }], [120, { move: 1 }], [1, { move: 1, jump: true }], [100, { move: 1 }]], scene,
    (big, small, where) => {
      const [a, b] = [big.ropes[0].nodes.at(-1), small.ropes[0].nodes.at(-1)]
      assert.ok(Math.abs(a.x - b.x * SIZE) < 1e-6 * SIZE && Math.abs(a.y - b.y * SIZE) < 1e-6 * SIZE, `the rope stays in proportion at ${where}`)
    })
})

test('a large body\'s contact envelope is the player\'s, at its size', () => {
  const [[, big], [, small]] = pair({ terrain: [{ x: 0, y: 1000, w: 1400, h: 100 }], spawn: { x: 300, y: 1000 } })
  const a = playerContactBody(big), b = playerContactBody(small)
  assert.ok(Math.abs(a.height - b.height * SIZE) < 1e-9 && Math.abs(a.x - b.x * SIZE) < 1e-9 && Math.abs(a.y - b.y * SIZE) < 1e-9, JSON.stringify([a, b]))
})

test('a hard landing\'s recoil and a query leave a large body\'s state exactly as it was', () => {
  const scene = { terrain: [{ x: 0, y: 1000, w: 1400, h: 100 }, { x: 0, y: 600, w: 400, h: 40 }], spawn: { x: 300, y: 600 } }
  const { big } = compare([[10, {}], [30, { move: 1 }], [80, {}]], scene)
  const before = JSON.stringify(big, (key, value) => key === 'terrain' || key === 'ropes' || key === 'contacts' ? undefined : value)
  presentedAthletePose(big); playerContactBody(big)
  assert.equal(JSON.stringify(big, (key, value) => key === 'terrain' || key === 'ropes' || key === 'contacts' ? undefined : value), before)
})

test('a large body climbs a rope hanging from a deck lip and pulls up onto the deck', () => {
  // A rope tied at the lip of a deck: climbing toward the deck hands over to the lip and mantles.
  const scene = { terrain: [{ x: 0, y: 1300, w: 1600, h: 100 }, { x: 700, y: 800, w: 600, h: 60 }],
    ropes: [{ x: 700, y: 800, length: 380, segments: 12 }], spawn: { x: 560, y: 1300 } }
  const { states, big } = compare([[10, {}], [30, { move: 1 }], [1, { move: 1, jump: true, jumpStrength: 1 }], [70, { move: 1, jump: true }], [900, { move: .5, climb: true }]], scene)
  assert.ok(states.has('rope'), [...states].join(', '))
  assert.ok(big.grounded && big.y <= 800 * SIZE + 1, `it pulled up onto the deck, at ${big.x}, ${big.y}: ${[...states].join(', ')}`)
})

test('a value two parts of a sized body share is scaled into its frame once, and back once', () => {
  // A rope grip braced on a wall keeps one object as both its wall and its wall pose (model.ts).
  const rope = createRope({ x: 500, y: 300, length: 400, segments: 50 })
  const p = createPlayer({ x: 500, y: 700 }); p.size = SIZE; p.ropes = [rope]
  const wall = { x: 520, side: 1 }
  p.climbing = { kind: 'rope', index: 0, rope, distance: 200, time: 1, wall, wallPose: wall,
    caught: { x: 500, y: 700, vx: 0, vy: 0, anim: {} } }
  const frame = enterSizeFrame(p, SIZE, true)
  assert.ok(Math.abs(wall.x - 520 / SIZE) < 1e-9, `in the frame the wall is at ${wall.x}`)
  leaveSizeFrame(p, frame, true)
  assert.equal(wall.x, 520, 'left alone, it returns exactly')
  // A step that braces anew gives both the same fresh wall, in the frame's units.
  const again = enterSizeFrame(p, SIZE, true), fresh = { x: wall.x, side: 1 }
  p.climbing.wall = fresh; p.climbing.wallPose = fresh
  leaveSizeFrame(p, again, true)
  assert.ok(Math.abs(fresh.x - 520) < 1e-9, `a new shared wall returns to ${fresh.x}`)
  // And one the step drops, while the pose keeps it, returns too.
  const third = enterSizeFrame(p, SIZE, true)
  p.climbing.wall = undefined
  leaveSizeFrame(p, third, true)
  assert.ok(Math.abs(p.climbing.wallPose.x - 520) < 1e-9, `the pose's wall returns to ${p.climbing.wallPose.x}`)
})

test('rope particles enter a sized body\'s frame and leave it exactly, or with what the step made of them', () => {
  const held = createRope({ x: 500, y: 300, length: 400, segments: 50 }), other = createRope({ x: 900, y: 300, length: 400, segments: 50 })
  const p = createPlayer({ x: 500, y: 700 }); p.size = SIZE; p.ropes = [held, other]
  p.climbing = { kind: 'rope', index: 0, rope: held, distance: 200, time: 1, caught: { x: 500, y: 700, vx: 0, vy: 0, anim: {} } }
  const snapshot = rope => rope.nodes.map(n => [n.x, n.y, n.oldX, n.oldY])
  const heldBefore = snapshot(held), otherBefore = snapshot(other)
  // Left alone, every particle returns bit for bit, with or without the other ropes in the frame.
  for (const allRopes of [false, true]) {
    const frame = enterSizeFrame(p, SIZE, allRopes)
    assert.ok(Math.abs(held.nodes[10].y - heldBefore[10][1] / SIZE) < 1e-9, 'the held rope is in the frame')
    assert.equal(other.nodes[10].y === otherBefore[10][1] / SIZE, allRopes, 'the others only when asked')
    leaveSizeFrame(p, frame, allRopes)
    assert.deepEqual(snapshot(held), heldBefore); assert.deepEqual(snapshot(other), otherBefore)
  }
  // What the step moves comes back in world units, matched to its particle even if the list was rearranged.
  const frame = enterSizeFrame(p, SIZE)
  held.nodes[20].x += 2; held.nodes.reverse()
  leaveSizeFrame(p, frame)
  held.nodes.reverse()
  assert.ok(Math.abs(held.nodes[20].x - (heldBefore[20][0] + 2 * SIZE)) < 1e-9, `a moved particle returns at ${held.nodes[20].x}`)
  assert.deepEqual(snapshot(held).filter((_, i) => i !== 20), heldBefore.filter((_, i) => i !== 20), 'the rest return exactly')
  // A query leaves every particle as it found it, whatever it did to them.
  inSizeFrame(p, () => { held.nodes[5].y = 0 }, true)
  assert.equal(held.nodes[5].y, heldBefore[5][1])
})

test('Rbot holding one rope leaves a level\'s other ropes out of the rope solver\'s passes', () => {
  // The rope solver runs at least 32 passes a step. Each pass once carried every rope in the level into the
  // held rope's frame and back, about 13 ms a step on Scaffold I's eight ropes (docs/jumping-performance.md).
  // The ropes reach near the floor: the solver only constrains the body against terrain near the rope.
  const ropes = Array.from({ length: 6 }, (_, i) => ({ x: 300 + i * 200, y: 200, length: 640, segments: 80 }))
  const level = { ...blankTrial(), width: 1600, height: 900, floor: 900, entrance: { x: 120, y: 900 }, goal: { x: 1500, y: 900 },
    climbables: { ladders: [], ropes }, robots: [{ x: 700, y: 900, left: 650, right: 750, kind: 'repulsor' }] }
  const run = createRun(level), robot = run.robots[0]
  for (let i = 0; i < 4; i++) stepRun(run, NEUTRAL_INPUT)
  const actor = robot.actor, held = run.player.ropes[2]
  // Put Rbot on the third rope, gripped part way down: the rope solver then carries it every step.
  actor.x = held.nodes[30].x; actor.y = held.nodes[30].y + 56 * SIZE; actor.vx = actor.vy = 0; actor.grounded = false
  actor.climbing = { kind: 'rope', index: 2, rope: held, distance: 240, time: 1, direction: 0, swing: 0, lean: 0, hangBlend: 1, swingVelocity: 0,
    ladder: null, caught: { x: actor.x, y: actor.y, vx: 0, vy: 0, anim: {} } }
  // Count every write to another rope's particles over a few steps.
  let writes = 0
  for (const [index, rope] of run.player.ropes.entries()) if (index !== 2) for (const node of rope.nodes) for (const key of ['x', 'y', 'oldX', 'oldY']) {
    let value = node[key]
    Object.defineProperty(node, key, { get: () => value, set: next => { writes++; value = next }, enumerable: true, configurable: true })
  }
  let held_ = 0
  for (let i = 0; i < 6; i++) { stepRun(run, NEUTRAL_INPUT); if (actor.climbing?.rope === held) held_++ }
  assert.ok(held_ >= 4, `Rbot keeps its grip for the measurement (${held_} of 6 steps)`)
  const perValue = writes / (5 * 81 * 4 * 6)
  // Rbot's own step carries every rope into its frame and back once: two writes a value. Never once a pass.
  assert.ok(perValue <= 4, `${perValue.toFixed(1)} writes to each other rope value a step`)
})
