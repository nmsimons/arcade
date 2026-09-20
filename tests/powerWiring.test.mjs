import assert from 'node:assert/strict'
import test from 'node:test'
import { BERTHS, WARD_BANKS } from '../src/games/hardVacuum/campaignWorld.ts'
import { GATES, SOCKETS, expeditionMap, freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { POWER_CONNECTIONS, powerConduits, powerTraces, routePowerConduits, WIRE_CLEARANCE, WIRE_WALL_CLEARANCE } from '../src/games/hardVacuum/powerWiring.ts'
import { STATION_TERRAIN } from '../src/games/hardVacuum/stationLayout.ts'
import { isInsideCavern, raycastCavern } from '../src/games/hardVacuum/worldGeometry.ts'

test('authored power paths exactly match the station router without searching during flight',()=>{
  assert.deepEqual(powerConduits(),routePowerConduits(),'Station geometry changed: run npm run generate:power')
})

test('every powered door, service berth, ward bank and core release has a wire from its actual receiver', () => {
  const connected = (source, target) => POWER_CONNECTIONS.some(c => c.source === source && c.target === target)
  for (const socket of SOCKETS) {
    assert.ok(POWER_CONNECTIONS.some(c => c.source === socket.id), socket.id)
    for (const id of socket.gates) if (GATES.some(g => g.id === id)) assert.ok(connected(socket.id, id), id)
  }
  for (const gate of GATES.filter(g => g.kind === 'socket')) assert.equal(POWER_CONNECTIONS.filter(c => c.target === gate.id).length, 1, gate.id)
  for (const berth of BERTHS) if (berth.power) assert.ok(connected(berth.power, `berth:${berth.id}`))
  WARD_BANKS.forEach((_, i) => assert.ok(connected('ward-power', `ward:${i}`)))
  assert.ok(connected('ignition-power', 'ignition-ready'))
  assert.ok(!POWER_CONNECTIONS.some(c => GATES.some(g => g.id === c.target && g.kind !== 'socket')), 'blast barriers have no power feed')
})

test('main power runs keep clearance from rock and fixed equipment, with short leads into their contacts', () => {
  const state = freshExpedition()
  state.gates = GATES.map(g => g.id)
  state.power = Object.fromEntries(SOCKETS.map(s => [s.id, s.id]))
  const terrain = expeditionMap(state)
  for (const cable of powerConduits()) {
    assert.deepEqual(cable.path[1], cable.entry)
    assert.deepEqual(cable.path.at(-2), cable.exit)
    for (const [a, b] of [[cable.start, cable.entry], [cable.exit, cable.end]]) {
      assert.equal(Math.hypot(a.x - b.x, a.y - b.y), 32, 'only the short equipment leads are exempt from wall clearance')
    }
    for (let i = 2; i < cable.path.length - 1; i++) {
      const a = cable.path[i - 1], b = cable.path[i], steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 4)
      for (let n = 0; n <= steps; n++) {
        const point = { x: a.x + (b.x - a.x) * n / steps, y: a.y + (b.y - a.y) * n / steps }
        assert.ok(isInsideCavern(point, WIRE_WALL_CLEARANCE - .001, terrain), `${cable.source} → ${cable.target} has clearance at ${JSON.stringify(point)}`)
      }
    }
  }
})

test('rendered parallel traces stay separated and shared circuit trunks are drawn only once', () => {
  const traces = powerTraces()
  for (const trace of traces) assert.ok(Math.hypot(trace.b.x - trace.a.x, trace.b.y - trace.a.y) >= 24 - .001, 'no tiny visible doglegs')
  const pointGap = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
  }
  for (let i = 0; i < traces.length; i++) for (let j = i + 1; j < traces.length; j++) {
    const a = traces[i], b = traces[j]
    const ux = a.b.x - a.a.x, uy = a.b.y - a.a.y, vx = b.b.x - b.a.x, vy = b.b.y - b.a.y
    if (Math.abs(ux * vy - uy * vx) > .001 * Math.hypot(ux, uy) * Math.hypot(vx, vy)) continue
    const gap = Math.min(pointGap(a.a, b.a, b.b), pointGap(a.b, b.a, b.b), pointGap(b.a, a.a, a.b), pointGap(b.b, a.a, a.b))
    assert.ok(gap >= WIRE_CLEARANCE - .001, `parallel traces need spacing: ${JSON.stringify({a,b,gap})}`)
  }
  const originalSegments = powerConduits().reduce((total, cable) => total + cable.path.length - 1, 0)
  assert.ok(traces.length < originalSegments, 'shared feeds and collinear leads are merged')
})

test('fixed conduit routes stay continuous inside the station and terminate on their equipment', () => {
  const terrain = { id: 0, name: 'Station', boundary: STATION_TERRAIN.boundary, obstacles: STATION_TERRAIN.islands }
  const conduits = powerConduits()
  assert.equal(conduits.length, POWER_CONNECTIONS.length)
  assert.equal(powerConduits(), conduits, 'routing is cached rather than recalculated each frame')
  for (const cable of conduits) {
    assert.deepEqual(cable.path[0], cable.start); assert.deepEqual(cable.path.at(-1), cable.end)
    for (const point of cable.path) assert.ok(isInsideCavern(point, 0, terrain), `${cable.source} → ${cable.target} stays inside the station`)
    for (let i = 1; i < cable.path.length; i++) {
      const a = cable.path[i - 1], b = cable.path[i], direction = { x: b.x - a.x, y: b.y - a.y }, length = Math.hypot(direction.x, direction.y)
      const dx = Math.abs(direction.x), dy = Math.abs(direction.y)
      assert.ok(dx < .001 || dy < .001 || Math.abs(dx - dy) < .001, 'traces use only horizontal, vertical or 45-degree runs')
      assert.ok(raycastCavern(a, direction, length, terrain) >= length - .001, `${cable.source} → ${cable.target} cannot disappear through rock`)
      if (i < cable.path.length - 1) {
        const next = cable.path[i + 1], dot = direction.x * (next.x - b.x) + direction.y * (next.y - b.y)
        assert.ok(dot >= -.001, `${cable.source} → ${cable.target} cannot turn back on itself, including at the contact leads`)
      }
    }
  }
})
