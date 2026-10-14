import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField, playerFloatDrag, propFloatDrag, playerGravity, propGravity } from '../src/games/jumping/gravity.ts'

const plate = patch => ({ id: 'lift', x: 200, y: 400, w: 1000, h: 520, gravity: -1, power: 'always', ...patch })
function fieldFor(plates) {
  const field = createGravityField()
  updateGravityField(field, plates, new Map(), true)
  return field
}

test('dry gravity boundaries add no surface damping, including with water elsewhere in the level', () => {
  for (const elsewhere of [false, true]) for (const gravity of [-3, -1, 0, 1, 3]) {
    const field = fieldFor([plate({ gravity }), ...(elsewhere ? [plate({ id: 'water', x: 1400, w: 200, effect: 'water' })] : [])])
    for (let y = 350; y <= 510; y += 2) {
      const p = createPlayer({ x: 500, y })
      assert.equal(playerFloatDrag(field, p), 0, `dry player boundary at ${y}`)
      for (const kind of ['box', 'ball']) for (const angle of [0, .4]) {
        const b = { kind, x: 500, y, size: 80, angle }
        assert.equal(propFloatDrag(field, b), 0, `dry ${kind} boundary at ${y}`)
      }
    }
  }
})

test('water keeps its existing restoring-gradient damping for players, balls and rotated boxes', () => {
  for (const mixed of [false, true]) {
    const field = fieldFor([plate({ effect: 'water' }), ...(mixed ? [plate({ id: 'dry', gravity: -2 })] : [])])
    const expected = (above, below) => (above - below) / 2 > .01 ? 2 * Math.sqrt((above - below) / 2) : 0
    for (let y = 400; y <= 480; y += 4) {
      const p = createPlayer({ x: 500, y })
      assert.equal(playerFloatDrag(field, p), expected(playerGravity(field, p, -1), playerGravity(field, p, 1)))
      for (const kind of ['box', 'ball']) for (const angle of [0, .4]) {
        const b = { kind, x: 500, y, size: 80, angle }
        assert.equal(propFloatDrag(field, b), expected(propGravity(field, b, -1), propGravity(field, b, 1)))
      }
    }
  }
})

for (const dt of [STEP, 1 / 30]) for (const kind of ['player', 'box', 'ball']) {
  test(`${kind} carries lift momentum above a dry field, with stronger fields building more speed: dt=${dt}`, () => {
    let previousSpeed = 0
    for (const strength of [1, 2, 3]) {
      const lift = plate({ gravity: -strength }), field = fieldFor([lift])
      let body, advance, acceleration
      if (kind === 'player') {
        body = createPlayer({ x: 500, y: 570 }); body.grounded = false; body.coyote = 0
        advance = () => stepPlayer(body, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, field)
        acceleration = () => playerGravity(field, body)
      } else {
        const run = createRun({ ...blankTrial(), props: [{ kind, x: 500, y: 570, size: 80 }], gravityPlates: [lift] })
        body = run.props[0]; if (kind === 'box') body.angle = .4
        advance = () => stepRun(run, NEUTRAL_INPUT, dt)
        acceleration = () => propGravity(run.gravityField, body)
      }
      let exited = false
      for (let frame = 0; frame < Math.ceil(3 / dt); frame++) {
        advance()
        if (body.y < lift.y && acceleration() === TUNING.gravity) {
          const speed = -body.vy, exitY = body.y
          assert.ok(speed > 300, `${kind} exits with upward momentum: ${speed}`)
          assert.ok(speed > previousSpeed + 70, `strength ${strength} builds more exit speed: ${speed} after ${previousSpeed}`)
          previousSpeed = speed
          const angle = body.angle
          for (let tick = 0; tick < Math.round(.1 / dt); tick++) advance()
          assert.ok(body.y < exitY - 15, 'the body continues beyond the field before ordinary gravity turns it')
          assert.ok(body.vy < -100, 'leaving the field does not zero velocity')
          if (kind === 'box') assert.ok(Math.abs(body.angle - angle) < 1e-8, 'an off-center field boundary does not invent torque')
          assert.equal(body.grounded, false)
          exited = true; break
        }
      }
      assert.ok(exited, `${kind} passes through the upper boundary instead of settling there`)
    }
  })
}
