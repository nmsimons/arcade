import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, cancelJumpInput, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { bodyIntersects, pointInside, nearestBoundary } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { staticContactWorld, translatePlayer } from '../src/games/jumping/playerContacts.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'
import { stepUpCommitted } from '../src/games/jumping/stepUp.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { FRONT_GRIP } from '../src/games/jumping/ledge.ts'

const floor = { x: -400, y: 0, w: 800, h: 80 }
const setup = (height, side = 1, x = 0) => ({
  p: createPlayer({ x, y: 0 }),
  terrain: [{ ...floor }, { x: side === 1 ? 100 : -300, y: -height, w: 200, h: height }],
})
const tick = (p, terrain, input = {}, world = staticContactWorld(terrain)) =>
  stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, undefined, undefined, world)
function approach(p, terrain, input = {}, world) {
  for (let i = 0; i < 180; i++) {
    tick(p, terrain, { move: 1, ...input }, world)
    if (p.mantle?.step) return true
  }
  return false
}

test('tall steps reverse safely before top commitment on opposite, Down, or detach intent', () => {
  for (const height of [40,60]) for (const side of [-1,1]) for (const progress of [0,.1,.45,.8,.97]) {
    for (const request of [{ move: -side }, { drop: true }, { descend: true }, { detach: true }, { move: -side, detach: true, drop: true }]) {
      const { p, terrain } = setup(height, side, 74.5 * side)
      assert.ok(approach(p, terrain, { move: side }))
      while (p.mantle.time / p.mantle.step.duration < progress) tick(p, terrain, { move: side })
      if (!p.mantle) continue
      const committed = stepUpCommitted(p.mantle, staticContactWorld(terrain)), source = p.mantle.step.caught
      let previous = [p.x,p.y], count = 0
      while (p.mantle && count++ < 100) {
        tick(p, terrain, request)
        assert.ok(Math.hypot(p.x-previous[0],p.y-previous[1]) < 9, 'the reverse follows the entry curve without teleporting')
        assert.ok(terrain.every(b => !bodyIntersects(p.x,p.y,b)), 'the reverse still sweeps real solids')
        previous = [p.x,p.y]
      }
      assert.equal(p.mantle, null)
      assert.ok(p.grounded)
      assert.ok(Math.abs(p.y - (committed ? -height : source.y)) < .01)
      assert.ok(Math.abs(p.x - (committed ? side * 120 : source.x)) < .01)
    }
  }
})

test('returning steps preserve the rig through source handoff in both gravity frames', () => {
  for (const height of [40,60]) for (const side of [-1,1]) for (const inverted of [false,true]) {
    const source = setup(height, side, 74.5 * side)
    const terrain = inverted ? source.terrain.map(mirrorPlatform) : source.terrain, p = source.p
    Object.assign(p, { inverted, gravity: inverted ? -TUNING.gravity : TUNING.gravity })
    const advance = input => stepPlayer(p, { ...NEUTRAL_INPUT,...input }, STEP, terrain,
      undefined,undefined,undefined,undefined,p.gravity)
    for (let i = 0; i < 180 && !p.mantle; i++) advance({move:side})
    assert.ok(p.mantle?.step)
    const joints = () => {
      const pose = athletePose(p)
      return [pose.hip,pose.waist,pose.shoulder,pose.head,
        ...[pose.frontArm,pose.backArm,pose.frontLeg,pose.backLeg].flatMap(l => [l.joint,l.end])]
        .map(point => [p.x+point[0]*side,p.y+point[1]*(inverted ? -1 : 1)])
    }
    const entry = [{time:p.mantle.time,points:joints()}]
    for (let i = 0; i < 15; i++) {
      advance({move:side}); entry.push({time:p.mantle.time,points:joints()})
    }
    let previous = joints(), count = 0
    while (p.mantle && count++ < 100) {
      advance({move:-side})
      const points = joints()
      const matching = entry.find(frame => Math.abs(frame.time-(p.mantle?.time ?? 0)) < 1e-8)
      assert.ok(matching,'the return visits the same entry samples')
      // Ordinary gait settling resumes on the source tick; every joint must
      // stay within one world unit of the exact captured entry silhouette.
      points.forEach((point,i) => assert.ok(Math.hypot(point[0]-matching.points[i][0],point[1]-matching.points[i][1]) < (p.mantle ? .05 : 1),
        `height ${height}, inverted ${inverted}, joint ${i} retraces its entry and settles continuously at the source`))
      assert.ok(Math.hypot(points[3][0]-previous[3][0],points[3][1]-previous[3][1]) < 8,'the head follows the continuous entry path')
      previous = points
    }
    assert.equal(p.mantle,null); assert.ok(p.grounded); assert.ok(Math.abs(p.y) < 1e-9)
  }
})

test('a buffered jump survives cancellation once, and pausing clears it while returning', () => {
  for (const height of [40,60]) for (const pause of [false,true]) {
    const {p,terrain} = setup(height,1,74.5)
    assert.ok(approach(p,terrain))
    for (let i = 0; i < 12; i++) tick(p,terrain,{move:1})
    tick(p,terrain,{move:-1,jump:true})
    assert.ok(p.mantle.returning && p.mantle.step.jumpQueued)
    if (pause) cancelJumpInput(p)
    for (let i = 0; i < 80 && p.mantle; i++) tick(p,terrain,{move:-1})
    assert.equal(p.mantle,null)
    assert.equal(p.grounded,pause)
    assert.equal(p.jumpLift !== null,!pause)
    if (pause) assert.equal(p.buffer,0)
    else {
      const before = p.y
      tick(p,terrain,{move:-1})
      assert.ok(p.y < before && !p.grounded,'the buffered launch continues without relaunching')
      assert.equal(p.buffer,0)
    }
  }
})

test('an object entering the return path interrupts a tall step at the last clear body', () => {
  const {p,terrain} = setup(60,1,74.5)
  assert.ok(approach(p,terrain))
  for (let i = 0; i < 28; i++) tick(p,terrain,{move:1})
  const obstacle = {x:68,y:-90,w:20,h:90}
  assert.equal(bodyIntersects(p.x,p.y,obstacle),false)
  const world = staticContactWorld([...terrain,obstacle])
  // Dynamic objects use the same swept hull; they never become an auto step.
  world.colliders.at(-1).id = 'prop:return-path'
  for (let i = 0; i < 90 && p.mantle; i++) {
    const before = [p.x,p.y]
    tick(p,world.platforms,{move:-1},world)
    assert.ok(world.platforms.every(b => !bodyIntersects(p.x,p.y,b)))
    assert.ok(Math.hypot(p.x-before[0],p.y-before[1]) < 9)
  }
  assert.equal(p.mantle,null)
  assert.ok(p.x >= obstacle.x+obstacle.w+TUNING.width/2-.01,'a blocked return never teleports to its captured source')
  assert.ok(p.grabCooldown > 0)
})

test('one through three tile terrain steps climb in either direction without penetrating any solid', () => {
  for (const height of [20, 40, 60]) for (const side of [1, -1]) for (const start of [0, 88]) {
    const { p, terrain } = setup(height, side, start * side)
    assert.ok(approach(p, terrain, { move: side }))
    const duration = p.mantle.step.duration, vx = p.mantle.step.caught.vx
    let frames = 0
    while (p.mantle && frames++ < 100) {
      const x = p.x, y = p.y
      tick(p, terrain, { move: side })
      assert.ok((p.x - x) * side >= -.01, 'the root never backs away from the step')
      assert.ok(p.y <= y + .01, 'the rise is monotone')
      assert.ok(Math.hypot(p.x - x, p.y - y) < 9, 'no root teleport')
      assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)), 'including the supporting ledge')
      const pose = athletePose(p)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        assert.ok([...limb.root, ...limb.joint, ...limb.end].every(Number.isFinite))
        assert.ok(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1]) <= 14.51)
      }
    }
    assert.ok(p.grounded && !p.mantle)
    assert.equal(p.y, -height)
    assert.equal(p.x, side * (height > 40 ? 120 : 112))
    assert.equal(p.vx, vx, 'resume the incoming movement speed')
    assert.ok(frames * STEP <= duration + STEP)
  }
})

test('ledges above three tiles retain deliberate jumping', () => {
  const { p, terrain } = setup(61)
  assert.equal(approach(p, terrain), false)
  assert.equal(p.y, 0)
  tick(p, terrain, { move: 1, jump: true })
  assert.ok(p.vy < -TUNING.jumpSpeed * .9 && !p.grounded)
})

test('two and three tile mantles need the same sustained push and climb time, while one tile steps remain immediate', () => {
  const low = setup(20, 1, 88)
  tick(low.p, low.terrain, { move: 1 })
  assert.ok(low.p.mantle?.step)
  for (const height of [40, 60]) {
    const { p, terrain } = setup(height, 1, height === 60 ? 74.5 : 88)
    for (let i = 0; i < 20; i++) {
      tick(p, terrain, { move: 1 })
      assert.equal(p.mantle, null, 'brief contact does not climb')
      assert.equal(p.y, 0)
    }
    for (let i = 0; i < 6; i++) tick(p, terrain, { move: 1 })
    assert.ok(p.mantle?.step, 'continuing to push starts the mantle')
    assert.equal(p.mantle.step.duration, .34)
  }
})

test('releasing, reversing, jumping, or a light stick input cannot accumulate mantle intent', () => {
  for (const height of [40, 60]) for (const interruption of [{}, { move: -1 }, { move: .3 }, { move: 1, jump: true }]) {
    const { p, terrain } = setup(height, 1, height > 40 ? 74.5 : 88)
    for (let i = 0; i < 18; i++) tick(p, terrain, { move: 1 })
    tick(p, terrain, interruption)
    assert.equal(p.stepIntent, null)
    assert.equal(p.mantle, null)
    if (interruption.jump) continue
    for (let i = 0; i < 18; i++) tick(p, terrain, { move: 1 })
    assert.equal(p.mantle, null, 'the hold must start over')
  }
  const { p, terrain } = setup(40, 1, 88)
  for (let i = 0; i < 90; i++) tick(p, terrain, { move: .3 })
  assert.equal(p.mantle, null)
})

test('stepping requires grounded directional intent and does not take over crouching or jumping', () => {
  for (const height of [40, 60]) for (const input of [{}, { move: -1 }, { move: 1, crouch: true }, { move: 1, jump: true }, { move: 1, descend: true }]) {
    const { p, terrain } = setup(height, 1, 80)
    for (let i = 0; i < 25; i++) { tick(p, terrain, input); assert.equal(p.mantle?.step, undefined) }
  }
  const { p, terrain } = setup(40, 1, 80)
  Object.assign(p, { grounded: false, coyote: 0, y: -1, vy: -100 })
  tick(p, terrain, { move: 1 })
  assert.equal(p.mantle?.step, undefined)
})

test('boxes and moving mechanisms are not automatic terrain steps', () => {
  for (const height of [40, 60]) for (const id of ['prop:box', 'prop:ball', 'mechanism:gate', 'mechanism:lift']) {
    const { p, terrain } = setup(height)
    const world = staticContactWorld(terrain)
    world.colliders[1].id = id
    assert.equal(approach(p, terrain, {}, world), false)
    assert.equal(p.y, 0)
  }
})

test('low ceilings, occupied landings, short ledges and gaps prevent automatic climbs', () => {
  for (const height of [40, 60]) for (const variant of ['ceiling', 'landing', 'narrow', 'gap']) {
    const { p, terrain } = setup(height)
    if (variant === 'ceiling') terrain.push({ x: 50, y: -height - 65, w: 220, h: 20 })
    if (variant === 'landing') terrain.push({ x: 117, y: -height - 90, w: 100, h: 90 })
    if (variant === 'narrow') terrain[1].w = 10
    if (variant === 'gap') terrain[0] = { ...floor, w: 480 }
    assert.equal(approach(p, terrain), false, variant)
  }
})

test('three-tile climb height is measured from an elevated support, not the level floor', () => {
  for (const height of [41, 50, 60]) for (const side of [-1, 1]) {
    const { p, terrain } = setup(height, side)
    for (const b of terrain) b.y -= 240
    p.y = -240
    assert.ok(approach(p, terrain, { move: side }))
    for (let i = 0; i < 60 && p.mantle; i++) tick(p, terrain, { move: side })
    assert.equal(p.y, -240 - height)
    assert.equal(p.grounded, true)
  }
})

test('three-tile pull-ups keep both hands on the lip during the lift', () => {
  for (const side of [-1, 1]) {
    const { p, terrain } = setup(60, side)
    assert.ok(approach(p, terrain, { move: side }))
    let samples = 0
    while (p.mantle) {
      const t = p.mantle.time / p.mantle.step.duration
      if (t >= .2 && t <= .4) {
        const pose = athletePose(p)
        for (const [arm, inset] of [[pose.frontArm, 2], [pose.backArm, -.5]]) {
          assert.ok(Math.abs(p.x + arm.hand[0] * side - (100 + inset) * side) < .01)
          assert.ok(Math.abs(p.y + arm.hand[1] - (-60 + FRONT_GRIP[1])) < .01)
        }
        samples++
      }
      tick(p, terrain, { move: side })
    }
    assert.ok(samples > 5)
  }
})

test('stairs work in one polygon and as separate terrain blocks', () => {
  for (const joined of [false, true]) {
    const terrain = joined ? [{ x: -200, y: -60, w: 600, h: 120,
      polygon: [[0,60],[300,60],[300,40],[360,40],[360,20],[420,20],[420,0],[600,0],[600,120],[0,120]] }]
      : [floor, { x: 100, y: -20, w: 60, h: 20 }, { x: 160, y: -40, w: 60, h: 40 }, { x: 220, y: -60, w: 180, h: 60 }]
    const p = createPlayer(), climbs = new Set()
    for (let i = 0; i < 130; i++) {
      tick(p, terrain, { move: 1 })
      if (p.mantle?.step) climbs.add(p.mantle.edgeY)
      assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
    }
    assert.deepEqual([...climbs], [-20, -40, -60])
    assert.equal(p.y, -60)
    assert.ok(p.x > 240)
  }
})

test('one-tile treads use a compact landing and climb every riser with clear legs and supported feet', () => {
  for (const joined of [false, true]) for (const side of [-1, 1]) for (const start of [0, 70, 88]) {
    const steps = Array.from({ length: 5 }, (_, i) => ({ x: 100 + i * 20, y: -20 * (i + 1), w: i === 4 ? 220 : 20, h: 20 * (i + 1) }))
    const shapes = joined ? [{ x: -400, y: -100, w: 800, h: 180,
      polygon: [[0,100],[500,100], ...steps.flatMap(s => [[s.x + 400, s.y + 100], [s.x + s.w + 400, s.y + 100]]), [800,180],[0,180]] }]
      : [floor, ...steps]
    const terrain = side > 0 ? shapes : shapes.map(b => ({ ...b, x: -b.x - b.w,
      polygon: b.polygon?.map(([x, y]) => [b.w - x, y]) }))
    const p = createPlayer({ x: start * side, y: 0 }), climbs = new Set(), insets = new Set()
    let previousHead = null
    const outside = (x, y) => {
      for (const b of terrain) if (pointInside(b, x, y)) assert.ok(nearestBoundary(b, x, y).distance < .1, 'the pose stays outside each riser')
    }
    for (let frame = 0; frame < 280 && p.x * side < 240; frame++) {
      const before = [p.x, p.y]
      tick(p, terrain, { move: side })
      if (p.mantle?.step) { climbs.add(p.mantle.edgeY); insets.add((p.mantle.toX - p.mantle.edgeX) * side) }
      assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
      assert.ok(Math.hypot(p.x - before[0], p.y - before[1]) < 9, 'the root advances continuously')
      const pose = athletePose(p), head = [p.x + pose.head[0] * side, p.y + pose.head[1]]
      if (previousHead) assert.ok(Math.hypot(head[0] - previousHead[0], head[1] - previousHead[1]) < 8, 'the head has no transition snap')
      previousHead = head
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        for (const [a, b] of [[leg.root, leg.joint], [leg.joint, leg.end]]) for (let i = 0; i <= 12; i++) {
          outside(p.x + (a[0] + (b[0] - a[0]) * i / 12) * side, p.y + a[1] + (b[1] - a[1]) * i / 12)
        }
        for (const point of FOOT_CONTACT) {
          const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
          outside(p.x + (leg.end[0] + sole[0] * leg.footFacing) * side, p.y + leg.end[1] + sole[1])
        }
      }
    }
    assert.deepEqual([...climbs], [-20, -40, -60, -80, -100])
    assert.deepEqual([...insets], [8, 12], 'compact treads shorten the landing; the open top keeps the ordinary stride')
    assert.ok(p.x * side >= 240 && p.y === -100 && p.grounded)
  }
})

test('a fresh run up one- then two-tile stairs keeps the whole leg outside the second riser', () => {
  for (const joined of [false, true]) for (const side of [-1, 1]) for (const start of [0, 68]) {
    const shapes = joined ? [{ x: -100, y: -60, w: 500, h: 140,
      polygon: [[0,60],[200,60],[200,40],[280,40],[280,0],[500,0],[500,140],[0,140]] }]
      : [{ x: -100, y: 0, w: 500, h: 80 }, { x: 100, y: -20, w: 80, h: 20 }, { x: 180, y: -60, w: 220, h: 60 }]
    const terrain = side > 0 ? shapes : shapes.map(b => ({ ...b, x: -b.x - b.w,
      polygon: b.polygon?.map(([x, y]) => [b.w - x, y]) }))
    const p = createPlayer({ x: start * side, y: 0 }), climbs = new Set()
    const outside = (x, y, label) => {
      for (const b of terrain) if (pointInside(b, x, y)) {
        assert.ok(nearestBoundary(b, x, y).distance < .1,
          `${label} enters the stair: joined ${joined}, side ${side}, start ${start}, player ${p.x},${p.y}`)
      }
    }
    // Sample every fixed simulation tick, including the initial unprimed gait.
    for (let frame = 0; frame < 180 && p.x * side < 230; frame++) {
      tick(p, terrain, { move: side })
      if (p.mantle?.step) climbs.add(p.mantle.step.rise)
      const pose = athletePose(p)
      for (const [name, leg] of [['front', pose.frontLeg], ['back', pose.backLeg]]) {
        for (const [a, b] of [[leg.root, leg.joint], [leg.joint, leg.end]]) for (let i = 0; i <= 12; i++) {
          outside(p.x + (a[0] + (b[0] - a[0]) * i / 12) * side,
            p.y + a[1] + (b[1] - a[1]) * i / 12, `${name} leg`)
        }
        for (const point of FOOT_CONTACT) {
          const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
          outside(p.x + (leg.end[0] + sole[0] * leg.footFacing) * side, p.y + leg.end[1] + sole[1], `${name} sole`)
        }
      }
    }
    assert.deepEqual([...climbs], [20, 40])
    assert.ok(p.x * side >= 230 && p.y === -60, 'both stairs remain traversable')
  }
})

test('a new obstacle interrupts a step safely rather than phasing through it', () => {
  const { p, terrain } = setup(40)
  assert.ok(approach(p, terrain))
  terrain.push({ x: 100, y: -120, w: 40, h: 80 })
  for (let i = 0; i < 80; i++) {
    tick(p, terrain, { move: 1 })
    assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
  }
  assert.equal(p.mantle, null)
  assert.ok(p.x < 100)
})

test('a tap or held jump during a short mantle is preserved', () => {
  for (const held of [false, true]) {
    const { p, terrain } = setup(40)
    assert.ok(approach(p, terrain))
    tick(p, terrain, { move: 1, jump: true })
    for (let i = 0; i < 100 && p.mantle; i++) tick(p, terrain, { move: 1, jump: held })
    assert.ok(p.vy < -250 && !p.grounded)
  }
})

test('pausing clears a jump queued during a step', () => {
  const { p, terrain } = setup(40)
  assert.ok(approach(p, terrain))
  tick(p, terrain, { move: 1, jump: true })
  cancelJumpInput(p)
  for (let i = 0; i < 100 && p.mantle; i++) tick(p, terrain)
  assert.ok(p.grounded && p.buffer === 0)
  assert.equal(p.vy, 0)
})

test('external displacement interrupts a terrain step without shifting its destination', () => {
  const { p, terrain } = setup(40)
  assert.ok(approach(p, terrain))
  const x = p.x
  translatePlayer(p, -3, 0)
  assert.equal(p.x, x - 3)
  assert.equal(p.mantle, null)
  assert.ok(p.grabCooldown > 0)
  tick(p, terrain)
  assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
})

test('step animation keeps planted soles fixed and toes outside the riser, without a torso snap', () => {
  for (const height of [20, 40, 60]) for (const side of [1, -1]) {
    const { p, terrain } = setup(height, side)
    assert.ok(approach(p, terrain, { move: side }))
    let previous = null
    for (let i = 0; i < 60; i++) {
      const pose = athletePose(p), head = [p.x + pose.head[0] * side, p.y + pose.head[1]]
      if (previous) assert.ok(Math.hypot(head[0] - previous[0], head[1] - previous[1]) < 8)
      previous = head
      if (!p.mantle) break
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        const x = p.x + leg.end[0] * side, y = p.y + leg.end[1]
        if (leg.planted && x * side > 100) assert.ok(Math.abs(y + 2.8 + height) < .02, 'the supporting ankle stays on top')
        for (const point of FOOT_CONTACT) {
          const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
          const sx = x + sole[0] * side * leg.footFacing, sy = y + sole[1]
          for (const b of terrain) if (pointInside(b, sx, sy)) assert.ok(nearestBoundary(b, sx, sy).distance < .1)
        }
      }
      tick(p, terrain, { move: side })
    }
  }
})
