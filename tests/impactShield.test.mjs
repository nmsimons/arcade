import assert from 'node:assert/strict'
import test from 'node:test'
import { bankAtCheckpoint, cargoBodies, crashExpedition, expeditionMap, freshExpedition, freshRuntime, looseObjects, maxShields, objective, parseExpedition, PICKUPS, purchaseUpgrade, sectorAt } from '../src/games/hardVacuum/expedition.ts'
import { installModule } from '../src/games/hardVacuum/equipment.ts'
import { havenPosition } from '../src/games/hardVacuum/campaign.ts'
import { needsRecharge, restoreShipSystems } from '../src/games/hardVacuum/supplies.ts'
import { upgradeOffer } from '../src/games/hardVacuum/upgrades.ts'
import { stepGrappleGuide } from '../src/games/hardVacuum/grappleGuide.ts'
import { freshShipAppearance, stepHullSparks } from '../src/games/hardVacuum/shipRender.ts'
import { replay } from './helpers/sessionReplay.mjs'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { radiationAt } from '../src/games/hardVacuum/radiation.ts'

test('a new ship has no impact protection and cannot acquire it from the dock, upgrades, or respawn',()=>{
  const state=freshExpedition();state.banked=5000
  assert.equal(state.impactShieldInstalled,false);assert.equal(state.shields,0);assert.equal(maxShields(state),0)
  assert.equal(needsRecharge(state),false)
  assert.equal(upgradeOffer(state,'hull').locked,true)
  assert.match(upgradeOffer(state,'hull').detail,/install the impact shield/i)
  assert.equal(purchaseUpgrade(state,'hull'),false);assert.equal(state.banked,5000)
  assert.equal(purchaseUpgrade(state,'impact'),false)
  assert.ok(purchaseUpgrade(state,'capacitor'))
  restoreShipSystems(state);bankAtCheckpoint(state,'haven');crashExpedition(state)
  assert.equal(state.impactShieldInstalled,false);assert.equal(state.shields,0)
  assert.deepEqual(parseExpedition(JSON.stringify(state)),state)
  assert.ok(looseObjects(state).some(item=>item.id==='impact'))
  assert.ok(installModule(state,'impact'))
  assert.equal(state.shields,2);assert.equal(maxShields(state),2)
  assert.equal(upgradeOffer(state,'hull').locked,false)
  assert.ok(purchaseUpgrade(state,'hull'));assert.equal(maxShields(state),3)
  state.shields=1
  assert.equal(installModule(state,'impact'),false);assert.equal(state.shields,1,'duplicate installation cannot refill')
  bankAtCheckpoint(state,'haven');assert.equal(state.shields,3)
  state.shields=0;crashExpedition(state);assert.equal(state.shields,3)
})

test('schema 1–4 ships retain installed impact shields, upgrades and remaining charges exactly once',()=>{
  for(const version of [1,2,3,4]) for(const shields of [0,1,4]) {
    const old={...freshExpedition(),version,shields,banked:1234,upgrades:['hull'],upgradeLevels:{hull:2}}
    delete old.impactShieldInstalled
    const loaded=parseExpedition(JSON.stringify(old))
    assert.ok(loaded);assert.equal(loaded.impactShieldInstalled,true);assert.equal(loaded.shields,shields)
    assert.equal(loaded.banked,old.banked);assert.deepEqual(loaded.upgradeLevels,old.upgradeLevels)
    assert.equal(maxShields(loaded),4)
    assert.ok(!looseObjects(loaded).some(item=>item.id==='impact'))
    assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
  }
})

test('current saves require explicit impact ownership and cannot smuggle in charges or hull upgrades',()=>{
  const state=freshExpedition()
  for(const patch of [{impactShieldInstalled:undefined},{impactShieldInstalled:null},{impactShieldInstalled:1},{shields:1},{upgrades:['hull']},{upgradeLevels:{hull:1}}]) {
    assert.equal(parseExpedition(JSON.stringify({...state,...patch})),null,JSON.stringify(patch))
  }
  assert.deepEqual(parseExpedition(JSON.stringify(state)),state)
})

test('opening guidance follows the module through aiming, towing, release, recovery and installation',()=>{
  const state=freshExpedition(),runtime=freshRuntime(),map=expeditionMap(state)
  const body=cargoBodies(state,runtime).find(body=>body.cargoId==='impact')
  const ship={pos:havenPosition(state),vel:{x:0,y:0},angle:Math.PI,radius:15}
  const guide=hook=>stepGrappleGuide(state,runtime,ship,hook,[body],map,1/60)
  assert.equal(objective(state).title,'Install your impact shield')
  assert.deepEqual(objective(state).target,PICKUPS.find(item=>item.id==='impact').pos)
  assert.match(objective(state).detail,/passage west of Haven to the rescue locker/)
  guide({state:'idle'});assert.match(runtime.grappleHint,/rescue locker.*passage west of Haven/)
  ship.pos={x:body.pos.x+100,y:body.pos.y}
  guide({state:'idle'});assert.match(runtime.grappleHint,/green module.*nose.*F to grapple/)
  guide({state:'deployed'});assert.match(runtime.grappleHint,/recall/)
  guide({state:'attached',rock:body});assert.match(runtime.grappleHint,/connected.*tow.*Haven/)
  assert.equal(state.campaign.grappleLearned,true)
  body.tethered=true
  guide({state:'idle'});assert.match(runtime.grappleHint,/released.*reconnect/)
  const saved=parseExpedition(JSON.stringify({...state,cargo:{impact:{pos:{x:7800,y:3560},vel:{x:0,y:0},tethered:true}}}))
  assert.equal(objective(saved).title,'Install your impact shield');assert.deepEqual(objective(saved).target,havenPosition(saved))
  runtime.recovery={id:'impact'}
  guide({state:'idle'});assert.match(runtime.grappleHint,/installing.*seal/)
  installModule(state,'impact');delete runtime.recovery
  guide({state:'idle'});assert.equal(runtime.grappleHint,'')
  assert.equal(objective(state).title,'Restore freight transit')
})

test('an uninstalled shield is not presented as a damaged sparking hull',()=>{
  const appearance=freshShipAppearance(),ship={pos:{x:0,y:0},vel:{x:0,y:0},angle:0,radius:15}
  assert.deepEqual(stepHullSparks(appearance,ship,0,1,false),[])
  assert.ok(stepHullSparks(appearance,ship,0,1,true).length>0)
})

const outward=[{x:7700,y:3560},{x:7430,y:3590},{x:7270,y:3600}]
const home=[{x:7330,y:3600},{x:7560,y:3560},{x:7800,y:3560},{x:8030,y:3560}]
function rescuePilot(r) {
  const s=r.session
  let stage='out',index=0,hookAt=0
  return ()=>{
    if(s.expedition.impactShieldInstalled){r.stop();return}
    const ship=s.refs.shipRef.current,body=s.refs.runtimeRef.current.objects.impact
    if(stage==='out') {
      if(r.fly(outward[index],65)<35 && ++index===outward.length){stage='aim';index=0}
    } else if(stage==='aim') {
      const distance=Math.hypot(body.pos.x-ship.pos.x,body.pos.y-ship.pos.y)
      r.fly(body.pos,Math.max(0,Math.min(45,(distance-105)*.6)))
      const aim=Math.atan2(body.pos.y-ship.pos.y,body.pos.x-ship.pos.x)
      const error=Math.atan2(Math.sin(aim-ship.angle),Math.cos(aim-ship.angle))
      if(distance<135&&Math.abs(error)<.06&&Math.hypot(ship.vel.x,ship.vel.y)<15) {
        r.stop();r.command({type:'tether'});hookAt=r.tick;stage='hook'
      }
    } else if(stage==='hook') {
      if(s.refs.harpoonRef.current.state==='attached'){stage='home';index=0}
      else if(r.tick-hookAt>90){r.command({type:'tether'});stage='aim'}
    } else {
      const target=home[index],distance=Math.hypot(target.x-ship.pos.x,target.y-ship.pos.y)
      r.fly(target,index===home.length-1?Math.min(55,distance*.6):65)
      if(distance<35&&index<home.length-1)index++
    }
  }
}
// Keep real cargo, power cells, collisions and flight controls, without random
// ore interfering with the recorded pilot's route through the opening passage.
function opening() {
  const r=replay(freshExpedition())
  r.session.refs.rocksRef.current=r.session.refs.rocksRef.current.filter(body=>body.sourceId)
  return r
}

test('the shield starts inside the rescue locker, reachable and towable before powering any door',()=>{
  const state=freshExpedition(),map=expeditionMap(state),item=PICKUPS.find(item=>item.id==='impact')
  assert.equal(item.sector,'rescue');assert.equal(sectorAt(item.pos)?.id,'rescue')
  const points=[havenPosition(state),...outward,item.pos,...home]
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/4)
    for(let n=0;n<=steps;n++) {
      const pos={x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps}
      assert.ok(isInsideCavern(pos,23,map),JSON.stringify(pos))
      assert.equal(radiationAt(pos,map).intensity,0)
    }
  }
  assert.deepEqual(state.power,{});assert.deepEqual(state.gates,[])
})

test('real opening controls recover the rescue-locker module with no starting shields, at every render rate',()=>{
  let expected
  for(const hz of [60,30,120,144]) {
    const r=opening(),s=r.session,pilot=rescuePilot(r)
    let connected=false,recovering=false
    r.frames(hz,32,()=>{
      connected ||= s.refs.harpoonRef.current.state==='attached'
      recovering ||= !!s.refs.runtimeRef.current.recovery
      pilot()
    })
    assert.ok(connected&&recovering,'the lesson includes an actual grapple and Haven recovery')
    assert.equal(s.mode,'playing');assert.equal(s.expedition.campaign.deaths,0)
    assert.equal(s.expedition.impactShieldInstalled,true);assert.equal(s.expedition.shields,2)
    assert.equal(s.expedition.banked,0,'installation is free')
    assert.equal(s.refs.runtimeRef.current.objects.impact,undefined)
    const loaded=parseExpedition(JSON.stringify(s.expedition))
    assert.equal(loaded.impactShieldInstalled,true)
    assert.ok(!cargoBodies(loaded,freshRuntime()).some(body=>body.cargoId==='impact'))
    const actual=structuredClone({state:s.expedition,ship:s.refs.shipRef.current})
    if(expected)assert.deepEqual(actual,expected,`render rate ${hz}`)
    else expected=actual
  }
})

test('the rescue-locker lesson remains recoverable after reading time, without automatic installation',()=>{
  for(const seconds of [0,10,30]) {
    const r=opening(),s=r.session,pilot=rescuePilot(r)
    r.run(seconds*60)
    assert.equal(s.expedition.impactShieldInstalled,false)
    assert.equal(s.expedition.shields,0);assert.equal(s.expedition.campaign.havenAngle,0)
    for(let tick=0;tick<2400&&s.mode==='playing'&&!s.expedition.impactShieldInstalled;tick++)r.step(pilot)
    assert.equal(s.mode,'playing',`waited ${seconds} seconds`)
    assert.equal(s.expedition.impactShieldInstalled,true,`waited ${seconds} seconds`)
    assert.equal(s.expedition.campaign.deaths,0)
    r.stop();r.run(180)
    assert.ok(s.expedition.campaign.havenAngle>0,'normal idle motion resumes after installation')
  }
})
