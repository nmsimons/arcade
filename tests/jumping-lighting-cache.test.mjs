import test from 'node:test'
import assert from 'node:assert/strict'
import { RestingCasters } from '../src/games/jumping/lightingCache.ts'

const box = (x = 100) => [{ x, y: 100, w: 30, h: 30 }]
const settle = (cache, groups) => {
  for (let i = 0; i < 3; i++) cache.update(structuredClone(groups))
  return cache.update(structuredClone(groups))
}

test('resting silhouettes retain their cache while another caster moves, and wake immediately', () => {
  const cache = new RestingCasters(), groups = [box(), box(200)]
  const initial = settle(cache, groups)
  assert.equal(initial.fixed.length, 2)
  const awake = cache.update([box(), box(200.00001)])
  assert.equal(awake.fixed.length, 1)
  assert.equal(awake.fixed[0], initial.fixed[0])
  assert.equal(awake.moving[0][0].x, 200.00001, 'even subpixel motion is current')
  for (let x = 201; x < 215; x++) assert.equal(cache.update([box(), box(x)]).fixed, awake.fixed)
  const rested = settle(cache, [box(), box(214)])
  assert.equal(rested.fixed.length, 2)
  assert.equal(rested.moving.length, 0)
  assert.equal(cache.update([]).fixed.length, 0, 'removed objects leave no cached shadows')
})

test('shape, opacity and joined-boundary changes invalidate resting silhouettes', () => {
  const boundary = [[[100, 100], [130, 100]]]
  const group = Object.assign(box(), { boundary, opacity: 1 })
  for (const change of [
    group => { group[0].w += 1 },
    group => { group[0].polygon = [[0, 0], [30, 0], [20, 30]] },
    group => { group[0].profile = [[0, 0], [30, 5]] },
    group => { group.opacity = .5 },
    group => { group.fadingShadow = true },
    group => { group.boundary[0][1][0] += .01 },
  ]) {
    const cache = new RestingCasters()
    settle(cache, [group])
    const changed = structuredClone(group); change(changed)
    const next = cache.update([changed])
    assert.equal(next.fixed.length, 0)
    assert.deepEqual(next.moving, [changed])
  }
})

test('player poses and fading casters remain live; reset discards resting state', () => {
  const cache = new RestingCasters()
  const player = Object.assign(box(), { player: true, opacity: 1 })
  const fading = Object.assign(box(200), { opacity: .8 })
  const result = settle(cache, [player, fading, box(300)])
  assert.equal(result.fixed.length, 1)
  assert.equal(result.moving.length, 2)
  cache.reset()
  assert.equal(cache.update([box(300)]).fixed.length, 0)
})
