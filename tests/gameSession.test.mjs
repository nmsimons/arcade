import test from 'node:test'
import assert from 'node:assert/strict'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { freshExpedition, powerReceiver } from '../src/games/hardVacuum/expedition.ts'
import { bodyMass, playerTetherMass, identifyBody } from '../src/games/hardVacuum/bodyDefinitions.ts'

const seed = 90210
test('small asteroid winch inertia retains its original floor without rebalancing cargo', () => {
  const body=identifyBody({pos:{x:0,y:0},vel:{x:0,y:0},radius:9,kind:'normal'},{type:'asteroid'})
  assert.equal(bodyMass(body),.25);assert.equal(playerTetherMass(body),1)
  identifyBody(body,{type:'cargo',kind:'salvage',id:'rescue-cache'})
  assert.equal(bodyMass(body),.65);assert.equal(playerTetherMass(body),.65)
})

test('irradiated sessions never accumulate dose while paused or catch up a background hitch', () => {
  const state=freshExpedition('refuge');powerReceiver(state,'refuge-power','refuge-power');state.doors={}
  state.position={x:1500,y:4090};state.upgrades=['radiation'];state.radiationCharge=100
  const s=createGameSession(state,{seed});s.command({type:'start'})
  s.advance(0);s.advance(1000/60)
  assert.ok(s.expedition.radiationCharge<100)
  s.command({type:'pause'});const charge=s.expedition.radiationCharge
  s.advance(300000);assert.equal(s.expedition.radiationCharge,charge)
  s.command({type:'resume'});s.advance(600000);assert.equal(s.expedition.radiationCharge,charge)
  s.advance(900000)
  assert.ok(charge-s.expedition.radiationCharge>0&&charge-s.expedition.radiationCharge<=1.251)
  assert.equal(Math.round(s.timeMs),117)
})
const gameplay = s => ({ mode:s.mode, expedition:s.expedition, ship:s.refs.shipRef.current, random:s.randomState(), rocks:s.refs.rocksRef.current.map(({pos,vel,radius,kind,redFuseS})=>({pos,vel,radius,kind,redFuseS})) })
const launch = cosmeticRandom => {
  const session = createGameSession(freshExpedition(), {seed,cosmeticRandom})
  session.command({type:'start'})
  session.drainEvents()
  return session
}

test('the production session is headless and deterministic at 30/60/120/144 Hz', () => {
  let expected
  for (const hz of [60,30,120,144]) {
    const s = launch(() => hz/150)
    s.command({type:'key',key:'w',pressed:true})
    s.advance(0)
    for(let frame=1;frame<=hz*3;frame++) s.advance(frame*1000/hz)
    const actual=structuredClone(gameplay(s))
    if(expected) assert.deepEqual(actual,expected,JSON.stringify({seed,hz,inputs:['start','hold w for 180 ticks'],actual}))
    else expected=actual
    assert.equal(Math.round(s.timeMs),3000)
  }
})

test('commands own shields and snapshots cannot mutate the session', () => {
  const s=launch()
  s.refs.shieldsRef.current=1
  assert.equal(s.expedition.shields,1)
  const snapshot=s.snapshot()
  snapshot.expedition.shields=8
  snapshot.expedition.campaign.haven.x=0
  assert.equal(s.expedition.shields,1)
  assert.notEqual(s.expedition.campaign.haven.x,0)
})

test('HUD and periodic persistence cadence are independent of combat events', () => {
  const s=launch()
  const counts={hud:0,persist:0}
  for(let tick=0;tick<181;tick++) {
    s.step()
    for(const event of s.drainEvents()) if(event.type in counts) counts[event.type]++
  }
  assert.equal(counts.persist,1)
  assert.ok(counts.hud>=18&&counts.hud<=21)
})

test('pause, survey suspension and hitches cannot catch up hidden gameplay', () => {
  const s=launch()
  s.advance(0);s.advance(1000/60)
  s.command({type:'pause'})
  const before=structuredClone(gameplay(s))
  s.advance(300000)
  assert.deepEqual(gameplay(s),before)
  s.command({type:'resume'});s.advance(600000)
  assert.equal(Math.round(s.timeMs),17)
  s.advance(601000)
  assert.equal(Math.round(s.timeMs),117)
  assert.ok(s.clock.discardedSeconds>.89)
  s.command({type:'suspend',suspended:true});s.advance(900000)
  s.command({type:'suspend',suspended:false});s.advance(1200000)
  assert.equal(Math.round(s.timeMs),117)
})

test('audio is a typed event, never a browser service required by simulation', () => {
  const s=createGameSession()
  s.command({type:'start'})
  assert.ok(s.drainEvents().some(e=>e.type==='audio'&&e.name==='init'))
  s.command({type:'key',key:'w',pressed:true})
  s.command({type:'pause'})
  assert.equal(s.refs.keysRef.current.size,0)
})
