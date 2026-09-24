import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyIntersects, moveBody, pointInside, validPolygon } from '../src/games/jumping/geometry.ts'
import { STEP, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { newLevel, levelTerrain, levelPlayer, levelHeight, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, addPolygon, anchorRope, deleteItem, moveItem, resizeItem } from '../src/games/jumping/editor.ts'
import { NO_CLIMBABLES, findRope, createRope, ropePoint } from '../src/games/jumping/climbables.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { nearestBoundary } from '../src/games/jumping/geometry.ts'

const rules = { checkpoints: [], fallY: Infinity }
const tick = (p, terrain, input = {}, world = NO_CLIMBABLES) => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, world, rules)
const clear = (p, terrain) => assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)), `body intersects at ${p.x}, ${p.y}`)

test('all four level edges are solid, including fast travel and corner contacts', () => {
  const level = newLevel(), terrain = levelTerrain(level), h = levelHeight(level)
  for (const target of [[-500, 500], [4000, 500], [1600, -500], [1600, 2000], [-500, -500], [4000, 2000]]) {
    const result = moveBody([1600, 500], target, terrain)
    clear(result, terrain)
    assert.ok(result.x >= 12 && result.x <= level.width - 12)
    assert.ok(result.y >= 62 && result.y <= h)
  }
  const p = levelPlayer(level)
  for (let i = 0; i < 100; i++) tick(p, terrain, { move: -1 })
  clear(p, terrain); assert.ok(p.x >= 12); assert.equal(p.y, h)
})

test('concave polygon cavities, undersides and thin edges collide with their actual outline', () => {
  const shape = { x: 100, y: 100, w: 400, h: 400, polygon: [[0,0],[400,0],[400,80],[80,80],[80,320],[400,320],[400,400],[0,400]] }
  assert.ok(validPolygon(shape.polygon)); assert.equal(pointInside(shape, 350, 250), false)
  for (const target of [[350, 110], [350, 500], [50, 300], [-1000, -1000]]) {
    const result = moveBody([350, 300], target, [shape]); clear(result, [shape]); assert.ok(result.contacts.length)
  }
  assert.ok(moveBody([350,300],[350,110],[shape]).y >= 242)
  assert.ok(!validPolygon([[0,0],[100,100],[0,100],[100,0]]))
})

test('45 degree slopes are walkable; steeper slopes slide downhill despite uphill input', () => {
  for (const direction of [-1, 1]) for (const rise of [200, 280]) {
    const shape = { x: 100, y: 250, w: 200, h: rise, polygon: direction > 0 ? [[0,0],[200,rise],[0,rise]] : [[0,rise],[200,0],[200,rise]] }
    const p = createPlayer(); Object.assign(p, { x: 200, y: 220, grounded: false, grabCooldown: 10 })
    let slide = false, grounded = false
    for (let i = 0; i < 65; i++) {
      tick(p, [shape], { move: -direction }); clear(p, [shape])
      if (p.sliding?.active) {
        slide = true; assert.ok(p.vx * direction > 0); assert.equal(p.grounded, false)
        const pose = athletePose(p); assert.ok(Number.isFinite(pose.frontLeg.joint[0]))
      }
      grounded ||= p.grounded
    }
    if (rise === 200) { assert.equal(slide, false); assert.ok(grounded) }
    else assert.ok(slide)
  }
})

test('wall ropes catch from the open side, brace and rappel without any body penetration', () => {
  for (const side of [-1, 1]) {
    const wall = { x: side > 0 ? 400 : 0, y: 100, w: 400, h: 700 }, edge = 400
    const world = { ladders: [], ropes: [{ x: edge - side * 2, y: 100, length: 570, segments: 28 }] }
    const p = createPlayer(); Object.assign(p, { x: edge - side * 24, y: 350, facing: side, grounded: false })
    let braced = 0, firstY = 0
    for (let i = 0; i < 100; i++) {
      tick(p, [wall], i < 30 ? {} : { descend: true }, world); clear(p, [wall])
      if (p.climbing?.wall) {
        if (!braced) firstY = p.y
        braced++
        const pose = athletePose(p)
        for (const point of [pose.head, pose.hip, pose.shoulder, pose.frontLeg.joint, pose.backLeg.joint]) {
          assert.ok((edge - (p.x + point[0] * p.facing)) * side > 0, 'pose stays on the open side')
        }
      }
    }
    assert.ok(braced > 80, `kept grip for ${braced} frames`); assert.ok(p.y > firstY + 35)
    tick(p, [wall], { jump: true, move: -side }, world); assert.equal(p.climbing, null)
  }
})

test('a rope behind a thin wall cannot be grabbed through it', () => {
  const wall = { x: 300, y: 0, w: 10, h: 800 }, p = createPlayer()
  Object.assign(p, { x: 288, y: 350, facing: 1, grounded: false, ropes: [createRope({x: 316, y: 100, length: 500, segments: 24})] })
  assert.equal(findRope(p, [wall]), null)
})

test('Down at a rope-side ledge lowers first, then continues down the rope without catch/release loops', () => {
  for (const side of [-1,1]) for (const offset of [0,10,25]) {
    const wall = { x: side > 0 ? 400 : 0, y: 200, w: 400, h: 600 }
    const world = { ladders: [], ropes: [{x:400-side*2, y:100, length:570, segments:28}] }
    const p = createPlayer(); Object.assign(p,{x:400+side*offset,y:200,grounded:true})
    for(let i=0;i<60;i++) tick(p,[wall],{},world)
    let lowering=false, ropeFrames=0
    for(let i=0;i<350;i++) {
      tick(p,[wall],{descend:true},world)
      lowering ||= !!p.mantle?.descending
      if(p.climbing?.kind==='rope') ropeFrames++
      if(!p.mantle) clear(p,[wall])
    }
    assert.ok(lowering); assert.ok(ropeFrames>180); assert.ok(p.y>450); assert.equal(p.climbing?.kind,'rope')
  }
})

test('rappelling loads the rope away from the wall and climbing the rim releases it onto the ledge', () => {
  for (const side of [-1, 1]) {
    const wall = { x: side > 0 ? 400 : 0, y: 200, w: 400, h: 600 }
    const world = { ladders: [], ropes: [{ x: 400 - side * 2, y: 100, length: 570, segments: 28 }] }
    const p = createPlayer(); Object.assign(p, { x: 400 - side * 24, y: 440, facing: side, grounded: false })
    let tension = false, mantle = false
    for (let i = 0; i < 550; i++) {
      tick(p, [wall], { climb: i > 30 }, world)
      if (!p.mantle) clear(p, [wall]) // The mantle uses authored limb contacts instead of the standing hull.
      mantle ||= !!p.mantle
      if (p.climbing?.wall && i > 30) tension ||= (400 - ropePoint(p.climbing.rope, p.climbing.distance)[0]) * side > 5
    }
    assert.ok(tension); assert.ok(mantle); assert.equal(p.climbing, null); assert.ok(p.grounded); assert.equal(p.y, 200)
  }
})

test('polygon editing, free ladders and terrain rope anchors round-trip and follow edits', () => {
  let level = addPolygon(newLevel(), [[200,200],[500,200],[500,280],[300,280],[300,500],[200,500]]).level
  level = addItem(level, 'ladder', {x:700,y:200}, {x:700,y:600}).level
  assert.equal(level.climbables.ladders[0].platform, -1)
  level = addItem(level, 'rope', {x:499,y:279}, {x:499,y:700}).level
  level = anchorRope(level, 0)
  assert.equal(level.climbables.ropes[0].anchor.platform, 0)
  const r = {...level.climbables.ropes[0]}
  level = moveItem(level, {kind:'platform',index:0}, 40, 20)
  assert.equal(level.climbables.ropes[0].x, r.x + 40); assert.equal(level.climbables.ropes[0].y, r.y + 20)
  level = resizeItem(level, {kind:'platform',index:0}, 360, 360)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  level = deleteItem(level, {kind:'platform',index:0})
  assert.equal(level.climbables.ropes[0].anchor, undefined); assert.equal(level.climbables.ladders.length, 1)
})

test('polygon cliffs support the same ledge-to-rope transfer as rectangles', () => {
  const wall={x:400,y:200,w:400,h:600,polygon:[[0,0],[400,0],[400,600],[100,600],[0,400]]}
  const world={ladders:[],ropes:[{x:398,y:100,length:550,segments:28}]},p=createPlayer()
  Object.assign(p,{x:410,y:200,grounded:true})
  for(let i=0;i<330;i++) tick(p,[wall],{descend:i>30},world)
  assert.equal(p.climbing?.kind,'rope');assert.ok(p.y>400);clear(p,[wall])
})

test('falling and sliding soles stay outside steep terrain throughout the contact blend', () => {
  for(const side of [-1,1]) {
    const b={x:100,y:250,w:200,h:280,polygon:side>0?[[0,0],[200,280],[0,280]]:[[0,280],[200,0],[200,280]]}
    const p=createPlayer();Object.assign(p,{x:200,y:220,grounded:false,grabCooldown:10})
    for(let i=0;i<100;i++) {
      tick(p,[b]);const pose=athletePose(p)
      for(const leg of [pose.frontLeg,pose.backLeg]) for(const point of FOOT_CONTACT) {
        const sole=footPoint(point,leg.footAngle*leg.footFacing,leg.toeAngle*leg.footFacing)
        const x=p.x+(leg.end[0]+sole[0]*leg.footFacing)*p.facing,y=p.y+leg.end[1]+sole[1]
        assert.ok(!pointInside(b,x,y)||nearestBoundary(b,x,y).distance<.1,`sole inside slope on frame ${i}`)
      }
    }
  }
})
