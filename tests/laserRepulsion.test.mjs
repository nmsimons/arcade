import assert from 'node:assert/strict'
import test from 'node:test'
import { CACHES, PICKUPS, SOCKETS, cargoBodies, freshExpedition, parseExpedition, powerReceiver, snapshotCargo } from '../src/games/hardVacuum/expedition.ts'
import { moduleInstalled } from '../src/games/hardVacuum/equipment.ts'
import { identifyBody } from '../src/games/hardVacuum/bodyDefinitions.ts'
import { repelBody, repelBlueBody } from '../src/games/hardVacuum/expeditionPhysics.ts'
import { TERMINALS } from '../src/games/hardVacuum/terminals.ts'
import { replay } from './helpers/sessionReplay.mjs'

// A clear section of the real Breach, with unrelated ore removed only at setup.
const origin={x:7770,y:3560},targetPosition={x:7650,y:3560}
function scene(id='impact',focus=0,capacitor=0) {
  const state=freshExpedition();state.position={...origin};state.flags=['ignition-ready']
  state.upgradeLevels={focus,capacitor}
  state.cargo={[id]:{pos:{...targetPosition},vel:{x:0,y:0},tethered:false}}
  const r=replay(state),s=r.session
  s.refs.rocksRef.current=[]
  const body=cargoBodies(s.expedition,s.refs.runtimeRef.current).find(body=>body.cargoId===id)
  return {r,s,body}
}

for(const id of [...PICKUPS.map(item=>item.id),...CACHES.map(item=>item.id),'core']) {
  test(`the real laser repels ${id} without damage, collection, installation or credits`,()=>{
    const {r,s,body}=scene(id)
    r.key(' ',true);r.run(23)
    assert.deepEqual(body.pos,targetPosition);assert.deepEqual(body.vel,{x:0,y:0})
    assert.ok(body.laserGlow>.8,'continuous contact provides visible feedback')
    r.step()
    assert.ok(Math.abs(body.vel.x+170*Math.exp(-.35/60))<1e-8,'same impulse as a blue asteroid')
    assert.ok(Math.abs(body.vel.y)<1e-8)
    r.key(' ',false);r.run(60)
    assert.ok(body.pos.x<targetPosition.x-100,'the body moves physically away from the laser')
    assert.ok(body.laserGlow<.01,'contact glow fades after release')
    assert.equal(s.refs.runtimeRef.current.objects[id],body)
    assert.equal(body.tethered,false,'laser hits never count as recovery by grapple')
    assert.equal(s.expedition.credits,0);assert.equal(s.expedition.banked,0)
    assert.deepEqual(s.expedition.caches,[]);assert.equal(s.expedition.core,false)
    for(const module of PICKUPS)assert.equal(moduleInstalled(s.expedition,module.id),false)
    snapshotCargo(s.expedition,s.refs.runtimeRef.current,s.refs.rocksRef.current)
    const loaded=parseExpedition(JSON.stringify(s.expedition))
    assert.deepEqual(loaded.cargo[id],{pos:body.pos,vel:body.vel,tethered:false})
  })
}

test('generic repulsion matches blue-asteroid strength and respects every immovable capability',()=>{
  const cargo={pos:{x:0,y:0},vel:{x:3,y:-8},radius:23,cargoId:'impact'}
  const blue={...structuredClone(cargo),kind:'blue'}
  assert.ok(repelBody(cargo,{x:3,y:4}));assert.ok(repelBlueBody(blue,{x:3,y:4}))
  assert.deepEqual(cargo.vel,blue.vel);assert.deepEqual(cargo.vel,{x:105,y:128})
  for(const capability of [{socketId:'breach-power'},{anchored:true},{retrieving:true}]) {
    const body={...structuredClone(cargo),...capability},before=structuredClone(body)
    assert.equal(repelBody(body,{x:1,y:0}),false);assert.deepEqual(body,before)
    const cell={...structuredClone(body),kind:'blue'},cellBefore=structuredClone(cell)
    assert.equal(repelBlueBody(cell,{x:1,y:0}),true);assert.deepEqual(cell,cellBefore)
  }
  const terminal=structuredClone(TERMINALS[0]),before=structuredClone(terminal)
  assert.equal(repelBody(terminal,{x:1,y:0}),false);assert.deepEqual(terminal,before)
})

test('cargo blocks targets behind it, and the nearest asteroid still wins ahead of cargo',()=>{
  for(const inFront of [false,true]) {
    const {r,s,body}=scene()
    const rock=s.createRock(inFront?7710:7550,3560,15,{x:0,y:0})
    s.refs.rocksRef.current=[rock]
    r.key(' ',true);r.run(24)
    if(inFront) {
      assert.ok(!s.refs.rocksRef.current.includes(rock),'destructible rocks are still mined')
      assert.deepEqual(body.vel,{x:0,y:0});assert.equal(s.expedition.credits,10)
    } else {
      assert.ok(s.refs.rocksRef.current.includes(rock));assert.equal(rock.laserGlow,0)
      assert.ok(body.vel.x<0);assert.equal(s.expedition.credits,0)
    }
  }
})

test('walls block repulsion and cannot accumulate contact on cargo behind them',()=>{
  const state=freshExpedition();state.position={x:8000,y:2860}
  state.cargo={impact:{pos:{x:8000,y:2700},vel:{x:0,y:0},tethered:false}}
  const r=replay(state),s=r.session;s.refs.rocksRef.current=[]
  s.refs.shipRef.current.angle=-Math.PI/2
  const body=cargoBodies(s.expedition,s.refs.runtimeRef.current).find(body=>body.cargoId==='impact')
  assert.deepEqual(body.pos,state.cargo.impact.pos)
  r.key(' ',true);r.run(30)
  assert.notEqual(s.refs.laserContactRef.current.target,body)
  assert.deepEqual(body.pos,state.cargo.impact.pos);assert.deepEqual(body.vel,{x:0,y:0})
})

test('loose blue cells and asteroids keep their push, while installed cells stay anchored',()=>{
  for(const kind of ['asteroid','cell','installed']) {
    const {r,s,body}=scene()
    body.pos={x:7650,y:3680}
    const blue=s.createRock(7650,3560,20,{x:0,y:0},'blue')
    if(kind!=='asteroid')identifyBody(blue,{type:'cell',id:'breach-power'})
    if(kind==='installed') {
      const socket=SOCKETS.find(socket=>socket.id==='breach-power')
      powerReceiver(s.expedition,socket.id,socket.id)
      blue.socketId=socket.id;blue.pos={...socket.pos}
      s.refs.shipRef.current.pos={x:socket.pos.x,y:socket.pos.y+120}
      s.refs.shipRef.current.angle=-Math.PI/2
    }
    s.refs.rocksRef.current=[blue]
    r.key(' ',true);r.run(24)
    assert.ok(s.refs.rocksRef.current.includes(blue));assert.equal(s.expedition.credits,0)
    if(kind==='installed') {
      assert.deepEqual(blue.vel,{x:0,y:0})
      assert.equal(s.refs.laserContactRef.current.target,blue)
    }
    else assert.ok(Math.abs(blue.vel.x+170)<1e-8)
  }
})

test('cargo uses focus upgrades and interrupted or switched targets cannot pre-charge a push',()=>{
  const {r,s,body}=scene('impact',0,2)
  r.key(' ',true);r.run(18);r.key(' ',false);r.step();r.key(' ',true);r.run(6)
  assert.deepEqual(body.vel,{x:0,y:0})
  r.run(18);assert.ok(body.vel.x<0)
  const focused=scene('impact',5)
  focused.r.key(' ',true);focused.r.run(5);assert.deepEqual(focused.body.vel,{x:0,y:0})
  focused.r.step();assert.ok(focused.body.vel.x<0)
  const switched=scene('impact',0,2)
  switched.r.key(' ',true);switched.r.run(18)
  const other=switched.s.refs.runtimeRef.current.objects.blaster
  other.pos={...targetPosition};other.vel={x:0,y:0};switched.body.pos={x:7650,y:3680}
  switched.r.run(6);assert.deepEqual(other.vel,{x:0,y:0})
  switched.r.run(18);assert.ok(other.vel.x<0)
  assert.equal(s.mode,'playing')
})

test('repulsion stays deterministic across rendering rates with repeated hits',()=>{
  let expected
  for(const hz of [60,30,120,144]) {
    const {r,s,body}=scene('core')
    r.key(' ',true);r.frames(hz,2)
    assert.ok(body.pos.x<targetPosition.x-100)
    const actual=structuredClone({pos:body.pos,vel:body.vel,ship:s.refs.shipRef.current,credits:s.expedition.credits,energy:s.refs.phaserStateRef.current.energyMs})
    if(expected)assert.deepEqual(actual,expected,`render rate ${hz}`)
    else expected=actual
  }
})
