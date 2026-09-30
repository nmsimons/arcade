import assert from 'node:assert/strict'
import test from 'node:test'
import { CITY } from '../src/games/urbanFire/cityPlan.ts'
import { isMovableProp } from '../src/games/urbanFire/cityLifePlan.ts'
import { createStaticCityWalls } from '../src/games/urbanFire/battlefield.ts'
import { createCivilianVehicles, civilianCover, civilianCircleContact, boxContact, hitCivilianBullet, hitBulletCover, stepCivilianVehicles } from '../src/games/urbanFire/civilianVehicles.ts'
import {createWallIndex} from '../src/games/urbanFire/spatial.ts'
import { clear, segmentEntry } from '../src/games/urbanFire/navigation.ts'
import { driveJeep } from '../src/games/urbanFire/driving.ts'

const car=(kind='car',x=780,y=550)=>createCivilianVehicles([{x:x-16,y:y-8,width:32,height:16,
  kind,condition:'abandoned',direction:'east',blockId:'test',tone:0}])[0]
const settle=(cars,walls=[],seconds=4,dt=1/120)=>{for(let t=0;t<seconds-1e-8;t+=dt)stepCivilianVehicles(cars,walls,dt)}
const wallBox=w=>({pos:{x:w.x+w.width/2,y:w.y+w.height/2},length:w.width,width:w.height,angle:w.angle??0})

test('broad rejection retains long-wall contacts and rotated tips, including a car turning into cover',()=>{
  const c=car();c.length=120;c.width=12
  const wall={pos:{x:830,y:550},length:10,width:900,angle:0}
  assert.ok(boxContact(c,wall),'a long wall can intersect although its corners are distant')
  const target={pos:{x:824,y:594},length:8,width:8,angle:0}
  assert.equal(boxContact(c,target),null)
  c.angle=Math.PI/4
  assert.ok(boxContact(c,target),'the rotated tip must not be culled using unrotated extents')
  const actor={pos:{x:824,y:594},vel:{x:0,y:0},radius:6,mass:1}
  assert.ok(civilianCircleContact(c,actor))
  c.pos={x:100,y:100}
  assert.equal(boxContact(c,target),null)
  assert.equal(civilianCircleContact(c,actor),null)
})

test('every intact civilian vehicle is live cover, without a cached obstacle at its old position',()=>{
  const authored=JSON.stringify(CITY),cars=createCivilianVehicles(),walls=createStaticCityWalls()
  assert.equal(cars.length,CITY.props.filter(isMovableProp).length)
  assert.equal(cars.length,6)
  for(const c of cars){
    assert.equal(c.prop.condition==='burned',false)
    assert.ok(clear(c.pos,c.pos,walls))
    assert.equal(clear(c.pos,c.pos,[civilianCover(c)]),false)
    const old={...c.pos};c.pos.x+=80
    assert.ok(clear(old,old,[civilianCover(c)]))
    assert.equal(clear(c.pos,c.pos,[civilianCover(c)]),false)
  }
  const fresh=createCivilianVehicles(),initial=JSON.stringify(fresh)
  settle(fresh,walls)
  assert.equal(JSON.stringify(fresh),initial,'parked bodies do not drift or change until hit')
  assert.equal(JSON.stringify(CITY),authored,'runtime cannot mutate the authored city or reset positions')
})

test('a shot nudges a heavy car, a truck moves less, and both settle with signed rolling tires',()=>{
  const light=car(),heavy=car('truck')
  for(const c of [light,heavy]){
    const hit=hitCivilianBullet([c],[],{x:730,y:550},{x:790,y:550},{x:400,y:0})
    assert.equal(hit.car,c)
    settle([c])
    assert.ok(c.pos.x>781&&c.pos.x<789,`controlled nudge: ${c.pos.x-780}`)
    assert.ok(c.leftTravel>1&&c.rightTravel>1)
    assert.ok(Math.hypot(c.vel.x,c.vel.y)<.01)
    assert.ok(Math.abs(c.pitch)<.0001)
  }
  assert.ok(heavy.pos.x-780<(light.pos.x-780)*.7,'greater mass resists the same shot')
  const reverse=car();hitCivilianBullet([reverse],[],{x:830,y:550},{x:780,y:550},{x:-400,y:0});settle([reverse])
  assert.ok(reverse.leftTravel<0&&reverse.rightTravel<0)
})

test('tires resist lateral scrubbing, edge impacts turn the body, and all motion freezes at dt zero',()=>{
  const straight=car(),sideways=car(),edge=car()
  straight.vel.x=25;sideways.vel.y=25
  settle([straight]);settle([sideways])
  assert.ok(straight.pos.x-780>(sideways.pos.y-550)*2)
  hitCivilianBullet([edge],[],{x:730,y:556},{x:780,y:556},{x:400,y:0})
  assert.ok(Math.abs(edge.spin)>.2)
  const before=JSON.stringify(edge);stepCivilianVehicles([edge],[],0)
  assert.equal(JSON.stringify(edge),before)
  stepCivilianVehicles([edge],[],.05)
  assert.ok(Math.abs(edge.angle)>.005&&Math.abs(edge.pitch)>.002)
  assert.notEqual(edge.leftTravel,edge.rightTravel)
})

test('swept bullets hit only the closest rotated car and respect shielding by solid cover',()=>{
  const near=car(),far=car('car',820),from={x:730,y:550},to={x:860,y:550},velocity={x:400,y:0}
  assert.equal(hitCivilianBullet([far,near],[],from,to,velocity).car,near)
  assert.equal(far.vel.x,0)
  const blocked=car(),wall={x:750,y:520,width:8,height:60}
  assert.equal(hitCivilianBullet([blocked],[wall],from,to,velocity),null)
  assert.equal(blocked.vel.x,0)
  const rotated=car();rotated.angle=Math.PI/4
  const cover=civilianCover(rotated)
  assert.equal(segmentEntry({x:764,y:558},{x:764,y:558},cover),null,'no invisible AABB corner')
  assert.notEqual(segmentEntry(from,to,cover),null)
  const struck=hitCivilianBullet([rotated],[],from,to,velocity)
  assert.ok(struck&&struck.point.x<780)
  const inside=car()
  assert.ok(hitCivilianBullet([inside],[],inside.pos,{x:800,y:550},velocity),'point-blank shots can start inside the hull')
})

test('actual throttle shoves a parked car slowly while preserving solid body contact',()=>{
  const parked=car(),jeep={pos:{x:751,y:550},vel:{x:100,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0}
  for(let i=0;i<240;i++){
    driveJeep(jeep,{turn:0,forward:1,reverse:0},1/120)
    stepCivilianVehicles([parked],[],1/120,[{pos:jeep.pos,vel:jeep.vel,radius:12,mass:1}])
    const hit=civilianCircleContact(parked,{pos:jeep.pos,vel:jeep.vel,radius:12,mass:1})
    assert.ok(!hit||hit.depth<.02)
  }
  assert.ok(parked.pos.x>800&&parked.pos.x<840,`heavy push travels ${parked.pos.x-780}`)
  assert.ok(jeep.pos.x<parked.pos.x-26,'jeep cannot pass through the car')
  assert.ok(jeep.vel.x<30,'pushing remains much slower than free driving')
})

test('cars stop at walls, trees and Jersey barriers, and transfer a shove to another car',()=>{
  for(const w of [{x:815,y:490,width:8,height:120},...CITY.props.filter(p=>p.kind==='tree'),...CITY.closures]){
    // Approach western perimeter cover from inside the playable district.
    const west=w.x<50,direction=west?-1:1
    const c=car('car',west?w.x+w.width+30:w.x-30,w.y+w.height/2);c.vel.x=direction*200
    settle([c],[w])
    const contact=boxContact(c,wallBox(w))
    assert.ok(!contact||contact.depth<.01)
    assert.ok(west?c.pos.x>w.x+w.width:c.pos.x<w.x,'solid scenery remains impenetrable')
  }
  const a=car(),b=car('car',814);a.vel.x=120
  settle([a,b])
  assert.ok(b.pos.x>816,'neighbor receives momentum')
  assert.equal(boxContact(a,b),null)
  const edge=car('car',1570);edge.vel.x=200;settle([edge])
  assert.ok(edge.pos.x<=1584.01,'map perimeter cannot be breached')
})

test('impact outcomes stay consistent at common frame rates',()=>{
  const poses=[1/30,1/60,1/120].map(dt=>{
    const c=car();hitCivilianBullet([c],[],{x:730,y:555},{x:810,y:555},{x:400,y:0});settle([c],[],3,dt);return c
  })
  for(const c of poses.slice(1)){
    assert.ok(Math.hypot(c.pos.x-poses[0].pos.x,c.pos.y-poses[0].pos.y)<.02)
    assert.ok(Math.abs(c.angle-poses[0].angle)<.001)
  }
})

test('a single swept cover query returns the closest wall or car with correct shielding and impulses',()=>{
  const c=car(),from={x:730,y:550},to={x:860,y:550},velocity={x:400,y:0}
  const front={x:750,y:520,width:8,height:60},back={x:840,y:520,width:8,height:60}
  const wallHit=hitBulletCover([c],[back,front],from,to,velocity)
  assert.equal(wallHit.kind,'wall');assert.equal(wallHit.wall,front)
  assert.deepEqual(wallHit.point,{x:750,y:550});assert.equal(c.vel.x,0)
  const carHit=hitBulletCover([c],[back],from,to,velocity)
  assert.equal(carHit.kind,'car');assert.equal(carHit.car,c)
  assert.equal(carHit.point.x,764);assert.ok(c.vel.x>0)
  assert.equal(hitBulletCover([],[],from,to,velocity),null)
})

test('the static index preserves long and rotated obstacles, solver order, and local queries',()=>{
  const walls=[{x:830,y:100,width:10,height:900},{x:720,y:544,width:120,height:12,angle:Math.PI/4},
    {x:50,y:50,width:20,height:20}]
  const nearby=createWallIndex(walls)
  assert.deepEqual(nearby({x:824,y:594},6),walls.slice(0,2))
  assert.deepEqual(nearby({x:60,y:60},6),[walls[2]])
  assert.deepEqual(nearby({x:1400,y:950},6),[])
})

test('resting bodies wake on bullets, actor rams, moved poses, geometry changes and new scenery',()=>{
  const walls=[],c=car();settle([c],walls)
  hitBulletCover([c],walls,{x:730,y:550},{x:790,y:550},{x:400,y:0})
  stepCivilianVehicles([c],walls,1/60);assert.ok(c.pos.x>780)
  settle([c],walls)
  const actor={pos:{x:c.pos.x-26,y:550},vel:{x:100,y:0},radius:12,mass:1}
  const x=c.pos.x;stepCivilianVehicles([c],walls,1/60,[actor]);assert.ok(c.pos.x>x)
  settle([c],walls)
  const solid={x:800,y:500,width:10,height:100}
  c.pos.x=800;c.vel.x=c.vel.y=c.spin=0
  stepCivilianVehicles([c],[solid],1/60)
  assert.ok(!boxContact(c,wallBox(solid)))
  const nextWalls=[{x:820,y:500,width:10,height:100}]
  c.pos.x=800;stepCivilianVehicles([c],nextWalls,1/60)
  c.length=60;stepCivilianVehicles([c],nextWalls,1/60)
  assert.ok(!boxContact(c,wallBox(nextWalls[0])))
})
