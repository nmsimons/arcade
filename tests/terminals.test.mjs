import test from 'node:test'
import assert from 'node:assert/strict'
import { TERMINALS, terminalVisible } from '../src/games/hardVacuum/terminals.ts'
import { expeditionMap, freshExpedition, freshRuntime, parseExpedition, snapshotCargo, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { stepGrappleGuide } from '../src/games/hardVacuum/grappleGuide.ts'
import { updateHarpoon } from '../src/games/hardVacuum/harpoon.ts'
import { collideBodies } from '../src/games/hardVacuum/bodyCollisions.ts'

const shipAt=pos=>({pos:{...pos},vel:{x:0,y:0},radius:15,angle:0})
const tick=(s,rt,ship,harpoon={state:'idle'},dt=1/60)=>stepExpedition(s,rt,{dt,ship,harpoon,rocks:[],beam:{active:false}})
const rope=(ax,ay,bx,by,length)=>{
  const points=Array.from({length:17},(_,i)=>({x:ax+(bx-ax)*(i+1)/18,y:ay+(by-ay)*(i+1)/18}))
  return {rope:points,ropePrev:structuredClone(points),segLen:length/18}
}

test('every terminal requires a real tether, plays immediately, and can be reconnected without duplicating its record',()=>{
  for (const terminal of TERMINALS) {
    const s=freshExpedition(),rt=freshRuntime(),ship=shipAt({x:terminal.pos.x+75,y:terminal.pos.y})
    for(let i=0;i<120;i++)tick(s,rt,ship)
    assert.equal(s.campaign.records.includes(terminal.terminalId),false,'flying nearby never reads a terminal')
    rt.radio={id:'first-light',time:16};rt.grappleLesson={remaining:12,cell:true}
    const hook={state:'attached',rock:terminal}
    tick(s,rt,ship,hook)
    assert.ok(s.campaign.records.includes(terminal.terminalId));assert.equal(rt.radio.id,terminal.terminalId)
    assert.equal(rt.connectedTerminal,terminal.terminalId);assert.equal(rt.grappleHint,'')
    assert.equal(s.campaign.terminalLinked,true);assert.equal(s.campaign.grappleLearned,false,'data connection does not skip the towing lesson')
    for(let i=0;i<20;i++)tick(s,rt,ship,hook,1)
    assert.equal(rt.radio.time,16,'the recording stays visible while connected')
    tick(s,rt,ship);assert.equal(rt.connectedTerminal,undefined)
    rt.radio={id:'first-light',time:16};tick(s,rt,ship,hook)
    assert.equal(rt.radio.id,terminal.terminalId,'reconnecting replays an already downloaded record')
    assert.equal(s.campaign.records.filter(id=>id===terminal.terminalId).length,1)
    snapshotCargo(s,rt,[])
    assert.equal(s.cargo[terminal.terminalId],undefined,'fixed terminals are never saved as loose cargo')
    const restored=parseExpedition(JSON.stringify(s))
    assert.equal(restored.campaign.terminalLinked,true);assert.ok(restored.campaign.records.includes(terminal.terminalId))
  }
})

test('the terminal lesson is contextual, respects walls, and retires after the first data connection',()=>{
  const s=freshExpedition(),rt=freshRuntime(),terminal=TERMINALS[0]
  const ship=shipAt({x:terminal.pos.x+75,y:terminal.pos.y}),map=expeditionMap(s)
  s.campaign.grappleLearned=true
  const hint=()=>stepGrappleGuide(s,rt,ship,{state:'idle'},[],map,.1)
  hint();assert.match(rt.grappleHint,/terminal.*blue socket.*F.*recording/)
  ship.pos={x:terminal.pos.x+900,y:terminal.pos.y};hint();assert.equal(rt.grappleHint,'')
  ship.pos={x:terminal.pos.x+75,y:terminal.pos.y}
  const x=terminal.pos.x+35,y=terminal.pos.y
  const blocked={...map,obstacles:[...map.obstacles,[{x,y:y-100},{x:x+10,y:y-100},{x:x+10,y:y+100},{x,y:y+100}]]}
  assert.equal(terminalVisible(ship.pos,terminal,blocked),false)
  stepGrappleGuide(s,rt,ship,{state:'idle'},[],blocked,.1);assert.equal(rt.grappleHint,'')
  s.campaign.terminalLinked=true;hint();assert.equal(rt.grappleHint,'')
  const legacy=freshExpedition();legacy.version=1;delete legacy.campaign.terminalLinked
  assert.equal(parseExpedition(JSON.stringify(legacy)).campaign.terminalLinked,false)
  legacy.campaign.terminalLinked='yes';assert.equal(parseExpedition(JSON.stringify(legacy)),null)
})

test('hooks latch onto terminals from every direction at different frame rates without moving the fixture',()=>{
  const fixture=TERMINALS[0],before=structuredClone(fixture)
  for(const fps of [30,60,120]) for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4,ship=shipAt({x:fixture.pos.x-Math.cos(angle)*110,y:fixture.pos.y-Math.sin(angle)*110})
    const hook={current:{state:'flying',pos:{...ship.pos},vel:{x:Math.cos(angle)*650,y:Math.sin(angle)*650},life:1200,traveled:0,maxLength:325,ropeLength:325,...rope(ship.pos.x,ship.pos.y,fixture.pos.x,fixture.pos.y,325)}}
    const args={w:9600,h:5100,ship,shipRef:{current:ship},rocks:[fixture],harpoonRef:hook,buildRopeBetween:rope,HARPOON_HOOK_MASS:.2,HARPOON_VISUAL_SLACK:1.18,HARPOON_REEL_MIN_LEN:22}
    for(let frame=0;frame<fps/2;frame++)updateHarpoon({...args,dt:1/fps})
    assert.equal(hook.current.state,'attached')
    ship.pos.x=fixture.pos.x-325;ship.pos.y=fixture.pos.y;ship.vel.x=-100
    for(let frame=0;frame<fps*2;frame++)updateHarpoon({...args,dt:1/fps})
    assert.ok(Math.abs(fixture.pos.x-ship.pos.x-130)<1e-7,'winch pulls the ship toward its anchor')
    assert.ok(ship.vel.x>-1,'tension stops separating motion')
    assert.deepEqual(fixture,before,'terminal stays bolted down under tension')
  }
  const ship=shipAt({x:fixture.pos.x-30,y:fixture.pos.y});ship.vel.x=100
  collideBodies(ship,fixture)
  assert.ok(ship.vel.x<0);assert.deepEqual(fixture,before)
})
