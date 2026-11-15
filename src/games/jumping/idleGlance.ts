import type { AthletePose } from './athleteRig.ts'
import type { Player } from './characterTypes.ts'
import type { Run } from './challenge.ts'

/** Seconds of standing still before the head turns to the camera, and the turn itself. */
const WAIT = 3, TURN = .26
/** Moving off, or a robot stirring, turns the head back at once. */
const RELEASE = .14
/** While it looks, the head cocks to one side now and then: once in each `COCK_EVERY` seconds, at a moment that varies. */
const COCK_EVERY = 7, COCK_FROM = 2.2, COCK_VARY = 2.6, COCK_IN = .2, COCK_HOLD = 1.1, COCK_OUT = .25, COCK_ANGLE = .21
/** A robot this near that is doing something takes the attention. */
const NEAR = 900

const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t) }
/** A fixed fraction for each index, so the cocks vary the same way on every run. */
const vary = (index: number) => { const n = Math.sin(index * 12.9898 + 4.1414) * 43758.5453; return n - Math.floor(n) }

/** How far the head faces the camera, `rest` seconds into standing still. Once there it stays. */
export function glanceAt(rest: number): number {
  return smooth((rest - WAIT) / TURN)
}

/** The head's cock to one side, in radians, `rest` seconds into standing still. */
export function cockAt(rest: number): number {
  const looking = rest - WAIT - TURN
  if (looking <= 0) return 0
  const index = Math.floor(looking / COCK_EVERY), into = looking - index * COCK_EVERY - COCK_FROM - vary(index) * COCK_VARY
  if (into <= 0 || into >= COCK_IN + COCK_HOLD + COCK_OUT) return 0
  const amount = into < COCK_IN ? smooth(into / COCK_IN) : into < COCK_IN + COCK_HOLD ? 1 : 1 - smooth((into - COCK_IN - COCK_HOLD) / COCK_OUT)
  return amount * COCK_ANGLE * (vary(index + 31) < .5 ? -1 : 1)
}

/** Standing on its feet with nothing to do: no motion, no grip, no turn, no reach, nothing in its hands' way. */
export function standingIdle(p: Player): boolean {
  return p.grounded && Math.abs(p.vx) < 1 && Math.abs(p.vy) < 1 && !p.crouching && p.crouch < .01 && p.reach < .01
    && !p.climbing && !p.hang && !p.mantle && !p.sliding?.active && !p.wallBrace?.active && !p.wallJump && !p.pushing?.amount && !p.ledgeReach?.amount
    && !p.waterMotion && !p.freeFall && !p.shove && !p.stagger && !p.armAim?.aiming && !p.releaseTurn && p.landing <= 0
    && !p.anim.dryTurn && !p.anim.slideEntry && !p.anim.ragdoll && !p.anim.recovery && Math.abs(p.anim.look) < .01 && (p.anim.gait?.moving ?? 0) < .01
}

/** A robot nearby with power that has seen the player, is moving, or is doing anything but standing its patrol. */
export function robotsStir(run: Pick<Run, 'robots' | 'player'>): boolean {
  const p = run.player
  return run.robots.some(robot => !robot.deactivated && !robot.collapse && Math.hypot(robot.x - p.x, robot.y - p.y) < NEAR
    && (robot.seesPlayer || robot.phase !== 'patrol' || !!robot.entrance || Math.abs(robot.actor?.vx ?? robot.vx) > 5))
}

export interface Glance {
  /** How far the head faces the camera, from profile (0) to full face (1). */
  face: number
  /** The head's cock to one side, in radians. */
  tilt: number
}
const AHEAD: Glance = { face: 0, tilt: 0 }
/** Where the neck meets the head: this far below the head's centre, along the head's own axis (athleteDraw neckPoints). */
const NECK_JOINT = 4

/** A pose with its head turned to the camera and cocked. The head hinges on the top of its neck, as a head does:
 * its crown swings to the side while the neck stays where it is. Turning it about its own centre instead swings
 * the chin the other way and leans the neck, like a sign spinning on a post. */
export function glancePose(pose: AthletePose, glance: Glance): AthletePose {
  const from = pose.headTilt ?? 0, to = from + glance.tilt
  return { ...pose, faceView: glance.face, headTilt: to,
    head: [pose.head[0] + (Math.sin(to) - Math.sin(from)) * NECK_JOINT, pose.head[1] - (Math.cos(to) - Math.cos(from)) * NECK_JOINT] }
}
interface Watch { since: number | null; released: { time: number; glance: Glance } | null; time: number }
const watches = new WeakMap<Player, Watch>()

/**
 * The idle look: left standing, the robot turns its head to look straight at the camera, and keeps looking,
 * cocking its head now and then, until the player moves it or something stirs (`stirring`: see robotsStir).
 * Then it faces ahead again and the wait starts over.
 *
 * Presentation only. It is evaluated when the player is drawn, from gameplay time (`run.activeTime`, so a
 * pause holds it) and from what the player is doing: nothing here is stepped, and the run and its player are
 * only read. The one thing remembered is when the player was first seen standing idle.
 */
export function idleGlance(p: Player, time: number, stirring = false): Glance {
  let watch = watches.get(p)
  // A restart rewinds gameplay time.
  if (!watch || time < watch.time) { watch = { since: null, released: null, time }; watches.set(p, watch) }
  watch.time = time
  if (standingIdle(p) && !stirring) {
    watch.since ??= time
    watch.released = null
    const rest = time - watch.since, face = glanceAt(rest)
    return face > 0 ? { face, tilt: cockAt(rest) } : AHEAD
  }
  if (watch.since !== null) {
    const rest = time - watch.since, face = glanceAt(rest)
    watch.released = face > 0 ? { time, glance: { face, tilt: cockAt(rest) } } : null
    watch.since = null
  }
  if (!watch.released) return AHEAD
  const left = 1 - smooth((time - watch.released.time) / RELEASE)
  return left > 0 ? { face: watch.released.glance.face * left, tilt: watch.released.glance.tilt * left } : AHEAD
}
