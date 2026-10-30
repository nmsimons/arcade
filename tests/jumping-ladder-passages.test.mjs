import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { staticContactWorld } from '../src/games/jumping/playerContacts.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { climbFrame, LEDGE_CLIMB_TIME } from '../src/games/jumping/ledge.ts'
import { rightArmSupporting } from '../src/games/jumping/armSupport.ts'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createRepulsorActor } from '../src/games/jumping/repulsorBot.ts'
import { botMovement, botCanReach } from '../src/games/jumping/botNavigation.ts'

function scene(thickness = 80) {
  const terrain = [{ x: 0, y: 800, w: 1000, h: 100 },
    { x: 100, y: 500, w: 800, h: thickness }, { x: 100, y: 200, w: 800, h: 100 }]
  const ladder = { x: 400, top: 200, bottom: 800, platform: -1, side: 1 }
  return { p: createPlayer({ x: 400, y: 800 }), terrain, ladders: { ladders: [ladder], ropes: [] }, world: staticContactWorld(terrain) }
}
function tick(s, input = {}) {
  stepPlayer(s.p, { ...NEUTRAL_INPUT, ...input }, STEP, s.world.platforms, s.ladders,
    { checkpoints: [], fallY: Infinity }, s.world)
}
function advance(s, seconds, input = {}, observe = () => {}) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) { tick(s, input); observe(s.p) }
}

test('a sideways ladder step can become a jump when direction leads Jump briefly', () => {
  for (const direction of [-1, 1]) for (const delay of [1, 6, 10]) {
    const s = scene()
    advance(s, .8, { climb: true }); advance(s, .2)
    assert.equal(s.p.climbing?.kind, 'ladder')
    const y = s.p.y
    advance(s, delay * STEP, { move: direction })
    assert.equal(s.p.climbing, null); assert.equal(s.p.grounded, false)
    tick(s, { move: direction, jump: true })
    assert.ok(s.p.vy < -350, `direction ${direction}, ${delay} frames before Jump launches upward`)
    assert.ok(s.p.vx * direction > 250, 'the jump pushes away from the ladder')
    advance(s, .12, { move: direction, jump: true })
    assert.ok(s.p.y < y - 35)
    assert.ok(!s.world.platforms.some(b => bodyIntersects(s.p.x, s.p.y, b)))
  }
})

test('ladder departure grace expires, excludes Drop, and requires a fresh Jump press', () => {
  for (const departure of ['expired', 'drop', 'held']) {
    const s = scene()
    if (departure === 'held') {
      Object.assign(s.p, { y: 690, vy: -220, grounded: false })
      tick(s, { climb: true, jump: true }); advance(s, .2, { climb: true, jump: true })
    } else { advance(s, .8, { climb: true }); advance(s, .2) }
    tick(s, { move: 1, detach: departure === 'drop', jump: departure === 'held' })
    assert.equal(s.p.climbing, null)
    if (departure === 'expired') advance(s, .14, { move: 1 })
    tick(s, { move: 1, jump: true })
    assert.ok(s.p.vy >= 0, `${departure} must not create another jump`)
  }
})

test('a ladder departure jump is single-use even if Jump is released and pressed again', () => {
  const s = scene()
  advance(s, .8, { climb: true }); advance(s, .2)
  tick(s, { move: 1 }); tick(s, { move: 1, jump: true })
  assert.ok(s.p.vy < -350)
  const launched = s.p.vy
  tick(s, { move: 1 }); tick(s, { move: 1, jump: true })
  assert.ok(s.p.vy > launched, 'a second press cannot provide another impulse in midair')
})

test('foreground ladders cross thick and thin decks, hold inside them, and exit onto the top', () => {
  for (const thickness of [20, 180]) {
    const s = scene(thickness)
    let crossed = false, held = false, previousY = s.p.y, previousLimbs
    advance(s, 9, { climb: true }, p => {
      assert.ok(Math.abs(p.y - previousY) < 5, 'catch, climb and landing are continuous')
      previousY = p.y
      const pose = athletePose(p), limbs = [pose.head, ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(l => [l.joint, l.end])]
      const points = limbs.map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previousLimbs) points.forEach((a, i) => assert.ok(Math.hypot(a[0] - previousLimbs[i][0], a[1] - previousLimbs[i][1]) < 8,
        `the rig eases into the top landing: point ${i}, feet ${p.y}, mantle ${p.mantle?.time}`))
      previousLimbs = points
      if (!held && p.climbing && p.y < 520 && p.y > 510) {
        const y = p.y
        advance(s, .3)
        assert.equal(p.y, y); assert.equal(p.climbing.kind, 'ladder'); held = true
      }
      crossed ||= !!p.climbing && s.terrain.some(b => bodyIntersects(p.x, p.y, b))
    })
    assert.ok(crossed && held); assert.equal(s.p.y, 200); assert.ok(s.p.grounded); assert.equal(s.p.climbing, null)
    advance(s, 7, { descend: true })
    assert.equal(s.p.y, 800); assert.ok(s.p.grounded); assert.equal(s.p.climbing, null)
    advance(s, .5, { descend: true }); assert.equal(s.p.climbing, null)
  }
})

test('walking and Up keep the upper floor solid; Down deliberately boards from above', () => {
  const s = scene(); Object.assign(s.p, { x: 300, y: 200 })
  advance(s, .4, { move: 1 })
  assert.equal(s.p.y, 200); assert.equal(s.p.climbing, null)
  Object.assign(s.p, { x: 400, vx: 0 }); advance(s, .3, { climb: true })
  assert.equal(s.p.climbing, null); assert.equal(s.p.y, 200)
  advance(s, .5, { descend: true })
  assert.equal(s.p.climbing.kind, 'ladder'); assert.ok(s.p.y > 220)
})

test('descending through the upper and intermediate decks preserves every frame of travel', () => {
  const s = scene(); Object.assign(s.p, { y: 200 })
  let previous = s.p.y, crossed = false
  advance(s, 7, { descend: true }, p => {
    assert.ok(Math.abs(p.y - previous) < 4, `descent jumped from ${previous} to ${p.y}`)
    crossed ||= !!p.climbing && p.y > 500 && p.y < 580
    previous = p.y
  })
  assert.ok(crossed); assert.equal(s.p.y, 800); assert.ok(s.p.grounded)
})

test('boarding downward lowers onto the real top rung instead of climbing above the ladder', () => {
  for (const facing of [-1, 1]) {
    const s = scene(); Object.assign(s.p, { y: 200, facing })
    let previous, maxStep = 0, contacts = 0
    advance(s, 1, { descend: true }, p => {
      const before = structuredClone(p), pose = athletePose(p)
      assert.deepEqual(p, before, 'posing must not change the ladder or controller')
      const points = [pose.head, pose.shoulder, pose.hip,
        ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(l => [l.root, l.joint, l.end])]
        .map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previous) points.forEach((a, i) => { maxStep = Math.max(maxStep, Math.hypot(a[0] - previous[i][0], a[1] - previous[i][1])) })
      previous = points
      for (const [limb, upper, lower] of [[pose.frontArm, 10, 9], [pose.backArm, 10, 9], [pose.frontLeg, 15, 14.5], [pose.backLeg, 15, 14.5]]) {
        assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - upper) < 1e-6)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - lower) < 1e-6)
      }
      if (p.climbing?.time >= .16 && p.y >= 223 && p.y < 280) {
        for (const arm of [pose.frontArm, pose.backArm]) {
          const palm = arm.hand ?? arm.end
          assert.ok(p.y + palm[1] >= 198, `a loaded hand cannot grip an imaginary rung at ${p.y + palm[1]}`)
        }
        contacts++
      }
    })
    assert.ok(contacts > 10, 'observe the full lowering and first strokes')
    assert.ok(maxStep < 8, `boarding must ease into ordinary climbing, largest step ${maxStep}`)
    assert.equal(s.p.climbing?.kind, 'ladder')
    const y = s.p.y
    advance(s, .25); assert.equal(s.p.y, y, 'letting go holds the lowering pose')
    advance(s, 2, { climb: true })
    assert.equal(s.p.y, 200); assert.ok(s.p.grounded); assert.equal(s.p.climbing, null)
  }
})

test('an airborne Up catch works while Jump is held and consumes that press', () => {
  for (const vy of [-220, 180]) for (const side of [-1, 1]) {
    const s = scene()
    Object.assign(s.p, { x: 400 + side * 18, y: 690, vy, vx: -side * 100, grounded: false })
    const y = s.p.y
    tick(s, { climb: true, jump: true }); assert.equal(s.p.climbing?.kind, 'ladder')
    advance(s, .2, { climb: true, jump: true, move: -side * .5 })
    assert.equal(s.p.climbing?.kind, 'ladder'); assert.ok(Math.abs(s.p.y - y) < 2)
    tick(s); tick(s, { jump: true, move: side })
    assert.equal(s.p.climbing, null); assert.ok(s.p.vy < 0)
  }
})

test('a high airborne catch joins the mantle at its current height', () => {
  const s = scene(); s.terrain[2].h = 2
  s.ladders.ladders[0].top = 130
  Object.assign(s.p, { y: 270, grounded: false, vy: -150 })
  tick(s, { climb: true, jump: true }); assert.equal(s.p.climbing?.kind, 'ladder')
  advance(s, .2, { climb: true, jump: true })
  let previous = s.p.y, joinedHigh = false
  advance(s, 2, { climb: true }, p => {
    assert.ok(Math.abs(p.y - previous) < 4, `high catch jumped from ${previous} to ${p.y}`)
    joinedHigh ||= !!p.mantle?.ladder && p.mantle.ladder.entry > 0
    previous = p.y
  })
  assert.ok(joinedHigh); assert.ok(s.p.grounded); assert.equal(s.p.y, 200)
})

test('catching a ladder cannot sweep the head or feet sideways through a platform lip', () => {
  const s = scene(); Object.assign(s.terrain[2], { x: 400, w: 500, h: 2 })
  s.ladders.ladders[0].x = 410
  Object.assign(s.p, { x: 386, y: 230, grounded: false, vy: -150 })
  tick(s, { climb: true, jump: true })
  assert.equal(s.p.climbing, null); assert.ok(s.p.x < 400)
})

test('holding vertical input with slight sideways steering stays attached across intermediate floors', () => {
  const s = scene(); let passed = false
  for (let i = 0; i < 1200 && !(s.p.grounded && s.p.y === 200); i++) {
    tick(s, { climb: true, move: .2 })
    if (s.p.y < 490 && s.p.y > 350) {
      passed = true; assert.equal(s.p.climbing?.kind, 'ladder'); assert.equal(s.p.x, 400)
    }
  }
  assert.ok(passed); assert.equal(s.p.y, 200); assert.ok(s.p.grounded)
})

test('holding Up after an inset upper landing never restarts the climbing animation', () => {
  const s = scene(); s.ladders.ladders[0].top = 160
  advance(s, 9, { climb: true }); assert.equal(s.p.y, 200)
  advance(s, 1, { climb: true }, p => {
    assert.equal(p.climbing, null); assert.ok(p.grounded); assert.equal(p.y, 200)
  })
  advance(s, .5, { descend: true }); assert.equal(s.p.climbing?.kind, 'ladder')
})

test('the ladder enters the existing ledge mantle from behind without extending its geometry', () => {
  const s = scene(); s.ladders.ladders[0].top = 130
  const ladder = s.ladders.ladders[0], original = structuredClone(ladder)
  let stepping = false, knee = false, planted = false, released = false
  advance(s, 9, { climb: true }, p => {
    if (p.mantle?.ladder && p.mantle.time >= 0) {
      stepping = true
      const progress = p.mantle.time / LEDGE_CLIMB_TIME, frame = climbFrame(progress)
      assert.ok(Math.abs(p.y - 200 - frame.root[1]) < 1e-6, 'the physical pull-up follows the shared mantle curve')
      const pose = athletePose(p)
      if (progress < .8) assert.equal(pose.backView, 1, 'the pull and knee support face the wall')
      knee ||= frame.kneePlanted; planted ||= frame.backPlanted
      if (progress < .5) assert.equal(rightArmSupporting(p), true)
      if (progress > .72) released ||= !rightArmSupporting(p)
      for (const [limb, upper, lower] of [[pose.frontArm, 10, 9], [pose.backArm, 10, 9], [pose.frontLeg, 15, 14.5], [pose.backLeg, 15, 14.5]]) {
        assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - upper) < 1e-5)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - lower) < 1e-5)
      }
    }
  })
  assert.ok(stepping && knee && planted && released); assert.equal(s.p.climbing, null); assert.equal(s.p.mantle, null)
  assert.equal(s.p.y, 200); assert.ok(s.p.grounded); assert.equal(s.p.x, ladder.x, 'forward motion into the deck stays in depth')
  assert.deepEqual(ladder, original, 'mantling never rewrites the authored geometry')
})

test('Down reverses a rear mantle onto the ladder and permits a later complete pull-up', () => {
  const s = scene()
  while (!s.p.mantle?.ladder || s.p.mantle.time < .4) tick(s, { climb: true })
  const y = s.p.y
  advance(s, 1, { descend: true })
  assert.equal(s.p.mantle, null); assert.equal(s.p.climbing?.kind, 'ladder'); assert.ok(s.p.y > y + 40)
  advance(s, 3, { climb: true }); assert.equal(s.p.y, 200); assert.ok(s.p.grounded)
})

test('a mechanism crossing the rear mantle stops it and lets the rider retreat', () => {
  const s = scene()
  while (!s.p.mantle?.ladder) tick(s, { climb: true })
  const blocker = { x: 370, y: 170, w: 60, h: 20 }
  s.world = { platforms: [...s.terrain, blocker], colliders: [...s.world.colliders, { id: 'mechanism:0', platform: blocker }] }
  advance(s, 2, { climb: true }); assert.ok(s.p.mantle?.ladder)
  const y = s.p.y; advance(s, .2, { climb: true }); assert.equal(s.p.y, y)
  advance(s, 2, { descend: true }); assert.equal(s.p.mantle, null); assert.equal(s.p.climbing?.kind, 'ladder')
})

test('ladder passages cross polygon and profile terrain without changing their geometry', () => {
  for (const shape of [{ polygon: [[0, 0], [800, 60], [800, 150], [0, 150]] },
    { profile: [[0, 40], [400, 0], [800, 40]] }]) {
    const s = scene(); Object.assign(s.terrain[1], shape, { h: 150 })
    const original = structuredClone(s.terrain)
    advance(s, 9, { climb: true }); assert.equal(s.p.y, 200)
    advance(s, 7, { descend: true }); assert.equal(s.p.y, 800)
    assert.deepEqual(s.terrain, original)
  }
})

test('jump, drop and sideways exit cannot detach a ladder rider inside terrain', () => {
  for (const input of [{ jump: true, move: 1 }, { detach: true }, { move: 1 }]) {
    const s = scene(180)
    while (s.p.y > 560) tick(s, { climb: true })
    const y = s.p.y; advance(s, .2, input)
    assert.equal(s.p.climbing?.kind, 'ladder'); assert.equal(s.p.y, y)
    advance(s, 5, { climb: true }); assert.equal(s.p.y, 200)
  }
})

test('intermediate floors allow a clear sideways exit and deliberate descent back onto the ladder', () => {
  const s = scene()
  while (s.p.y > 499) tick(s, { climb: true })
  tick(s, { move: 1 }); advance(s, .3, { move: 1 })
  assert.equal(s.p.climbing, null); assert.ok(s.p.grounded); assert.equal(s.p.y, 500); assert.ok(s.p.x > 420)
  Object.assign(s.p, { x: 400, vx: 0 }); advance(s, 4, { descend: true })
  assert.equal(s.p.y, 800); assert.equal(s.p.climbing, null)
})

test('a shallow overlap at an intermediate deck permits stepping or jumping off', () => {
  for (const overlap of [3, 10, 17]) for (const input of [{ move: 1 }, { jump: true, move: -1 }, { detach: true }]) {
    const s = scene()
    while (s.p.y > 500 + overlap) tick(s, { climb: true })
    assert.ok(s.p.climbing?.ladder); assert.ok(bodyIntersects(s.p.x, s.p.y, s.terrain[1]))
    tick(s, input)
    assert.equal(s.p.climbing, null, `exit with toes ${overlap} units into the deck`)
    assert.ok(s.p.y <= 500); assert.ok(!s.terrain.some(b => bodyIntersects(s.p.x, s.p.y, b)))
    if (input.move === 1) { assert.ok(s.p.grounded); assert.equal(s.p.y, 500) }
    if (input.jump) assert.ok(s.p.vy < 0)
  }
})

test('ladder exit tolerance preserves walls, headroom and mechanism barriers', () => {
  for (const blocker of [{ x: 370, y: 480, w: 60, h: 10 }, { x: 370, y: 430, w: 60, h: 15 }]) {
    const s = scene()
    while (s.p.y > 510) tick(s, { climb: true })
    s.world = { platforms: [...s.terrain, blocker], colliders: [...s.world.colliders, { id: 'mechanism:0', platform: blocker }] }
    tick(s, { move: 1 })
    assert.equal(s.p.climbing?.kind, 'ladder')
  }
  const s = scene()
  while (s.p.y > 525) tick(s, { climb: true })
  tick(s, { move: 1 }); assert.equal(s.p.climbing?.kind, 'ladder', 'deep overlap still requires more climbing')
})

test('gates, props and forcefields stop ladder travel without releasing a rider inside terrain', () => {
  for (const id of ['mechanism:0', 'prop:0', 'red:0', 'force-field:0']) {
    const s = scene(180), blocker = { x: 370, y: 530, w: 60, h: 20 }
    s.world = { platforms: [...s.terrain, blocker], colliders: [...s.world.colliders, { id, platform: blocker }] }
    advance(s, 5, { climb: true })
    assert.equal(s.p.climbing?.kind, 'ladder'); assert.ok(s.p.y > blocker.y + blocker.h)
    assert.equal(bodyIntersects(s.p.x, s.p.y, blocker), false)
    const y = s.p.y; advance(s, .3, { climb: true }); assert.equal(s.p.y, y)
    advance(s, 3, { descend: true }); assert.equal(s.p.y, 800)
  }
})

test('a buried ladder end retains its grip instead of releasing into a solid', () => {
  const s = scene(); s.ladders.ladders[0].bottom = 550
  Object.assign(s.p, { y: 200 }); advance(s, 5, { descend: true })
  assert.equal(s.p.climbing?.kind, 'ladder'); assert.ok(s.terrain.some(b => bodyIntersects(s.p.x, s.p.y, b)))
  advance(s, 5, { climb: true }); assert.equal(s.p.y, 200); assert.ok(s.p.grounded)
})

test('Down can finish a ladder descent crouched beneath a low tunnel ceiling', () => {
  const s = scene()
  s.terrain.push({ x: 300, y: 730, w: 300, h: 30 })
  s.world = staticContactWorld(s.terrain); s.p.y = 200
  advance(s, 8, { descend: true, crouch: true })
  assert.equal(s.p.climbing, null); assert.equal(s.p.y, 800); assert.ok(s.p.grounded && s.p.crouching)
  advance(s, .6, { move: 1, crouch: true })
  assert.ok(s.p.x > 450); assert.equal(s.p.y, 800)
  assert.ok(!s.terrain.some(b => bodyIntersects(s.p.x, s.p.y, b, 40)))
})

test('Down keeps walking on a floor when the ladder ends inside that same floor', () => {
  const s = scene(); s.ladders.ladders[0].bottom = 820
  advance(s, .5, { move: 1, descend: true, crouch: true })
  assert.equal(s.p.climbing, null); assert.equal(s.p.y, 800); assert.ok(s.p.grounded)
  assert.ok(s.p.x > 450)
})

function botScene() {
  const s = scene()
  for (const deck of s.terrain.slice(1)) { deck.x = 0; deck.w = 1000 }
  const file = { ...blankTrial(), id: 'ladder-passages', name: 'Ladder passages', width: 1000, height: 900, floor: 800,
    timing: 'untimed', entrance: { x: 200, y: 800 }, goal: { x: 800, y: 200, flipX: true },
    platforms: s.terrain.slice(1), climbables: s.ladders, robots: [{ kind: 'repulsor', x: 400, y: 800, left: 26, right: 974 }] }
  const run = createRun(parseLevel(file)), bot = run.robots[0]
  bot.actor = createRepulsorActor(400, 800)
  return { ...s, run, bot }
}

test('Rbot plans and executes ladder passages up, down, and onto intermediate floors', () => {
  const s = botScene(), { run, bot } = s
  for (const target of [{ x: 700, y: 200 }, { x: 600, y: 500 }, { x: 700, y: 800 }]) {
    assert.ok(botCanReach(run, bot, target), `missing route to ${JSON.stringify(target)}`)
    let usedLadder = false, arrived = false
    for (let i = 0; i < 2400 && !arrived; i++) {
      const input = botMovement(run, bot, STEP, target)
      stepPlayer(bot.actor, input, STEP, run.terrain, run.level.climbables)
      bot.x = bot.actor.x; bot.y = bot.actor.y
      usedLadder ||= !!bot.actor.climbing?.ladder
      arrived = bot.actor.grounded && Math.abs(bot.x - target.x) < 25 && Math.abs(bot.y - target.y) < 1
    }
    assert.ok(usedLadder, `route did not board a ladder to ${JSON.stringify(target)}`)
    assert.ok(arrived, `stopped at ${bot.x}, ${bot.y} heading to ${JSON.stringify(target)}`)
  }
})

test('Rbot steps off beside a player occupying the ladder landing and resumes the hunt', () => {
  const { run, bot } = botScene()
  run.player = createPlayer({ x: 400, y: 800 }); run.level.entrance.x = 400
  bot.actor = createRepulsorActor(400, 200); bot.x = 400; bot.y = 200
  let climbed = false
  for (let i = 0; i < 3000 && !bot.shots; i++) {
    stepRun(run, NEUTRAL_INPUT); climbed ||= !!bot.actor.climbing?.ladder
  }
  assert.ok(climbed); assert.ok(bot.shots, `stopped at ${bot.x}, ${bot.y}`)
  assert.ok(bot.actor.grounded && bot.actor.contacts?.support?.collider.id !== 'player')
})
