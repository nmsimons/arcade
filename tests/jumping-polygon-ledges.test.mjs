import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

// The cap belongs to the same polygon as a much wider base, so neither cap edge is a bounds edge.
const tower = { x: 100, y: 100, w: 400, h: 420,
  polygon: [[0,400],[140,400],[140,20],[120,20],[120,0],[200,0],[200,20],[160,20],[160,400],[400,400],[400,420],[0,420]] }
const shelf = (height = 160) => ({ x: 100, y: 100, w: 400, h: 400,
  polygon: [[0,0],[400,0],[400,40],[60,40],[60,height],[280,height],[280,height+20],[60,height+20],[60,360],[400,360],[400,400],[0,400]] })
const tick = (p, terrain, input = {}, climbables = { ladders: [], ropes: [] }) =>
  stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, climbables)
function catchCorner(terrain, edgeX, edgeY, side) {
  const p = createPlayer({ x: edgeX - side * 14, y: edgeY + 74 })
  Object.assign(p, { grounded: false, coyote: 0, vy: 60, facing: side })
  assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)), 'the starting hang is clear')
  tick(p, terrain)
  assert.ok(p.hang, `catch corner ${edgeX}, ${edgeY} from side ${side}`)
  assert.equal(p.hang.edgeX, edgeX); assert.equal(p.hang.edgeY, edgeY)
  return p
}
function climbOnto(p, terrain, x, y) {
  let climbed = false
  for (let i = 0; i < 180 && !p.grounded; i++) {
    tick(p, terrain, { climb: true })
    climbed ||= !!p.mantle
  }
  assert.ok(climbed && p.grounded, 'climb onto the selected shelf')
  assert.equal(p.x, x); assert.equal(p.y, y)
  assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)), 'standing space is clear')
}

test('one-piece T-shaped terrain catches and climbs on both cap edges, with either winding or extra nodes', () => {
  const subdivided = tower.polygon.flatMap((a, i, points) => {
    const b = points[(i + 1) % points.length]
    return [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]
  })
  for (const polygon of [tower.polygon, [...tower.polygon].reverse(), subdivided]) for (const side of [1, -1]) {
    const terrain = [{ ...tower, polygon }], edgeX = side === 1 ? 220 : 300
    const p = catchCorner(terrain, edgeX, 100, side)
    assert.equal(p.hang.braced, false, 'the overhang has no wall at the feet')
    climbOnto(p, terrain, edgeX + side * 20, 100)
    for (let i = 0; i < 180; i++) tick(p, terrain, { descend: true })
    assert.ok(p.hang, 'down returns to the same inset edge')
    assert.equal(p.hang.edgeX, edgeX); assert.equal(p.hang.edgeY, 100)
  }
})

test('a charged jump can catch an inset cap in ordinary play', () => {
  for (const side of [1, -1]) {
    const edgeX = side === 1 ? 220 : 300, p = createPlayer({ x: edgeX - side * 80, y: 320 })
    const terrain = [tower, { x: 0, y: 320, w: 800, h: 100 }]
    let caught = false
    for (let i = 0; i < 400 && !caught; i++) {
      tick(p, terrain, { jump: i < 42, move: i >= 42 ? side : 0 })
      caught = !!p.hang
    }
    assert.ok(caught, `jump reaches the cap from side ${side}`)
    climbOnto(p, terrain, edgeX + side * 20, 100)
  }
})

test('inset vertical posts brace the feet against their actual face', () => {
  const post = { x: 100, y: 100, w: 400, h: 300,
    polygon: [[0,240],[60,240],[60,0],[80,0],[80,240],[400,240],[400,260],[80,260],[80,300],[60,300],[60,260],[0,260]] }
  for (const side of [1, -1]) {
    const edgeX = side === 1 ? 160 : 180, p = catchCorner([post], edgeX, 100, side)
    assert.equal(p.hang.braced, true)
    climbOnto(p, [post], edgeX + side * 20, 100)
  }
})

test('several shelves in one polygon can be caught at their own heights', () => {
  const terrain = [shelf()]
  for (const [x, y] of [[500,100],[380,260],[500,460]]) {
    const p = catchCorner(terrain, x, y, -1)
    climbOnto(p, terrain, x - 20, y)
  }
})

test('a low ceiling belonging to the same polygon prevents climbing through it', () => {
  const terrain = [shelf(70)], p = catchCorner(terrain, 380, 170, -1)
  for (let i = 0; i < 180; i++) {
    tick(p, terrain, { climb: true })
    assert.ok(p.hang, 'the player keeps the grip when the climb is blocked')
    assert.equal(p.mantle, null)
    assert.ok(!bodyIntersects(p.x, p.y, terrain[0]))
  }
  tick(p, terrain, { drop: true })
  assert.equal(p.hang, null, 'a blocked climb still allows letting go')
})

test('a cap joined to adjacent terrain does not offer a grip along the covered seam', () => {
  const p = createPlayer({ x: 206, y: 174 }), terrain = [tower, { x: 160, y: 100, w: 60, h: 20 }]
  Object.assign(p, { grounded: false, coyote: 0, vy: 60 })
  tick(p, terrain)
  assert.equal(p.hang, null)
})

test('free ladders and ropes transfer onto inset cap edges', () => {
  for (const kind of ['ladder', 'rope']) for (const side of [1, -1]) {
    const edgeX = side === 1 ? 220 : 300, x = edgeX - side * (kind === 'ladder' ? 20 : 2)
    const world = kind === 'ladder'
      ? { ladders: [{ x, top: 100, bottom: 320, platform: -1, side }], ropes: [] }
      : { ladders: [], ropes: [{ x, y: 40, length: 250, segments: 32 }] }
    const terrain = [tower, { x: 0, y: 320, w: 800, h: 100 }], p = createPlayer({ x, y: 320 })
    let climbing = false, mantled = false
    for (let i = 0; i < 650 && !(mantled && p.grounded); i++) {
      tick(p, terrain, { climb: true }, world)
      climbing ||= p.climbing?.kind === kind; mantled ||= !!p.mantle
    }
    assert.ok(climbing && mantled && p.grounded, `${kind} exits on side ${side}`)
    assert.equal(p.x, edgeX + side * 20); assert.equal(p.y, 100)
    if (kind === 'ladder') {
      for (let i = 0; i < 240; i++) tick(p, terrain, { descend: true }, world)
      assert.equal(p.climbing?.kind, 'ladder', 'descent finds the ladder for this exact corner')
      assert.ok(p.y > 174)
    }
  }
})
