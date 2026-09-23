import { advanceFootwork } from './footwork.ts'
import type { Footwork } from './footwork.ts'
import { climbFrame, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ledgeEase } from './ledge.ts'
import { CLIMBABLES, NO_CLIMBABLES, climbGait, climbRoot, createRope, ease, findClimbable, findRope, ropeImpulse, ropePoint, stepRope } from './climbables.ts'
import type { ClimbableWorld, Climbing, RopeState } from './climbables.ts'
import { exposedSide, followGround, platformSurface } from './terrain.ts'

export interface Platform { x: number; y: number; w: number; h: number; profile?: readonly (readonly [number, number])[] }
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
    descending?: { platform: number; caught: Climbing['caught']; ladder: Climbing | null } } | null
  stride: number; landing: number; landingImpact: number; spawnX: number; spawnY: number; checkpoint: number
  jumpStart: number; jumpHeight: number; bestHeight: number
  crouching: boolean; crouch: number; reach: number
  gait: GaitPose | null
  footwork: Footwork | null
}
export function createPlayer(): Player {
  return { x: 200, y: 620, vx: 0, vy: 0, facing: 1, grounded: true, groundAngle: 0,
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
  Object.assign(p, createPlayer(), { x: spawnX, y: spawnY, spawnX, spawnY, checkpoint, bestHeight })
}
const approach = (value: number, target: number, delta: number) => value + Math.max(-delta, Math.min(delta, target - value))
const overlaps = (x: number, y: number, b: Platform, height: number = TUNING.height) => x + TUNING.width / 2 > b.x + .01 && x - TUNING.width / 2 < b.x + b.w - .01
  && y > platformSurface(b, x).y + .01 && y - height < b.y + b.h - .01
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
    return Math.abs(face - edgeX) < .1 && wall.y <= edgeY + offset - 6 && wall.y + wall.h >= edgeY + offset + 3
  }))
}
function ledgePathClear(platforms: readonly Platform[], platform: number, side: number, braced: boolean) {
  const b = platforms[platform], edgeX = side === 1 ? b.x : b.x + b.w
  return !platforms.some((other, index) => index !== platform && (
    overlaps(edgeX + 20 * side, b.y, other) || overlaps(edgeX - 14 * side, b.y, other)
    || Array.from({ length: 25 }, (_, i) => climbFrame(i / 24, braced).root).some(root => overlaps(edgeX + root[0] * side, b.y + root[1], other))
  ))
}
export function playerState(p: Player) {
  return p.climbing ? `${p.climbing.kind === 'rope' ? 'Rope' : 'Ladder'} · ${p.climbing.direction > 0 ? 'ascending' : p.climbing.direction < 0 ? 'descending' : 'holding'}`
    : p.mantle ? p.mantle.descending ? 'Lowering' : 'Climbing' : p.hang ? 'Hanging' : p.wallBrace?.active ? 'Bracing' : p.wallJump ? 'Wall jump' : p.pushing && p.pushing.effort > 0 ? 'Pushing' : p.crouching ? 'Crouching' : p.reach > .5 ? 'Reaching' : p.charging ? 'Charging' : !p.grounded ? p.vy < 0 ? 'Rising' : 'Falling'
    : Math.abs(p.vx) > 180 ? 'Running' : Math.abs(p.vx) > 10 ? 'Walking' : 'Ready'
}

/** Fixed-step, world-space movement. Rendering and input devices never change physics. */
export function stepPlayer(p: Player, input: JumpInput, dt = STEP, platforms: readonly Platform[] = PLATFORMS,
  climbables: ClimbableWorld = platforms === PLATFORMS ? CLIMBABLES : NO_CLIMBABLES,
  rules: LevelRules = platforms === PLATFORMS ? PLAYGROUND_RULES : { checkpoints: [], fallY: 1020 }) {
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
      p.climbing?.kind === 'rope' && p.climbing.index === i ? { distance: p.climbing.distance, move: p.climbing.swing } : null)
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
      const c = m.descending.ladder
      const hang: NonNullable<Player['hang']> = { platform: m.descending.platform, side: m.side, edgeX: m.edgeX, edgeY: m.edgeY, time: 1, queued: false, braced: m.braced, dropLocked: true,
        caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, gait: p.gait, ledgeReach: null } }
      if (c) {
        c.caught = { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, grounded: false, gait: p.gait, footwork: null, hang }
        c.time = 0; c.distance = 18; p.climbing = c
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
  if (!p.hang && !p.climbing && p.grabCooldown === 0 && !input.detach && (requestedClimb || !p.grounded)) {
    const found = requestedClimb ? findClimbable(p, climbables) : findRope(p)
    if (found && !(found.ladder && p.grounded && ((Math.abs(p.y - found.ladder.top) < 1 && vertical > 0)
      || (Math.abs(p.y - found.ladder.bottom) < 1 && vertical < 0)))) {
      if (found.ladder && p.grounded && Math.abs(p.y - found.ladder.top) < 1 && vertical < 0) {
        const b = platforms[found.ladder.platform], side = found.ladder.side
        if (b) {
          const edgeX = side === 1 ? b.x : b.x + b.w
          p.mantle = { edgeX, edgeY: b.y, side, toX: edgeX + 20 * side, toY: b.y, time: 0, braced: ledgeBraced(platforms, edgeX, b.y, side),
            descending: { platform: found.ladder.platform, caught: found.caught, ladder: found } }
          p.grounded = false; p.footwork = null; p.pushing = null; cancelJumpInput(p); return
        }
      }
      p.climbing = found
      if (found.ladder) p.facing = found.ladder.side
      if (found.rope) ropeImpulse(found.rope, found.distance, p.vx, p.vy, dt)
      p.grounded = false; p.footwork = null; p.ledgeReach = null; p.coyote = 0; cancelJumpInput(p)
      // Catching consumes the current jump press; release and press again to jump off.
      p.jumpHeld = input.jump
      settleGait(p, dt); return
    }
  }
  if (p.grounded && !p.hang && !p.climbing && vertical < 0 && !input.jump && !input.detach && p.grabCooldown === 0) {
    // Prefer a ladder at its entrance; otherwise lower over the nearest exposed edge.
    const edges = platforms.flatMap((b, platform) => !b.profile && Math.abs(p.y - b.y) < .1 && p.x >= b.x && p.x <= b.x + b.w
      ? [1, -1].map(side => ({ platform, side, edgeX: side === 1 ? b.x : b.x + b.w, edgeY: b.y })) : [])
      .filter(edge => Math.abs(edge.edgeX - p.x) <= 32 && exposedSide(platforms, platforms[edge.platform], edge.side, edge.edgeY, edge.edgeY + 62))
      .sort((a, b) => Math.abs(a.edgeX - p.x) - Math.abs(b.edgeX - p.x))
    for (const edge of edges) {
      const braced = ledgeBraced(platforms, edge.edgeX, edge.edgeY, edge.side)
      if (!ledgePathClear(platforms, edge.platform, edge.side, braced)) continue
      const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, grounded: p.grounded, gait: p.gait, footwork: p.footwork }
      p.mantle = { ...edge, toX: edge.edgeX + 20 * edge.side, toY: edge.edgeY, time: 0, braced,
        descending: { platform: edge.platform, caught, ladder: null } }
      p.facing = edge.side; p.grounded = false; p.vx = 0; p.vy = 0; p.coyote = 0; p.footwork = null; p.pushing = null
      cancelJumpInput(p); return
    }
  }
  if (p.climbing) {
    const c = p.climbing, oldX = p.x, oldY = p.y
    c.time += dt; c.direction = vertical
    c.swing += ((c.rope ? input.move : 0) - c.swing) * (1 - Math.exp(-dt / .12))
    c.lean += ((c.rope && !vertical ? input.move : 0) - c.lean) * (1 - Math.exp(-dt / .14))
    c.hangBlend = approach(c.hangBlend, Number(!!c.rope && !vertical), dt / .22)
    if (c.rope) {
      const grip = Math.min(...climbGait(c.distance, c.rope.definition.length).hands.map(hand => hand.distance))
      const velocity = (ropePoint(c.rope, grip)[0] - ropePoint(c.rope, grip, true)[0]) / dt / 240
      c.swingVelocity += (Math.max(-1, Math.min(1, velocity)) - c.swingVelocity) * (1 - Math.exp(-dt / .08))
    }
    p.crouch = 0; p.crouching = false; p.reach = 0; p.landing = 0; p.charge = 0; p.charging = false; p.buffer = 0
    if (pressed || input.detach) {
      p.climbing = null; p.grabCooldown = .35; p.grounded = false
      p.vx = Math.max(-600, Math.min(600, p.vx + input.move * 180))
      p.vy = pressed ? Math.min(p.vy, 0) - 360 : Math.max(0, p.vy) + 40
      p.jumpStart = p.y; p.jumpHeight = 0; settleGait(p, dt); return
    }
    const bottom = c.ladder ? c.ladder.bottom - c.ladder.top - 56 : c.rope!.definition.length - 8
    c.distance = Math.max(c.ladder ? 18 : 12, Math.min(bottom, c.distance - vertical * (vertical > 0 ? 85 : 105) * dt))
    const target = climbRoot(c, p.facing), blend = ease(c.time / .16)
    p.x = c.caught.x + (target[0] - c.caught.x) * blend; p.y = c.caught.y + (target[1] - c.caught.y) * blend
    p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt; p.grounded = false
    if (c.ladder && c.distance === 18 && vertical > 0 && c.time >= .16) {
      const b = platforms[c.ladder.platform], side = c.ladder.side
      if (b) {
        const edgeX = side === 1 ? b.x : b.x + b.w
        p.hang = { platform: c.ladder.platform, side, edgeX, edgeY: b.y, time: 0, queued: true, braced: b.h >= 61,
          caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: p.stride, gait: p.gait, ledgeReach: null, climbing: { ...c } } }
        p.climbing = null; p.vx = 0; p.vy = 0
      }
    } else if (c.ladder && c.distance === bottom && vertical < 0 && c.time >= .16) {
      p.climbing = null; p.grabCooldown = .25; p.y = c.ladder.bottom; p.vx = 0; p.vy = 0; p.grounded = true
      p.gait = gaitPose(0); advanceFootwork(p, dt, p.x, platforms)
    } else if (c.rope && c.distance === bottom && vertical < 0 && c.time >= .16) {
      p.climbing = null; p.grabCooldown = .35; p.vy = Math.max(p.vy, 60)
    } else if (c.rope && c.time >= .16) for (const b of platforms) if (overlaps(p.x, p.y, b)) {
      const top = platformSurface(b, p.x).y
      const gaps = [p.x + 12 - b.x, b.x + b.w - p.x + 12, p.y - top, b.y + b.h - p.y + TUNING.height]
      const edge = gaps.indexOf(Math.min(...gaps))
      if (edge === 0) { p.x = b.x - 12; p.vx = Math.min(0, p.vx) }
      else if (edge === 1) { p.x = b.x + b.w + 12; p.vx = Math.max(0, p.vx) }
      else if (edge === 2) { absorbLanding(p, p.vy); p.y = top; p.vy = 0; p.grounded = true }
      else { p.y = b.y + b.h + TUNING.height; p.vy = Math.max(0, p.vy) }
      p.climbing = null; p.grabCooldown = .3
      if (p.grounded) advanceFootwork(p, dt, p.x, platforms)
      break
    }
    settleGait(p, dt); return
  }
  if (p.hang) {
    const h = p.hang; h.time += dt
    const { platform, side } = h, b = platforms[platform], caught = ledgeEase(h.time / LEDGE_CATCH_TIME)
    p.x = h.caught.x + (h.edgeX - side * 14 - h.caught.x) * caught
    p.y = h.caught.y + (h.edgeY + TUNING.hangReach - h.caught.y) * caught
    p.vx = 0; p.vy = 0; p.facing = side
    const dropping = input.drop || input.descend
    if (!dropping) h.dropLocked = false
    if (input.detach || (dropping && !h.dropLocked)) {
      p.hang = null; p.grabCooldown = .35; p.vy = 80; p.vx = -side * 60; cancelJumpInput(p)
    } else if (pressed && input.move * side < -.25) {
      p.hang = null; p.grabCooldown = .25; launch(p, .35); p.vx = -side * 260
    } else {
      h.queued ||= input.climb || pressed
      if (h.queued && h.time >= LEDGE_CATCH_TIME) {
        const toX = side === 1 ? b.x + 20 : b.x + b.w - 20, toY = b.y
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
  // The drawn terrain is the boundary. Walking off its ends falls and resets.
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
    const surface = platformSurface(b, p.x), before = platformSurface(b, oldX)
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
      const b = platforms[index], side = p.facing, edge = side === 1 ? b.x : b.x + b.w
      if (b.profile || !exposedSide(platforms, b, side, b.y, b.y + TUNING.hangReach)) continue
      const handY = p.y - TUNING.hangReach
      const outside = side === 1 ? p.x <= edge - 10 : p.x >= edge + 10
      const grabX = edge - side * 14, grabY = b.y + TUNING.hangReach
      const gap = (edge - p.x) * side
      if (outside && gap < 55 && Math.abs(handY - b.y) < 48) {
        const target = Math.min(ledgeEase((55 - gap) / 27), ledgeEase((48 - Math.abs(handY - b.y)) / 28))
        const previous = p.ledgeReach?.x === edge && p.ledgeReach.y === b.y ? p.ledgeReach.amount : 0
        if (!reach || target > reach.amount) reach = { x: edge, y: b.y, amount: previous + (target - previous) * (1 - Math.exp(-dt / .045)) }
      }
      if (p.vy > -180 && outside && Math.abs(p.x + side * 14 - edge) < 13 && Math.abs(handY - b.y) < 16
        && !platforms.some(other => overlaps(grabX, grabY, other))) {
        const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, gait: p.gait, ledgeReach: reach }
        const braced = ledgeBraced(platforms, edge, b.y, side)
        p.vx = 0; p.vy = 0; p.hang = { platform: index, side, edgeX: edge, edgeY: b.y, time: 0, queued: false, braced, caught }
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
