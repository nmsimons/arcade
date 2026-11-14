import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun } from './helpers/jumping-active-run.mjs'
import { drawPuzzleWorld } from '../src/games/jumping/challengeRender.ts'

/** Draw calls in order, each with the fill or stroke style in force. */
function draws(run) {
  const events = [], styles = { fillStyle: '', strokeStyle: '' }
  const ctx = new Proxy({ canvas: { width: 1800, height: 920 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ width: 20 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, {
    get(target, key) { return key in target ? target[key] : key in styles ? styles[key] : (...args) => events.push([key, styles.fillStyle, styles.strokeStyle, ...args]) },
    set(target, key, value) { if (key in styles) styles[key] = value; else target[key] = value; return true },
  })
  drawPuzzleWorld(ctx, run, false, undefined, undefined, [], 'objects', 0, () => {})
  return events
}

test('props pass in front of ladders, and ropes drape over props', () => {
  const level = blankTrial(), floor = level.entrance.y
  level.climbables.ladders = [{ x: 600, top: floor - 300, bottom: floor, side: 1, platform: -1 }]
  level.climbables.ropes = [{ x: 640, y: floor - 400, length: 300, segments: 20 }]
  level.props = [{ kind: 'ball', x: 610, y: floor, size: 60 }, { kind: 'box', x: 680, y: floor, size: 60 }]
  const events = draws(createRun(level))
  const ladder = events.findIndex(([kind, fill]) => kind === 'fillRect' && fill === '#87958b')
  const ball = events.findIndex(([kind, , , x]) => kind === 'arc' && Math.abs(x - 610) < 1)
  const rope = events.findIndex(([kind, , stroke]) => kind === 'stroke' && stroke === '#998263')
  assert.ok(ladder >= 0 && ball >= 0 && rope >= 0, `ladder ${ladder}, ball ${ball}, rope ${rope}`)
  assert.ok(ladder < ball, 'the ladder is drawn before, so behind, the ball')
  assert.ok(ball < rope, 'the rope is drawn after, so over, the ball')
})
