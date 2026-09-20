import assert from 'node:assert/strict'
import test from 'node:test'
import { CONTROLLER, controllerHavenAction, createControllerReader, stickAxis, triggerPressure } from '../src/games/hardVacuum/controllerInput.ts'
import { flightInput, neutralController, sanitizeController } from '../src/games/hardVacuum/flightInput.ts'
import { lateralJetDemand } from '../src/games/hardVacuum/shipAppearance.ts'
import { SHIP_MAX_SPEED, SHIP_STRAFE_ACCELERATION } from '../src/games/hardVacuum/tuning.ts'
import { stepShipMovement } from '../src/games/hardVacuum/expeditionPhysics.ts'
import { freshShipAppearance, stepShipAppearance } from '../src/games/hardVacuum/shipRender.ts'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { DEFAULT_CONTROLLER_LAYOUT, controllerButtonLabel, controllerFlightHelp } from '../src/games/hardVacuum/controllerLayouts.ts'

const pad = (index=0,id='Test controller') => ({index,id,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))})
const button = (p,index,value) => {p.buttons[index]={pressed:value>=.5,value}}
const launch = () => {
  const state=freshExpedition();state.position={x:7800,y:3490};state.impactShieldInstalled=true;state.shields=2;state.blasterInstalled=true;state.blasterCharges=3
  const s=createGameSession(state,{seed:123,cosmeticRandom:()=>.5});s.command({type:'start'});s.refs.rocksRef.current=[];s.drainEvents();return s
}
const input = (s,patch) => s.command({type:'controller',input:{...neutralController(),...patch}})
const run = (s,ticks=1) => {for(let i=0;i<ticks;i++)s.step()}

test('left stick only rotates; RT thrusts, LT reverses, X tethers, A lasers and B blasts',()=>{
  const p=pad(),reader=createControllerReader();reader.sample([null,p],'flight',0)
  assert.deepEqual(CONTROLLER,{confirm:0,back:1,mapOverview:3,mapZoom:2,laser:0,tether:2,blaster:1,interact:3,journal:11,reverse:6,teleport:3,thrust:7,strafeLeft:4,strafeRight:5,map:8,pause:9})
  for(const y of [-1,1,0]) {
    p.axes[1]=y
    assert.deepEqual(reader.sample([p],'flight',16).flight,neutralController())
  }
  p.axes[0]=.59;button(p,7,.525);button(p,0,1);button(p,1,1);button(p,2,1)
  const frame=reader.sample([p],'flight',32)
  assert.ok(Math.abs(frame.flight.turn-.5)<1e-9)
  assert.ok(Math.abs(frame.flight.thrust-.5)<1e-9)
  assert.equal(frame.flight.reverse,0);assert.equal(frame.flight.laser,true)
  assert.deepEqual(frame.pressed,[0,1,2,7])
  button(p,7,0);button(p,6,1)
  const reverse=reader.sample([p],'flight',48).flight
  assert.equal(reverse.reverse,1);assert.equal(reverse.thrust,0)
  p.axes[0]=0;button(p,0,0);button(p,6,0)
  assert.deepEqual(reader.sample([p],'flight',64).flight,neutralController())
})

test('bumpers strafe continuously, cancel when held together, and honor layout remapping',()=>{
  for(const layout of [DEFAULT_CONTROLLER_LAYOUT,{...DEFAULT_CONTROLLER_LAYOUT,buttons:{...CONTROLLER,strafeLeft:10,strafeRight:11,journal:4}}]) {
    const p=pad(),reader=createControllerReader(layout);reader.sample([p],'flight',0)
    const {strafeLeft:left,strafeRight:right}=layout.buttons
    button(p,left,1)
    for(const time of [16,32,500])assert.equal(reader.sample([p],'flight',time).flight.strafe,-1)
    button(p,right,1);assert.equal(reader.sample([p],'flight',516).flight.strafe,0)
    button(p,left,0);assert.equal(reader.sample([p],'flight',532).flight.strafe,1)
    button(p,right,0);assert.deepEqual(reader.sample([p],'flight',548).flight,neutralController())
  }
})

test('held bumpers stay neutral across connection, menus, focus loss and disconnection',()=>{
  for(const index of [CONTROLLER.strafeLeft,CONTROLLER.strafeRight]) {
    const p=pad(),reader=createControllerReader();button(p,index,1)
    assert.deepEqual(reader.sample([p],'flight',0).flight,neutralController())
    for(const [screen,focused] of [['menu:pause',true],['flight',false]]) {
      button(p,index,0);reader.sample([p],'flight',16)
      button(p,index,1);assert.notEqual(reader.sample([p],'flight',32).flight.strafe,0)
      assert.deepEqual(reader.sample([p],screen,48,focused).flight,neutralController())
      assert.deepEqual(reader.sample([p],'flight',64).flight,neutralController())
    }
    assert.deepEqual(reader.sample([],'flight',80).flight,neutralController())
    assert.deepEqual(reader.sample([p],'flight',96).flight,neutralController())
  }
})

test('strafe input is bounded and malformed or missing input is neutral',()=>{
  for(const strafe of [undefined,NaN,Infinity,-Infinity])assert.equal(sanitizeController({...neutralController(),strafe}).strafe,0)
  for(const strafe of [-4,-1,-.5,0,.5,1,4])assert.equal(sanitizeController({...neutralController(),strafe}).strafe,Math.max(-1,Math.min(1,strafe)))
  assert.equal(flightInput(new Set()).strafe,0)
})

test('side thrusters translate in ship-relative directions without rotation and share the speed cap',()=>{
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const strafe of [-1,1]) {
    const ship={pos:{x:0,y:0},vel:{x:0,y:0},angle,radius:15}
    stepShipMovement(ship,new Set(),1/60,{...neutralController(),strafe})
    assert.equal(ship.angle,angle);assert.equal(ship.angularVelocity,0)
    const right=ship.vel.x*-Math.sin(angle)+ship.vel.y*Math.cos(angle)
    const forward=ship.vel.x*Math.cos(angle)+ship.vel.y*Math.sin(angle)
    assert.ok(Math.abs(forward)<1e-9)
    assert.ok(right*strafe>0 && right*strafe<=SHIP_STRAFE_ACCELERATION/60)
    for(let i=0;i<600;i++)stepShipMovement(ship,new Set(),1/60,{...neutralController(),thrust:1,strafe})
    assert.ok(Math.hypot(ship.vel.x,ship.vel.y)<=SHIP_MAX_SPEED)
  }
})

test('side jets oppose the strafe force, combine with turning, and stop on release',()=>{
  for(const strafe of [-1,1])assert.deepEqual(lateralJetDemand(0,strafe),{bow:-strafe,stern:-strafe})
  assert.deepEqual(lateralJetDemand(1,0),{bow:-1,stern:.72})
  assert.deepEqual(lateralJetDemand(-1,0),{bow:1,stern:-.72})
  for(const strafe of [-1,0,1])for(const turn of [-1,0,1])for(const demand of Object.values(lateralJetDemand(turn,strafe)))assert.ok(Number.isFinite(demand)&&Math.abs(demand)<=1)
  const appearance=freshShipAppearance()
  stepShipAppearance(appearance,new Set(),1/60,0,{...neutralController(),strafe:1})
  assert.equal(appearance.strafe,1);assert.equal(appearance.bank,0)
  stepShipAppearance(appearance,new Set(),1/60,0,neutralController())
  assert.equal(appearance.strafe,0)
})

test('stick dead zone rejects drift and invalid data and rescales the remaining travel',()=>{
  for(const value of [0,.1,-.18,NaN,Infinity,-Infinity])assert.equal(stickAxis(value),0)
  assert.equal(stickAxis(1),1);assert.equal(stickAxis(-1),-1);assert.equal(stickAxis(2),1)
  assert.ok(Math.abs(stickAxis(.59)-.5)<1e-9)
})

test('both trigger pressures reject resting noise and invalid values, and scale their full travel',()=>{
  for(const value of [0,.02,.05,-1,NaN,Infinity,-Infinity])assert.equal(triggerPressure(value),0)
  assert.equal(triggerPressure(1),1);assert.equal(triggerPressure(2),1)
  assert.ok(Math.abs(triggerPressure(.525)-.5)<1e-9)
  for(const [index,control] of [[7,'thrust'],[6,'reverse']]) {
    const p=pad(),reader=createControllerReader();reader.sample([p],'flight',0)
    button(p,index,.2)
    assert.ok(reader.sample([p],'flight',16).flight[control]>0,'light pulls work below the digital button threshold')
    button(p,index,.525)
    assert.ok(Math.abs(reader.sample([p],'flight',24).flight[control]-.5)<1e-9)
    button(p,index,0);assert.equal(reader.sample([p],'flight',32).flight[control],0)
  }
})

test('B blasts, X tethers and Y interacts only once per press, never repeatedly while held',()=>{
  const p=pad(),reader=createControllerReader();reader.sample([p],'flight',0)
  for(const index of [1,2,3])button(p,index,1)
  assert.deepEqual(reader.sample([p],'flight',32).pressed,[1,2,3])
  for(const time of [100,200,300,1000])assert.deepEqual(reader.sample([p],'flight',time).pressed,[])
  for(const index of [1,2,3])button(p,index,0)
  reader.sample([p],'flight',1100)
  for(const index of [1,2,3])button(p,index,1)
  assert.deepEqual(reader.sample([p],'flight',1200).pressed,[1,2,3])
})

test('the shared Haven button prefers nearby interactions and otherwise teleports',()=>{
  assert.equal(controllerHavenAction([3],true),'interact')
  assert.equal(controllerHavenAction([3],false),'teleport')
  for(const pressed of [[],[2],[5]])for(const nearby of [false,true])assert.equal(controllerHavenAction(pressed,nearby),undefined)
  const help=controllerFlightHelp(DEFAULT_CONTROLLER_LAYOUT)
  assert.match(help.find(entry=>entry.action==='interact').label,/Dock.*call Haven.*teleport/)
  assert.equal(help.some(entry=>entry.action==='teleport'),false,'one help entry for the shared button')
})

test('future layouts can separate dock and teleport without contextual overrides',()=>{
  const layout={...DEFAULT_CONTROLLER_LAYOUT,buttons:{...CONTROLLER,teleport:5}}
  for(const nearby of [false,true]) {
    assert.equal(controllerHavenAction([3],nearby,layout),'interact')
    assert.equal(controllerHavenAction([5],nearby,layout),'teleport')
  }
  assert.equal(controllerHavenAction([3,5],true,layout),'interact','simultaneous buttons still perform only one Haven action')
  assert.ok(controllerFlightHelp(layout).some(entry=>entry.action==='teleport'))
})

test('connection, screen changes and lost focus require held controls to be released before reuse',()=>{
  const p=pad(),reader=createControllerReader();p.axes[0]=1;button(p,0,1);button(p,1,1);button(p,5,1);button(p,6,.2);button(p,7,.2)
  assert.deepEqual(reader.sample([p],'menu:Hard Vacuum',0).pressed,[])
  let frame=reader.sample([p],'flight',16)
  assert.deepEqual(frame.flight,neutralController());assert.deepEqual(frame.pressed,[])
  p.axes[0]=0;button(p,0,0);button(p,1,0);button(p,5,0);button(p,6,0);button(p,7,0);reader.sample([p],'flight',32)
  p.axes[0]=1;button(p,0,1);button(p,6,.3);button(p,7,1)
  assert.equal(reader.sample([p],'flight',48).flight.thrust,1)
  assert.deepEqual(reader.sample([p],'menu:Expedition paused',64).flight,neutralController())
  assert.deepEqual(reader.sample([p],'flight',80).flight,neutralController())
  assert.deepEqual(reader.sample([p],'flight',96,false).pressed,[])
  assert.deepEqual(reader.sample([p],'flight',112,true).flight,neutralController())
})

test('one stable controller owns input, including sparse slots, disconnects and replacement devices',()=>{
  const first=pad(2),second=pad(3,'Second'),reader=createControllerReader()
  reader.sample([null,null,first,second],'flight',0)
  button(second,7,1)
  assert.equal(reader.sample([null,null,first,second],'flight',16).flight.thrust,0)
  const lost=reader.sample([null,null,null,second],'flight',32)
  assert.equal(lost.disconnected,true);assert.deepEqual(lost.flight,neutralController())
  assert.equal(reader.sample([second],'flight',48).flight.thrust,0)
  assert.equal(reader.sample([],'flight',64).disconnected,true)
  assert.equal(reader.sample([],'flight',80).disconnected,false)
  const unsupported={...pad(),mapping:''}
  assert.equal(reader.sample([unsupported],'flight',96).unsupported,true)
  assert.equal(reader.sample([unsupported],'flight',112).connected,false)
})

test('menu navigation repeats at a bounded cadence, while confirmation and cancel remain single presses',()=>{
  const p=pad(),reader=createControllerReader();reader.sample([p],'menu:Hard Vacuum',0)
  button(p,13,1);button(p,0,1)
  assert.equal(reader.sample([p],'menu:Hard Vacuum',16).navigation,'down')
  assert.equal(reader.sample([p],'menu:Hard Vacuum',100).navigation,null)
  const repeat=reader.sample([p],'menu:Hard Vacuum',366)
  assert.equal(repeat.navigation,'down');assert.deepEqual(repeat.pressed,[])
  assert.equal(reader.sample([p],'menu:Replace saved expedition',400).navigation,null)
  assert.deepEqual(reader.sample([p],'menu:Replace saved expedition',800).pressed,[])
})

test('menu navigation preserves direction, and map panning is separate from D-pad selection',()=>{
  const p=pad(),reader=createControllerReader();reader.sample([p],'menu:pause',0)
  button(p,15,1);assert.equal(reader.sample([p],'menu:pause',16).navigation,'right')
  button(p,15,0);reader.sample([p],'map:map',32)
  p.axes[0]=.8;assert.equal(reader.sample([p],'map:map',48).navigation,null)
  button(p,12,1)
  const frame=reader.sample([p],'map:map',64)
  assert.equal(frame.navigation,'up');assert.ok(frame.direction.x>0)
  assert.equal(frame.direction.y,0,'D-pad does not move the survey underneath its menu')
})

test('right-stick scrolling cannot leak across focus and dialog transitions',()=>{
  const p=pad(),reader=createControllerReader();reader.sample([p],'menu:pause',0)
  p.axes[3]=.8;assert.ok(reader.sample([p],'menu:pause',16).scroll>0)
  assert.equal(reader.sample([p],'menu:recorder',32).scroll,0)
  p.axes[3]=0;reader.sample([p],'menu:recorder',48)
  p.axes[3]=-1;assert.equal(reader.sample([p],'menu:recorder',64).scroll,-1)
  assert.equal(reader.sample([p],'menu:recorder',80,false).scroll,0)
  assert.equal(reader.sample([p],'flight',96).scroll,0)
})

test('a future layout changes sampling and displayed labels without changing the default preset',()=>{
  const layout={...DEFAULT_CONTROLLER_LAYOUT,id:'test',name:'Test',buttons:{...CONTROLLER,thrust:0,laser:7},axes:{...DEFAULT_CONTROLLER_LAYOUT.axes,turn:2}}
  const p=pad(),reader=createControllerReader(layout);reader.sample([p],'flight',0)
  p.axes[2]=1;button(p,0,1)
  const frame=reader.sample([p],'flight',16)
  assert.equal(frame.flight.thrust,1);assert.equal(frame.flight.turn,1);assert.equal(frame.flight.laser,false)
  assert.equal(controllerButtonLabel(reader.layout.buttons.thrust),'A / ×')
  assert.equal(DEFAULT_CONTROLLER_LAYOUT.buttons.thrust,7)
})

test('analog steering uses normal physics and presentation; keyboard retains precedence and independent holds',()=>{
  const ship=()=>({pos:{x:0,y:0},vel:{x:0,y:0},angle:0,radius:15})
  const full=ship(),half=ship(),keys=new Set()
  for(let i=0;i<30;i++) {
    stepShipMovement(full,keys,1/60,{...neutralController(),turn:1})
    stepShipMovement(half,keys,1/60,{...neutralController(),turn:.5})
  }
  assert.ok(Math.abs(half.angle*2-full.angle)<1e-9)
  assert.deepEqual(half.pos,{x:0,y:0})
  const appearance=freshShipAppearance()
  stepShipAppearance(appearance,keys,.1,undefined,{...neutralController(),turn:.5,thrust:.5})
  assert.equal(appearance.turn,.5);assert.ok(appearance.thrust>0)
  assert.equal(flightInput(new Set(['a']),{...neutralController(),turn:1}).turn,-1)
  assert.equal(flightInput(new Set(['w']),neutralController()).forward,1)
  assert.equal(flightInput(new Set(),{...neutralController(),thrust:.5}).forward,.5)
  assert.equal(flightInput(new Set(['w']),{...neutralController(),thrust:.5}).forward,1)
})

test('analog control intensity scales force and the matching exhaust jets',()=>{
  for(const direction of ['thrust','reverse']) {
    const ship=()=>({pos:{x:0,y:0},vel:{x:0,y:0},angle:0,radius:15})
    const full=ship(),half=ship(),fullJet=freshShipAppearance(),halfJet=freshShipAppearance()
    for(let i=0;i<12;i++) {
      stepShipMovement(full,new Set(),1/60,{...neutralController(),[direction]:1})
      stepShipMovement(half,new Set(),1/60,{...neutralController(),[direction]:.5})
      stepShipAppearance(fullJet,new Set(),1/60,0,{...neutralController(),[direction]:1})
      stepShipAppearance(halfJet,new Set(),1/60,0,{...neutralController(),[direction]:.5})
    }
    assert.ok(Math.abs(half.vel.x*2-full.vel.x)<1e-9,direction)
    assert.ok(Math.abs(half.pos.x*2-full.pos.x)<1e-9,direction)
    assert.equal(Math.sign(full.vel.x),direction==='thrust'?1:-1)
    const jet=direction==='thrust'?'thrust':'nose'
    assert.ok(Math.abs(halfJet[jet]*2-fullJet[jet])<1e-9,direction)
  }
})

test('controller release cannot cancel a held keyboard laser or reset its mining contact, and vice versa',()=>{
  const s=launch()
  s.command({type:'key',key:' ',pressed:true});input(s,{laser:true});run(s)
  s.refs.laserContactRef.current.elapsedMs=123
  input(s,{laser:false})
  assert.equal(s.refs.laserContactRef.current.elapsedMs,123);run(s)
  assert.equal(s.refs.phaserBeamRef.current.active,true)
  input(s,{laser:true});s.refs.laserContactRef.current.elapsedMs=234
  s.command({type:'key',key:' ',pressed:false})
  assert.equal(s.refs.laserContactRef.current.elapsedMs,234);run(s)
  assert.equal(s.refs.phaserBeamRef.current.active,true)
  input(s,{laser:false});assert.equal(s.refs.laserContactRef.current.elapsedMs,0);run(s)
  assert.equal(s.refs.phaserBeamRef.current.active,false)
})

test('pause, survey suspension, load and a new launch clear controller flight state without saving it',()=>{
  const s=launch()
  for(const command of [{type:'pause'},{type:'suspend',suspended:true},{type:'start'}]) {
    input(s,{turn:1,thrust:1,strafe:1,laser:true});s.command(command)
    assert.deepEqual(s.refs.controllerRef.current,neutralController())
    if(command.type!=='start') {
      input(s,{thrust:1});assert.deepEqual(s.refs.controllerRef.current,neutralController())
      s.command(command.type==='pause'?{type:'resume'}:{type:'suspend',suspended:false})
    }
  }
  input(s,{turn:NaN});assert.equal(s.refs.controllerRef.current.turn,0)
  input(s,{turn:4});assert.equal(s.refs.controllerRef.current.turn,1)
  input(s,{thrust:NaN,reverse:Infinity});assert.equal(s.refs.controllerRef.current.thrust,0);assert.equal(s.refs.controllerRef.current.reverse,0)
  input(s,{thrust:4,reverse:-1});assert.equal(s.refs.controllerRef.current.thrust,1);assert.equal(s.refs.controllerRef.current.reverse,0)
  const saved=structuredClone(s.expedition);assert.equal(saved.controller,undefined)
  s.command({type:'load',expedition:saved});assert.deepEqual(s.refs.controllerRef.current,neutralController())
})

test('controller-driven flight, braking, strafing and laser agree at 30, 60, 120 and 144 render Hz',()=>{
  let expected
  for(const hz of [60,30,120,144]) {
    const s=launch();let tick=0
    s.advance(0)
    for(let frame=1;frame<=hz*1.5;frame++)s.advance(frame*1000/hz,()=>{
      input(s,{turn:tick<30?.3:0,thrust:tick<30?.75:0,reverse:tick>=30&&tick<60?.5:0,strafe:tick<15?-1:tick<45?1:0,laser:tick>=60});tick++
    })
    const actual=structuredClone({ship:s.refs.shipRef.current,state:s.expedition,energy:s.refs.phaserStateRef.current})
    if(expected)assert.deepEqual(actual,expected,`hz=${hz}`);else expected=actual
  }
})
