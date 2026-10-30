import test from 'node:test'
import assert from 'node:assert/strict'
import { ANDROID_HAND_SIZE, HAND_CLEARANCE_REACH, handGeometry, traceAndroidHand } from '../src/games/jumping/androidHand.ts'
import { readFileSync } from 'node:fs'
import { createPlayer } from '../src/games/jumping/model.ts'
import { athleteCasters } from '../src/games/jumping/athleteShadow.ts'
import { handOutline } from '../src/games/jumping/athlete.ts'

/** Sample the drawn quadratic curves, including the thumb's concave notch. */
function outline(limb, scale) {
  const points = []; let previous, start
  const path = {
    moveTo(x, y) { start = previous = [x, y]; points.push(previous) },
    lineTo(x, y) { previous = [x, y]; points.push(previous) },
    quadraticCurveTo(cx, cy, x, y) {
      const [a, b] = previous
      for (let i = 1; i <= 32; i++) {
        const t = i / 32, s = 1 - t
        points.push([s * s * a + 2 * s * t * cx + t * t * x, s * s * b + 2 * s * t * cy + t * t * y])
      }
      previous = [x, y]
    },
    closePath() { points.push(start) },
  }
  traceAndroidHand(path, limb, scale)
  return points
}

test('112% hands fit the contact outline and swimming clearance in every orientation', () => {
  for (const angle of [0, .3, Math.PI / 2, 2.2, Math.PI, -Math.PI / 2]) for (const scale of [.6, 1]) for (const handOpen of [0, .45, 1]) {
    const limb = { root: [3, 7], joint: [10, 3], end: [14, 11], hand: [16, 10], handAngle: angle, handOpen }
    const before = structuredClone(limb), { palm } = handGeometry(limb), points = outline(limb, scale)
    const boundary = handOutline(limb)
    for (const [x, y] of points) {
      const dx = (x - palm[0]) / scale, dy = (y - palm[1]) / scale
      const u = dx * Math.cos(angle) + dy * Math.sin(angle), v = -dx * Math.sin(angle) + dy * Math.cos(angle)
      assert.ok(Math.hypot(u, v) <= HAND_CLEARANCE_REACH, 'the approved larger hand fits the fast swimming clearance circle')
      assert.ok(Math.abs(v) <= 1.6, 'the palm keeps the existing contact depth')
      const px = palm[0] + (x - palm[0]) / scale, py = palm[1] + (y - palm[1]) / scale
      assert.ok(boundary.every((a, i) => {
        const b = boundary[(i + 1) % boundary.length]
        return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) >= -1e-8
      }), 'the actual contact outline contains the complete drawn palm and thumb')
    }
    const area = points.reduce((sum, [x, y], i) => {
      const b = points[(i + 1) % points.length]; return sum + x * b[1] - y * b[0]
    }, 0)
    assert.ok(area < 0, 'the palm shares the joint artwork winding, so wrist overlap cannot punch a hole')
    assert.deepEqual(limb, before, 'drawing leaves all wrist and contact coordinates unchanged')
  }
})

test('relaxed hands retain their native center while explicit working palms retain their anchors', () => {
  assert.equal(ANDROID_HAND_SIZE, 1.12)
  const arm = { root: [0, 0], joint: [0, 10], end: [9, 10] }
  assert.deepEqual(handGeometry(arm), { palm: [10.4, 10], angle: 0 })
  assert.deepEqual(handGeometry({ ...arm, hand: [12, 8], handAngle: 1.2 }), { palm: [12, 8], angle: 1.2 })
})

test('centered rope palms do not produce zero-area wrist shadow polygons', () => {
  const baseline = JSON.parse(readFileSync(new URL('../dev/model-review/baseline/index.json', import.meta.url), 'utf8'))
  const clip = baseline.clips.rope, { pose } = clip.samples[clip.poster]
  assert.deepEqual(pose.frontArm.hand, pose.frontArm.end, 'exercise a palm centered on its wrist')
  for (const facing of [-1, 1]) for (const inverted of [false, true]) {
    const p = createPlayer({ x: 500, y: 600 }); p.facing = facing; p.inverted = inverted
    for (const shape of athleteCasters(p, pose)) {
      assert.ok(shape.w > .01 && shape.h > .01, 'a shadow caster has two real dimensions')
      const area = shape.polygon.reduce((sum, a, i) => {
        const b = shape.polygon[(i + 1) % shape.polygon.length]; return sum + a[0] * b[1] - b[0] * a[1]
      }, 0)
      assert.ok(Math.abs(area) > .01, 'a wrist bridge never becomes a degenerate polygon')
    }
  }
})
