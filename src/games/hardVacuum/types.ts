export interface Vector2 {
  x: number
  y: number
}

export type V3 = [number, number, number]

export interface Ship {
  pos: Vector2
  vel: Vector2
  angle: number
  radius: number
}

export type RockKind = 'normal' | 'blue'

export interface Rock {
  pos: Vector2
  vel: Vector2
  radius: number
  points: Vector2[]
  rot: V3
  angVel: V3
  mesh: { verts: V3[]; polys: number[][] }
  kind: RockKind
  inBaseTime?: number
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
      rock: Rock
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
  end: Vector2
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
}

export type HardVacuumGameProps = {
  onExit: () => void
}
