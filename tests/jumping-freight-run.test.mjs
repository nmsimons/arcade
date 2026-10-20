import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'

// Freight Run is retired from the built-in catalog; keep its route coverage on
// the archived map without restoring it to the game or the built-in medal audit.
const level = () => readLevelAsset('freight-run.json')
const recordings = JSON.parse(readFileSync(new URL('fixtures/jumping-freight-routes.json', import.meta.url))).runs
const flow = recordings.find(r => r.route === 'flow')
const alternatives = recordings.filter(r => r !== flow)

test('Freight Run grav emitters sit on usable floors', () => {
  const map = level()
  for (const plate of map.gravityPlates.filter(p => p.effect !== 'water')) {
    for (const x of [plate.x + 4, plate.x + plate.w / 2, plate.x + plate.w - 4])
      assert.ok(groundAt(map.platforms, x, plate.y + plate.h, .01), `${plate.name}: emitter must meet its boarding floor`)
  }
})

test('missing the washhouse swing leaves a walkable roof and usable access hatch', () => {
  const run = createRun(level())
  approach: for (const {frames, input} of flow.trace) for (let f = 0; f < frames; f++) {
    stepRun(run, {...NEUTRAL_INPUT, ...input})
    if (run.player.grounded && run.player.x >= 2850 && run.player.y === 650) break approach
  }
  for (let f = 0; f < 360 && run.player.x < 3420; f++) stepRun(run, {...NEUTRAL_INPUT, move: 1})
  assert.equal(run.player.y, 930, 'the recessed roof catches a missed jump')
  assert.equal(run.player.grounded, true)
  let climbed = false
  for (let f = 0; f < 600; f++) {
    stepRun(run, {...NEUTRAL_INPUT, move: 1, climb: true})
    if (run.player.climbing?.kind === 'ladder') climbed = true
    if (run.player.grounded && run.player.y === 650) break
  }
  assert.equal(climbed, true)
  assert.equal(run.player.y, 650, 'the hatch returns to the express roof')
  assert.equal(run.player.grounded, true)
})

for (const [name, recording, releaseAdjustment] of [['flow', flow, 0], ['early releases', flow, -2], ['late releases', flow, 2], ...alternatives.map(r => [r.route, r, 0])]) test(`Freight Run ${name} completes its advertised interactions from a fresh start`, () => {
  const run = createRun(level())
  const seen = new Set()
  const ropes = new Set(), releases = []
  const fast = ['flow', 'early releases', 'late releases'].includes(name)
  const step = input => {
    if (!releaseAdjustment) assert.equal(run.finished, false, 'recordings end at completion')
    assert.equal('jumpStrength' in input, false, 'use current tap/hold controls')
    if (fast) {
      assert.equal(input.move, 1, 'hold Right continuously')
      assert.ok(Object.keys(input).every(key => key === 'move' || key === 'jump'), 'the fast line needs only Right and Jump')
    }
    const previousX = run.player.x
    const previousRope = run.player.climbing?.kind === 'rope' ? run.player.climbing.index : null
    stepRun(run, {...NEUTRAL_INPUT, ...input})
    const p = run.player
    if (p.climbing?.kind === 'rope') ropes.add(p.climbing.index)
    if (previousRope !== null && p.climbing?.kind !== 'rope') releases.push(p.vx)
    if (fast && p.x > 330 && !run.exit && !run.finished) {
      assert.ok(p.x >= previousX - .01, `keep moving forward through catches and landings: ${JSON.stringify({x:p.x,y:p.y,previousX,time:run.activeTime})}`)
      assert.equal(p.hang, null, 'no mandatory ledge catch')
      assert.equal(p.mantle, null, 'no mandatory pull-up or automatic step')
      assert.notEqual(p.climbing?.kind, 'ladder')
      assert.ok(!p.waterMotion, 'the fast line stays above the recovery pool')
      assert.ok(p.vx >= (p.climbing?.kind === 'rope' ? 200 : 390), 'retain running speed between swings')
    }
    if (p.grounded && p.x > 3560 && p.x < 3860 && Math.abs(p.y - 510) < 1) seen.add('roof landing')
    if (p.grounded && p.x > 5230 && p.x < 5460 && Math.abs(p.y - 500) < 1) seen.add('yard roof')
    if (p.waterMotion) seen.add('swimming')
    if (p.climbing?.kind === 'ladder' && Math.abs(p.x - 3440) < 1 || p.hang && Math.abs(p.hang.edgeX - 3460) < 1 || p.mantle && p.x > 3440 && p.x < 3500 && p.y > 1350) seen.add('pool exit')
    if (p.crouching && p.x > 1500 && p.x < 1650 && Math.abs(p.y - 1580) < 1) seen.add('low tunnel')
    if (p.x > 3480 && p.x < 3700 && p.grounded && Math.abs(p.y - 1430) < 1) seen.add('pool bank')
    if (p.x > 6000 && p.x < 6140 && p.gravity < 0 && p.y < 1100 && p.vy < -500) seen.add('grav lift')
    if (p.climbing?.kind === 'ladder' && Math.abs(p.x - 6580) < 1 && p.y < 700) seen.add('exit ladder')
    if (p.grounded && p.x > 2700 && p.x < 3350 && Math.abs(p.y - 1250) < 1) seen.add('middle bridge')
    if (p.grounded && p.x > 5200 && p.x < 5750 && Math.abs(p.y - 1250) < 1) seen.add('middle survey')
    if (run.empRemaining > 0) seen.add('tea break')
    if (p.x > 4540 && p.x < 4660 && run.empRemaining > 0 && p.gravity > 1000) seen.add('sorter on break')
    if (name === 'middle' && p.x > 4540 && p.x < 4660 && p.gravity < 0 && p.vy < -100) {
      assert.equal(input.jump, undefined, 'the sorter itself launches a running parcel')
      seen.add('automatic sorter')
    }
    if (p.grounded && p.x > 4780 && p.x < 5060 && Math.abs(p.y - 1220) < 1) seen.add('sorter receiving tray')
    if (!fast && p.x > 1000 && p.x < 5750) assert.ok(p.y > (name.startsWith('low') ? 1350 : 980), 'remain on the advertised lower storey')
  }
  for (const {frames, input} of recording.trace) {
    const adjusted = frames + (run.player.climbing?.kind === 'rope' && !input.jump ? releaseAdjustment : 0)
    for (let f = 0; f < adjusted && !run.finished; f++) step(input)
  }
  // Perturbing releases can shift the final doorway animation by a few frames.
  if (releaseAdjustment) for (let f = 0; f < 120 && !run.finished; f++) step({move: 1, jump: true})
  assert.equal(run.finished, true)
  if (!releaseAdjustment) {
    assert.ok(Math.abs(run.elapsed - recording.elapsed) < STEP)
    assert.ok(Math.abs(run.activeTime - recording.activeTime) < STEP)
  }
  assert.equal(run.coinsCollected, recording.coins)
  if (fast) {
    assert.equal(run.medal, 'Gold')
    assert.equal(run.triggers[0].active, false, 'the upper route bypasses the gantry')
    assert.deepEqual([...ropes], [0, 1, 2], 'link the two gantry swings and the reservoir swing')
    assert.equal(releases.length, 3)
    assert.ok(releases.every(speed => speed > 390), 'all three swing releases preserve forward speed')
    assert.ok(seen.has('roof landing'), 'the reservoir swing lands directly on the roof')
    assert.ok(seen.has('yard roof'))
  } else {
    assert.equal(ropes.size, 0)
    assert.equal(run.triggers[1].active, true, 'six coins power the exit grav lift')
    if (name.startsWith('middle')) {
      for (const action of ['middle bridge', 'middle survey', 'sorter receiving tray', 'grav lift']) assert.ok(seen.has(action), action)
      for (const action of name === 'middle' ? ['automatic sorter'] : ['tea break', 'sorter on break']) assert.ok(seen.has(action), action)
    }
    else for (const action of ['swimming', 'pool exit', 'low tunnel', 'pool bank', name === 'low-ladder' ? 'exit ladder' : 'grav lift']) assert.ok(seen.has(action), action)
  }
  assert.equal(run.player.y, 500, 'every route finishes at the elevated receiving dock')
})
