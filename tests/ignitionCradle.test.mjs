import assert from 'node:assert/strict'
import test from 'node:test'
import { CORE_RETURN_ROUTE, IGNITION_CRADLE } from '../src/games/hardVacuum/campaignWorld.ts'
import { blastGate, cargoBodies, CORE_POSITION, expeditionMap, freshExpedition, freshRuntime, GATES, objective, parseExpedition, powerReceiver, snapshotCargo, SOCKETS, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { cradlePoint, IGNITION_START_SECONDS, stepIgnitionCradle } from '../src/games/hardVacuum/ignitionCradle.ts'
import { debrisField, FRAGMENT_PROFILES, fragmentProfileAt } from '../src/games/hardVacuum/debrisField.ts'
import { radiationAt, stepRadiation } from '../src/games/hardVacuum/radiation.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'

const shipAt=pos=>({pos:{...pos},vel:{x:0,y:0},radius:15,angle:0})
const tick=(s,rt,dt=1/60)=>stepExpedition(s,rt,{dt,ship:shipAt({x:IGNITION_CRADLE.x,y:IGNITION_CRADLE.y+100}),rocks:[],harpoon:{state:'idle'},beam:{active:false}})
function ready() {
  const s=freshExpedition('heart'),rt=freshRuntime()
  s.flags=['ignition-ready'];s.gates=GATES.map(g=>g.id);s.upgrades=['radiation'];s.radiationCharge=100
  const core=cargoBodies(s,rt).find(b=>b.cargoId==='core')
  core.pos={...IGNITION_CRADLE};core.vel={x:0,y:0};core.tethered=true
  return {s,rt,core}
}

test('the Ignition Cradle is solid, accessible through its barrier and safe; only the Heart circuit opens the return door',()=>{
  const s=freshExpedition(),gate=GATES.find(g=>g.id==='breach-return'),door={x:gate.x+gate.w/2,y:gate.y+gate.h/2}
  assert.ok(blastGate(s,{x:8715,y:3550},90))
  const map=expeditionMap(s)
  assert.ok(isInsideCavern(IGNITION_CRADLE,27,map))
  const approach=[[8000,3560],[8380,3550],[8980,3550],[9100,3550],[9230,3550]]
  for(let j=1;j<approach.length;j++)for(let i=0;i<=30;i++) {
    const [ax,ay]=approach[j-1],[bx,by]=approach[j]
    assert.ok(isInsideCavern({x:ax+(bx-ax)*i/30,y:ay+(by-ay)*i/30},15,map))
  }
  assert.equal(isInsideCavern(cradlePoint(-68,0),15,map),false)
  for(const pos of [s.position,IGNITION_CRADLE,{x:8180,y:3910}])assert.equal(radiationAt(pos,map).intensity,0)
  assert.equal(isInsideCavern(door,15,map),false)
  assert.equal(blastGate(s,door,200),false)
  assert.deepEqual(SOCKETS.filter(s=>s.gates.includes('breach-return')).map(s=>s.id),['ignition-power'])
  const rt=freshRuntime(),socket=SOCKETS.find(s=>s.id==='ignition-power')
  const cell={kind:'blue',sourceId:socket.id,pos:{...socket.pos},vel:{x:0,y:0},radius:20,rot:[0,0,0]},rocks=[cell]
  for(let i=0;i<15&&!s.gates.includes('breach-return');i++)stepExpedition(s,rt,{dt:.1,ship:shipAt({x:socket.pos.x,y:socket.pos.y+90}),rocks,harpoon:{state:'idle'},beam:{active:false}})
  assert.ok(s.flags.includes('ignition-ready'));assert.ok(s.gates.includes('breach-return'))
  assert.equal(s.doors['breach-return'],0)
  assert.equal(isInsideCavern(door,15,expeditionMap(s)),false)
  for(let i=0;i<25;i++)tick(s,rt,.1)
  assert.ok(isInsideCavern(door,70,expeditionMap(s)))
})

const finalRoute=[[4100,3570],[4370,3500],[5050,3500],[5100,3450],[5320,3450],[5320,3650],[5750,3800],[5750,4160],[5930,4370],...CORE_RETURN_ROUTE.map(p=>[p.x,p.y]),[8180,3680],[8380,3550],[8980,3550],[9100,3550]]
function runReturn(speed,shield=true,pause=0) {
  const {s}=ready(),map=expeditionMap(s)
  if(!shield){s.upgrades=[];s.radiationCharge=0}
  let failed=false
  for(let i=1;i<finalRoute.length;i++) {
    const [ax,ay]=finalRoute[i-1],[bx,by]=finalRoute[i],length=Math.hypot(bx-ax,by-ay),steps=Math.ceil(length/6)
    for(let j=1;j<=steps;j++) {
      const pos={x:ax+(bx-ax)*j/steps,y:ay+(by-ay)*j/steps}
      assert.ok(isInsideCavern(pos,28,map),`core route blocked at ${JSON.stringify(pos)}`)
      const travelSpeed=i<=8 ? 220 : speed // Unladen approach, then tow the core.
      failed=stepRadiation(s,pos,length/steps/travelSpeed,map).failed||failed
    }
    if(i===9&&pause)failed=stepRadiation(s,{x:6600,y:4630},pause,map).failed||failed
  }
  return {s,failed}
}
test('a full reserve covers Haven to core to cradle at towing speed, while unshielded or stalled runs fail',()=>{
  const run=runReturn(135)
  assert.equal(run.failed,false)
  assert.ok(run.s.radiationCharge>10&&run.s.radiationCharge<60,`remaining reserve: ${run.s.radiationCharge}`)
  assert.equal(runReturn(135,false).failed,true)
  assert.equal(runReturn(135,true,45).failed,true)
})

test('the final tube has moving white and blue debris, with Heart mineral contents and no loose red spawns',()=>{
  const {s}=ready(),field=debrisField(s)
  const rocks=field.filter(r=>r.pos.y>4050&&r.pos.x>6250)
  assert.ok(rocks.length>=8,`tube rock count: ${rocks.length}`)
  assert.ok(rocks.filter(r=>r.kind==='blue').length>=2)
  assert.ok(rocks.filter(r=>r.kind==='normal').length>=5)
  assert.ok(field.every(r=>r.kind!=='red'))
  assert.ok(rocks.every(r=>Math.hypot(r.vel.x,r.vel.y)>=35))
  for(const r of rocks)assert.deepEqual(fragmentProfileAt(r.pos),FRAGMENT_PROFILES.heart)
})

test('only a released, towed core seated between the contacts starts the three-second awakening',()=>{
  for(const dt of [1/30,1/60,1/144]) {
    const {s,rt,core}=ready();s.gates=[];s.flags=[]
    stepIgnitionCradle(s,rt,4);assert.equal(rt.coreLatch,undefined)
    s.flags.push('ignition-ready');core.tethered=false
    stepIgnitionCradle(s,rt,4);assert.equal(rt.coreLatch,undefined)
    core.tethered=true
    for(const [dx,dy] of [[0,60],[45,0],[-45,0],[0,-45]]) {
      core.pos=cradlePoint(dx,dy)
      stepIgnitionCradle(s,rt,4);assert.equal(rt.coreLatch,undefined)
    }
    core.pos=cradlePoint(8,16)
    core.vel={x:0,y:0}
    let elapsed=0
    for(;elapsed<IGNITION_START_SECONDS-dt;elapsed+=dt) {
      tick(s,rt,dt);assert.equal(s.complete,false);assert.equal(core.radius,27)
    }
    for(let i=0;i<3;i++)tick(s,rt,dt)
    assert.equal(s.core,true);assert.equal(s.complete,true);assert.equal(rt.objects.core,undefined)
    assert.ok(s.campaign.records.includes('core-home'))
    assert.deepEqual(core.pos,IGNITION_CRADLE)
    assert.equal(stepIgnitionCradle(s,rt,10),false,'the sequence cannot award completion twice')
    assert.equal(isInsideCavern(IGNITION_CRADLE,15,expeditionMap(s)),false,'installed core remains a solid object')
  }
})

test('the cradle catches a moving core only after it crosses the physical contact gap',()=>{
  const {s,rt,core}=ready()
  core.pos={x:IGNITION_CRADLE.x-40,y:IGNITION_CRADLE.y};core.vel={x:135,y:0}
  tick(s,rt);assert.equal(rt.coreLatch,undefined)
  for(let i=0;i<8;i++)tick(s,rt)
  assert.ok(rt.coreLatch);assert.equal(core.retrieving,true)
  const ship=shipAt({...core.pos})
  stepExpedition(s,rt,{dt:1/60,ship,rocks:[],harpoon:{state:'idle'},beam:{active:false}})
  assert.ok(Math.hypot(ship.pos.x-core.pos.x,ship.pos.y-core.pos.y)>40,'the core remains solid while the clamps engage')
})

test('interrupted installation resumes as physical cargo, and completed saves keep the installed core',()=>{
  const {s,rt}=ready()
  for(let i=0;i<90;i++)tick(s,rt)
  snapshotCargo(s,rt,[])
  const loaded=parseExpedition(JSON.stringify(s)),runtime=freshRuntime()
  assert.equal(loaded.complete,false)
  const core=cargoBodies(loaded,runtime).find(b=>b.cargoId==='core')
  assert.deepEqual(core.pos,IGNITION_CRADLE)
  for(let i=0;i<190;i++)tick(loaded,runtime)
  snapshotCargo(loaded,runtime,[])
  const completed=parseExpedition(JSON.stringify(loaded))
  assert.ok(completed.core&&completed.complete)
  assert.ok(!cargoBodies(completed,freshRuntime()).some(b=>b.cargoId==='core'))
  assert.deepEqual(objective(completed).target,IGNITION_CRADLE)
})

test('old banked cores become towable beside Haven, and old core releases open the new return',()=>{
  const old=freshExpedition('heart');;old.version=1;delete old.finaleVersion
  powerReceiver(old,'ignition-power','ignition-power');old.gates=old.gates.filter(id=>id!=='breach-return');old.gates.push(...old.flags);delete old.flags;old.doors={};old.core=true;old.banked=4321
  const loaded=parseExpedition(JSON.stringify(old))
  assert.equal(loaded.core,false);assert.equal(loaded.banked,4321);assert.equal(loaded.finaleVersion,2)
  assert.ok(loaded.gates.includes('breach-return'));assert.ok(loaded.cargo.core.tethered)
  assert.ok(Math.hypot(loaded.cargo.core.pos.x-loaded.campaign.haven.x,loaded.cargo.core.pos.y-loaded.campaign.haven.y)<=191)
  assert.notDeepEqual(loaded.cargo.core.pos,CORE_POSITION)
  old.complete=true
  const completed=parseExpedition(JSON.stringify(old))
  assert.ok(completed.core&&completed.complete)
})
