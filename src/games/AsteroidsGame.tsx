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

const makeAsteroidMesh = (radius: number, seed: number) => {
  // Regular icosahedron: 12 vertices, 20 triangular faces.
  // Add a small deterministic radial jitter per vertex to make each asteroid
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

interface Asteroid {
  pos: Vector2
  vel: Vector2
  radius: number
  points: Vector2[]
  rot: V3
  angVel: V3
  mesh: { verts: V3[]; polys: number[][] }
}

interface Bullet {
  pos: Vector2
  vel: Vector2
  life: number
  isEnemy?: boolean
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

type AsteroidsGameProps = {
  onExit: () => void
}

export function AsteroidsGame({ onExit }: AsteroidsGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const shipRef = useRef<Ship>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, radius: 15 })
  const asteroidsRef = useRef<Asteroid[]>([])
  const bulletsRef = useRef<Bullet[]>([])
  const debrisRef = useRef<Debris[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const animationFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const invulnerableRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const levelingUpRef = useRef(false)
  const respawnTimerRef = useRef(0)

  const createAsteroid = useCallback((x: number, y: number, radius: number, velOverride?: Vector2): Asteroid => {
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
    // Smaller asteroids tend to tumble faster.
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
      mesh: makeAsteroidMesh(radius, seed),
    }
  }, [])

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

  const spawnAsteroids = useCallback(
    (count: number, avoidRadius: number = 100) => {
      const newAsteroids: Asteroid[] = []
      const { width, height } = canvasSizeRef.current
      const ship = shipRef.current
      const edgeInset = 1.5

      const toroidalDistToShip = (x: number, y: number) => {
        const dxRaw = Math.abs(x - ship.pos.x)
        const dyRaw = Math.abs(y - ship.pos.y)
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
        const speed = 20 + Math.random() * 30
        const vel: Vector2 = { x: Math.cos(a) * speed, y: Math.sin(a) * speed }
        return { x, y, vel }
      }

      for (let i = 0; i < count; i++) {
        let chosen = sampleEdgeSpawn()
        for (let tries = 0; tries < 40; tries++) {
          const candidate = sampleEdgeSpawn()
          if (toroidalDistToShip(candidate.x, candidate.y) >= avoidRadius) {
            chosen = candidate
            break
          }
          // Keep the best candidate so far if we can't satisfy avoidRadius (e.g., ship hugging an edge).
          if (toroidalDistToShip(candidate.x, candidate.y) > toroidalDistToShip(chosen.x, chosen.y)) {
            chosen = candidate
          }
        }

        newAsteroids.push(createAsteroid(chosen.x, chosen.y, 30 + Math.random() * 15, chosen.vel))
      }
      asteroidsRef.current = [...asteroidsRef.current, ...newAsteroids]
    },
    [createAsteroid],
  )

  const startGame = useCallback(() => {
    sounds.init()
    const { width, height } = canvasSizeRef.current
    shipRef.current = { pos: { x: width / 2, y: height / 2 }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15 }
    asteroidsRef.current = []
    bulletsRef.current = []
    setScore(0)
    setLives(3)
    setLevel(1)
    setGameState('playing')
    invulnerableRef.current = 3000
    debrisRef.current = []
    levelingUpRef.current = false
    spawnAsteroids(2)
  }, [spawnAsteroids])

  const resetLevel = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    shipRef.current = { pos: { x: width / 2, y: height / 2 }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15 }
    bulletsRef.current = []
    invulnerableRef.current = 3000
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())
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
      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'playing') {
        setGameState('paused')
      } else if ((e.key === 'p' || e.key === 'Escape') && gameState === 'paused') {
        setGameState('playing')
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
      if (gameState !== 'playing') return

      const ship = shipRef.current

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

      // Update asteroids with wrapping
      const { width: w, height: h } = canvasSizeRef.current
      asteroidsRef.current.forEach((asteroid) => {
        asteroid.pos.x += asteroid.vel.x * dt
        asteroid.pos.y += asteroid.vel.y * dt

        // 3D tumbling
        asteroid.rot[0] += asteroid.angVel[0] * dt
        asteroid.rot[1] += asteroid.angVel[1] * dt
        asteroid.rot[2] += asteroid.angVel[2] * dt

        if (asteroid.pos.x > w) asteroid.pos.x = 0
        if (asteroid.pos.x < 0) asteroid.pos.x = w
        if (asteroid.pos.y > h) asteroid.pos.y = 0
        if (asteroid.pos.y < 0) asteroid.pos.y = h
      })

      // Asteroid-asteroid collisions (treat as circles in a wrapped/toroidal space)
      // This uses a simple impulse + positional correction so asteroids "bump" off each other.
      const asteroids = asteroidsRef.current
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

      for (let i = 0; i < asteroids.length; i++) {
        const a = asteroids[i]
        for (let j = i + 1; j < asteroids.length; j++) {
          const b = asteroids[j]

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

      // Update debris
      debrisRef.current = debrisRef.current.filter((d) => {
        d.pos.x += d.vel.x * dt
        d.pos.y += d.vel.y * dt
        d.angle += d.rotSpeed * dt
        d.life -= dt * 1000
        d.vel.x *= 0.99
        d.vel.y *= 0.99
        return d.life > 0
      })

      // Collision detection: player bullets vs boss/asteroids
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        if (bullet.isEnemy) return true

        for (let i = 0; i < asteroidsRef.current.length; i++) {
          const asteroid = asteroidsRef.current[i]
          const dist = Math.hypot(bullet.pos.x - asteroid.pos.x, bullet.pos.y - asteroid.pos.y)
          if (dist < asteroid.radius) {
            asteroidsRef.current.splice(i, 1)
            setScore((s) => s + Math.floor(100 / asteroid.radius))

            // Play explosion sound based on size
            const explosionSize = asteroid.radius > 35 ? 'large' : asteroid.radius > 20 ? 'medium' : 'small'
            sounds.explosion(explosionSize)

            // Split asteroid or create debris for smallest ones
            if (asteroid.radius > 20) {
              const newRadius = asteroid.radius / 2
              for (let j = 0; j < 2; j++) {
                asteroidsRef.current.push(createAsteroid(asteroid.pos.x, asteroid.pos.y, newRadius))
              }
            } else {
              // Smallest asteroid destroyed - create particle debris
              createDebris(asteroid.pos.x, asteroid.pos.y, asteroid.vel.x, asteroid.vel.y, 5, 0.5, '255, 255, 255')
            }
            return false
          }
        }
        return true
      })

      // Collision detection: enemy bullets vs ship
      if (invulnerableRef.current <= 0 && respawnTimerRef.current <= 0) {
        for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
          const bullet = bulletsRef.current[i]
          if (!bullet.isEnemy) continue
          const dist = Math.hypot(ship.pos.x - bullet.pos.x, ship.pos.y - bullet.pos.y)
          if (dist < ship.radius + 2) {
            bulletsRef.current.splice(i, 1)
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y)
            sounds.death()
            respawnTimerRef.current = 1000
            setLives((l) => {
              const newLives = l - 1
              if (newLives <= 0) setTimeout(() => setGameState('gameOver'), 1000)
              return newLives
            })
            break
          }
        }
      }

      // Collision detection: ship vs asteroids
      if (invulnerableRef.current <= 0 && respawnTimerRef.current <= 0) {
        for (let i = 0; i < asteroidsRef.current.length; i++) {
          const asteroid = asteroidsRef.current[i]
          const dist = Math.hypot(ship.pos.x - asteroid.pos.x, ship.pos.y - asteroid.pos.y)
          if (dist < ship.radius + asteroid.radius) {
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y)
            sounds.death()
            respawnTimerRef.current = 1000 // 1 second delay
            setLives((l) => {
              const newLives = l - 1
              if (newLives <= 0) {
                setTimeout(() => setGameState('gameOver'), 1000)
              }
              return newLives
            })
            break
          }
        }
      }

      // Handle respawn timer
      if (respawnTimerRef.current > 0) {
        respawnTimerRef.current -= dt * 1000
        if (respawnTimerRef.current <= 0 && lives > 0) {
          resetLevel()
        }
      }

      // Check if all asteroids destroyed
      if (asteroidsRef.current.length === 0 && gameState === 'playing' && !levelingUpRef.current) {
        levelingUpRef.current = true
        setLevel((l) => {
          const newLevel = l + 1
          setTimeout(() => {
            spawnAsteroids(2 + Math.floor(newLevel / 3))
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

      // Draw asteroids
      asteroidsRef.current.forEach((asteroid) => {
        const { verts, polys } = asteroid.mesh

        // Rotate vertices in all axes.
        const rx = asteroid.rot[0]
        const ry = asteroid.rot[1]
        const rz = asteroid.rot[2]

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

        ctx.save()
        ctx.translate(asteroid.pos.x, asteroid.pos.y)

        // Thin white outlines only (visible edges only).
        ctx.shadowBlur = 0
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
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

      // Draw ship
      if (gameState === 'playing' && respawnTimerRef.current <= 0) {
        const ship = shipRef.current
        const isInvulnerable = invulnerableRef.current > 0
        if (!isInvulnerable || Math.floor(Date.now() / 100) % 2 === 0) {
          ctx.save()
          ctx.translate(ship.pos.x, ship.pos.y)
          ctx.rotate(ship.angle)
          ctx.strokeStyle = '#00ff88'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(15, 0)
          ctx.lineTo(-10, -10)
          ctx.lineTo(-7, 0)
          ctx.lineTo(-10, 10)
          ctx.closePath()
          ctx.stroke()

          // Thrust flame
          if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
            ctx.strokeStyle = '#ff6600'
            ctx.beginPath()
            ctx.moveTo(-7, -3)
            ctx.lineTo(-15 - Math.random() * 5, 0)
            ctx.lineTo(-7, 3)
            ctx.stroke()
          }
          ctx.restore()
        }
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
  }, [gameState, lives, createAsteroid, createDebris, spawnAsteroids, resetLevel])

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
            <div className="flex items-center gap-1">
              {Array.from({ length: lives }).map((_, i) => (
                <svg key={i} width="16" height="16" viewBox="-10 -10 20 20" className="inline-block">
                  <polygon points="0,-10 6,8 0,4 -6,8" fill="none" stroke="#00ff88" strokeWidth="1.5" />
                </svg>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-[#00ff88] bg-black p-8 max-w-md w-full">
            <h1 className="text-4xl text-[#00ff88] mb-8 text-center tracking-[0.3em] uppercase">Asteroids</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Arrow Keys / WASD: Move & Rotate
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Space: Shoot
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> P: Pause
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  menuIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Start Game
              </button>
              <button
                onClick={exitToGameSelect}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  menuIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88]/50 text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
                }`}
              >
                Back
              </button>
            </div>
            <p className="text-[#00ff88]/50 text-xs text-center mt-4 tracking-wider">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}

      {/* Paused */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="border-2 border-[#00ff88] bg-black p-8">
            <h2 className="text-3xl text-[#00ff88] mb-6 text-center tracking-[0.3em] uppercase">Paused</h2>
            <p className="text-[#00ff88]/70 text-center mb-6 tracking-wider">Press P to resume</p>
            <button
              onClick={exitToGameSelect}
              className="w-full border-2 border-[#ff4444] text-[#ff4444] py-3 uppercase tracking-widest hover:bg-[#ff4444] hover:text-black transition-colors"
            >
              Quit to Game Select
            </button>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-[#ff4444] bg-black p-8 max-w-md w-full">
            <h2 className="text-4xl text-[#ff4444] mb-6 text-center tracking-[0.3em] uppercase">Game Over</h2>
            <div className="text-center mb-8">
              <div className="text-[#00ff88] text-2xl mb-2 tracking-wider">{score.toString().padStart(6, '0')}</div>
              <div className="text-[#00ff88]/70 tracking-wider uppercase">Level {level}</div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Play Again
              </button>
              <button
                onClick={() => setGameState('menu')}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88]/50 text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
                }`}
              >
                Menu
              </button>
              <button
                onClick={exitToGameSelect}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 2
                    ? 'border-[#ff4444] bg-[#ff4444] text-black'
                    : 'border-[#ff4444] text-[#ff4444] hover:bg-[#ff4444] hover:text-black'
                }`}
              >
                Change Game
              </button>
            </div>
            <p className="text-[#00ff88]/50 text-xs text-center mt-4 tracking-wider">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}
    </div>
  )
}
