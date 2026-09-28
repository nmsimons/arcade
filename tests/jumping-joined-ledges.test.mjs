import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { ledgeObstacles } from '../src/games/jumping/terrainLedges.ts'

function scene(side, polygon = false, reverse = false, gap = 0) {
  const cap = { x: side === -1 ? 0 : 520, y: 460, w: 520, h: 20 }
  const post = { x: side === -1 ? 500 : 520, y: 480 + gap, w: 20, h: 220 }
  const terrain = [cap, post]
  if (polygon) for (const b of terrain) b.polygon = [[0,0],[b.w,0],[b.w,b.h],[0,b.h]].reverse()
  if (reverse) terrain.reverse()
  const p = createPlayer({ x: 520 - side * 22, y: 600 })
  Object.assign(p, { grounded: false, facing: side })
  return { p, terrain, world: { ladders: [], ropes: [{ x: 520, y: 460, length: 180, segments: 23 }] } }
}
function tick(s, input = {}) {
  stepPlayer(s.p, { ...NEUTRAL_INPUT, ...input }, STEP, s.terrain, s.world)
  if (!s.p.mantle) assert.ok(s.terrain.every(b => !bodyIntersects(s.p.x, s.p.y, b)), 'ordinary hull remains outside terrain')
}

test('rope pull-ups climb a thin cap on a separate flush wall in both directions', () => {
  for (const side of [-1, 1]) for (const polygon of [false, true]) for (const reverse of [false, true]) {
    const s = scene(side, polygon, reverse), { p } = s
    let caught = false, climbed = false
    for (let i = 0; i < 600; i++) {
      tick(s, { climb: true }); caught ||= !!p.climbing; climbed ||= !!p.mantle
    }
    assert.ok(caught && climbed && p.grounded, `side ${side}, polygon ${polygon}, reverse ${reverse}`)
    assert.equal(p.x, 520 + side * 20); assert.equal(p.y, 460)
    assert.equal(p.climbing, null); assert.equal(p.hang, null); assert.equal(p.mantle, null)
    let lowering = false
    for (let i = 0; i < 120; i++) { tick(s, { descend: true }); lowering ||= !!p.mantle?.descending }
    assert.ok(lowering, 'the same joined corner supports the return trip')
  }
})

test('joined-face clearance follows multiple pieces but never crosses an air gap', () => {
  for (const side of [-1, 1]) {
    const { terrain } = scene(side), edge = { edgeX: 520, edgeY: 460, side }
    const post = terrain.pop()
    terrain.push({ ...post, h: 20 }, { ...post, y: 500, h: 200 })
    assert.deepEqual(ledgeObstacles([...terrain].reverse(), edge), [])
    const separated = { ...terrain[1], y: 480.001 }
    assert.ok(ledgeObstacles([terrain[0], separated], edge).includes(separated), 'even a small gap keeps independent solids')
  }
})

test('a joined wall cannot exempt a ceiling or an outward obstruction from the climb', () => {
  for (const side of [-1, 1]) for (const kind of ['ceiling', 'outside']) {
    const s = scene(side)
    s.terrain.push(kind === 'ceiling'
      ? { x: 480, y: 405, w: 80, h: 40 }
      : { x: side === -1 ? 520 : 505, y: 482, w: 15, h: 20 })
    for (let i = 0; i < 600; i++) {
      tick(s, { climb: true })
      assert.equal(s.p.mantle, null, `${kind} still blocks the authored pull-up`)
    }
    assert.ok(s.p.climbing || s.p.hang, 'the blocked player retains a grip')
  }
})
