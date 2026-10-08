import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose, withAthletePose } from '../src/games/jumping/athlete.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

test('a render shares the current rig without retaining it across simulation, nesting or exceptions', () => {
  const p = createPlayer({ x: 500, y: 600 }), floor = [{ x: 0, y: 600, w: 2000, h: 100 }]
  const before = JSON.stringify(p), expected = athletePose(p)
  let first
  assert.equal(withAthletePose(p, () => {
    first = athletePose(p)
    assert.deepEqual(first, expected)
    assert.strictEqual(athletePose(p), first)
    withAthletePose(p, () => assert.strictEqual(athletePose(p), first))
    assert.strictEqual(athletePose(p), first, 'nested drawing retains the outer scope')
    return 'painted'
  }), 'painted')
  assert.equal(JSON.stringify(p), before, 'rendering is read-only')
  assert.notStrictEqual(athletePose(p), first, 'ordinary pose queries remain uncached')
  for (let i = 0; i < 60; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, floor)
  withAthletePose(p, () => {
    const current = athletePose(p)
    assert.notDeepEqual(current, first, 'simulation changes appear in the next render')
    assert.strictEqual(athletePose(p), current)
  })
  let failed
  assert.throws(() => withAthletePose(p, () => { failed = athletePose(p); throw new Error('paint failed') }), /paint failed/)
  assert.notStrictEqual(athletePose(p), failed, 'a failed render also releases its snapshot')
})

test('an inverted render shares normalized geometry and restores the gravity state', () => {
  const p = createPlayer({ x: 500, y: 600 })
  mirrorPlayerState(p); p.inverted = true
  const before = JSON.stringify(p), expected = athletePose(p)
  withAthletePose(p, () => {
    const pose = athletePose(p)
    assert.deepEqual(pose, expected)
    assert.strictEqual(athletePose(p), pose)
    assert.equal(JSON.stringify(p), before)
  })
  assert.equal(JSON.stringify(p), before)
})
