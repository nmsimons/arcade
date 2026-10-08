import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { actionFeedbackText, playerActionFeedback } from '../src/games/jumping/actionFeedback.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'
import { createJumpController } from '../src/games/jumping/input.ts'
import { createJumpTouch } from '../src/games/jumping/touchInput.ts'
import { createRope } from '../src/games/jumping/climbables.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'

const down={...NEUTRAL_INPUT,drop:true,descend:true,crouch:true}
const terrain=[{x:500,y:400,w:220,h:220}]
function controller() {
  const pad={index:0,id:'Traversal test',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}
  const reader=createJumpController();let now=0;reader.sample([pad],'playing',now)
  return buttons=>{
    pad.buttons.forEach((button,i)=>{button.pressed=buttons.includes(i);button.value=Number(button.pressed)})
    return reader.sample([pad],'playing',now+=STEP*1000)
  }
}

test('feedback predicts the same lowering or crouch as the next Down and remains read-only',()=>{
  for(const x of [530,532,532.01,600]) for(const blocked of [false,true]) for(const lowCeiling of [false,true]) {
    const p=createPlayer({x,y:400})
    const floor=[...terrain,...(blocked?[{x:450,y:400,w:45,h:220}]:[]),...(lowCeiling?[{x:500,y:340,w:220,h:20}]:[])]
    if(lowCeiling)Object.assign(p,{crouching:true,crouch:1})
    stepPlayer(p,lowCeiling?down:NEUTRAL_INPUT,STEP,floor)
    // Reset only after a neutral initialization; Down above can already begin
    // lowering in the ceiling case, which must itself advertise that action.
    if(p.mantle) {assert.equal(playerActionFeedback(p).kind,'lowering');continue}
    const before=structuredClone(p),feedback=playerActionFeedback(p)
    assert.deepEqual(p,before)
    stepPlayer(p,down,STEP,floor)
    assert.equal(!!p.mantle?.descending,feedback.kind==='lower',`${x}, blocked ${blocked}, ceiling ${lowCeiling}`)
    if(feedback.kind==='crouch')assert.equal(p.crouching,true)
  }
})

test('controller lowering holds safely in both gravity frames, then a separate press drops or pulls up',()=>{
  for(const side of [-1,1])for(const inverted of [false,true])for(const action of ['drop','detach','pull']) {
    const p=createPlayer({x:side===1?530:690,y:400}),read=controller()
    if(inverted){mirrorPlayerState(p);p.inverted=true}
    const world=inverted?terrain.map(mirrorPlatform):terrain
    const step=buttons=>stepPlayer(p,read(buttons),STEP,world,undefined,undefined,undefined,undefined,inverted?-TUNING.gravity:TUNING.gravity)
    step([])
    assert.deepEqual(playerActionFeedback(p),{kind:'lower',inverted})
    for(let i=0;i<240;i++)step([inverted?12:13])
    assert.ok(p.hang,'held lowering ends in a stable hang')
    assert.equal(p.mantle,null)
    const feedback=playerActionFeedback(p)
    assert.equal(inverted?feedback.upLocked:feedback.downLocked,true)
    assert.match(actionFeedbackText(feedback,'controller'),inverted?/Release Up/:/Release Down/)
    const position=[p.x,p.y]
    for(let i=0;i<60;i++)step([inverted?12:13])
    assert.deepEqual([p.x,p.y],position)
    step([])
    step([action==='detach'?1:action==='pull'?12:13])
    if(action==='pull')assert.ok(p.mantle&&!p.hang,'fresh Up starts the pull-up')
    else {assert.equal(p.hang,null);assert.equal(p.vx,-side*60);assert.equal(p.grabCooldown,.35)}
  }
})

test('touch Down uses the safe hang and a lifted, separate gesture drops',()=>{
  const p=createPlayer({x:530,y:400}),touch=createJumpTouch()
  const step=now=>stepPlayer(p,touch.sample(now),STEP,terrain)
  touch.down(1,500,200,0,1000);touch.move(1,500,240,20)
  for(let now=150;now<2200;now+=STEP*1000)step(now)
  assert.ok(p.hang);assert.ok(p.hang.dropLocked)
  assert.match(actionFeedbackText(playerActionFeedback(p),'touch'),/Lift, then drag down again/)
  touch.up(1,500,240,2200);step(2220)
  touch.down(2,500,200,2250,1000);touch.move(2,500,240,2270)
  step(2400)
  assert.equal(p.hang,null);assert.equal(p.vx,-60)
})

test('supported ladder acquisition precedes crouch while supported rope Down retains crouch',()=>{
  const floor=[{x:0,y:500,w:1000,h:100}],p=createPlayer({x:500,y:500})
  const ladders={ladders:[{x:500,top:200,bottom:600,platform:0,side:1}],ropes:[]}
  stepPlayer(p,NEUTRAL_INPUT,STEP,floor,ladders)
  assert.equal(playerActionFeedback(p,ladders).kind,'climb')
  stepPlayer(p,down,STEP,floor,ladders);assert.equal(p.climbing.kind,'ladder')
  const q=createPlayer({x:500,y:500}),definition={x:510,y:200,length:400,segments:50}
  q.ropes=[createRope(definition)]
  const ropes={ladders:[],ropes:[definition]}
  stepPlayer(q,NEUTRAL_INPUT,STEP,floor,ropes)
  assert.equal(playerActionFeedback(q,ropes).kind,'crouch')
  stepPlayer(q,down,STEP,floor,ropes);assert.equal(q.climbing,null);assert.ok(q.crouching)
})

test('normal controller Down crouches on the pool floor and Up matches passive ascent',()=>{
  const level=blankTrial();level.spawn={x:700,y:920}
  level.gravityPlates=[{id:'water',x:200,y:400,w:1000,h:520,gravity:-1,effect:'water',power:'always'}]
  const results=[]
  for(const rise of [[],[12]]) {
    const run=createRun(level),read=controller()
    for(let i=0;i<480;i++)stepRun(run,read([13]))
    assert.ok(run.player.grounded&&run.player.crouching)
    assert.equal(playerActionFeedback(run.player).kind,'water-bottom')
    const floorY=run.player.y
    for(let i=0;i<240;i++)stepRun(run,read(rise))
    assert.ok(!run.player.grounded&&!run.player.crouching)
    assert.ok(run.player.y<floorY-100,'buoyancy lifts after Down ends')
    assert.equal(playerActionFeedback(run.player).kind,'water')
    results.push([run.player.y,run.player.vy])
  }
  assert.deepEqual(results[0],results[1],'Up adds no powered ascent to passive buoyancy')
})
