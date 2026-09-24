import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'
import { nearestBoundary, pointInside, polygonPoints } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

const advance = (run, frames, move = 0) => { for (let i=0;i<frames;i++) stepRun(run,{...NEUTRAL_INPUT,move}) }
function ramp(direction = -1, rise = 300) {
  const level = blankTrial()
  level.platforms = [{x:200,y:920-rise,w:1000,h:rise,polygon:direction<0?[[0,rise],[1000,0],[1000,rise]]:[[0,0],[1000,rise],[0,rise]]}]
  return level
}
const surface = (level,x) => {
  const shape=level.platforms[0], [a,b]=shape.polygon
  return shape.y+a[1]+(x-shape.x)*(b[1]-a[1])/(b[0]-a[0])
}
function clearTerrain(run) {
  for(const prop of run.props) for(const terrain of run.terrain) {
    if(prop.kind==='ball') {
      const cy=prop.y-prop.size/2, nearest=nearestBoundary(terrain,prop.x,cy)
      assert.ok(!pointInside(terrain,prop.x,cy),'ball center stays outside terrain')
      assert.ok(nearest.distance>=prop.size/2-.06,`ball penetrated terrain by ${prop.size/2-nearest.distance}`)
    } else for(const [x,y] of polygonPoints(boxShape(prop))) {
      if(pointInside(terrain,x,y)) assert.ok(nearestBoundary(terrain,x,y).distance<.06,'box corner penetrated terrain')
    }
  }
}

for(const direction of [-1,1]) {
  test(`boxes settle on their face on a ${direction<0?'rising':'falling'} slope`,()=>{
    const level=ramp(direction);level.props=[{kind:'box',x:700,y:surface(level,700),size:100}]
    const run=createRun(level);run.started=true;clearTerrain(run)
    for(let i=0;i<600;i++){advance(run,1);clearTerrain(run)}
    const box=run.props[0]
    assert.ok(Math.abs(box.angle-Math.atan(direction*.3))<.01)
    assert.ok(Math.hypot(box.vx,box.vy)<1,`settled speed: ${box.vx}, ${box.vy}`)
    assert.equal(box.grounded,true)
  })
  test(`a large ball clears ${direction<0?'rising':'falling'} terrain from placement through rolling`,()=>{
    const level=ramp(direction);level.props=[{kind:'ball',x:700,y:surface(level,700),size:200}]
    const run=createRun(level);run.started=true;clearTerrain(run)
    for(let i=0;i<480;i++){advance(run,1);clearTerrain(run)}
    assert.ok((run.props[0].x-700)*direction>100)
  })
  test(`shovebot wheel contacts and tilt follow a ${direction<0?'rising':'falling'} slope`,()=>{
    const level=ramp(direction,450);level.robots=[{x:700,y:surface(level,700),left:400,right:1100}]
    const run=createRun(level);run.started=true;Object.assign(run.player,{x:100,y:920})
    const robot=run.robots[0];robot.facing=1;const start=robot.x
    for(let i=0;i<120;i++){
      advance(run,1)
      assert.ok(Math.abs(robot.angle-Math.atan(direction*.45))<.001)
      for(const side of [-1,1]){
        const x=robot.x+side*17*Math.cos(robot.angle),y=robot.y-9+side*17*Math.sin(robot.angle)
        const contact=nearestBoundary(level.platforms[0],x,y)
        assert.ok(Math.abs(contact.distance-9)<.01,'wheel rests on the slope')
      }
    }
    assert.ok(robot.x>start+70)
  })
}

test('a box tips off a ledge instead of remaining an upright block',()=>{
  const level=blankTrial();level.platforms=[{x:400,y:600,w:250,h:30}];level.props=[{kind:'box',x:648,y:600,size:80}]
  const run=createRun(level);run.started=true;run.props[0].vx=150
  let tipped=false
  for(let i=0;i<180;i++){advance(run,1);tipped ||= Math.abs(run.props[0].angle)>.3;clearTerrain(run)}
  assert.ok(tipped);assert.ok(run.props[0].y>800)
})

for(const slope of [false,true]) test(`a pushed ball stays outside a closed gate on ${slope?'a slope':'flat ground'}`,()=>{
  const level=slope?ramp(1):blankTrial(),ballY=slope?surface(level,700):920
  level.mechanisms=[{id:'gate',kind:'gate',x:800,y:480,w:20,h:440,travel:360}]
  level.props=[{kind:'ball',x:700,y:ballY,size:200}]
  const run=createRun(level);run.started=true;Object.assign(run.player,{x:575,y:slope?surface(level,575):920})
  for(let i=0;i<900;i++){
    advance(run,1,1);clearTerrain(run)
    assert.ok(run.props[0].x+100<=800.06,'pushing must never move the ball through the gate')
    assert.ok(run.player.x<run.props[0].x,'player stays on the pushing side')
  }
})

test('a gate rises past a ball leaning against it on a slope',()=>{
  const level=ramp(1)
  level.mechanisms=[{id:'gate',kind:'gate',x:800,y:540,w:20,h:380,travel:340}]
  level.props=[{kind:'ball',x:700,y:surface(level,700),size:200}]
  level.triggers=[{x:50,y:920,w:100,target:'gate',mode:'touch'}]
  const run=createRun(level);run.started=true;Object.assign(run.player,{x:100,y:920})
  for(let i=0;i<400;i++){advance(run,1);clearTerrain(run)}
  assert.equal(run.mechanisms[0].y,200)
  assert.ok(run.props[0].x>800,'released ball can roll past the lifted gate')
})

test('pushing a tilted box uphill keeps hands on its face and makes gradual progress',()=>{
  const level=ramp(-1);level.props=[{kind:'box',x:700,y:surface(level,700),size:100}]
  const run=createRun(level);run.started=true;advance(run,600)
  const box=run.props[0];Object.assign(run.player,{x:box.x-85,y:surface(level,box.x-85),vx:0,footwork:null})
  const start=box.x;let poses=0,previous=box.x
  for(let i=0;i<360;i++){
    advance(run,1,1);clearTerrain(run)
    if(run.player.pushing?.slope!==undefined)poses++
    assert.ok(Math.abs(box.x-previous)<2,'pushing does not snap the box forward');previous=box.x
  }
  assert.ok(box.x>start+50,`box should travel uphill: ${box.x-start}`)
  assert.ok(poses>250,`hands keep contact with the tilted face: ${poses}`)
  assert.ok(Math.abs(box.angle+Math.atan(.3))<.02)
})

test('uphill pushing keeps the body steady through foot changes in either direction',()=>{
  for(const direction of [-1,1]) for(const rise of [300,500]) {
    const level=ramp(-direction,rise);level.props=[{kind:'box',x:700,y:surface(level,700),size:100}]
    const run=createRun(level);run.started=true;advance(run,600)
    const box=run.props[0],p=run.player,x=box.x-direction*85
    Object.assign(p,{x,y:surface(level,x),vx:0,facing:direction,footwork:null})
    let previous=null,velocity=null,pose=null,footChanges=0,feet=null
    for(let frame=0;frame<360;frame++){
      advance(run,1,direction)
      if(frame<120)continue
      const current=athletePose(p)
      assert.equal(p.grounded,true);assert.equal(p.pushing?.amount,1)
      if(previous){
        const delta=[p.x-previous.x,p.y-previous.y]
        assert.ok(delta[0]*direction>=0,'a steady shove must not repeatedly pull the body backwards')
        if(velocity)assert.ok(Math.hypot(delta[0]-velocity[0],delta[1]-velocity[1])<.05,'walking and contact corrections must not fight')
        velocity=delta
        for(const joint of ['hip','shoulder','head'])assert.ok(Math.hypot(current[joint][0]-pose[joint][0],current[joint][1]-pose[joint][1])<.1,`${joint} stays steady as feet exchange support`)
        footChanges+=p.footwork.feet.filter((foot,i)=>foot.planted!==feet[i]).length
      }
      previous={x:p.x,y:p.y};pose=current;feet=p.footwork.feet.map(foot=>foot.planted)
    }
    assert.ok(footChanges>=6,'the check spans several actual steps')
    advance(run,30,-direction)
    assert.ok(p.x*direction<previous.x*direction-20,'reversing input releases the pushing contact')
  }
})

test('a large ball clears both sides of a valley and the adjoining crest',()=>{
  const level=blankTrial()
  level.platforms=[{x:200,y:600,w:1200,h:320,profile:[[0,0],[250,150],[500,40],[800,120],[1200,320]]}]
  for(const x of [440,470,690,720]){
    level.props=[{kind:'ball',x,y:750,size:200}]
    const run=createRun(level);run.started=true;clearTerrain(run)
    for(let i=0;i<400;i++){advance(run,1);clearTerrain(run)}
  }
})

test('shovebots traverse a flat-ramp-flat join in both directions without body or wheel jitter',()=>{
  const level=blankTrial();level.platforms=[{x:300,y:620,w:1000,h:300,profile:[[0,300],[200,300],[800,0],[1000,0]]}]
  level.robots=[{x:400,y:920,left:300,right:1250}]
  const run=createRun(level);run.started=true;run.player.x=10
  const robot=run.robots[0];robot.facing=1;let high=false,returned=false,previous={...robot}
  for(let i=0;i<2400;i++){
    advance(run,1)
    assert.ok(Math.abs(robot.y-previous.y)<2,'support height changes continuously')
    assert.ok(Math.abs(robot.angle-previous.angle)<.05,'body tilt changes continuously')
    if(robot.x>1150)high=true
    if(high&&robot.x<450)returned=true
    previous={...robot}
  }
  assert.ok(high&&returned,'bot goes up, turns, and drives back down')
})

test('standing on a ball wedged between a tilted box and gate preserves support and permits a jump out',()=>{
  const level=blankTrial()
  level.platforms=[{x:200,y:737,w:1200,h:183,profile:[[0,183],[440,0],[880,183],[1200,183]]}]
  level.mechanisms=[{id:'gate',kind:'gate',x:750,y:610,w:20,h:310,travel:300}]
  level.props=[{kind:'ball',x:716,y:769,size:68},{kind:'box',x:650,y:778,size:80}]
  const run=createRun(level);run.started=true;run.props[1].angle=.39;advance(run,180)
  const ball=run.props[0],p=run.player
  Object.assign(p,{x:ball.x-4,y:ball.y-ball.size,grounded:true,vx:0,vy:0,footwork:null})
  // Walking toward the box can move or tip it. Keep support while over the
  // ball's crown, and permit normal sliding once that route becomes clear.
  for(let i=0;i<180;i++){
    advance(run,1,-1)
    if(Math.abs(p.x-ball.x)<ball.size*.2 && Math.abs(p.y-ball.y+ball.size)<4){assert.equal(p.grounded,true);assert.equal(p.vy,0)}
    assert.ok(p.vy<900,'contact must not accumulate falling speed while trapped')
    assert.ok(ball.x+34<=750.01)
  }
  const start={x:p.x,y:p.y};let highest=p.y
  for(let i=0;i<150;i++){
    stepRun(run,{...NEUTRAL_INPUT,move:-1,jump:i<20});highest=Math.min(highest,p.y);clearTerrain(run)
  }
  assert.ok(highest<start.y-60,'jump leaves the ball')
  assert.ok(p.x<start.x-80,'player can escape over the box')
})

test('small boxes remain pushable below hand height',()=>{
  for(const size of [20,40]){
    const level=blankTrial();level.props=[{kind:'box',x:400,y:920,size}];level.spawn.x=400-size/2-26
    const run=createRun(level);advance(run,180,1)
    assert.ok(run.props[0].x>430)
  }
})
