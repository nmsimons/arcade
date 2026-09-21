import type { TankBrain } from './ai'

export type Vector2 = { x: number; y: number }
export type CollisionMaterial = 'masonry' | 'metal' | 'armor' | 'wood' | 'soft'
export type Airdrop = { elapsed: number; height: number; landed: boolean }

// Medical cases repair the base hull; extra armor comes only from upgrades.
export const JEEP_MAX_HEALTH = 3

// Gameplay tuning knobs (jeep)
// Adjust these values to quickly iterate on feel/difficulty.
export const JEEP_TUNING = {
  // Steering reaches this rate at normal road speed; stationary cars cannot pivot.
  turnSpeed: 4,
  steeringStopSpeed: 2,
  steeringFullSpeed: 60,

  // Acceleration (pixels / second^2). Drag-limited road speed scales with
  // engine thrust in both directions.
  accelForward: 350,
  accelReverseFactor: 0.5,

  // Drift/grip
  driftSpeedThreshold: 10,
  gripBase: 0.06,
  gripSpeedFactor: 0.0003,
  gripMin: 0.015,

  // Friction / speed cap
  friction: 0.96,
  maxSpeed: 625,

  // Wheels / visuals
  wheelSpinFactor: 0.3,
  wheelSteerAngle: 0.6,

  // Collision / bounds
  collisionRadius: 12,
  collisionVelocityDamping: 0.5,
  screenMargin: 20,

  // Firing
  playerBulletSpeed: 400,
  playerBulletLifeMs: 1500,

  // Pickups
  repairPickupRadius: 22,
} as const

export type Jeep = {
  pos: Vector2
  vel: Vector2
  angle: number
  health: number
  state: 'active' | 'exploding' | 'dead'
  explodeTime: number
  wheelAngle: number
  hitFlash: number
}

export type Tank = {
  pos: Vector2; vel: Vector2; angle: number; turretAngle: number; health: number
  state: 'incoming' | 'active' | 'exploding'; explodeTime: number; shootCooldown: number
  trackOffset: number; losTimeMs: number; role: number; brain: TankBrain
  recoil: number
  arrival?: Airdrop
}

export type Helicopter = {
  pos: Vector2
  vel: Vector2
  angle: number
  state: 'incoming' | 'active' | 'exploding'
  explodeTime: number
  shootCooldown: number
  rotorAngle: number
  soundTimer: number
  losTimeMs: number
  orbit: number
  recoil: number
  entry?: Vector2
}

export type Bullet = {
  pos: Vector2
  vel: Vector2
  life: number
  isEnemy: boolean
}

export type Wall = {
  x: number
  y: number
  width: number
  height: number
  // Optional rotation about the rectangle center, used by movable cover.
  angle?: number
  impactMaterial?: CollisionMaterial
}

export type Debris = {
  pos: Vector2
  vel: Vector2
  angle: number
  rotSpeed: number
  life: number
  length: number
  kind: 'chip' | 'dust' | 'ember'
  material: 'metal' | 'masonry'
  age: number
  duration: number
  height: number
  rise: number
}

export type RepairKit = {
  pos: Vector2
  spawnedAtMs: number
  arrival?: Airdrop
}

export type ArmorUpgrade = { pos: Vector2; arrival?: Airdrop }


export const FIELD = { width: 1600, height: 1100 } as const
export const viewportScale = (width: number, height: number) => .8 * Math.max(1, Math.min(width / 1280, height / 800))
