import test from 'node:test'
import assert from 'node:assert/strict'
import { ARRIVAL_POSITION, DEPARTURE_ROUTE, OUTER_LOCK } from '../src/games/hardVacuum/campaignWorld.ts'
import { departureBlocker, launchHaven, routeClear, stepHaven } from '../src/games/hardVacuum/campaign.ts'
import { blastGate, expeditionMap, freshExpedition, newExpedition, parseExpedition, sectorAt } from '../src/games/hardVacuum/expedition.ts'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { SURVIVAL_PODS } from '../src/games/hardVacuum/survivalPods.ts'
import { SAVE_SCHEMA_VERSION } from '../src/games/hardVacuum/saveMigrations.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { radiationAt } from '../src/games/hardVacuum/radiation.ts'
import { debrisField } from '../src/games/hardVacuum/debrisField.ts'
import { replay } from './helpers/sessionReplay.mjs'

const ready=()=>{const s=freshExpedition();s.core=true;s.rescuedPods=SURVIVAL_PODS.map(p=>p.id);return s}

test('new games enter from the outer tunnel facing inward; continued saves keep their position',()=>{
  const s=newExpedition(),session=createGameSession()
  assert.deepEqual(s.position,ARRIVAL_POSITION);assert.equal(sectorAt(s.position).id,'arrival')
  session.command({type:'start',fresh:true})
  assert.deepEqual(session.refs.shipRef.current.pos,ARRIVAL_POSITION)
  assert.equal(session.refs.shipRef.current.angle,Math.PI)
  session.command({type:'load',expedition:freshExpedition('refuge')})
  assert.deepEqual(session.refs.shipRef.current.pos,freshExpedition('refuge').position)
})

test('the outer lock stays sealed to the pilot until Haven is authorized to launch',()=>{
  const s=ready(),center={x:OUTER_LOCK.x+12,y:2900}
  assert.equal(isInsideCavern(center,15,expeditionMap(s)),false)
  assert.equal(isInsideCavern(center,70,expeditionMap(s)),false)
  assert.equal(blastGate(s,center),false)
  assert.equal(isInsideCavern(center,15,expeditionMap(s)),false)
  assert.equal(routeClear(DEPARTURE_ROUTE,expeditionMap(s)),false)
  assert.ok(launchHaven(s,expeditionMap(s)))
  assert.ok(routeClear(DEPARTURE_ROUTE,expeditionMap(s)))
})

test('launch clearance ignores only the outer lock, never other obstructions',()=>{
  const s=ready(),map=expeditionMap(s)
  const obstruction=[{x:8660,y:2790},{x:8700,y:2790},{x:8700,y:3030},{x:8660,y:3030}]
  assert.equal(launchHaven(s,{...map,obstacles:[...map.obstacles,obstruction]}),false)
  assert.equal(s.campaign.journey,undefined)
})

test('the introductory flight has no radiation or authored debris before the Breach',()=>{
  const s=newExpedition(),map=expeditionMap(s)
  const approach=[...DEPARTURE_ROUTE.slice(0,-1),ARRIVAL_POSITION]
  for(let i=1;i<approach.length;i++)for(let j=0;j<=100;j++) {
    const a=approach[i-1],b=approach[i],p={x:a.x+(b.x-a.x)*j/100,y:a.y+(b.y-a.y)*j/100}
    assert.equal(radiationAt(p,map).intensity,0,JSON.stringify(p))
    assert.ok(isInsideCavern(p,15,map))
  }
  assert.ok(debrisField(s).every(rock=>sectorAt(rock.pos)?.id!=='arrival'))
  const r=replay(s)
  // Fly the clean approach into the Breach. The main bay still has its authored
  // early-game asteroid hazards; this check stops before entering that field.
  for(const target of [...DEPARTURE_ROUTE.slice(2,-1)].reverse()) {
    for(let i=0;i<1500&&r.session.mode==='playing'&&Math.hypot(r.session.refs.shipRef.current.pos.x-target.x,r.session.refs.shipRef.current.pos.y-target.y)>35;i++)r.step(()=>r.fly(target,85))
    assert.equal(r.session.mode,'playing')
  }
  assert.ok(r.session.expedition.visited.includes('breach'))
  assert.equal(r.session.expedition.impactShieldInstalled,false)
})

test('every missing pod, missing power, wrong berth, or undocked pilot prevents launch',()=>{
  for(const pod of SURVIVAL_PODS) {
    const s=ready();s.rescuedPods=s.rescuedPods.filter(id=>id!==pod.id)
    assert.equal(departureBlocker(s),'Passengers missing.')
    assert.equal(launchHaven(s,expeditionMap(s)),false)
  }
  const unpowered=ready();unpowered.core=false
  assert.equal(launchHaven(unpowered,expeditionMap(unpowered)),false)
  const away={...ready(),campaign:freshExpedition('refuge').campaign}
  assert.match(departureBlocker(away),/Breach/);assert.equal(launchHaven(away,expeditionMap(away)),false)
  const session=createGameSession(ready());session.command({type:'start'});session.command({type:'launch'})
  assert.equal(session.expedition.campaign.journey,undefined)
})

test('departure folds Haven and physically traverses the shared tunnel before winning; every phase reloads',()=>{
  let s=ready();assert.ok(launchHaven(s,expeditionMap(s)))
  assert.equal(launchHaven(s,expeditionMap(s)),false)
  assert.equal(s.complete,false);assert.equal(s.campaign.journey.phase,'folding')
  const money=s.banked,seen=new Set()
  for(let i=0;i<1800&&!s.complete;i++) {
    stepHaven(s,1/60);seen.add(s.campaign.journey.phase)
    assert.ok(isInsideCavern(s.campaign.haven,70,expeditionMap(s)))
    if(i%40===0) {const loaded=parseExpedition(JSON.stringify(s));assert.ok(loaded);s=loaded}
  }
  assert.equal(s.complete,true);assert.deepEqual([...seen],['folding','transit'])
  assert.deepEqual(s.campaign.haven,DEPARTURE_ROUTE.at(-1));assert.equal(s.banked,money)
  assert.ok(parseExpedition(JSON.stringify(s)))
})

test('old rescue victories retain everyone and their reward, but reopen the physical departure',()=>{
  const s=ready();s.version=8;s.complete=true;s.banked=72000
  const loaded=parseExpedition(JSON.stringify(s))
  assert.ok(loaded);assert.equal(loaded.version,SAVE_SCHEMA_VERSION);assert.equal(loaded.complete,false)
  assert.deepEqual(loaded.rescuedPods,s.rescuedPods);assert.equal(loaded.banked,72000);assert.ok(loaded.core)
})

test('departure saves reject forged routes, missing survivors, unmanned flights, and wrong destinations',()=>{
  const s=ready();launchHaven(s,expeditionMap(s))
  for(const mutate of [s=>s.rescuedPods.pop(),s=>s.core=false,s=>s.campaign.journey.riding=false,
    s=>s.campaign.journey.points[2].x+=100,s=>s.campaign.journey.destination='refuge',s=>s.campaign.journey.phase='deploying']) {
    const invalid=structuredClone(s);mutate(invalid);assert.equal(parseExpedition(JSON.stringify(invalid)),null)
  }
})
