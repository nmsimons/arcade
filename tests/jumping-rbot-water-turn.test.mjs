import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { repulsorBotPose, repulsorBotWidthScale, REPULSOR_BOT_WIDTH_SCALE } from '../src/games/jumping/repulsorBotRig.ts'
import { repulsorBotHand } from '../src/games/jumping/repulsorBot.ts'
import { robotHeadlightPose } from '../src/games/jumping/robotHeadlight.ts'

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1])
test(`swimming Rbot turns retain native joints, palms and emitter alignment (${side}, ${dt})`, () => {
  const field = createGravityField()
  updateGravityField(field, [{ id: 'pool', x: 0, y: 400, w: 3000, h: 1200, effect: 'water' }], new Map(), true)
  for (const depth of [450, 1000]) {
    const actor = createPlayer({ x: 1500, y: depth }); actor.grounded = false; actor.facing = side
    const bot = { actor, facing: side, x: actor.x, y: actor.y, phase: 'chase' }
    for (const [seconds, move] of [[1, side], [.8, -side], [.25, side], [1, -side]])
      for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
        stepPlayer(actor, { ...NEUTRAL_INPUT, move }, dt, [], undefined, undefined, undefined, field)
        Object.assign(bot, { x: actor.x, y: actor.y, facing: actor.facing })
        const before = structuredClone(actor), native = presentedAthletePose(actor), pose = repulsorBotPose(actor), width = repulsorBotWidthScale(actor)
        assert.ok(width >= 1 && width <= REPULSOR_BOT_WIDTH_SCALE)
        if (actor.waterMotion?.amount === 1) {
          assert.equal(width, 1, 'a horizontal swim or yaw turn cannot stretch the shell sideways')
          for (const name of ['hip', 'waist', 'shoulder', 'head']) assert.deepEqual(pose[name], native[name])
        }
        for (const name of ['frontArm', 'backArm']) {
          const arm = native[name], angle = arm.handAngle ?? Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0])
          const palm = arm.hand ?? [arm.end[0] + Math.cos(angle) * 1.4, arm.end[1] + Math.sin(angle) * 1.4]
          assert.ok(Math.abs(pose[name].hand[0] * width - palm[0]) < 1e-8)
          assert.ok(Math.abs(pose[name].hand[1] - palm[1]) < 1e-8)
        }
        const arm = pose[actor.facing < 0 ? 'backArm' : 'frontArm'], muzzle = repulsorBotHand(bot)
        assert.ok(Math.abs(muzzle.from[0] - actor.x - arm.hand[0] * width * actor.facing) < 1e-8)
        assert.ok(Math.abs(muzzle.from[1] - actor.y - arm.hand[1]) < 1e-8)
        const lamp = robotHeadlightPose(bot)
        assert.ok(Math.abs(lamp.x - actor.x - (pose.head[0] * width + 11) * actor.facing) < 1e-8)
        assert.deepEqual(actor, before, 'presentation does not alter movement or turn state')
      }
  }
})

test('Rbot smoothly returns to the broad dry shell as swimming ends', () => {
  const actor = createPlayer(), widths = []
  for (let i = 0; i <= 100; i++) {
    actor.waterMotion = { amount: 1 - i / 100, dive: 0, phase: 0 }
    widths.push(repulsorBotWidthScale(actor))
  }
  assert.equal(widths[0], 1)
  assert.equal(widths.at(-1), REPULSOR_BOT_WIDTH_SCALE)
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] >= widths[i - 1] && widths[i] - widths[i - 1] < .007)
  delete actor.waterMotion
  assert.equal(repulsorBotWidthScale(actor), REPULSOR_BOT_WIDTH_SCALE)
})
