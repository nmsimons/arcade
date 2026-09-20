import assert from 'node:assert/strict'
import test from 'node:test'
import { drawStationBotModel, stationBotAppearance } from '../src/games/hardVacuum/stationBotModels.ts'
import { BOT_MAX_HEALTH, freshBots } from '../src/games/hardVacuum/stationBots.ts'
import { freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { rotZ } from '../src/games/hardVacuum/math.ts'

const botOf = kind => ({ ...freshBots(freshExpedition()).units.find(bot => bot.botKind === kind), phase: 'watch', anchored: false })
const localVertices = part => part.verts.map(v => rotZ(v, part.rotation?.[2] ?? 0).map((n, i) => n + part.at[i]))
const area = points => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length]
  return sum + a[0] * b[1] - a[1] * b[0]
}, 0) / 2

for (const kind of ['tug', 'security']) {
  test(`${kind} uses sculpted, consistently wound armor within the existing garage envelope`, () => {
    const bot = botOf(kind)
    for (const phase of ['offline', 'boot', 'watch', 'charge', 'burst', 'cooldown']) {
      bot.phase = phase
      const parts = stationBotAppearance(bot, 1).parts
      assert.ok(parts.length >= 10)
      for (const part of parts) {
        assert.ok(part.edges.length > 0, 'facets use the ship’s quiet-seam treatment')
        assert.ok(area(part.faces[0].map(i => part.verts[i])) > 0)
        assert.ok(area(part.faces[1].map(i => part.verts[i])) < 0, 'top faces point toward the camera')
        for (const face of part.faces) for (const index of face) assert.ok(part.verts[index])
        for (const [x, y, z] of localVertices(part)) {
          assert.ok(Number.isFinite(x + y + z))
          assert.ok(x >= -24 && x <= 29 && Math.abs(y) <= 20, `model stays in the old visual envelope: ${x},${y}`)
        }
      }
    }
  })

  test(`${kind} presentation is pure, settles at rest, and keeps offline craft unlit`, () => {
    const bot = botOf(kind), before = structuredClone(bot)
    const still = stationBotAppearance(bot, 1)
    assert.deepEqual(still.angles, [0, -0, bot.angle])
    assert.deepEqual(stationBotAppearance({ ...bot, pos: { x: 100, y: 200 } }, 1), still,
      'crossing map coordinates cannot make the hull twitch')
    const moving = stationBotAppearance({ ...bot, vel: { x: 150, y: 40 } }, 1)
    assert.ok(moving.thrust > 0 && moving.angles[0] > 0 && moving.angles[1] < 0)
    for (const phase of ['offline', 'boot']) {
      const parked = stationBotAppearance({ ...bot, phase, vel: { x: 150, y: 40 } }, 1)
      assert.equal(parked.thrust, 0)
      assert.equal(parked.bank, 0)
      if (phase === 'offline') assert.ok(parked.parts.every(part => !part.glow))
    }
    assert.deepEqual(bot, before)
  })
}

test('tug fingers pivot symmetrically between open, windup and gripping poses', () => {
  const bot = botOf('tug')
  const arms = model => model.parts.filter(part => part.rotation)
  const ready = arms(stationBotAppearance(bot, 1))
  const winding = arms(stationBotAppearance({ ...bot, maintenance: { windup: .3 } }, 1))
  const holding = arms(stationBotAppearance({ ...bot, target: { pos: { x: 200, y: 0 }, radius: 10 } }, 1))
  for (const pair of [ready, winding, holding]) {
    assert.equal(pair.length, 2)
    const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
    const left = localVertices(pair[0]).map(([x, y, z]) => [x, -y, z]).sort(compare)
    const right = localVertices(pair[1]).sort(compare)
    left.forEach((point, i) => point.forEach((value, axis) => assert.ok(Math.abs(value - right[i][axis]) < 1e-9)))
  }
  assert.ok(winding[1].rotation[2] > ready[1].rotation[2])
  assert.ok(holding[1].rotation[2] < ready[1].rotation[2])
})

test('security charge lights the bore and sensor, while damage adds a breach without changing the hull', () => {
  const bot = botOf('security'), idle = stationBotAppearance(bot, 0)
  const charge = stationBotAppearance({ ...bot, phase: 'charge' }, 0)
  assert.equal(idle.parts.filter(part => part.glow).length, 1)
  assert.equal(charge.parts.filter(part => part.glow).length, 2)
  assert.ok(charge.parts.some(part => part.glow && part.color === '#ff795f'))
  const damaged = stationBotAppearance({ ...bot, health: BOT_MAX_HEALTH*.75 }, 0)
  assert.equal(damaged.parts.length, idle.parts.length + 1)
  assert.deepEqual(damaged.parts[0].verts, idle.parts[0].verts)
  assert.notEqual(damaged.parts[0].color, idle.parts[0].color)
})

test('each damage tier retains earlier breaches and progressively darkens both chassis without changing their shape',()=>{
  for(const kind of ['tug','security']) {
    const bot=botOf(kind),healthy=stationBotAppearance(bot,0)
    let scars=[],lastColor=healthy.parts[0].color
    for(const health of [15,10,5,2]) {
      const appearance=stationBotAppearance({...bot,health},0)
      assert.equal(appearance.parts.length,healthy.parts.length+scars.length+1)
      const breaches=appearance.parts.slice(healthy.parts.length)
      assert.deepEqual(breaches.slice(0,scars.length),scars,'damage marks accumulate instead of replacing earlier damage')
      assert.deepEqual(appearance.parts[0].verts,healthy.parts[0].verts)
      assert.ok(parseInt(appearance.parts[0].color.slice(1,3),16)<parseInt(lastColor.slice(1,3),16))
      scars=breaches;lastColor=appearance.parts[0].color
    }
  }
})

test('bot drawing restores canvas state, keeps contact flashes and skips defeated craft', () => {
  const initial = { globalAlpha: .8, lineWidth: 5, lineJoin: 'miter', lineCap: 'butt',
    shadowBlur: 12, shadowColor: '#00ff00', fillStyle: '#ffffff', strokeStyle: '#ffffff' }
  const stack = [], fills = [], points = []
  const ctx = {
    ...initial,
    save() { stack.push(Object.fromEntries(Object.keys(initial).map(key => [key, this[key]]))) },
    restore() { Object.assign(this, stack.pop()) },
    translate() {}, beginPath() {}, closePath() {},
    moveTo(x, y) { points.push([x, y]) }, lineTo(x, y) { points.push([x, y]) },
    fill() { fills.push(this.fillStyle) }, stroke() {},
  }
  const bot = botOf('tug')
  drawStationBotModel(ctx, bot, 1)
  const resting = [...fills]; fills.length = 0
  drawStationBotModel(ctx, { ...bot, flash: 1, vel: { x: 160, y: 60 } }, 1)
  assert.notDeepEqual(fills, resting, 'hit illumination still reaches the model')
  assert.ok(points.length > 100 && points.every(point => point.every(Number.isFinite)))
  assert.deepEqual(Object.fromEntries(Object.keys(initial).map(key => [key, ctx[key]])), initial)
  assert.equal(stack.length, 0)
  fills.length = 0
  drawStationBotModel(ctx, { ...bot, health: 0 }, 1)
  assert.deepEqual(fills, [])
})
