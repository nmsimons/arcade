import test from 'node:test'
import assert from 'node:assert/strict'
import { BOT_BLASTER_DAMAGE, BOT_LASER_DAMAGE, BOT_MAX_HEALTH, damageBot, freshBots, stepBots, stepSecurityShots } from '../src/games/hardVacuum/stationBots.ts'
import { expeditionMap, freshExpedition, powerReceiver, visibleBetween } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { laserImpactMs, stepLaserContact } from '../src/games/hardVacuum/laser.ts'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'

const rectangle=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]
const open={id:99,name:'Security test bay',boundary:rectangle(0,0,10000,6000),obstacles:[]}
function encounter(gap=45) {
  const state=freshExpedition();state.power['works-power']='works-power'
  const runtime=freshBots(state),bot=runtime.units.find(bot=>bot.botId==='works-watch')
  runtime.units=[bot]
  Object.assign(bot,{phase:'watch',timer:0,anchored:false,pos:{x:5300,y:1030}})
  const ship={pos:{x:bot.pos.x+gap,y:bot.pos.y},vel:{x:0,y:0},angle:Math.PI,radius:15}
  return {state,runtime,bot,ship}
}

test('laser chips damage either enemy without restarting its attack, deployment or stagger recovery',()=>{
  for(const kind of ['security','tug']) for(const phase of ['deploy','watch','charge','burst','cooldown']) for(const stun of [0,.2]) {
    const state=freshExpedition(),bot=freshBots(state).units.find(bot=>bot.botKind===kind)
    Object.assign(bot,{phase,timer:.3,shotCount:1,stun})
    damageBot(state,bot,BOT_LASER_DAMAGE,'laser')
    assert.equal(bot.health,BOT_MAX_HEALTH-BOT_LASER_DAMAGE)
    assert.equal(bot.phase,phase)
    assert.equal(bot.timer,.3)
    assert.equal(bot.shotCount,1)
    assert.equal(bot.stun,stun,'laser cannot start or extend a stagger')
    assert.equal(bot.flash,1);assert.equal(bot.sparkDelay,0)
  }
})

test('security backs away and fires a fully warned burst through continuous laser contact at every focus level',()=>{
  for(const hz of [30,60,120]) for(let focus=0;focus<=5;focus++) {
    const {state,runtime,bot,ship}=encounter()
    state.upgradeLevels.focus=focus
    const contact={elapsedMs:0},dt=1/hz,startX=bot.pos.x
    let firstShot,shots=0,hits=0,laserHits=0
    for(let tick=0;tick<hz*2;tick++) {
      const cues=stepBots(runtime,state,{dt,ship,map:open,bodies:[]})
      if(cues.some(cue=>cue.kind==='shot')) firstShot??=(tick+1)*dt
      shots+=cues.filter(cue=>cue.kind==='shot').length
      hits+=stepSecurityShots(runtime,dt,open,[ship,bot]).filter(impact=>impact.target===ship).length
      if(stepLaserContact(contact,bot,dt,laserImpactMs(state))) {damageBot(state,bot,BOT_LASER_DAMAGE,'laser');laserHits++}
    }
    assert.ok(laserHits>0);assert.ok(bot.health<BOT_MAX_HEALTH && bot.health>0)
    assert.ok(firstShot>=1.2 && firstShot<=1.3,`${hz} Hz, focus ${focus}: warning ${firstShot}`)
    assert.equal(shots,3);assert.ok(hits>0,'standing still under sustained fire is not safe')
    assert.ok(bot.pos.x<startX-30,'the bot must create space instead of accepting point-blank fire')
    assert.equal(bot.stun,0)
  }
})

test('blaster impacts still interrupt security; laser cannot prolong that interruption',()=>{
  const {state,runtime,bot,ship}=encounter(210)
  Object.assign(bot,{phase:'charge',timer:.2})
  damageBot(state,bot,BOT_BLASTER_DAMAGE)
  assert.equal(bot.health,15);assert.equal(bot.phase,'cooldown');assert.equal(bot.stun,.65);assert.equal(bot.timer,1.5)
  let shots=0
  const contact={elapsedMs:0}
  for(let tick=0;tick<60*4;tick++) {
    shots+=stepBots(runtime,state,{dt:1/60,ship,map:open,bodies:[]}).filter(cue=>cue.kind==='shot').length
    if(tick<60*3) assert.equal(shots,0,'the heavy-hit recovery window is preserved')
    if(stepLaserContact(contact,bot,1/60,100)) damageBot(state,bot,BOT_LASER_DAMAGE,'laser')
  }
  assert.equal(shots,3,'laser spam must not keep resetting the heavy-hit cooldown')
})

test('repeated laser hits preserve a tug grapple until the tug is destroyed',()=>{
  const state=freshExpedition(),bot=freshBots(state).units.find(bot=>bot.botKind==='tug')
  const target={pos:{x:7100,y:1360},vel:{x:0,y:0},radius:15}
  const rig={mode:'ship',cycle:0,age:0,holding:.5,cableLength:92}
  Object.assign(bot,{phase:'watch',anchored:false,target,maintenance:rig,timer:.3,vel:{x:40,y:10}})
  for(let hit=1;hit<50;hit++) {
    assert.equal(damageBot(state,bot,BOT_LASER_DAMAGE,'laser'),false)
    assert.equal(bot.target,target);assert.equal(bot.maintenance,rig)
    assert.equal(bot.phase,'watch');assert.equal(bot.stun,0);assert.equal(bot.timer,.3)
    assert.deepEqual(bot.vel,{x:40,y:10})
    assert.equal(bot.health,Math.round((BOT_MAX_HEALTH-hit*BOT_LASER_DAMAGE)*1000)/1000)
  }
  assert.equal(damageBot(state,bot,BOT_LASER_DAMAGE,'laser'),true)
  assert.equal(bot.target,undefined);assert.equal(bot.maintenance,undefined)
  assert.ok(state.disabledBots.includes(bot.botId))
})

test('close-range defense still respects safe Haven, blocked sight and wall clearance',()=>{
  for(const safe of [false,true]) {
    const {state,runtime,bot,ship}=encounter(100)
    const map=safe ? open : {...open,obstacles:[rectangle(bot.pos.x+40,bot.pos.y-200,20,400)]}
    for(let tick=0;tick<60*5;tick++) stepBots(runtime,state,{dt:1/60,ship,map,bodies:[],shipSafe:safe})
    assert.equal(runtime.shots.length,0)
  }
  const {state,runtime,bot,ship}=encounter()
  const map={...open,obstacles:[rectangle(bot.pos.x-65,bot.pos.y-200,30,400)]}
  let shots=0
  for(let tick=0;tick<60*3;tick++) {
    shots+=stepBots(runtime,state,{dt:1/60,ship,map,bodies:[]}).filter(cue=>cue.kind==='shot').length
    assert.ok(isInsideCavern(bot.pos,bot.radius-.1,map),'backing off must not clip through cover')
  }
  assert.ok(shots>0,'a cornered bot still defends itself')
})

test('the production laser cannot stunlock a nearby security bot or prevent retaliation',()=>{
  const state=freshExpedition();powerReceiver(state,'works-power','works-power');state.botDoors={}
  state.position={x:5265,y:1030};state.impactShieldInstalled=true;state.shields=2
  state.upgradeLevels.focus=5;state.upgradeLevels.capacitor=5
  const session=createGameSession(state,{seed:42}),refs=session.refs
  session.command({type:'start'});session.drainEvents()
  refs.rocksRef.current=[];refs.invulnerableRef.current=0
  const bot=refs.botsRef.current.units.find(bot=>bot.botId==='works-watch')
  refs.botsRef.current.units=[bot]
  Object.assign(bot,{pos:{x:5220,y:1030},vel:{x:0,y:0},phase:'watch',timer:0,anchored:false})
  assert.ok(visibleBetween(bot.pos,refs.shipRef.current.pos,expeditionMap(session.expedition)))
  session.command({type:'key',key:' ',pressed:true})
  let shots=0
  for(let tick=0;tick<120;tick++) {
    session.step()
    shots+=session.drainEvents().filter(event=>event.type==='audio' && event.name==='botCue' && event.args[0]==='shot').length
  }
  assert.ok(bot.health<BOT_MAX_HEALTH && bot.health>0,'the real beam still damages armor')
  assert.ok(shots>0,'the real beam must not reset the attack every 100 ms')
  assert.ok(session.expedition.shields<2,'parking beside a security unit must expose the ship to return fire')
})
