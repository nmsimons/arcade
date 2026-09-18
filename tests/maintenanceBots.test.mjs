import assert from 'node:assert/strict'
import test from 'node:test'
import { BOT_STATIONS, damageBot, freshBots, stepBots } from '../src/games/hardVacuum/stationBots.ts'
import { MAINTENANCE_SPEED, stepMaintenanceBot } from '../src/games/hardVacuum/maintenanceBots.ts'
import { freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { collideBodies } from '../src/games/hardVacuum/bodyCollisions.ts'

const rect=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]
const map={id:98,name:'Tug test bay',boundary:rect(0,0,10000,6000),obstacles:[]}
const spec=BOT_STATIONS.find(b=>b.id==='freight-tug')
const rig=mode=>({mode,cycle:mode==='obstruct'?1:0,age:0,holding:0,cableLength:92})
function scenario() {
  const state=freshExpedition();state.power['freight-power']='freight-power'
  const runtime=freshBots(state);runtime.units=runtime.units.filter(b=>b.botId===spec.id)
  const bot=runtime.units[0];bot.pos={x:spec.home.x+110,y:spec.home.y};bot.phase='watch';bot.timer=0
  const ship={pos:{x:spec.home.x+320,y:spec.home.y},vel:{x:0,y:0},radius:15,angle:0}
  return {state,runtime,bot,ship}
}
const drift=(body,dt)=>{body.pos.x+=body.vel.x*dt;body.pos.y+=body.vel.y*dt;body.vel.x*=Math.exp(-.6*dt);body.vel.y*=Math.exp(-.6*dt)}

test('maintenance bots close distance quickly, telegraph a flying grapple and physically drag the ship off course',()=>{
  const displacement=[]
  for(const hz of [30,60,120]) {
    const {state,runtime,bot,ship}=scenario(),dt=1/hz,origin={...ship.pos}
    ship.pos.x+=210
    const cues=[];let flying=false,attached=false,maximumSpeed=0,firstHookTime=Infinity
    for(let i=0;i<hz*8;i++) {
      cues.push(...stepBots(runtime,state,{dt,ship,map,bodies:[]}).map(c=>c.kind))
      maximumSpeed=Math.max(maximumSpeed,Math.hypot(bot.vel.x,bot.vel.y))
      if(bot.maintenance?.hook){flying=true;firstHookTime=Math.min(firstHookTime,i*dt);assert.equal(bot.target,undefined)}
      if(bot.target===ship){attached=true;assert.ok(flying,'the hook must travel before it latches')}
      drift(ship,dt);collideBodies(bot,ship)
    }
    assert.ok(maximumSpeed>120 && maximumSpeed<=MAINTENANCE_SPEED+10)
    assert.ok(firstHookTime>.45);assert.ok(cues.includes('lock')&&cues.includes('hook')&&cues.includes('grab'))
    assert.ok(attached);assert.ok(Math.abs(ship.pos.y-origin.y)>50,JSON.stringify(ship))
    displacement.push(ship.pos.y-origin.y)
  }
  assert.ok(Math.max(...displacement)-Math.min(...displacement)<35,`similar towing across frame rates: ${displacement}`)
})

test('bots alternate ship harassment, moving asteroids into the flight lane, and stealing towed cargo',()=>{
  const {bot,ship}=scenario(),cargo={cargoId:'cache',pos:{x:bot.pos.x+70,y:bot.pos.y-90},vel:{x:0,y:0},radius:20}
  const rock={kind:'blue',pos:{x:bot.pos.x+110,y:bot.pos.y+90},vel:{x:0,y:0},radius:22}
  const args={dt:1/60,ship,map,bodies:[rock,cargo],home:spec.home,patrol:spec.patrol,towed:cargo}
  for(const [cycle,target] of [[0,ship],[1,rock],[2,cargo]]) {
    bot.maintenance={...rig('ship'),cycle};bot.timer=0
    stepMaintenanceBot(bot,args)
    assert.equal(bot.maintenance.focus,target)
  }
})

test('an obstructing tug moves a real asteroid into the ship’s projected route without teleporting it',()=>{
  for(const hz of [30,60,120]) {
    const {state,runtime,bot,ship}=scenario(),dt=1/hz
    ship.pos={x:spec.home.x+380,y:spec.home.y+160}
    const rock={kind:'blue',pos:{x:spec.home.x+270,y:spec.home.y+30},vel:{x:0,y:0},radius:22,mass:1.1}
    bot.maintenance=rig('obstruct')
    const goal={x:ship.pos.x+170,y:ship.pos.y},start={...rock.pos}
    let attached=false,closest=Infinity
    for(let i=0;i<hz*8;i++) {
      const before={...rock.pos}
      stepBots(runtime,state,{dt,ship,map,bodies:[rock]})
      assert.deepEqual(rock.pos,before,'cable impulses change velocity, never the cargo position')
      attached ||= bot.target===rock
      drift(rock,dt);drift(ship,dt);collideBodies(bot,rock);collideBodies(ship,rock)
      closest=Math.min(closest,Math.hypot(rock.pos.x-goal.x,rock.pos.y-goal.y))
    }
    assert.ok(attached);assert.ok(rock.pos.x>start.x+100,JSON.stringify(rock))
    assert.ok(closest<80,`asteroid did not reach flight lane: ${closest}`)
  }
})

test('a pilot can dodge the launched hook; solid objects intercept it',()=>{
  for(const obstacle of ['dodge','wall','installed']) {
    const {state,runtime,bot,ship}=scenario(),dt=1/120
    for(let i=0;i<400 && !bot.maintenance?.hook;i++)stepBots(runtime,state,{dt,ship,map,bodies:[]})
    assert.ok(bot.maintenance.hook)
    const between={x:(bot.pos.x+ship.pos.x)/2,y:ship.pos.y}
    const blocked=obstacle==='wall' ? {...map,obstacles:[rect(between.x-5,between.y-100,10,200)]} : map
    const bodies=obstacle==='installed' ? [{pos:between,vel:{x:0,y:0},radius:23,socketId:'powered',kind:'blue'}] : []
    let elapsed=0
    while(bot.maintenance.hook && elapsed<1) {
      if(obstacle==='dodge')ship.pos.y+=300*dt
      stepBots(runtime,state,{dt,ship,map:blocked,bodies});elapsed+=dt
    }
    assert.equal(bot.target,undefined,obstacle);assert.equal(bot.maintenance.hook,undefined)
  }
})

test('damage, cover, distance, a short hold limit and Haven all release a ship caught by a bot',()=>{
  for(const counter of ['damage','cover','distance','timeout','haven']) {
    const {state,runtime,bot,ship}=scenario()
    bot.target=ship;bot.maintenance={...rig('ship'),drop:{x:bot.pos.x,y:bot.pos.y+230}}
    if(counter==='damage')damageBot(state,bot,1)
    if(counter==='distance')ship.pos.x=bot.pos.x+400
    if(counter==='timeout')bot.maintenance.holding=3
    const blocked=counter==='cover' ? {...map,obstacles:[rect(bot.pos.x+80,bot.pos.y-100,10,200)]} : map
    stepBots(runtime,state,{dt:1/60,ship,map:blocked,bodies:[],shipSafe:counter==='haven'})
    assert.equal(bot.target,undefined,counter)
    assert.ok(bot.timer>0,'a broken grapple leaves a recovery window')
    if(counter==='haven')for(let i=0;i<600;i++){stepBots(runtime,state,{dt:1/60,ship,map,bodies:[],shipSafe:true});assert.notEqual(bot.target,ship)}
  }
})
