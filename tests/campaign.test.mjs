import assert from 'node:assert/strict'
import test from 'node:test'
import { bankAtCheckpoint, CACHES, CORE_POSITION, crashExpedition, expeditionMap, freshExpedition, freshRuntime, GATES, interaction, objectBody, parseExpedition, powerReceiver, SECTORS, SOCKETS, stepExpedition, teleportToHaven } from '../src/games/hardVacuum/expedition.ts'
import { BERTHS, IGNITION_CRADLE, REGIONS, SERVICE_ROUTES } from '../src/games/hardVacuum/campaignWorld.ts'
import { campaignObjective, coreReleased, discoverCampaign, havenDeployment, havenPosition, havenReady, moveHaven, routeClear, serviceRoute, stepHaven } from '../src/games/hardVacuum/campaign.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { creditAsteroidDestruction } from '../src/games/hardVacuum/oreCredits.ts'
import { surveyPoint } from '../src/games/hardVacuum/survey.ts'
import { radiationAt } from '../src/games/hardVacuum/radiation.ts'
import { PICKUPS } from '../src/games/hardVacuum/stationDefinitions.ts'
import { CIRCUIT_LOADS } from '../src/games/hardVacuum/stationProgression.ts'

const shipAt = pos => ({ pos:{ ...pos },vel:{ x:0,y:0 },radius:15,angle:0 })
const tick = (s,rt,ship,rocks=[],dt=.1) => stepExpedition(s,rt,{ dt,ship,rocks,harpoon:{ state:'idle' },beam:{ active:false } })
const openAll = s => { s.flags=['heart','ignition-ready'];s.gates = GATES.map(g=>g.id); s.doors = {}; s.campaign.berths = BERTHS.map(b=>b.id); s.visited = SECTORS.map(r=>r.id) }

// Flood circle-clear geometry, including the actual doors and machine housings.
function flood(s, origin=s.position, radiationFree=false) {
  const map=expeditionMap(s), size=40, queue=[{x:Math.round(origin.x/size)*size,y:Math.round(origin.y/size)*size}], seen=new Set([`${queue[0].x},${queue[0].y}`])
  for(let i=0;i<queue.length;i++) for(const [dx,dy] of [[size,0],[-size,0],[0,size],[0,-size]]) {
    const from=queue[i], p={x:from.x+dx,y:from.y+dy}, key=`${p.x},${p.y}`
    if(seen.has(key)||!isInsideCavern(p,23,map)||!isInsideCavern({x:from.x+dx/2,y:from.y+dy/2},23,map)) continue
    if(radiationFree && [p,{x:from.x+dx/2,y:from.y+dy/2}].some(point=>radiationAt(point,map).intensity>0)) continue
    seen.add(key);queue.push(p)
  }
  return p => queue.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<58 && Array.from({length:7},(_,i)=>i/6).every(t=>isInsideCavern({x:q.x+(p.x-q.x)*t,y:q.y+(p.y-q.y)*t},20,map)))
}

test('campaign begins at the stranded tender in a simple cavern, with six distinct regions',()=>{
  const s=freshExpedition()
  assert.deepEqual(s.position,BERTHS[0].pos);assert.equal(s.campaign.berth,'breach')
  assert.equal(REGIONS.length,6);assert.equal(REGIONS[3].rooms.length,7)
  assert.equal(s.blasterInstalled,false);assert.deepEqual(s.campaign.berths,['breach'])
  const reachable=flood(s)
  assert.ok(reachable(SOCKETS.find(p=>p.id==='breach-power').source))
  assert.ok(!reachable(BERTHS[1].pos));assert.ok(!reachable(CORE_POSITION))
  assert.equal(campaignObjective(s).module,'impact')
})

test('the complete powered route is solvable in order with cargo clearance and no locked-away cells',()=>{
  const s=freshExpedition()
  const stages=[
    ['breach-power'],['freight-power'],['dispatch-power'],['works-power','tool-door'],['ring-power','store-door'],
    ['foundry','rubble'],['relay'],['heart'],['refuge-power','blast'],['ward-power'],['heart-route'],
    ['heart-power'],['coil-power','field-door'],['ignition-power'],
  ]
  for(const [id,barrier] of stages) {
    if(barrier) s.gates.push(barrier)
    const socket=SOCKETS.find(p=>p.id===id), reachable=flood(s)
    assert.ok(reachable(socket.source),`${id}: reserve must be reachable before powering its circuit`)
    assert.ok(reachable(socket.pos),`${id}: receiver must be reachable`)
    assert.ok(!coreReleased(s),'core remains held until the final circuit')
    assert.ok(powerReceiver(s,id,id));s.doors={}
  }
  assert.ok(coreReleased(s));const reachable=flood(s)
  assert.ok(reachable(CORE_POSITION))
  s.gates.push('baggage-door','drive')
  const all=flood(s)
  for(const cache of CACHES) assert.ok(all(cache.pos),cache.id)
  for(const berth of BERTHS) assert.ok(all(berth.pos),berth.id)
})

test('Freight requires the radioactive approach before Dispatch opens its safe shortcut and Works exit',()=>{
  const state=freshExpedition(),freight=BERTHS.find(b=>b.id==='freight').pos
  const dispatch=SOCKETS.find(s=>s.id==='dispatch-power'),shield=PICKUPS.find(p=>p.id==='radiation')
  const blaster=PICKUPS.find(p=>p.id==='blaster')
  assert.deepEqual(SOCKETS.find(s=>s.id==='breach-power').gates,['breach-link'],'the introduction is unchanged')
  powerReceiver(state,'breach-power','breach-power');state.doors={}
  assert.ok(flood(state,freight,true)(shield.pos),'recover shielding before the first radiation run')
  assert.ok(!flood(state,freight)(dispatch.source),'Dispatch stays inaccessible before the gallery receiver')
  assert.ok(!flood(state,freight)(blaster.pos),'the blaster cannot be recovered on arrival in Freight')
  powerReceiver(state,'freight-power','freight-power');state.doors={}
  assert.ok(state.gates.includes('freight-return'))
  assert.ok(!state.gates.includes('freight-lift'));assert.ok(!state.gates.includes('freight-link'))
  const approach=flood(state,freight)
  assert.ok(approach(dispatch.pos));assert.ok(approach(dispatch.source))
  assert.ok(!approach(blaster.pos),'opening Dispatch does not expose an early blaster in Cargo hold 6')
  assert.ok(!flood(state,freight,true)(dispatch.source),'the still-locked lift cannot bypass the radioactive tube')
  state.impactShieldInstalled=true
  assert.equal(campaignObjective(state).module,'radiation')
  state.upgrades.push('radiation')
  assert.equal(campaignObjective(state).circuit,'dispatch-power')
  powerReceiver(state,'dispatch-power','dispatch-power');state.doors={}
  assert.ok(state.gates.includes('freight-lift'));assert.ok(state.gates.includes('freight-link'))
  assert.ok(flood(state,freight,true)(dispatch.source),'inside power creates a safe return for the cell and salvage')
  assert.ok(flood(state,freight)(blaster.pos),'the Works pickup is reachable once Dispatch opens the Works exit, before any blast door')
  for(const [circuit,gates] of [['freight-power',['freight-return']],['dispatch-power',['freight-lift','freight-link']]]) {
    assert.deepEqual(CIRCUIT_LOADS.filter(l=>l.circuit===circuit&&l.kind==='door').map(l=>l.gate),gates,'visible wires follow the new circuit targets')
  }
})

test('folded Haven fits every authored service route and travels continuously with saved progress',()=>{
  const s=freshExpedition();openAll(s)
  for(const route of SERVICE_ROUTES) assert.ok(routeClear([...route.points],expeditionMap(s)),`${route.from} → ${route.to}`)
  for(const start of BERTHS) for(const end of BERTHS) {
    if(start===end)continue
    s.campaign.berth=start.id;s.campaign.haven={...start.pos}
    const route=serviceRoute(s,end.id)
    assert.ok(route,`${start.id} → ${end.id} connects through multiple regions`)
    assert.ok(routeClear(route,expeditionMap(s)),`${start.id} → ${end.id} has continuous clearance at joined routes`)
  }
  s.campaign.berth='breach';s.campaign.haven={...BERTHS[0].pos}
  assert.ok(moveHaven(s,'freight',true,expeditionMap(s)))
  assert.equal(havenReady(s),false);assert.equal(havenDeployment(s),1)
  stepHaven(s,1.2);assert.ok(havenDeployment(s)>.45&&havenDeployment(s)<.55)
  const saved=parseExpedition(JSON.stringify(s));assert.deepEqual(saved,s)
  let previous={...havenPosition(saved)}
  for(let i=0;i<2000&&!havenReady(saved);i++) {
    stepHaven(saved,.05)
    assert.ok(Math.hypot(saved.campaign.haven.x-previous.x,saved.campaign.haven.y-previous.y)<=10.501,'no teleporting between waypoints')
    assert.ok(isInsideCavern(havenPosition(saved),70,expeditionMap(saved)))
    previous={...havenPosition(saved)}
  }
  assert.equal(saved.campaign.berth,'freight');assert.ok(havenReady(saved))
  assert.ok(serviceRoute(saved,'breach'),'earlier berths remain reachable')
  assert.ok(moveHaven(saved,'breach',false,expeditionMap(saved)))
})

test('a berth needs power and discovery, and a blocked route cannot dispatch the tender',()=>{
  const s=freshExpedition();s.visited.push('freight')
  discoverCampaign(s,'freight');assert.equal(s.campaign.berths.includes('freight'),false)
  powerReceiver(s,'freight-power','freight-power');s.doors={}
  discoverCampaign(s,'freight');assert.ok(s.campaign.berths.includes('freight'))
  assert.equal(moveHaven(s,'freight',false,expeditionMap(s)),false,'freight transit is still sealed')
  powerReceiver(s,'breach-power','breach-power')
  assert.equal(moveHaven(s,'freight',false,expeditionMap(s)),false,'wait until physical door panels retract')
  s.doors={};assert.ok(moveHaven(s,'freight',false,expeditionMap(s)))
  assert.equal(moveHaven(s,'breach',false,expeditionMap(s)),false,'only one active journey')
})

test('recovery, banking, cargo and teleporter all follow the single relocated Haven',()=>{
  const s=freshExpedition();openAll(s);s.campaign.berth='works';s.campaign.haven={...BERTHS[2].pos}
  assert.equal(interaction(s,shipAt(BERTHS[0].pos)).kind,'recall')
  assert.equal(interaction(s,shipAt(havenPosition(s))).kind,'dock')
  s.credits=54;assert.equal(bankAtCheckpoint(s,'breach'),0);assert.equal(bankAtCheckpoint(s,'haven'),54)
  const rock={kind:'blue',radius:20,pos:{...havenPosition(s)}}
  assert.equal(creditAsteroidDestruction(s,rock,{pos:havenPosition(s),radius:118}),1000)
  s.teleporterInstalled=true;s.credits=78
  const ship=shipAt(BERTHS[0].pos);assert.ok(teleportToHaven(s,ship));assert.deepEqual(ship.pos,BERTHS[2].pos);assert.equal(s.credits,0)
  const rt=freshRuntime(), cache=objectBody(rt,CACHES[0].id,CACHES[0].pos)
  cache.pos={...BERTHS[0].pos};cache.tethered=true
  for(let i=0;i<10;i++) tick(s,rt,shipAt(cache.pos))
  assert.equal(s.caches.length,0,'empty berth cannot collect cargo')
  cache.pos={x:havenPosition(s).x-132,y:havenPosition(s).y};cache.vel={x:0,y:0}
  for(let i=0;i<30;i++) tick(s,rt,shipAt(havenPosition(s)))
  assert.ok(s.caches.includes(CACHES[0].id))
  s.credits=500;assert.equal(crashExpedition(s),500);assert.deepEqual(s.position,BERTHS[2].pos)
})

test('transit disables services, resumes on reload, and recovery settles the existing tender',()=>{
  const s=freshExpedition();openAll(s)
  moveHaven(s,'freight',false,expeditionMap(s));stepHaven(s,3)
  s.credits=70;s.teleporterInstalled=true
  assert.equal(bankAtCheckpoint(s,'haven'),0)
  assert.equal(teleportToHaven(s,shipAt(BERTHS[2].pos)),false);assert.equal(s.credits,70);assert.equal(s.teleporterInstalled,true)
  const restored=parseExpedition(JSON.stringify(s));assert.deepEqual(restored.campaign.journey,s.campaign.journey)
  crashExpedition(restored);assert.equal(restored.campaign.berth,'freight');assert.ok(havenReady(restored));assert.deepEqual(restored.position,BERTHS[1].pos)
})

test('the story is discovered once, terminal records need a connection, and the finale needs the delivered core',()=>{
  const s=freshExpedition(),rt=freshRuntime(),ship=shipAt(s.position)
  tick(s,rt,ship);assert.ok(s.campaign.records.includes('first-light'))
  const count=s.campaign.records.length;tick(s,rt,ship);assert.equal(s.campaign.records.length,count)
  assert.ok(!s.campaign.records.includes('rescue-note'))
  discoverCampaign(s,'rescue');assert.ok(!s.campaign.records.includes('rescue-note'))
  discoverCampaign(s,'rescue','rescue-note')
  assert.ok(s.campaign.records.includes('rescue-note'))
  const core=objectBody(rt,'core',CORE_POSITION);core.pos={x:ship.pos.x-132,y:ship.pos.y};core.vel={x:0,y:0};core.tethered=true
  for(let i=0;i<10;i++) tick(s,rt,ship)
  assert.equal(s.core,false);assert.equal(interaction(s,ship).kind,'dock')
  s.flags.push('ignition-ready')
  for(let i=0;i<30;i++) tick(s,rt,ship)
  assert.equal(s.core,false);assert.equal(interaction(s,ship).kind,'dock')
  core.pos={...IGNITION_CRADLE};core.vel={x:0,y:0}
  for(let i=0;i<35;i++) tick(s,rt,shipAt({x:IGNITION_CRADLE.x,y:IGNITION_CRADLE.y+100}))
  assert.equal(s.core,true);assert.equal(s.complete,true)
})

test('prototype saves enter the Ring without losing equipment, funds or the meaning of surveyed cells',()=>{
  const old=freshExpedition('ring');old.version=1;delete old.campaign
  old.banked=4321;old.blasterInstalled=true;old.blasterCharges=2;old.upgrades=['radiation'];old.surveyed=[921,922];old.gates=['rubble']
  const s=parseExpedition(JSON.stringify(old))
  assert.equal(s.campaign.berth,'ring');assert.equal(s.banked,4321);assert.equal(s.blasterCharges,2)
  assert.ok(s.gates.includes('rubble'));assert.ok(s.gates.includes('ring-link'))
  assert.deepEqual(s.surveyed.map(surveyPoint),[{x:1290,y:1110},{x:1350,y:1110}])
  const broken={...s,campaign:{...s.campaign,journey:{destination:'missing'}}}
  assert.equal(parseExpedition(JSON.stringify(broken)),null)
})
