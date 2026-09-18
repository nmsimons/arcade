import test from 'node:test'
import assert from 'node:assert/strict'
import { collideBodies, resolveWorldContacts } from '../src/games/hardVacuum/bodyCollisions.ts'
import { cargoBodies, expeditionMap, freshExpedition, freshRuntime, powerReceiver, SOCKETS, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { RECORDS } from '../src/games/hardVacuum/campaign.ts'
import { isInsideCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'

const object=(x,y,properties={})=>({pos:{x,y},vel:{x:0,y:0},radius:20,...properties})
const kinds=[{angle:0,radius:15,mass:1},{kind:'normal',mass:3},{kind:'blue',mass:2},{kind:'red',mass:2},
  {kind:'blue',sourceId:'foundry',mass:1},{cargoId:'rescue-cache',mass:.65},{cargoId:'radiation',mass:.65},{cargoId:'core',mass:1.8}]
const map={boundary:[{x:-500,y:-500},{x:500,y:-500},{x:500,y:500},{x:-500,y:500}],obstacles:[]}

test('every pair of ship, asteroid, cell, salvage, module and core collides and exchanges momentum',()=>{
  for (const aType of kinds) for (const bType of kinds) {
    const a=object(0,0,aType),b=object(0,0,bType)
    b.pos.x=a.radius+b.radius-3
    a.vel={x:100,y:13};b.vel={x:-20,y:13}
    const momentum=a.mass*a.vel.x+b.mass*b.vel.x,energy=a.mass*a.vel.x**2+b.mass*b.vel.x**2
    const hit=collideBodies(a,b)
    assert.ok(hit.hit);assert.equal(hit.speed,120)
    assert.ok(a.vel.x<100);assert.ok(b.vel.x>-20)
    assert.ok(Math.abs(a.mass*a.vel.x+b.mass*b.vel.x-momentum)<1e-8)
    assert.ok(a.mass*a.vel.x**2+b.mass*b.vel.x**2<=energy)
    assert.equal(a.vel.y,13);assert.equal(b.vel.y,13)
    assert.ok(b.pos.x-a.pos.x>=a.radius+b.radius-1e-8)
    assert.equal(a.kind,aType.kind);assert.equal(b.cargoId,bType.cargoId)
  }
})

test('anchored cells block every body type in either collision order',()=>{
  for(const kind of kinds) for(const reverse of [false,true]) {
    const fixed=object(30,0,{socketId:'relay',sourceId:'foundry',kind:'blue'}), before=structuredClone(fixed)
    const moving=object(0,0,kind);moving.vel.x=100
    const contact=reverse ? collideBodies(fixed,moving) : collideBodies(moving,fixed)
    assert.ok(contact.hit);assert.ok(moving.vel.x<0);assert.deepEqual(fixed,before)
  }
})

test('coincident or separating bodies resolve overlap without NaNs or added energy',()=>{
  const a=object(0,0),b=object(0,0)
  assert.ok(collideBodies(a,b).hit);assert.ok(Math.hypot(b.pos.x-a.pos.x,b.pos.y-a.pos.y)>=40)
  assert.deepEqual(a.vel,{x:0,y:0});assert.deepEqual(b.vel,{x:0,y:0})
  a.pos={x:0,y:0};b.pos={x:30,y:0};a.vel.x=-50;b.vel.x=50
  assert.equal(collideBodies(a,b).speed,0);assert.equal(a.vel.x,-50);assert.equal(b.vel.x,50)
  assert.equal(collideBodies(a,a).hit,false)
})

test('cargo transfers impacts through a pile-up and stays inside solid walls',()=>{
  const wallMap={...map,obstacles:[[{x:60,y:-100},{x:90,y:-100},{x:90,y:100},{x:60,y:100}]]}
  const cargo=object(-28,0,{cargoId:'cache',mass:1,vel:{x:120,y:0}}),cell=object(7,0,{kind:'blue',sourceId:'foundry',mass:1}),rock=object(40,0,{kind:'normal',mass:2})
  const contacts=[]
  for(let i=0;i<60;i++) {
    for(const body of [cargo,cell,rock]) {body.pos.x+=body.vel.x/60;body.pos.y+=body.vel.y/60}
    resolveWorldContacts([cargo,cell,rock],wallMap,c=>contacts.push(c))
    assert.ok([cargo,cell,rock].every(b=>isInsideCavern(b.pos,b.radius-.001,wallMap)))
  }
  assert.ok(contacts.some(c=>c.other===cell));assert.ok(contacts.some(c=>c.other===rock))
  for(const [a,b] of [[cargo,cell],[cell,rock]])assert.ok(Math.hypot(a.pos.x-b.pos.x,a.pos.y-b.pos.y)>=a.radius+b.radius-.05)
})

test('actual expedition collisions include cargo and red rocks far from Haven without collecting them',()=>{
  const state=freshExpedition(),rt=freshRuntime(),cargo=cargoBodies(state,rt)
  const crate=cargo.find(b=>b.cargoId==='rescue-cache'),module=cargo.find(b=>b.cargoId==='radiation')
  Object.assign(crate,{pos:{x:7000,y:3560},vel:{x:120,y:0}})
  Object.assign(module,{pos:{x:7040,y:3560},vel:{x:0,y:0}})
  const rock=object(7080,3560,{kind:'red',rot:[0,0,0]}),contacts=[]
  const ship=object(7100,3660,{radius:15,angle:0})
  stepExpedition(state,rt,{dt:0,ship,rocks:[rock],harpoon:{state:'idle'},beam:{active:false},onContact:c=>contacts.push(c)})
  assert.ok(module.vel.x>0);assert.ok(rock.vel.x>0,'red rock bounces instead of overlapping')
  assert.ok(contacts.some(c=>c.body.kind==='red'||c.other?.kind==='red'),'red fuse receives a contact event')
  assert.ok(Math.hypot(crate.pos.x-module.pos.x,crate.pos.y-module.pos.y)>=crate.radius+module.radius-.2)
  assert.equal(state.credits,0);assert.equal(state.banked,0);assert.deepEqual(state.caches,[])
  assert.equal(crate.tethered,undefined)
})

test('installed power cells and recording terminal housings stay solid',()=>{
  const state=freshExpedition(),socket=SOCKETS.find(s=>s.id==='breach-power')
  assert.ok(isInsideCavern(socket.pos,5,expeditionMap(state)))
  powerReceiver(state,socket.id,socket.id);state.doors={}
  assert.equal(isInsideCavern(socket.pos,0,expeditionMap(state)),false)
  const cell=object(socket.pos.x-25,socket.pos.y,{vel:{x:80,y:0}})
  assert.ok(resolveCircleInCavern(cell.pos,cell.vel,cell.radius,.55,expeditionMap(state)).collided)
  assert.ok(cell.vel.x<0)
  for(const record of RECORDS.filter(r=>r.pos)) {
    assert.equal(isInsideCavern(record.pos,0,expeditionMap(state)),false)
    const ship=object(record.pos.x+25,record.pos.y,{radius:15,vel:{x:-80,y:0}})
    assert.ok(resolveCircleInCavern(ship.pos,ship.vel,ship.radius,.55,expeditionMap(state)).collided)
    assert.ok(ship.vel.x>0)
  }
})
