import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyMass, CARGO_PHYSICS, identifyBody, isImmovable } from '../src/games/hardVacuum/bodyDefinitions.ts'
import { cargoBodies, freshExpedition, freshRuntime, looseObjects, parseExpedition, snapshotCargo } from '../src/games/hardVacuum/expedition.ts'
import { collideBodies } from '../src/games/hardVacuum/bodyCollisions.ts'
import { pullBotCable } from '../src/games/hardVacuum/maintenanceBots.ts'
import { updateHarpoon } from '../src/games/hardVacuum/harpoon.ts'

test('authored, spawned and restored cargo use the same effective radius and mass',()=>{
  const state=freshExpedition(),rt=freshRuntime(),bodies=cargoBodies(state,rt)
  for(const spec of looseObjects(state)) {
    const body=bodies.find(b=>b.cargoId===spec.id)
    assert.equal(body.mass,spec.id==='core'?1.8:.65)
    assert.equal(body.mass,spec.mass);assert.equal(body.radius,spec.radius)
    assert.equal(body.identity.type,'cargo')
  }
  snapshotCargo(state,rt,[])
  const restored=cargoBodies(parseExpedition(JSON.stringify(state)),freshRuntime())
  assert.deepEqual(restored.map(b=>[b.identity,b.mass,b.radius]),bodies.map(b=>[b.identity,b.mass,b.radius]))
})

test('shared cargo weights determine collision and both player/bot tow momentum',()=>{
  for(const kind of Object.keys(CARGO_PHYSICS)) {
    const body=identifyBody({pos:{x:30,y:0},vel:{x:0,y:0},radius:20},{type:'cargo',id:kind,kind})
    const ship=identifyBody({pos:{x:0,y:0},vel:{x:100,y:0},radius:15,angle:0},{type:'ship'})
    const mass=bodyMass(body)
    collideBodies(ship,body)
    assert.ok(Math.abs(body.vel.x-155/(1+mass))<1e-10)
    assert.ok(Math.abs(ship.vel.x+mass*body.vel.x-100)<1e-10)
    ship.pos={x:0,y:0};ship.vel={x:0,y:0};body.pos={x:260,y:0};body.vel={x:0,y:0}
    const center=mass*260/(1+mass)
    const rope={rope:[],ropePrev:[],segLen:260}
    const hp={current:{state:'attached',rock:body,ropeLength:260,maxLength:260,...rope}}
    updateHarpoon({dt:1/60,w:3000,h:2200,ship,shipRef:{current:ship},rocks:[body],harpoonRef:hp,buildRopeBetween:()=>rope,HARPOON_HOOK_MASS:.2,HARPOON_VISUAL_SLACK:1.18,HARPOON_REEL_MIN_LEN:22})
    assert.ok(body.pos.x<260&&ship.pos.x>0)
    assert.ok(Math.abs((ship.pos.x+mass*body.pos.x)/(1+mass)-center)<1e-10)
    const bot={pos:{x:0,y:0},vel:{x:0,y:0},mass:1.8}
    body.pos={x:300,y:0};body.vel={x:0,y:0}
    pullBotCable(bot,body,1/60)
    assert.ok(Math.abs(body.vel.x+8/mass)<1e-10)
    assert.ok(Math.abs(bot.vel.x*1.8+body.vel.x*mass)<1e-10)
  }
})

test('constructors enforce stable identity and immovable capabilities',()=>{
  const body={pos:{x:0,y:0},vel:{x:0,y:0},radius:20}
  assert.throws(()=>identifyBody({...body,radius:NaN},{type:'asteroid'}))
  assert.throws(()=>identifyBody(body,{type:'cell',id:''}))
  identifyBody(body,{type:'asteroid'})
  identifyBody(body,{type:'cell',id:'relay'})
  assert.equal(body.kind,'blue');assert.equal(body.sourceId,'relay');assert.equal(body.identity.type,'cell')
  body.socketId='foundry';assert.ok(isImmovable(body))
  const fixture=identifyBody({...body},{type:'terminal',id:'log'})
  assert.equal(fixture.sourceId,undefined);assert.ok(isImmovable(fixture))
})
