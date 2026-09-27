import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { robotSensesPlayer } from '../src/games/jumping/robotPhysics.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'

function actors() {
  const r = { x: 200, y: 600, angle: 0, facing: 1, phase: 'patrol', time: 0, vx: 0,
    seesPlayer: false, definition: { x: 200, y: 600, left: 100, right: 1100 } }
  return { r, p: createPlayer({ x: 600, y: 600 }) }
}
const blockers = {
  terrain: { x: 380, y: 480, w: 40, h: 120 },
  'thin wall': { x: 400, y: 480, w: .1, h: 120 },
  'sloped terrain': { x: 350, y: 480, w: 100, h: 120, polygon: [[0,120],[100,0],[100,120]] },
  box: boxShape({ x: 400, y: 600, size: 80, angle: 0 }),
  'rotated box': boxShape({ x: 400, y: 580, size: 80, angle: Math.PI / 4 }),
  ball: ballShape({ x: 400, y: 600, size: 80 }),
}
for (const [kind, shape] of Object.entries(blockers)) for (const direction of [-1, 1]) {
  test(`${kind} blocks the bot's sight ${direction < 0 ? 'left' : 'right'}`, () => {
    const { r, p } = actors()
    if (direction < 0) { r.x = 600; r.facing = -1; p.x = 200 }
    assert.equal(robotSensesPlayer(r, p, []), true)
    assert.equal(robotSensesPlayer(r, p, [shape]), false)
  })
}

test('sight follows the actual outline, leaving air above slopes and below platforms visible', () => {
  const { r, p } = actors()
  assert.equal(robotSensesPlayer(r, p, [{ x: 350, y: 400, w: 100, h: 100 }]), true)
  p.y = 420
  assert.equal(robotSensesPlayer(r, p, [{ x: 380, y: 480, w: 100, h: 120, polygon: [[0,120],[100,0],[100,120]] }]), true)
})

test('crouching can conceal the body behind low cover', () => {
  const { r, p } = actors(), cover = [{ x: 470, y: 573, w: 50, h: 27 }]
  assert.equal(robotSensesPlayer(r, p, cover), true)
  p.crouching = true
  assert.equal(robotSensesPlayer(r, p, cover), false)
})

test('range and bounds reject irrelevant geometry before testing polygon edges', () => {
  const { r, p } = actors()
  assert.equal(robotSensesPlayer(r, p, [
    { x: 250, y: 400, w: 50, h: 40, get polygon() { assert.fail('off-line shapes must not read their polygon') } },
    { x: 800, y: 500, w: 50, h: 100, get polygon() { assert.fail('shapes beyond the player must not read their polygon') } },
  ]), true)
  const unreadable = new Proxy([], { get() { assert.fail('out-of-range players must not scan geometry') } })
  for (const [x, y] of [[1050,600], [600,840], [-101,600]]) {
    Object.assign(p, { x, y }); assert.equal(robotSensesPlayer(r, p, unreadable), false)
  }
})

function gateLevel() {
  return { ...blankTrial(), spawn: { x: 800, y: 920 },
    robots: [{ x: 200, y: 920, left: 100, right: 1600 }],
    mechanisms: [{ id: 'cover', kind: 'gate', x: 500, y: 700, w: 40, h: 220, travel: 300 }] }
}
for (const phase of ['chase', 'windup', 'charge']) test(`losing sight during ${phase} immediately returns to ordinary patrol`, () => {
  const run = createRun(gateLevel()), r = run.robots[0]
  run.started = true; Object.assign(r, { phase, time: .2, facing: -1 })
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(r.seesPlayer, false); assert.equal(r.phase, 'patrol')
  assert.equal(r.facing, -1, 'hidden players do not steer patrol direction')
  assert.ok(Math.abs(r.vx + 92) < .001, 'normal patrol speed resumes')
})

test('opening and closing a gate updates perception using its current position', () => {
  const run = createRun(gateLevel()), r = run.robots[0], gate = run.mechanisms[0]
  run.started = true
  assert.equal(r.seesPlayer, false)
  gate.y = 400; stepRun(run, NEUTRAL_INPUT)
  assert.equal(r.seesPlayer, true); assert.equal(r.phase, 'chase'); assert.equal(r.facing, 1)
  gate.y = 700; stepRun(run, NEUTRAL_INPUT)
  assert.equal(r.seesPlayer, false); assert.equal(r.phase, 'patrol')
})

for (const kind of ['box', 'ball']) test(`moving a ${kind} out of the sight line reveals the player`, () => {
  const level = gateLevel(); level.mechanisms = []; level.props = [{ kind, x: 500, y: 920, size: 100 }]
  const run = createRun(level), r = run.robots[0]; run.started = true
  stepRun(run, NEUTRAL_INPUT); assert.equal(r.seesPlayer, false); assert.equal(r.phase, 'patrol')
  run.props[0].x = 1100
  stepRun(run, NEUTRAL_INPUT); assert.equal(r.seesPlayer, true); assert.equal(r.phase, 'chase')
})

test('the initial game and editor preview agree, and wall decorations do not conceal players', () => {
  for (const create of [createRun, createPreviewRun]) {
    const level = gateLevel()
    assert.equal(create(level).robots[0].seesPlayer, false)
    level.mechanisms = []; level.climbables = { ropes: [{ x: 500, y: 600, length: 300, segments: 30 }], ladders: [] }
    level.pickups = [{ kind: 'coin', x: 500, y: 890, size: 40 }]
    level.timers = [{ x: 420, y: 850 }]; level.texts = [{ x: 450, y: 850, w: 200, h: 60, text: 'Cover?' }]
    assert.equal(create(level).robots[0].seesPlayer, true)
  }
})

test('an unobstructed bot still winds up and charges', () => {
  const level = gateLevel(); level.mechanisms = []; level.spawn.x = 310
  const run = createRun(level); run.started = true
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.robots[0].phase, 'windup')
  for (let i = 0; i < Math.ceil(.23 / STEP); i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.robots[0].phase, 'charge'); assert.equal(run.robots[0].seesPlayer, true)
})

test('other bots can conceal the player, but a bot never occludes its own sight', () => {
  const level = gateLevel(); level.mechanisms = []
  assert.equal(createRun(level).robots[0].seesPlayer, true)
  level.robots.push({ x: 500, y: 920, left: 100, right: 1600 })
  const run = createRun(level); run.started = true
  assert.equal(run.robots[0].seesPlayer, false)
  run.robots[1].x = 1100; stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.robots[0].seesPlayer, true)
})
