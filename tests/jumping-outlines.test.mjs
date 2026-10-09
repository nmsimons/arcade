import test from 'node:test'
import assert from 'node:assert/strict'
import { platformOutline, polygonPoints } from '../src/games/jumping/geometry.ts'
import { boxShape, ballShape } from '../src/games/jumping/propGeometry.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'

const shapes = [
  { x: 300, y: 450, w: 400, h: 250 },
  { x: 300, y: 450, w: 400, h: 250, profile: [[0,100],[160,60],[400,0]] },
  { x: 300, y: 450, w: 80, h: 70, polygon: [[0,35],[32,35],[32,0],[48,0],[48,35],[80,35],[80,70],[0,70]] },
  { x: 300, y: 450, w: 80, h: 70, polygon: [[0,0],[0,70],[80,70],[80,0],[0,0]] },
  boxShape({ x: 500, y: 650, size: 80, angle: .25 }),
  ballShape({ x: 500, y: 650, size: 80 }),
]

test('read-only outlines equal the original geometry and invalidate every in-place geometry edit', () => {
  for (const definition of [...shapes, ...shapes.map(mirrorPlatform)]) {
    const shape = structuredClone(definition)
    let previous = platformOutline(shape)
    assert.deepEqual(previous, polygonPoints(shape))
    assert.strictEqual(platformOutline(shape), previous, 'unchanged query reuses the validated outline')
    for (const edit of [
      b => { b.x += .75 }, b => { b.y -= 1.25 }, b => { b.w += 2 }, b => { b.h += 3 },
      b => { if (b.polygon) b.polygon[0][0] += .25; else if (b.profile) b.profile[0][1] += .25; else b.polygon = [[0,0],[b.w,0],[b.w,b.h],[0,b.h]] },
      b => { if (b.polygon) b.polygon = b.polygon.map(([x,y]) => [x+.5,y]); else b.profile = [[0,1],[b.w,5]] },
    ]) {
      const before = structuredClone(previous)
      edit(shape)
      const next = platformOutline(shape)
      assert.notStrictEqual(next, previous, 'changed geometry receives a fresh outline')
      assert.deepEqual(next, polygonPoints(shape), 'the exact original coordinates, winding and edge filtering remain')
      assert.deepEqual(previous, before, 'an earlier snapshot is not edited in place')
      assert.strictEqual(platformOutline(shape), next)
      previous = next
    }
  }
})

test('authoring still receives independent editable arrays without exposing the contact outline', () => {
  for (const shape of shapes) {
    const expected = polygonPoints(shape), contact = platformOutline(shape), authored = polygonPoints(shape)
    authored[0][0] += 100
    authored.reverse(); authored.push([999,999])
    assert.deepEqual(platformOutline(shape), expected)
    assert.strictEqual(platformOutline(shape), contact)
    assert.deepEqual(polygonPoints(shape), expected)
  }
})
