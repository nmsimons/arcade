import assert from 'node:assert/strict'
import test from 'node:test'
import { expeditionMap, freshExpedition, GATES, SOCKETS, powerReceiver } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import {
  RADIATION_HOUSINGS, RADIATION_SOURCES, freshRadiationFeedback, radiationAt,
  radiationFootprint, stepRadiation, stepRadiationFeedback, RADIATION_RECHARGE_TIME,
} from '../src/games/hardVacuum/radiation.ts'

const reactor = RADIATION_SOURCES[0]
const at = (x, y = 0) => ({ x: reactor.pos.x + x, y: reactor.pos.y + y })
const rectangle = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
const openMap = { id: 99, name: 'Radiation test', boundary: rectangle(0, 0, 4000, 3000), obstacles: RADIATION_HOUSINGS, containedRadiation: RADIATION_SOURCES.filter(s=>s!==reactor).map(s=>s.id) }
const wall = rectangle(reactor.pos.x + 100, reactor.pos.y - 70, 20, 140)
const coveredMap = { ...openMap, obstacles: [...RADIATION_HOUSINGS, wall] }
const protectedState = () => ({ ...freshExpedition(), impactShieldInstalled: true, shields: 2, upgrades: ['radiation'], radiationCharge: 100 })

test('distant geometry changes reuse footprints while nearby long edges invalidate them',()=>{
  const distant=rectangle(reactor.pos.x+500,reactor.pos.y,30,30)
  const a={...openMap,obstacles:[...openMap.obstacles,distant]}
  const first=radiationFootprint(reactor,a)
  const b={...a,obstacles:[...openMap.obstacles,distant.map(p=>({...p,x:p.x+10}))]}
  assert.equal(radiationFootprint(reactor,b),first)
  // Neither end is in range, but this edge still blocks rays and dose.
  const longWall=rectangle(reactor.pos.x+100,reactor.pos.y-1000,20,2000)
  const c={...b,obstacles:[...b.obstacles,longWall]},blocked=radiationFootprint(reactor,c)
  assert.notEqual(blocked,first)
  assert.deepEqual(blocked,radiationFootprint(reactor,{...c,boundary:[...c.boundary]}))
  assert.equal(radiationAt(at(180),c).intensity,0)
  assert.ok(radiationAt(at(180),b).intensity>0)
  assert.notDeepEqual(radiationFootprint({...reactor,range:150},b),first)
})

test('cached visual outlines exactly match fresh raycasts throughout station door animations',()=>{
  const state=freshExpedition()
  for(const socket of SOCKETS)powerReceiver(state,socket.id,socket.id)
  state.gates=GATES.map(g=>g.id)
  for(const progress of [0,.25,.5,.75,1]) {
    state.doors=Object.fromEntries(GATES.filter(g=>g.kind==='socket').map(g=>[g.id,progress]))
    const map=expeditionMap(state)
    for(const source of RADIATION_SOURCES) {
      const cached=radiationFootprint(source,map)
      assert.deepEqual(cached,radiationFootprint(source,{...map,boundary:[...map.boundary]}),`${source.id} progress=${progress}`)
    }
  }
})

test('radiation falls off radially instead of filling a bounding rectangle', () => {
  assert.equal(radiationAt(at(60), openMap).intensity, 1)
  const middle = (reactor.coreRange + reactor.range) / 2
  assert.equal(radiationAt(at(middle), openMap).intensity, 0.5)
  assert.equal(radiationAt(at(0, -middle), openMap).intensity, 0.5)
  assert.ok(radiationAt(at(reactor.range - 5), openMap).intensity < 0.01)
  assert.equal(radiationAt(at(reactor.range), openMap).intensity, 0)
  assert.equal(radiationAt(at(reactor.range * 0.8, -reactor.range * 0.8), openMap).intensity, 0)
})

test('solid cover blocks the dose and cuts the visible footprint at the same wall', () => {
  assert.equal(radiationAt(at(80), coveredMap).intensity, 1)
  assert.equal(radiationAt(at(180), coveredMap).intensity, 0)
  assert.ok(radiationAt(at(180), openMap).intensity > 0)
  assert.ok(radiationAt(at(150, -180), coveredMap).intensity > 0, 'radiation passes around the end of the wall')
  const footprint = radiationFootprint(reactor, coveredMap)
  const east = footprint.find(p => Math.abs(p.y - reactor.pos.y) < 1e-7 && p.x > reactor.pos.x)
  assert.ok(east)
  assert.ok(Math.abs(east.x - wall[0].x) < 1e-7)
  const openEast = radiationFootprint(reactor, openMap).find(p => Math.abs(p.y - reactor.pos.y) < 1e-7 && p.x > reactor.pos.x)
  assert.ok(Math.abs(openEast.x - reactor.pos.x - reactor.range) < 1e-7, 'another map must not reuse the covered footprint')
})

test('radiation source housings occupy real navigable space and collide with the ship', () => {
  const map = expeditionMap(freshExpedition())
  const withoutSources = { ...map, obstacles: map.obstacles.filter(p => !RADIATION_HOUSINGS.includes(p)) }
  for (const source of RADIATION_SOURCES) {
    assert.ok(isInsideCavern(source.pos, source.bodyRadius + 2, withoutSources), source.id)
    assert.equal(isInsideCavern(source.pos, 15, map), false)
    const direction=Array.from({length:8},(_,i)=>({x:Math.cos(i*Math.PI/4),y:Math.sin(i*Math.PI/4)})).find(v=>isInsideCavern({x:source.pos.x+v.x*(source.bodyRadius+25),y:source.pos.y+v.y*(source.bodyRadius+25)},15,map))
    assert.ok(direction,source.id)
    const pos = { x: source.pos.x + direction.x*(source.bodyRadius+10), y: source.pos.y + direction.y*(source.bodyRadius+10) }
    assert.equal(resolveCircleInCavern(pos, { x: 20, y: 0 }, 15, 0.4, map).collided, true)
    assert.ok(radiationAt({ x: source.pos.x + direction.x*(source.bodyRadius+25), y: source.pos.y + direction.y*(source.bodyRadius+25) }, map).intensity > 0, 'housing must not block its own radiation')
  }
})

test('weaker exposure drains more slowly and radiation-blocking cover automatically refills the reserve', () => {
  const state = protectedState()
  const dose = stepRadiation(state, at(185), 2, openMap)
  assert.equal(dose.drained, 12.5)
  assert.equal(state.radiationCharge, 87.5)
  assert.equal(state.shields, 2)
  assert.equal(state.radiationExposure, 0)
  stepRadiation(state, at(185), RADIATION_RECHARGE_TIME / 16, coveredMap)
  assert.equal(state.radiationCharge, 93.75)
  stepRadiation(state, at(185), 4, coveredMap)
  assert.equal(state.radiationCharge, 100)
  state.radiationCharge = 3.125
  stepRadiation(state, at(185), 1, openMap)
  assert.equal(state.radiationCharge, 0)
  assert.equal(state.radiationExposure, 0.25, 'only the unprotected half second contributes half-strength exposure')
})

test('passive recharge is gradual at the fixed capacity and never grants an uninstalled shield', () => {
  for (const level of [0,1,2,3]) {
    // Even stale in-memory upgrade metadata cannot grant extra capacity.
    const state=protectedState();state.upgradeLevels.radiationReserve=level;state.radiationCharge=0
    const capacity=100
    stepRadiation(state,at(reactor.range+100),RADIATION_RECHARGE_TIME/4,openMap)
    assert.equal(state.radiationCharge,capacity/4)
    stepRadiation(state,at(reactor.range+100),RADIATION_RECHARGE_TIME*5,openMap)
    assert.equal(state.radiationCharge,capacity)
    const dose=stepRadiation(state,at(185),.5,openMap)
    assert.equal(state.radiationCharge,capacity-3.125,'any nonzero exposure stops recharge')
    assert.equal(dose.drained,3.125)
  }
  const absent=freshExpedition()
  stepRadiation(absent,at(reactor.range+100),10,openMap)
  assert.equal(absent.radiationCharge,0)
})

test('detector cadence increases with dose and low reserve; reaching cover resets feedback', () => {
  const ticksFor = (pos, charge) => {
    const state = protectedState(); state.radiationCharge = charge
    const feedback = freshRadiationFeedback()
    let ticks = 0
    for (let i = 0; i < 180; i++) {
      const dose = stepRadiation(state, pos, 1 / 60, openMap)
      if (stepRadiationFeedback(feedback, dose, state, 1 / 60).tick) ticks++
    }
    return ticks
  }
  assert.ok(ticksFor(at(60), 100) > ticksFor(at(240), 100))
  assert.ok(ticksFor(at(60), 30) > ticksFor(at(60), 100))
  const state = protectedState(), feedback = freshRadiationFeedback()
  let signal = stepRadiationFeedback(feedback, stepRadiation(state, at(185), 0.1, openMap), state, 0.1)
  assert.ok(signal.tick); assert.ok(feedback.draining); assert.equal(feedback.pulse, 1)
  signal = stepRadiationFeedback(feedback, stepRadiation(state, at(185), 0.1, coveredMap), state, 0.1)
  assert.ok(signal.stopped); assert.equal(signal.tick, false)
  assert.equal(feedback.pulse, 0); assert.equal(feedback.draining, false); assert.equal(feedback.intensity, 0)
  signal = stepRadiationFeedback(feedback, stepRadiation(state, at(185), 0.1, openMap), state, 0.1)
  assert.ok(signal.tick, 're-entering radiation gives immediate feedback')
})

test('exhausting the reserve immediately switches feedback to the unprotected warning', () => {
  const state = protectedState(), feedback = freshRadiationFeedback()
  stepRadiationFeedback(feedback, stepRadiation(state, at(60), 0.01, openMap), state, 0.01)
  state.radiationCharge = 0.01
  const signal = stepRadiationFeedback(feedback, stepRadiation(state, at(60), 0.01, openMap), state, 0.01)
  assert.ok(signal.tick); assert.ok(feedback.unprotected)
  assert.equal(state.shields, 2)
})
