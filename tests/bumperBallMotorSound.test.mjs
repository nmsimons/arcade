import assert from 'node:assert/strict'
import test from 'node:test'
import { motorTone, opponentMotorMix } from '../src/games/bumperBall/motorSound.ts'

test('motor revs respond to speed, load and boost, with a quiet coast and silent rest', () => {
  const idle = motorTone({ speed: 0, throttle: 0, boosting: false })
  const pulling = motorTone({ speed: 0, throttle: 1, boosting: false })
  const cruising = motorTone({ speed: 180, throttle: 1, boosting: false })
  const coasting = motorTone({ speed: 180, throttle: 0, boosting: false })
  const boosting = motorTone({ speed: 350, throttle: 1, boosting: true })
  assert.equal(idle.volume, 0)
  assert.ok(pulling.frequency > idle.frequency)
  assert.ok(cruising.frequency > pulling.frequency)
  assert.ok(boosting.frequency > cruising.frequency)
  assert.ok(coasting.volume < cruising.volume / 3)
  assert.deepEqual(motorTone({ speed: -180, throttle: 1, boosting: false }), cruising)
  const extreme = motorTone({ speed: 100000, throttle: 50, boosting: true })
  assert.ok(extreme.frequency < 200 && extreme.volume < 0.04, 'boost cannot become a loud, high-pitched drone')
})

test('opponent is quieter than the player, fades with distance and follows screen position', () => {
  const near = opponentMotorMix(20, 0)
  const far = opponentMotorMix(1000, 0)
  assert.ok(near.volume < 0.3)
  assert.ok(far.volume < near.volume / 20)
  assert.equal(opponentMotorMix(0, 1000).volume, far.volume)
  assert.equal(opponentMotorMix(-1000, 0).pan, -far.pan)
  assert.ok(Math.abs(far.pan) < 1)
})
