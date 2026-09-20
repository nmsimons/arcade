import test from 'node:test'
import assert from 'node:assert/strict'
import { bankAtCheckpoint, cargoBodies, crashExpedition, expeditionMap, freshExpedition, freshRuntime, interaction, newExpedition, parseExpedition, powerReceiver, stepCargoRecovery, stepExpedition, teleportToHaven } from '../src/games/hardVacuum/expedition.ts'
import { campaignObjective, discoverCampaign, havenReady, launchHaven, moveHaven } from '../src/games/hardVacuum/campaign.ts'
import { havenLinkDeployment, havenLinkPosition, havenLinkTargets, retireHavenLink, stepHavenLinkRetraction } from '../src/games/hardVacuum/havenActivation.ts'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { advanceDevelopmentLevel } from '../src/games/hardVacuum/development.ts'
import { BOT_MAX_HEALTH, freshBots } from '../src/games/hardVacuum/stationBots.ts'
import { repelBody } from '../src/games/hardVacuum/expeditionPhysics.ts'
import { SURVIVAL_PODS } from '../src/games/hardVacuum/survivalPods.ts'
import { SAVE_SCHEMA_VERSION } from '../src/games/hardVacuum/saveMigrations.ts'
import { replay } from './helpers/sessionReplay.mjs'

const approach=()=>{
  const s=newExpedition();s.position={x:8050,y:3560};s.visited.push('breach');return s
}
const shipAt=pos=>({pos:{...pos},vel:{x:0,y:0},radius:15,angle:Math.PI})
const args=(ship,harpoon={state:'idle'})=>({dt:1/60,ship,harpoon,rocks:[],beam:{active:false}})

test('Haven starts dormant; entering her ring never registers or services the pilot',()=>{
  const s=newExpedition(),rt=freshRuntime(),ship=shipAt(s.campaign.haven)
  assert.equal(havenReady(s),false);assert.equal(campaignObjective(s).title,'Find Haven')
  s.credits=50;s.teleporterInstalled=true
  assert.equal(interaction(s,ship),null)
  assert.equal(bankAtCheckpoint(s,'haven'),0);assert.equal(s.banked,0);assert.equal(s.credits,50)
  assert.equal(teleportToHaven(s,shipAt(s.position)),false)
  assert.equal(moveHaven(s,'freight',true,expeditionMap(s)),false)
  assert.equal(launchHaven(s,expeditionMap(s)),false)
  assert.ok(!discoverCampaign(s,'breach').includes('first-light'))
  const impact=cargoBodies(s,rt).find(b=>b.cargoId==='impact')
  impact.pos={x:s.campaign.haven.x-132,y:s.campaign.haven.y};impact.tethered=true
  for(let i=0;i<240;i++)stepCargoRecovery(s,rt,1/60)
  stepExpedition(s,rt,args(ship))
  assert.equal(s.campaign.havenActivated,false);assert.equal(s.impactShieldInstalled,false)
  assert.equal(campaignObjective(s).title,'Activate Haven')
})

test('only a real tether connection to the anchored Haven socket activates recovery',()=>{
  const s=approach(),rt=freshRuntime(),ship=shipAt(s.position),link=havenLinkTargets(s,rt)[0]
  assert.equal(link.anchored,true);assert.deepEqual(link.pos,havenLinkPosition(s))
  assert.deepEqual(link.pos,s.campaign.haven,'the link is centered in Haven')
  const pos={...link.pos};repelBody(link,{x:1,y:0});assert.deepEqual(link.pos,pos);assert.deepEqual(link.vel,{x:0,y:0})
  for(const [rock,aboard] of [[{...link},false],[link,true]]) {
    stepExpedition(s,rt,{...args(ship,{state:'attached',rock}),aboard})
    assert.equal(s.campaign.havenActivated,false)
  }
  const events=stepExpedition(s,rt,args(ship,{state:'attached',rock:link}))
  assert.ok(events.includes('Haven online · recovery link established'))
  assert.ok(s.campaign.havenActivated);assert.ok(havenReady(s));assert.ok(s.campaign.grappleLearned)
  assert.ok(s.campaign.records.includes('first-light'));assert.equal(havenLinkTargets(s,rt)[0],link)
  assert.equal(rt.grappleHint,'');assert.equal(rt.connectedTerminal,'first-light');assert.equal(rt.radio.id,'first-light')
  assert.equal(stepExpedition(s,rt,args(ship,{state:'attached',rock:link})).length,0)
  for(let i=0;i<1800;i++)stepExpedition(s,rt,args(ship,{state:'attached',rock:link}))
  assert.equal(rt.radio.id,'first-light');assert.equal(rt.radio.time,16,'the message stays pinned beyond its ordinary lifetime')
  assert.equal(rt.havenActivation,0,'finishing the boot animation cannot disconnect the cable')
  assert.equal(havenLinkDeployment(s,rt),1);assert.equal(havenLinkTargets(s,rt)[0],link)
})

test('the tether stays attached until explicit release, then stows the socket exactly once',()=>{
  for(const seed of [1,123,90210]) {
    const session=createGameSession(approach(),{seed})
    session.command({type:'start'});session.drainEvents()
    session.command({type:'tether'})
    let saved=false
    for(let i=0;i<120&&!session.expedition.campaign.havenActivated;i++) {
      session.step()
      if(session.expedition.campaign.havenActivated)saved=session.drainEvents().some(e=>e.type==='persist')
      else session.drainEvents()
    }
    assert.equal(session.mode,'playing');assert.ok(session.expedition.campaign.havenActivated)
    assert.ok(saved,'activation must save on the connection tick')
    assert.equal(session.refs.harpoonRef.current.state,'attached')
    assert.equal(parseExpedition(JSON.stringify(session.expedition)).campaign.havenActivated,true)
    assert.ok(!session.expedition.impactShieldInstalled,'activation never grants a shield')
    assert.equal(session.expedition.campaign.havenLinkPending,true)
    session.command({type:'tether'})
    assert.equal(session.refs.harpoonRef.current.state,'reeling')
    assert.equal(session.expedition.campaign.havenLinkPending,undefined)
    assert.ok(session.drainEvents().some(e=>e.type==='persist'),'disconnect commits retirement immediately')
    const rt=session.refs.runtimeRef.current
    assert.equal(havenLinkDeployment(session.expedition,rt),1,'the socket is still drawn at the start of retraction')
    assert.deepEqual(havenLinkTargets(session.expedition,rt),[],'a retracting socket cannot be hooked again')
    stepHavenLinkRetraction(rt,.6)
    assert.equal(havenLinkDeployment(session.expedition,rt),.5)
    stepHavenLinkRetraction(rt,.7)
    assert.equal(havenLinkDeployment(session.expedition,rt),0)
    assert.equal(retireHavenLink(session.expedition,rt),false)
    assert.equal(havenLinkDeployment(parseExpedition(JSON.stringify(session.expedition)),freshRuntime()),0)
    crashExpedition(session.expedition)
    assert.equal(havenLinkDeployment(session.expedition,freshRuntime()),0,'respawning cannot restore the socket')
  }
})

test('reload before disconnection preserves the socket for reconnecting to Haven',()=>{
  const s=approach(),rt=freshRuntime(),link=havenLinkTargets(s,rt)[0]
  stepExpedition(s,rt,args(shipAt(s.position),{state:'attached',rock:link}))
  const loaded=parseExpedition(JSON.stringify(s)),runtime=freshRuntime()
  assert.ok(loaded.campaign.havenActivated);assert.ok(loaded.campaign.havenLinkPending)
  assert.equal(havenLinkDeployment(loaded,runtime),1)
  stepExpedition(loaded,runtime,args(shipAt(loaded.position)))
  assert.equal(runtime.grappleHint,'','floor markings replace unsolicited tutorial reminders')
  const target=havenLinkTargets(loaded,runtime)[0]
  stepExpedition(loaded,runtime,args(shipAt(loaded.position),{state:'attached',rock:target}))
  assert.equal(runtime.connectedTerminal,'first-light');assert.equal(runtime.grappleHint,'')
  assert.equal(loaded.campaign.records.filter(id=>id==='first-light').length,1)
  assert.equal(loaded.banked,0)
  for(const value of [null,1,'true']) {
    const invalid=structuredClone(loaded);invalid.campaign.havenLinkPending=value
    assert.equal(parseExpedition(JSON.stringify(invalid)),null)
  }
  const invalid=newExpedition();invalid.campaign.havenLinkPending=true
  assert.equal(parseExpedition(JSON.stringify(invalid)),null)
  assert.equal(havenLinkDeployment(freshExpedition(),freshRuntime()),0,'older active saves never resurrect the connector')
})

test('the center socket is reachable through Haven’s ring openings without entering the hub',()=>{
  for(const angle of [-Math.PI/3,Math.PI,Math.PI/3]) {
    const s=newExpedition(),center=s.campaign.haven
    s.position={x:center.x+Math.cos(angle)*115,y:center.y+Math.sin(angle)*115}
    const session=createGameSession(s,{seed:123});session.command({type:'start'})
    session.refs.shipRef.current.angle=angle+Math.PI
    session.command({type:'tether'})
    for(let i=0;i<60&&!session.expedition.campaign.havenActivated;i++)session.step()
    assert.equal(session.mode,'playing')
    assert.equal(session.refs.harpoonRef.current.state,'attached')
    assert.ok(session.expedition.campaign.havenActivated)
  }
})

test('death before activation resets the entire expedition, including cargo and station progress',()=>{
  const s=approach();s.credits=200;s.banked=500;s.disabledBots=['works-watch']
  s.caches=['cargo-1'];s.rescuedPods=['survival-04'];s.impactShieldInstalled=true;s.shields=2
  s.cargo={impact:{pos:{x:7800,y:3500},vel:{x:5,y:0},tethered:true}}
  powerReceiver(s,'breach-power','breach-power')
  assert.equal(crashExpedition(s),200)
  assert.deepEqual(s,newExpedition())
  assert.deepEqual(parseExpedition(JSON.stringify(s)),s)
})

test('registered recovery preserves progress and survivors, but rebuilds every bot and the debris field',()=>{
  const s=freshExpedition();s.credits=300;s.banked=6000;s.rescuedPods=['survival-04']
  s.impactShieldInstalled=true;s.shields=0;s.blasterInstalled=true;s.blasterCharges=0
  s.disabledBots=['works-watch'];powerReceiver(s,'breach-power','breach-power')
  s.cargo={teleport:{pos:{x:7920,y:3460},vel:{x:2,y:3},tethered:true}}
  const before=structuredClone(s),session=createGameSession(s);session.command({type:'start'})
  session.refs.rocksRef.current=[]
  assert.equal(crashExpedition(session.expedition),300)
  session.command({type:'start'})
  const recovered=session.expedition
  assert.equal(recovered.campaign.havenActivated,true);assert.equal(recovered.campaign.deaths,1)
  assert.equal(recovered.credits,0);assert.equal(recovered.banked,before.banked)
  assert.deepEqual(recovered.rescuedPods,before.rescuedPods);assert.deepEqual(recovered.power,before.power)
  assert.deepEqual(recovered.cargo,before.cargo);assert.deepEqual(recovered.disabledBots,[])
  assert.equal(recovered.shields,2);assert.equal(recovered.blasterCharges,3)
  assert.deepEqual(session.refs.shipRef.current.pos,recovered.campaign.haven)
  assert.ok(session.refs.rocksRef.current.some(b=>b.identity?.type==='asteroid'))
  assert.ok(freshBots(recovered).units.every(b=>b.health===BOT_MAX_HEALTH))
  assert.ok(freshBots(recovered).units.some(b=>b.botId==='works-watch'))
})

test('a real pre-link death saves the reset, and Start again launches at the Access Tunnel',()=>{
  const state=newExpedition();state.position={x:1500,y:4090};state.credits=81
  powerReceiver(state,'refuge-power','refuge-power');state.doors={}
  const r=replay(state)
  for(let i=0;i<1800&&r.session.mode!=='gameOver';i++)r.step()
  assert.equal(r.session.mode,'gameOver');assert.equal(r.session.snapshot().lostCredits,81)
  assert.deepEqual(r.session.expedition,newExpedition())
  r.command({type:'start'})
  assert.deepEqual(r.session.refs.shipRef.current.pos,newExpedition().position)
  assert.equal(r.session.mode,'playing');assert.equal(r.session.expedition.campaign.havenActivated,false)
})

test('schema 11 preserves activation on reload and migrates older progress without losing recovery',()=>{
  for(const state of [newExpedition(),freshExpedition(),freshExpedition('refuge')]) {
    assert.deepEqual(parseExpedition(JSON.stringify(state)),state)
    const legacy=structuredClone(state);legacy.version=10;delete legacy.campaign.havenActivated
    const loaded=parseExpedition(JSON.stringify(legacy))
    assert.ok(loaded);assert.equal(loaded.version,SAVE_SCHEMA_VERSION)
    assert.equal(loaded.campaign.havenActivated,state.campaign.havenActivated)
  }
  const finished=freshExpedition();finished.core=true;finished.rescuedPods=SURVIVAL_PODS.map(p=>p.id);finished.complete=true
  finished.version=10;delete finished.campaign.havenActivated
  assert.equal(parseExpedition(JSON.stringify(finished)).campaign.havenActivated,true)
  assert.equal(parseExpedition(JSON.stringify(finished)).complete,true)
  const beyondLock=freshExpedition();beyondLock.version=10;beyondLock.position={x:9490,y:2900}
  delete beyondLock.campaign.havenActivated
  const moved=parseExpedition(JSON.stringify(beyondLock))
  assert.deepEqual(moved.position,{x:9310,y:2900});assert.equal(moved.campaign.havenActivated,true)
  for(const value of [undefined,null,'true',1]) {
    const invalid=newExpedition();invalid.campaign.havenActivated=value
    assert.equal(parseExpedition(JSON.stringify(invalid)),null)
  }
})

test('developer staging activates Haven, including a jump to the Breach',()=>{
  for(const berth of ['breach','freight','works','ring','refuge','heart']) {
    const s=newExpedition();assert.ok(advanceDevelopmentLevel(s,berth));assert.ok(s.campaign.havenActivated)
  }
})
