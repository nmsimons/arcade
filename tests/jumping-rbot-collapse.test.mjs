import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { EMP_DISABLE_SECONDS } from '../src/games/jumping/gadgets.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { REPULSOR_BOT_SIZE } from '../src/games/jumping/repulsorBotRig.ts'
import { COLLAPSED_PUSH_SPEED, REPULSOR_BOT_COLLAPSE, REPULSOR_BOT_GET_UP } from '../src/games/jumping/repulsorBot.ts'

// Without power Rbot slumps to its knees (repulsorBot.ts): it falls and settles, can be pushed like a heavy
// crate, and gets up where it was left when power returns.
const run$ = (change = () => {}) => {
  const file = blankTrial(); file.goal.x = 1700
  file.robots = [{ kind: 'repulsor', x: 900, y: 920, left: 26, right: 1774 }]
  change(file)
  const run = createRun(file)
  run.player = createPlayer({ x: 700, y: 920 })
  return { run, bot: run.robots[0] }
}
const tick = (run, seconds, input = {}) => { for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
const height = bot => playerContactBody(bot.actor).height

test('an EMP hit slumps Rbot to its knees at crouch height, holding its fire', () => {
  const { run, bot } = run$()
  const standing = height(bot)
  run.gadgets.disabled.set(bot, EMP_DISABLE_SECONDS)
  tick(run, REPULSOR_BOT_COLLAPSE + .05)
  assert.equal(bot.collapse, 1)
  assert.ok(Math.abs(height(bot) - TUNING.crouchHeight * REPULSOR_BOT_SIZE) < 1e-6 && height(bot) < standing)
  tick(run, 3)
  assert.equal(bot.shots ?? 0, 0, 'it does not fire while slumped')
})

test('a slumped Rbot slides under a push like a heavy crate, keeping the way it faces, and not into a wall', () => {
  for (const wall of [false, true]) {
    const { run, bot } = run$(file => { if (wall) file.platforms = [{ x: 900 + 12 * REPULSOR_BOT_SIZE + 60, y: 700, w: 40, h: 220 }] })
    run.gadgets.disabled.set(bot, EMP_DISABLE_SECONDS)
    tick(run, .5)
    const facing = bot.facing, start = bot.x
    tick(run, 3, { move: 1 })
    if (wall) {
      assert.ok(bot.x - start <= 60 + 1e-6, `it stops at the wall, at ${bot.x}`)
      const pinned = bot.x; tick(run, 1, { move: 1 })
      assert.ok(Math.abs(bot.x - pinned) < 1e-6, 'a pinned body is not squeezed back past the player')
    } else {
      const speed = (bot.x - start) / 3
      assert.ok(speed > COLLAPSED_PUSH_SPEED * .5 && speed <= COLLAPSED_PUSH_SPEED + 1, `slid at ${speed}`)
    }
    assert.equal(bot.facing, facing, 'the slump keeps the facing it fell with')
  }
})

test('an EMP in midair lets Rbot fall and settle rather than hang frozen', () => {
  const { run, bot } = run$()
  Object.assign(bot.actor, { y: 600, vy: 0, grounded: false }); bot.y = 600
  run.gadgets.disabled.set(bot, EMP_DISABLE_SECONDS)
  tick(run, 1.5)
  assert.ok(bot.actor.grounded && Math.abs(bot.y - 920) < .1, `it landed on the floor, at ${bot.y}`)
  assert.equal(bot.collapse, 1)
})

test('an EMP lets go of a ladder', () => {
  const { run, bot } = run$(file => { file.climbables.ladders = [{ x: 900, top: 500, bottom: 920, side: 1, platform: -1 }] })
  run.player = createPlayer({ x: 300, y: 920 })
  // Put Rbot partway up the ladder through its own controller.
  for (let i = 0; i < 120 && !bot.actor.climbing; i++) stepRun(run, NEUTRAL_INPUT)
  if (!bot.actor.climbing) bot.actor.climbing = null
  run.gadgets.disabled.set(bot, EMP_DISABLE_SECONDS)
  tick(run, 2)
  assert.equal(bot.actor.climbing, null)
  assert.ok(bot.actor.grounded, 'it fell to the floor')
})

test('a level power cut slumps Rbot as well, and it lets go of a rope rather than freezing on it as the rope swings', () => {
  const { run, bot } = run$(file => {
    file.platforms = [{ x: 700, y: 300, w: 400, h: 25 }]
    file.climbables.ropes = [{ x: 900, y: 325, length: 560, segments: 70 }]
  })
  // Put Rbot on the rope through its own controller: in the air beside it, it takes hold.
  for (let i = 0; i < 60 && !bot.actor.climbing; i++) {
    Object.assign(bot.actor, { x: 900, y: 760, vx: 0, vy: 0, grounded: false, grabCooldown: 0 }); stepRun(run, NEUTRAL_INPUT)
  }
  assert.ok(bot.actor.climbing?.rope, 'it holds the rope')
  run.empRemaining = 5
  tick(run, 1.5)
  assert.equal(bot.actor.climbing, null, 'it let go')
  assert.ok(bot.actor.grounded && Math.abs(bot.y - 920) < .1, `it fell to the floor, at ${bot.y}`)
  assert.equal(bot.collapse, 1)
  tick(run, 3.5 + REPULSOR_BOT_GET_UP + .3)
  assert.equal(bot.collapse, 0, 'it got up when the power came back')
})

test('when the EMP ends, Rbot gets up where it was left and hunts again', () => {
  const { run, bot } = run$()
  run.gadgets.disabled.set(bot, 2)
  tick(run, 1); tick(run, 1, { move: 1 })
  const left = bot.x
  tick(run, REPULSOR_BOT_GET_UP + .3)
  assert.equal(bot.collapse, 0)
  assert.ok(Math.abs(height(bot) - TUNING.height * REPULSOR_BOT_SIZE) < 1e-6, 'standing again')
  assert.ok(Math.abs(bot.x - left) < 2, 'it gets up where it was pushed to')
  let acted = false
  for (let i = 0; i < 2 / STEP; i++) { stepRun(run, NEUTRAL_INPUT); acted ||= bot.phase !== 'recover' }
  assert.ok(acted, 'it resumes deciding: it chases, patrols or winds up again')
})
