import assert from 'node:assert/strict'
import test from 'node:test'
import { updateBulletsAndPlayerRockCollisions } from '../src/games/hardVacuum/bullets.ts'
import { updateBaseDefenseAndProcessing } from '../src/games/hardVacuum/baseDefense.ts'
import { repelBlueBody } from '../src/games/hardVacuum/expeditionPhysics.ts'
import { bankAtCheckpoint, crashExpedition, freshExpedition, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { creditAsteroidDestruction } from '../src/games/hardVacuum/oreCredits.ts'

const body = extra => ({ kind: 'blue', pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: 20, ...extra })
const ref = current => ({ current })
const delta = (ax, ay, bx, by) => ({ dx: bx - ax, dy: by - ay })
const unexpectedDamage = () => assert.fail('Blue objects must not be mined, split, or destroyed')
const map = { boundary: [{ x: -500, y: -500 }, { x: 3500, y: -500 }, { x: 3500, y: 3500 }, { x: -500, y: 3500 }], obstacles: [] }
const bulletArgs = rock => ({
  dt: 0, w: 1000, h: 1000, cavernMap: map,
  bulletsRef: ref([]), rocksRef: ref([rock]), harpoonRef: ref({ state: 'idle' }),
  shipRef: ref({ pos: { x: -100, y: 0 }, vel: { x: 0, y: 0 }, radius: 15, angle: 0 }),
  toroidalDelta: delta, buildRopeBetween: unexpectedDamage, onAsteroidDestroyed: unexpectedDamage,
  waveCreditsRef: ref(0), sounds: { explosion: unexpectedDamage },
  createRock: unexpectedDamage, createDebris: unexpectedDamage,
  levelRef: ref(1), blueRocksSpawnedThisLevelRef: ref(0), blueRockQuotaRef: ref(0),
  CREDITS_SHOOTING_ROCK_DIVISOR: 100, SMALLEST_ROCK_RADIUS: 20,
  HARPOON_VISUAL_SLACK: 1.18, BLUE_ROCK_SPAWN_CHANCE_BASE: 0,
  BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL: 0, BLUE_ROCK_SPAWN_CHANCE_MAX: 0, RED_ROCK_SPAWN_CHANCE: 0,
})
const baseArgs = rock => ({
  dt: 0, w: 1000, h: 1000, baseX: 0, baseY: 0, MINING_BASE_RADIUS: 118,
  miningBaseAngleRef: ref(0), miningGunCooldownsRef: ref([0, 0, 0]),
  baseShotsRef: ref([]), rocksRef: ref([rock]), wrapX: x => x, wrapY: y => y,
  toroidalDelta: delta, expedition: freshExpedition(), waveCreditsRef: ref(0), createDebris: unexpectedDamage,
})

test('repeated projectile hits repel both mined blue rocks and mission cells without damage or credits', () => {
  for (const sourceId of [undefined, 'foundry', 'heart']) {
    const rock = body({ sourceId }), args = bulletArgs(rock)
    for (let hit = 0; hit < 30; hit++) {
      args.bulletsRef.current.push({ pos: { x: -10, y: 0 }, vel: { x: 600, y: 0 }, life: 100 })
      const before = rock.vel.x
      updateBulletsAndPlayerRockCollisions(args)
      assert.ok(rock.vel.x > before)
      assert.equal(args.bulletsRef.current.length, 0)
      assert.deepEqual(args.rocksRef.current, [rock]); assert.equal(rock.radius, 20)
      assert.equal(args.waveCreditsRef.current, 0)
    }
  }
})

test('connected blue cells absorb weapon hits without being moved or destroyed', () => {
  const rock = body({ sourceId: 'foundry', socketId: 'foundry' })
  const before = structuredClone(rock), args = bulletArgs(rock)
  args.bulletsRef.current.push({ pos: { x: -10, y: 0 }, vel: { x: 600, y: 0 }, life: 100 })
  updateBulletsAndPlayerRockCollisions(args)
  assert.equal(repelBlueBody(rock, { x: 1, y: 0 }, 320), true)
  assert.deepEqual(rock, before); assert.deepEqual(args.rocksRef.current, [rock])
  assert.equal(args.bulletsRef.current.length, 0)
})

test('base guns never target or process power cells; intercepted rounds only repel loose ones', () => {
  for (const extra of [{ sourceId: 'foundry' }, { sourceId: 'heart', socketId: 'heart' }]) {
    const rock = body(extra), args = baseArgs(rock)
    args.dt = 2
    for (let tick = 0; tick < 6; tick++) updateBaseDefenseAndProcessing(args)
    assert.equal(args.baseShotsRef.current.length, 0)
    args.dt = 0
    args.baseShotsRef.current.push({ pos: { x: -10, y: 0 }, vel: { x: 520, y: 0 }, life: 0.9 })
    updateBaseDefenseAndProcessing(args)
    assert.equal(args.baseShotsRef.current.length, 0)
    assert.deepEqual(args.rocksRef.current, [rock]); assert.equal(args.waveCreditsRef.current, 0)
    assert.equal(args.expedition.banked, 0)
    assert.equal(rock.vel.x > 0, !rock.socketId)
  }
})

test('base guns target blue asteroids and bank their full processing bonus exactly once', () => {
  const rock = body({ pos: { x: 10, y: 0 } }), args = baseArgs(rock)
  args.createDebris = () => {}
  args.dt = 1 / 60
  for (let frame = 0; frame < 150; frame++) updateBaseDefenseAndProcessing(args)
  assert.equal(args.rocksRef.current.length, 0)
  assert.equal(args.expedition.banked, 1000)
  assert.equal(args.expedition.credits, 0)
  assert.equal(args.waveCreditsRef.current, 1000)
})

test('player projectile destruction awards field credits once per asteroid', () => {
  const rock = body({ kind: 'normal' }), args = bulletArgs(rock), state = freshExpedition()
  args.sounds = { explosion() {} }; args.createDebris = () => {}
  args.onAsteroidDestroyed = asteroid => creditAsteroidDestruction(state, asteroid)
  args.bulletsRef.current = Array.from({ length: 3 }, () => ({ pos: { ...rock.pos }, vel: { x: 0, y: 0 }, life: 100 }))
  updateBulletsAndPlayerRockCollisions(args)
  assert.equal(args.rocksRef.current.length, 0)
  assert.equal(state.credits, 10); assert.equal(state.banked, 0)
  updateBulletsAndPlayerRockCollisions(args)
  assert.equal(state.credits, 10)
})

test('base processing banks ore immediately, preserves carried credits, and cannot pay twice', () => {
  const rock = body({ kind: 'normal' }), args = baseArgs(rock)
  args.expedition.banked = 60; args.expedition.credits = 37
  args.createDebris = () => {}
  args.baseShotsRef.current.push({ pos: { x: -10, y: 0 }, vel: { x: 520, y: 0 }, life: 0.9 })
  updateBaseDefenseAndProcessing(args)
  assert.equal(args.rocksRef.current.length, 0)
  assert.equal(args.expedition.banked, 160); assert.equal(args.expedition.credits, 37)
  updateBaseDefenseAndProcessing(args)
  assert.equal(args.expedition.banked, 160)
  const saved = parseExpedition(JSON.stringify(args.expedition))
  assert.equal(saved.banked, 160)
  assert.equal(crashExpedition(saved), 37); assert.equal(saved.banked, 160)
  assert.equal(bankAtCheckpoint(args.expedition, 'haven'), 37)
  assert.equal(args.expedition.banked, 197, 'docking only deposits the remaining carried credits')
})
