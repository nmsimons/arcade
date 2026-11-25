import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { floatCenter } from '../src/games/jumping/botFloatNavigation.ts'

// Rbot without weight (botFloatNavigation.ts): it skates its beat along its floor, flies to a hunted player and fires
// from a steady hover, and routes around terrain in the open weightless space.

/** A weightless hall 2000 x 1200 (floor at 1200) with Rbot's beat on its floor; the player starts walled off at the left. */
function hall({ platforms = [], robot = {}, hidden = true } = {}) {
  const level = parseLevel({ ...blankTrial(), width: 2000, height: 1200, floor: 1200, entrance: { x: 120, y: 1200 }, goal: { x: 1900, y: 1200 },
    platforms: [...hidden ? [{ x: 240, y: 0, w: 40, h: 1200 }] : [], ...platforms],
    robots: [{ kind: 'repulsor', x: 1300, y: 1200, left: 500, right: 1700, ...robot }],
    gravityPlates: [{ id: 'z', x: 300, y: 0, w: 1700, h: 1200, gravity: 0, power: 'always' }] })
  return createRun(level)
}
const seconds = (run, count, each) => { for (let i = 0; i < count * 120; i++) { stepRun(run, NEUTRAL_INPUT); each?.(run.robots[0].actor, i) } }

test('Rbot skates its beat along its floor without weight, end to end, without lifting off or turning back and forth', () => {
  const run = hall(), bot = run.robots[0]
  let grounded = 0, ticks = 0, least = Infinity, most = -Infinity, turns = 0, facing = bot.actor.facing, highest = Infinity
  seconds(run, 30, actor => {
    ticks++; if (actor.grounded && !actor.wall && !actor.inverted) grounded++
    least = Math.min(least, actor.x); most = Math.max(most, actor.x); highest = Math.min(highest, actor.y)
    if (actor.facing !== facing) { turns++; facing = actor.facing }
  })
  assert.equal(bot.phase, 'patrol')
  assert.ok(grounded / ticks > .97, `on its feet on the floor ${(100 * grounded / ticks).toFixed(1)}% of the time`)
  assert.ok(highest > 1190, `it never lifts off (highest feet ${highest.toFixed(0)})`)
  assert.ok(least < 600 && most > 1600, `it covers its beat (${least.toFixed(0)} to ${most.toFixed(0)})`)
  assert.ok(turns >= 2 && turns <= 8, `it turns at the ends of its beat, not on the way (${turns} turns)`)
})

test('Rbot floating off its floor flies back around a shelf in the way, lands and takes up its beat', () => {
  // A shelf over the beat, wider than it, with Rbot above it: the way home is around an end.
  const run = hall({ platforms: [{ x: 420, y: 700, w: 1400, h: 40 }] }), bot = run.robots[0], actor = bot.actor
  Object.assign(actor, { x: 1100, y: 500, vx: 0, vy: 0, grounded: false }); bot.x = actor.x; bot.y = actor.y
  let home
  seconds(run, 20, (actor, i) => { if (home === undefined && actor.grounded && actor.y > 1190 && !actor.wall && !actor.inverted) home = i / 120 })
  assert.ok(home !== undefined && home < 15, `back on its floor after ${home?.toFixed(1)} s`)
  assert.ok(actor.y > 1190 && actor.grounded, 'and still there, patrolling')
})

test('Rbot hunts a floating player: it holds off at a standoff, fires from a steady hover and does not come to rest on them', () => {
  const run = hall({ hidden: false }), bot = run.robots[0], player = run.player
  Object.assign(player, { x: 900, y: 760 })
  let firedFloating = 0, closest = Infinity, riding = 0
  seconds(run, 12, actor => {
    const middle = floatCenter(actor)
    // The standoff is a weightless one: a shot can knock the player out of the field onto ordinary floor, where the
    // hunter closes in to shove like anywhere else.
    if ((player.weightless ?? 0) > 0) closest = Math.min(closest, Math.hypot(middle.x - player.x, middle.y - (player.y - 31)))
    if (actor.contacts?.support?.collider.id === 'player') riding++
    if (bot.phase === 'recover' && bot.time === 0 && !actor.grounded) firedFloating++
  })
  assert.ok((bot.shots ?? 0) >= 2, `it fired ${bot.shots ?? 0} shots`)
  assert.ok(firedFloating >= 1, 'at least one from a hover, off any surface')
  assert.equal(riding, 0, 'it never stands on the player')
  assert.ok(closest > 80, `it keeps its distance (closest ${closest.toFixed(0)})`)
})
