import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { freshExpedition, expeditionMap, powerReceiver, cargoBodies, SOCKETS, GATES } from '../src/games/hardVacuum/expedition.ts'
import { BERTHS } from '../src/games/hardVacuum/campaignWorld.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { moveHaven } from '../src/games/hardVacuum/campaign.ts'
import { seededRandom } from '../src/games/hardVacuum/random.ts'

export const SCENES=['late-field','red-chain','bot-towing','moving-haven','opening-doors','radiation-flight']
export const BENCHMARK_SEED=713

/** Initial fixtures only: all subsequent motion, collisions and effects use the real session. */
export function createScene(name, density=1) {
  if(!SCENES.includes(name)||![1,3].includes(density))throw new Error('Unknown benchmark fixture')
  const state=freshExpedition(name==='radiation-flight'?'refuge':'heart')
  for(const socket of SOCKETS)powerReceiver(state,socket.id,socket.id)
  state.gates=GATES.map(g=>g.id);state.doors={};state.botDoors={}
  state.campaign.berths=BERTHS.map(b=>b.id)
  state.upgrades=['radiation'];state.upgradeLevels={hull:5};state.impactShieldInstalled=true;state.shields=8;state.radiationCharge=100
  if(name==='radiation-flight')state.position={x:750,y:4090}
  if(name==='opening-doors') {
    state.position={x:5310,y:3310}
    state.doors=Object.fromEntries(GATES.filter(g=>g.kind==='socket').map(g=>[g.id,0]))
  }
  if(name==='bot-towing')state.position={x:4470,y:4400}
  const session=createGameSession(state,{seed:BENCHMARK_SEED,cosmeticRandom:seededRandom(23)})
  session.command({type:'start'});session.drainEvents()
  const {rocksRef,botsRef,shipRef,runtimeRef}=session.refs,map=expeditionMap(session.expedition)
  const random=seededRandom(819)
  if(density===3) {
    const original=rocksRef.current.filter(b=>!b.sourceId)
    for(const rock of original)for(let copy=0;copy<2;copy++) {
      for(let attempt=0;attempt<30;attempt++) {
        const x=rock.pos.x+(random()-.5)*280,y=rock.pos.y+(random()-.5)*280
        if(!isInsideCavern({x,y},rock.radius+2,map))continue
        const extra=session.createRock(x,y,rock.radius,{...rock.vel},rock.kind)
        extra.fragmentRates=rock.fragmentRates;rocksRef.current.push(extra);break
      }
    }
  }
  if(name==='red-chain')for(let i=0;i<7;i++) {
    const rock=session.createRock(3780+(i%4)*62,3450+Math.floor(i/4)*62,24,{x:0,y:0},'red')
    if(!isInsideCavern(rock.pos,rock.radius,map))throw new Error('Invalid red-chain fixture')
    if(i===0)rock.redFuseS=.1
    rocksRef.current.push(rock)
  }
  if(name==='bot-towing') {
    const bot=botsRef.current.units.find(b=>b.botId==='coil-tug')
    const cargo=cargoBodies(session.expedition,runtimeRef.current).find(b=>b.cargoId==='field-cache')
    if(!cargo)throw new Error('Missing coil cargo')
    bot.pos={x:4280,y:4470};bot.phase='watch';bot.anchored=false;bot.timer=0
    cargo.pos={x:4410,y:4470};cargo.vel={x:0,y:0};bot.target=cargo
    bot.maintenance={mode:'salvage',cycle:0,age:0,holding:0,cableLength:92,drop:{x:4150,y:4570}}
    if(!isInsideCavern(bot.pos,bot.radius,map)||!isInsideCavern(cargo.pos,cargo.radius,map))throw new Error('Invalid towing fixture')
  }
  if(name==='moving-haven') {
    if(!moveHaven(session.expedition,'refuge',true,map))throw new Error('Invalid Haven route')
    // Measure transit rather than the stationary folding animation.
    for(let tick=0;tick<180;tick++){session.step();session.drainEvents()}
    const haven=session.expedition.campaign.haven
    for(let i=0;i<8*density;i++) {
      const point={x:haven.x-70-i*23,y:haven.y+(i%3-1)*24}
      if(isInsideCavern(point,16,map))rocksRef.current.push(session.createRock(point.x,point.y,16,{x:0,y:0}))
    }
  }
  const initial={ship:{...shipRef.current.pos},haven:{...session.expedition.campaign.haven},charge:session.expedition.radiationCharge}
  let tick=0
  const control=()=>{
    if(name==='radiation-flight') {
      const ship=shipRef.current,angle=Math.atan2(4090-ship.pos.y,2250-ship.pos.x)
      const error=Math.atan2(Math.sin(angle-ship.angle),Math.cos(angle-ship.angle))-(ship.angularVelocity??0)*.065
      for(const [key,pressed] of [['a',error<-.025],['d',error>.025],['w',Math.abs(error)<.3&&Math.hypot(ship.vel.x,ship.vel.y)<200]]) {
        if(session.refs.keysRef.current.has(key)!==pressed)session.command({type:'key',key,pressed})
      }
    }
    tick++
  }
  const observe=()=>({
    bodies:rocksRef.current.length+Object.keys(runtimeRef.current.objects).length+botsRef.current.units.length+1,
    nearby:rocksRef.current.filter(b=>Math.hypot(b.pos.x-shipRef.current.pos.x,b.pos.y-shipRef.current.pos.y)<720).length,
    particles:session.refs.debrisRef.current.length+session.refs.phaserParticlesRef.current.length,
    armedRed:rocksRef.current.filter(b=>b.redFuseS!==undefined).length,
    botTethers:botsRef.current.units.filter(b=>b.target).length,
    openingDoors:Object.keys(session.expedition.doors).length+Object.keys(session.expedition.botDoors??{}).length,
    havenImpact:runtimeRef.current.havenImpact??0,
  })
  const outcome=()=>({mode:session.mode,ticks:tick,shipDistance:Math.hypot(shipRef.current.pos.x-initial.ship.x,shipRef.current.pos.y-initial.ship.y),havenDistance:Math.hypot(session.expedition.campaign.haven.x-initial.haven.x,session.expedition.campaign.haven.y-initial.haven.y),chargeUsed:initial.charge-session.expedition.radiationCharge})
  return {session,control,observe,outcome}
}
