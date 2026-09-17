import assert from 'node:assert/strict'
import test from 'node:test'
import { drawExpeditionObject } from '../src/games/hardVacuum/objectModels.ts'

// Record local projected geometry, ignoring only the canvas translation.
const geometry = (kind, pos, time, variant = 0) => {
  const paths = []
  const context = {
    save() {}, restore() {}, translate() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {},
    moveTo(x, y) { paths.push([x, y]) }, lineTo(x, y) { paths.push([x, y]) },
  }
  drawExpeditionObject(context, kind, pos, { time, variant, active: true })
  return paths
}

test('towing translates cargo without changing its projected rotation or shape', () => {
  for (const kind of ['radiation', 'cache', 'core']) {
    for (let variant = 0; variant < (kind === 'cache' ? 4 : 1); variant++) {
      for (const time of [0, 1, 17.4, 120]) {
        const initial = geometry(kind, { x: 100, y: 200 }, time, variant)
        for (const pos of [{ x: 101, y: 201 }, { x: 350, y: 820 }, { x: 1800, y: 1200 }]) {
          assert.deepEqual(geometry(kind, pos, time, variant), initial, `${kind} must not rotate when its position changes`)
        }
      }
    }
  }
})

test('cargo retains its slow idle tumble and cache variants retain distinct poses', () => {
  const pos = { x: 1500, y: 1100 }
  for (const kind of ['radiation', 'cache', 'core']) {
    const start = geometry(kind, pos, 0)
    const next = geometry(kind, pos, 1 / 60)
    assert.notDeepEqual(next, start)
    assert.equal(next.length, start.length)
    const motion = Math.max(...next.map((p, i) => Math.hypot(p[0] - start[i][0], p[1] - start[i][1])))
    assert.ok(motion < 0.5, `${kind} should move smoothly between frames, got ${motion}px`)
    assert.notDeepEqual(geometry(kind, pos, 2), start)
  }
  assert.notDeepEqual(geometry('cache', pos, 0, 0), geometry('cache', pos, 0, 1))
})
