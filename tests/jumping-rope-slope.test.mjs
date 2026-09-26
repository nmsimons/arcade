import test from 'node:test'
import assert from 'node:assert/strict'
import { levelPlayer, levelTerrain, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { bodyIntersects, lineBlocked } from '../src/games/jumping/geometry.ts'
import { ropePath } from '../src/games/jumping/climbables.ts'
import { canGrip } from '../src/games/jumping/friction.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { findRopeStepUp } from '../src/games/jumping/stepUp.ts'
import { staticContactWorld } from '../src/games/jumping/playerContacts.ts'
import { ropeSlope } from './helpers/rope-slope.mjs'

test('a shoulder anchor transfers onto its slope before the player runs out of rope, on either side', () => {
  for (const mirror of [false, true]) for (const length of [180, 380]) {
    const level = prepareLevelRopes(ropeSlope(mirror, { anchor: 'shoulder', length })), terrain = levelTerrain(level), p = levelPlayer(level)
    Object.assign(p, { x: mirror ? 1100 : 700, y: 615, grounded: false, facing: mirror ? -1 : 1 })
    let transferred = false, landed = false, landedAt
    for (let i = 0; i < 480; i++) {
      const before = [p.x, p.y], pose = p.climbing ? athletePose(p) : null
      stepPlayer(p, { ...NEUTRAL_INPUT, climb: true }, STEP, terrain, level.climbables, { checkpoints: [], fallY: Infinity })
      if (pose && p.mantle?.step?.climbing) {
        const next = athletePose(p)
        for (const name of ['frontArm', 'backArm', 'frontLeg', 'backLeg']) for (const point of ['root', 'joint', 'end']) {
          assert.ok(Math.hypot(next[name][point][0] - pose[name][point][0], next[name][point][1] - pose[name][point][1]) < .1,
            `the ${name} ${point} retains its entry pose`)
        }
      }
      transferred ||= !!p.mantle?.step?.climbing
      assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)), `body clear, frame ${i}`)
      assert.ok(Math.hypot(p.x - before[0], p.y - before[1]) < 6, `smooth pull-up, frame ${i}`)
      if (landed) {
        assert.equal(p.climbing, null, 'held Up cannot reattach to the settling rope')
        assert.ok(Math.hypot(p.x - landedAt[0], p.y - landedAt[1]) < .01, 'the landing remains stable')
      }
      if (p.grounded && !landed) { landed = true; landedAt = [p.x, p.y] }
    }
    assert.ok(transferred && landed)
    assert.ok(p.grounded && canGrip(p.groundAngle))
    assert.ok(p.y < 400 && p.y > 390)
    assert.equal(mirror ? level.width - p.x : p.x, 772)
  }
})

test('the rope pull-up respects headroom and can be cancelled with Drop', () => {
  const level = prepareLevelRopes(ropeSlope(false, { anchor: 'shoulder', length: 180 })), terrain = levelTerrain(level), p = levelPlayer(level)
  Object.assign(p, { x: 700, y: 615, grounded: false })
  const tick = input => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, level.climbables, { checkpoints: [], fallY: Infinity })
  for (let i = 0; i < 300 && !findRopeStepUp(p, staticContactWorld(terrain)); i++) tick({ climb: true })
  assert.ok(findRopeStepUp(p, staticContactWorld(terrain)), 'a clear shoulder offers a pull-up')
  const ceiling = { x: 750, y: 300, w: 140, h: 60 }
  assert.equal(findRopeStepUp(p, staticContactWorld([...terrain, ceiling])), null, 'the full body needs a clear route and landing')
  tick({ climb: true }); assert.ok(p.mantle?.step?.climbing)
  for (let i = 0; i < 20; i++) tick({ climb: true })
  tick({ detach: true })
  assert.equal(p.mantle, null); assert.equal(p.climbing, null)
  const y = p.y
  for (let i = 0; i < 8; i++) tick({})
  assert.ok(p.y > y && p.grabCooldown > 0, 'Drop releases immediately without catching the rope again')
})

test('a draped rope climbs the steep shoulder, then steps onto either sloping summit without a launch', () => {
  for (const mirror of [false, true]) for (const pause of [false, true]) {
    const level = prepareLevelRopes(ropeSlope(mirror)), terrain = levelTerrain(level), p = levelPlayer(level)
    Object.assign(p, { x: mirror ? 1100 : 700, y: 615, grounded: false, facing: mirror ? -1 : 1 })
    let caught = false, supported = false, landed = false, holding = 0
    for (let i = 0; i < 720; i++) {
      const before = [p.x, p.y], waiting = pause && i >= 210 && i < 390
      stepPlayer(p, { ...NEUTRAL_INPUT, climb: !waiting }, STEP, terrain, level.climbables, { checkpoints: [], fallY: Infinity })
      caught ||= !!p.climbing; supported ||= p.climbing?.surfaceSupport > .9
      if (waiting && p.climbing) holding++
      assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)), `body clear, mirror ${mirror}, frame ${i}`)
      assert.ok(Math.hypot(p.x - before[0], p.y - before[1]) < 6, `no slingshot during regrip, frame ${i}`)
      const rope = p.ropes[0], path = ropePath(rope.definition, rope)
      for (let k = 1; k < path.length; k++) assert.ok(!lineBlocked(path[k - 1], path[k], terrain), `rope clear, frame ${i}, span ${k}`)
      if (landed) assert.equal(p.climbing, null, 'continuing to hold Up must not repeatedly catch the rope')
      landed ||= p.grounded
    }
    assert.ok(caught && supported && landed)
    if (pause) assert.equal(holding, 180, 'pausing halfway up must keep the grip')
    assert.ok(p.grounded && canGrip(p.groundAngle))
    assert.ok(p.y <= 400 && p.y >= 360, 'finish on the shallow shoulder, not at the floor or hanging beside the anchor')
    const x = mirror ? level.width - p.x : p.x
    assert.ok(x >= 760 && x < 900, 'reach the near side without being flung across the peak')
  }
})
