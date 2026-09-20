import test from 'node:test'
import assert from 'node:assert/strict'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'
import { newExpedition } from '../src/games/hardVacuum/expedition.ts'
import { HOPPER_ARCS, HOPPER_INNER_RADIUS, HOPPER_OUTER_RADIUS, TRAINING_EMITTER, TRAINING_EMITTER_HOUSINGS, TRAINING_GATE, TRAINING_SPAWN, TRAINING_HOPPERS, TRAINING_SOCKET, TRAINING_LOG, trainingMap, stepTraining, stepTrainingEmitter } from '../src/games/hardVacuum/training.ts'
import { asteroidFieldCredits } from '../src/games/hardVacuum/oreCredits.ts'
import { fragmentKindFor } from '../src/games/hardVacuum/debrisField.ts'
import { isInsideCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { CREDITS_BASE_PROCESSING_MULTIPLIER } from '../src/games/hardVacuum/tuning.ts'
import { doorPanels } from '../src/games/hardVacuum/doors.ts'

const training=()=>createGameSession(newExpedition(),{training:true,seed:42,cosmeticRandom:()=>.4})
const run=(session,n=60)=>{for(let i=0;i<n;i++)session.step()}

test('training is an isolated square with the base laser, tether, and no Haven, shields, bots or other equipment',()=>{
  const input=newExpedition();input.banked=1234;input.blasterInstalled=true;input.blasterCharges=3
  const before=structuredClone(input),s=createGameSession(input,{training:true})
  assert.deepEqual(input,before);assert.deepEqual(s.expedition.position,TRAINING_SPAWN)
  assert.equal(s.mode,'playing');assert.equal(s.expedition.shields,0);assert.equal(s.expedition.impactShieldInstalled,false)
  assert.equal(s.expedition.blasterInstalled,false);assert.equal(s.expedition.teleporterInstalled,false);assert.deepEqual(s.expedition.upgrades,[])
  assert.equal(s.expedition.campaign.havenActivated,false);assert.deepEqual(s.refs.botsRef.current.units,[])
  assert.deepEqual(s.refs.runtimeRef.current.objects,{})
  assert.equal(trainingMap(0).boundary[2].x,trainingMap(0).boundary[2].y)
  run(s,600);assert.equal(s.mode,'playing');assert.equal(s.expedition.radiationExposure,0)
  assert.ok(!s.drainEvents().some(e=>e.type==='persist'))
})

test('practice hull loss automatically resets the whole arena, including credits and equipment',()=>{
  const s=training();s.expedition.banked=200;s.training.powered=true;s.training.logRead=true
  s.refs.invulnerableRef.current=0;s.refs.shipRef.current.pos={x:17,y:600};s.refs.shipRef.current.vel={x:-200,y:0}
  s.step();assert.equal(s.mode,'dying');run(s,180)
  assert.equal(s.mode,'playing');assert.deepEqual(s.expedition.position,TRAINING_SPAWN)
  assert.equal(s.expedition.banked,0);assert.equal(s.training.powered,false);assert.equal(s.training.logRead,false)
  assert.equal(s.refs.rocksRef.current.length,9);assert.equal(s.refs.harpoonRef.current.state,'idle')
  assert.equal(s.training.emitter.emitted,0);assert.equal(s.training.emitter.charge,0)
})

test('mining uses the real laser and fragments can be white, blue or red',()=>{
  const s=training(),rock=s.createRock(600,570,38,{x:0,y:0})
  rock.fragmentRates={red:.25,blue:.35};s.refs.rocksRef.current=[rock]
  assert.deepEqual([.1,.4,.9].map(n=>fragmentKindFor(rock,n)),['red','blue','normal'])
  s.command({type:'key',key:' ',pressed:true});run(s,32);s.command({type:'key',key:' ',pressed:false})
  assert.ok(!s.refs.rocksRef.current.includes(rock));assert.ok(s.refs.rocksRef.current.length>=2)
  assert.ok(s.refs.rocksRef.current.every(r=>r.radius<=19 && r.fragmentRates.blue===.35))
  assert.ok(s.expedition.credits>0)
})

test('the same keyboard and controller tether can attach, tow and release blue ore',()=>{
  const s=training(),rock=s.createRock(580,570,19,{x:0,y:0},'blue');s.refs.rocksRef.current=[rock]
  s.command({type:'tether'});run(s,12);assert.equal(s.refs.harpoonRef.current.state,'attached')
  s.command({type:'controller',input:{turn:0,thrust:1,reverse:0,laser:false}});run(s,30)
  assert.equal(rock.tethered,true);assert.ok(s.refs.shipRef.current.vel.x>0)
  s.command({type:'tether'});run(s,60);assert.equal(s.refs.harpoonRef.current.state,'idle')
  assert.ok(s.refs.rocksRef.current.includes(rock))
})

test('both circular hoppers fire real mining shots, only consume blue ore on impact, and pay once',()=>{
  for(const [i,pos] of TRAINING_HOPPERS.entries()) {
    const s=training(),rock=s.createRock(pos.x,pos.y,19,{x:0,y:0},'blue')
    const cell=s.refs.rocksRef.current.find(r=>r.sourceId);cell.pos={x:pos.x+60,y:pos.y+50}
    const white=s.createRock(pos.x,pos.y,19,{x:0,y:0});const red=s.createRock(pos.x,pos.y,19,{x:0,y:0},'red')
    const rocks=[rock,cell,white,red],value=asteroidFieldCredits(rock)*CREDITS_BASE_PROCESSING_MULTIPLIER
    const tick=()=>stepTraining(s.training,s.expedition,rocks,{state:'idle'},1/60)
    for(let n=0;n<55;n++)tick()
    assert.equal(rocks.length,4);assert.equal(s.training.hoppers[i].shots.current.length,0)
    for(let n=0;n<9;n++)tick()
    assert.equal(rocks.length,4,'waiting alone does not consume the ore')
    assert.ok(s.training.hoppers[i].shots.current.length>0,'lasers visibly travel before the impact')
    for(let n=0;n<30;n++)tick()
    assert.deepEqual(rocks,[cell,white,red])
    assert.equal(s.expedition.banked,value);assert.equal(s.training.processed[i],value)
    for(let n=0;n<120;n++)tick()
    assert.equal(s.expedition.banked,value)
    assert.equal(s.training.hoppers[i].shots.current.length,0,'shots expire when the hopper is empty')
  }
})

test('three wide openings admit both ship and ore from outside while circular hull arcs stay solid',()=>{
  const map=trainingMap(0)
  for(const p of TRAINING_HOPPERS) {
    for(const {angle} of HOPPER_ARCS) {
      const mid=(HOPPER_INNER_RADIUS+HOPPER_OUTER_RADIUS)/2
      assert.equal(isInsideCavern({x:p.x+Math.cos(angle)*mid,y:p.y+Math.sin(angle)*mid},0,map),false)
      const opening=angle+Math.PI/3
      for(const radius of [15,19,27]) for(let d=220;d>=0;d-=5) {
        const pos={x:p.x+Math.cos(opening)*d,y:p.y+Math.sin(opening)*d},vel={x:0,y:0}
        assert.ok(isInsideCavern(pos,radius,map),`clear mouth at ${opening} for radius ${radius}`)
        assert.equal(resolveCircleInCavern(pos,vel,radius,.5,map).collided,false)
      }
    }
  }
})

test('both hoppers process independently at the same time, with visible shots in the production session',()=>{
  const s=training()
  s.refs.rocksRef.current=TRAINING_HOPPERS.map(p=>s.createRock(p.x,p.y,19,{x:0,y:0},'blue'))
  run(s,64);assert.equal(s.refs.rocksRef.current.length,2);assert.ok(s.refs.baseShotsRef.current.length>=2)
  run(s,45);assert.equal(s.refs.rocksRef.current.filter(r=>r.kind==='blue').length,0)
  assert.ok(s.training.processed.every(credits=>credits>0));assert.equal(s.training.processed[0],s.training.processed[1])
  const earned=s.expedition.banked;run(s,120);assert.equal(s.expedition.banked,earned)
  s.command({type:'start'});assert.equal(s.refs.baseShotsRef.current.length,0)
})

test('hopper processing releases a live tether without awarding twice or touching campaign progress',()=>{
  const s=training(),p=TRAINING_HOPPERS[0],ship=s.refs.shipRef.current
  ship.pos={x:p.x,y:p.y-160};ship.angle=Math.PI/2
  const rock=s.createRock(p.x,p.y-70,19,{x:0,y:0},'blue');s.refs.rocksRef.current=[rock]
  s.command({type:'tether'});run(s,10);assert.equal(s.refs.harpoonRef.current.state,'attached')
  rock.pos={...p};ship.pos={x:p.x,y:p.y-120};rock.vel={x:0,y:0};ship.vel={x:0,y:0}
  run(s,100);assert.ok(!s.refs.rocksRef.current.includes(rock));assert.notEqual(s.refs.harpoonRef.current.state,'attached')
  assert.ok(s.expedition.banked>0);assert.deepEqual(s.expedition.power,{})
})

test('a real cell powers the practice door, the log needs a tether, and reset restores them',()=>{
  const s=training(),rocks=s.refs.rocksRef.current,cell=rocks.find(r=>r.sourceId)
  const door={x:1760,y:1970};assert.equal(isInsideCavern(door,15,trainingMap(0)),false)
  cell.pos={...TRAINING_SOCKET};cell.vel={x:0,y:0};run(s,95)
  assert.equal(s.training.powered,true);assert.ok(!rocks.includes(cell));assert.ok(isInsideCavern(door,15,trainingMap(s.training.door)))
  s.refs.shipRef.current.pos={x:TRAINING_LOG.pos.x,y:TRAINING_LOG.pos.y-95};s.refs.shipRef.current.angle=Math.PI/2
  run(s,60);assert.equal(s.training.logRead,false)
  s.command({type:'tether'});run(s,20);assert.equal(s.training.connected,true);assert.equal(s.training.logRead,true)
  assert.equal(s.snapshot().hud.radio,TRAINING_LOG.id)
  s.command({type:'tether'});run(s,60);assert.equal(s.snapshot().hud.radio,'');assert.equal(s.training.logRead,true)
  s.command({type:'start'});assert.equal(s.training.powered,false);assert.equal(s.training.logRead,false)
})

test('training door colliders use the same moving leaves as the main map, and the installed cell stays solid',()=>{
  for(const progress of [0,.1,.25,.5,.75,1]) {
    const panels=doorPanels(TRAINING_GATE,progress),map=trainingMap(progress)
    for(const panel of panels)assert.ok(map.obstacles.some(shape=>JSON.stringify(shape)===JSON.stringify(panel)))
    const center={x:1760,y:1970}
    assert.equal(isInsideCavern(center,15,map),progress>=.5)
    assert.equal(isInsideCavern(TRAINING_SOCKET,0,map),progress===0)
  }
})

test('the practice recording is exclusively about exercises in this room',()=>{
  assert.doesNotMatch(`${TRAINING_LOG.title} ${TRAINING_LOG.speaker} ${TRAINING_LOG.text}`,/Haven|Orison|survivor|expedition|radiation|blaster|escape power|out there/i)
  assert.match(TRAINING_LOG.speaker,/INSTRUCTOR LOG/)
  assert.match(TRAINING_LOG.text,/flight recorder/)
  assert.match(TRAINING_LOG.text,/clean cut/)
  assert.doesNotMatch(TRAINING_LOG.text,/practice area|little lasers|practice credits|pause menu/i)
})

test('the fresh and idle training range has no red asteroids and dispenses nothing until stock is used',()=>{
  const s=training(),initial=[...s.refs.rocksRef.current]
  assert.equal(initial.filter(r=>r.kind==='red').length,0)
  assert.equal(initial.filter(r=>r.kind==='normal' && r.radius>20).length,TRAINING_EMITTER.whiteStock)
  run(s,1800)
  assert.deepEqual(s.refs.rocksRef.current,initial)
  assert.equal(s.training.emitter.emitted,0)
})

test('destroying a white parent charges the dispenser, then launches a new white rock through the physical outlet',()=>{
  const s=training(),rock=s.refs.rocksRef.current.find(r=>r.kind==='normal' && r.radius>20)
  rock.pos={x:600,y:570};rock.fragmentRates={red:1,blue:0}
  s.command({type:'key',key:' ',pressed:true});run(s,26);s.command({type:'key',key:' ',pressed:false})
  assert.ok(!s.refs.rocksRef.current.includes(rock))
  assert.equal(s.refs.rocksRef.current.filter(r=>r.kind==='red').length,2,'red appears only after cutting white parent rock')
  assert.equal(s.training.emitter.emitted,0);assert.ok(s.training.emitter.charge>0)
  s.refs.shipRef.current.pos={x:500,y:1000} // Clear the volatile fragments before they detonate.
  // Observe the actual simulation, including moving rocks and collision geometry.
  for(let i=0;i<100 && !s.training.emitter.emitted;i++)s.step()
  assert.equal(s.training.emitter.emitted,1)
  const emitted=s.refs.rocksRef.current.at(-1)
  assert.equal(emitted.kind,'normal');assert.equal(emitted.radius,38)
  assert.deepEqual(emitted.pos,TRAINING_EMITTER.outlet)
  assert.deepEqual(emitted.vel,{x:-TRAINING_EMITTER.speed,y:0})
  assert.deepEqual(emitted.fragmentRates,{red:.25,blue:.35})
  assert.ok(isInsideCavern(emitted.pos,emitted.radius,trainingMap(0)))
  for(let i=0;i<110;i++) {
    s.step();assert.ok(isInsideCavern(emitted.pos,emitted.radius,trainingMap(0)))
  }
  assert.ok(emitted.pos.x+emitted.radius<2150,'the rock leaves the chute into open space')
  assert.ok(!s.drainEvents().some(e=>e.type==='persist'))
})

test('the dispenser interlock checks the ship and cargo throughout charging, then resumes when clear',()=>{
  const s=training(),rocks=[],ship={pos:{...TRAINING_SPAWN},radius:15}
  const tick=(dt=1/60)=>stepTrainingEmitter(s.training,rocks,ship,s.createRock,dt)
  tick(.6);assert.ok(s.training.emitter.charge>0)
  ship.pos={...TRAINING_EMITTER.outlet};tick(2)
  assert.equal(rocks.length,0);assert.equal(s.training.emitter.status,'blocked');assert.equal(s.training.emitter.charge,0)
  ship.pos={...TRAINING_SPAWN}
  const cell=s.refs.rocksRef.current.find(r=>r.sourceId);cell.pos={x:TRAINING_EMITTER.outlet.x-120,y:TRAINING_EMITTER.outlet.y};rocks.push(cell)
  tick(10);assert.equal(rocks.length,1);assert.equal(s.training.emitter.status,'blocked')
  rocks.pop();tick(TRAINING_EMITTER.chargeSeconds)
  assert.equal(rocks.length,1);assert.equal(rocks[0].kind,'normal')
})

test('dispenser feed has a cooldown, a fragment cap, and cannot introduce red ore or power cells',()=>{
  const s=training(),rocks=[],ship={pos:{...TRAINING_SPAWN},radius:15},rig=TRAINING_EMITTER
  const tick=dt=>stepTrainingEmitter(s.training,rocks,ship,s.createRock,dt)
  tick(rig.chargeSeconds);assert.equal(rocks.length,1)
  rocks[0].pos={x:1200,y:1800}
  tick(rig.interval-.1);assert.equal(rocks.length,1);assert.equal(s.training.emitter.status,'waiting')
  tick(.2);tick(rig.chargeSeconds);assert.equal(rocks.length,2)
  assert.ok(rocks.every(r=>r.kind==='normal' && !r.sourceId))
  // Loose fragments count toward capacity; feeding must not grow an endless field.
  while(rocks.length<rig.capacity)rocks.push(s.createRock(900,1100,19,{x:0,y:0},'blue'))
  rocks[1].pos={x:1300,y:1800};tick(100)
  assert.equal(rocks.length,rig.capacity);assert.equal(s.training.emitter.status,'stocked')
  rocks.pop();tick(rig.chargeSeconds)
  assert.equal(rocks.length,rig.capacity);assert.equal(rocks.at(-1).kind,'normal')
})

test('dispenser rails are solid, the exit admits full-sized rock, and pause/reset freezes and clears its cycle',()=>{
  const s=training(),rig=TRAINING_EMITTER,map=trainingMap(0)
  for(const hull of TRAINING_EMITTER_HOUSINGS) {
    const pos={x:(hull[0].x+hull[2].x)/2,y:(hull[0].y+hull[2].y)/2}
    assert.equal(isInsideCavern(pos,0,map),false)
  }
  for(let x=rig.outlet.x;x>=rig.outlet.x-200;x-=5)assert.ok(isInsideCavern({x,y:rig.outlet.y},rig.radius,map))
  s.refs.rocksRef.current=[];run(s,25)
  const before=structuredClone(s.training.emitter);assert.ok(before.charge>0)
  s.command({type:'pause'});run(s,300);assert.deepEqual(s.training.emitter,before)
  s.command({type:'resume'});run(s,60);assert.equal(s.training.emitter.emitted,1)
  s.command({type:'start'});assert.equal(s.training.emitter.emitted,0);assert.equal(s.training.emitter.charge,0)
  assert.equal(s.refs.rocksRef.current.length,9);assert.ok(s.refs.rocksRef.current.every(r=>r.kind!=='red'))
})

test('training ignores expedition-only commands and pause freezes all progress',()=>{
  const s=training(),before=structuredClone(s.expedition)
  for(const command of [{type:'credits'},{type:'jump',berth:'heart'},{type:'load',expedition:newExpedition()},{type:'upgrade',id:'laser'},{type:'teleport'},{type:'blaster'},{type:'launch'},{type:'interact'}])s.command(command)
  assert.deepEqual(s.expedition,before)
  s.command({type:'pause'});const time=s.timeMs;run(s,120);assert.equal(s.timeMs,time)
  s.command({type:'resume'});s.step();assert.ok(s.timeMs>time)
  assert.ok(!s.drainEvents().some(e=>e.type==='persist'))
})
