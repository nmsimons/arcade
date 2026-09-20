import type { TrainingRuntime } from './training'
import { HOPPER_ARCS, HOPPER_INNER_RADIUS, HOPPER_OUTER_RADIUS, TRAINING_EMITTER, TRAINING_EMITTER_HOUSINGS, TRAINING_GATE, TRAINING_HOPPERS, TRAINING_LOG, TRAINING_POWER_PATH, TRAINING_POWER_TRACES, TRAINING_SIZE, TRAINING_SOCKET } from './training'
import { drawExpeditionObject } from './objectModels'
import type { HintAction } from './controlHints'
import { drawTerminals } from './terminalRender'
import type { Expedition } from './expedition'
import type { Ship } from './types'
import { drawGateObject } from './gateRender'
import { drawPowerCircuit, drawReceiverCurrent } from './powerRender'

export type FloorHint = (action: HintAction, keyboard: string) => string
export function floorText(ctx: CanvasRenderingContext2D, x: number, y: number, title: string, lines: string[], color='#8aa99f', size=16) {
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle'
  ctx.fillStyle=color;ctx.font=`600 ${size+5}px monospace`;ctx.fillText(title,x,y)
  ctx.strokeStyle=color+'60';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-28,y+21);ctx.lineTo(x+28,y+21);ctx.stroke()
  ctx.font=`${size}px monospace`
  lines.forEach((line,i)=>ctx.fillText(line,x,y+48+i*25))
  ctx.restore()
}

function drawTrainingEmitter(ctx: CanvasRenderingContext2D, rt: TrainingRuntime) {
  const {pos,outlet}=TRAINING_EMITTER,feed=rt.emitter
  const live=feed.status==='charging',color=feed.status==='blocked' ? '#dca873' : live || feed.flash>0 ? '#a3e5cf' : '#75988b'
  ctx.save();ctx.lineJoin='bevel';ctx.lineWidth=1.4
  // A recessed loading pocket between two guide rails, open toward the range.
  ctx.fillStyle='#0d1c18';ctx.fillRect(2150,564,85,112)
  ctx.strokeStyle='#344e43';ctx.lineWidth=1
  for(const y of [584,620,656]) {ctx.beginPath();ctx.moveTo(2150,y);ctx.lineTo(2235,y);ctx.stroke()}
  for(const hull of TRAINING_EMITTER_HOUSINGS) {
    ctx.beginPath();hull.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));ctx.closePath()
    ctx.fillStyle='#18271f';ctx.fill();ctx.strokeStyle='#8ba495';ctx.lineWidth=1.4;ctx.stroke()
  }
  ctx.fillStyle='#0a1411';ctx.fillRect(2243,560,29,120)
  ctx.strokeStyle='#435f50';ctx.lineWidth=1
  for(let y=574;y<=664;y+=15) {ctx.beginPath();ctx.moveTo(2249,y);ctx.lineTo(2266,y);ctx.stroke()}
  // Charge bars, sliding feed ram and a short discharge glow make replenishment visible.
  for(let i=0;i<5;i++) {
    ctx.fillStyle=feed.flash>0 || feed.charge>(i/5) ? '#a3e5cf' : '#2f4a3b'
    ctx.fillRect(2156+i*15,552,9,7)
  }
  const ram=2230-(live ? feed.charge*8 : feed.flash*22)
  ctx.fillStyle='#334c3e';ctx.fillRect(ram,577,5,86)
  ctx.strokeStyle=color;ctx.lineWidth=2
  for(const y of [572,662]) {ctx.beginPath();ctx.moveTo(2150,y);ctx.lineTo(2150,y+6);ctx.stroke()}
  if(feed.flash>0) {
    ctx.strokeStyle=`rgba(163,229,207,${feed.flash})`;ctx.lineWidth=2
    for(const y of [-47,47]) {ctx.beginPath();ctx.moveTo(outlet.x-65,outlet.y+y);ctx.lineTo(outlet.x,outlet.y+y);ctx.stroke()}
  }
  ctx.strokeStyle='#9f906255';ctx.lineWidth=1
  for(const y of [538,702]) for(const x of [2080,2110,2140]) {
    ctx.beginPath();ctx.moveTo(x+5,y-4);ctx.lineTo(x,y);ctx.lineTo(x+5,y+4);ctx.stroke()
  }
  ctx.textAlign='center';ctx.font='10px monospace';ctx.fillStyle='#8fa899'
  ctx.fillText('ROCK DISPENSER',pos.x-24,518)
  ctx.font='9px monospace';ctx.fillStyle=color
  ctx.fillText(feed.status==='blocked' ? 'OUTLET OBSTRUCTED' : live ? 'FEED CHARGING' : feed.status==='stocked' ? 'RANGE STOCKED' : 'AUTO FEED',pos.x-24,725)
  ctx.restore()
}

export function drawTrainingFloor(ctx: CanvasRenderingContext2D, rt: TrainingRuntime, hint: FloorHint, state: Expedition, ship: Ship) {
  ctx.save()
  // World-locked marks stay still as the camera moves: a reference for drift.
  ctx.lineWidth=1;ctx.strokeStyle='#6eaaa010';ctx.beginPath()
  for(let n=0;n<=TRAINING_SIZE;n+=50) {ctx.moveTo(n,0);ctx.lineTo(n,TRAINING_SIZE);ctx.moveTo(0,n);ctx.lineTo(TRAINING_SIZE,n)}
  ctx.stroke();ctx.strokeStyle='#6eaaa021';ctx.beginPath()
  for(let n=0;n<=TRAINING_SIZE;n+=250) {ctx.moveTo(n,0);ctx.lineTo(n,TRAINING_SIZE);ctx.moveTo(0,n);ctx.lineTo(TRAINING_SIZE,n)}
  ctx.stroke()
  ctx.setLineDash([12,18]);ctx.strokeStyle='#80b8a02a';ctx.strokeRect(70,70,2260,2260)
  ctx.beginPath();ctx.moveTo(1200,100);ctx.lineTo(1200,2300);ctx.moveTo(100,1200);ctx.lineTo(2300,1200);ctx.stroke();ctx.setLineDash([])
  floorText(ctx,500,290,'01 / FLIGHT HANDLING',[
    `${hint('turnLeft','A')} / ${hint('turnRight','D')}  ROTATE`,
    `${hint('thrust','W')}  THRUST     ${hint('reverse','S')}  REVERSE`,
    'Use short burns. Coast between corrections.',
    'Nose thrusters push aft; they do not cancel drift.',
    'Face your drift, then reverse to brake.',
  ])
  floorText(ctx,500,710,'MINER INDUCTION / TRAINING RIG',[
    'Unshielded hull. Keep clear of walls and cargo.',
    'Hull loss resets the simulator.',
    'Repeat each manoeuvre until you can stop cleanly.',
    `${hint('pause','Esc')}  PAUSE / RESTART / EXIT`,
  ],'#83978e',14)
  floorText(ctx,890,1050,'EXTRACTION →',['ORE HANDLING ↓'], '#628779',14)
  floorText(ctx,1760,160,'02 / EXTRACTION RANGE',[
    `HOLD ${hint('laser','Space')}  CUTTING LASER`,
    'Keep the beam steady until the rock fractures.',
    'Release to recharge the capacitor.',
    'Fresh rock feeds from the dispenser.',
  ])
  floorText(ctx,1760,760,'MATERIAL IDENTIFICATION',[
    'WHITE / fracture for mineral recovery',
    'BLUE / dense ore — deliver to a refinery',
    'RED / volatile inclusion — keep clear',
    'Red fragments ignite on impact or laser contact.',
  ],'#b5a494',15)
  drawTrainingEmitter(ctx,rt)
  floorText(ctx,680,1300,'03 / ORE HANDLING',[
    `TAP ${hint('tether','F')}  TETHER / RELEASE`,
    'Align the nose with your load before connecting.',
    'Allow space for the load to swing behind you.',
    'Deliver blue ore through any refinery opening.',
    'A short laser burst will nudge dense ore.',
  ],'#84b3c8')
  for (const [i,p] of TRAINING_HOPPERS.entries()) {
    ctx.fillStyle='#0b191b';ctx.beginPath();ctx.arc(p.x,p.y,HOPPER_INNER_RADIUS,0,Math.PI*2);ctx.fill()
    ctx.strokeStyle='#67bbdf38';ctx.lineWidth=1;ctx.setLineDash([5,9]);ctx.beginPath();ctx.arc(p.x,p.y,HOPPER_INNER_RADIUS-30,0,Math.PI*2);ctx.stroke();ctx.setLineDash([])
    for(const {angle,start,end} of HOPPER_ARCS) {
      ctx.beginPath();ctx.arc(p.x,p.y,HOPPER_OUTER_RADIUS,start,end)
      ctx.arc(p.x,p.y,HOPPER_INNER_RADIUS,end,start,true);ctx.closePath()
      ctx.fillStyle='#20392e';ctx.fill();ctx.strokeStyle='#9ab3a4';ctx.lineWidth=1.4;ctx.stroke()
      ctx.beginPath();ctx.arc(p.x,p.y,HOPPER_OUTER_RADIUS-5,start+.035,end-.035)
      ctx.strokeStyle='#4b6958';ctx.lineWidth=2;ctx.stroke()
      const x=p.x+Math.cos(angle)*HOPPER_INNER_RADIUS*.63,y=p.y+Math.sin(angle)*HOPPER_INNER_RADIUS*.63
      ctx.fillStyle='#15281e';ctx.strokeStyle='#536f5e';ctx.lineWidth=1
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.stroke()
      ctx.fillStyle='#cdd9d1';ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill()
    }
    ctx.font='13px monospace';ctx.textAlign='center';ctx.fillStyle='#93b5c2'
    ctx.fillText(`HOPPER 0${i+1}`,p.x,p.y+192)
    ctx.fillText(`${rt.processed[i].toLocaleString()} CR`,p.x,p.y+215)
    ctx.fillStyle='#69a2b9';ctx.fillText('↓ BLUE ORE INTAKE ↓',p.x,p.y-190)
    if(rt.pulses[i]>0) { ctx.fillStyle=`rgba(101,239,178,${rt.pulses[i]*.12})`;ctx.beginPath();ctx.arc(p.x,p.y,HOPPER_INNER_RADIUS-30,0,Math.PI*2);ctx.fill() }
  }
  floorText(ctx,680,2180,'REFINERY / TRAINING ACCOUNT',[
    'Release ore inside the processing ring.',
    'Stand clear while the refinery lasers cycle.',
  ],'#789393',13)
  floorText(ctx,1770,1260,'04 / AUXILIARY SYSTEMS',[
    'Recover the caged power cell.',
    'Seat it between the supply contacts.',
    'Confirm the link is live.',
    'Enter the records room and retrieve the briefing.',
  ],'#9aafa0',15)
  drawPowerCircuit(ctx,TRAINING_POWER_TRACES,[TRAINING_POWER_PATH[0],TRAINING_POWER_PATH.at(-1)!],rt.powered,rt.elapsed)
  drawExpeditionObject(ctx,'socket',TRAINING_SOCKET,{active:rt.powered,time:rt.elapsed})
  if(rt.powered) drawReceiverCurrent(ctx,TRAINING_SOCKET,rt.elapsed)
  ctx.font='13px monospace';ctx.fillStyle=rt.powered ? '#99d6af' : '#adb4a7';ctx.textAlign='center'
  ctx.fillText(rt.powered ? 'RECORDS / ONLINE' : 'RECORDS / NO SUPPLY',1600,1810)
  drawGateObject(ctx,TRAINING_GATE,rt.door)
  drawTerminals(ctx,state,{elapsed:rt.elapsed,connectedTerminal:rt.connected ? TRAINING_LOG.id : undefined},ship,[rt.terminal])
  ctx.fillStyle='#88bdaa';ctx.font='13px monospace'
  ctx.fillText('INSTRUCTOR RECORDING',1760,2240)
  ctx.restore()
}
