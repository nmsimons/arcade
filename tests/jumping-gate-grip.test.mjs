import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

// A drawbridge: two horizontal leaves retract into their decks while the plate is held and
// close toward each other when it is released. The player runs off the far leaf, catches the
// tip of the near one and is carried until the far leaf meets the hanging body.
const LEAF = 210
function drawbridge(mirrored) {
  const level = blankTrial(), W = level.width, top = level.floor - 240
  const span = (x, w) => mirrored ? W - x - w : x
  const leaf = (id, x, flipX) => ({ id, kind: 'gate', orientation: 'horizontal', flipX: flipX !== mirrored, x: span(x, LEAF), y: top, w: LEAF, h: 20, travel: LEAF })
  level.platforms = [{ x: span(0, 400), y: top, w: 400, h: 240 }, { x: span(820, W - 820), y: top, w: W - 820, h: 240 }]
  level.entrance = { x: span(1000, 0), y: top }
  level.mechanisms = [leaf('near', 400, false), leaf('far', 610, true)]
  // The held leaf is stepped first in one arrangement and second in the other.
  if (mirrored) level.mechanisms.reverse()
  level.triggers = [{ x: span(960, 80), y: top, w: 80, targets: ['near', 'far'], mode: 'weight' }]
  return { level, top, toward: mirrored ? 1 : -1, stand: span(880, 0) }
}

for (const mirrored of [false, true]) for (const gap of [220, 240]) for (const wait of [0, 120]) {
  test(`a player hanging from a closing leaf keeps the lip and can pull up when the other leaf meets them (${mirrored ? 'held leaf second' : 'held leaf first'}, gap ${gap}, Up after ${wait} frames)`, () => {
    const { level, top, toward, stand } = drawbridge(mirrored)
    const run = createRun(level), p = run.player; run.started = true
    const step = (input, frames, until) => {
      for (let f = 0; f < frames; f++) { if (until?.()) return true; stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
      return !until
    }
    const leaf = id => run.mechanisms.find(m => m.definition.id === id)
    const tip = id => (id === 'near') !== mirrored ? leaf(id).x + LEAF : leaf(id).x
    const heldIndex = run.terrain.length + run.mechanisms.indexOf(leaf('near'))
    const gripOnLip = () => {
      assert.equal(p.hang?.platform, heldIndex, 'the grip stays on the leaf that was caught')
      assert.ok(Math.abs(p.hang.edgeX - tip('near')) < 1e-6 && Math.abs(p.hang.edgeY - top) < 1e-6,
        `the hands stay on the lip (off by ${(p.hang.edgeX - tip('near')).toFixed(3)})`)
    }

    step({}, 300)
    assert.ok(run.mechanisms.every(m => m.active), 'standing on the plate retracts both leaves')
    step({ move: toward }, 400, () => (p.x - stand) * toward >= 0)
    assert.ok(step({}, 900, () => Math.abs(tip('far') - tip('near')) <= gap), 'the leaves close once the plate is released')
    assert.ok(step({ move: toward }, 300, () => p.hang), 'running off the far leaf catches the near tip')
    gripOnLip()
    assert.ok(run.mechanisms.every(m => m.safetyHold == null), 'both leaves are still closing at the catch')

    // The far leaf arrives at the hanging body and reverses on its safety hold.
    for (let f = 0; f < 600 && leaf('far').safetyHold == null; f++) { stepRun(run, NEUTRAL_INPUT); gripOnLip() }
    assert.notEqual(leaf('far').safetyHold, null, 'the far leaf is stopped by the hanging player')
    for (let f = 0; f < wait; f++) { stepRun(run, NEUTRAL_INPUT); gripOnLip() }

    assert.ok(step({ climb: true }, 240, () => p.grounded), 'Up pulls the player onto the bridge')
    assert.ok(Math.abs(p.y - top) < .01, `the player stands at deck height (y ${p.y.toFixed(2)})`)
  })
}
