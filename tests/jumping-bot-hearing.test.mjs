import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { botLastHeard, hearPlayer, recordPlayerNoise } from '../src/games/jumping/botHearing.ts'
import { botLastSighting } from '../src/games/jumping/repulsorBot.ts'
import { botNavigationRoute } from '../src/games/jumping/botNavigation.ts'

function fixture(wall = false) {
  const file = blankTrial(); file.goal.x = 1700
  file.robots = [{ kind: 'repulsor', x: 600, y: 920, left: 26, right: 1774 }]
  if (wall) file.platforms = [{ x: 400, y: 0, w: 20, h: 920 }]
  return file
}
function movePlayer(run, input, count) {
  for (let i = 0; i < count; i++) {
    stepPlayer(run.player, { ...NEUTRAL_INPUT, ...input }, STEP, run.terrain, run.level.climbables)
    run.activeTime += STEP; recordPlayerNoise(run, STEP); hearPlayer(run, run.robots[0])
  }
}
const tick = (run, input = {}, count = 1) => { for (let i = 0; i < count; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }

test('running produces contact footsteps and an approximate remembered location without a sighting', () => {
  const run = createRun(fixture()), bot = run.robots[0]
  movePlayer(run, { move: 1 }, 100)
  const noise = botLastHeard(bot)
  assert.equal(noise?.kind, 'running'); assert.equal(botLastSighting(bot), undefined)
  assert.ok(noise.uncertainty >= 40)
  const remembered = { ...noise }
  movePlayer(run, { move: -.2, crouch: true }, 150)
  assert.deepEqual(botLastHeard(bot), remembered, 'quiet travel cannot move the remembered sound')
})

test('slow walking and crouching are quiet; a hard landing is audible without running', () => {
  for (const input of [{ move: .25 }, { move: 1, crouch: true }]) {
    const run = createRun(fixture()); movePlayer(run, input, 120)
    assert.equal(botLastHeard(run.robots[0]), undefined)
  }
  const run = createRun(fixture()); movePlayer(run, { jump: true, jumpStrength: 1 }, 1)
  movePlayer(run, {}, 180)
  assert.equal(botLastHeard(run.robots[0])?.kind, 'landing')
})

test('solid walls attenuate noises, and several walls attenuate them further', () => {
  for (const [x, walls, audible] of [[550, [400], true], [850, [400], false], [850, [], true], [550, [300, 400], false]]) {
    const file = fixture(); file.platforms = walls.map(x => ({ x, y: 0, w: 15, h: 920 }))
    file.robots[0].x = x
    const run = createRun(file), bot = run.robots[0]
    run.gadgets.shots++; recordPlayerNoise(run, STEP); hearPlayer(run, bot)
    assert.equal(!!botLastHeard(bot), audible, `${walls.length} walls at distance ${x - 160}`)
  }
})

test('a distant or disabled listener cannot retroactively hear an old event', () => {
  const run = createRun(fixture()), bot = run.robots[0]
  run.gadgets.shots++; recordPlayerNoise(run, STEP)
  run.activeTime += 1; hearPlayer(run, bot)
  assert.equal(botLastHeard(bot), undefined)
})

test('a real gadget shot draws Rbot toward cover, but hearing cannot authorize a blind shot or update sight memory', () => {
  const file = fixture(true); file.props = [{ kind: 'box', gadget: 'repulsor', x: 190, y: 920, size: 40 }]
  const run = createRun(file), bot = run.robots[0]
  tick(run, { interact: true }); tick(run); tick(run, { use: true }); tick(run)
  const noise = botLastHeard(bot)
  assert.equal(noise?.kind, 'gadget'); assert.equal(botLastSighting(bot), undefined)
  assert.equal(bot.seesPlayer, false); assert.equal(bot.phase, 'chase'); assert.equal(bot.shots ?? 0, 0)
  tick(run, {}, 45)
  assert.equal(botNavigationRoute(run, bot).goal.x, noise.x)
  assert.equal(botNavigationRoute(run, bot).goal.y, noise.y)
  tick(run, { move: -.2, crouch: true }, 180)
  assert.deepEqual(botLastHeard(bot), noise)
  assert.equal(botLastSighting(bot), undefined); assert.equal(bot.shots ?? 0, 0)
})

test('known entrance is investigated without manufacturing a confirmed sighting', () => {
  const file = fixture(); file.platforms = [{ x: 1100, y: 0, w: 20, h: 920 }]
  const run = createRun(file), bot = run.robots[0]
  run.player.x = 1400
  tick(run)
  assert.deepEqual(botNavigationRoute(run, bot).goal, file.entrance)
  assert.equal(botLastSighting(bot), undefined); assert.equal(botLastHeard(bot), undefined)
  let checked = false, resumed = false
  for (let frame = 0; frame < 1800 && !resumed; frame++) {
    tick(run); checked ||= Math.abs(bot.x - file.entrance.x) < 70
    const goal = botNavigationRoute(run, bot)?.goal
    resumed ||= checked && goal && Math.abs(goal.x - file.entrance.x) > 60
  }
  assert.ok(checked); assert.ok(resumed, 'an empty entrance gives way to further patrol')
  assert.equal(botLastSighting(bot), undefined)
})
