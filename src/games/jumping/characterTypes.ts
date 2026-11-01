// Character state shared by the movement step, animation, poses and drawing.
// Type-only, so pose and animation modules need no runtime import of model.ts.
import type { Climbing, RopeState } from './climbables.ts'
import type { Footwork } from './footwork.ts'
import type { AthletePose } from './athleteRig.ts'
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
export interface Platform extends NamedObject { looseProp?: boolean; x: number; y: number; w: number; h: number; profile?: readonly (readonly [number, number])[]; polygon?: readonly (readonly [number, number])[]; bezier?: readonly (import('./terrainCurves.ts').TerrainBezier | null)[]; material?: TerrainMaterial; groundCover?: GroundCover; zIndex?: number }
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
}
/** The animation fields a hang, climb or step retains from before its catch.
 * Poses and restores apply them over the current animation, field by field. */
export type CaughtAnimation = Pick<CharacterAnimation, 'stride' | 'gait'> & Partial<CharacterAnimation>
export interface Player {
  heldTool?: import('./gadgets.ts').HeldTool
  armAim?: { angle: number; aiming: boolean }
  shove?: { time: number; windup: number; direction: number; struck: boolean; contact?: NonNullable<PushHands['palms']> }
  stagger?: number; shoves?: number; shoveDrift?: boolean
  x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; groundAngle: number
  sliding: { angle: number; amount: number; time: number; active: boolean; x: number; y: number; balanceSpeed?: number } | null
  coyote: number; buffer: number; jumpStrength: number | undefined; jumpHeld: boolean
  jumpLift: { elapsed: number; strength: number; entrySpeed: number; extraSpeed: number; fresh: boolean } | null
  grabCooldown: number; ladderJumpGrace: number
  wallJumpBuffer: number; wallJump: { direction: number; time: number } | null
  wallBrace: { wallX: number; wallY?: number; normal?: [number, number]; direction: number; active: boolean; amount?: number; hands: [number, number]; feet: [number, number] } | null
  climbing: Climbing | null; ropes: RopeState[] | null
  pushing: (Omit<PushHands, 'slope'> & { direction: number; amount: number; ready?: number; effort: number; load?: number; slope?: number; colliderId?: string }) | null
  ledgeReach: { x: number; y: number; amount: number } | null
  stepIntent: (TerrainLedge & { time: number }) | null
  hang: { platform: number; side: number; edgeX: number; edgeY: number; slope?: number; outwardSlope?: number; time: number; queued: boolean; braced: boolean; dropLocked?: boolean; upLocked?: boolean;
    caught: { x: number; y: number; vx: number; vy: number; anim: CaughtAnimation; ledgeReach: Player['ledgeReach']; climbing?: Climbing | null; freeFall?: Player['freeFall']; waterMotion?: Player['waterMotion']; heldTool?: Player['heldTool'] } } | null
  mantle: { edgeX: number; edgeY: number; side: number; slope?: number; outwardSlope?: number; toX: number; toY: number; time: number; braced: boolean;
    platform?: number; returning?: boolean; crouched?: boolean; inset?: number; blockedTime?: number;
    step?: StepUp;
    /** Foreground ladder-to-deck pull-up, viewed from behind. */
    ladder?: { climb: Climbing; x: number; y: number; entry: number };
    descending?: { platform: number; caught: Climbing['caught']; climbable: Climbing | null } } | null
  landing: number; landingImpact: number; spawnX: number; spawnY: number; checkpoint: number
  freeFall: { time: number; amount: number; recovery: number | null; bodyOffset?: [number, number]; impact?: { vx: number; vy: number; gait: GaitPose | null }; moving?: { pose: AthletePose; time: number; facing: number } } | null
  jumpStart: number; jumpHeight: number; bestHeight: number
  crouching: boolean; crouch: number; reach: number
  airBoost: { x: number; lift: number; time: number } // Presentation of applied air-control forces.
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
  releaseTurn?: { angle: number; target: number; pose?: AthletePose; facing?: number; time?: number; progress?: number }
}
