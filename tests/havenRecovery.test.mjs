import assert from 'node:assert/strict'
import test from 'node:test'
import { CACHES, cargoBodies, expeditionMap, freshExpedition, freshRuntime, parseExpedition, snapshotCargo, stepCargoRecovery, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { havenPose } from '../src/games/hardVacuum/campaign.ts'
import { havenPanels } from '../src/games/hardVacuum/havenGeometry.ts'
import { RECOVERY_END, RECOVERY_GRIP, RECOVERY_SEAL, recoveryPath } from '../src/games/hardVacuum/havenRecovery.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { collideBodies } from '../src/games/hardVacuum/bodyCollisions.ts'

const setup=(id=CACHES[0].id)=>{
  const s=freshExpedition(),rt=freshRuntime(),body=cargoBodies(s,rt).find(b=>b.cargoId===id)
  body.pos={x:s.campaign.haven.x-132,y:s.campaign.haven.y};body.vel={x:0,y:0};body.tethered=true
  return {s,rt,body}
}
const advance=(s,rt,seconds,dt=1/60)=>{
  const events=[]
  for(let time=0;time<seconds-.00001;time+=dt) { rt.elapsed+=dt;events.push(...stepCargoRecovery(s,rt,Math.min(dt,seconds-time))) }
  return events
}

test('Haven reaches before gripping, hauls a full-size solid load, and banks once only after the shutters seal',()=>{
  const {s,rt,body}=setup(),start={...body.pos},radius=body.radius
  advance(s,rt,.5)
  assert.deepEqual(body.pos,start);assert.ok(!body.retrieving);assert.equal(s.banked,0)
  advance(s,rt,.3)
  assert.equal(body.retrieving,true);assert.ok(body.pos.x>start.x);assert.equal(body.radius,radius)
  assert.equal(s.caches.length,0);assert.deepEqual(rt.recoveryCues,['reach','grip'])
  const neighbor={pos:{x:body.pos.x+radius+8,y:body.pos.y},vel:{x:0,y:0},radius:12}
  const fixed={...body.pos};assert.ok(collideBodies(body,neighbor).hit)
  assert.deepEqual(body.pos,fixed);assert.ok(neighbor.vel.x>0,'the moving gripper transfers momentum to loose debris')
  advance(s,rt,RECOVERY_SEAL-.8-.05)
  assert.equal(s.banked,0);assert.equal(body.radius,radius)
  const events=advance(s,rt,.1)
  assert.deepEqual(events,[`Salvage +${CACHES[0].value} banked`]);assert.equal(s.banked,CACHES[0].value);assert.equal(s.credits,0)
  advance(s,rt,4)
  assert.equal(rt.recovery,undefined);assert.equal(s.banked,CACHES[0].value);assert.equal(rt.objects[body.cargoId],undefined)
  assert.deepEqual(rt.recoveryCues,['reach','grip','seal'])
})

test('recovery routes fit the real cargo through Haven, including the larger core and an outside approach',()=>{
  for(const radius of [22,23,27]) for(const angle of [0,Math.PI/3,Math.PI,Math.PI*5/3]) {
    const s=freshExpedition(),pose=havenPose(s),map=expeditionMap(s)
    const body={pos:{x:pose.pos.x+Math.cos(angle)*148,y:pose.pos.y+Math.sin(angle)*148},vel:{x:0,y:0},radius}
    const route=recoveryPath(pose,body,map)
    assert.ok(route,`radius ${radius}, approach ${angle}`)
    const solid={...map,obstacles:[...map.obstacles,...havenPanels(pose).map(p=>p.vertices)]}
    for(let i=1;i<route.path.length;i++) {
      const a=route.path[i-1],b=route.path[i],steps=Math.ceil(Math.hypot(a.x-b.x,a.y-b.y))
      for(let n=0;n<=steps;n++) assert.ok(isInsideCavern({x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps},radius-.11,solid),'cargo cannot pass through an armor leaf or station wall')
    }
  }
})

test('untowed cargo, fast fly-bys, distant loads and inaccessible paths never trigger retrieval',()=>{
  for(const condition of ['untowed','fast','far','wall']) {
    const {s,rt,body}=setup()
    if(condition==='untowed')body.tethered=false
    if(condition==='fast')body.vel.x=300
    if(condition==='far')body.pos.x-=200
    if(condition==='wall')body.pos={x:100,y:100}
    advance(s,rt,1)
    assert.equal(rt.recovery,undefined,condition);assert.equal(s.banked,0)
  }
})

test('a departing tender or an escaping load cancels the attempt without consuming cargo',()=>{
  const {s,rt,body}=setup()
  advance(s,rt,.25);body.pos.x-=250;advance(s,rt,.1)
  assert.equal(rt.recovery,undefined);assert.ok(!body.retrieving);assert.equal(s.banked,0)
  body.pos={x:s.campaign.haven.x-132,y:s.campaign.haven.y}
  advance(s,rt,.8);assert.ok(body.retrieving)
  s.campaign.journey={phase:'folding',progress:.1,destination:'freight',points:[],index:0,riding:false,speed:0}
  advance(s,rt,.1)
  assert.equal(rt.recovery,undefined);assert.ok(!body.retrieving);assert.equal(s.caches.length,0)
})

test('an interrupted recovery survives saving as physical cargo and cannot duplicate a banked reward',()=>{
  const {s,rt}=setup()
  advance(s,rt,1.3);snapshotCargo(s,rt,[])
  const loaded=parseExpedition(JSON.stringify(s)),runtime=freshRuntime()
  assert.equal(loaded.banked,0);assert.equal(loaded.caches.length,0)
  advance(loaded,runtime,RECOVERY_END+.1)
  assert.equal(loaded.banked,CACHES[0].value)
  snapshotCargo(loaded,runtime,[])
  const again=parseExpedition(JSON.stringify(loaded))
  advance(again,freshRuntime(),3)
  assert.equal(again.banked,CACHES[0].value);assert.deepEqual(again.caches,[CACHES[0].id])
})

test('Haven installs modules but leaves the ignition core outside at different frame rates',()=>{
  for(const dt of [1/30,1/60,1/144]) {
    const {s,rt,body}=setup('radiation');s.flags.push('ignition-ready')
    const core=cargoBodies(s,rt).find(b=>b.cargoId==='core')
    core.pos={x:s.campaign.haven.x+66,y:s.campaign.haven.y+114.32};core.vel={x:0,y:0};core.tethered=true
    advance(s,rt,RECOVERY_GRIP-.05,dt);assert.equal(s.upgrades.length,0);assert.equal(s.core,false)
    advance(s,rt,5.5,dt)
    assert.ok(s.upgrades.includes('radiation'));assert.equal(s.radiationCharge,100);assert.equal(s.core,false)
    assert.equal(rt.objects.core,core);assert.equal(core.retrieving,undefined)
    assert.equal(rt.objects[body.cargoId],undefined);assert.equal(rt.recovery,undefined)
  }
})

test('the live expedition keeps cargo solid during handoff and completes a released delivery',()=>{
  const {s,rt,body}=setup(),pose=havenPose(s)
  const ship={pos:{...pose.pos},vel:{x:0,y:0},radius:15,angle:0}
  const map={...expeditionMap(s),obstacles:[...expeditionMap(s).obstacles,...havenPanels(pose).map(p=>p.vertices)]}
  for(let i=0;i<180;i++) {
    stepExpedition(s,rt,{dt:1/60,ship,rocks:[],harpoon:{state:'idle'},beam:{active:false},havenMotion:{previous:pose,current:pose,dt:1/60}})
    if(body.retrieving&&!rt.recovery?.secured) assert.ok(isInsideCavern(body.pos,body.radius-.1,map))
  }
  assert.equal(s.banked,CACHES[0].value);assert.equal(s.caches.length,1)
})
