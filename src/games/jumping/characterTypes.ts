// Character state shared by the movement step, animation, poses and drawing.
// Type-only, so pose and animation modules need no runtime import of model.ts.
import type { Climbing, RopeState } from './climbables.ts'
import type { Footwork } from './footwork.ts'
import type { AthletePose } from './athleteRig.ts'
import type { PendingAnimation } from './characterAnimation.ts'
import type { GaitPose } from './gait.ts'
import type { ImpactRagdoll } from './impactRagdoll.ts'
import type { NamedObject } from './objectNames.ts'
import type { PlayerContacts } from './playerContacts.ts'
import type { PushHands } from './propGeometry.ts'
import type { StepUp } from './stepUp.ts'
import type { TerrainLedge } from './terrainLedges.ts'
import type { GroundCover } from './terrainGroundCover.ts'
import type { TerrainMaterial } from './terrainMaterials.ts'
import type { WaterBob, WaterCamera } from './waterBob.ts'

/** Runtime prop hulls allow free swimming limbs to pass through depth. */
export interface Platform extends NamedObject { looseProp?: boolean; x: number; y: number; w: number; h: number; profile?: readonly (readonly [number, number])[]; polygon?: readonly (readonly [number, number])[]; bezier?: readonly (import('./terrainCurves.ts').TerrainBezier | null)[]; material?: TerrainMaterial; groundCover?: GroundCover; /** A painted band under its exposed tops; artwork only. */ trim?: import('./hazardStripes.ts').TerrainTrim; /** No traction or contact friction (friction.ts). */ frictionless?: boolean; zIndex?: number }
export interface JumpInput { move: number; jump: boolean; jumpStrength?: number; climb: boolean; drop: boolean; crouch: boolean; reach: boolean; descend?: boolean; detach?: boolean; swimVertical?: number; interact?: boolean; use?: boolean; aimX?: number; aimY?: number }
/** Animation state: visible turns, foot placement, gait and look blends, and the
 * impact ragdoll. The movement step advances it today; it never changes motion
 * except through the couplings in docs/jumping-animation.md. */
export interface CharacterAnimation {
  dryTurn: { pose: AthletePose; facing: number; target: number; time: number; departure: boolean; slide?: boolean; pushing?: boolean; reaching?: boolean; step?: boolean; recoil?: boolean } | null
  slideEntry: { pose: AthletePose; facing: number; time: number; landing?: boolean } | null
  footwork: Footwork | null
  stride: number
  gait: GaitPose | null
  /** Positive looks up, negative looks down. */
  look: number
  ragdoll: ImpactRagdoll | null
  /** The get-up blend from a prone recovery toward the moving gait. It can outlast the physical fall. */
  recovery: { pose: AthletePose; time: number; facing: number } | null
  /** The presented swimmer's clearance offset. The swimming hull uses its own `waterMotion.bodyOffset`. */
  waterClearance: { offset: [number, number]; facing: number } | null
  /** Weightless floating, drawn from the relaxed float posture (poses/waterPose.ts floatPose): the body's lean from
   * upright toward its travel and the lean's spin (a spring, pivoting at the waist), the facing that lean is measured
   * in, the sculling phase, and how fully the float pose is shown (`blend`, easing in and out of other poses). */
  float?: { lean: number; spin: number; facing: number; phase: number; blend: number
    /** The boots' thrust as the body feels it: eased over a tenth of a second, so the lean follows it smoothly. */
    drive?: { x: number; lift: number }
    /** The frame `drive` is measured in (wall, ceiling mirror and step direction). */
    driveFrame?: string
    /** The legs' kick as the jets switch on or off or swing round: a spring (amount and its rate) that flexes the knees. */
    kick?: number; kickRate?: number
    /** Where the lean is aimed, eased toward its target (rad), and the head's turn toward the travel. */
    aim?: number; neck?: number
    /** Flipping forward onto the feet for a landing on the footing it has: the lean (rad) that is upright again. */
    flipTo?: number
    /** The drift the idle sway answers to, capped (poses/waterPose.ts floatSway) and eased (px/s, the controller's frame). */
    sway?: [number, number]
    /** How far the body is drawn sunk onto its feet (as a crouch): the crouch itself on a surface; leaving one, it
     * eases off more slowly, so legs still straightening reach back behind the body rather than shove it on. */
    sinkHold?: number
    /** A fade into the float from `pose` (after a change of facing, the pose before it, already mirrored), over `time`.
     * With `base` (the float as it was when the fade began), `pose` moves on with the float instead of holding still:
     * what the body was doing carries on through the fade. */
    flip?: { pose: import('./athleteRig.ts').AthletePose; time: number; base?: import('./athleteRig.ts').AthletePose } } | null
  /** The drawn rig before this step while standing weightless, read lazily, for the float to grow out of when the body
   * leaves the surface; `base` is the float in it then, if there was one. */
  floatEntry?: { readonly pose: import('./athleteRig.ts').AthletePose; readonly base?: import('./athleteRig.ts').AthletePose; facing: number }
  /**
   * The crouch walk's forward step driving its body dip and arm counter-swing: the swinging
   * foot, its progress (0 to 1), the share of time spent stepping, the shift toward the
   * support foot, and a fade that eases the body out when the feet leave the ground.
   */
  crouchStep?: { foot: number; phase: number; cadence: number; shift: number; amount: number } | null
  /**
   * The drawn swim: the stroke's own cycle (`stroke`), the treading cycle (`tread`), how hard a held
   * direction drives the stroke (`drive`, 0 to 1) and the physics stroke cycle last seen (`from`).
   * The physics rig keeps `waterMotion.phase`, so none of this changes motion.
   */
  swim?: { stroke: number; tread: number; drive: number; from: number } | null
  /** When animation runs: every physics step (default), once per drawn frame, or never. */
  cadence?: 'tick' | 'frame' | 'off'
  /** Physics steps since the last drawn frame, for the 'frame' cadence. */
  pending?: PendingAnimation | null
}
/** The animation fields a hang, climb or step retains from before its catch.
 * Poses and restores apply them over the current animation, field by field. */
export type CaughtAnimation = Pick<CharacterAnimation, 'stride' | 'gait'> & Partial<CharacterAnimation>
export interface Player {
  /** A body this many times the player's size, stepped and posed in a scaled frame (sizeFrame.ts). */
  size?: number
  heldTool?: import('./gadgets.ts').HeldTool
  armAim?: { angle: number; aiming: boolean }
  shove?: { time: number; windup: number; direction: number; struck: boolean; contact?: NonNullable<PushHands['palms']> }
  stagger?: number; shoves?: number; shoveDrift?: boolean
  x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; groundAngle: number
  sliding: { angle: number; amount: number; time: number; active: boolean; x: number; y: number; balanceSpeed?: number; /** The slide is on frictionless terrain. */ slick?: boolean } | null
  coyote: number; buffer: number; jumpStrength: number | undefined; jumpHeld: boolean
  jumpLift: { elapsed: number; strength: number; entrySpeed: number; extraSpeed: number; fresh: boolean } | null
  grabCooldown: number; ladderJumpGrace: number
  wallJumpBuffer: number; wallJump: { direction: number; time: number } | null
  wallBrace: { wallX: number; wallY?: number; normal?: [number, number]; direction: number; active: boolean; amount?: number; hands: [number, number]; feet: [number, number] } | null
  climbing: Climbing | null; ropes: RopeState[] | null
  pushing: (Omit<PushHands, 'slope'> & { direction: number; amount: number; ready?: number; effort: number; load?: number; slope?: number; colliderId?: string }) | null
  /** The motor's push rig: `pushing`'s hands and easing from real contacts only.
   * Gameplay reads this; the presented `pushing` also eases toward anticipated contacts. */
  pushRig?: Player['pushing']
  ledgeReach: { x: number; y: number; amount: number } | null
  stepIntent: (TerrainLedge & { time: number }) | null
  hang: { platform: number; side: number; edgeX: number; edgeY: number; slope?: number; outwardSlope?: number; time: number; queued: boolean; braced: boolean; dropLocked?: boolean; upLocked?: boolean;
    /** The hang's time when a free hang starts swinging from the hands, after the catch unless set (see hangSway). Presentation only. */
    swayFrom?: number
    caught: { x: number; y: number; vx: number; vy: number; anim: CaughtAnimation; ledgeReach: Player['ledgeReach']; climbing?: Climbing | null; freeFall?: Player['freeFall']; waterMotion?: Player['waterMotion']; heldTool?: Player['heldTool'] } } | null
  mantle: { edgeX: number; edgeY: number; side: number; slope?: number; outwardSlope?: number; toX: number; toY: number; time: number; braced: boolean;
    platform?: number; returning?: boolean; crouched?: boolean; inset?: number; blockedTime?: number;
    /** Climbing on from a free hang: how long it had been swinging and its catch speed toward the wall, so the swing settles. Presentation only. */
    sway?: { time: number; vx: number };
    step?: StepUp;
    /** Foreground ladder-to-deck pull-up, viewed from behind. */
    ladder?: { climb: Climbing; x: number; y: number; entry: number };
    descending?: { platform: number; caught: Climbing['caught']; climbable: Climbing | null } } | null
  landing: number; landingImpact: number; spawnX: number; spawnY: number; checkpoint: number
  freeFall: { time: number; amount: number; recovery: number | null; bodyOffset?: [number, number]; /** Flung prone by weight returning to a body flying flat out without it; falls until it lands. */ flung?: boolean; impact?: { vx: number; vy: number; gait: GaitPose | null }; /** Seconds since steering began during a grounded recovery; a steered get-up ends the fall early. */ getUp?: number } | null
  jumpStart: number; jumpHeight: number; bestHeight: number
  crouching: boolean; crouch: number; reach: number
  /** Weightless, the crouch is a spring in the legs: its rate of folding (crouch per second). */
  crouchRate?: number
  /** Presentation of applied air-control forces. `trim`: the weightless boots' small puffs trimming a slow drift, which
   * the floating body does not lean into. */
  airBoost: { x: number; lift: number; time: number; trim?: boolean }
  contacts: PlayerContacts | null
  /** Presentation state owned by the animation, never read by the motor except through the listed couplings. */
  anim: CharacterAnimation
  swimAcceleration?: number
  waterJump?: boolean
  waterPushOff?: boolean
  waterBob?: WaterBob
  waterCamera?: WaterCamera
  waterMotion?: { amount: number; dive: number; phase: number; effort?: number; underwater?: boolean; steering?: number; bend?: number; leadHeading?: number; scull?: number; bottom?: number; gather?: number; floatCurl?: number; heading?: number; propLean?: number; bodyOffset?: [number, number]; wall?: { x: number; amount: number };
    ceiling?: { collider: string; amount: number; load: number; nx: number; ny: number; hands: { x: number; y: number; nx: number; ny: number }[] };
    floor?: { y: number; angle: number; reach: number };
    landing?: { pose: AthletePose; y: number; facing: number; time: number; load: number; hand: { x: number; y: number; angle: number }; leaving?: boolean } }
  terrain?: readonly Platform[]
  gravity?: number
  inverted?: boolean
  /** Without weight, a hit too fast to stay on: the crouch absorbing it, and the speed the legs push off at after. */
  rebound?: { speed: number; time: number; /** The surface's slope (its normal is the way back off). */ angle?: number
    /** Seconds the legs have been pushing off, once the fold has bottomed out. */ push?: number }
  /** Seconds the body has been weightless without a break (model.ts settledWeightless). */
  weightless?: number
  /** Seconds a weightless body has flown flat out along its facing with no weightless landing ahead (model.ts orientInFlight). */
  flatOut?: number
  /** Footing on a wall, by the side gravity pulls toward (wallFrame.ts). */
  wall?: 'left' | 'right'
  /** `toWall` marks a turn onto or off a wall: the footing it ends on (null for the floor), turning through `span`. */
  releaseTurn?: { angle: number; target: number; pose?: AthletePose; facing?: number; time?: number; progress?: number; toWall?: 'left' | 'right' | 'ceiling' | null; span?: number
    /** A weightless feet-first turn: the float lean it started from (local, at `facing`), unwound as it rolls. */
    float?: number
    /** The waist bend that roll started with (poses/waterPose.ts floatBend), unwound with the lean. */
    bend?: number
    /** How fast the float lean was turning as the roll started (rad/s): carried on into it (floatRollLean). */
    spin?: number
    /** A whole turn (±2π, local at `facing`) the drawing adds to a weightless roll, so a body drawn head-first for the
     * surface flips forward onto its feet while its hull turns the short way (athleteAnimation.ts captureFloatTurn). */
    over?: number
    /** Seconds a weightless feet-first roll takes, timed to its arrival (model.ts orientInFlight). */
    duration?: number
    /** The outward normal of the surface a weightless roll is turning the feet toward. */
    toward?: readonly [number, number] }
}
