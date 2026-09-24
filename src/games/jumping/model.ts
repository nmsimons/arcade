import { advanceFootwork } from './footwork.ts'
import type { Footwork } from './footwork.ts'
import { climbFrame, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME, ledgeEase, ropeCatchRoot } from './ledge.ts'
import { CLIMBABLES, NO_CLIMBABLES, climbGait, climbRoot, constrainRopeBody, createRope, ease, findClimbable, findRope, ropeImpulse, ropePoint, settleRopeGrip, stepRope, updateRopeWall } from './climbables.ts'
import type { ClimbableWorld, Climbing, Ladder, RopeState } from './climbables.ts'
import { exposedSide, followGround, groundAt, platformSurface, walkable } from './terrain.ts'
import { bodyIntersects, moveBody, nearestBoundary, pointInside } from './geometry.ts'

export interface Platform { x: number; y: number; w: number; h: number; profile?: readonly (readonly [number, number])[]; polygon?: readonly (readonly [number, number])[] }
export const TUNING = {
  runSpeed: 350, walkSpeed: 125, acceleration: 2200, airAcceleration: 300,
  braking: 2800, gravity: 1550, jumpSpeed: 455, chargedJumpSpeed: 800,
  wallJumpSpeed: 560, wallJumpPush: 300, wallJumpControlTime: .12,
  chargeTime: .35, coyoteTime: .1, jumpBuffer: .13, width: 24, height: 62, crouchHeight: 40, hangReach: 74,
  climbTime: LEDGE_CLIMB_TIME,
} as const
export const STEP = 1 / 120
export const WORLD_WIDTH = 4500
export interface Checkpoint { x: number; y: number; radius?: number }
export interface LevelRules { checkpoints: readonly Checkpoint[]; fallY: number }
export const PLAYGROUND_RULES: LevelRules = { checkpoints: [{ x: 1500, y: 620 }, { x: 2050, y: 620, radius: 250 }, { x: 2600, y: 620 }], fallY: 1020 }
export const PLATFORMS: readonly Platform[] = [
  { x: 0, y: 620, w: 1670, h: 320 },
  { x: 1920, y: 620, w: WORLD_WIDTH - 1920, h: 320 },
  { x: 610, y: 566, w: 140, h: 54 },
  { x: 820, y: 502, w: 160, h: 118 },
  { x: 1150, y: 400, w: 230, h: 18 },
  { x: 2260, y: 490, w: 180, h: 130 },
  { x: 320, y: 582, w: 230, h: 38, profile: [[0, 38], [95, 0], [135, 0], [230, 38]] },
  { x: 2680, y: 494, w: 740, h: 126, profile: [[0, 126], [240, 30], [300, 0], [400, 0], [490, 45], [740, 126]] },
  { x: 3490, y: 554, w: 700, h: 66, profile: [[0, 66], [60, 42], [95, 48], [135, 30], [175, 38], [220, 14],
    [255, 22], [300, 0], [345, 14], [380, 6], [425, 32], [465, 20], [510, 44], [550, 34], [610, 54], [650, 46], [700, 66]] },
]
export interface JumpInput { move: number; jump: boolean; climb: boolean; drop: boolean; crouch: boolean; reach: boolean; descend?: boolean; detach?: boolean }
export const NEUTRAL_INPUT: JumpInput = { move: 0, jump: false, climb: false, drop: false, crouch: false, reach: false, descend: false, detach: false }
export interface GaitPose { speed: number; moving: number; run: number; air: number }
export function gaitPose(vx: number, airborne = false): GaitPose {
  const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
  const speed = Math.min(1, Math.abs(vx) / TUNING.runSpeed)
  return { speed, moving: smooth(speed * 6), run: smooth((speed - .38) / .48), air: Number(airborne) }
}
export interface Player {
  x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; groundAngle: number
  sliding: { angle: number; amount: number; time: number; active: boolean; x: number; y: number } | null
  charge: number; charging: boolean; coyote: number; buffer: number; jumpHeld: boolean
  grabCooldown: number; knockback: number
  wallJumpBuffer: number; wallJump: { direction: number; time: number } | null
  wallBrace: { wallX: number; direction: number; active: boolean; hands: [number, number]; feet: [number, number] } | null
  climbing: Climbing | null; ropes: RopeState[] | null
  pushing: { wallX: number; direction: number; amount: number; effort: number } | null
  ledgeReach: { x: number; y: number; amount: number } | null
  hang: { platform: number; side: number; edgeX: number; edgeY: number; time: number; queued: boolean; braced: boolean; dropLocked?: boolean;
    caught: { x: number; y: number; vx: number; vy: number; stride: number; gait: GaitPose | null; ledgeReach: Player['ledgeReach']; climbing?: Climbing | null } } | null
  mantle: { edgeX: number; edgeY: number; side: number; toX: number; toY: number; time: number; braced: boolean;
    descending?: { platform: number; caught: Climbing['caught']; climbable: Climbing | null } } | null
  stride: number; landing: number; landingImpact: number; spawnX: number; spawnY: number; checkpoint: number
  jumpStart: number; jumpHeight: number; bestHeight: number
  crouching: boolean; crouch: number; reach: number
  gait: GaitPose | null
  footwork: Footwork | null
  terrain?: readonly Platform[]
}
export function createPlayer(): Player {
  return { x: 200, y: 620, vx: 0, vy: 0, facing: 1, grounded: true, groundAngle: 0, sliding: null,
    charge: 0, charging: false, coyote: TUNING.coyoteTime, buffer: 0, jumpHeld: false,
    grabCooldown: 0, knockback: 0, wallJumpBuffer: 0, wallJump: null, wallBrace: null, climbing: null, ropes: null, pushing: null, ledgeReach: null, hang: null, mantle: null, stride: 0, landing: 0, landingImpact: 0,
    spawnX: 200, spawnY: 620, checkpoint: 0, jumpStart: 620, jumpHeight: 0, bestHeight: 0,
    crouching: false, crouch: 0, reach: 0, gait: null, footwork: null }
}
function settleGait(p: Player, dt: number) {
  const target = gaitPose(p.climbing ? 0 : p.vx, !p.grounded && !p.hang && !p.mantle && !p.climbing), previous = p.gait ?? gaitPose(0)
  const blend = (from: number, to: number, response = to > from ? .045 : .08) => {
    const value = from + (to - from) * (1 - Math.exp(-dt / response))
    return Math.abs(value - to) < .001 ? to : value
  }
  // Animation settles independently of physical braking; the feet return to rest.
  p.gait = { speed: blend(previous.speed, target.speed), moving: blend(previous.moving, target.moving), run: blend(previous.run, target.run),
    air: blend(previous.air, target.air, target.air ? .035 : .065) }
}
export function cancelJumpInput(p: Player) {
  p.charge = 0; p.charging = false; p.jumpHeld = false; p.buffer = 0; p.wallJumpBuffer = 0
}
export function respawn(p: Player) {
  const { spawnX, spawnY, checkpoint, bestHeight } = p
  const ropes = p.ropes?.map(r => createRope(r.definition)) ?? null
  Object.assign(p, createPlayer(), { x: spawnX, y: spawnY, spawnX, spawnY, checkpoint, bestHeight, ropes })
}
const approach = (value: number, target: number, delta: number) => value + Math.max(-delta, Math.min(delta, target - value))
const overlaps = (x: number, y: number, b: Platform, height: number = TUNING.height) => bodyIntersects(x, y, b, height)
function launch(p: Player, charge: number) {
  p.vy = -(TUNING.jumpSpeed + (TUNING.chargedJumpSpeed - TUNING.jumpSpeed) * charge)
  p.grounded = false; p.coyote = 0; p.charge = 0; p.charging = false; p.buffer = 0; p.wallJumpBuffer = 0
  p.jumpStart = p.y; p.jumpHeight = 0
}
function updateWallBrace(p: Player, move: number, dt: number, platforms: readonly Platform[]) {
  let contact: Player['wallBrace'] = null
  if (!p.grounded && !p.hang && !p.mantle && !p.climbing) {
    for (const direction of [p.facing, -p.facing]) {
      if (move * direction < -.01) continue
      const wallX = p.x + direction * TUNING.width / 2
      const touches = (offset: number) => platforms.some(wall =>
        Math.abs((direction === 1 ? wall.x : wall.x + wall.w) - wallX) < .15
        && exposedSide(platforms, wall, direction, p.y + offset - .1, p.y + offset + .1))
      const hands: [number, number] = [Number(touches(-43)), Number(touches(-46))]
      const feet: [number, number] = [Number(touches(-16)), Number(touches(-20))]
      if (![...hands, ...feet].some(Boolean)) continue
      const previous = p.wallBrace?.direction === direction ? p.wallBrace : null
      contact = { wallX, direction, active: true,
        hands: hands.map((value, i) => approach(previous?.hands[i] ?? 0, value, dt / .08)) as [number, number],
        feet: feet.map((value, i) => approach(previous?.feet[i] ?? 0, value, dt / .08)) as [number, number] }
      p.facing = direction
      break
    }
  }
  if (contact) p.wallBrace = contact
  else if (p.wallBrace) {
    const brace = p.wallBrace
    brace.active = false
    brace.hands = brace.hands.map(value => approach(value, 0, dt / .12)) as [number, number]
    brace.feet = brace.feet.map(value => approach(value, 0, dt / .12)) as [number, number]
    if (p.facing !== brace.direction || p.hang || p.mantle || p.climbing || ![...brace.hands, ...brace.feet].some(Boolean)) p.wallBrace = null
  }
}
function tryWallJump(p: Player, platforms: readonly Platform[]) {
  const brace = p.wallBrace
  if (!brace?.active || p.grounded || p.wallJumpBuffer === 0) return
  // Recheck the actual face in case a moving object or the player's movement
  // has removed the contact since the last frame.
  if (Math.abs((brace.wallX - p.x) * brace.direction - TUNING.width / 2) > .15
    || !platforms.some(wall => Math.abs((brace.direction === 1 ? wall.x : wall.x + wall.w) - brace.wallX) < .15
      && exposedSide(platforms, wall, brace.direction, p.y - TUNING.height + 8, p.y - 8))) return
  launch(p, 0)
  p.vy = -TUNING.wallJumpSpeed; p.vx = -brace.direction * TUNING.wallJumpPush; p.facing = -brace.direction
  p.wallJump = { direction: -brace.direction, time: 0 }; p.wallJumpBuffer = 0
  p.grabCooldown = .22; p.knockback = 0; p.wallBrace = null; p.pushing = null; p.ledgeReach = null; p.footwork = null
}
function absorbLanding(p: Player, downwardSpeed: number) {
  // Capture the impact before the collision removes vertical velocity.
  p.landingImpact = ease((downwardSpeed - 150) / 850)
  p.landing = 1
}
function ledgeBraced(platforms: readonly Platform[], edgeX: number, edgeY: number, side: number) {
  return [55, 58].every(offset => platforms.some(wall => {
    const face = side === 1 ? wall.x : wall.x + wall.w
    return Math.abs(face - edgeX) < .1 && pointInside(wall, edgeX + side * .1, edgeY + offset)
  }))
}
function ledgeSurface(b: Platform, side: number) {
  const x = side === 1 ? b.x : b.x + b.w, surface = platformSurface(b, x + side * .01)
  const standing = platformSurface(b, x + side * 20, surface.y)
  return Math.abs(surface.angle) < .001 && Math.abs(standing.y - surface.y) < .01 && Number.isFinite(surface.y)
    ? { x, y: surface.y } : null
}
function ledgePathClear(platforms: readonly Platform[], platform: number, side: number, braced: boolean) {
  const edge = ledgeSurface(platforms[platform], side)
  if (!edge) return false
  const { x: edgeX, y: edgeY } = edge
  return !platforms.some((other, index) => index !== platform && (
    overlaps(edgeX + 20 * side, edgeY, other) || overlaps(edgeX - 14 * side, edgeY, other)
    || Array.from({ length: 25 }, (_, i) => climbFrame(i / 24, braced).root).some(root => overlaps(edgeX + root[0] * side, edgeY + root[1], other))
  ))
}
/** Free ladders meet nearby terrain by position, including the builder's 20-unit grid spacing. */
function ladderLedge(ladder: Ladder, platforms: readonly Platform[]) {
  const candidates = platforms.flatMap((b, platform) => [1, -1].flatMap(side => {
    const edge = ledgeSurface(b, side), gap = edge ? (edge.x - ladder.x) * side : Infinity
    return edge && gap >= TUNING.width / 2 && gap <= 32 && Math.abs(edge.y - ladder.top) < 1
      && exposedSide(platforms, b, side, edge.y, edge.y + TUNING.hangReach)
      ? [{ platform, side, edgeX: edge.x, edgeY: edge.y, braced: ledgeBraced(platforms, edge.x, edge.y, side), gap }] : []
  })).sort((a, b) => Number(b.platform === ladder.platform && b.side === ladder.side) - Number(a.platform === ladder.platform && a.side === ladder.side)
    || a.gap - b.gap || Number(b.side === ladder.side) - Number(a.side === ladder.side))
  return candidates.find(edge => {
    if (!ledgePathClear(platforms, edge.platform, edge.side, edge.braced)) return false
    const target: [number, number] = [edge.edgeX - edge.side * 14, edge.edgeY + TUNING.hangReach]
    const safe = moveBody([ladder.x, ladder.top + climbGait(18).root], target, platforms)
    return Math.hypot(safe.x - target[0], safe.y - target[1]) < .01
  })
}
/** A rope grip can reach a lip even when the platform has no wall below the feet. */
function ropeLedge(p: Player, climb: Climbing, platforms: readonly Platform[]) {
  const grip = ropePoint(climb.rope!, climb.distance)
  const candidates = platforms.flatMap((b, platform) => [1, -1].flatMap(side => {
    const edge = ledgeSurface(b, side), gap = edge ? (edge.x - p.x) * side : Infinity
    return edge && gap >= -TUNING.width / 2 && gap <= 48 && Math.abs(edge.x - grip[0]) <= 28
      && grip[1] >= edge.y - 24 && grip[1] <= edge.y + 33
      && exposedSide(platforms, b, side, edge.y, edge.y + TUNING.hangReach)
      ? [{ platform, side, edgeX: edge.x, edgeY: edge.y, braced: ledgeBraced(platforms, edge.x, edge.y, side) }] : []
  })).sort((a, b) => Math.hypot(a.edgeX - grip[0], a.edgeY - grip[1]) - Math.hypot(b.edgeX - grip[0], b.edgeY - grip[1]))
  return candidates.find(edge => {
    if (!ledgePathClear(platforms, edge.platform, edge.side, edge.braced) || platforms.some(b => overlaps(p.x, p.y, b))) return false
    const from: [number, number] = [(p.x - edge.edgeX) * edge.side, p.y - edge.edgeY]
    let previous: [number, number] = [p.x, p.y]
    for (let i = 1; i <= 16; i++) {
      const root = ropeCatchRoot(from, i / 16), target: [number, number] = [edge.edgeX + root[0] * edge.side, edge.edgeY + root[1]]
      const safe = moveBody(previous, target, platforms)
      if (Math.hypot(safe.x - target[0], safe.y - target[1]) > .01) return false
      previous = target
    }
    return true
  })
}
export function playerState(p: Player) {
  return p.climbing ? `${p.climbing.kind === 'rope' ? 'Rope' : 'Ladder'} · ${p.climbing.direction > 0 ? 'ascending' : p.climbing.direction < 0 ? 'descending' : 'holding'}`
    : p.mantle ? p.mantle.descending ? 'Lowering' : 'Climbing' : p.hang ? 'Hanging' : p.sliding?.active ? 'Sliding' : p.wallBrace?.active ? 'Bracing' : p.wallJump ? 'Wall jump' : p.pushing && p.pushing.effort > 0 ? 'Pushing' : p.crouching ? 'Crouching' : p.reach > .5 ? 'Reaching' : p.charging ? 'Charging' : !p.grounded ? p.vy < 0 ? 'Rising' : 'Falling'
    : Math.abs(p.vx) > 180 ? 'Running' : Math.abs(p.vx) > 10 ? 'Walking' : 'Ready'
}

/** Fixed-step, world-space movement. Rendering and input devices never change physics. */
export function stepPlayer(p: Player, input: JumpInput, dt = STEP, platforms: readonly Platform[] = PLATFORMS,
  climbables: ClimbableWorld = platforms === PLATFORMS ? CLIMBABLES : NO_CLIMBABLES,
  rules: LevelRules = platforms === PLATFORMS ? PLAYGROUND_RULES : { checkpoints: [], fallY: 1020 }) {
  p.terrain = platforms
  const from: [number, number] = [p.x, p.y], oldVy = p.vy, oldMantle = p.mantle
  stepMotion(p, input, dt, platforms, climbables, rules)
  // The authored mantle already clears its own ledge; every other solid still blocks it.
  const mantle = p.mantle ?? oldMantle
  const obstacles = mantle ? platforms.filter(b => Math.abs((ledgeSurface(b, mantle.side)?.y ?? Infinity) - mantle.edgeY) > .01
    || Math.abs((mantle.side === 1 ? b.x : b.x + b.w) - mantle.edgeX) > .01) : platforms
  if (p.gait === null && p.x === p.spawnX && p.y === p.spawnY) return // Respawn is a teleport to a validated start.
  const result = moveBody(from, [p.x, p.y], obstacles, p.crouching ? TUNING.crouchHeight : TUNING.height)
  // Following a curved ground profile may cross a crest between two samples.
  // Keep the supported endpoint only for tiny corrections with a clear body.
  if (p.grounded && Math.hypot(result.x - p.x, result.y - p.y) < Math.abs(p.x - from[0]) + .1 && !obstacles.some(b => overlaps(p.x, p.y, b))) {
    result.x = p.x; result.y = p.y
  }
  const corrected = Math.hypot(result.x - p.x, result.y - p.y) > .01
  p.x = result.x; p.y = result.y
  if (corrected) {
    if (p.mantle || p.hang) { p.mantle = null; p.hang = null; p.grabCooldown = .25 }
    p.footwork = null
    for (const { normal, platform: b } of result.contacts) {
      // A glancing foot/corner contact must not turn downward speed into a
      // sideways launch. The vertical face arrests lateral movement only.
      const n = !b.polygon && !b.profile && p.y > b.y && p.y - TUNING.height < b.y + b.h && (p.x < b.x || p.x > b.x + b.w)
        ? [p.x < b.x ? -1 : 1, 0] : normal
      const into = p.vx * n[0] + p.vy * n[1]
      if (into < 0) { p.vx -= into * n[0]; p.vy -= into * n[1] }
    }
  }
  if (!p.climbing && !p.hang && !p.mantle) {
    const ground = groundAt(platforms, p.x, p.y, .2)
    const slope = result.contacts.map(c => ({ ...c, face: nearestBoundary(c.platform, p.x, p.y) })).find(c => c.face.ny < -1e-7 && !walkable(Math.atan2(c.face.nx, -c.face.ny))
      && (c.platform.polygon || c.platform.profile))
    if (slope) {
      const angle = Math.atan2(slope.face.nx, -slope.face.ny), sign = Math.sign(angle), tangent = [Math.cos(angle), Math.sin(angle)]
      const speed = Math.max(25, (p.vx * tangent[0] + p.vy * tangent[1]) * sign)
      const contact = nearestBoundary(slope.platform, p.x, p.y)
      p.vx = tangent[0] * speed * sign; p.vy = tangent[1] * speed * sign
      p.sliding = { angle, amount: Math.min(1, (p.sliding?.amount ?? 0) + dt / .1), time: (p.sliding?.time ?? 0) + dt, active: true, x: contact.x, y: contact.y }
      p.grounded = false; p.coyote = 0; p.charging = false; p.charge = 0; p.footwork = null; p.wallBrace = null
    } else {
      if (p.sliding) { p.sliding.active = false; p.sliding.amount = Math.max(0, p.sliding.amount - dt / .12); if (!p.sliding.amount) p.sliding = null }
      if (ground && walkable(ground.angle) && p.vy >= -.1) {
        if (!p.grounded && oldVy > 0) absorbLanding(p, oldVy)
        p.grounded = true; p.vy = 0; p.groundAngle = ground.angle
        if (!platforms.some(b => overlaps(p.x, ground.y, b))) p.y = ground.y
        if (!p.footwork) advanceFootwork(p, dt, from[0], platforms)
      }
    }
  }
}
function stepMotion(p: Player, input: JumpInput, dt: number, platforms: readonly Platform[], climbables: ClimbableWorld, rules: LevelRules) {
  const pressed = input.jump && !p.jumpHeld, released = !input.jump && p.jumpHeld
  p.jumpHeld = input.jump
  p.grabCooldown = Math.max(0, p.grabCooldown - dt)
  p.landing = Math.max(0, p.landing - dt / (p.grounded ? .2 + p.landingImpact * .22 : .12))
  p.buffer = pressed ? TUNING.jumpBuffer : Math.max(0, p.buffer - dt)
  p.wallJumpBuffer = pressed && !p.grounded && !p.hang && !p.mantle && !p.climbing && !p.charging
    ? TUNING.jumpBuffer : Math.max(0, p.wallJumpBuffer - dt)
  if (p.wallJump) {
    p.wallJump.time += dt
    if (p.wallJump.time >= .24 || p.grounded || p.hang || p.mantle || p.climbing) p.wallJump = null
  }
  if (climbables.ropes.length) {
    p.ropes ??= climbables.ropes.map(createRope)
    for (const [i, rope] of p.ropes.entries()) stepRope(rope, dt, platforms,
      p.climbing?.kind === 'rope' && p.climbing.index === i ? { distance: p.climbing.distance, move: p.climbing.wall ? 0 : p.climbing.swing,
        wall: p.climbing.wall, bracing: ease(p.climbing.time / .25),
        body: { climb: p.climbing, from: [p.x, p.y], facing: p.facing } } : null)
  }
  if (p.hang || p.mantle || p.climbing) { p.wallBrace = null; p.pushing = null; p.crouching = false; p.crouch = 0; p.reach = 0; p.footwork = null; p.ledgeReach = null; p.landing = 0 }
  if (p.mantle) {
    const m = p.mantle; m.time += dt
    const progress = Math.min(1, Math.max(0, (m.time - (m.descending ? LEDGE_CATCH_TIME : 0)) / LEDGE_CLIMB_TIME))
    const t = m.descending ? 1 - progress : progress, pose = climbFrame(t, m.braced)
    p.x = m.edgeX + pose.root[0] * m.side; p.y = m.edgeY + pose.root[1]; p.vx = 0; p.vy = 0; p.facing = m.side
    if (m.descending && m.time < LEDGE_CATCH_TIME) {
      const blend = ease(m.time / LEDGE_CATCH_TIME)
      p.x = m.descending.caught.x + (p.x - m.descending.caught.x) * blend
      p.y = m.descending.caught.y + (p.y - m.descending.caught.y) * blend
    }
    if (progress === 1 && m.descending) {
      const c = m.descending.climbable
      const hang: NonNullable<Player['hang']> = { platform: m.descending.platform, side: m.side, edgeX: m.edgeX, edgeY: m.edgeY, time: 1, queued: false, braced: m.braced, dropLocked: true,
        caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, gait: p.gait, ledgeReach: null } }
      if (c) {
        c.caught = { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, grounded: false, gait: p.gait, footwork: null, hang }
        c.time = 0; if (c.ladder) c.distance = 18; updateRopeWall(c, platforms); p.climbing = c
      } else p.hang = hang
      p.mantle = null
    } else if (progress === 1) {
      p.x = m.toX; p.y = m.toY; p.mantle = null; p.grounded = true; p.coyote = TUNING.coyoteTime; p.stride = 0
      p.gait = gaitPose(0); advanceFootwork(p, dt, p.x, platforms)
    }
    settleGait(p, dt)
    return
  }
  const vertical = Number(input.climb) - Number(input.descend ?? (input.drop && !input.detach))
  const requestedClimb = vertical !== 0 && !input.jump
  if (p.grounded && !p.hang && !p.climbing && vertical < 0 && !input.jump && !input.detach && p.grabCooldown === 0) {
    // Lower over the edge first, then transfer to a nearby ladder or rope.
    const edges = platforms.flatMap((b, platform) => [1, -1].flatMap(side => {
      const edge = ledgeSurface(b, side)
      return edge && Math.abs(p.y - edge.y) < .1 && p.x >= b.x && p.x <= b.x + b.w
        ? [{ platform, side, edgeX: edge.x, edgeY: edge.y }] : []
    }))
      .filter(edge => Math.abs(edge.edgeX - p.x) <= 32 && exposedSide(platforms, platforms[edge.platform], edge.side, edge.edgeY, edge.edgeY + 62))
      .sort((a, b) => Math.abs(a.edgeX - p.x) - Math.abs(b.edgeX - p.x))
    for (const edge of edges) {
      const braced = ledgeBraced(platforms, edge.edgeX, edge.edgeY, edge.side)
      if (!ledgePathClear(platforms, edge.platform, edge.side, braced)) continue
      const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, grounded: p.grounded, gait: p.gait, footwork: p.footwork }
      const ladderIndex = climbables.ladders.findIndex(ladder => {
        const exit = ladderLedge(ladder, platforms)
        return exit?.platform === edge.platform && exit.side === edge.side
      })
      const ladder = climbables.ladders[ladderIndex]
      const transfer = ladder ? findClimbable({ ...p, x: ladder.x, y: ladder.top + TUNING.hangReach, grounded: false }, { ladders: [ladder], ropes: [] }, platforms) : null
      if (transfer) transfer.index = ladderIndex
      const climbable = transfer ?? findRope({ ...p, x: edge.edgeX - edge.side * 14, y: edge.edgeY + TUNING.hangReach, facing: edge.side }, platforms)
      p.mantle = { ...edge, toX: edge.edgeX + 20 * edge.side, toY: edge.edgeY, time: 0, braced,
        descending: { platform: edge.platform, caught, climbable } }
      p.facing = edge.side; p.grounded = false; p.vx = 0; p.vy = 0; p.coyote = 0; p.footwork = null; p.pushing = null
      cancelJumpInput(p); return
    }
  }
  if (!p.hang && !p.climbing && p.grabCooldown === 0 && !input.detach && (requestedClimb || !p.grounded)) {
    const found = requestedClimb ? findClimbable(p, climbables, platforms) : findRope(p, platforms)
    if (found && !(found.rope && p.grounded && vertical < 0) && !(found.ladder && p.grounded && (Math.abs(p.y - found.ladder.top) < 1
      || (Math.abs(p.y - found.ladder.bottom) < 1 && vertical < 0)))) {
      p.climbing = found
      updateRopeWall(found, platforms)
      if (found.wall) p.facing = found.wall.side
      if (found.ladder) p.facing = ladderLedge(found.ladder, platforms)?.side ?? found.ladder.side
      if (found.rope) ropeImpulse(found.rope, found.distance, p.vx, p.vy, dt)
      p.grounded = false; p.footwork = null; p.ledgeReach = null; p.coyote = 0; cancelJumpInput(p)
      // Catching consumes the current jump press; release and press again to jump off.
      p.jumpHeld = input.jump
      settleGait(p, dt); return
    }
  }
  if (p.climbing) {
    const c = p.climbing, oldX = p.x, oldY = p.y
    const previousClimb = { ...c }
    c.time += dt
    c.direction = vertical
    const action = !!input.detach && !c.actionHeld
    c.actionHeld = !!input.detach
    c.wallCooldown = Math.max(0, (c.wallCooldown ?? 0) - dt)
    const wall = c.wall
    if (wall && c.rope && !pressed && (input.move * wall.side < -.1 || action)) {
      // A single leg push starts the swing; holding away cannot pin the rope out.
      const grip = ropePoint(c.rope, c.distance), previous = ropePoint(c.rope, c.distance, true)
      ropeImpulse(c.rope, c.distance, (grip[0] - previous[0]) / dt - wall.side * (action ? 260 : 180 * Math.abs(input.move)), (grip[1] - previous[1]) / dt, dt)
      c.wallCooldown = .35
    }
    updateRopeWall(c, platforms, input.move)
    c.wallPose = c.wall ?? wall ?? c.wallPose
    c.wallBlend = approach(c.wallBlend ?? Number(!!wall), Number(!!c.wall), dt / .22)
    if (!c.wallBlend) c.wallPose = undefined
    c.rappelPull = approach(c.rappelPull ?? 0, Number(!!c.wall && vertical > 0), dt / .18)
    c.rappelMotion = approach(c.rappelMotion ?? 0, Number(!!c.wall && vertical !== 0), dt / .16)
    if (c.wall) { p.facing = c.wall.side; c.swing = 0 }
    c.swing += ((c.rope && !c.wall ? input.move : 0) - c.swing) * (1 - Math.exp(-dt / .2))
    c.lean += ((c.rope && !c.wall && !c.direction ? input.move : 0) - c.lean) * (1 - Math.exp(-dt / (c.direction ? .14 : .24)))
    c.hangBlend = approach(c.hangBlend, Number(!!c.rope && !c.direction), dt / .22)
    if (c.rope) {
      const grip = climbGait(c.distance, c.rope.definition.length).grip
      const velocity = (ropePoint(c.rope, grip)[0] - ropePoint(c.rope, grip, true)[0]) / dt / 240
      c.swingVelocity += (Math.max(-1, Math.min(1, velocity)) - c.swingVelocity) * (1 - Math.exp(-dt / .08))
    }
    p.crouch = 0; p.crouching = false; p.reach = 0; p.landing = 0; p.charge = 0; p.charging = false; p.buffer = 0
    if (pressed || input.detach && c.ladder) {
      p.climbing = null; p.grabCooldown = .35; p.grounded = false
      const launchMove = c.rope && wall ? -wall.side : input.move
      p.vx = Math.max(-600, Math.min(600, p.vx + launchMove * 180))
      p.vy = pressed ? Math.min(p.vy, 0) - 360 : Math.max(0, p.vy) + 40
      p.jumpStart = p.y; p.jumpHeight = 0; settleGait(p, dt); return
    }
    const bottom = c.ladder ? c.ladder.bottom - c.ladder.top - 56 : c.rope!.definition.length - 8
    c.distance = Math.max(c.ladder ? 18 : 12, Math.min(bottom, c.distance - vertical * (vertical > 0 ? 85 : 105) * dt))
    if (c.rope && c.time >= .16 && Math.abs(input.move) < .1) settleRopeGrip(c, p.facing, platforms, dt)
    const target = climbRoot(c, p.facing), blend = ease(c.time / .16)
    p.x = c.caught.x + (target[0] - c.caught.x) * blend; p.y = c.caught.y + (target[1] - c.caught.y) * blend
    p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt; p.grounded = false
    if (c.rope && vertical > 0 && c.time >= .16) {
      const edge = ropeLedge({ ...p, x: oldX, y: oldY }, c, platforms)
      if (edge) {
        // The unloaded rope keeps moving; the pose we are leaving must stay fixed.
        previousClimb.rope = { ...c.rope, nodes: c.rope.nodes.map(node => ({ ...node })), bends: c.rope.bends.map(bend => bend ? [...bend] : null) }
        p.hang = { ...edge, time: 0, queued: true,
          caught: { x: oldX, y: oldY, vx: 0, vy: 0, stride: p.stride, gait: p.gait, ledgeReach: null, climbing: previousClimb } }
        p.x = oldX; p.y = oldY
        p.climbing = null; p.facing = edge.side; p.vx = 0; p.vy = 0; p.grabCooldown = .35
        settleGait(p, dt); return
      }
    }
    if (c.ladder && c.distance === 18 && vertical > 0 && c.time >= .16) {
      const edge = ladderLedge(c.ladder, platforms)
      if (edge) {
        p.hang = { ...edge, time: 0, queued: true,
          caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: p.stride, gait: p.gait, ledgeReach: null, climbing: { ...c } } }
        p.climbing = null; p.facing = edge.side; p.vx = 0; p.vy = 0
      }
    } else if (c.ladder && c.distance === bottom && vertical < 0 && c.time >= .16) {
      p.climbing = null; p.grabCooldown = .25; p.y = c.ladder.bottom; p.vx = 0; p.vy = 0; p.grounded = !!groundAt(platforms, p.x, p.y, .2)
      p.gait = gaitPose(0); advanceFootwork(p, dt, p.x, platforms)
    }
    // Sweep even the first catch frame. Blocked grips cannot pull the player through terrain.
    let safe = moveBody([oldX, oldY], [p.x, p.y], platforms)
    const blocked = Math.hypot(safe.x - p.x, safe.y - p.y)
    p.x = safe.x; p.y = safe.y
    const footing = c.rope && vertical < 0 ? groundAt(platforms, p.x, p.y, .2) : null
    if (footing && walkable(footing.angle)) {
      p.climbing = null; p.grabCooldown = .35; p.grounded = true
      p.y = footing.y; p.vx = 0; p.vy = 0; p.groundAngle = footing.angle
      p.gait = gaitPose(0); advanceFootwork(p, dt, p.x, platforms)
    } else if (blocked > .1) {
      if (c.rope) {
        // Stop only a climbing step into an obstruction, never the rope simulation.
        if (vertical && safe.contacts.some(({ normal }) => normal[1] * vertical > .5)) {
          c.distance = previousClimb.distance; c.direction = 0
        }
        for (let i = 0; i < 4; i++) safe = constrainRopeBody(c, [oldX, oldY], p.facing, platforms)
        p.x = safe.x; p.y = safe.y
        p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt
      } else { p.climbing = null; p.grabCooldown = .3; p.vx = 0; p.vy = 0 }
    }
    if (c.rope && p.climbing && c.distance === bottom && vertical < 0 && c.time >= .16) {
      // Descending off the last handhold is a natural exit, not a jump.
      p.climbing = null; p.grabCooldown = .35; p.vy = Math.max(80, p.vy)
    }
    settleGait(p, dt); return
  }
  if (p.hang) {
    const h = p.hang; h.time += dt
    const catchTime = h.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME
    const { platform, side } = h, caught = ledgeEase(h.time / catchTime)
    p.x = h.caught.x + (h.edgeX - side * 14 - h.caught.x) * caught
    p.y = h.caught.y + (h.edgeY + TUNING.hangReach - h.caught.y) * caught
    if (h.caught.climbing?.rope) {
      const root = ropeCatchRoot([(h.caught.x - h.edgeX) * side, h.caught.y - h.edgeY], h.time / catchTime)
      p.x = h.edgeX + root[0] * side; p.y = h.edgeY + root[1]
    }
    p.vx = 0; p.vy = 0; p.facing = side
    const dropping = input.drop || input.descend
    if (!dropping) h.dropLocked = false
    if (input.detach || (dropping && !h.dropLocked)) {
      p.hang = null; p.grabCooldown = .35; p.vy = 80; p.vx = -side * 60; cancelJumpInput(p)
    } else if (pressed && input.move * side < -.25) {
      p.hang = null; p.grabCooldown = .25; launch(p, .35); p.vx = -side * 260
    } else {
      h.queued ||= input.climb || pressed
      if (h.queued && h.time >= catchTime) {
        const toX = h.edgeX + 20 * side, toY = h.edgeY
        // Check the lift and the destination, including low ceilings over the ledge.
        if (ledgePathClear(platforms, platform, side, h.braced)) {
          p.mantle = { edgeX: h.edgeX, edgeY: h.edgeY, side, toX, toY, time: 0, braced: h.braced }; p.hang = null; cancelJumpInput(p)
        }
      }
    }
    settleGait(p, dt)
    return
  }
  // Feet stay planted when ducking. Do not stand up through a low ceiling.
  p.crouching = (input.crouch && p.grounded) || (p.crouching && platforms.some(b => overlaps(p.x, p.y, b)))
  p.crouch = approach(p.crouch, Number(p.crouching), dt * 10)
  p.reach = approach(p.reach, Number(input.reach && !p.crouching), dt * 10)
  const height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const wasGrounded = p.grounded
  tryWallJump(p, platforms)
  p.coyote = wasGrounded ? TUNING.coyoteTime : Math.max(0, p.coyote - dt)
  if ((pressed || p.buffer > 0) && p.coyote > 0 && input.jump) p.charging = true
  if (p.charging && input.jump && p.coyote > 0) p.charge = Math.min(1, p.charge + dt / TUNING.chargeTime)
  if (released && p.charging && p.coyote > 0) launch(p, p.charge)
  else if (p.buffer > 0 && !input.jump && p.coyote > 0) launch(p, 0)
  if (p.coyote === 0) { p.charging = false; p.charge = 0 }

  p.knockback = approach(p.knockback, 0, 520 * dt)
  const move = Math.max(-1, Math.min(1, input.move)), target = move * (p.crouching ? TUNING.walkSpeed : TUNING.runSpeed) + p.knockback
  if (p.wallJump && p.wallJump.time < TUNING.wallJumpControlTime) {
    // A short outward push survives holding toward the wall; ordinary steering follows.
    p.vx = p.wallJump.direction * TUNING.wallJumpPush; p.facing = p.wallJump.direction
  } else if (p.sliding?.active && !p.grounded) {
    const angle = p.sliding.angle, tangent = [Math.cos(angle), Math.sin(angle)]
    const speed = p.vx * tangent[0] + p.vy * tangent[1]
    p.vx = tangent[0] * speed; p.vy = tangent[1] * speed
    if (pressed) { launch(p, 0); p.sliding.active = false }
  } else {
    if (Math.abs(move) > .01) p.facing = Math.sign(move)
    p.vx = approach(p.vx, target, (p.grounded ? move ? TUNING.acceleration : TUNING.braking : TUNING.airAcceleration) * dt)
  }
  const oldX = p.x, oldY = p.y
  const following = p.grounded
  let wallContact: number | null = null
  if (p.grounded && move) for (const b of platforms) {
    const wallX = p.facing === 1 ? b.x : b.x + b.w, gap = (wallX - p.x) * p.facing
    if (gap >= 11.9 && gap <= 26.5 && exposedSide(platforms, b, p.facing, p.y - 44 - .1, p.y - 44 + .1)) {
      wallContact = wallX; p.vx = 0; break
    }
  }
  // Internal terrain ends are ledges; structural outer terrain encloses the room.
  p.x += p.vx * dt
  for (const b of platforms) if (overlaps(p.x, p.y, b, height)) {
    if (p.vx > 0 && oldX + 12 <= b.x + .1 && exposedSide(platforms, b, 1, p.y - height, p.y)) { p.x = b.x - 12; p.vx = 0; wallContact = b.x }
    else if (p.vx < 0 && oldX - 12 >= b.x + b.w - .1 && exposedSide(platforms, b, -1, p.y - height, p.y)) { p.x = b.x + b.w + 12; p.vx = 0; wallContact = b.x + b.w }
  }
  let support = following ? followGround(platforms, oldX, p.x, oldY) : null
  if (support && platforms.some(b => b !== support!.platform && oldY - height >= b.y + b.h - .1 && overlaps(p.x, support!.y, b, height))) {
    // A ramp must not lift the body through a ceiling.
    p.x = oldX; p.vx = 0; support = followGround(platforms, oldX, oldX, oldY)
  }
  p.vy = Math.min(1100, p.vy + TUNING.gravity * dt)
  p.y += p.vy * dt; p.grounded = false
  if (support) { p.y = support.y; p.vy = 0; p.grounded = true }
  for (const b of platforms) {
    if (p.x + 12 <= b.x || p.x - 12 >= b.x + b.w) continue
    if (b.polygon) continue // Polygon faces are resolved by the continuous body sweep.
    const surface = platformSurface(b, p.x), before = platformSurface(b, oldX)
    if (!walkable(surface.angle)) continue
    if ((p.vy >= 0 || b.profile && p.y - surface.y >= oldY - before.y) && oldY <= before.y + .1 && p.y >= surface.y) {
      if (p.x >= b.x && p.x <= b.x + b.w) {
        if (!wasGrounded) absorbLanding(p, p.vy)
        p.y = surface.y; p.vy = 0; p.grounded = true; support = surface
      } else if (!support && !b.profile && ((p.x < b.x && p.vx > 0) || (p.x > b.x + b.w && p.vx < 0))) {
        // A missed corner is a side contact, not support under empty space.
        p.x = p.x < b.x ? b.x - 12 : b.x + b.w + 12; p.vx = 0
      }
    } else if (p.vy < 0 && oldY - height >= b.y + b.h - .1 && p.y - height <= b.y + b.h) {
      p.y = b.y + b.h + height; p.vy = 0
    }
  }
  const pushing = wallContact !== null && p.grounded && Math.abs(move) > .01
    && platforms.some(b => Math.abs((p.facing === 1 ? b.x : b.x + b.w) - wallContact!) < .1 && exposedSide(platforms, b, p.facing, p.y - 44 - .1, p.y - 44 + .1))
  if (pushing) {
    const targetX = wallContact! - p.facing * 25.5, nextX = approach(p.x, targetX, dt * 95)
    const supported = platforms.some(b => Math.abs(b.y - p.y) < .1 && nextX >= b.x + 2 && nextX <= b.x + b.w - 2)
    if (supported && !platforms.some(b => overlaps(nextX, p.y, b))) p.x = nextX
    const previous = p.pushing?.direction === p.facing && Math.abs(p.pushing.wallX - wallContact!) < 4 ? p.pushing.amount : 0
    p.pushing = { wallX: wallContact!, direction: p.facing, amount: Math.min(1, previous + dt / .14), effort: Math.abs(move) }
  } else if (p.pushing) {
    p.pushing.amount = Math.max(0, p.pushing.amount - dt / .16); p.pushing.effort = 0
    if (!p.pushing.amount || !p.grounded || p.pushing.direction !== p.facing) p.pushing = null
  }
  let reach: Player['ledgeReach'] = null
  if (!p.grounded && !p.crouching && p.grabCooldown === 0 && !input.drop && p.vy > -500) {
    for (let index = 0; index < platforms.length; index++) {
      const b = platforms[index], side = p.facing, ledge = ledgeSurface(b, side)
      if (!ledge || !exposedSide(platforms, b, side, ledge.y, ledge.y + TUNING.hangReach)) continue
      const edge = ledge.x, edgeY = ledge.y
      const handY = p.y - TUNING.hangReach
      const outside = side === 1 ? p.x <= edge - 10 : p.x >= edge + 10
      const grabX = edge - side * 14, grabY = edgeY + TUNING.hangReach
      const gap = (edge - p.x) * side
      if (outside && gap < 55 && Math.abs(handY - edgeY) < 48) {
        const target = Math.min(ledgeEase((55 - gap) / 27), ledgeEase((48 - Math.abs(handY - edgeY)) / 28))
        const previous = p.ledgeReach?.x === edge && p.ledgeReach.y === edgeY ? p.ledgeReach.amount : 0
        if (!reach || target > reach.amount) reach = { x: edge, y: edgeY, amount: previous + (target - previous) * (1 - Math.exp(-dt / .045)) }
      }
      if (p.vy > -180 && outside && Math.abs(p.x + side * 14 - edge) < 13 && Math.abs(handY - edgeY) < 16
        && !platforms.some(other => overlaps(grabX, grabY, other))) {
        const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, gait: p.gait, ledgeReach: reach }
        const braced = ledgeBraced(platforms, edge, edgeY, side)
        p.vx = 0; p.vy = 0; p.hang = { platform: index, side, edgeX: edge, edgeY, time: 0, queued: false, braced, caught }
        cancelJumpInput(p); p.jumpHeld = input.jump; break
      }
    }
  }
  p.ledgeReach = p.hang ? null : reach
  updateWallBrace(p, move, dt, platforms)
  if (!p.hang) tryWallJump(p, platforms)
  if (p.grounded) p.wallJump = null
  if (p.grounded) {
    rules.checkpoints.forEach((point, index) => {
      if (Math.abs(p.x - point.x) < (point.radius ?? 100) && Math.abs(p.y - point.y) < 1 && p.checkpoint < index + 1) {
        p.spawnX = point.x; p.spawnY = point.y; p.checkpoint = index + 1
      }
    })
  } else {
    p.jumpHeight = Math.max(p.jumpHeight, p.jumpStart - p.y)
    p.bestHeight = Math.max(p.bestHeight, p.jumpHeight)
  }
  p.groundAngle += ((p.grounded ? support?.angle ?? 0 : 0) - p.groundAngle) * (1 - Math.exp(-dt / .08))
  settleGait(p, dt)
  advanceFootwork(p, dt, oldX, platforms)
  if (p.y > rules.fallY) respawn(p)
}
