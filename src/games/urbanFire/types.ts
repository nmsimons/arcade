import type { TankBrain } from './ai'

export type Vector2 = { x: number; y: number }

export const JEEP_MAX_HEALTH = 3

// Gameplay tuning knobs (jeep)
// Adjust these values to quickly iterate on feel/difficulty.
export const JEEP_TUNING = {
  // Rotation (radians / second)
  turnSpeed: 4,

  // Acceleration (pixels / second^2)
  accelForward: 280,
  accelReverseFactor: 0.5,

  // Drift/grip
  driftSpeedThreshold: 10,
  gripBase: 0.06,
  gripSpeedFactor: 0.0003,
  gripMin: 0.015,

  // Friction / speed cap
  friction: 0.96,
  maxSpeed: 500,

  // Wheels / visuals
  wheelSpinFactor: 0.3,

  // Collision / bounds
  collisionRadius: 12,
  collisionVelocityDamping: 0.5,
  screenMargin: 20,

  // Firing
  maxPlayerBullets: 2,
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
  state: 'active' | 'exploding'; explodeTime: number; shootCooldown: number
  trackOffset: number; losTimeMs: number; role: number; brain: TankBrain
  recoil: number
}

export type Helicopter = {
  pos: Vector2
  vel: Vector2
  angle: number
  state: 'active' | 'exploding'
  explodeTime: number
  shootCooldown: number
  rotorAngle: number
  soundTimer: number
  losTimeMs: number
  orbit: number
  recoil: number
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
}

export type Debris = {
  pos: Vector2
  vel: Vector2
  angle: number
  rotSpeed: number
  life: number
  length: number
}

export type RepairKit = {
  pos: Vector2
  spawnedAtMs: number
}


export const FIELD = { width: 1600, height: 1100 } as const
export const viewportScale = (width: number, height: number) => Math.max(1, Math.min(width / 1280, height / 800))
