import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { athletePose, presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

test('bracing at the Ascent cave lip shares geometry validation across the complete read-only pose', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/ascent-chimney-clearance.json', import.meta.url)))
  const p = createPlayer(fixture.start)
  for (let i = 0; i < 55; i++) stepPlayer(p, { ...NEUTRAL_INPUT, ...(i < 30 ? {} : { move: 1, jump: true }) }, STEP, fixture.platforms)
  assert.equal(p.wallBrace?.active, true)
  const before = structuredClone(p)
  for (const solve of [athletePose, presentedAthletePose]) {
    const expected = solve(p)
    let validations = 0
    try {
      for (const shape of fixture.platforms) Object.defineProperty(shape.polygon, 'every', { configurable: true,
        value(...args) { validations++; return Array.prototype.every.apply(this, args) } })
      assert.deepEqual(solve(p), expected)
      assert.ok(validations > 0 && validations <= fixture.platforms.length,
        `each terrain outline is validated at most once, rather than for every limb sample (${validations})`)
    } finally {
      for (const shape of fixture.platforms) delete shape.polygon.every
    }
    assert.deepEqual(p, before, 'posing must preserve physics, terrain and traversal state')
  }
})
