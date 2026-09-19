import test from 'node:test'
import assert from 'node:assert/strict'
import { freshExpedition, powerReceiver, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { expeditionMap } from '../src/games/hardVacuum/expedition.ts'
import { replay } from './helpers/sessionReplay.mjs'

// Controlled scenes remove unrelated ore, not simulation systems or collisions.
const controlled=r=>{r.session.refs.rocksRef.current=r.session.refs.rocksRef.current.filter(b=>b.sourceId);return r}
const cargo=(x,y,tethered=false)=>({pos:{x,y},vel:{x:0,y:0},tethered})

test('recorded flight and grapple commands tow a cell into a receiver and open its physical door at every render rate',()=>{
  let expected
  for(const hz of [60,30,120,144]) {
    const state=freshExpedition();state.position={x:8150,y:3430}
    state.cargo={'breach-power':cargo(8150,3510)}
    const r=controlled(replay(state,90210,()=>hz/150)),s=r.session
    r.frames(hz,10,()=>{
      if(r.tick<100)r.face(Math.PI/2)
      else if(r.tick===100){r.stop();r.command({type:'tether'})}
      else if(r.tick>=130&&!s.expedition.power['breach-power'])r.fly({x:8150,y:3170},100)
      else if(s.expedition.power['breach-power'])r.stop()
    })
    assert.equal(s.expedition.power['breach-power'],'breach-power',r.diagnostic())
    assert.ok(s.expedition.gates.includes('breach-link'),r.diagnostic())
    assert.ok(isInsideCavern({x:8000,y:2795},70,expeditionMap(s.expedition)),r.diagnostic())
    assert.equal(s.mode,'playing',r.diagnostic())
    const result=structuredClone({state:s.expedition,ship:s.refs.shipRef.current,inputs:r.diagnostic().match(/"inputs":(.*),"mode"/)[1]})
    if(expected)assert.deepEqual(result,expected,`render Hz=${hz}; ${r.diagnostic()}`)
    else expected=result
  }
})

test('Haven recovery and docking bank a released load and carried credits exactly once across reload',()=>{
  const state=freshExpedition();state.credits=73;state.cargo={'rescue-cache':cargo(7868,3560,true)}
  const r=controlled(replay(state)),s=r.session
  r.command({type:'interact'});r.run(360)
  assert.equal(s.mode,'docked',r.diagnostic())
  assert.ok(s.expedition.caches.includes('rescue-cache'),r.diagnostic())
  assert.equal(s.expedition.banked,323,r.diagnostic());assert.equal(s.expedition.credits,0)
  const restored=parseExpedition(JSON.stringify(s.expedition));assert.ok(restored,r.diagnostic())
  r.command({type:'load',expedition:restored});r.run(300)
  assert.equal(s.expedition.banked,323,r.diagnostic())
  assert.equal(s.refs.runtimeRef.current.objects['rescue-cache'],undefined)
})

test('production controls fly the irradiated medical bypass without teleporting or replacing movement',()=>{
  const state=freshExpedition('refuge');powerReceiver(state,'refuge-power','refuge-power');state.doors={}
  state.upgrades=['radiation'];state.radiationCharge=100;state.position={x:750,y:4090}
  const r=controlled(replay(state)),s=r.session
  let previous={...s.refs.shipRef.current.pos},distance=0,drained=0
  for(let i=0;i<1200&&s.refs.shipRef.current.pos.x<2220&&s.mode==='playing';i++) {
    const charge=s.expedition.radiationCharge
    r.step(()=>r.fly({x:2250,y:4090},200))
    drained+=Math.max(0,charge-s.expedition.radiationCharge)
    const pos=s.refs.shipRef.current.pos,delta=Math.hypot(pos.x-previous.x,pos.y-previous.y)
    assert.ok(delta<12,`nonphysical jump: ${delta}; ${r.diagnostic()}`);distance+=delta;previous={...pos}
  }
  assert.equal(s.mode,'playing',r.diagnostic());assert.ok(s.refs.shipRef.current.pos.x>2220,r.diagnostic())
  assert.ok(distance>1470&&drained>10&&drained<60,r.diagnostic())
  assert.ok(s.expedition.radiationCharge>100-drained&&s.expedition.radiationCharge<=100,'safe stretches refill without a base visit')
})

test('actual blaster hits defeat security; reload preserves defeat while death respawns the enemy',()=>{
  const state=freshExpedition('works');powerReceiver(state,'works-power','works-power');state.doors={};state.botDoors={}
  state.position={x:5250,y:1030};state.blasterInstalled=true;state.blasterCharges=3
  const r=controlled(replay(state)),s=r.session;let shots=0,last=-100
  for(let i=0;i<600&&!s.expedition.disabledBots.includes('works-watch');i++)r.step(()=>{
    const bot=s.refs.botsRef.current.units.find(b=>b.botId==='works-watch'),ship=s.refs.shipRef.current
    const error=r.face(Math.atan2(bot.pos.y-ship.pos.y,bot.pos.x-ship.pos.x))
    if(Math.abs(error)<.08&&r.tick-last>60&&shots<3){r.command({type:'blaster'});last=r.tick;shots++}
  })
  assert.ok(s.expedition.disabledBots.includes('works-watch'),r.diagnostic());assert.equal(shots,2)
  const restored=parseExpedition(JSON.stringify(s.expedition));r.command({type:'load',expedition:restored})
  assert.ok(!s.refs.botsRef.current.units.some(b=>b.botId==='works-watch'),r.diagnostic())
  // A separate saved encounter starts unprotected in the medical conduit.
  restored.position={x:1500,y:4090};restored.credits=81;restored.banked=800;restored.shields=0
  powerReceiver(restored,'refuge-power','refuge-power');restored.doors={}
  r.command({type:'load',expedition:restored})
  for(let i=0;i<1800&&s.mode!=='gameOver';i++)r.step()
  assert.equal(s.mode,'gameOver',r.diagnostic());assert.equal(s.snapshot().lostCredits,81)
  assert.equal(s.expedition.banked,800);assert.equal(s.expedition.campaign.deaths,1)
  r.command({type:'start'})
  assert.equal(s.refs.botsRef.current.units.find(b=>b.botId==='works-watch').health,10,r.diagnostic())
  assert.deepEqual(s.refs.shipRef.current.pos,s.expedition.campaign.haven)
})

test('teleport releases an actually attached cargo body and saves it where it was left',()=>{
  const state=freshExpedition();state.position={x:7600,y:3550};state.teleporterInstalled=true;state.credits=29
  state.cargo={'rescue-cache':cargo(7510,3550)}
  const r=controlled(replay(state)),s=r.session
  r.command({type:'tether'});r.run(25)
  assert.equal(s.refs.harpoonRef.current.state,'attached',r.diagnostic())
  const pos={...s.refs.runtimeRef.current.objects['rescue-cache'].pos}
  r.command({type:'teleport'})
  assert.equal(s.refs.harpoonRef.current.state,'idle');assert.equal(s.expedition.banked,29)
  assert.deepEqual(s.refs.shipRef.current.pos,s.expedition.campaign.haven)
  assert.deepEqual(s.expedition.cargo['rescue-cache'].pos,pos)
  const restored=parseExpedition(JSON.stringify(s.expedition));assert.deepEqual(restored.cargo['rescue-cache'].pos,pos)
})

test('actual core towing seats the Ignition Cradle and completion survives a session reload',()=>{
  const state=freshExpedition();state.gates=['baggage-door','breach-return'];state.flags=['ignition-ready']
  state.position={x:9080,y:3550};state.cargo={core:cargo(9000,3550)}
  const r=controlled(replay(state)),s=r.session
  r.command({type:'tether'});r.run(25)
  assert.equal(s.refs.harpoonRef.current.state,'attached',r.diagnostic())
  for(let i=0;i<1000&&s.mode==='playing';i++)r.step(()=>r.fly({x:9230,y:3550},65))
  assert.equal(s.mode,'complete',r.diagnostic());assert.ok(s.expedition.core&&s.expedition.complete)
  assert.ok(s.expedition.campaign.records.includes('core-home'))
  const restored=parseExpedition(JSON.stringify(s.expedition));assert.ok(restored,r.diagnostic())
  r.command({type:'load',expedition:restored});assert.equal(s.mode,'complete')
  r.command({type:'resume'});r.step();assert.equal(s.mode,'playing');assert.ok(s.expedition.complete)
})

test('cosmetic randomness cannot change mined fragment kinds, motion, credits or gameplay RNG',()=>{
  let expected
  for(const cosmetic of [()=>.01,()=>.99]) {
    const state=freshExpedition();state.position={x:7800,y:3490}
    const r=replay(state,713,cosmetic),s=r.session
    const rock=s.createRock(7650,3490,32,{x:0,y:0});rock.fragmentRates={red:.42,blue:.20}
    s.refs.rocksRef.current=[rock]
    r.key(' ',true);r.run(100)
    assert.ok(!s.refs.rocksRef.current.includes(rock),r.diagnostic())
    const actual=structuredClone({state:s.expedition,ship:s.refs.shipRef.current,random:s.randomState(),rocks:s.refs.rocksRef.current.map(({pos,vel,radius,kind})=>({pos,vel,radius,kind}))})
    if(expected)assert.deepEqual(actual,expected,r.diagnostic());else expected=actual
  }
})
