import type { Expedition } from './expedition'
import { newExpedition } from './expedition.ts'
import type { CavernMap } from './worldGeometry'
import type { BaseShot, Harpoon, Rock, RockKind, TetherBody, Vector2 } from './types'
import { identifyBody } from './bodyDefinitions.ts'
import { inOreProcessingZone } from './oreCredits.ts'
import { BASE_GUN_INITIAL_COOLDOWNS } from './tuning.ts'
import { betweenReceiverPlates, receiverPlates } from './receivers.ts'
import { doorPanels, DOOR_OPEN_SECONDS } from './doors.ts'
import { updateBaseDefenseAndProcessing } from './baseDefense.ts'

export const TRAINING_SIZE = 2400
export const TRAINING_SPAWN = { x: 500, y: 570 }
export const TRAINING_SOCKET = { x: 1600, y: 1740 }
export const TRAINING_CELL = { x: 2110, y: 1590 }
export const TRAINING_LOG = {
  id: 'training-log', title: 'A clean recovery', speaker: 'MINING OPERATIONS · INSTRUCTOR LOG',
  text: 'Link confirmed. Your flight recorder now holds this briefing. Good mining is controlled work: make a clean cut, identify what you expose, and give a towed load room to settle. Speed is not the assessment. Bring the ore in without damaging the rig. The range dispenser will supply fresh rock for the next pass.',
  pos: { x: 1760, y: 2160 },
}
const rect = (x: number, y: number, w: number, h: number): Vector2[] => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]
export const TRAINING_EMITTER = {
  pos:{x:2240,y:620},outlet:{x:2180,y:620},radius:38,speed:42,
  interval:6,chargeSeconds:1.2,whiteStock:5,minimumStock:8,capacity:18,
}
export const TRAINING_EMITTER_HOUSINGS = [rect(2235,548,45,144),rect(2150,548,85,16),rect(2150,676,85,16)]
const TRAINING_FRAGMENT_RATES = {red:.25,blue:.35}
export const TRAINING_HOPPERS = [{ x: 460, y: 1940 }, { x: 920, y: 1940 }]
export const HOPPER_INNER_RADIUS = 148
export const HOPPER_OUTER_RADIUS = 166
export const HOPPER_ANGLE = Math.PI/2
export const HOPPER_ARCS = Array.from({length:3},(_,i)=>{
  const angle=HOPPER_ANGLE+i*Math.PI*2/3
  return {angle,start:angle-Math.PI/6,end:angle+Math.PI/6}
})
export const HOPPER_WALLS = TRAINING_HOPPERS.flatMap(p=>HOPPER_ARCS.map(({start,end})=>[
  ...Array.from({length:13},(_,i)=>start+(end-start)*i/12).map(a=>({x:p.x+Math.cos(a)*HOPPER_OUTER_RADIUS,y:p.y+Math.sin(a)*HOPPER_OUTER_RADIUS})),
  ...Array.from({length:13},(_,i)=>end-(end-start)*i/12).map(a=>({x:p.x+Math.cos(a)*HOPPER_INNER_RADIUS,y:p.y+Math.sin(a)*HOPPER_INNER_RADIUS})),
]))
export const TRAINING_GATE = {id:'training-door',kind:'socket',label:'RECORDS',x:1680,y:1960,w:160,h:20,color:'#65baff'} as const
export const TRAINING_WALLS = [rect(1400,1960,280,20),rect(1840,1960,100,20),rect(1400,1960,20,380),rect(1920,1960,20,380),rect(1400,2320,540,20)]
export const TRAINING_POWER_PATH = [{x:1678,y:1740},{x:1720,y:1740},{x:1800,y:1820},{x:1800,y:1900},{x:1836,y:1936},{x:1836,y:1970}]
export const TRAINING_POWER_TRACES = TRAINING_POWER_PATH.slice(1).map((b,i)=>({a:TRAINING_POWER_PATH[i],b}))
const FIXTURES = [...HOPPER_WALLS, ...TRAINING_EMITTER_HOUSINGS, ...receiverPlates(TRAINING_SOCKET), ...TRAINING_WALLS, rect(TRAINING_LOG.pos.x-24,TRAINING_LOG.pos.y-30,48,60)]
const INSTALLED_CELL = rect(TRAINING_SOCKET.x-10,TRAINING_SOCKET.y-15,20,30)
const base: CavernMap = { id: -1, name: 'Flight training', boundary: rect(0,0,TRAINING_SIZE,TRAINING_SIZE), obstacles: FIXTURES }
let mapProgress = -1, cachedMap = base
export function trainingMap(progress: number): CavernMap {
  if(progress!==mapProgress) {
    mapProgress=progress
    cachedMap={...base,obstacles:[...FIXTURES,...doorPanels(TRAINING_GATE,progress),...(progress>0 ? [INSTALLED_CELL] : [])]}
  }
  return cachedMap
}

export function trainingExpedition(): Expedition {
  const state = newExpedition()
  state.position = { ...TRAINING_SPAWN }
  state.campaign.records = []
  return state
}
export function freshTraining() {
  return {
    powered: false, charge: 0, door: 0, logRead: false, connected: false,
    processed: [0,0], pulses: [0,0], elapsed: 0,
    emitter:{cooldown:0,charge:0,flash:0,emitted:0,status:'stocked' as 'stocked'|'waiting'|'blocked'|'charging'},
    hoppers: TRAINING_HOPPERS.map(()=>({shots:{current:[] as BaseShot[]},cooldowns:{current:[...BASE_GUN_INITIAL_COOLDOWNS] as [number,number,number]}})),
    terminal: identifyBody<TetherBody>({pos:{...TRAINING_LOG.pos},vel:{x:0,y:0},radius:40}, {type:'terminal',id:TRAINING_LOG.id}),
  }
}
export type TrainingRuntime = ReturnType<typeof freshTraining>
type CreateRock = (x:number,y:number,radius:number,vel?:Vector2,kind?:RockKind) => Rock
export function populateTraining(create: CreateRock) {
  const rocks: Rock[] = [
    ...[[1510,510],[1780,690],[2120,520],[2010,920],[1540,960]].map(([x,y]) => create(x,y,38,{x:0,y:0})),
    create(690,1610,19,{x:0,y:0},'blue'), create(870,1510,19,{x:0,y:0},'blue'),
    create(1250,900,18,{x:0,y:0}),
    identifyBody(create(TRAINING_CELL.x,TRAINING_CELL.y,20,{x:0,y:0},'blue'), {type:'cell',id:'training-cell'}),
  ]
  for (const rock of rocks) rock.fragmentRates = {...TRAINING_FRAGMENT_RATES}
  return rocks
}

/** A slow, interlocked feed replenishes the range without filling it with debris.
 * Only white parent rock is dispensed; volatile red inclusions come from mining. */
export function stepTrainingEmitter(rt: TrainingRuntime, rocks: Rock[], ship: Pick<TetherBody,'pos'|'radius'>, create: CreateRock, dt: number) {
  const feed=rt.emitter,rig=TRAINING_EMITTER
  feed.cooldown=Math.max(0,feed.cooldown-dt);feed.flash=Math.max(0,feed.flash-dt)
  const ore=rocks.filter(r=>!r.sourceId && !r.socketId)
  const white=ore.filter(r=>r.kind==='normal' && r.radius>20)
  if(ore.length>=rig.capacity || ore.length>=rig.minimumStock && white.length>=rig.whiteStock) {
    feed.charge=0;feed.status='stocked';return
  }
  // Keep the loading pocket and the first stretch of the outlet clear. Recheck
  // throughout charging, so a pilot or moving load can safely interrupt a feed.
  const blocked=[ship,...rocks].some(body=>{
    const x=Math.max(rig.outlet.x-150,Math.min(rig.outlet.x,body.pos.x))
    return Math.hypot(body.pos.x-x,body.pos.y-rig.outlet.y)<body.radius+rig.radius+16
  })
  if(blocked) {feed.charge=0;feed.status='blocked';return}
  if(feed.cooldown>0) {feed.charge=0;feed.status='waiting';return}
  feed.status='charging';feed.charge=Math.min(1,feed.charge+dt/rig.chargeSeconds)
  if(feed.charge<1) return
  const rock=create(rig.outlet.x,rig.outlet.y,rig.radius,{x:-rig.speed,y:0},'normal')
  rock.fragmentRates={...TRAINING_FRAGMENT_RATES}
  rocks.push(rock)
  feed.emitted++;feed.cooldown=rig.interval;feed.charge=0;feed.flash=.6;feed.status='waiting'
}

/** Same ore valuation and receiver tolerances as the expedition; no save state. */
export function stepTraining(rt: TrainingRuntime, state: Expedition, rocks: Rock[], harpoon: Harpoon, dt: number) {
  if(harpoon.state==='attached' && !harpoon.rock.anchored) harpoon.rock.tethered=true
  rt.elapsed += dt
  rt.pulses = rt.pulses.map(p=>Math.max(0,p-dt))
  const removed: Rock[] = []
  for(const rock of rocks) {
    if(!TRAINING_HOPPERS.some(pos=>inOreProcessingZone(rock,{pos,radius:HOPPER_INNER_RADIUS}))) rock.inBaseTime=0
  }
  for(const [i,pos] of TRAINING_HOPPERS.entries()) {
    const hopper=rt.hoppers[i], base={pos,radius:HOPPER_INNER_RADIUS}
    // Each processor owns its dwell timers and shots. A second hopper must not
    // reset the first one's target, and cells remain immune to the mining guns.
    const local=rocks.filter(r=>r.kind==='blue' && inOreProcessingZone(r,base))
    for(const rock of local) if(!rock.sourceId && !rock.socketId) {
      rock.vel.x*=Math.exp(-4*dt);rock.vel.y*=Math.exp(-4*dt)
    }
    const localRef={current:[...local]},before=state.banked
    updateBaseDefenseAndProcessing({
      dt,baseX:pos.x,baseY:pos.y,MINING_BASE_RADIUS:HOPPER_INNER_RADIUS,
      miningBaseAngleRef:{current:HOPPER_ANGLE},miningGunCooldownsRef:hopper.cooldowns,
      baseShotsRef:hopper.shots,rocksRef:localRef,expedition:state,createDebris:()=>{},
    })
    removed.push(...local.filter(rock=>!localRef.current.includes(rock)))
    if(state.banked>before) {rt.processed[i]+=state.banked-before;rt.pulses[i]=.8}
  }
  if (!rt.powered) {
    const cell = rocks.find(r=>r.sourceId==='training-cell')
    if (cell && betweenReceiverPlates(cell,TRAINING_SOCKET)) {
      cell.socketId='training-socket'
      const ease=1-Math.exp(-7*dt)
      cell.pos.x+=(TRAINING_SOCKET.x-cell.pos.x)*ease;cell.pos.y+=(TRAINING_SOCKET.y-cell.pos.y)*ease
      cell.vel.x*=Math.exp(-12*dt);cell.vel.y*=Math.exp(-12*dt)
      rt.charge = Math.hypot(cell.pos.x-TRAINING_SOCKET.x,cell.pos.y-TRAINING_SOCKET.y)<7 && Math.hypot(cell.vel.x,cell.vel.y)<15 ? rt.charge+dt : 0
      if (rt.charge>=.2) { rt.powered=true;removed.push(cell) }
    } else { rt.charge=0; if(cell) delete cell.socketId }
  }
  rt.door=Math.min(1,rt.door+(rt.powered ? dt/DOOR_OPEN_SECONDS : 0))
  rt.connected=harpoon.state==='attached' && harpoon.rock===rt.terminal
  if (rt.connected) rt.logRead=true
  for (const rock of removed) rocks.splice(rocks.indexOf(rock),1)
  return removed
}
