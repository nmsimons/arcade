import assert from 'node:assert/strict'
import test from 'node:test'
import { BOT_BLASTER_DAMAGE, BOT_LASER_DAMAGE, BOT_MAX_HEALTH, BOT_DAMAGE_SITES, BOT_STATIONS, botDamage, damageBot, freshBots, pullBotCable, stepBots, stepBotSparks, stepSecurityShots, stepBotGarages, botGarageProgress } from '../src/games/hardVacuum/stationBots.ts'
import { seededRandom } from '../src/games/hardVacuum/random.ts'
import { bankAtCheckpoint, expeditionMap, freshExpedition, parseExpedition, crashExpedition, powerReceiver, visibleBetween } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern, raycastCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { collideBodies } from '../src/games/hardVacuum/bodyCollisions.ts'
import { laserImpactMs, stepLaserContact } from '../src/games/hardVacuum/laser.ts'
import { laserCapacityMs } from '../src/games/hardVacuum/upgrades.ts'
import { stepBlaster } from '../src/games/hardVacuum/blaster.ts'

const rectangle = (x,y,w,h) => [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]
const open = { id:99,name:'Test bay',boundary:rectangle(0,0,10000,6000),obstacles:[] }
const shipAt = pos => ({pos:{...pos},vel:{x:0,y:0},radius:15,angle:0})

test('bot defeats survive docking and save reloads but reset when the pilot respawns',()=>{
  const state = freshExpedition(), runtime = freshBots(state), map = expeditionMap(state)
  for (const bot of runtime.units) assert.ok(isInsideCavern(bot.pos,bot.radius,map),bot.botId)
  const bot = runtime.units[0]
  bot.phase='watch';bot.anchored=false
  for(let hit=1;hit<=4;hit++) assert.equal(damageBot(state,bot,BOT_BLASTER_DAMAGE),hit===4)
  assert.equal(damageBot(state,bot,BOT_BLASTER_DAMAGE),false)
  assert.deepEqual(state.disabledBots,[bot.botId])
  bankAtCheckpoint(state,'haven')
  assert.ok(!freshBots(parseExpedition(JSON.stringify(state))).units.some(b=>b.botId===bot.botId))
  crashExpedition(state)
  assert.deepEqual(state.disabledBots,[])
  assert.equal(freshBots(parseExpedition(JSON.stringify(state))).units.find(b=>b.botId===bot.botId).health,BOT_MAX_HEALTH)
  const old = freshExpedition();old.version=1; delete old.disabledBots
  assert.deepEqual(parseExpedition(JSON.stringify(old)).disabledBots,[])
  assert.equal(parseExpedition(JSON.stringify({...old,disabledBots:['missing']})),null)
})

test('security wakes on its actual circuit, gives a full warning, fires a burst, and respects cover',()=>{
  for (const hz of [30,60,120]) {
    const state=freshExpedition(),runtime=freshBots(state)
    runtime.units=runtime.units.filter(b=>b.botId==='works-watch')
    const bot=runtime.units[0],ship=shipAt({x:bot.pos.x+230,y:bot.pos.y}),dt=1/hz
    for(let i=0;i<hz*3;i++)stepBots(runtime,state,{dt,ship,map:open,bodies:[]})
    assert.equal(bot.phase,'offline');assert.equal(runtime.shots.length,0)
    state.power['works-power']='works-power'
    for(let i=0;i<hz*8 && bot.phase!=='charge';i++)stepBots(runtime,state,{dt,ship,map:open,bodies:[]})
    assert.equal(bot.phase,'charge');assert.equal(runtime.shots.length,0,'the first burst must be telegraphed')
    for(let i=0;i<hz;i++)stepBots(runtime,state,{dt,ship,map:open,bodies:[]})
    assert.equal(runtime.shots.length,0)
    for(let i=0;i<hz;i++)stepBots(runtime,state,{dt,ship,map:open,bodies:[]})
    assert.equal(runtime.shots.length,3)
    const cover={...open,obstacles:[rectangle(bot.pos.x+65,bot.pos.y-200,30,400)]}
    for(let i=0;i<hz*7;i++)stepBots(runtime,state,{dt,ship,map:cover,bodies:[]})
    assert.equal(runtime.shots.length,3,'walls prevent reacquiring a target')
    for(let i=0;i<hz*6;i++)stepBots(runtime,state,{dt,ship,map:open,bodies:[],shipSafe:true})
    assert.equal(runtime.shots.length,3,'a ship secured at Haven is not targeted')
  }
})

test('security projectiles strike blue cover or a wall before a ship, even in a long frame',()=>{
  const ship=shipAt({x:400,y:300}),blue={kind:'blue',radius:25,pos:{x:250,y:300},vel:{x:0,y:0}}
  const shot=()=>({owner:'test',pos:{x:100,y:300},vel:{x:285,y:0},life:2})
  let runtime={units:[],shots:[shot()]}
  let impacts=stepSecurityShots(runtime,1.5,open,[ship,blue])
  assert.equal(impacts.length,1);assert.equal(impacts[0].target,blue);assert.equal(runtime.shots.length,0)
  runtime={units:[],shots:[shot()]}
  impacts=stepSecurityShots(runtime,1.5,{...open,obstacles:[rectangle(180,200,20,200)]},[ship,blue])
  assert.equal(impacts[0].target,undefined);assert.equal(impacts[0].pos.x,180)
})

test('the sorting tug physically hauls loose cargo but never takes installed or recovering objects',()=>{
  for(const hz of [30,60,120]) {
    const state=freshExpedition();state.power['freight-power']='freight-power'
    const runtime=freshBots(state);runtime.units=runtime.units.filter(b=>b.botId==='freight-tug')
    const bot=runtime.units[0],home=BOT_STATIONS.find(s=>s.id===bot.botId).home
    const cargo={cargoId:'test',pos:{x:home.x+230,y:home.y},vel:{x:0,y:0},radius:18,mass:.7}
    const installed={...cargo,pos:{x:home.x+150,y:home.y+70},vel:{x:0,y:0},socketId:'freight-power'}
    const secured={...cargo,pos:{x:home.x+160,y:home.y-70},vel:{x:0,y:0},retrieving:true}
    const ship=shipAt({x:home.x+300,y:home.y+100}),dt=1/hz
    let connected=false
    for(let i=0;i<hz*22;i++) {
      stepBots(runtime,state,{dt,ship,map:open,bodies:[cargo,installed,secured],towed:cargo,shipSafe:true})
      if(bot.target){assert.equal(bot.target,cargo);connected=true}
      cargo.pos.x+=cargo.vel.x*dt;cargo.pos.y+=cargo.vel.y*dt
      cargo.vel.x*=Math.exp(-.35*dt);cargo.vel.y*=Math.exp(-.35*dt)
      collideBodies(bot,cargo)
    }
    assert.ok(connected);assert.ok(Math.hypot(cargo.pos.x-home.x-100,cargo.pos.y-home.y)<100,JSON.stringify(cargo))
    assert.deepEqual(installed.vel,{x:0,y:0});assert.deepEqual(secured.vel,{x:0,y:0})
    bot.target=cargo;damageBot(state,bot,1);assert.equal(bot.target,undefined,'weapon impact breaks the tug cable')
  }
})

test('bot cables conserve momentum, never push slack cargo, and share normal ship collision physics',()=>{
  const bot=freshBots(freshExpedition()).units[0]
  bot.phase='watch';bot.anchored=false
  bot.pos={x:200,y:200};bot.vel={x:0,y:0}
  const cargo={pos:{x:360,y:200},vel:{x:0,y:0},mass:2,radius:18}
  pullBotCable(bot,cargo,1/60)
  assert.ok(cargo.vel.x<0 && bot.vel.x>0)
  assert.ok(Math.abs(bot.vel.x*bot.mass+cargo.vel.x*cargo.mass)<1e-8)
  cargo.pos.x=bot.pos.x+60;const before=structuredClone(cargo.vel);pullBotCable(bot,cargo,1/60);assert.deepEqual(cargo.vel,before)
  const ship=shipAt({x:bot.pos.x-20,y:bot.pos.y});ship.vel.x=120
  assert.ok(collideBodies(ship,bot).hit);assert.ok(bot.vel.x>1)
})

test('every bot survives three swept blaster impacts and is destroyed by the fourth',()=>{
  const state=freshExpedition()
  for(const bot of freshBots(state).units) {
    bot.phase='watch';bot.anchored=false
    for(let hit=1;hit<=4;hit++) {
      const shot={pos:{x:bot.pos.x-200,y:bot.pos.y},vel:{x:680,y:0},life:1}
      const impact=stepBlaster([shot],.5,open,[bot]).impacts[0]
      assert.equal(impact.target,bot)
      assert.equal(damageBot(state,impact.target,BOT_BLASTER_DAMAGE),hit===4,bot.botId)
      assert.equal(bot.health,BOT_MAX_HEALTH-hit*BOT_BLASTER_DAMAGE)
    }
  }
})

test('both bot types need fifty laser contacts: five seconds at maximum focus and twenty seconds without upgrades',()=>{
  const expectedSeconds=[20,15,12.5,10,7.5,5]
  for(const hz of [30,60,120])for(let focus=0;focus<=5;focus++)for(const kind of ['tug','security']) {
    const state=freshExpedition();state.upgradeLevels.focus=focus
    const bot=freshBots(state).units.find(b=>b.botKind===kind),contact={elapsedMs:0},asteroid={}
    bot.phase='watch';bot.anchored=false
    const impactMs=laserImpactMs(state),dt=1/hz,baseline={elapsedMs:0}
    assert.equal(impactMs*50/1000,expectedSeconds[focus])
    let asteroidFrames=0
    do{asteroidFrames++}while(!stepLaserContact(baseline,asteroid,dt,impactMs))
    for(let frame=1;frame<=asteroidFrames*50;frame++) {
      if(stepLaserContact(contact,bot,dt,impactMs))damageBot(state,bot,BOT_LASER_DAMAGE)
      assert.equal(bot.health<=0,frame===asteroidFrames*50,`${kind}, focus ${focus}, ${hz} Hz, frame ${frame}`)
    }
    assert.equal(bot.health,0,'fifty fractional hits must not leave a rounding-error survivor')
    assert.ok(state.disabledBots.includes(bot.botId))
  }
})

test('laser and blaster damage accumulate while incomplete laser contacts cannot chip armor',()=>{
  const state=freshExpedition(),bot=freshBots(state).units[0],contact={elapsedMs:0}
  bot.phase='watch';bot.anchored=false
  damageBot(state,bot,BOT_BLASTER_DAMAGE)
  for(let i=0;i<8;i++) {
    assert.equal(stepLaserContact(contact,bot,.3,400),false)
    stepLaserContact(contact,undefined,0,400)
  }
  assert.equal(bot.health,15)
  for(let hit=1;hit<=38;hit++) {
    assert.equal(stepLaserContact(contact,bot,.4,400),true)
    assert.equal(damageBot(state,bot,BOT_LASER_DAMAGE),hit===38)
  }
})

test('the starting laser can chip and eventually defeat bots across stock-capacitor bursts',()=>{
  for(const kind of ['tug','security']) {
    const state=freshExpedition(),bot=freshBots(state).units.find(b=>b.botKind===kind),contact={elapsedMs:0}
    bot.phase='watch';bot.anchored=false
    const dt=1/60,impactMs=laserImpactMs(state),frames=Math.round(laserCapacityMs(state)/1000/dt)
    assert.ok(impactMs<=laserCapacityMs(state),'a stock beam must last long enough to inflict damage')
    for(let burst=1;burst<=50;burst++) {
      for(let frame=0;frame<frames;frame++) if(stepLaserContact(contact,bot,dt,impactMs)) damageBot(state,bot,BOT_LASER_DAMAGE)
      assert.equal(bot.health,Math.round((BOT_MAX_HEALTH-burst*BOT_LASER_DAMAGE)*1000)/1000)
      // Recharging clears unfinished contact, but not damage already inflicted.
      stepLaserContact(contact,undefined,0,impactMs)
    }
    assert.ok(state.disabledBots.includes(bot.botId))
  }
})

test('respawn restores every dead or damaged enemy at its home without changing station power',()=>{
  const state=freshExpedition();powerReceiver(state,'freight-power','freight-power');powerReceiver(state,'works-power','works-power');state.botDoors={}
  const runtime=freshBots(state)
  for(const [i,bot] of runtime.units.entries()) {bot.phase='watch';damageBot(state,bot,i%2 ? BOT_LASER_DAMAGE : BOT_MAX_HEALTH)}
  assert.ok(state.disabledBots.length>0)
  const power={...state.power},gates=[...state.gates]
  crashExpedition(state)
  const restored=freshBots(parseExpedition(JSON.stringify(state)))
  assert.equal(restored.units.length,BOT_STATIONS.length);assert.deepEqual(restored.shots,[])
  assert.deepEqual(state.power,power);assert.deepEqual(state.gates,gates)
  for(const bot of restored.units) {
    const spec=BOT_STATIONS.find(s=>s.id===bot.botId)
    assert.equal(bot.health,BOT_MAX_HEALTH);assert.deepEqual(bot.pos,spec.home)
    assert.equal(bot.target,undefined);assert.equal(bot.maintenance,undefined);assert.equal(bot.stun,0)
    assert.equal(bot.phase,state.power[spec.power] ? 'deploy' : 'offline')
  }
})

test('damaged bots shed brief moving sparks, while healthy, destroyed and dormant units do not',()=>{
  const state=freshExpedition(),bot=freshBots(state).units[0]
  bot.phase='watch';bot.vel={x:50,y:10}
  assert.deepEqual(stepBotSparks(bot,.1),[])
  damageBot(state,bot,BOT_BLASTER_DAMAGE)
  const before={pos:{...bot.pos},vel:{...bot.vel}},sparks=stepBotSparks(bot,1/60)
  assert.ok(sparks.length>0&&sparks.length<=4)
  for(const spark of sparks) {
    assert.ok(spark.spark);assert.ok(spark.life>0&&spark.life<400)
    assert.ok(Math.hypot(spark.pos.x-bot.pos.x,spark.pos.y-bot.pos.y)<bot.radius)
    assert.ok(Math.hypot(spark.vel.x-bot.vel.x,spark.vel.y-bot.vel.y)>20)
  }
  assert.deepEqual({pos:bot.pos,vel:bot.vel},before)
  assert.deepEqual(stepBotSparks(bot,0),[]);assert.deepEqual(stepBotSparks(bot,1/60),[])
  bot.phase='offline';assert.deepEqual(stepBotSparks(bot,2),[])
  bot.phase='watch';damageBot(state,bot,BOT_MAX_HEALTH);assert.deepEqual(stepBotSparks(bot,2),[])
})

test('spark count, frequency, reach and lifetime increase with accumulated damage at every frame rate',()=>{
  for(const hz of [30,60,120]) {
    let previous={total:0,count:0,speed:0,life:0,length:0,delay:Infinity}
    for(const health of [18,15,10,5,2]) {
      const bot={...freshBots(freshExpedition()).units[0],phase:'watch',health,vel:{x:50,y:10}}
      const before=structuredClone(bot),first=stepBotSparks(bot,1/hz,()=>.5)
      const values={count:first.length,delay:bot.sparkDelay,life:first[0].life,length:first[0].length,
        speed:Math.hypot(first[0].vel.x-bot.vel.x,first[0].vel.y-bot.vel.y),total:first.length}
      const random=seededRandom(314)
      for(let frame=1;frame<hz*6;frame++) values.total+=stepBotSparks(bot,1/hz,random).length
      for(const key of ['count','total','speed','life','length']) assert.ok(values[key]>previous[key],`${hz} Hz, health ${health}, ${key}`)
      assert.ok(values.delay<previous.delay)
      assert.deepEqual({...bot,sparkDelay:undefined},{...before,sparkDelay:undefined},'sparks cannot change combat or motion')
      previous=values
    }
  }
})

test('fresh damage immediately sparks from the active hull breaches and pauses cleanly',()=>{
  const state=freshExpedition(),bot=freshBots(state).units[0]
  bot.phase='watch';bot.angle=Math.PI/2;bot.health=3;bot.sparkDelay=1
  assert.equal(damageBot(state,bot,1),false)
  assert.equal(bot.sparkDelay,0)
  const sparks=stepBotSparks(bot,1/60,seededRandom(123))
  assert.ok(sparks.length>=8)
  const sites=BOT_DAMAGE_SITES.slice(0,botDamage(bot.health).stage)
  for(const spark of sparks) assert.ok(sites.some(({point:[x,y]})=>
    Math.hypot(spark.pos.x-(bot.pos.x-y),spark.pos.y-(bot.pos.y+x))<1e-8))
  assert.ok(new Set(sparks.map(spark=>`${spark.pos.x},${spark.pos.y}`)).size>1,'critical hulls vent from multiple breaches')
  const delay=bot.sparkDelay
  assert.deepEqual(stepBotSparks(bot,0),[]);assert.equal(bot.sparkDelay,delay)
  bot.phase='boot';assert.deepEqual(stepBotSparks(bot,2),[])
})

test('closed garages block weapons, grapples and collisions; powered doors open before bots deploy',()=>{
  for(const spec of BOT_STATIONS) {
    const state=freshExpedition(),runtime=freshBots(state),bot=runtime.units.find(b=>b.botId===spec.id)
    runtime.units=[bot]
    const origin={x:spec.home.x+150,y:spec.home.y},direction={x:-1,y:0},map=expeditionMap(state)
    assert.equal(visibleBetween(origin,bot.pos,map),false)
    assert.ok(raycastCavern(origin,direction,150,map)<125)
    const impact=stepBlaster([{pos:{...origin},vel:{x:-680,y:0},life:1}],.5,map,[bot]).impacts[0]
    assert.ok(impact);assert.notEqual(impact.target,bot)
    assert.equal(damageBot(state,bot,100),false);assert.ok(bot.health>0)
    const intruder={pos:{x:spec.home.x+43,y:spec.home.y},vel:{x:-100,y:0}}
    resolveCircleInCavern(intruder.pos,intruder.vel,15,.5,map)
    assert.ok(intruder.pos.x>=spec.home.x+55-.01)
    powerReceiver(state,spec.power,spec.power)
    const ship=shipAt(origin)
    for(let i=0;i<60;i++) {stepBotGarages(state,1/60);stepBots(runtime,state,{dt:1/60,ship,map:expeditionMap(state),bodies:[]})}
    assert.ok(botGarageProgress(state,spec)>0 && botGarageProgress(state,spec)<1)
    assert.equal(bot.phase,'boot');assert.equal(bot.anchored,true)
    assert.equal(damageBot(state,bot,100),false)
    const restored=parseExpedition(JSON.stringify(state));assert.ok(restored);assert.equal(restored.botDoors[spec.id],state.botDoors[spec.id])
    for(let i=0;i<240;i++) {stepBotGarages(state,1/60);stepBots(runtime,state,{dt:1/60,ship,map:expeditionMap(state),bodies:[]})}
    assert.equal(botGarageProgress(state,spec),1);assert.equal(bot.anchored,false)
    assert.ok(bot.pos.x>spec.home.x+60,`${spec.id} failed to leave garage: ${JSON.stringify(bot.pos)}`)
    assert.equal(damageBot(state,bot,100),true)
  }
})
