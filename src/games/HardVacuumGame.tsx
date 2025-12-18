import { useEffect, useRef, useState, useCallback } from 'react'

// Sound system using Web Audio API
class SoundSystem {
  private ctx: AudioContext | null = null
  private initialized = false
  private thrustGain: GainNode | null = null
  private thrustNoise: AudioBufferSourceNode | null = null
  private thrusting = false

  init() {
    if (this.initialized) return
    this.ctx = new AudioContext()
    this.initialized = true
  }

  shoot() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  collect() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(520, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.12)
  }

  explosion(size: 'large' | 'medium' | 'small') {
    if (!this.ctx) return
    const duration = size === 'large' ? 0.6 : size === 'medium' ? 0.4 : 0.2
    const volume = size === 'large' ? 0.4 : size === 'medium' ? 0.3 : 0.2

    // Create noise burst for the crunch
    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    // Filter the noise - lower for bigger explosions
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(size === 'large' ? 400 : size === 'medium' ? 600 : 800, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(volume, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)

    // Add a low thump underneath
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(size === 'large' ? 80 : size === 'medium' ? 100 : 120, this.ctx.currentTime)
    thump.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + duration * 0.5)
    thumpGain.gain.setValueAtTime(volume * 0.6, this.ctx.currentTime)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration * 0.5)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start()
    thump.stop(this.ctx.currentTime + duration * 0.5)
  }

  startThrust() {
    if (!this.ctx || this.thrusting) return
    this.thrusting = true

    // Create a looping noise buffer
    const bufferSize = this.ctx.sampleRate * 2 // 2 seconds of noise
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    this.thrustNoise = this.ctx.createBufferSource()
    this.thrustNoise.buffer = noiseBuffer
    this.thrustNoise.loop = true

    // Band-pass filter for that whoosh character
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 300
    filter.Q.value = 0.5

    // Master gain with fade in
    this.thrustGain = this.ctx.createGain()
    this.thrustGain.gain.setValueAtTime(0, this.ctx.currentTime)
    this.thrustGain.gain.linearRampToValueAtTime(0.2, this.ctx.currentTime + 0.05)

    // Connect noise path
    this.thrustNoise.connect(filter)
    filter.connect(this.thrustGain)
    this.thrustGain.connect(this.ctx.destination)

    this.thrustNoise.start()
  }

  stopThrust() {
    if (!this.ctx || !this.thrusting) return
    this.thrusting = false

    // Fade out
    if (this.thrustGain) {
      this.thrustGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1)
    }

    // Stop after fade
    setTimeout(() => {
      this.thrustNoise?.stop()
      this.thrustNoise = null
      this.thrustGain = null
    }, 150)
  }

  death() {
    if (!this.ctx) return
    const duration = 1.2

    // Big initial noise burst
    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    // Filter sweeps down
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(2000, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)

    // Deep bass thump
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(60, this.ctx.currentTime)
    thump.frequency.exponentialRampToValueAtTime(15, this.ctx.currentTime + 0.6)
    thumpGain.gain.setValueAtTime(0.6, this.ctx.currentTime)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.6)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start()
    thump.stop(this.ctx.currentTime + 0.6)

    // Multiple crackle bursts for debris feel
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (!this.ctx) return
        const crackleBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.15, this.ctx.sampleRate)
        const crackleOut = crackleBuffer.getChannelData(0)
        for (let j = 0; j < crackleOut.length; j++) {
          crackleOut[j] = (Math.random() * 2 - 1) * Math.random()
        }
        const crackle = this.ctx.createBufferSource()
        crackle.buffer = crackleBuffer

        const crackleFilter = this.ctx.createBiquadFilter()
        crackleFilter.type = 'bandpass'
        crackleFilter.frequency.value = 400 + Math.random() * 600
        crackleFilter.Q.value = 2

        const crackleGain = this.ctx.createGain()
        crackleGain.gain.setValueAtTime(0.25, this.ctx.currentTime)
        crackleGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)

        crackle.connect(crackleFilter)
        crackleFilter.connect(crackleGain)
        crackleGain.connect(this.ctx.destination)
        crackle.start()
        crackle.stop(this.ctx.currentTime + 0.15)
      }, i * 80 + Math.random() * 50)
    }
  }
}

const sounds = new SoundSystem()

interface Vector2 {
  x: number
  y: number
}

type V3 = [number, number, number]

const rotX = (p: V3, a: number): V3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]
}

const rotY = (p: V3, a: number): V3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}

const rotZ = (p: V3, a: number): V3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
}

const normalize3 = (v: V3): V3 => {
  const m = Math.hypot(v[0], v[1], v[2])
  if (m < 1e-8) return [0, 0, 0]
  return [v[0] / m, v[1] / m, v[2] / m]
}

const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const makeRockMesh = (radius: number, seed: number) => {
  // Regular icosahedron: 12 vertices, 20 triangular faces.
  // Add a small deterministic radial jitter per vertex to make each rock
  // feel a bit less perfectly regular while staying convex and stable.
  const rand01 = (n: number) => {
    const x = Math.sin(n) * 43758.5453123
    return x - Math.floor(x)
  }

  const irregularity = 0.1

  const phi = (1 + Math.sqrt(5)) / 2

  const baseVerts: V3[] = [
    // (0, ±1, ±φ)
    [0, -1, -phi],
    [0, -1, phi],
    [0, 1, -phi],
    [0, 1, phi],
    // (±1, ±φ, 0)
    [-1, -phi, 0],
    [-1, phi, 0],
    [1, -phi, 0],
    [1, phi, 0],
    // (±φ, 0, ±1)
    [-phi, 0, -1],
    [-phi, 0, 1],
    [phi, 0, -1],
    [phi, 0, 1],
  ]

  const verts: V3[] = baseVerts.map((v, i) => {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    const ux = v[0] / len
    const uy = v[1] / len
    const uz = v[2] / len

    // Symmetric jitter keeps average radius about the same.
    const n = rand01(seed * 12.9898 + i * 78.233)
    const jitter = (n * 2 - 1) * irregularity
    const r = radius * (1 + jitter)
    return [ux * r, uy * r, uz * r]
  })

  const polys: number[][] = [
    [0, 2, 8],
    [0, 8, 4],
    [0, 4, 6],
    [0, 6, 10],
    [0, 10, 2],

    [3, 9, 1],
    [3, 1, 11],
    [3, 11, 7],
    [3, 7, 5],
    [3, 5, 9],

    [2, 10, 7],
    [2, 7, 5],
    [2, 5, 8],
    [8, 5, 9],
    [8, 9, 4],

    [10, 6, 11],
    [10, 11, 7],
    [6, 4, 1],
    [6, 1, 11],
    [4, 9, 1],
  ]

  return { verts, polys }
}

interface Ship {
  pos: Vector2
  vel: Vector2
  angle: number
  radius: number
}

type RockKind = 'normal' | 'blue'

interface Rock {
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

type Harpoon =
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

interface Bullet {
  pos: Vector2
  vel: Vector2
  life: number
  isEnemy?: boolean
}

interface BaseShot {
  pos: Vector2
  vel: Vector2
  life: number
}

interface Debris {
  pos: Vector2
  vel: Vector2
  angle: number
  rotSpeed: number
  life: number
  length: number
  color: string
}

type HardVacuumGameProps = {
  onExit: () => void
}

export function HardVacuumGame({ onExit }: HardVacuumGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'dying' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [damage, setDamage] = useState(0)
  const [level, setLevel] = useState(1)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const SHIP_RADIUS = 15
  const SMALLEST_ROCK_RADIUS = 20
  const shipRef = useRef<Ship>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, radius: SHIP_RADIUS })
  const rocksRef = useRef<Rock[]>([])
  const levelRef = useRef(1)
  const blueRockQuotaRef = useRef(0)
  const blueRocksSpawnedThisLevelRef = useRef(0)
  const shipRepairTimeRef = useRef(0)
  const bulletsRef = useRef<Bullet[]>([])
  const baseShotsRef = useRef<BaseShot[]>([])
  const debrisRef = useRef<Debris[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const invulnerableRef = useRef(0)
  const dyingTimerRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const levelingUpRef = useRef(false)
  const harpoonRef = useRef<Harpoon>({ state: 'idle' })
  const miningBaseAngleRef = useRef(0)
  const miningGunCooldownsRef = useRef<[number, number, number]>([0, 0.06, 0.12])

  // Harpoon cable is a fixed-length tether. The fired hook cannot exceed this distance.
  const HARPOON_CABLE_LENGTH = 130
  const HARPOON_REEL_SPEED = 440
  // Visual-only slack so the cable can look weighty/curvy even when fully extended.
  const HARPOON_VISUAL_SLACK = 1.18
  const HARPOON_HOOK_RADIUS = 5
  const HARPOON_HOOK_MASS = Math.max(0.2, (HARPOON_HOOK_RADIUS / 18) * (HARPOON_HOOK_RADIUS / 18))
  const HARPOON_REEL_MIN_LEN = SHIP_RADIUS + HARPOON_HOOK_RADIUS + 2

  // Central mining base (ore hopper)
  const MINING_BASE_RADIUS = 118

  const blueRockQuotaForLevel = useCallback((lvl: number) => {
    // Ensure some levels require base processing to finish.
    return lvl >= 3 && lvl % 3 === 0 ? 1 : 0
  }, [])

  const resetBlueRocksForLevel = useCallback(
    (lvl: number) => {
      levelRef.current = lvl
      blueRockQuotaRef.current = blueRockQuotaForLevel(lvl)
      blueRocksSpawnedThisLevelRef.current = 0
    },
    [blueRockQuotaForLevel],
  )
  const MINING_DOOR_TRIM = 44
  const MINING_ROT_SPEED = 0.18

  const toroidalDelta = useCallback((ax: number, ay: number, bx: number, by: number, w: number, h: number) => {
    // Vector from A -> B under wrapping (shortest).
    let dx = bx - ax
    let dy = by - ay
    if (dx > w / 2) dx -= w
    else if (dx < -w / 2) dx += w
    if (dy > h / 2) dy -= h
    else if (dy < -h / 2) dy += h
    return { dx, dy }
  }, [])

  const buildRopeBetween = useCallback(
    (ax: number, ay: number, bx: number, by: number, ropeLen: number) => {
      const { width: w, height: h } = canvasSizeRef.current
      const wrapX = (x: number) => {
        if (x < 0) return x + w
        if (x > w) return x - w
        return x
      }
      const wrapY = (y: number) => {
        if (y < 0) return y + h
        if (y > h) return y - h
        return y
      }

      const segments = clamp(Math.ceil(ropeLen / 14), 10, 44)
      const segLen = ropeLen / segments
      const d = toroidalDelta(ax, ay, bx, by, w, h)
      const rope: Vector2[] = []
      const ropePrev: Vector2[] = []
      for (let k = 1; k < segments; k++) {
        const t = k / segments
        const px = wrapX(ax + d.dx * t)
        const py = wrapY(ay + d.dy * t)
        rope.push({ x: px, y: py })
        ropePrev.push({ x: px, y: py })
      }
      return { rope, ropePrev, segLen }
    },
    [toroidalDelta],
  )

  const createRock = useCallback(
    (x: number, y: number, radius: number, velOverride?: Vector2, kind: RockKind = 'normal'): Rock => {
    const points: Vector2[] = []
    const vertices = 8 + Math.floor(Math.random() * 4)
    for (let i = 0; i < vertices; i++) {
      const angle = (i / vertices) * Math.PI * 2
      const variance = 0.7 + Math.random() * 0.6
      points.push({
        x: Math.cos(angle) * radius * variance,
        y: Math.sin(angle) * radius * variance,
      })
    }

    const angle = Math.random() * Math.PI * 2
    const speed = 20 + Math.random() * 30

    // 3D tumbling: independent angular velocity per axis.
    // Smaller rocks tend to tumble faster.
    const spinBase = 0.9 + 42 / Math.max(18, radius)
    const seed = Math.random() * 10000
    const angVel: V3 = [
      (Math.random() - 0.5) * spinBase,
      (Math.random() - 0.5) * spinBase,
      (Math.random() - 0.5) * spinBase,
    ]

    return {
      pos: { x, y },
      vel: velOverride ?? { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius,
      points,
      rot: [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2],
      angVel,
      mesh: makeRockMesh(radius, seed),
      kind,
    }
    },
    [],
  )

  const createDebris = useCallback(
    (
      x: number,
      y: number,
      velX: number,
      velY: number,
      count: number = 8,
      lifeMult: number = 1,
      color: string = '0, 255, 136',
    ) => {
      const debris: Debris[] = []
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
        const speed = 50 + Math.random() * 100
        debris.push({
          pos: { x, y },
          vel: { x: velX + Math.cos(angle) * speed, y: velY + Math.sin(angle) * speed },
          angle: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 10,
          life: (1500 + Math.random() * 500) * lifeMult,
          length: 5 + Math.random() * 10,
          color,
        })
      }
      debrisRef.current = [...debrisRef.current, ...debris]
    },
    [],
  )

  const spawnRocks = useCallback(
    (count: number, avoidRadius: number = 100, speedMult: number = 1) => {
      const newRocks: Rock[] = []
      const { width, height } = canvasSizeRef.current
      const ship = shipRef.current
      const edgeInset = 1.5

      const baseX = width / 2
      const baseY = height / 2

      const toroidalDistToShip = (x: number, y: number) => {
        const dxRaw = Math.abs(x - ship.pos.x)
        const dyRaw = Math.abs(y - ship.pos.y)
        const dx = Math.min(dxRaw, width - dxRaw)
        const dy = Math.min(dyRaw, height - dyRaw)
        return Math.hypot(dx, dy)
      }

      const toroidalDistToBase = (x: number, y: number) => {
        const dxRaw = Math.abs(x - baseX)
        const dyRaw = Math.abs(y - baseY)
        const dx = Math.min(dxRaw, width - dxRaw)
        const dy = Math.min(dyRaw, height - dyRaw)
        return Math.hypot(dx, dy)
      }

      const sampleEdgeSpawn = () => {
        const edge = Math.floor(Math.random() * 4)
        let x = 0
        let y = 0
        let inwardDir = 0

        if (edge === 0) {
          // Left edge -> inward right
          x = edgeInset
          y = Math.random() * height
          inwardDir = 0
        } else if (edge === 1) {
          // Right edge -> inward left
          x = width - edgeInset
          y = Math.random() * height
          inwardDir = Math.PI
        } else if (edge === 2) {
          // Top edge -> inward down
          x = Math.random() * width
          y = edgeInset
          inwardDir = Math.PI / 2
        } else {
          // Bottom edge -> inward up
          x = Math.random() * width
          y = height - edgeInset
          inwardDir = -Math.PI / 2
        }

        // Bias velocity inward but allow variation.
        const spread = Math.PI * 0.7
        const a = inwardDir + (Math.random() - 0.5) * spread
        const speed = (20 + Math.random() * 30) * speedMult
        const vel: Vector2 = { x: Math.cos(a) * speed, y: Math.sin(a) * speed }
        return { x, y, vel }
      }

      for (let i = 0; i < count; i++) {
        let chosen = sampleEdgeSpawn()
        for (let tries = 0; tries < 40; tries++) {
          const candidate = sampleEdgeSpawn()
          if (
            toroidalDistToShip(candidate.x, candidate.y) >= avoidRadius &&
            toroidalDistToBase(candidate.x, candidate.y) >= MINING_BASE_RADIUS + 180
          ) {
            chosen = candidate
            break
          }
          // Keep the best candidate so far if we can't satisfy avoidRadius (e.g., ship hugging an edge).
          if (toroidalDistToShip(candidate.x, candidate.y) > toroidalDistToShip(chosen.x, chosen.y)) {
            chosen = candidate
          }
        }

        newRocks.push(createRock(chosen.x, chosen.y, 30 + Math.random() * 15, chosen.vel))
      }
      rocksRef.current = [...rocksRef.current, ...newRocks]
    },
    [createRock],
  )

  const speedMultForLevel = useCallback((lvl: number) => {
    // Noticeable but not explosive. Caps keep later levels playable.
    return clamp(1 + (lvl - 1) * 0.085, 1, 2.25)
  }, [])

  const rockCountForLevel = useCallback((lvl: number) => {
    // Ramps faster than the old “every 3 levels” behavior.
    return 2 + Math.floor((lvl - 1) * 0.8)
  }, [])

  const startGame = useCallback(() => {
    sounds.init()
    const { width, height } = canvasSizeRef.current
    shipRef.current = { pos: { x: width / 2, y: height / 2 }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15 }
    rocksRef.current = []
    shipRepairTimeRef.current = 0
    bulletsRef.current = []
    baseShotsRef.current = []
    setScore(0)
    setDamage(0)
    setLevel(1)
    resetBlueRocksForLevel(1)
    setGameState('playing')
    invulnerableRef.current = 1200
    debrisRef.current = []
    levelingUpRef.current = false
    harpoonRef.current = { state: 'idle' }
    miningBaseAngleRef.current = 0
    miningGunCooldownsRef.current = [0, 0.06, 0.12]
    spawnRocks(rockCountForLevel(1), 100, speedMultForLevel(1))
  }, [spawnRocks, rockCountForLevel, speedMultForLevel, resetBlueRocksForLevel])

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useEffect(() => {
    if (gameState !== 'menu') return

    const { width, height } = canvasSizeRef.current
    shipRef.current = {
      pos: { x: width * 0.32, y: height * 0.58 },
      vel: { x: 0, y: 0 },
      angle: -Math.PI / 2,
      radius: SHIP_RADIUS,
    }

    if (rocksRef.current.length === 0) {
      spawnRocks(9, MINING_BASE_RADIUS + 70, 0.55)
    }
  }, [gameState, spawnRocks, MINING_BASE_RADIUS, SHIP_RADIUS])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
        return
      }

      if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault()
        const ship = shipRef.current
        const bullet: Bullet = {
          pos: { x: ship.pos.x, y: ship.pos.y },
          vel: {
            x: ship.vel.x + Math.cos(ship.angle) * 400,
            y: ship.vel.y + Math.sin(ship.angle) * 400,
          },
          life: 1000,
          isEnemy: false,
        }
        bulletsRef.current.push(bullet)
        sounds.shoot()
      }
      if (e.key.toLowerCase() === 'p' && gameState === 'playing') {
        setGameState('paused')
      } else if (e.key.toLowerCase() === 'p' && gameState === 'paused') {
        setGameState('playing')
      }

      // Harpoon grapple (X): fire / release.
      if (!e.repeat && e.key.toLowerCase() === 'x' && gameState === 'playing') {
        e.preventDefault()
        const hp = harpoonRef.current
        if (hp.state === 'idle') {
          const ship = shipRef.current
          const speedRel = 720

          // Recoil: treat the hook like a small mass body.
          // We fire at `speedRel` relative to the ship *after* recoil, conserving momentum.
          const mShip = 1
          const mHook = HARPOON_HOOK_MASS
          const mSum = mShip + mHook
          const dirX = Math.cos(ship.angle)
          const dirY = Math.sin(ship.angle)
          const shipV0x = ship.vel.x
          const shipV0y = ship.vel.y
          ship.vel.x = shipV0x - dirX * speedRel * (mHook / mSum)
          ship.vel.y = shipV0y - dirY * speedRel * (mHook / mSum)

          const hookVx = shipV0x + dirX * speedRel * (mShip / mSum)
          const hookVy = shipV0y + dirY * speedRel * (mShip / mSum)

          const ropeLength = HARPOON_CABLE_LENGTH * HARPOON_VISUAL_SLACK
          const seedX = ship.pos.x + Math.cos(ship.angle) * Math.min(ropeLength, 16)
          const seedY = ship.pos.y + Math.sin(ship.angle) * Math.min(ropeLength, 16)
          const seed = buildRopeBetween(ship.pos.x, ship.pos.y, seedX, seedY, ropeLength)
          harpoonRef.current = {
            state: 'flying',
            pos: { x: ship.pos.x, y: ship.pos.y },
            vel: {
              x: hookVx,
              y: hookVy,
            },
            // Long enough to reach maxLength at the given speed.
            life: 1200,
            traveled: 0,
            maxLength: HARPOON_CABLE_LENGTH,
            ropeLength,
            segLen: seed.segLen,
            rope: seed.rope,
            ropePrev: seed.ropePrev,
          }
        } else if (hp.state === 'reeling') {
          // Ignore while reeling; you can't fire again until it's fully in.
        } else if (hp.state === 'attached') {
          // Reel-in detaches.
          const ship = shipRef.current
          const { width: w, height: h } = canvasSizeRef.current
          const d0 = toroidalDelta(ship.pos.x, ship.pos.y, hp.rock.pos.x, hp.rock.pos.y, w, h)
          const reelLength = Math.min(hp.maxLength, Math.hypot(d0.dx, d0.dy))
          const ropeLength = reelLength * HARPOON_VISUAL_SLACK
          const seed = buildRopeBetween(ship.pos.x, ship.pos.y, hp.rock.pos.x, hp.rock.pos.y, ropeLength)
          harpoonRef.current = {
            state: 'reeling',
            pos: { x: hp.rock.pos.x, y: hp.rock.pos.y },
            reelSpeed: HARPOON_REEL_SPEED,
            reelLength,
            ropeLength,
            segLen: seed.segLen,
            rope: seed.rope,
            ropePrev: seed.ropePrev,
          }
        } else {
          // Any other non-idle state (flying/deployed): reel in.
          const ship = shipRef.current
          const { width: w, height: h } = canvasSizeRef.current
          const d0 = toroidalDelta(ship.pos.x, ship.pos.y, hp.pos.x, hp.pos.y, w, h)
          const reelLength = Math.min(hp.maxLength, Math.hypot(d0.dx, d0.dy))
          const ropeLength = reelLength * HARPOON_VISUAL_SLACK
          const seed = buildRopeBetween(ship.pos.x, ship.pos.y, hp.pos.x, hp.pos.y, ropeLength)
          harpoonRef.current = {
            state: 'reeling',
            pos: { x: hp.pos.x, y: hp.pos.y },
            reelSpeed: HARPOON_REEL_SPEED,
            reelLength,
            ropeLength,
            segLen: seed.segLen,
            rope: seed.rope,
            ropePrev: seed.ropePrev,
          }
        }
      }
      
      // Menu keyboard navigation
      if (gameState === 'menu') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setMenuIndex((i) => (i > 0 ? i - 1 : 1))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setMenuIndex((i) => (i < 1 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (menuIndex === 0) startGame()
          else onExit()
        }
      }
      
      // Game Over keyboard navigation
      if (gameState === 'gameOver') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setGameOverIndex((i) => (i > 0 ? i - 1 : 2))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setGameOverIndex((i) => (i < 2 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (gameOverIndex === 0) startGame()
          else if (gameOverIndex === 1) setGameState('menu')
          else onExit()
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, menuIndex, gameOverIndex, startGame, onExit])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }
    }

    resize()
    window.addEventListener('resize', resize)

    const update = (dt: number) => {
      // Always update debris so explosions can play during transitions/menus.
      if (debrisRef.current.length > 0) {
        debrisRef.current = debrisRef.current.filter((d) => {
          d.pos.x += d.vel.x * dt
          d.pos.y += d.vel.y * dt
          d.angle += d.rotSpeed * dt
          d.life -= dt * 1000
          d.vel.x *= 0.99
          d.vel.y *= 0.99
          return d.life > 0
        })
      }

      // Let the death explosion play before showing Game Over.
      if (gameState === 'dying') {
        dyingTimerRef.current -= dt * 1000
        if (dyingTimerRef.current <= 0) setGameState('gameOver')
        return
      }

      // Keep the base (and menu background) alive even when not playing.
      miningBaseAngleRef.current += dt * MINING_ROT_SPEED

      if (gameState === 'menu') {
        const { width: w, height: h } = canvasSizeRef.current
        rocksRef.current.forEach((rock) => {
          rock.pos.x += rock.vel.x * dt
          rock.pos.y += rock.vel.y * dt

          rock.rot[0] += rock.angVel[0] * dt
          rock.rot[1] += rock.angVel[1] * dt
          rock.rot[2] += rock.angVel[2] * dt

          if (rock.pos.x > w) rock.pos.x = 0
          if (rock.pos.x < 0) rock.pos.x = w
          if (rock.pos.y > h) rock.pos.y = 0
          if (rock.pos.y < 0) rock.pos.y = h
        })
        return
      }

      if (gameState !== 'playing') return

      const ship = shipRef.current

      const applyImpactDamage = (impactSpeed: number) => {
        if (invulnerableRef.current > 0) return
        // Calibrated for gameplay feel (ship max speed ~300):
        // very slow -> 0, slow -> 1, medium -> 2, fast -> 3.
        // User-calibrated collision thresholds (relative speed):
        // < 30 -> 0, 30-100 -> 1, 100-250 -> 2, 250+ -> 3
        const slow = 30
        const medium = 100
        const fast = 250
        const amt = impactSpeed >= fast ? 3 : impactSpeed >= medium ? 2 : impactSpeed >= slow ? 1 : 0
        if (amt <= 0) return
        invulnerableRef.current = 450
        setDamage((d) => {
          const next = Math.min(3, d + amt)
          if (next >= 3) {
            // BOOM: use the existing debris explosion effect.
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 18, 1.2, '255, 255, 255')
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 10, 1.0, '255, 170, 0')
            sounds.explosion('large')
            sounds.stopThrust()
            keysRef.current.clear()
            dyingTimerRef.current = 1200
            setGameState('dying')
          }
          return next
        })
      }

      // Ship controls
      if (keysRef.current.has('arrowleft') || keysRef.current.has('a')) {
        ship.angle -= 5 * dt
      }
      if (keysRef.current.has('arrowright') || keysRef.current.has('d')) {
        ship.angle += 5 * dt
      }
      const isThrusting = keysRef.current.has('arrowup') || keysRef.current.has('w')
      if (isThrusting) {
        ship.vel.x += Math.cos(ship.angle) * 300 * dt
        ship.vel.y += Math.sin(ship.angle) * 300 * dt
        sounds.startThrust()
      } else {
        sounds.stopThrust()
      }

      // Apply friction and speed limit
      const maxSpeed = 300
      const speed = Math.hypot(ship.vel.x, ship.vel.y)
      if (speed > maxSpeed) {
        ship.vel.x = (ship.vel.x / speed) * maxSpeed
        ship.vel.y = (ship.vel.y / speed) * maxSpeed
      }
      ship.vel.x *= 0.99
      ship.vel.y *= 0.99

      // Update ship position with wrapping
      ship.pos.x += ship.vel.x * dt
      ship.pos.y += ship.vel.y * dt

      // Wrap ship position at window edges
      const { width, height } = canvasSizeRef.current
      if (ship.pos.x > width) ship.pos.x = 0
      if (ship.pos.x < 0) ship.pos.x = width
      if (ship.pos.y > height) ship.pos.y = 0
      if (ship.pos.y < 0) ship.pos.y = height

      // Update invulnerability
      if (invulnerableRef.current > 0) {
        invulnerableRef.current -= dt * 1000
      }

      // Update rocks with wrapping
      const { width: w, height: h } = canvasSizeRef.current
      rocksRef.current.forEach((rock) => {
        rock.pos.x += rock.vel.x * dt
        rock.pos.y += rock.vel.y * dt

        // 3D tumbling
        rock.rot[0] += rock.angVel[0] * dt
        rock.rot[1] += rock.angVel[1] * dt
        rock.rot[2] += rock.angVel[2] * dt

        if (rock.pos.x > w) rock.pos.x = 0
        if (rock.pos.x < 0) rock.pos.x = w
        if (rock.pos.y > h) rock.pos.y = 0
        if (rock.pos.y < 0) rock.pos.y = h
      })

      // Rock-rock collisions (treat as circles in a wrapped/toroidal space)
      // This uses a simple impulse + positional correction so rocks "bump" off each other.
      const rocks = rocksRef.current
      const restitution = 0.9
      const wrapX = (x: number) => {
        if (x < 0) return x + w
        if (x > w) return x - w
        return x
      }
      const wrapY = (y: number) => {
        if (y < 0) return y + h
        if (y > h) return y - h
        return y
      }

      // Mining base interaction: a flat-topped hex with 3 door gaps.
      // Anything inside the hex is processed (rocks) or repaired (ship).
      // Only the visible wall segments collide.
      {
        const baseX = w / 2
        const baseY = h / 2

        const baseAng = miningBaseAngleRef.current

        const hexVerts: Vector2[] = Array.from({ length: 6 }, (_, i) => {
          const a = baseAng + (i / 6) * Math.PI * 2
          return { x: Math.cos(a) * MINING_BASE_RADIUS, y: Math.sin(a) * MINING_BASE_RADIUS }
        })

        const doorCorners = new Set([1, 3, 5]) // remove every other segment starting at ~1 o'clock
        const wallSegments: Array<{ a: Vector2; b: Vector2 }> = []
        for (let i = 0; i < 6; i++) {
          const a0 = hexVerts[i]
          const b0 = hexVerts[(i + 1) % 6]
          const ex = b0.x - a0.x
          const ey = b0.y - a0.y
          const len = Math.hypot(ex, ey)
          if (len < 1e-6) continue
          const startT = doorCorners.has(i) ? MINING_DOOR_TRIM / len : 0
          const endT = doorCorners.has((i + 1) % 6) ? 1 - MINING_DOOR_TRIM / len : 1
          if (startT >= endT - 1e-6) continue
          wallSegments.push({
            a: { x: a0.x + ex * startT, y: a0.y + ey * startT },
            b: { x: a0.x + ex * endT, y: a0.y + ey * endT },
          })
        }

        const circleFullyInHex = (px: number, py: number, radius: number) => {
          // Hex is CCW; inside is to the left of each directed edge.
          for (let i = 0; i < 6; i++) {
            const a = hexVerts[i]
            const b = hexVerts[(i + 1) % 6]
            const ex = b.x - a.x
            const ey = b.y - a.y
            const len = Math.hypot(ex, ey)
            if (len < 1e-6) continue
            // Left normal (points inward for CCW polygon)
            const nx = -ey / len
            const ny = ex / len
            const dist = (px - a.x) * nx + (py - a.y) * ny
            if (dist < radius) return false
          }
          return true
        }

        const collideWithWalls = (
          pos: Vector2,
          vel: Vector2,
          radius: number,
          restitutionK: number,
          onImpact?: (impactSpeed: number) => void,
        ) => {
          const d = toroidalDelta(baseX, baseY, pos.x, pos.y, w, h)
          let px = d.dx
          let py = d.dy
          let touched = false

          for (let i = 0; i < wallSegments.length; i++) {
            const seg = wallSegments[i]
            const ax = seg.a.x
            const ay = seg.a.y
            const bx = seg.b.x
            const by = seg.b.y
            const vx = bx - ax
            const vy = by - ay
            const denom = vx * vx + vy * vy
            if (denom < 1e-6) continue
            const t = clamp(((px - ax) * vx + (py - ay) * vy) / denom, 0, 1)
            const qx = ax + vx * t
            const qy = ay + vy * t
            const dx = px - qx
            const dy = py - qy
            const dist = Math.hypot(dx, dy)
            if (dist >= radius || dist < 1e-6) continue

            const nx = dx / dist
            const ny = dy / dist
            const push = radius - dist
            px += nx * push
            py += ny * push
            touched = true

            const vAlong = vel.x * nx + vel.y * ny
            if (vAlong < 0) {
              onImpact?.(Math.hypot(vel.x, vel.y))
              vel.x -= (1 + restitutionK) * vAlong * nx
              vel.y -= (1 + restitutionK) * vAlong * ny
            }
          }

          if (touched) {
            pos.x = wrapX(baseX + px)
            pos.y = wrapY(baseY + py)
          }
        }

        for (let i = 0; i < rocks.length; i++) {
          const a = rocks[i]
          collideWithWalls(a.pos, a.vel, a.radius, 0.85)
        }

        // Track how long each rock has been fully inside the base.
        // Processing is handled by base guns (shots), not automatically.
        let targetIndex = -1
        let targetDist = Infinity
        for (let i = 0; i < rocks.length; i++) {
          const a = rocks[i]
          const d = toroidalDelta(baseX, baseY, a.pos.x, a.pos.y, w, h)
          const fullyInside = circleFullyInHex(d.dx, d.dy, a.radius)
          if (!fullyInside) {
            a.inBaseTime = 0
            continue
          }
          a.inBaseTime = (a.inBaseTime ?? 0) + dt
          if (a.inBaseTime < 2) continue
          const dd = d.dx * d.dx + d.dy * d.dy
          if (dd < targetDist) {
            targetDist = dd
            targetIndex = i
          }
        }

        // Base guns: three simple dots that shoot rocks eligible for processing.
        // Guns are attached to the rotating base and fire inward.
        {
          // Update gun cooldowns.
          const cds = miningGunCooldownsRef.current
          for (let i = 0; i < 3; i++) cds[i] = Math.max(0, cds[i] - dt)

          if (targetIndex >= 0) {
            const target = rocks[targetIndex]
            const shotSpeed = 520
            const fireCooldown = 0.18

            // Choose three gun positions in base-local space, rotated with the base.
            // Place them slightly inside the hull on the three solid arms.
            const gunRadius = MINING_BASE_RADIUS * 0.63
            const baseAng = miningBaseAngleRef.current
            const gunAngles = [baseAng + 0, baseAng + (2 * Math.PI) / 3, baseAng + (4 * Math.PI) / 3]

            for (let gi = 0; gi < 3; gi++) {
              if (cds[gi] > 0) continue

              const gx = wrapX(baseX + Math.cos(gunAngles[gi]) * gunRadius)
              const gy = wrapY(baseY + Math.sin(gunAngles[gi]) * gunRadius)

              const td = toroidalDelta(gx, gy, target.pos.x, target.pos.y, w, h)
              const tl = Math.hypot(td.dx, td.dy)
              if (tl < 1e-6) continue
              const vx = (td.dx / tl) * shotSpeed
              const vy = (td.dy / tl) * shotSpeed

              baseShotsRef.current.push({ pos: { x: gx, y: gy }, vel: { x: vx, y: vy }, life: 0.9 })
              cds[gi] = fireCooldown
            }
          }
        }


      // Update base shots.
      baseShotsRef.current = baseShotsRef.current
        .map((s) => {
          s.pos.x = wrapX(s.pos.x + s.vel.x * dt)
          s.pos.y = wrapY(s.pos.y + s.vel.y * dt)
          s.life -= dt
          return s
        })
        .filter((s) => s.life > 0)

      // Base shots hit rocks (processing). Only affects rocks, not the ship.
      if (baseShotsRef.current.length > 0 && rocksRef.current.length > 0) {
        const shots = baseShotsRef.current
        const rocks2 = rocksRef.current
        for (let si = shots.length - 1; si >= 0; si--) {
          const sh = shots[si]
          for (let ai = rocks2.length - 1; ai >= 0; ai--) {
            const a = rocks2[ai]
            const d = toroidalDelta(sh.pos.x, sh.pos.y, a.pos.x, a.pos.y, w, h)
            if (Math.hypot(d.dx, d.dy) <= a.radius + 2) {
              // Process rock on hit.
              shots.splice(si, 1)
              rocks2.splice(ai, 1)
              setScore((s) => s + 700 + Math.max(0, Math.round((60 - a.radius) * 10)))
              createDebris(wrapX(a.pos.x), wrapY(a.pos.y), 0, 0, 12, 0.8, '0, 255, 136')
              sounds.collect()
              break
            }
          }
        }
      }
        collideWithWalls(ship.pos, ship.vel, ship.radius, 0.55, (impact) => applyImpactDamage(impact))
        {
          const d = toroidalDelta(baseX, baseY, ship.pos.x, ship.pos.y, w, h)
          const fullyInside = circleFullyInHex(d.dx, d.dy, ship.radius)
          if (!fullyInside) {
            shipRepairTimeRef.current = 0
          } else {
            shipRepairTimeRef.current += dt
            if (shipRepairTimeRef.current >= 2) {
              shipRepairTimeRef.current = 2
              setDamage((dmg) => (dmg === 0 ? dmg : 0))
              if (invulnerableRef.current < 120) invulnerableRef.current = 120
            }
          }
        }
      }

      // Harpoon update (wrap-aware)
      const hp0 = harpoonRef.current
      if (hp0.state === 'flying') {
        hp0.pos.x = wrapX(hp0.pos.x + hp0.vel.x * dt)
        hp0.pos.y = wrapY(hp0.pos.y + hp0.vel.y * dt)
        hp0.life -= dt * 1000

        // Enforce the cable max length (tension-only) with hook mass.
        // Treat the hook like a tiny rock: tension affects both ship and hook.
        {
          const sh = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
          const shDist = Math.hypot(sh.dx, sh.dy)
          if (shDist > hp0.maxLength && shDist > 1e-6) {
            const nx = sh.dx / shDist
            const ny = sh.dy / shDist

            const invShip = 1
            const invHook = 1 / HARPOON_HOOK_MASS
            const invSum = invShip + invHook

            const err = shDist - hp0.maxLength
            const maxCorr = 140
            const corr = Math.min(err, maxCorr)

            ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
            ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
            hp0.pos.x = wrapX(hp0.pos.x - nx * (corr * (invHook / invSum)))
            hp0.pos.y = wrapY(hp0.pos.y - ny * (corr * (invHook / invSum)))

            const relVx = hp0.vel.x - ship.vel.x
            const relVy = hp0.vel.y - ship.vel.y
            const relAlong = relVx * nx + relVy * ny
            if (relAlong > 0) {
              const j = (-relAlong * 0.9) / invSum
              ship.vel.x -= j * nx * invShip
              ship.vel.y -= j * ny * invShip
              hp0.vel.x += j * nx * invHook
              hp0.vel.y += j * ny * invHook
            }
          }
        }

        // When it reaches full extension without latching, leave it deployed until the player reels it in.
        const sh2 = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
        const sh2Dist = Math.hypot(sh2.dx, sh2.dy)

        // Rope simulation for rendering (slack/curve) while unattached.
        // Endpoints are ship + hook; this is visual-only.
        {
          const rope = hp0.rope
          const ropePrev = hp0.ropePrev
          const segLen = hp0.segLen

          const damp = 0.992
          const dt2 = dt * dt

          for (let i = 0; i < rope.length; i++) {
            const p = rope[i]
            const pp = ropePrev[i]
            const vx = (p.x - pp.x) * damp
            const vy = (p.y - pp.y) * damp
            ropePrev[i] = { x: p.x, y: p.y }
            // No gravity in space; curvature comes from inertia + slack.
            rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy + 0 * dt2) }
          }

          const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
            const d = toroidalDelta(ax, ay, bx, by, w, h)
            const dLen = Math.hypot(d.dx, d.dy)
            if (dLen < 1e-6) return { cx: 0, cy: 0 }
            const diff = (dLen - target) / dLen
            return { cx: d.dx * diff, cy: d.dy * diff }
          }

          const iterations = 9
          for (let it = 0; it < iterations; it++) {
            // ship -> first
            if (rope.length > 0) {
              const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
              rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
            }
            // internal
            for (let i = 0; i < rope.length - 1; i++) {
              const p0 = rope[i]
              const p1 = rope[i + 1]
              const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
              rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
              rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
            }
            // last -> hook
            if (rope.length > 0) {
              const last = rope[rope.length - 1]
              const c = solvePair(last.x, last.y, hp0.pos.x, hp0.pos.y, segLen)
              rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
            }
          }
        }

        hp0.traveled += Math.hypot(hp0.vel.x, hp0.vel.y) * dt

        if (hp0.life <= 0) {
          harpoonRef.current = {
            state: 'deployed',
            pos: { x: hp0.pos.x, y: hp0.pos.y },
            vel: { x: 0, y: 0 },
            maxLength: hp0.maxLength,
            ropeLength: hp0.ropeLength,
            segLen: hp0.segLen,
            rope: hp0.rope,
            ropePrev: hp0.ropePrev,
          }
        } else {
          // Try to latch onto a rock.
          for (let i = 0; i < rocks.length; i++) {
            const a = rocks[i]
            const { dx, dy } = toroidalDelta(hp0.pos.x, hp0.pos.y, a.pos.x, a.pos.y, w, h)
            const dist = Math.hypot(dx, dy)
            if (dist < a.radius) {
              // Fixed-length cable: latch uses the full cable length.
              const ropeLen = hp0.maxLength

              // Build a segmented rope for slack visuals.
              const segments = Math.max(18, Math.min(60, Math.ceil(ropeLen / 22)))
              const segLen = ropeLen / segments
              const ship0 = shipRef.current
              const d2 = toroidalDelta(ship0.pos.x, ship0.pos.y, a.pos.x, a.pos.y, w, h)
              const rope: Vector2[] = []
              const ropePrev: Vector2[] = []
              for (let k = 1; k < segments; k++) {
                const t = k / segments
                const px = wrapX(ship0.pos.x + d2.dx * t)
                const py = wrapY(ship0.pos.y + d2.dy * t)
                rope.push({ x: px, y: py })
                ropePrev.push({ x: px, y: py })
              }

              harpoonRef.current = {
                state: 'attached',
                rock: a,
                ropeLength: ropeLen,
                maxLength: hp0.maxLength,
                segLen,
                rope,
                ropePrev,
              }
              break
            }
          }

          // If not attached and fully extended, switch to deployed.
          if (harpoonRef.current === hp0 && sh2Dist >= hp0.maxLength - 0.5) {
            harpoonRef.current = {
              state: 'deployed',
              pos: { x: hp0.pos.x, y: hp0.pos.y },
              vel: { x: 0, y: 0 },
              maxLength: hp0.maxLength,
              ropeLength: hp0.ropeLength,
              segLen: hp0.segLen,
              rope: hp0.rope,
              ropePrev: hp0.ropePrev,
            }
          }
        }
      } else if (hp0.state === 'deployed') {
        // Hook is left out in space until the player reels it in.
        hp0.pos.x = wrapX(hp0.pos.x + hp0.vel.x * dt)
        hp0.pos.y = wrapY(hp0.pos.y + hp0.vel.y * dt)

        // Mild damping for stability (feels like a small object with some drag).
        hp0.vel.x *= 0.996
        hp0.vel.y *= 0.996

        // Enforce the cable max length (tension-only) with hook mass.
        {
          const sh = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
          const shDist = Math.hypot(sh.dx, sh.dy)
          if (shDist > hp0.maxLength && shDist > 1e-6) {
            const nx = sh.dx / shDist
            const ny = sh.dy / shDist

            const invShip = 1
            const invHook = 1 / HARPOON_HOOK_MASS
            const invSum = invShip + invHook

            const err = shDist - hp0.maxLength
            const maxCorr = 140
            const corr = Math.min(err, maxCorr)

            ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
            ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
            hp0.pos.x = wrapX(hp0.pos.x - nx * (corr * (invHook / invSum)))
            hp0.pos.y = wrapY(hp0.pos.y - ny * (corr * (invHook / invSum)))

            const relVx = hp0.vel.x - ship.vel.x
            const relVy = hp0.vel.y - ship.vel.y
            const relAlong = relVx * nx + relVy * ny
            if (relAlong > 0) {
              const j = (-relAlong * 0.9) / invSum
              ship.vel.x -= j * nx * invShip
              ship.vel.y -= j * ny * invShip
              hp0.vel.x += j * nx * invHook
              hp0.vel.y += j * ny * invHook
            }
          }
        }

        // If it touches a rock later, it should still latch.
        for (let i = 0; i < rocks.length; i++) {
          const a = rocks[i]
          const { dx, dy } = toroidalDelta(hp0.pos.x, hp0.pos.y, a.pos.x, a.pos.y, w, h)
          const dist = Math.hypot(dx, dy)
          if (dist < a.radius) {
            const ropeLen = hp0.maxLength
            const segments = Math.max(18, Math.min(60, Math.ceil(ropeLen / 22)))
            const segLen = ropeLen / segments
            const d2 = toroidalDelta(ship.pos.x, ship.pos.y, a.pos.x, a.pos.y, w, h)
            const rope: Vector2[] = []
            const ropePrev: Vector2[] = []
            for (let k = 1; k < segments; k++) {
              const t = k / segments
              const px = wrapX(ship.pos.x + d2.dx * t)
              const py = wrapY(ship.pos.y + d2.dy * t)
              rope.push({ x: px, y: py })
              ropePrev.push({ x: px, y: py })
            }
            harpoonRef.current = {
              state: 'attached',
              rock: a,
              ropeLength: ropeLen,
              maxLength: hp0.maxLength,
              segLen,
              rope,
              ropePrev,
            }
            break
          }
        }

        // Rope simulation for rendering (slack/curve).
        {
          const rope = hp0.rope
          const ropePrev = hp0.ropePrev
          const segLen = hp0.segLen

          const damp = 0.992
          const dt2 = dt * dt
          for (let i = 0; i < rope.length; i++) {
            const p = rope[i]
            const pp = ropePrev[i]
            const vx = (p.x - pp.x) * damp
            const vy = (p.y - pp.y) * damp
            ropePrev[i] = { x: p.x, y: p.y }
            rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy + 0 * dt2) }
          }

          const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
            const d = toroidalDelta(ax, ay, bx, by, w, h)
            const dLen = Math.hypot(d.dx, d.dy)
            if (dLen < 1e-6) return { cx: 0, cy: 0 }
            const diff = (dLen - target) / dLen
            return { cx: d.dx * diff, cy: d.dy * diff }
          }

          const iterations = 9
          for (let it = 0; it < iterations; it++) {
            if (rope.length > 0) {
              const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
              rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
            }
            for (let i = 0; i < rope.length - 1; i++) {
              const p0 = rope[i]
              const p1 = rope[i + 1]
              const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
              rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
              rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
            }
            if (rope.length > 0) {
              const last = rope[rope.length - 1]
              const c = solvePair(last.x, last.y, hp0.pos.x, hp0.pos.y, segLen)
              rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
            }
          }
        }
      } else if (hp0.state === 'attached') {
        // If the rock got destroyed/split, drop the harpoon.
        if (!rocks.includes(hp0.rock)) {
          const ropeLength = hp0.maxLength * HARPOON_VISUAL_SLACK
          const seed = buildRopeBetween(ship.pos.x, ship.pos.y, hp0.rock.pos.x, hp0.rock.pos.y, ropeLength)
          harpoonRef.current = {
            state: 'deployed',
            pos: { x: hp0.rock.pos.x, y: hp0.rock.pos.y },
            vel: { x: 0, y: 0 },
            maxLength: hp0.maxLength,
            ropeLength,
            segLen: seed.segLen,
            rope: seed.rope,
            ropePrev: seed.ropePrev,
          }
        } else {
          const rock = hp0.rock
          const { dx, dy } = toroidalDelta(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, w, h)
          const dist = Math.hypot(dx, dy)
          const L = hp0.ropeLength

          // Physics: tension-only cable.
          // Only enforce when stretched (dist > L). If compressed, it goes slack (no pushing).
          if (dist > L && dist > 1e-6) {
            const nx = dx / dist
            const ny = dy / dist

            // Mass: larger rock = heavier. Ship is always light.
            const invShip = 1
            const mRock = Math.max(1, (rock.radius / 18) * (rock.radius / 18))
            const invRock = 1 / mRock
            const invSum = invShip + invRock

            // Position correction to remove stretch.
            const err = dist - L
            const maxCorr = 140
            const corr = Math.min(err, maxCorr)

            ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
            ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
            rock.pos.x = wrapX(rock.pos.x - nx * (corr * (invRock / invSum)))
            rock.pos.y = wrapY(rock.pos.y - ny * (corr * (invRock / invSum)))

            // Velocity correction: only remove separating motion (keeps it from "rubber banding").
            const relVx = rock.vel.x - ship.vel.x
            const relVy = rock.vel.y - ship.vel.y
            const relAlong = relVx * nx + relVy * ny
            if (relAlong > 0) {
              const j = (-relAlong * 0.9) / invSum
              ship.vel.x -= j * nx * invShip
              ship.vel.y -= j * ny * invShip
              rock.vel.x += j * nx * invRock
              rock.vel.y += j * ny * invRock
            }
          }

          // Rope simulation for rendering (slack/curve).
          // Endpoints are fixed at ship/rock positions so slack doesn't push them.
          const rope = hp0.rope
          const ropePrev = hp0.ropePrev
          const segLen = hp0.segLen

          // Verlet integrate internal rope points.
          const damp = 0.992
          for (let i = 0; i < rope.length; i++) {
            const p = rope[i]
            const pp = ropePrev[i]
            const vx = (p.x - pp.x) * damp
            const vy = (p.y - pp.y) * damp
            ropePrev[i] = { x: p.x, y: p.y }
            rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy) }
          }

          const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
            const d = toroidalDelta(ax, ay, bx, by, w, h)
            const dLen = Math.hypot(d.dx, d.dy)
            if (dLen < 1e-6) return { cx: 0, cy: 0 }
            const diff = (dLen - target) / dLen
            return { cx: d.dx * diff, cy: d.dy * diff }
          }

          // Iterative constraint solve (PBD): keep each segment at segLen.
          const iterations = 10
          for (let it = 0; it < iterations; it++) {
            // Segment: ship -> first
            if (rope.length > 0) {
              const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
              rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
            }

            // Internal segments
            for (let i = 0; i < rope.length - 1; i++) {
              const p0 = rope[i]
              const p1 = rope[i + 1]
              const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
              rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
              rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
            }

            // Segment: last -> rock
            if (rope.length > 0) {
              const last = rope[rope.length - 1]
              const c = solvePair(last.x, last.y, rock.pos.x, rock.pos.y, segLen)
              rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
            }
          }
        }
      } else if (hp0.state === 'reeling') {
        // Winch behavior: cable length shrinks and tension pulls the hook in.
        hp0.reelLength = Math.max(HARPOON_REEL_MIN_LEN, hp0.reelLength - hp0.reelSpeed * dt)
        hp0.ropeLength = hp0.reelLength * HARPOON_VISUAL_SLACK

        const targetSegLen = hp0.ropeLength / Math.max(1, hp0.rope.length + 1)

        const d = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
        const dist = Math.hypot(d.dx, d.dy)
        if (dist > 1e-6 && dist > hp0.reelLength) {
          const nx = d.dx / dist
          const ny = d.dy / dist

          // Bias so the ship doesn't get dragged as much by the winch.
          const invShip = 0.35
          const invHook = 1 / HARPOON_HOOK_MASS
          const invSum = invShip + invHook

          const err = dist - hp0.reelLength
          const maxCorr = 220
          const corr = Math.min(err, maxCorr)

          ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
          ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
          hp0.pos.x = wrapX(hp0.pos.x - nx * (corr * (invHook / invSum)))
          hp0.pos.y = wrapY(hp0.pos.y - ny * (corr * (invHook / invSum)))

          // Reeling state doesn't store velocity; position solve is sufficient and avoids "hook flies into ship" snaps.
        }

        // Finished: once the cable is fully in, drop to idle.
        const d2 = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
        const dist2 = Math.hypot(d2.dx, d2.dy)
        if (hp0.reelLength <= HARPOON_REEL_MIN_LEN + 0.5 && dist2 <= HARPOON_REEL_MIN_LEN + 6) {
          harpoonRef.current = { state: 'idle' }
        }

        // Rope simulation for rendering while reeling.
        {
          const rope = hp0.rope
          const ropePrev = hp0.ropePrev
          const segLen = targetSegLen

          const damp = 0.992
          const dt2 = dt * dt
          for (let i = 0; i < rope.length; i++) {
            const p = rope[i]
            const pp = ropePrev[i]
            const vx = (p.x - pp.x) * damp
            const vy = (p.y - pp.y) * damp
            ropePrev[i] = { x: p.x, y: p.y }
            rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy + 0 * dt2) }
          }

          const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
            const dd = toroidalDelta(ax, ay, bx, by, w, h)
            const dLen = Math.hypot(dd.dx, dd.dy)
            if (dLen < 1e-6) return { cx: 0, cy: 0 }
            const diff = (dLen - target) / dLen
            return { cx: dd.dx * diff, cy: dd.dy * diff }
          }

          const iterations = 9
          for (let it = 0; it < iterations; it++) {
            if (rope.length > 0) {
              const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
              rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
            }
            for (let i = 0; i < rope.length - 1; i++) {
              const p0 = rope[i]
              const p1 = rope[i + 1]
              const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
              rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
              rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
            }
            if (rope.length > 0) {
              const last = rope[rope.length - 1]
              const c = solvePair(last.x, last.y, hp0.pos.x, hp0.pos.y, segLen)
              rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
            }
          }
        }
      }

      for (let i = 0; i < rocks.length; i++) {
        const a = rocks[i]
        for (let j = i + 1; j < rocks.length; j++) {
          const b = rocks[j]

          // Shortest vector under wrapping.
          let dx = a.pos.x - b.pos.x
          let dy = a.pos.y - b.pos.y
          if (dx > w / 2) dx -= w
          else if (dx < -w / 2) dx += w
          if (dy > h / 2) dy -= h
          else if (dy < -h / 2) dy += h

          const rSum = a.radius + b.radius
          const dist2 = dx * dx + dy * dy
          if (dist2 >= rSum * rSum) continue

          const dist = Math.sqrt(Math.max(1e-8, dist2))
          const nx = dx / dist
          const ny = dy / dist
          const penetration = rSum - dist

          // Mass proportional to area.
          const mA = a.radius * a.radius
          const mB = b.radius * b.radius
          const invA = 1 / mA
          const invB = 1 / mB
          const invSum = invA + invB

          // Positional correction to resolve overlap.
          const moveA = penetration * (invA / invSum)
          const moveB = penetration * (invB / invSum)
          a.pos.x = wrapX(a.pos.x + nx * moveA)
          a.pos.y = wrapY(a.pos.y + ny * moveA)
          b.pos.x = wrapX(b.pos.x - nx * moveB)
          b.pos.y = wrapY(b.pos.y - ny * moveB)

          // Elastic impulse along normal.
          const rvx = a.vel.x - b.vel.x
          const rvy = a.vel.y - b.vel.y
          const velAlongNormal = rvx * nx + rvy * ny
          if (velAlongNormal > 0) continue

          const jImpulse = (-(1 + restitution) * velAlongNormal) / invSum
          const impX = jImpulse * nx
          const impY = jImpulse * ny
          a.vel.x += impX * invA
          a.vel.y += impY * invA
          b.vel.x -= impX * invB
          b.vel.y -= impY * invB
        }
      }

      // Update bullets with wrapping
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        bullet.pos.x += bullet.vel.x * dt
        bullet.pos.y += bullet.vel.y * dt
        bullet.life -= dt * 1000

        if (bullet.pos.x > w) bullet.pos.x = 0
        if (bullet.pos.x < 0) bullet.pos.x = w
        if (bullet.pos.y > h) bullet.pos.y = 0
        if (bullet.pos.y < 0) bullet.pos.y = h

        return bullet.life > 0
      })

      // Collision detection: player bullets vs boss/rocks
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        if (bullet.isEnemy) return true

        for (let i = 0; i < rocksRef.current.length; i++) {
          const rock = rocksRef.current[i]
          const d = toroidalDelta(bullet.pos.x, bullet.pos.y, rock.pos.x, rock.pos.y, w, h)
          const dist = Math.hypot(d.dx, d.dy)
          if (dist <= rock.radius + 2) {
            if (rock.kind === 'blue') {
              // Blue smallest rocks cannot be destroyed by ship bullets.
              // Impacts transfer momentum (push) and consume the bullet.
              const bv = Math.hypot(bullet.vel.x, bullet.vel.y)
              if (bv > 1e-6) {
                const ux = bullet.vel.x / bv
                const uy = bullet.vel.y / bv
                const push = 170
                rock.vel.x += ux * push
                rock.vel.y += uy * push
              }
              return false
            }

            // If harpoon was attached to this rock, release it.
            const hp = harpoonRef.current
            if (hp.state === 'attached' && hp.rock === rock) {
              const ship = shipRef.current
              const ropeLength = hp.maxLength * HARPOON_VISUAL_SLACK
              const seed = buildRopeBetween(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, ropeLength)
              harpoonRef.current = {
                state: 'deployed',
                pos: { x: rock.pos.x, y: rock.pos.y },
                vel: { x: 0, y: 0 },
                maxLength: hp.maxLength,
                ropeLength,
                segLen: seed.segLen,
                rope: seed.rope,
                ropePrev: seed.ropePrev,
              }
            }
            rocksRef.current.splice(i, 1)
            setScore((s) => s + Math.floor(100 / rock.radius))

            // Play explosion sound based on size
            const explosionSize = rock.radius > 35 ? 'large' : rock.radius > 20 ? 'medium' : 'small'
            sounds.explosion(explosionSize)

            // Split rock or create debris for smallest ones
            if (rock.radius > SMALLEST_ROCK_RADIUS) {
              const newRadius = rock.radius / 2
              for (let j = 0; j < 2; j++) {
                let kind: RockKind = 'normal'
                if (newRadius <= SMALLEST_ROCK_RADIUS) {
                  if (blueRocksSpawnedThisLevelRef.current < blueRockQuotaRef.current) {
                    kind = 'blue'
                    blueRocksSpawnedThisLevelRef.current += 1
                  } else {
                    const p = clamp(0.12 + (levelRef.current - 1) * 0.015, 0.12, 0.3)
                    if (Math.random() < p) {
                      kind = 'blue'
                      blueRocksSpawnedThisLevelRef.current += 1
                    }
                  }
                }

                rocksRef.current.push(createRock(rock.pos.x, rock.pos.y, newRadius, undefined, kind))
              }
            } else {
              // Smallest rock destroyed - create particle debris
              createDebris(rock.pos.x, rock.pos.y, rock.vel.x, rock.vel.y, 5, 0.5, '255, 255, 255')
            }
            return false
          }
        }
        return true
      })

      // Collision detection: ship vs rocks (bounce + damage based on impact speed)
      {
        const shipMass = 1
        for (let i = 0; i < rocksRef.current.length; i++) {
          const rock = rocksRef.current[i]
          const d = toroidalDelta(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, w, h)
          const dist = Math.hypot(d.dx, d.dy)
          const minDist = ship.radius + rock.radius
          if (dist >= minDist || dist < 1e-6) continue

          const nx = d.dx / dist
          const ny = d.dy / dist
          const penetration = minDist - dist

          const rockMass = Math.max(0.25, (rock.radius / 18) * (rock.radius / 18))
          const invShip = 1 / shipMass
          const invRock = 1 / rockMass
          const invSum = invShip + invRock

          ship.pos.x = wrapX(ship.pos.x - nx * (penetration * (invShip / invSum)))
          ship.pos.y = wrapY(ship.pos.y - ny * (penetration * (invShip / invSum)))
          rock.pos.x = wrapX(rock.pos.x + nx * (penetration * (invRock / invSum)))
          rock.pos.y = wrapY(rock.pos.y + ny * (penetration * (invRock / invSum)))

          const relVx = rock.vel.x - ship.vel.x
          const relVy = rock.vel.y - ship.vel.y
          const relAlong = relVx * nx + relVy * ny
          if (relAlong < 0) {
            applyImpactDamage(Math.hypot(ship.vel.x - rock.vel.x, ship.vel.y - rock.vel.y))
            const e = 0.55
            const j = (-(1 + e) * relAlong) / invSum
            ship.vel.x -= j * nx * invShip
            ship.vel.y -= j * ny * invShip
            rock.vel.x += j * nx * invRock
            rock.vel.y += j * ny * invRock
          }
        }
      }

      // Check if all rocks destroyed
      if (rocksRef.current.length === 0 && gameState === 'playing' && !levelingUpRef.current) {
        levelingUpRef.current = true
        setLevel((l) => {
          const newLevel = l + 1
          setTimeout(() => {
            resetBlueRocksForLevel(newLevel)
            spawnRocks(rockCountForLevel(newLevel), 100, speedMultForLevel(newLevel))
            invulnerableRef.current = 2000
            levelingUpRef.current = false
          }, 500)
          return newLevel
        })
      }
    }

    const draw = () => {
      const width = canvas.width
      const height = canvas.height

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Subtle scanline haze (shared retro background feel)
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // Draw mining base (center) behind rocks.
      {
        const cx = width / 2
        const cy = height / 2
        const R = MINING_BASE_RADIUS

        const baseAng = miningBaseAngleRef.current

        const poly = (r: number, n: number, rot: number) => {
          const pts: Vector2[] = []
          for (let i = 0; i < n; i++) {
            const a = rot + (i / n) * Math.PI * 2
            pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
          }
          return pts
        }

        ctx.save()
        ctx.lineWidth = 3
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'

        // Flat-topped hex (flats north/south).
        const doorCorners = new Set([1, 3, 5])

        const drawHexWithDoorGaps = (verts: Vector2[]) => {
          const segs: Array<{ ax: number; ay: number; bx: number; by: number; edge: number }> = []
          for (let i = 0; i < 6; i++) {
            const a0 = verts[i]
            const b0 = verts[(i + 1) % 6]
            const ex = b0.x - a0.x
            const ey = b0.y - a0.y
            const len = Math.hypot(ex, ey)
            if (len < 1e-6) continue
            const startT = doorCorners.has(i) ? MINING_DOOR_TRIM / len : 0
            const endT = doorCorners.has((i + 1) % 6) ? 1 - MINING_DOOR_TRIM / len : 1
            if (startT >= endT - 1e-6) continue
            const ax = a0.x + ex * startT
            const ay = a0.y + ey * startT
            const bx = a0.x + ex * endT
            const by = a0.y + ey * endT

            ctx.beginPath()
            ctx.moveTo(ax, ay)
            ctx.lineTo(bx, by)
            ctx.stroke()

            segs.push({ ax, ay, bx, by, edge: i })
          }

          return segs
        }

        const outer = poly(R, 6, baseAng)
        const outerSegs = drawHexWithDoorGaps(outer)

        // Extend short lines inward from segment endpoints (about 1/5 to center).
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 1.6
        for (const s of outerSegs) {
          const ax2 = s.ax + (cx - s.ax) * 0.2
          const ay2 = s.ay + (cy - s.ay) * 0.2
          const bx2 = s.bx + (cx - s.bx) * 0.2
          const by2 = s.by + (cy - s.by) * 0.2

          // Second interior layer: same construction off the interior segment, but shorter.
          const innerFrac = 0.12
          const ax3 = ax2 + (cx - ax2) * innerFrac
          const ay3 = ay2 + (cy - ay2) * innerFrac
          const bx3 = bx2 + (cx - bx2) * innerFrac
          const by3 = by2 + (cy - by2) * innerFrac

          // Third interior layer: repeat again, even shorter.
          const innerFrac2 = 0.08
          const ax4 = ax3 + (cx - ax3) * innerFrac2
          const ay4 = ay3 + (cy - ay3) * innerFrac2
          const bx4 = bx3 + (cx - bx3) * innerFrac2
          const by4 = by3 + (cy - by3) * innerFrac2

          // Inward extensions.
          ctx.beginPath()
          ctx.moveTo(s.ax, s.ay)
          ctx.lineTo(ax2, ay2)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(s.bx, s.by)
          ctx.lineTo(bx2, by2)
          ctx.stroke()

          // Connect the inner endpoints; this stays parallel to the outer segment.
          ctx.beginPath()
          ctx.moveTo(ax2, ay2)
          ctx.lineTo(bx2, by2)
          ctx.stroke()

          // Repeat from the interior segment ends toward center (shorter), then connect.
          ctx.save()
          ctx.globalAlpha = 0.42
          ctx.lineWidth = 1.2

          ctx.beginPath()
          ctx.moveTo(ax2, ay2)
          ctx.lineTo(ax3, ay3)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(bx2, by2)
          ctx.lineTo(bx3, by3)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(ax3, ay3)
          ctx.lineTo(bx3, by3)
          ctx.stroke()

          ctx.restore()

          // Repeat one more time from the second interior segment.
          ctx.save()
          ctx.globalAlpha = 0.32
          ctx.lineWidth = 1

          ctx.beginPath()
          ctx.moveTo(ax3, ay3)
          ctx.lineTo(ax4, ay4)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(bx3, by3)
          ctx.lineTo(bx4, by4)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(ax4, ay4)
          ctx.lineTo(bx4, by4)
          ctx.stroke()

          ctx.restore()

          // Manufactured micro-brace motif: one per arm, mirrored on the adjacent panel.
          // Arms correspond to the three solid corners (edges 0,2,4). Mirror on neighbors (1,3,5).
          const isArmPanel = s.edge === 0 || s.edge === 2 || s.edge === 4
          const isNeighborPanel = s.edge === 1 || s.edge === 3 || s.edge === 5
          if (isArmPanel || isNeighborPanel) {
            const sx = s.bx - s.ax
            const sy = s.by - s.ay
            const sl = Math.hypot(sx, sy)
            if (sl > 1e-6) {
              const tx = sx / sl
              const ty = sy / sl

              const alongSign = isArmPanel ? 1 : -1
              const t = isArmPanel ? 0.42 : 0.58
              const inset = 8
              const p0x = s.ax + sx * t
              const p0y = s.ay + sy * t
              const rx0 = cx - p0x
              const ry0 = cy - p0y
              const rl = Math.hypot(rx0, ry0)
              if (rl < 1e-6) continue
              const rx = rx0 / rl
              const ry = ry0 / rl

              const px = p0x + rx * inset
              const py = p0y + ry * inset

              // Find the closest intersection between a ray and a set of segments.
              const raySegHitT = (
                ox: number,
                oy: number,
                dx: number,
                dy: number,
                ax: number,
                ay: number,
                bx: number,
                by: number,
              ) => {
                const sx2 = bx - ax
                const sy2 = by - ay
                const denom = dx * sy2 - dy * sx2
                if (Math.abs(denom) < 1e-6) return null
                const qpx = ax - ox
                const qpy = ay - oy
                const tRay = (qpx * sy2 - qpy * sx2) / denom
                const uSeg = (qpx * dy - qpy * dx) / denom
                if (tRay > 1e-3 && uSeg >= 0 && uSeg <= 1) return tRay
                return null
              }

              const rayHitNth = (
                ox: number,
                oy: number,
                dx: number,
                dy: number,
                segs: Array<[number, number, number, number]>,
                n: number,
              ) => {
                const hits: number[] = []
                for (const seg of segs) {
                  const tHit = raySegHitT(ox, oy, dx, dy, seg[0], seg[1], seg[2], seg[3])
                  if (tHit == null) continue
                  hits.push(tHit)
                }
                if (hits.length === 0) return null
                hits.sort((a, b) => a - b)
                return hits[Math.min(n, hits.length - 1)]
              }

              ctx.save()
              ctx.globalAlpha = 0.45
              ctx.lineWidth = 1.3

              // Extend the tangent leg until it meets the nearest inward stub on that side.
              const tdx = tx * alongSign
              const tdy = ty * alongSign
              const useB = alongSign > 0
              const tangentTargets: Array<[number, number, number, number]> = useB
                ? [
                    [s.bx, s.by, bx2, by2],
                    [bx2, by2, bx3, by3],
                    [bx3, by3, bx4, by4],
                  ]
                : [
                    [s.ax, s.ay, ax2, ay2],
                    [ax2, ay2, ax3, ay3],
                    [ax3, ay3, ax4, ay4],
                  ]
              const alongT = rayHitNth(px, py, tdx, tdy, tangentTargets, 1)

              // Extend the radial leg until it meets the nearest inner parallel segment.
              const radialTargets: Array<[number, number, number, number]> = [
                [ax2, ay2, bx2, by2],
                [ax3, ay3, bx3, by3],
                [ax4, ay4, bx4, by4],
              ]
              const upT = rayHitNth(px, py, rx, ry, radialTargets, 1)

              const along = (alongT ?? 10) * 0.98
              const up = (upT ?? 7) * 0.98
              ctx.beginPath()
              ctx.moveTo(px, py)
              ctx.lineTo(px + tdx * along, py + tdy * along)
              ctx.stroke()

              ctx.beginPath()
              ctx.moveTo(px, py)
              ctx.lineTo(px + rx * up, py + ry * up)
              ctx.stroke()

              ctx.restore()
            }
          }
        }
        ctx.restore()

        ctx.restore()

        // Draw base guns as simple dots (no extra geometry).
        {
          const gunRadius = MINING_BASE_RADIUS * 0.63
          const gunAngles = [baseAng + 0, baseAng + (2 * Math.PI) / 3, baseAng + (4 * Math.PI) / 3]
          ctx.save()
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          for (let gi = 0; gi < 3; gi++) {
            const gx = cx + Math.cos(gunAngles[gi]) * gunRadius
            const gy = cy + Math.sin(gunAngles[gi]) * gunRadius
            ctx.beginPath()
            ctx.arc(gx, gy, 2.2, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        }
      }

      // Draw base shots (thin, bright).
      if (baseShotsRef.current.length > 0) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 1.4
        for (const s of baseShotsRef.current) {
          const tx = s.pos.x - s.vel.x * 0.02
          const ty = s.pos.y - s.vel.y * 0.02
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(s.pos.x, s.pos.y)
          ctx.stroke()
        }
        ctx.restore()
      }

      // Draw rocks
      rocksRef.current.forEach((rock) => {
        const { verts, polys } = rock.mesh

        // Rotate vertices in all axes.
        const rx = rock.rot[0]
        const ry = rock.rot[1]
        const rz = rock.rot[2]

        const tVerts: V3[] = verts.map((v) => {
          let p = rotX(v, rx)
          p = rotY(p, ry)
          p = rotZ(p, rz)
          return p
        })

        // Simple perspective projection.
        const f = 260
        const proj = (p: V3): [number, number, number] => {
          const denom = Math.max(60, f + p[2])
          const s = f / denom
          return [p[0] * s, p[1] * s, p[2]]
        }

        // Pre-project all vertices once.
        const proj2 = tVerts.map((p) => {
          const pp = proj(p)
          return { x: pp[0], y: pp[1], z: pp[2] }
        })

        // Shaded face fill (front faces only), sorted back-to-front.
        const lightDir = normalize3(([0.25, -0.35, -1] as V3))
        const frontEps = 1e-4
        const faces2: Array<{ idxs: number[]; z: number; shade: number; n: V3; isFront: boolean; isBack: boolean }> = []
        for (const idxs of polys) {
          if (idxs.length < 3) continue
          const p0 = tVerts[idxs[0]]
          const p1 = tVerts[idxs[1]]
          const p2 = tVerts[idxs[2]]
          const u: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
          const v: V3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
          let n = normalize3(cross3(u, v))

          // Ensure outward-facing normals.
          let cx = 0
          let cy = 0
          let cz = 0
          for (const ii of idxs) {
            const p = tVerts[ii]
            cx += p[0]
            cy += p[1]
            cz += p[2]
          }
          cx /= idxs.length
          cy /= idxs.length
          cz /= idxs.length
          const outward = n[0] * cx + n[1] * cy + n[2] * cz
          if (outward < 0) n = ([-n[0], -n[1], -n[2]] as V3)

          // Camera looks along +Z toward the origin; visible faces point toward -Z.
          // Use an epsilon band to reduce edge-on flicker.
          const isFront = n[2] < -frontEps
          const isBack = n[2] > frontEps
          const ndotl = Math.max(0, n[0] * lightDir[0] + n[1] * lightDir[1] + n[2] * lightDir[2])
          const shade = 0.18 + ndotl * 0.82
          faces2.push({ idxs, z: cz, shade, n, isFront, isBack })
        }
        faces2.sort((a, b) => b.z - a.z)

        // Hidden-line rendering: dark silhouette outline + lighter interior crease lines.
        type EdgeAcc = {
          a: number
          b: number
          faceCount: number
          frontCount: number
          backCount: number
          n0?: V3
          n1?: V3
        }
        const edgeMap = new Map<string, EdgeAcc>()
        const keyOf = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`)

        // Build edge map from true polyhedron edges (avoids diagonal/triangulation artifacts).
        for (const f of faces2) {
          const idxs = f.idxs
          const isFront = f.isFront
          const isBack = f.isBack
          const n = f.n
          for (let i = 0; i < idxs.length; i++) {
            const u = idxs[i]
            const v = idxs[(i + 1) % idxs.length]
            const k = keyOf(u, v)
            const aIdx = Math.min(u, v)
            const bIdx = Math.max(u, v)
            const e =
              edgeMap.get(k) ||
              ({ a: aIdx, b: bIdx, faceCount: 0, frontCount: 0, backCount: 0 } as EdgeAcc)
            e.faceCount += 1
            if (isFront) e.frontCount += 1
            else if (isBack) e.backCount += 1
            if (!e.n0) e.n0 = n
            else if (!e.n1) e.n1 = n
            edgeMap.set(k, e)
          }
        }

        const isBlue = rock.kind === 'blue'

        ctx.save()
        ctx.translate(rock.pos.x, rock.pos.y)

        // Thin white outlines only (visible edges only).
        ctx.shadowBlur = isBlue ? 10 : 0
        ctx.shadowColor = isBlue ? 'rgba(40, 170, 255, 0.45)' : 'rgba(0, 0, 0, 0)'
        ctx.strokeStyle = isBlue ? 'rgba(40, 170, 255, 0.95)' : 'rgba(255,255,255,0.9)'
        ctx.lineWidth = 1.4
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()

        for (const e of edgeMap.values()) {
          const isBoundaryFront = e.faceCount === 1 && e.frontCount > 0
          const isSilhouette = e.frontCount > 0 && e.backCount > 0
          const isFrontEdge = e.faceCount === 2 && e.frontCount === 2
          if (!isBoundaryFront && !isSilhouette && !isFrontEdge) continue

          const pa = proj2[e.a]
          const pb = proj2[e.b]
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
        }

        ctx.stroke()
        ctx.restore()
      })


      // Draw bullets
      bulletsRef.current.forEach((bullet) => {
        ctx.fillStyle = bullet.isEnemy ? '#ff4444' : '#00ff88'
        ctx.beginPath()
        ctx.arc(bullet.pos.x, bullet.pos.y, 2, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw debris
      debrisRef.current.forEach((d) => {
        const alpha = d.life / 2000
        ctx.strokeStyle = `rgba(${d.color}, ${alpha})`
        ctx.lineWidth = 2
        ctx.save()
        ctx.translate(d.pos.x, d.pos.y)
        ctx.rotate(d.angle)
        ctx.beginPath()
        ctx.moveTo(-d.length / 2, 0)
        ctx.lineTo(d.length / 2, 0)
        ctx.stroke()
        ctx.restore()
      })

      // Draw harpoon + tether (wrap-aware)
      const hp = harpoonRef.current
      if (hp.state !== 'idle' && gameState === 'playing') {
        const { width: w2, height: h2 } = canvasSizeRef.current
        const ship = shipRef.current

        const drawToroidalLine = (ax: number, ay: number, bx: number, by: number) => {
          const dx = bx - ax
          const dy = by - ay
          let ox = 0
          let oy = 0
          if (dx > w2 / 2) ox = -w2
          else if (dx < -w2 / 2) ox = w2
          if (dy > h2 / 2) oy = -h2
          else if (dy < -h2 / 2) oy = h2

          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx + ox, by + oy)
          ctx.stroke()

          // If wrapping occurred, draw the complementary segment on the opposite edge.
          if (ox !== 0 || oy !== 0) {
            ctx.beginPath()
            ctx.moveTo(ax - ox, ay - oy)
            ctx.lineTo(bx, by)
            ctx.stroke()
          }
        }

        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1.6

        if (hp.state === 'attached') {
          // Draw segmented rope for attached state.
          const pts: Vector2[] = [ship.pos, ...hp.rope, hp.rock.pos]
          for (let i = 0; i < pts.length - 1; i++) {
            drawToroidalLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
          }

          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.beginPath()
          ctx.arc(hp.rock.pos.x, hp.rock.pos.y, 3, 0, Math.PI * 2)
          ctx.fill()
        } else {
          // Draw segmented rope for any unattached state (flying/deployed/reeling).
          const pts: Vector2[] = [ship.pos, ...hp.rope, hp.pos]
          for (let i = 0; i < pts.length - 1; i++) {
            drawToroidalLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
          }

          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.beginPath()
          ctx.arc(hp.pos.x, hp.pos.y, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Draw ship
      if (gameState === 'playing') {
        const ship = shipRef.current
        const isInvulnerable = invulnerableRef.current > 0

        // Healing halo: while fully inside the base and the 2s repair timer is counting.
        {
          const baseX = width / 2
          const baseY = height / 2
          const baseAng = miningBaseAngleRef.current
          const hexVerts: Vector2[] = Array.from({ length: 6 }, (_, i) => {
            const a = baseAng + (i / 6) * Math.PI * 2
            return { x: Math.cos(a) * MINING_BASE_RADIUS, y: Math.sin(a) * MINING_BASE_RADIUS }
          })

          const circleFullyInHexLocal = (px: number, py: number, radius: number) => {
            // Hex is CCW; inside is to the left of each directed edge.
            for (let i = 0; i < 6; i++) {
              const a = hexVerts[i]
              const b = hexVerts[(i + 1) % 6]
              const ex = b.x - a.x
              const ey = b.y - a.y
              const len = Math.hypot(ex, ey)
              if (len < 1e-6) continue
              // Left normal (points inward for CCW polygon)
              const nx = -ey / len
              const ny = ex / len
              const dist = (px - a.x) * nx + (py - a.y) * ny
              if (dist < radius) return false
            }
            return true
          }

          const d = toroidalDelta(baseX, baseY, ship.pos.x, ship.pos.y, width, height)
          const fullyInside = circleFullyInHexLocal(d.dx, d.dy, ship.radius)
          const isHealing = fullyInside && damage > 0 && shipRepairTimeRef.current > 0 && shipRepairTimeRef.current < 2

          if (isHealing) {
            const t = Date.now() / 1000
            const pulse = 0.5 + 0.5 * Math.sin(t * 5)
            const r1 = ship.radius + 10 + pulse * 6
            const r2 = ship.radius + 18 + pulse * 8

            ctx.save()
            ctx.globalAlpha = 0.85
            ctx.strokeStyle = `rgba(0,255,136,${0.22 + pulse * 0.18})`
            ctx.lineWidth = 3
            ctx.shadowColor = 'rgba(0,255,136,0.55)'
            ctx.shadowBlur = 18
            ctx.beginPath()
            ctx.arc(ship.pos.x, ship.pos.y, r1, 0, Math.PI * 2)
            ctx.stroke()

            ctx.shadowBlur = 0
            ctx.globalAlpha = 0.6
            ctx.strokeStyle = `rgba(0,255,136,${0.14 + pulse * 0.14})`
            ctx.lineWidth = 1.6
            ctx.beginPath()
            ctx.arc(ship.pos.x, ship.pos.y, r2, 0, Math.PI * 2)
            ctx.stroke()

            ctx.restore()
          }
        }

        ctx.save()
        ctx.translate(ship.pos.x, ship.pos.y)
        ctx.rotate(ship.angle)
          const s = ship.radius / 15

          // Damage color pattern (like Armor Assault): base color by damage, flash white while invulnerable.
          const baseColor = damage <= 0 ? '#ffffff' : damage === 1 ? '#ffaa00' : '#ff4444'
          const flashOn = isInvulnerable && Math.floor(invulnerableRef.current / 50) % 2 === 0
          const shipColor = flashOn ? '#ffffff' : baseColor

          // Neon outline + subtle glow
          ctx.strokeStyle = shipColor
          ctx.lineWidth = 2.4
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.shadowColor =
            shipColor === '#ffffff'
              ? 'rgba(255, 255, 255, 0.28)'
              : shipColor === '#ffaa00'
                ? 'rgba(255, 170, 0, 0.3)'
                : shipColor === '#ff4444'
                  ? 'rgba(255, 68, 68, 0.3)'
                  : 'rgba(255, 255, 255, 0.28)'
          ctx.shadowBlur = 8

          const noseX = 18 * s
          const midX = -1 * s
          const tailX = -18 * s
          const bodyHalf = 10 * s
          const podOutY = 9 * s
          const podRearY = 4.5 * s

          // Outer hull (inspired by the reference: wedge body + two rear pods)
          ctx.beginPath()
          ctx.moveTo(noseX, 0)
          ctx.lineTo(midX, -bodyHalf)
          ctx.lineTo(-10 * s, -podOutY)
          ctx.lineTo(tailX, -podRearY)
          ctx.lineTo(-9 * s, 0)
          ctx.lineTo(tailX, podRearY)
          ctx.lineTo(-10 * s, podOutY)
          ctx.lineTo(midX, bodyHalf)
          ctx.closePath()
          ctx.stroke()

          // Internal structure lines (kept sparse, confident)
          ctx.shadowBlur = 0
          ctx.globalAlpha = 0.9
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(noseX - 2 * s, 0)
          ctx.lineTo(-3 * s, -6.5 * s)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(noseX - 2 * s, 0)
          ctx.lineTo(-3 * s, 6.5 * s)
          ctx.stroke()

          // Pod panel ticks
          ctx.globalAlpha = 0.85
          ctx.lineWidth = 1.6
          for (const sign of [-1, 1]) {
            const px = -12.5 * s
            const py = sign * 6.2 * s
            ctx.beginPath()
            ctx.moveTo(px, py)
            ctx.lineTo(px + 3.2 * s, py)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(px, py + sign * 2.2 * s)
            ctx.lineTo(px + 2.2 * s, py + sign * 2.2 * s)
            ctx.stroke()
          }

          // Thrust flame: twin engines
          if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
            ctx.save()
            ctx.globalAlpha = 1
            ctx.strokeStyle = '#ff6600'
            ctx.shadowColor = 'rgba(255, 102, 0, 0.25)'
            ctx.shadowBlur = 6
            ctx.lineWidth = 2.6

            for (const sign of [-1, 1]) {
              const ex = tailX + 1.5 * s
              const ey = sign * 2.7 * s
              const flame = (8 + Math.random() * 7) * s
              const flare = 2.8 * s
              ctx.beginPath()
              ctx.moveTo(ex, ey - flare)
              ctx.lineTo(ex - flame, ey)
              ctx.lineTo(ex, ey + flare)
              ctx.stroke()
            }

            ctx.restore()
          }
          ctx.restore()
      }
    }

    const animate = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = timestamp

      update(dt)
      draw()

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [gameState, damage, createRock, createDebris, spawnRocks])

  const exitToGameSelect = () => {
    sounds.stopThrust()
    onExit()
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* HUD */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className="text-[#00ff88] space-y-1 text-sm tracking-wider uppercase">
            <div>Score {score.toString().padStart(6, '0')}</div>
            <div>Level {level}</div>
            <div className="flex items-center gap-2">
              <div>Damage</div>
              <div className="flex items-center gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-3 w-3 border border-[#00ff88] ${i < damage ? 'bg-[#00ff88]/40' : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] uppercase">Hard Vacuum</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Arrow Keys / WASD: Move & Rotate
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Space: Shoot
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> X: Harpoon (toggle reel)
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> P: Pause
              </div>
            </div>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={startGame}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  menuIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Start
              </button>
              <button
                onClick={exitToGameSelect}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  menuIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88]/50 text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
                }`}
              >
                Back
              </button>
            </div>
            <p className="text-[#00ff88]/50 text-xs text-center mt-4 tracking-wider">↑ ↓ to select • Enter to confirm • Esc to exit</p>
          </div>
        </div>
      )}

      {/* Paused */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h2 className="text-4xl text-[#00ff88] mb-4 tracking-[0.3em] uppercase">Paused</h2>
            <p className="text-[#00ff88]/70 text-center mb-6 tracking-wider">Press P to resume • Press Esc to exit</p>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={() => setGameState('playing')}
                className="w-64 px-8 py-3 border-2 border-[#00ff88] text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
              >
                Resume
              </button>
              <button
                onClick={exitToGameSelect}
                className="w-64 px-8 py-3 border-2 border-[#00ff88] text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h2 className="text-4xl text-[#ff4444] mb-2 tracking-[0.3em] uppercase">Game Over</h2>
            <div className="text-center mb-8">
              <div className="text-[#00ff88] text-2xl mb-2 tracking-wider">{score.toString().padStart(6, '0')}</div>
              <div className="text-[#00ff88]/70 tracking-wider uppercase">Level {level}</div>
            </div>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={startGame}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Play Again
              </button>
              <button
                onClick={() => setGameState('menu')}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88]/50 text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
                }`}
              >
                Main Menu
              </button>
              <button
                onClick={exitToGameSelect}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 2
                    ? 'border-[#ff4444] bg-[#ff4444] text-black'
                    : 'border-[#ff4444] text-[#ff4444] hover:bg-[#ff4444] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="text-[#00ff88]/50 text-xs text-center mt-4 tracking-wider">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}
    </div>
  )
}
