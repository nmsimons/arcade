import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ambientExposure, angularFalloff, betweenLightAndView, combineExposure, dynamicCasters, exposureAt, groupTerrain, lightContribution, lightReachesView, LightingState, shadowQuad, sourceCovered, staticCasters } from '../src/games/jumping/lightingModel.ts'
import { pointInside, polygonPoints } from '../src/games/jumping/geometry.ts'
import { robotPlatforms } from '../src/games/jumping/robotPhysics.ts'
import { createPreviewRun } from '../src/games/jumping/challenge.ts'
import { levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { athleteCasters } from '../src/games/jumping/athleteShadow.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { gaitPose } from '../src/games/jumping/model.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/lighting-prototype.json', import.meta.url)))
const light = (patch = {}) => ({ id: 'lamp', x: 0, y: 0, intensity: 100, fade: 1, direction: 0, spread: 160, power: 'always', ...patch })
const run = () => createPreviewRun(parseLevel(fixture.level))
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('player casters follow the pose and facing without mutating movement state', () => {
  const p = run().player
  for (const facing of [-1, 1]) for (const crouch of [0, 1]) for (const grounded of [false, true]) for (const stride of [0, 1, 2]) {
    Object.assign(p, { facing, crouch, grounded, stride, vx: 180, vy: -120, gait: gaitPose(180, !grounded) })
    const before = JSON.stringify(p), pose = athletePose(p), shapes = athleteCasters(p)
    assert.equal(JSON.stringify(p), before)
    assert.ok(shapes.length > 20)
    assert.ok(shapes.reduce((sum, shape) => sum + shape.polygon.length, 0) < 500)
    for (const point of [pose.head, pose.hip, pose.frontArm.joint, pose.backArm.joint, pose.frontLeg.joint, pose.backLeg.joint]) {
      assert.ok(shapes.some(shape => pointInside(shape, p.x + point[0] * facing, p.y + point[1])), `missing joint ${point}`)
    }
    assert.ok(!shapes.some(shape => pointInside(shape, p.x + 45, p.y - 30)))
  }
})

test('player shadows fade with the exiting figure and do not add a collider', () => {
  const world = run(), before = JSON.stringify(world.terrain)
  const head = athletePose(world.player).head
  const x = world.player.x + head[0], y = world.player.y + head[1], source = light({ x: x - 100, y })
  for (const [elapsed, expected] of [[0, .35], [.5, .675], [.75, 1]]) {
    world.exit = { elapsed }
    const groups = dynamicCasters(world).filter(group => group.player)
    close(exposureAt(0, [source], groups, x + 30, y), expected)
  }
  assert.equal(JSON.stringify(world.terrain), before)
})

test('prototype fixture uses a valid existing level, without changing the level file contract', () => {
  assert.deepEqual(levelProblems(parseLevel(fixture.level)), [])
  assert.equal(fixture.level.version, 1)
})
test('night ambient stays at the original zero setting for every legacy value', () => {
  close(ambientExposure(0), .35)
  close(ambientExposure(50), .35)
  close(ambientExposure(99), .35)
  close(ambientExposure(100), .35)
  close(ambientExposure(-10), .35)
  close(ambientExposure(150), .35)
  for (let ambient = 0; ambient <= 100; ambient++) {
    const expected = .35
    close(ambientExposure(ambient), expected)
    close(combineExposure(ambient, []), expected)
    close(combineExposure(ambient, [1]), 1)
  }
})
test('lights have no distance attenuation; cone edges stay narrow at any distance', () => {
  const cone = light({ spread: 90 })
  for (const distance of [0, 1, 200, 1200, 20000, 1000000]) {
    assert.equal(angularFalloff(cone, distance, 0), 1)
    close(lightContribution({ ...cone, intensity: 70, fade: .5 }, distance, 0), .5)
  }
  assert.equal(angularFalloff(cone, -.5, 0), 0)
  for (const spread of [20, 90, 160]) for (const side of [-1, 1]) {
    const sample = fraction => {
      const angle = side * spread * Math.PI / 360 * fraction
      const near = angularFalloff({ spread }, .5 * Math.cos(angle), .5 * Math.sin(angle))
      return near
    }
    close(sample(.95), 1)
    close(sample(.975), .5)
    assert.ok(sample(.99) > 0)
    close(sample(1), 0)
    const angle = spread * Math.PI / 360
    for (const distance of [400, 20000, 1000000]) for (const offset of [-1, 0, .5, 1, 2, 3]) {
      const x = distance * Math.cos(angle) + offset * Math.sin(angle)
      const y = side * (distance * Math.sin(angle) - offset * Math.cos(angle))
      const t = Math.max(0, Math.min(1, offset / 2))
      close(angularFalloff({ spread }, x, y), t * t * (3 - 2 * t))
    }
  }
})
test('bot shadows follow rounded chassis art in every pose without altering collision geometry', () => {
  const world = run(); world.props = []; world.mechanisms = []
  for (const angle of [0, -.3, .4]) for (const facing of [-1, 1]) for (const phase of ['patrol', 'windup']) {
    Object.assign(world.robots[0], { angle, facing, phase })
    const before = JSON.stringify(robotPlatforms(world.robots[0]))
    const collision = robotPlatforms(world.robots[0])[0], body = dynamicCasters(world)[0][0]
    const corners = polygonPoints(collision)
    for (const [i, p] of corners.entries()) {
      const toward = corners[(i + 2) % 4], distance = Math.hypot(toward[0] - p[0], toward[1] - p[1])
      const sample = [p[0] + (toward[0] - p[0]) / distance * .5, p[1] + (toward[1] - p[1]) / distance * .5]
      assert.equal(pointInside(collision, ...sample), true)
      assert.equal(pointInside(body, ...sample), false, 'no invisible square corners casting shadows')
    }
    assert.equal(JSON.stringify(robotPlatforms(world.robots[0])), before)
  }
})
test('maximum blending is order independent, duplicate independent and never exceeds original exposure', () => {
  close(combineExposure(20, [.5]), .5 + .5 * ambientExposure(20))
  close(combineExposure(20, [.5, .5, .5]), .5 + .5 * ambientExposure(20))
  close(combineExposure(20, [.8, .5]), combineExposure(20, [.5, .8]))
  close(combineExposure(100, []), .35)
  assert.equal(combineExposure(0, []), .35)
})
test('solid geometry shadows receivers but not its own front; a covered source emits nothing', () => {
  const shapes = [[{ x: 50, y: -50, w: 20, h: 100 }]]
  assert.equal(exposureAt(20, [light()], shapes, 100, 0), ambientExposure(20))
  assert.equal(exposureAt(20, [light()], shapes, 60, 0), 1)
  assert.equal(exposureAt(20, [light({ direction: 90 })], shapes, 0, 100), 1)
  assert.equal(sourceCovered(light({ x: 60 }), shapes), true)
  assert.equal(exposureAt(20, [light({ x: 60 })], shapes, 100, 0), ambientExposure(20))
})
test('concave cavities remain open and touching terrain forms a single receiving surface', () => {
  const arch = { x: 50, y: 0, w: 100, h: 100, polygon: [[0, 0], [100, 0], [100, 100], [80, 100], [80, 20], [20, 20], [20, 100], [0, 100]] }
  const inside = light({ x: 100, y: 70, direction: 90 })
  assert.equal(sourceCovered(inside, [[arch]]), false)
  assert.equal(exposureAt(0, [inside], [[arch]], 100, 140), 1)
  assert.equal(exposureAt(0, [inside], [[arch]], 20, 70), .35)
  const adjacent = [{ x: 50, y: 0, w: 30, h: 100 }, { x: 80, y: 0, w: 30, h: 100 }]
  assert.equal(groupTerrain(adjacent).length, 1)
  assert.equal(exposureAt(0, [light({ y: 50 })], groupTerrain(adjacent), 100, 50), 1)
  assert.equal(groupTerrain([...adjacent, { x: 120, y: 0, w: 30, h: 100 }]).length, 2)
})
test('terrain can shadow itself across air gaps, regardless of how the arch is built', () => {
  const arch = { x: 50, y: 0, w: 100, h: 100, polygon: [[0, 0], [100, 0], [100, 100], [80, 100], [80, 20], [20, 20], [20, 100], [0, 100]] }
  const tiles = [{ x: 50, y: 0, w: 100, h: 20 }, { x: 50, y: 20, w: 20, h: 80 }, { x: 130, y: 20, w: 20, h: 80 }]
  for (const shapes of [[arch], tiles]) {
    const groups = groupTerrain(shapes), source = light({ y: 70 })
    assert.equal(exposureAt(0, [source], groups, 60, 70), 1, 'near leg receives light')
    assert.equal(exposureAt(0, [source], groups, 140, 70), .35, 'far leg is shadowed across the cavity')
    assert.equal(exposureAt(0, [light({ y: 10 })], groups, 140, 10), 1, 'unbroken top face stays lit')
    assert.deepEqual(structuredClone(groups), groups, 'worker preparation retains exposed edges')
  }
})
test('shared partial edges, overlaps and contained tiles do not shade a continuous slab', () => {
  const whole = { x: 50, y: 0, w: 100, h: 100 }
  const layouts = [[whole], [whole, { x: 60, y: 20, w: 20, h: 30 }],
    [{ x: 50, y: 0, w: 40, h: 100 }, { x: 90, y: 0, w: 60, h: 40 }, { x: 90, y: 40, w: 60, h: 60 }],
    [{ x: 50, y: 0, w: 80, h: 100 }, { x: 80, y: 0, w: 70, h: 100 }]]
  for (const shapes of layouts) for (const y of [10, 30, 60, 90]) {
    const groups = groupTerrain(shapes), source = light({ y })
    for (const x of [60, 95, 120, 140]) assert.equal(exposureAt(0, [source], groups, x, y), 1)
    assert.equal(exposureAt(0, [source], groups, 170, y), .35)
  }
})
test('room-boundary connections do not erase a wall shadow from the floor', () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/lighting-gates.json', import.meta.url))))
  const sources = level.lighting.lights.map(source => ({ ...source, fade: 1 })), groups = staticCasters({ level })
  for (const [x, y] of [[1505, 905], [1520, 908], [1540, 912]]) assert.equal(exposureAt(0, sources, groups, x, y), .35)
  assert.equal(exposureAt(0, sources, groups, 1100, 900), 1, 'unobstructed foreground stays lit')
})

test('shadow extrusion covers long edges near the light without a distant light leak', () => {
  const quad = shadowQuad(light(), [1, -1000], [1, 1000], 20000)
  assert.ok(quad[2][0] > 20000 && quad[3][0] > 20000)
  assert.ok(quad.flat().every(Number.isFinite))
})
test('offscreen blockers between a distant lamp and the viewport remain candidates', () => {
  const source = light({ x: 300, y: 100 }), view = { x: 10000, y: 0, w: 1280, h: 720 }
  assert.equal(betweenLightAndView({ x: 6000, y: 60, w: 20, h: 80 }, source, view), true)
  assert.equal(betweenLightAndView({ x: 12000, y: 60, w: 20, h: 80 }, source, view), false)
  assert.equal(exposureAt(20, [source], [[{ x: 6000, y: 60, w: 20, h: 80 }]], 11000, 100), ambientExposure(20))
})
test('every light stops at the level boundary, while ambient remains unchanged', () => {
  const bounds = { width: 12000, height: 640 }
  for (const source of [light(), light({ direction: 90 })]) {
    for (const [x, y] of [[-1, 100], [12000, 100], [100, -1], [100, 640]]) {
      assert.equal(exposureAt(20, [source], [], x, y, bounds), ambientExposure(20))
    }
  }
  assert.equal(exposureAt(20, [light()], [], 11999, 639, bounds), 1)
})
test('EMP fades spotlights on visual time without changing ambient or adding an exit source', () => {
  const world = run(), state = new LightingState(), definition = { ambient: 35, lights: [light()] }
  assert.equal(state.sources(definition, world, 0)[0].fade, 1)
  world.empRemaining = 5; world.goalLit = true
  let sources = state.sources(definition, world, .1)
  close(sources[0].fade, .5); assert.deepEqual(sources.map(source => source.id), ['lamp'])
  assert.equal(state.sources(definition, world, 0)[0].fade, .5, 'paused visual clock does not advance')
  sources = state.sources(definition, world, .1)
  assert.equal(sources[0].fade, 0); assert.equal(sources.length, 1)
  assert.equal(definition.ambient, 35)
  assert.equal(new LightingState().sources(definition, world, 0)[0].fade, 0, 'no bright first frame during EMP')
  world.empRemaining = 0
  close(state.sources(definition, world, .1)[0].fade, .5)
})
test('wall lights ignore legacy mounts and mechanism displacement while switched power respects latched activation', () => {
  const world = run(), state = new LightingState()
  const definition = { ambient: 20, lights: [light({ id: 'gate', mount: 'lift', x: 360, y: 570, power: 'switched' })] }
  world.mechanisms[0].x += 25; world.mechanisms[0].y -= 60
  let source = state.sources(definition, world, 0)[0]
  assert.equal(source.x, 360); assert.equal(source.y, 570); assert.equal(source.fade, 0)
  world.triggers[1].active = true
  source = state.sources(definition, world, .2)[0]; assert.equal(source.fade, 1)
  world.empRemaining = 5
  assert.equal(state.sources(definition, world, .2)[0].fade, 0)
  assert.equal(world.triggers[1].active, true)
  world.empRemaining = 0
  assert.equal(state.sources(definition, world, .2)[0].fade, 1)
})
test('cone culling rejects only views outside the cone and keeps unlimited distant reach', () => {
  const view = { x: 10000, y: 40, w: 1280, h: 720 }
  assert.equal(lightReachesView(light({ x: 300, y: 100, direction: 0 }), view), true)
  assert.equal(lightReachesView(light({ x: 300, y: 100, direction: 180 }), view), false)
  assert.equal(lightReachesView(light({ x: 10500, y: 400, direction: 180 }), view), true)
  for (const direction of [-180, -90, 0, 90, 180]) for (const spread of [20, 70, 160]) {
    const source = light({ x: 400, y: 400, direction, spread })
    for (let x = -1000; x < 1500; x += 200) for (let y = -1000; y < 1500; y += 200) {
      const visible = lightReachesView(source, { x, y, w: 150, h: 150 })
      if (visible) continue
      for (const dx of [0, 75, 150]) for (const dy of [0, 75, 150]) assert.ok(lightContribution(source, x + dx, y + dy) < 1e-10)
    }
  }
})


test('object and player shadows retain contrast at any distance, with only exit opacity changing it', () => {
  const shape = { x: 80, y: -20, w: 40, h: 40 }, source = light()
  for (const distance of [140, 240, 1000, 100000]) {
    close(exposureAt(0, [source], [[shape]], distance, 0), .35)
    close(exposureAt(0, [source], [Object.assign([shape], { opacity: .5 })], distance, 0), .675)
  }
  close(exposureAt(0, [source], [[shape]], 160, 80), 1)
  const world = run(), player = dynamicCasters(world).filter(group => group.player)
  const head = athletePose(world.player).head
  const x = world.player.x + head[0], y = world.player.y + head[1]
  const side = light({ x: x - 100, y })
  for (const distance of [30, 300, 10000]) close(exposureAt(0, [side], player, x + distance, y), .35)
})
