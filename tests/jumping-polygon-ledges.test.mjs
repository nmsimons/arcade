import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { platformLedges } from '../src/games/jumping/terrainLedges.ts'

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

test('an upward jump can catch an inset cap in ordinary play', () => {
  for (const side of [1, -1]) {
    const edgeX = side === 1 ? 220 : 300, p = createPlayer({ x: edgeX - side * 80, y: 320 })
    const terrain = [tower, { x: 0, y: 320, w: 800, h: 100 }]
    let caught = false
    for (let i = 0; i < 400 && !caught; i++) {
      tick(p, terrain, { jump: i < 18, move: side })
      caught = !!p.hang
    }
    assert.ok(caught, `jump reaches the cap from side ${side}`)
    climbOnto(p, terrain, edgeX + side * 20, 100)
  }
})

test('a sloping top supports a normal catch, pull-up and return to the same edge', () => {
  const ramp = { x: 100, y: 100, w: 200, h: 120, polygon: [[0,0],[200,40],[200,120],[0,120]] }
  for (const side of [1, -1]) {
    const edgeX = side === 1 ? 100 : 300, edgeY = side === 1 ? 100 : 140
    const p = catchCorner([ramp], edgeX, edgeY, side)
    assert.equal(p.hang.slope, .2 * side)
    climbOnto(p, [ramp], edgeX + side * 20, edgeY + side * 4)
    for (let i = 0; i < 180; i++) tick(p, [ramp], { descend: true })
    assert.ok(p.hang, 'descending preserves the sloped ledge grip')
    assert.equal(p.hang.edgeX, edgeX); assert.equal(p.hang.slope, .2 * side)
    climbOnto(p, [ramp], edgeX + side * 20, edgeY + side * 4)
  }
})

test('a pointed ramp with an inward-slanting face offers an exposed grip on either side', () => {
  const outline = [[0,200],[40,200],[220,100],[200,200],[420,200],[420,240],[0,240]]
  for (const side of [-1, 1]) {
    const points = outline.map(([x, y]) => [side === -1 ? x : 420 - x, y])
    const subdivided = points.flatMap((a, i) => {
      const b = points[(i + 1) % points.length]
      return [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]
    })
    for (const polygon of [points, [...points].reverse(), subdivided]) {
      const terrain = [{ x: 100, y: 100, w: 420, h: 240, polygon }], edgeX = side === -1 ? 320 : 300
      const p = catchCorner(terrain, edgeX, 200, side)
      assert.equal(p.hang.braced, false, 'the face retreats from the hanging feet')
      assert.equal(p.hang.slope, 100 / 180)
      climbOnto(p, terrain, edgeX + side * 20, 200 + 20 * 100 / 180)
      for (let i = 0; i < 180; i++) tick(p, terrain, { descend: true })
      assert.ok(p.hang, 'the same tip supports lowering back into a hang')
      assert.equal(p.hang.edgeX, edgeX)
      tick(p, terrain)
      tick(p, terrain, { drop: true })
      assert.equal(p.hang, null, 'the player can still let go')
    }
  }
})

test('tap and partial jumps catch an inward-slanting face during ordinary movement', () => {
  const outline = [[0,200],[40,200],[220,100],[200,200],[420,200],[420,240],[0,240]]
  for (const side of [-1, 1]) for (const holdFrames of [1, 4, 8]) {
    const terrain = [{ x: 100, y: 100, w: 420, h: 240,
      polygon: outline.map(([x, y]) => [side === -1 ? x : 420 - x, y]) }]
    const edgeX = side === -1 ? 320 : 300, p = createPlayer({ x: edgeX - side * 14, y: 300 })
    p.facing = side
    for (let i = 0; i < 180 && !p.hang; i++) {
      tick(p, terrain, { jump: i < holdFrames, move: i >= holdFrames ? side : 0 })
      assert.ok(!bodyIntersects(p.x, p.y, terrain[0]), 'the catch never pulls the body through the slanted face')
    }
    assert.ok(p.hang, `catch from a ${holdFrames}-frame jump on side ${side}`)
    for (let i = 0; i < 90; i++) tick(p, terrain)
    assert.ok(p.hang && !bodyIntersects(p.x, p.y, terrain[0]), 'the hanging pose stays clear')
    climbOnto(p, terrain, edgeX + side * 20, 200 + 20 * 100 / 180)
  }
})

test('sloped joins and inward-facing recesses do not become ledges', () => {
  const hill = { x: 0, y: 0, w: 400, h: 240, polygon: [[0,200],[200,100],[400,200],[400,240],[0,240]] }
  assert.ok(platformLedges(hill).every(edge => edge.edgeX !== 200), 'a walkable crest has no hanging face')
  const recess = { x: 0, y: 0, w: 400, h: 240, polygon: [[0,200],[200,100],[100,120],[400,0],[400,240],[0,240]] }
  assert.ok(platformLedges(recess).every(edge => edge.edgeX !== 200), 'an inward corner is not a grip')
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
