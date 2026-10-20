import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { BOT_AIR_SPEED_SCALE } from '../src/games/jumping/botMovementTuning.ts'

function runningJump(options = {}, platforms = [{ x: 0, y: 900, w: 3000, h: 100 }]) {
  const actor = createPlayer({ x: 200, y: 900 }); actor.vx = TUNING.runSpeed
  let minY = actor.y, maxSpeed = 0
  for (let frame = 0; frame < 200; frame++) {
    stepPlayer(actor, { ...NEUTRAL_INPUT, move: 1, jump: frame === 0, jumpStrength: 1 }, STEP, platforms,
      undefined, undefined, undefined, undefined, undefined, 1, undefined, options)
    minY = Math.min(minY, actor.y); maxSpeed = Math.max(maxSpeed, actor.vx)
    if (frame > 0 && actor.grounded) return { actor, minY, maxSpeed, flightFrames: frame + 1 }
  }
  assert.fail('the jump should land on its original floor')
}

test('Rbot gains modest horizontal jump reach without changing player movement or jump height', () => {
  const player = runningJump(), bot = runningJump({ airSpeedScale: BOT_AIR_SPEED_SCALE })
  const ratio = (bot.actor.x - 200) / (player.actor.x - 200)
  assert.ok(ratio > 1.15 && ratio < 1.2, `range ratio ${ratio}`)
  assert.equal(player.maxSpeed, TUNING.runSpeed)
  assert.ok(Math.abs(bot.maxSpeed - TUNING.runSpeed * 1.2) < .01)
  assert.equal(bot.minY, player.minY); assert.equal(bot.flightFrames, player.flightFrames)
  assert.deepEqual(runningJump(), player, 'the bot profile cannot mutate shared player tuning')
})

test('the longer jump still sweeps against a wall and retains ordinary ground speed', () => {
  const floor = { x: 0, y: 900, w: 3000, h: 100 }, wall = { x: 500, y: 0, w: 20, h: 900 }
  const { actor } = runningJump({ airSpeedScale: BOT_AIR_SPEED_SCALE }, [floor, wall])
  assert.ok(actor.x <= wall.x - TUNING.width / 2 + .01)
  const grounded = createPlayer({ x: 200, y: 900 })
  for (let frame = 0; frame < 180; frame++) stepPlayer(grounded, { ...NEUTRAL_INPUT, move: 1 }, STEP, [floor],
    undefined, undefined, undefined, undefined, undefined, 1, undefined, { airSpeedScale: BOT_AIR_SPEED_SCALE })
  assert.equal(grounded.vx, TUNING.runSpeed)
})
