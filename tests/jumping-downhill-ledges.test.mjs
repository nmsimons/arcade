import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { ledgeObstacles, platformLedges } from '../src/games/jumping/terrainLedges.ts'

const downhill = (side, slope) => ({ x: 300, y: 200, w: 200, h: 500,
  polygon: [[0, 0], [200, 200 * slope], [200, 500], [0, 500]]
    .map(([x, y]) => [side > 0 ? x : 200 - x, y]) })
const tick = (p, terrain, input = {}) => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain)
const clear = (p, terrain) => {
  const body = playerContactBody(p)
  const obstacles = p.mantle ? ledgeObstacles(terrain, p.mantle) : terrain
  assert.ok(obstacles.every(b => !bodyIntersects(body.x, body.y, b, body.height)), 'the contact envelope clears its collision geometry')
}

test('downhill lips allow sixty-degree tops without granting the steep uphill edge a grip', () => {
  assert.deepEqual(levelProblems(parseLevel(JSON.parse(readFileSync(new URL('./fixtures/jumping/downhill-lip.json', import.meta.url), 'utf8')))), [])
  for (const side of [-1, 1]) for (const slope of [1.1, 1.5, Math.tan(Math.PI / 3)]) {
    const shape = downhill(side, slope), edgeX = side > 0 ? 300 : 500
    for (const polygon of [shape.polygon, [...shape.polygon].reverse()]) {
      const edges = platformLedges({ ...shape, polygon })
      assert.ok(edges.some(e => e.edgeX === edgeX && e.edgeY === 200 && e.side === side), 'the downhill top offers its high lip')
      assert.ok(edges.every(e => e.side !== -side), 'the opposite, steep uphill top still has no grip')
    }
  }
  for (const side of [-1, 1]) {
    assert.deepEqual(platformLedges(downhill(side, Math.tan(61 * Math.PI / 180))), [], 'a near-vertical top remains a wall')
  }
})

for (const side of [-1, 1]) for (const slope of [1.1, 1.4, 1.5]) for (const hold of [1, 8]) {
  test(`a ${hold}-frame jump catches and pulls onto a downhill top, slope ${slope}, side ${side}`, () => {
    const edgeX = side > 0 ? 300 : 500, shape = downhill(side, slope)
    const terrain = [shape, { x: 0, y: 320, w: 800, h: 400 }]
    const p = createPlayer({ x: edgeX - side * 40, y: 320 }); p.facing = side
    for (let i = 0; i < 180 && !p.hang; i++) {
      tick(p, terrain, { move: side, jump: i < hold }); clear(p, terrain)
    }
    assert.ok(p.hang, 'ordinary movement catches the high downhill lip')
    assert.equal(p.hang.edgeX, edgeX); assert.equal(p.hang.edgeY, 200)
    for (let i = 0; i < 60; i++) { tick(p, terrain); clear(p, terrain) }
    assert.ok(p.hang && p.vx === 0 && p.vy === 0, 'the released grip remains quiet')
    let pulled = false
    for (let i = 0; i < 180; i++) {
      tick(p, terrain, { climb: true }); clear(p, terrain)
      pulled ||= !!p.mantle
      if (pulled && !p.mantle) break
    }
    assert.ok(pulled && !p.hang && !p.mantle, 'Up completes a clear pull-up')
    assert.ok((p.x - edgeX) * side > 0, 'the pull finishes inward of the selected lip')
    // The top is too steep for traction. A grip must not create a new standing surface.
    tick(p, terrain); clear(p, terrain)
    assert.ok(p.sliding?.active && !p.grounded, 'normal slope physics takes over after the pull')
  })
}

test('a downhill grip retains blocked landings and deliberate release', () => {
  for (const side of [-1, 1]) for (const kind of ['ceiling', 'steep']) {
    const edgeX = side > 0 ? 300 : 500, shape = downhill(side, kind === 'steep' ? Math.tan(Math.PI / 3) : 1.4)
    const terrain = [shape, { x: 0, y: 320, w: 800, h: 400 }]
    if (kind === 'ceiling') terrain.push({ x: edgeX - 40, y: 150, w: 80, h: 20 })
    const p = createPlayer({ x: edgeX - side * 40, y: 320 }); p.facing = side
    for (let i = 0; i < 180 && !p.hang; i++) tick(p, terrain, { move: side, jump: i < 8 })
    assert.ok(p.hang, 'the exposed corner still permits hanging')
    for (let i = 0; i < 180; i++) { tick(p, terrain, { climb: true }); clear(p, terrain) }
    assert.ok(p.hang && !p.mantle, 'a ceiling or a slope too steep for the body prevents pulling up')
    tick(p, terrain)
    tick(p, terrain, { drop: true })
    assert.equal(p.hang, null, 'Down releases the grip')
    for (let i = 0; i < 12; i++) tick(p, terrain)
    assert.equal(p.hang, null, 'the release cooldown prevents an immediate recatch')
  }
})
