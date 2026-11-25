import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRope, ropePoint, ropeGripDistance } from '../src/games/jumping/climbables.ts'

for (const [angle, omega] of [[-.65, .6], [-.35, 1], [-.65, -.6], [-.35, -1]]) {
  test(`Rbot intercepts a swinging rope and completes its climb (${angle}, ${omega})`, () => {
    // The player comes in up on the deck, out of sight from the floor at its far end, so the hunter's way to them is
    // the rope, with no shot to take first.
    const file = blankTrial(); file.entrance = { ...file.entrance, x: 1040, y: 500 }; file.goal.x = 100
    file.robots = [{ kind: 'repulsor', x: 300, y: 920, left: 26, right: 1774 }]
    // The deck is beyond Rbot's jump and catch from the floor (repulsorBotRig.ts REPULSOR_BOT_SIZE): the rope is the way up.
    file.platforms = [{ x: 620, y: 500, w: 450, h: 20 }, { x: 1500, y: 0, w: 30, h: 920 }]
    file.climbables.ropes = [{ x: 600, y: 150, length: 770, segments: 97 }]
    const run = createRun(file), bot = run.robots[0]; bot.facing = 1
    const rope = createRope(file.climbables.ropes[0]); run.player.ropes = [rope]
    // Start with real pendulum displacement and velocity, then let the ordinary
    // rope solver and controller own every subsequent frame, contact and catch.
    rope.nodes.forEach(node => {
      const distance = node.y - rope.definition.y
      node.x = 600 + Math.sin(angle) * distance; node.y = 150 + Math.cos(angle) * distance
      node.oldX = node.x - Math.cos(angle) * omega * distance * STEP
      node.oldY = node.y + Math.sin(angle) * omega * distance * STEP
    })
    let caught = -1, landed = false, gripSpeed = 0
    for (let frame = 0; frame < 1200 && !landed; frame++) {
      stepRun(run, NEUTRAL_INPUT)
      if (caught < 0 && bot.actor.climbing?.kind === 'rope') {
        caught = frame
        const distance = ropeGripDistance(bot.actor.climbing), now = ropePoint(rope, distance), before = ropePoint(rope, distance, true)
        gripSpeed = Math.hypot(now[0] - before[0], now[1] - before[1]) / STEP
      }
      // A larger body's position passes through its size frame, so it lands within rounding of the deck.
      landed = bot.actor.grounded && Math.abs(bot.y - 500) < 1e-6
    }
    assert.ok(caught >= 0 && caught < 360, `no timely catch: ${caught}`)
    // A settled rope barely moves; a larger body can take hold a little later in the swing.
    assert.ok(gripSpeed > 25, `the catch must happen during motion, not after settling: ${gripSpeed}`)
    assert.ok(landed, `stopped at ${bot.x}, ${bot.y}`)
  })
}
