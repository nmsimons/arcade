import test from 'node:test'
import assert from 'node:assert/strict'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { drawGravityDust, drawGravityRegion, MAX_GRAVITY_DUST } from '../src/games/jumping/gravityRender.ts'

const plate = (patch = {}) => ({ id: 'dust', x: 0, y: 0, w: 1200, h: 6000, gravity: -1, power: 'always', ...patch })
const fieldFor = plates => {
  const field = createGravityField(); updateGravityField(field, plates, new Map(), true); return field
}
function canvas(transform = { a: 1, d: 1, e: 0, f: 0 }) {
  const rectangles = [], outlines = [], stack = []
  return { canvas: { width: 1280, height: 800 }, globalAlpha: 1, rectangles, outlines,
    getTransform: () => transform,
    save() { stack.push({ globalAlpha: this.globalAlpha, fillStyle: this.fillStyle }) },
    restore() { Object.assign(this, stack.pop()) },
    fillRect(...args) { rectangles.push({ args, alpha: this.globalAlpha }) },
    strokeRect(...args) { outlines.push(args) }, setLineDash() {},
  }
}
const draw = (plates, time = 0, transform) => {
  const ctx = canvas(transform); drawGravityDust(ctx, plates, fieldFor(plates), time); return ctx.rectangles
}

test('the field has no fill, outline or grid during play, but remains outlined for editing', () => {
  const ctx = canvas(), p = plate()
  drawGravityRegion(ctx, p, true)
  assert.deepEqual(ctx.rectangles, []); assert.deepEqual(ctx.outlines, [])
  drawGravityRegion(ctx, p, false, true)
  assert.equal(ctx.outlines.length, 1); assert.deepEqual(ctx.rectangles, [])
})

test('dust stays bounded at maximum room/device sizes, disappears offscreen and leaves normal gravity invisible', () => {
  const plates = Array.from({ length: 16 }, (_, i) => plate({ id: `dust-${i}`, w: 20000 }))
  for (const transform of [{ a: 1, d: 1, e: 0, f: 0 }, { a: .05, d: .05, e: 0, f: 0 }]) {
    const dust = draw(plates, 5, transform)
    assert.ok(dust.length > 0 && dust.length <= MAX_GRAVITY_DUST)
    assert.ok(dust.every(d => d.alpha > 0 && d.alpha <= .85))
    assert.ok(dust.every(d => d.args.every(Number.isFinite)))
  }
  assert.equal(draw([plate({ x: 1500 })]).length, 0)
  assert.equal(draw([plate({ gravity: 1 })]).length, 0)
  assert.equal(draw([plate({ power: 'switched' })]).length, 0)
  const ctx = canvas(), field = fieldFor(plates)
  updateGravityField(field, plates, new Map(), false)
  drawGravityDust(ctx, plates, field, 5)
  assert.equal(ctx.rectangles.length, 0)
})

test('procedural dust is repeatable at the same time and follows the local gravity direction', () => {
  for (const gravity of [-1, 3]) {
    const plates = [plate({ gravity })], before = draw(plates), after = draw(plates, .1)
    assert.deepEqual(draw(plates), before)
    const tile = d => `${Math.floor((d.args[0] + d.args[2] / 2) / 40)}:${Math.floor((d.args[1] + d.args[3] / 2) / 120)}`
    const previous = new Map(before.map(d => [tile(d), d]))
    let moved = 0
    for (const d of after) {
      const initial = previous.get(tile(d))
      if (!initial || Math.abs(d.args[1] - initial.args[1]) > 20) continue
      assert.ok((d.args[1] - initial.args[1]) * gravity > 0)
      moved++
    }
    assert.ok(moved > 4)
  }
  const dust = draw([plate({ id: 'up', gravity: -1 }), plate({ id: 'down', gravity: 1 })], 2)
  assert.ok(dust.length > 0, 'cancelling fields show floating dust instead of directional streaks')
  assert.ok(dust.every(d => Math.abs(d.args[2] - d.args[3]) < 1e-7))
})

test('dust remains legible when zoomed out and small fields have no blank phase', () => {
  const transform = { a: .42, d: .42, e: 0, f: 0 }
  const dust = draw([plate()], 5, transform)
  assert.ok(dust.filter(d => d.alpha >= .6 && d.args[2] * transform.a >= 2.5).length >= 6,
    'several motes retain visible contrast and at least 2.5 raster pixels of width')
  for (let time = 0; time < 10; time += .1) {
    const tiny = draw([plate({ w: 40, h: 40 })], time)
    assert.ok(tiny.some(d => d.alpha >= .15), `small field has visible dust at ${time}`)
  }
  const ctx = canvas(), plates = [plate()], exposures = []
  drawGravityDust(ctx, plates, fieldFor(plates), 5, (_ctx, exposure, draw) => { exposures.push(exposure); draw() }, true)
  assert.deepEqual(exposures, [.65], 'night dust uses the existing readability pass')
})
