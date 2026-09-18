export interface Vector2 {
  x: number
  y: number
}

export type V3 = [number, number, number]

export interface Ship {
  pos: Vector2
  vel: Vector2
  angle: number
  angularVelocity?: number
  radius: number
}

export type RockKind = 'normal' | 'blue' | 'red'

export interface TetherBody {
  pos: Vector2
  vel: Vector2
  radius: number
  mass?: number
  cargoId?: string
  kind?: RockKind
  tethered?: boolean
  sourceId?: string
  socketId?: string
  anchored?: boolean
  retrieving?: boolean
  terminalId?: string
  botId?: string
  laserGlow?: number
}

export interface Rock extends TetherBody {
  points: Vector2[]
  rot: V3
  angVel: V3
  mesh: { verts: V3[]; polys: number[][] }
  kind: RockKind
  fragmentRates?: { red: number; blue: number }
  inBaseTime?: number
  laserGlow?: number
  // Red rocks can be "armed" and detonate after a short fuse.
  // Remaining fuse time in seconds; undefined means not armed.
  redFuseS?: number
  // Expedition cargo remembers that the player retrieved it with the tether.
  tethered?: boolean
  sourceId?: string
  socketId?: string
}

export type Harpoon =
  | { state: 'idle' }
  | {
      state: 'flying'
      pos: Vector2
      vel: Vector2
      life: number
      traveled: number
      maxLength: number
      ropeLength: number
      segLen: number
      rope: Vector2[]
      ropePrev: Vector2[]
    }
  | {
      state: 'deployed'
      pos: Vector2
      vel: Vector2
      maxLength: number
      ropeLength: number
      segLen: number
      rope: Vector2[]
      ropePrev: Vector2[]
    }
  | {
      state: 'attached'
      rock: TetherBody
      ropeLength: number
      maxLength: number
      segLen: number
      rope: Vector2[]
      ropePrev: Vector2[]
    }
  | {
      state: 'reeling'
      pos: Vector2
      reelSpeed: number
      reelLength: number
      ropeLength: number
      segLen: number
      rope: Vector2[]
      ropePrev: Vector2[]
    }

export interface Bullet {
  pos: Vector2
  vel: Vector2
  life: number
  isEnemy?: boolean
}

export interface PhaserBeam {
  active: boolean
  start: Vector2
  direction: Vector2
  length: number
  energy01: number
}

export interface PhaserParticle {
  pos: Vector2
  vel: Vector2
  life: number // milliseconds
}

export interface BaseShot {
  pos: Vector2
  vel: Vector2
  life: number
}

export interface Debris {
  pos: Vector2
  vel: Vector2
  angle: number
  rotSpeed: number
  life: number
  length: number
  color: string
  spark?: boolean
}

export type HardVacuumGameProps = {
  onExit: () => void
}
