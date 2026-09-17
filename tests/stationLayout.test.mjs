import assert from 'node:assert/strict'
import test from 'node:test'
import { CHAMBERS, PASSAGES, STATION_TERRAIN } from '../src/games/hardVacuum/stationLayout.ts'
import { pointInPolygon, isInsideCavern, raycastCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { expeditionMap, freshExpedition, GATES, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { recordSurvey, surveyPoint, SURVEY_LIMIT } from '../src/games/hardVacuum/survey.ts'

test('continuous station contours preserve every chamber and passage without phantom walls or leaks', () => {
  const terrain = { boundary: STATION_TERRAIN.boundary, obstacles: STATION_TERRAIN.islands }
  const spaces = [...Object.values(CHAMBERS), ...PASSAGES.map(p => p.shape)]
  for (let y = 137; y < 2100; y += 37) for (let x = 137; x < 2900; x += 37) {
    const p = { x, y }
    assert.equal(isInsideCavern(p, 0, terrain), spaces.some(shape => pointInPolygon(p, shape)), `terrain mismatch at ${x},${y}`)
  }
  assert.ok(STATION_TERRAIN.islands.length >= 5, 'the Ring and powered return passages surround solid rock')
})

test('concave walls contain ships in both arms and resolve notch contacts without projecting toward the world center', () => {
  const map = { boundary: [[0,0],[300,0],[300,100],[100,100],[100,300],[0,300]].map(([x,y]) => ({x,y})), obstacles: [] }
  assert.ok(isInsideCavern({ x: 50, y: 220 }, 20, map))
  assert.ok(isInsideCavern({ x: 220, y: 50 }, 20, map))
  assert.equal(isInsideCavern({ x: 200, y: 200 }, 0, map), false)
  for (const x of [95, 100, 105]) {
    const pos = { x, y: 220 }, vel = { x: 80, y: 0 }
    assert.ok(resolveCircleInCavern(pos, vel, 15, 0.5, map).collided)
    assert.ok(isInsideCavern(pos, 14.99, map)); assert.ok(vel.x < 0)
  }
  assert.ok(Math.abs(raycastCavern({ x: 50, y: 50 }, { x: 1, y: 1 }, 500, map) - Math.sqrt(5000)) < 1e-8)
})

test('opened winding passages leave enough clearance to tow large asteroids between every chamber', () => {
  const state = freshExpedition('ring'); state.gates = GATES.map(g => g.id)
  const map = expeditionMap(state), step = 20, radius = 35
  const queue = [{ x: 1500, y: 1100 }], visited = new Set(['1500,1100'])
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i]
    for (const [dx, dy] of [[step,0],[-step,0],[0,step],[0,-step]]) {
      const q = { x: p.x + dx, y: p.y + dy }, key = `${q.x},${q.y}`
      if (visited.has(key) || !isInsideCavern(q, radius, map)) continue
      if (!isInsideCavern({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, radius, map)) continue
      visited.add(key); queue.push(q)
    }
  }
  for (const [x, y] of [[500,1100],[500,400],[1500,360],[2500,1060],[2500,1860],[1420,1840]]) {
    assert.ok(visited.has(`${x},${y}`), `a 35px asteroid must fit through the route to ${x},${y}`)
  }
})

test('survey records visible terrain, stops at sealed doors, expands after passage, and survives reload', () => {
  const state = freshExpedition('ring'), origin = { x: 1100, y: 1100 }
  recordSurvey(state.surveyed, origin, expeditionMap(state))
  assert.ok(state.surveyed.length > 0)
  assert.equal(state.surveyed.some(id => surveyPoint(id).x < 990), false, 'the closed west gate blocks the survey')
  assert.equal(state.surveyed.some(id => surveyPoint(id).x > 1600), false, 'distant rooms remain unknown')
  const before = [...state.surveyed]
  recordSurvey(state.surveyed, origin, expeditionMap(state))
  assert.deepEqual(state.surveyed, before, 'standing still cannot duplicate recorded cells')
  state.gates.push('rubble')
  recordSurvey(state.surveyed, origin, expeditionMap(state))
  assert.ok(state.surveyed.some(id => surveyPoint(id).x < 990))
  assert.deepEqual(parseExpedition(JSON.stringify(state)).surveyed, state.surveyed)
  const legacy = { ...state }; delete legacy.surveyed
  const restored = parseExpedition(JSON.stringify(legacy))
  assert.deepEqual(restored.surveyed, []); assert.deepEqual(restored.gates, ['rubble'])
  for (const surveyed of [null, {}, [-1], [SURVEY_LIMIT], [1.5], ['4']]) assert.equal(parseExpedition(JSON.stringify({ ...state, surveyed })), null)
})
