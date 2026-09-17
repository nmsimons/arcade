import test from 'node:test'
import assert from 'node:assert/strict'
import { bumpTraffic, collideHaven, havenColliders, havenPanels, HAVEN_FOLDED_CLEARANCE } from '../src/games/hardVacuum/havenGeometry.ts'
import { freshExpedition, freshRuntime, expeditionMap, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { stepGrappleGuide } from '../src/games/hardVacuum/grappleGuide.ts'

const pose = (deployment=0,x=0,angle=0) => ({pos:{x,y:0},deployment,angle})
const edges = panel => panel.vertices.map((v,i,a)=>Math.hypot(v.x-a[(i+1)%4].x,v.y-a[(i+1)%4].y))
const body = (x,y,extra={}) => ({pos:{x,y},vel:{x:0,y:0},radius:15,...extra})

test('Haven folds rigid leaves instead of shrinking, with clearance for its whole transport hull',()=>{
  const deployed=havenPanels(pose(1))
  for (let n=0;n<=20;n++) {
    const folded=havenPanels(pose(n/20,500,.6))
    for (let i=0;i<6;i++) edges(folded[i]).forEach((length,j)=>assert.ok(Math.abs(length-edges(deployed[i])[j])<1e-8))
  }
  const points=havenColliders(pose()).flat()
  assert.ok(points.every(p=>Math.hypot(p.x,p.y)+5 < HAVEN_FOLDED_CLEARANCE),'includes the drawn rear extrusion')
  assert.ok(points.some(p=>Math.hypot(p.x,p.y)>55),'a substantial transport hull remains')
})

test('the transport hull strikes rocks, cells, cargo and a free ship without consuming them',()=>{
  for (const properties of [{kind:'normal'},{kind:'blue'},{kind:'blue',sourceId:'breach-power'},{cargoId:'rescue-cache'},{}]) {
    const target=body(60,0,properties)
    const hit=collideHaven(target,pose(0,0),pose(0,15),.1)
    assert.ok(hit.hit);assert.ok(hit.speed>0);assert.ok(target.vel.x>0)
    for (const [key,value] of Object.entries(properties)) assert.equal(target[key],value)
    assert.equal(target.radius,15)
    const before={...target.vel}
    collideHaven(target,pose(0,15),pose(0,15),.1)
    assert.deepEqual(target.vel,before,'touching an idle hull adds no phantom thrust')
  }
  const seated=body(60,0,{socketId:'breach-power'})
  assert.equal(collideHaven(seated,pose(),pose(0,15),.1).hit,false)
  assert.deepEqual(seated.pos,{x:60,y:0})
})

test('folding and opening push loose objects even when Haven stays at one position',()=>{
  for (const opening of [false,true]) {
    const cargo=body(80,0,{cargoId:'rescue-cache',radius:20})
    let contact=false, maximumSpeed=0
    for(let n=1;n<=144;n++) {
      const a=opening ? (n-1)/144 : 1-(n-1)/144,b=opening ? n/144 : 1-n/144
      const hit=collideHaven(cargo,pose(a),pose(b),1/60)
      contact ||= hit.hit;maximumSpeed=Math.max(maximumSpeed,Math.hypot(cargo.vel.x,cargo.vel.y))
      cargo.pos.x+=cargo.vel.x/60;cargo.pos.y+=cargo.vel.y/60
    }
    assert.ok(contact,opening ? 'opening contact' : 'folding contact')
    assert.ok(maximumSpeed>10);assert.ok(maximumSpeed<650,'articulation does not launch cargo at unbounded speed')
    assert.ok(Math.hypot(cargo.pos.x-80,cargo.pos.y)>20)
  }
})

test('loose cargo passes a tender impact on to nearby debris',()=>{
  const cargo=body(0,0,{mass:1,vel:{x:100,y:0}}),rock=body(26,0,{mass:2})
  bumpTraffic(cargo,rock)
  assert.ok(rock.vel.x>0);assert.ok(cargo.vel.x<100)
  assert.ok(Math.hypot(cargo.pos.x-rock.pos.x,cargo.pos.y-rock.pos.y)>=30-.001)
})

test('grapple guidance teaches nose aiming, recovery from a miss, towing and release once',()=>{
  const s=freshExpedition(),rt=freshRuntime(),ship={...body(8000,3560),angle:0},cell=body(8100,3560,{sourceId:'breach-power'})
  const step=(hook,dt=.1,aboard=false)=>stepGrappleGuide(s,rt,ship,hook,[cell],expeditionMap(s),dt,aboard)
  step({state:'idle'});assert.match(rt.grappleHint,/nose.*F/)
  step({state:'deployed'});assert.match(rt.grappleHint,/recall/)
  step({state:'attached',rock:cell});assert.match(rt.grappleHint,/Fly to tow; F releases/);assert.match(rt.grappleHint,/power receiver/)
  assert.equal(s.campaign.grappleLearned,true)
  step({state:'idle'});assert.match(rt.grappleHint,/released/)
  step({state:'idle'},13);assert.equal(rt.grappleHint,'')
  const restored=parseExpedition(JSON.stringify(s));assert.equal(restored.campaign.grappleLearned,true)
  step({state:'idle'});assert.equal(rt.grappleHint,'')
  s.campaign.grappleLearned=false;step({state:'idle'},.1,true);assert.equal(rt.grappleHint,'')
  cell.pos={x:7800,y:3250};step({state:'idle'});assert.equal(rt.grappleHint,'','no prompts through walls or out of reach')
})

test('saves from before the lesson and articulated tender get compatible defaults',()=>{
  const s=freshExpedition();delete s.campaign.grappleLearned;delete s.campaign.havenAngle
  let restored=parseExpedition(JSON.stringify(s))
  assert.equal(restored.campaign.havenAngle,0);assert.equal(restored.campaign.grappleLearned,false)
  s.power={'breach-power':'breach-power'}
  restored=parseExpedition(JSON.stringify(s));assert.equal(restored.campaign.grappleLearned,true)
})
