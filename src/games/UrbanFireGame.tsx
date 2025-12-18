import { useCallback, useEffect, useRef, useState } from 'react'

// Sound system for Urban Fire
class ArmorSoundSystem {
  private ctx: AudioContext | null = null
  private initialized = false
  private engineGain: GainNode | null = null
  private engineOsc: OscillatorNode | null = null
  private engineRunning = false

  init() {
    if (this.initialized) return
    this.ctx = new AudioContext()
    this.initialized = true
  }

  startEngine() {
    if (!this.ctx || this.engineRunning) return
    this.engineRunning = true

    this.engineOsc = this.ctx.createOscillator()
    this.engineOsc.type = 'sawtooth'
    this.engineOsc.frequency.value = 40

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 100

    this.engineGain = this.ctx.createGain()
    this.engineGain.gain.setValueAtTime(0.06, this.ctx.currentTime)

    this.engineOsc.connect(filter)
    filter.connect(this.engineGain)
    this.engineGain.connect(this.ctx.destination)

    this.engineOsc.start()
  }

  setEngineSpeed(speed: number) {
    if (!this.engineOsc || !this.ctx) return
    const freq = 40 + Math.abs(speed) * 0.3
    this.engineOsc.frequency.setValueAtTime(freq, this.ctx.currentTime)
  }

  stopEngine() {
    if (!this.ctx || !this.engineRunning) return
    this.engineRunning = false

    if (this.engineGain) {
      this.engineGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1)
    }

    setTimeout(() => {
      this.engineOsc?.stop()
      this.engineOsc = null
      this.engineGain = null
    }, 150)
  }

  shoot() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(200, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  tankShoot() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(100, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.2)
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.2)
  }

  tankHit() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(150, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  explosion() {
    if (!this.ctx) return
    const duration = 0.5

    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(800, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)
  }

  helicopter() {
    if (!this.ctx) return
    // Realistic helicopter rotor "whup whup" sound
    const now = this.ctx.currentTime
    
    // Low frequency rotor thump
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(45, now)
    thump.frequency.exponentialRampToValueAtTime(25, now + 0.08)
    thumpGain.gain.setValueAtTime(0.15, now)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start(now)
    thump.stop(now + 0.1)
    
    // Second blade thump (slightly delayed)
    const thump2 = this.ctx.createOscillator()
    const thump2Gain = this.ctx.createGain()
    thump2.type = 'sine'
    thump2.frequency.setValueAtTime(40, now + 0.07)
    thump2.frequency.exponentialRampToValueAtTime(22, now + 0.15)
    thump2Gain.gain.setValueAtTime(0, now)
    thump2Gain.gain.setValueAtTime(0.12, now + 0.07)
    thump2Gain.gain.exponentialRampToValueAtTime(0.01, now + 0.17)
    thump2.connect(thump2Gain)
    thump2Gain.connect(this.ctx.destination)
    thump2.start(now)
    thump2.stop(now + 0.17)
    
    // High frequency blade whoosh/air sound
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.15)
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * 0.3
    }
    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 400
    noiseFilter.Q.value = 2
    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.06, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start(now)
    noise.stop(now + 0.15)
  }

  death() {
    if (!this.ctx) return
    const duration = 0.8

    const bufferSize = this.ctx.sampleRate * duration
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    const noise = this.ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.setValueAtTime(1500, this.ctx.currentTime)
    noiseFilter.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + duration)

    const noiseGain = this.ctx.createGain()
    noiseGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)
  }
}

const sounds = new ArmorSoundSystem()

type UrbanFireGameProps = {
  onExit: () => void
}

type Vector2 = { x: number; y: number }

type Jeep = {
  pos: Vector2
  vel: Vector2
  angle: number
  health: number
  state: 'active' | 'exploding' | 'dead'
  explodeTime: number
  wheelAngle: number
  hitFlash: number
}

type Tank = {
  pos: Vector2
  vel: Vector2
  angle: number
  health: number
  state: 'active' | 'exploding'
  explodeTime: number
  shootCooldown: number
  targetAngle: number
  trackOffset: number
  stuckTimer: number
  escapeAngle: number
  flankAngle: number // Offset angle for flanking behavior
  tacticalMode: 'approach' | 'flank' | 'hold' // Current tactical behavior
  modeCommitMs: number
  losTimeMs: number
}

type Helicopter = {
  pos: Vector2
  vel: Vector2
  angle: number
  state: 'active' | 'exploding'
  explodeTime: number
  shootCooldown: number
  rotorAngle: number
  soundTimer: number
  losTimeMs: number
}

type Bullet = {
  pos: Vector2
  vel: Vector2
  life: number
  isEnemy: boolean
}

type Wall = {
  x: number
  y: number
  width: number
  height: number
}

type Debris = {
  pos: Vector2
  vel: Vector2
  angle: number
  rotSpeed: number
  life: number
  length: number
}

export function UrbanFireGame({ onExit }: UrbanFireGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const jeepRef = useRef<Jeep>({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    angle: 0,
    health: 3,
    state: 'active',
    explodeTime: 0,
    wheelAngle: 0,
    hitFlash: 0,
  })
  const tanksRef = useRef<Tank[]>([])
  const helicoptersRef = useRef<Helicopter[]>([])
  const bulletsRef = useRef<Bullet[]>([])
  const wallsRef = useRef<Wall[]>([])
  const debrisRef = useRef<Debris[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const respawnTimerRef = useRef(0)
  const waveCompleteRef = useRef(false)

  const createDebris = useCallback((x: number, y: number, count: number = 8) => {
    const debris: Debris[] = []
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
      const speed = 50 + Math.random() * 100
      debris.push({
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 1000 + Math.random() * 500,
        length: 5 + Math.random() * 10,
      })
    }
    debrisRef.current = [...debrisRef.current, ...debris]
  }, [])

  const generateWalls = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    const walls: Wall[] = []
    
    // Urban Fire style - fortress perimeter with internal structures
    const margin = 45
    const bw = Math.min(width, height) * 0.075  // Building size
    const bh = bw * 1.3
    const gap = bw * 0.4
    
    // === TOP ROW ===
    walls.push({ x: margin, y: margin, width: bw, height: bh })
    walls.push({ x: margin + bw + gap, y: margin, width: bw * 0.7, height: bh * 0.5 })
    
    walls.push({ x: width * 0.25, y: margin, width: bw, height: bh })
    walls.push({ x: width * 0.25 + bw, y: margin, width: bw * 0.5, height: bh * 0.6 })
    
    walls.push({ x: width * 0.5 - bw * 0.75, y: margin, width: bw * 1.5, height: bh * 0.7 })
    
    walls.push({ x: width * 0.75 - bw * 1.5, y: margin, width: bw * 0.5, height: bh * 0.6 })
    walls.push({ x: width * 0.75 - bw, y: margin, width: bw, height: bh })
    
    walls.push({ x: width - margin - bw * 1.7 - gap, y: margin, width: bw * 0.7, height: bh * 0.5 })
    walls.push({ x: width - margin - bw, y: margin, width: bw, height: bh })
    
    // === BOTTOM ROW ===
    walls.push({ x: margin, y: height - margin - bh, width: bw, height: bh })
    walls.push({ x: margin + bw + gap, y: height - margin - bh * 0.5, width: bw * 0.7, height: bh * 0.5 })
    
    walls.push({ x: width * 0.25, y: height - margin - bh, width: bw, height: bh })
    walls.push({ x: width * 0.25 + bw, y: height - margin - bh * 0.6, width: bw * 0.5, height: bh * 0.6 })
    
    walls.push({ x: width * 0.5 - bw * 0.75, y: height - margin - bh * 0.7, width: bw * 1.5, height: bh * 0.7 })
    
    walls.push({ x: width * 0.75 - bw * 1.5, y: height - margin - bh * 0.6, width: bw * 0.5, height: bh * 0.6 })
    walls.push({ x: width * 0.75 - bw, y: height - margin - bh, width: bw, height: bh })
    
    walls.push({ x: width - margin - bw * 1.7 - gap, y: height - margin - bh * 0.5, width: bw * 0.7, height: bh * 0.5 })
    walls.push({ x: width - margin - bw, y: height - margin - bh, width: bw, height: bh })
    
    // === LEFT COLUMN ===
    walls.push({ x: margin, y: height * 0.25, width: bh, height: bw })
    walls.push({ x: margin, y: height * 0.25 + bw, width: bh * 0.6, height: bw * 0.5 })
    
    walls.push({ x: margin, y: height * 0.5 - bw * 0.5, width: bh * 0.7, height: bw })
    
    walls.push({ x: margin, y: height * 0.75 - bw * 1.5, width: bh * 0.6, height: bw * 0.5 })
    walls.push({ x: margin, y: height * 0.75 - bw, width: bh, height: bw })
    
    // === RIGHT COLUMN ===
    walls.push({ x: width - margin - bh, y: height * 0.25, width: bh, height: bw })
    walls.push({ x: width - margin - bh * 0.6, y: height * 0.25 + bw, width: bh * 0.6, height: bw * 0.5 })
    
    walls.push({ x: width - margin - bh * 0.7, y: height * 0.5 - bw * 0.5, width: bh * 0.7, height: bw })
    
    walls.push({ x: width - margin - bh * 0.6, y: height * 0.75 - bw * 1.5, width: bh * 0.6, height: bw * 0.5 })
    walls.push({ x: width - margin - bh, y: height * 0.75 - bw, width: bh, height: bw })
    
    // === INNER RING - creates corridors ===
    const innerMargin = margin + bh + gap * 2
    
    // Inner top-left L
    walls.push({ x: innerMargin, y: innerMargin, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: innerMargin, y: innerMargin + bw * 0.8, width: bw * 0.6, height: bw })
    
    // Inner top-right L
    walls.push({ x: width - innerMargin - bw * 1.2, y: innerMargin, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: width - innerMargin - bw * 0.6, y: innerMargin + bw * 0.8, width: bw * 0.6, height: bw })
    
    // Inner bottom-left L
    walls.push({ x: innerMargin, y: height - innerMargin - bw * 0.8, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: innerMargin, y: height - innerMargin - bw * 1.8, width: bw * 0.6, height: bw })
    
    // Inner bottom-right L
    walls.push({ x: width - innerMargin - bw * 1.2, y: height - innerMargin - bw * 0.8, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: width - innerMargin - bw * 0.6, y: height - innerMargin - bw * 1.8, width: bw * 0.6, height: bw })
    
    // === CENTER STRUCTURE - cross/plus shape ===
    const cx = width / 2
    const cy = height / 2
    const crossArm = bw * 3.6
    const crossThick = bw * 1.2
    
    // Horizontal bar of cross
    walls.push({ x: cx - crossArm / 2, y: cy - crossThick / 2, width: crossArm, height: crossThick })
    // Vertical bar of cross
    walls.push({ x: cx - crossThick / 2, y: cy - crossArm / 2, width: crossThick, height: crossArm })
    
    // Mid-field obstacles - diamond arrangement
    walls.push({ x: width * 0.3, y: height * 0.35, width: bw, height: bw * 0.6 })
    walls.push({ x: width * 0.7 - bw, y: height * 0.35, width: bw, height: bw * 0.6 })
    walls.push({ x: width * 0.3, y: height * 0.65 - bw * 0.6, width: bw, height: bw * 0.6 })
    walls.push({ x: width * 0.7 - bw, y: height * 0.65 - bw * 0.6, width: bw, height: bw * 0.6 })

    wallsRef.current = walls
  }, [])

  const spawnEnemies = useCallback((waveNum: number) => {
    const { width, height } = canvasSizeRef.current
    const tanks: Tank[] = []
    const helicopters: Helicopter[] = []

    const tankCount = Math.min(2 + Math.floor(waveNum / 2), 4)
    const heliCount = waveNum >= 2 ? Math.min(1 + Math.floor((waveNum - 1) / 2), 3) : 0

    // Helper to check if a path from spawn point is clear
    const isPathClear = (startX: number, startY: number, angle: number, distance: number): boolean => {
      const steps = 5
      for (let i = 1; i <= steps; i++) {
        const checkX = startX + Math.cos(angle) * (distance * i / steps)
        const checkY = startY + Math.sin(angle) * (distance * i / steps)
        for (const wall of wallsRef.current) {
          if (
            checkX > wall.x - 30 && checkX < wall.x + wall.width + 30 &&
            checkY > wall.y - 30 && checkY < wall.y + wall.height + 30
          ) {
            return false
          }
        }
      }
      return true
    }

    // Define specific spawn points in gaps between perimeter buildings
    // These are relative positions (0-1) along each edge where gaps exist
    const spawnPoints = [
      // Top edge gaps (between buildings)
      { side: 0, pos: 0.18 },   // Gap after first building
      { side: 0, pos: 0.38 },   // Gap in upper-left area
      { side: 0, pos: 0.62 },   // Gap in upper-right area
      { side: 0, pos: 0.82 },   // Gap before last building
      // Bottom edge gaps
      { side: 1, pos: 0.18 },
      { side: 1, pos: 0.38 },
      { side: 1, pos: 0.62 },
      { side: 1, pos: 0.82 },
      // Left edge gaps
      { side: 2, pos: 0.18 },
      { side: 2, pos: 0.38 },
      { side: 2, pos: 0.62 },
      { side: 2, pos: 0.82 },
      // Right edge gaps
      { side: 3, pos: 0.18 },
      { side: 3, pos: 0.38 },
      { side: 3, pos: 0.62 },
      { side: 3, pos: 0.82 },
    ]

    // Shuffle spawn points
    const shuffledSpawns = [...spawnPoints].sort(() => Math.random() - 0.5)

    // Spawn tanks (from edges, drive in)
    for (let i = 0; i < tankCount; i++) {
      let x: number, y: number, angle: number
      let foundSpawn = false
      
      // Try to find a spawn point with a clear path
      for (const spawn of shuffledSpawns) {
        switch (spawn.side) {
          case 0: // Top edge
            x = width * spawn.pos
            y = -30
            angle = Math.PI / 2 + (Math.random() - 0.5) * 0.3
            break
          case 1: // Bottom edge
            x = width * spawn.pos
            y = height + 30
            angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3
            break
          case 2: // Left edge
            x = -30
            y = height * spawn.pos
            angle = 0 + (Math.random() - 0.5) * 0.3
            break
          default: // Right edge
            x = width + 30
            y = height * spawn.pos
            angle = Math.PI + (Math.random() - 0.5) * 0.3
        }
        
        // Check if path is clear for 120 pixels
        if (isPathClear(x, y, angle, 120)) {
          foundSpawn = true
          // Remove this spawn point so other tanks don't use it
          const idx = shuffledSpawns.indexOf(spawn)
          if (idx > -1) shuffledSpawns.splice(idx, 1)
          break
        }
      }
      
      // Fallback if no clear spawn found
      if (!foundSpawn) {
        const side = Math.floor(Math.random() * 4)
        switch (side) {
          case 0:
            x = width / 2
            y = -30
            angle = Math.PI / 2
            break
          case 1:
            x = width / 2
            y = height + 30
            angle = -Math.PI / 2
            break
          case 2:
            x = -30
            y = height / 2
            angle = 0
            break
          default:
            x = width + 30
            y = height / 2
            angle = Math.PI
        }
      }

      // Assign flanking angles - distribute tanks around the player
      const flankAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]
      
      tanks.push({
        pos: { x: x!, y: y! },
        vel: { x: Math.cos(angle!) * 40, y: Math.sin(angle!) * 40 },
        angle: angle!,
        health: 2,
        state: 'active',
        explodeTime: 0,
        shootCooldown: 2000 + Math.random() * 2000,
        targetAngle: 0,
        trackOffset: 0,
        stuckTimer: 0,
        escapeAngle: 0,
        flankAngle: flankAngles[i % flankAngles.length],
        tacticalMode: 'approach',
        modeCommitMs: 0,
        losTimeMs: 0,
      })
    }

    // Spawn helicopters (from edges)
    for (let i = 0; i < heliCount; i++) {
      const side = Math.floor(Math.random() * 4)
      let x: number, y: number, vx: number, vy: number
      switch (side) {
        case 0: // Top
          x = Math.random() * width
          y = -30
          vx = (Math.random() - 0.5) * 40
          vy = 30 + Math.random() * 20
          break
        case 1: // Bottom
          x = Math.random() * width
          y = height + 30
          vx = (Math.random() - 0.5) * 40
          vy = -(30 + Math.random() * 20)
          break
        case 2: // Left
          x = -30
          y = Math.random() * height
          vx = 30 + Math.random() * 20
          vy = (Math.random() - 0.5) * 40
          break
        default: // Right
          x = width + 30
          y = Math.random() * height
          vx = -(30 + Math.random() * 20)
          vy = (Math.random() - 0.5) * 40
      }

      helicopters.push({
        pos: { x, y },
        vel: { x: vx, y: vy },
        angle: Math.atan2(vy, vx),
        state: 'active',
        explodeTime: 0,
        shootCooldown: 1500 + Math.random() * 1500,
        rotorAngle: 0,
        soundTimer: 0,
        losTimeMs: 0,
      })
    }

    tanksRef.current = tanks
    helicoptersRef.current = helicopters
  }, [])

  const resetJeep = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    
    // Find a safe spawn position not inside a wall
    const isInsideWall = (x: number, y: number, radius: number) => {
      for (const wall of wallsRef.current) {
        if (
          x + radius > wall.x &&
          x - radius < wall.x + wall.width &&
          y + radius > wall.y &&
          y - radius < wall.y + wall.height
        ) {
          return true
        }
      }
      return false
    }
    
    // Try spawn positions - prefer bottom center area
    const spawnPositions = [
      { x: width / 2, y: height - 100 },
      { x: width / 2, y: height - 150 },
      { x: width / 3, y: height - 100 },
      { x: width * 2 / 3, y: height - 100 },
      { x: width / 2, y: height / 2 + 100 },
      { x: width / 4, y: height - 100 },
      { x: width * 3 / 4, y: height - 100 },
    ]
    
    let spawnX = width / 2
    let spawnY = height - 100
    
    for (const pos of spawnPositions) {
      if (!isInsideWall(pos.x, pos.y, 20)) {
        spawnX = pos.x
        spawnY = pos.y
        break
      }
    }
    
    jeepRef.current = {
      pos: { x: spawnX, y: spawnY },
      vel: { x: 0, y: 0 },
      angle: -Math.PI / 2,
      health: 3,
      state: 'active',
      explodeTime: 0,
      wheelAngle: 0,
      hitFlash: 0,
    }
  }, [])

  const startGame = useCallback(() => {
    sounds.init()
    sounds.startEngine()
    generateWalls()
    resetJeep()
    bulletsRef.current = []
    debrisRef.current = []
    waveCompleteRef.current = false
    respawnTimerRef.current = 0
    setScore(0)
    setWave(1)
    spawnEnemies(1)
    setGameState('playing')
  }, [generateWalls, resetJeep, spawnEnemies])

  useEffect(() => {
    if (gameState !== 'menu') return

    generateWalls()
    resetJeep()
    bulletsRef.current = []
    debrisRef.current = []
    if (tanksRef.current.length === 0 && helicoptersRef.current.length === 0) {
      spawnEnemies(1)
    }
  }, [gameState, generateWalls, resetJeep, spawnEnemies])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if (e.key === 'Escape') {
        e.preventDefault()
        sounds.stopEngine()
        onExit()
        return
      }

      if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault()
        const jeep = jeepRef.current
        // Max 2 bullets on screen
        const playerBullets = bulletsRef.current.filter((b) => !b.isEnemy)
        if (playerBullets.length < 2 && jeep.state === 'active') {
          bulletsRef.current.push({
            pos: { x: jeep.pos.x, y: jeep.pos.y },
            vel: {
              x: Math.cos(jeep.angle) * 400,
              y: Math.sin(jeep.angle) * 400,
            },
            life: 1500,
            isEnemy: false,
          })
          sounds.shoot()
        }
      }

      if (e.key === 'p' && gameState === 'playing') {
        sounds.stopEngine()
        setGameState('paused')
      } else if (e.key === 'p' && gameState === 'paused') {
        sounds.startEngine()
        setGameState('playing')
      }

      // Menu navigation
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

      // Game Over navigation
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

  // Line-rectangle intersection for bullet collision with walls
  const lineIntersectsRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
  ): boolean => {
    // Check if line segment intersects rectangle
    const left = rx
    const right = rx + rw
    const top = ry
    const bottom = ry + rh

    // Check if either endpoint is inside
    if (x1 >= left && x1 <= right && y1 >= top && y1 <= bottom) return true
    if (x2 >= left && x2 <= right && y2 >= top && y2 <= bottom) return true

    // Check line intersection with each edge
    const intersectsLine = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      cx: number,
      cy: number,
      dx: number,
      dy: number,
    ) => {
      const denom = (dy - cy) * (bx - ax) - (dx - cx) * (by - ay)
      if (Math.abs(denom) < 0.0001) return false
      const ua = ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) / denom
      const ub = ((bx - ax) * (ay - cy) - (by - ay) * (ax - cx)) / denom
      return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1
    }

    return (
      intersectsLine(x1, y1, x2, y2, left, top, right, top) ||
      intersectsLine(x1, y1, x2, y2, right, top, right, bottom) ||
      intersectsLine(x1, y1, x2, y2, right, bottom, left, bottom) ||
      intersectsLine(x1, y1, x2, y2, left, bottom, left, top)
    )
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }
      if (gameState === 'playing') {
        generateWalls()
      } else if (gameState === 'menu') {
        generateWalls()
        resetJeep()
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const rectCollision = (
      x: number,
      y: number,
      radius: number,
      rect: Wall,
    ): { collision: boolean; pushX: number; pushY: number } => {
      const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width))
      const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height))
      const dx = x - closestX
      const dy = y - closestY
      const dist = Math.hypot(dx, dy)

      if (dist < radius && dist > 0) {
        const overlap = radius - dist
        return {
          collision: true,
          pushX: (dx / dist) * overlap,
          pushY: (dy / dist) * overlap,
        }
      }
      return { collision: false, pushX: 0, pushY: 0 }
    }

    const update = (dt: number) => {
      if (gameState !== 'playing') return

      const { width, height } = canvasSizeRef.current
      const jeep = jeepRef.current

      // Fairness: cap concurrent enemy bullets so difficulty stays readable.
      const maxEnemyBullets = 6

      // Respawn timer
      if (respawnTimerRef.current > 0) {
        respawnTimerRef.current -= dt * 1000
        if (respawnTimerRef.current <= 0) {
          resetJeep()
          sounds.startEngine()
        }
        // Update debris
        debrisRef.current = debrisRef.current.filter((d) => {
          d.pos.x += d.vel.x * dt
          d.pos.y += d.vel.y * dt
          d.angle += d.rotSpeed * dt
          d.life -= dt * 1000
          return d.life > 0
        })
        return
      }

      if (jeep.state === 'exploding') {
        jeep.explodeTime -= dt * 1000
        if (jeep.explodeTime <= 0) {
          jeep.state = 'dead'
          sounds.stopEngine()
          setTimeout(() => setGameState('gameOver'), 500)
        }
        // Update debris
        debrisRef.current = debrisRef.current.filter((d) => {
          d.pos.x += d.vel.x * dt
          d.pos.y += d.vel.y * dt
          d.angle += d.rotSpeed * dt
          d.life -= dt * 1000
          return d.life > 0
        })
        return
      }
      
      // Decay hit flash
      if (jeep.hitFlash > 0) {
        jeep.hitFlash -= dt * 1000
      }

      // Jeep controls
      if (keysRef.current.has('arrowleft') || keysRef.current.has('a')) {
        jeep.angle -= 4 * dt
      }
      if (keysRef.current.has('arrowright') || keysRef.current.has('d')) {
        jeep.angle += 4 * dt
      }

      const accel = 280
      if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
        jeep.vel.x += Math.cos(jeep.angle) * accel * dt
        jeep.vel.y += Math.sin(jeep.angle) * accel * dt
      }
      if (keysRef.current.has('arrowdown') || keysRef.current.has('s')) {
        jeep.vel.x -= Math.cos(jeep.angle) * accel * 0.5 * dt
        jeep.vel.y -= Math.sin(jeep.angle) * accel * 0.5 * dt
      }

      // Drift physics - velocity gradually aligns with facing direction
      const speed = Math.hypot(jeep.vel.x, jeep.vel.y)
      if (speed > 10) {
        const velAngle = Math.atan2(jeep.vel.y, jeep.vel.x)
        let angleDiff = jeep.angle - velAngle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
        
        // The faster you go, the more you drift (less grip)
        // Grip factor: 1.0 = instant alignment, lower = more drift
        const gripFactor = Math.max(0.015, 0.06 - speed * 0.0003)
        const alignAmount = angleDiff * gripFactor
        
        // Rotate velocity toward facing direction
        const newVelAngle = velAngle + alignAmount
        jeep.vel.x = Math.cos(newVelAngle) * speed
        jeep.vel.y = Math.sin(newVelAngle) * speed
      }

      // Friction (slightly less when drifting sideways)
      jeep.vel.x *= 0.96
      jeep.vel.y *= 0.96

      // Speed limit
      const maxSpeed = 190
      if (speed > maxSpeed) {
        jeep.vel.x = (jeep.vel.x / speed) * maxSpeed
        jeep.vel.y = (jeep.vel.y / speed) * maxSpeed
      }

      // Animate wheels
      jeep.wheelAngle += speed * dt * 0.3

      sounds.setEngineSpeed(speed)

      // Move jeep
      jeep.pos.x += jeep.vel.x * dt
      jeep.pos.y += jeep.vel.y * dt

      // Wall collision for jeep
      for (const wall of wallsRef.current) {
        const { collision, pushX, pushY } = rectCollision(jeep.pos.x, jeep.pos.y, 12, wall)
        if (collision) {
          jeep.pos.x += pushX
          jeep.pos.y += pushY
          jeep.vel.x *= 0.5
          jeep.vel.y *= 0.5
        }
      }

      // Screen bounds
      jeep.pos.x = Math.max(20, Math.min(width - 20, jeep.pos.x))
      jeep.pos.y = Math.max(20, Math.min(height - 20, jeep.pos.y))

      // Update tanks
      tanksRef.current = tanksRef.current.filter((tank) => {
        if (tank.state === 'exploding') {
          tank.explodeTime -= dt * 1000
          return tank.explodeTime > 0
        }

        // AI: Smart navigation with obstacle avoidance
        const dx = jeep.pos.x - tank.pos.x
        const dy = jeep.pos.y - tank.pos.y
        const dist = Math.hypot(dx, dy)
        const directAngle = Math.atan2(dy, dx)
        
        // Check if direct path to jeep is blocked
        let pathBlocked = false
        for (const wall of wallsRef.current) {
          if (lineIntersectsRect(tank.pos.x, tank.pos.y, jeep.pos.x, jeep.pos.y, wall.x, wall.y, wall.width, wall.height)) {
            pathBlocked = true
            break
          }
        }

        // Fairness: require a short, continuous "seeing you" window before accurate fire.
        if (!pathBlocked) tank.losTimeMs = Math.min(2000, tank.losTimeMs + dt * 1000)
        else tank.losTimeMs = 0

        // Reduce tactical dithering.
        tank.modeCommitMs = Math.max(0, tank.modeCommitMs - dt * 1000)
        
        // Feeler rays to detect nearby obstacles - check multiple distances
        const { width, height } = canvasSizeRef.current
        const checkObstacle = (angle: number, checkDist: number): boolean => {
          const checkX = tank.pos.x + Math.cos(angle) * checkDist
          const checkY = tank.pos.y + Math.sin(angle) * checkDist
          
          // Check screen edges
          if (checkX < 30 || checkX > width - 30 || checkY < 30 || checkY > height - 30) {
            return true
          }
          
          for (const wall of wallsRef.current) {
            if (
              checkX > wall.x - 25 && checkX < wall.x + wall.width + 25 &&
              checkY > wall.y - 25 && checkY < wall.y + wall.height + 25
            ) {
              return true
            }
          }
          return false
        }
        
        // Check at multiple distances for better detection
        const frontBlocked = checkObstacle(tank.angle, 50) || checkObstacle(tank.angle, 80)
        const frontLeftBlocked = checkObstacle(tank.angle - Math.PI / 6, 60)
        const frontRightBlocked = checkObstacle(tank.angle + Math.PI / 6, 60)
        const leftBlocked = checkObstacle(tank.angle - Math.PI / 3, 50)
        const rightBlocked = checkObstacle(tank.angle + Math.PI / 3, 50)
        const rearBlocked = checkObstacle(tank.angle + Math.PI, 50)
        
        // Count how many directions are blocked
        const blockedCount = [frontBlocked, frontLeftBlocked, frontRightBlocked, leftBlocked, rightBlocked, rearBlocked].filter(b => b).length
        
        // Check if near screen edges - if so, bias toward center
        const nearLeftEdge = tank.pos.x < 80
        const nearRightEdge = tank.pos.x > width - 80
        const nearTopEdge = tank.pos.y < 80
        const nearBottomEdge = tank.pos.y > height - 80
        
        // Calculate angle toward center of screen
        const centerX = width / 2
        const centerY = height / 2
        const toCenterAngle = Math.atan2(centerY - tank.pos.y, centerX - tank.pos.x)
        
        // Calculate desired angle based on obstacles
        let desiredAngle = tank.targetAngle
        
        // If heavily surrounded, enter escape mode
        if (blockedCount >= 4) {
          tank.stuckTimer += dt
          if (tank.stuckTimer > 0.5) {
            // Pick an escape angle and commit to it
            if (tank.escapeAngle === 0 || tank.stuckTimer > 2) {
              // Try toward center, or pick a random direction
              tank.escapeAngle = toCenterAngle + (Math.random() - 0.5) * Math.PI
              tank.stuckTimer = 0.5 // Reset but stay in escape mode
            }
            desiredAngle = tank.escapeAngle
          }
        } else {
          // Not stuck anymore, reset timer
          tank.stuckTimer = Math.max(0, tank.stuckTimer - dt * 2)
          if (tank.stuckTimer <= 0) {
            tank.escapeAngle = 0
          }
        }
        
        // If actively escaping, skip normal navigation
        if (tank.escapeAngle !== 0) {
          desiredAngle = tank.escapeAngle
        } else if (nearLeftEdge || nearRightEdge || nearTopEdge || nearBottomEdge) {
          // Blend between jeep direction and center direction when near edges
          let blendedTarget = toCenterAngle
          
          // If we can see the jeep, try to angle toward them while escaping edge
          if (!pathBlocked) {
            let centerDiff = directAngle - toCenterAngle
            while (centerDiff > Math.PI) centerDiff -= Math.PI * 2
            while (centerDiff < -Math.PI) centerDiff += Math.PI * 2
            // If jeep is somewhat toward center, go that way
            if (Math.abs(centerDiff) < Math.PI / 2) {
              blendedTarget = directAngle
            }
          }
          desiredAngle = blendedTarget
        } else if (frontBlocked || frontLeftBlocked || frontRightBlocked || pathBlocked) {
          // Need to navigate around obstacle
          if (!leftBlocked && (rightBlocked || frontRightBlocked)) {
            // Turn left harder
            desiredAngle = tank.angle - Math.PI / 2
          } else if ((leftBlocked || frontLeftBlocked) && !rightBlocked) {
            // Turn right harder
            desiredAngle = tank.angle + Math.PI / 2
          } else if (!leftBlocked && !rightBlocked) {
            // Both sides clear, pick the one closer to jeep direction
            let leftAngleDiff = directAngle - (tank.angle - Math.PI / 2)
            let rightAngleDiff = directAngle - (tank.angle + Math.PI / 2)
            while (leftAngleDiff > Math.PI) leftAngleDiff -= Math.PI * 2
            while (leftAngleDiff < -Math.PI) leftAngleDiff += Math.PI * 2
            while (rightAngleDiff > Math.PI) rightAngleDiff -= Math.PI * 2
            while (rightAngleDiff < -Math.PI) rightAngleDiff += Math.PI * 2
            desiredAngle = Math.abs(leftAngleDiff) < Math.abs(rightAngleDiff) 
              ? tank.angle - Math.PI / 2 
              : tank.angle + Math.PI / 2
          } else {
            // Both sides blocked, reverse
            desiredAngle = tank.angle + Math.PI
          }
        } else {
          // Smart tactical behavior based on distance and situation
          const optimalDist = 180 // Ideal shooting distance

          // Pick a desired mode, then apply a small commit window so tanks don't flicker modes.
          let desiredMode: Tank['tacticalMode'] = tank.tacticalMode
          if (dist > optimalDist + 120) desiredMode = 'approach'
          else if (dist < optimalDist - 60 && !pathBlocked) desiredMode = 'hold'
          else desiredMode = 'flank'

          if (tank.modeCommitMs <= 0 && desiredMode !== tank.tacticalMode) {
            tank.tacticalMode = desiredMode
            tank.modeCommitMs = 500 + Math.random() * 650
          }
          
          if (tank.tacticalMode === 'approach') {
            // Approach but at an angle to flank
            desiredAngle = directAngle + tank.flankAngle * 0.3
          } else if (tank.tacticalMode === 'flank') {
            // Circle around the player at optimal distance
            // Move perpendicular to player direction
            const perpAngle = tank.flankAngle > 0 ? directAngle + Math.PI / 2 : directAngle - Math.PI / 2
            // Blend between facing player and circling
            if (dist < optimalDist) {
              // Too close, back away while circling
              desiredAngle = directAngle + Math.PI * 0.7 * Math.sign(tank.flankAngle)
            } else {
              // At good distance, circle while facing player
              desiredAngle = perpAngle
            }
          } else {
            // Hold position - face the player
            desiredAngle = directAngle
          }
        }
        
        // Smoothly update target angle to prevent jittering
        // Only change target if the new desired angle is significantly different
        let targetDiff = desiredAngle - tank.targetAngle
        while (targetDiff > Math.PI) targetDiff -= Math.PI * 2
        while (targetDiff < -Math.PI) targetDiff += Math.PI * 2
        
        // Gradually blend toward desired angle to smooth out rapid changes
        tank.targetAngle += targetDiff * dt * 3

        let angleDiff = tank.targetAngle - tank.angle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
        tank.angle += angleDiff * dt * 2.0 // Smooth turning

        // Move tank - speed based on tactical mode
        const tankSpeed = tank.tacticalMode === 'approach' ? 55 : tank.tacticalMode === 'flank' ? 45 : 25
        if (frontBlocked || frontLeftBlocked || frontRightBlocked) {
          // Slow down when obstacle ahead
          tank.vel.x = Math.cos(tank.angle) * tankSpeed * 0.3
          tank.vel.y = Math.sin(tank.angle) * tankSpeed * 0.3
        } else if (tank.tacticalMode === 'hold' && dist < 120 && !pathBlocked) {
          // Back up slowly when too close
          tank.vel.x = -Math.cos(directAngle) * 30
          tank.vel.y = -Math.sin(directAngle) * 30
        } else if (tank.tacticalMode === 'flank') {
          // Move at medium speed while flanking
          tank.vel.x = Math.cos(tank.angle) * tankSpeed
          tank.vel.y = Math.sin(tank.angle) * tankSpeed
        } else if (dist > 150) {
          tank.vel.x = Math.cos(tank.angle) * tankSpeed
          tank.vel.y = Math.sin(tank.angle) * tankSpeed
        } else {
          tank.vel.x *= 0.9
          tank.vel.y *= 0.9
        }

        // Animate tracks based on movement
        const tankSpeed2 = Math.hypot(tank.vel.x, tank.vel.y)
        tank.trackOffset += tankSpeed2 * dt * 0.5

        tank.pos.x += tank.vel.x * dt
        tank.pos.y += tank.vel.y * dt

        // Wall collision for tank
        for (const wall of wallsRef.current) {
          const { collision, pushX, pushY } = rectCollision(tank.pos.x, tank.pos.y, 28, wall)
          if (collision) {
            tank.pos.x += pushX
            tank.pos.y += pushY
          }
        }

        // Screen bounds
        tank.pos.x = Math.max(25, Math.min(width - 25, tank.pos.x))
        tank.pos.y = Math.max(25, Math.min(height - 25, tank.pos.y))

        // Tank-to-tank collision
        for (const otherTank of tanksRef.current) {
          if (otherTank === tank || otherTank.state === 'exploding') continue
          const dx = tank.pos.x - otherTank.pos.x
          const dy = tank.pos.y - otherTank.pos.y
          const dist = Math.hypot(dx, dy)
          const minDist = 40 // Both tanks are ~20 radius
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) / 2
            const nx = dx / dist
            const ny = dy / dist
            tank.pos.x += nx * push
            tank.pos.y += ny * push
            otherTank.pos.x -= nx * push
            otherTank.pos.y -= ny * push
          }
        }

        // Tank-to-jeep collision
        if (jeep.state === 'active') {
          const dx = tank.pos.x - jeep.pos.x
          const dy = tank.pos.y - jeep.pos.y
          const dist = Math.hypot(dx, dy)
          const minDist = 32 // Tank ~20 + jeep ~12
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) / 2
            const nx = dx / dist
            const ny = dy / dist
            tank.pos.x += nx * push
            tank.pos.y += ny * push
            jeep.pos.x -= nx * push
            jeep.pos.y -= ny * push
          }
        }

        // Shooting - smart aim with lead prediction
        tank.shootCooldown -= dt * 1000
        
        // Calculate lead shot - predict where jeep will be
        const bulletSpeed = 250
        const timeToTarget = dist / bulletSpeed
        const predictedX = jeep.pos.x + jeep.vel.x * timeToTarget * 0.7 // 70% prediction for some inaccuracy
        const predictedY = jeep.pos.y + jeep.vel.y * timeToTarget * 0.7
        const leadAngle = Math.atan2(predictedY - tank.pos.y, predictedX - tank.pos.x)
        
        // Check if aimed well enough (comparing tank angle to lead angle)
        let aimDiff = leadAngle - tank.angle
        while (aimDiff > Math.PI) aimDiff -= Math.PI * 2
        while (aimDiff < -Math.PI) aimDiff += Math.PI * 2
        
        const enemyBulletCount = bulletsRef.current.reduce((acc, b) => acc + (b.isEnemy ? 1 : 0), 0)
        const reactionOk = tank.losTimeMs >= 250
        const aimOk = Math.abs(aimDiff) < 0.35

        if (tank.shootCooldown <= 0 && reactionOk && aimOk && dist < 350 && enemyBulletCount < maxEnemyBullets) {
          // Check if wall blocks the shot to predicted position
          let blocked = false
          for (const wall of wallsRef.current) {
            if (lineIntersectsRect(tank.pos.x, tank.pos.y, predictedX, predictedY, wall.x, wall.y, wall.width, wall.height)) {
              blocked = true
              break
            }
          }

          if (!blocked) {
            // Shoot toward predicted position with slight randomness
            // Fairness: a little wobble, but not instant "laser" snaps.
            const shootAngle = leadAngle + (Math.random() - 0.5) * 0.12
            tank.shootCooldown = 2200 + Math.random() * 1700
            bulletsRef.current.push({
              pos: { x: tank.pos.x, y: tank.pos.y },
              vel: {
                x: Math.cos(shootAngle) * bulletSpeed,
                y: Math.sin(shootAngle) * bulletSpeed,
              },
              life: 2000,
              isEnemy: true,
            })
            sounds.tankShoot()
          } else {
            tank.shootCooldown = 400 // Try again soon
          }
        }

        return true
      })

      // Update helicopters
      helicoptersRef.current = helicoptersRef.current.filter((heli) => {
        if (heli.state === 'exploding') {
          heli.explodeTime -= dt * 1000
          return heli.explodeTime > 0
        }

        // Helicopter sound - faster repetition for realistic rotor sound
        heli.soundTimer -= dt * 1000
        if (heli.soundTimer <= 0) {
          heli.soundTimer = 180 // Faster "whup whup" rhythm
          sounds.helicopter()
        }

        // Move towards player generally
        const dx = jeep.pos.x - heli.pos.x
        const dy = jeep.pos.y - heli.pos.y
        const dist = Math.hypot(dx, dy)

        // LOS for fairness and effectiveness (don't spam into walls)
        let heliPathBlocked = false
        for (const wall of wallsRef.current) {
          if (lineIntersectsRect(heli.pos.x, heli.pos.y, jeep.pos.x, jeep.pos.y, wall.x, wall.y, wall.width, wall.height)) {
            heliPathBlocked = true
            break
          }
        }
        if (!heliPathBlocked) heli.losTimeMs = Math.min(2000, heli.losTimeMs + dt * 1000)
        else heli.losTimeMs = 0

        if (dist > 50) {
          const targetVx = (dx / dist) * 60
          const targetVy = (dy / dist) * 60
          heli.vel.x += (targetVx - heli.vel.x) * dt * 0.5
          heli.vel.y += (targetVy - heli.vel.y) * dt * 0.5
        }

        heli.pos.x += heli.vel.x * dt
        heli.pos.y += heli.vel.y * dt
        heli.angle = Math.atan2(heli.vel.y, heli.vel.x)
        heli.rotorAngle += dt * 20

        // Shooting
        heli.shootCooldown -= dt * 1000
        const enemyBulletCount = bulletsRef.current.reduce((acc, b) => acc + (b.isEnemy ? 1 : 0), 0)
        const heliReactionOk = heli.losTimeMs >= 250
        if (heli.shootCooldown <= 0 && heliReactionOk && !heliPathBlocked && dist < 320 && dist > 90 && enemyBulletCount < maxEnemyBullets) {
          heli.shootCooldown = 2400 + Math.random() * 1400

          const bulletSpeed = 220
          const timeToTarget = dist / bulletSpeed
          const predictedX = jeep.pos.x + jeep.vel.x * timeToTarget * 0.55
          const predictedY = jeep.pos.y + jeep.vel.y * timeToTarget * 0.55
          const bulletAngle = Math.atan2(predictedY - heli.pos.y, predictedX - heli.pos.x) + (Math.random() - 0.5) * 0.18

          bulletsRef.current.push({
            pos: { x: heli.pos.x, y: heli.pos.y },
            vel: {
              x: Math.cos(bulletAngle) * bulletSpeed,
              y: Math.sin(bulletAngle) * bulletSpeed,
            },
            life: 2000,
            isEnemy: true,
          })
          sounds.tankShoot()
        }

        return true
      })

      // Update bullets
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        const prevX = bullet.pos.x
        const prevY = bullet.pos.y
        bullet.pos.x += bullet.vel.x * dt
        bullet.pos.y += bullet.vel.y * dt
        bullet.life -= dt * 1000

        // Wall collision (bullets don't pass through)
        for (const wall of wallsRef.current) {
          if (lineIntersectsRect(prevX, prevY, bullet.pos.x, bullet.pos.y, wall.x, wall.y, wall.width, wall.height)) {
            return false
          }
        }

        // Screen bounds
        if (bullet.pos.x < 0 || bullet.pos.x > width || bullet.pos.y < 0 || bullet.pos.y > height) {
          return false
        }

        return bullet.life > 0
      })

      // Update debris
      debrisRef.current = debrisRef.current.filter((d) => {
        d.pos.x += d.vel.x * dt
        d.pos.y += d.vel.y * dt
        d.angle += d.rotSpeed * dt
        d.vel.x *= 0.98
        d.vel.y *= 0.98
        d.life -= dt * 1000
        return d.life > 0
      })

      // Collision: player bullets vs tanks
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const bullet = bulletsRef.current[i]
        if (bullet.isEnemy) continue

        for (const tank of tanksRef.current) {
          if (tank.state !== 'active') continue
          const dist = Math.hypot(bullet.pos.x - tank.pos.x, bullet.pos.y - tank.pos.y)
          if (dist < 20) {
            bulletsRef.current.splice(i, 1)
            tank.health--
            if (tank.health <= 0) {
              tank.state = 'exploding'
              tank.explodeTime = 1000
              createDebris(tank.pos.x, tank.pos.y, 10)
              sounds.explosion()
              setScore((s) => s + 500)
            } else {
              sounds.tankHit()
              setScore((s) => s + 100)
            }
            break
          }
        }
      }

      // Collision: player bullets vs helicopters
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const bullet = bulletsRef.current[i]
        if (bullet.isEnemy) continue

        for (const heli of helicoptersRef.current) {
          if (heli.state !== 'active') continue
          const dist = Math.hypot(bullet.pos.x - heli.pos.x, bullet.pos.y - heli.pos.y)
          if (dist < 18) {
            bulletsRef.current.splice(i, 1)
            heli.state = 'exploding'
            heli.explodeTime = 1000
            createDebris(heli.pos.x, heli.pos.y, 8)
            sounds.explosion()
            setScore((s) => s + 1000)
            break
          }
        }
      }

      // Collision: enemy bullets vs player
      if (jeep.state === 'active') {
        for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
          const bullet = bulletsRef.current[i]
          if (!bullet.isEnemy) continue
          const dist = Math.hypot(bullet.pos.x - jeep.pos.x, bullet.pos.y - jeep.pos.y)
          if (dist < 12) {
            bulletsRef.current.splice(i, 1)
            jeep.health -= 1
            jeep.hitFlash = 300
            
            // Knockback - push away from bullet direction and spin
            const knockbackForce = 120
            const bulletDir = Math.atan2(bullet.vel.y, bullet.vel.x)
            jeep.vel.x += Math.cos(bulletDir) * knockbackForce
            jeep.vel.y += Math.sin(bulletDir) * knockbackForce
            jeep.angle += (Math.random() - 0.5) * 1.5 // Random spin
            
            createDebris(jeep.pos.x, jeep.pos.y, 4)
            sounds.tankHit()
            
            if (jeep.health <= 0) {
              jeep.state = 'exploding'
              jeep.explodeTime = 1500
              createDebris(jeep.pos.x, jeep.pos.y, 12)
              sounds.death()
              sounds.stopEngine()
            }
            break
          }
        }
      }

      // Check wave complete
      const activeTanks = tanksRef.current.filter((t) => t.state === 'active').length
      const activeHelis = helicoptersRef.current.filter((h) => h.state === 'active').length
      if (activeTanks === 0 && activeHelis === 0 && !waveCompleteRef.current && jeep.state === 'active') {
        waveCompleteRef.current = true
        setTimeout(() => {
          setWave((w) => {
            const newWave = w + 1
            spawnEnemies(newWave)
            waveCompleteRef.current = false
            return newWave
          })
        }, 1500)
      }
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Subtle scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // Draw walls with crosshatch fill
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      for (const wall of wallsRef.current) {
        // Outline
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height)
        
        // Crosshatch fill
        ctx.save()
        ctx.beginPath()
        ctx.rect(wall.x, wall.y, wall.width, wall.height)
        ctx.clip()
        
        ctx.strokeStyle = '#004422'
        ctx.lineWidth = 1
        const spacing = 8
        
        // Diagonal lines (top-left to bottom-right)
        for (let i = -wall.height; i < wall.width + wall.height; i += spacing) {
          ctx.beginPath()
          ctx.moveTo(wall.x + i, wall.y)
          ctx.lineTo(wall.x + i + wall.height, wall.y + wall.height)
          ctx.stroke()
        }
        
        // Diagonal lines (top-right to bottom-left)
        for (let i = 0; i < wall.width + wall.height; i += spacing) {
          ctx.beginPath()
          ctx.moveTo(wall.x + wall.width - i + wall.height, wall.y)
          ctx.lineTo(wall.x + wall.width - i, wall.y + wall.height)
          ctx.stroke()
        }
        
        ctx.restore()
        
        // Re-draw outline on top
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height)
      }

      // Draw tanks
      for (const tank of tanksRef.current) {
        if (tank.state === 'exploding') {
          // Explosion flash
          ctx.strokeStyle = '#ff4444'
          ctx.lineWidth = 2
          const flashSize = 25 * (tank.explodeTime / 1000)
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Date.now() * 0.01
            ctx.beginPath()
            ctx.moveTo(tank.pos.x, tank.pos.y)
            ctx.lineTo(tank.pos.x + Math.cos(a) * flashSize, tank.pos.y + Math.sin(a) * flashSize)
            ctx.stroke()
          }
          continue
        }

        ctx.save()
        ctx.translate(tank.pos.x, tank.pos.y)
        ctx.rotate(tank.angle)

        // Color based on health: white (2), orange (1)
        const tankColor = tank.health === 2 ? '#ffffff' : '#ffaa00'
        ctx.strokeStyle = tankColor
        ctx.lineWidth = 2

        // Left track (outer housing)
        ctx.beginPath()
        ctx.moveTo(-20, -16)
        ctx.lineTo(16, -16)
        ctx.lineTo(20, -13)
        ctx.lineTo(20, -9)
        ctx.lineTo(-18, -9)
        ctx.lineTo(-22, -12)
        ctx.closePath()
        ctx.stroke()

        // Right track (outer housing)
        ctx.beginPath()
        ctx.moveTo(-20, 16)
        ctx.lineTo(16, 16)
        ctx.lineTo(20, 13)
        ctx.lineTo(20, 9)
        ctx.lineTo(-18, 9)
        ctx.lineTo(-22, 12)
        ctx.closePath()
        ctx.stroke()

        // Animated track treads (left)
        const trackSpacing = 6
        for (let i = -3; i <= 3; i++) {
          const xOff = (i * trackSpacing + tank.trackOffset) % (trackSpacing * 7) - trackSpacing * 3.5
          if (xOff > -20 && xOff < 18) {
            ctx.beginPath()
            ctx.moveTo(xOff, -16)
            ctx.lineTo(xOff, -9)
            ctx.stroke()
          }
        }

        // Animated track treads (right)
        for (let i = -3; i <= 3; i++) {
          const xOff = (i * trackSpacing + tank.trackOffset) % (trackSpacing * 7) - trackSpacing * 3.5
          if (xOff > -20 && xOff < 18) {
            ctx.beginPath()
            ctx.moveTo(xOff, 16)
            ctx.lineTo(xOff, 9)
            ctx.stroke()
          }
        }

        // Hull body (angled armor)
        ctx.beginPath()
        ctx.moveTo(-15, -8)
        ctx.lineTo(10, -8)
        ctx.lineTo(14, -5)
        ctx.lineTo(14, 5)
        ctx.lineTo(10, 8)
        ctx.lineTo(-15, 8)
        ctx.lineTo(-18, 5)
        ctx.lineTo(-18, -5)
        ctx.closePath()
        ctx.stroke()

        // Front armor detail
        ctx.beginPath()
        ctx.moveTo(10, -6)
        ctx.lineTo(12, -4)
        ctx.lineTo(12, 4)
        ctx.lineTo(10, 6)
        ctx.stroke()

        // Turret ring
        ctx.beginPath()
        ctx.arc(-2, 0, 9, 0, Math.PI * 2)
        ctx.stroke()

        // Turret top
        ctx.beginPath()
        ctx.arc(-2, 0, 6, 0, Math.PI * 2)
        ctx.stroke()

        // Main gun barrel
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(4, 0)
        ctx.lineTo(26, 0)
        ctx.stroke()

        // Muzzle brake
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(24, -3)
        ctx.lineTo(28, -3)
        ctx.lineTo(28, 3)
        ctx.lineTo(24, 3)
        ctx.stroke()

        ctx.restore()
      }

      // Draw helicopters
      for (const heli of helicoptersRef.current) {
        if (heli.state === 'exploding') {
          ctx.strokeStyle = '#ffaa00'
          ctx.lineWidth = 2
          const flashSize = 25 * (heli.explodeTime / 1000)
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + Date.now() * 0.01
            ctx.beginPath()
            ctx.moveTo(heli.pos.x, heli.pos.y)
            ctx.lineTo(heli.pos.x + Math.cos(a) * flashSize, heli.pos.y + Math.sin(a) * flashSize)
            ctx.stroke()
          }
          continue
        }

        ctx.save()
        ctx.translate(heli.pos.x, heli.pos.y)
        ctx.rotate(heli.angle)

        ctx.strokeStyle = '#ffaa00'
        ctx.lineWidth = 2

        // Simple fuselage body
        ctx.beginPath()
        ctx.moveTo(12, 0)
        ctx.lineTo(6, -5)
        ctx.lineTo(-6, -5)
        ctx.lineTo(-6, 5)
        ctx.lineTo(6, 5)
        ctx.closePath()
        ctx.stroke()

        // Cockpit bubble
        ctx.beginPath()
        ctx.arc(8, 0, 4, -Math.PI / 2, Math.PI / 2)
        ctx.stroke()

        // Tail boom
        ctx.beginPath()
        ctx.moveTo(-6, -2)
        ctx.lineTo(-24, -2)
        ctx.lineTo(-24, 2)
        ctx.lineTo(-6, 2)
        ctx.stroke()

        // Tail fin
        ctx.beginPath()
        ctx.moveTo(-22, -2)
        ctx.lineTo(-26, -8)
        ctx.lineTo(-24, -8)
        ctx.stroke()

        // Tail rotor
        const tailRotorAngle = heli.rotorAngle * 1.5
        ctx.beginPath()
        ctx.moveTo(-25 + Math.cos(tailRotorAngle) * 4, -8 + Math.sin(tailRotorAngle) * 4)
        ctx.lineTo(-25 + Math.cos(tailRotorAngle + Math.PI) * 4, -8 + Math.sin(tailRotorAngle + Math.PI) * 4)
        ctx.stroke()

        // Landing skids
        ctx.beginPath()
        ctx.moveTo(-4, 6)
        ctx.lineTo(8, 6)
        ctx.moveTo(-4, -6)
        ctx.lineTo(8, -6)
        ctx.stroke()

        // Main rotor (2 blades, simple)
        ctx.beginPath()
        ctx.moveTo(Math.cos(heli.rotorAngle) * 20, Math.sin(heli.rotorAngle) * 20)
        ctx.lineTo(Math.cos(heli.rotorAngle + Math.PI) * 20, Math.sin(heli.rotorAngle + Math.PI) * 20)
        ctx.stroke()

        ctx.restore()
      }

      // Draw bullets
      for (const bullet of bulletsRef.current) {
        ctx.fillStyle = bullet.isEnemy ? '#ff4444' : '#00ff88'
        ctx.beginPath()
        ctx.arc(bullet.pos.x, bullet.pos.y, 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw debris
      for (const d of debrisRef.current) {
        const alpha = d.life / 1500
        ctx.strokeStyle = `rgba(255, 100, 100, ${alpha})`
        ctx.lineWidth = 2
        ctx.save()
        ctx.translate(d.pos.x, d.pos.y)
        ctx.rotate(d.angle)
        ctx.beginPath()
        ctx.moveTo(-d.length / 2, 0)
        ctx.lineTo(d.length / 2, 0)
        ctx.stroke()
        ctx.restore()
      }

      // Draw jeep
      const jeep = jeepRef.current
      if (jeep.state === 'active') {
          ctx.save()
          ctx.translate(jeep.pos.x, jeep.pos.y)
          ctx.rotate(jeep.angle)

          // Color based on health: white (3), orange (2), red (1)
          // Flash when hit
          if (jeep.hitFlash > 0 && Math.floor(jeep.hitFlash / 50) % 2 === 0) {
            ctx.strokeStyle = '#ffffff'
          } else {
            ctx.strokeStyle = jeep.health === 3 ? '#ffffff' : jeep.health === 2 ? '#ffaa00' : '#ff4444'
          }
          ctx.lineWidth = 2

          // Four tires - rectangular from top-down view with tread animation
          const drawTire = (tx: number, ty: number) => {
            // Tire outline (rectangle from above)
            const tireWidth = 8
            const tireHeight = 4
            ctx.beginPath()
            ctx.rect(tx - tireWidth / 2, ty - tireHeight / 2, tireWidth, tireHeight)
            ctx.stroke()
            // Animated tread lines
            const treadSpacing = 3
            for (let i = -1; i <= 1; i++) {
              const xOff = ((i * treadSpacing + jeep.wheelAngle * 3) % (treadSpacing * 3)) - treadSpacing * 1.5
              if (xOff > -tireWidth / 2 && xOff < tireWidth / 2) {
                ctx.beginPath()
                ctx.moveTo(tx + xOff, ty - tireHeight / 2)
                ctx.lineTo(tx + xOff, ty + tireHeight / 2)
                ctx.stroke()
              }
            }
          }

          drawTire(7, -8)
          drawTire(7, 8)
          drawTire(-7, -8)
          drawTire(-7, 8)

          // Simple jeep body - boxy military style
          ctx.beginPath()
          ctx.moveTo(12, -6)
          ctx.lineTo(12, 6)
          ctx.lineTo(-10, 6)
          ctx.lineTo(-12, 4)
          ctx.lineTo(-12, -4)
          ctx.lineTo(-10, -6)
          ctx.closePath()
          ctx.stroke()

          // Hood/front section line
          ctx.beginPath()
          ctx.moveTo(5, -6)
          ctx.lineTo(5, 6)
          ctx.stroke()

          // Windshield
          ctx.beginPath()
          ctx.moveTo(3, -5)
          ctx.lineTo(3, 5)
          ctx.stroke()

          // Gun mount
          ctx.beginPath()
          ctx.arc(-2, 0, 2, 0, Math.PI * 2)
          ctx.stroke()

          // Gun barrel
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(16, 0)
          ctx.stroke()

          ctx.restore()
      }
    }

    const animate = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = timestamp

      update(dt)
      draw()

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [gameState, score, wave, generateWalls, resetJeep, spawnEnemies, createDebris, lineIntersectsRect])

  const exitToGameSelect = () => {
    sounds.stopEngine()
    onExit()
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] uppercase">Urban Fire</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Arrow Keys / WASD: Move
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Space: Fire (max 2 shots)
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#ff4444]">›</span> <span className="text-[#ff4444]">Tanks need 2 hits</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#ffaa00]">›</span> <span className="text-[#ffaa00]">Helicopters need 1 hit</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Use buildings for cover!
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

      {gameState === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h2 className="text-4xl text-[#00ff88] mb-4 tracking-[0.3em] uppercase">Paused</h2>
            <p className="text-[#00ff88]/70 text-center mb-6 tracking-wider">Press P to resume • Press Esc to exit</p>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={() => {
                  sounds.startEngine()
                  setGameState('playing')
                }}
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

      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h2 className="text-4xl text-[#ff4444] mb-2 tracking-[0.3em] uppercase">Game Over</h2>
            <div className="text-center mb-8">
              <div className="text-[#00ff88] text-2xl mb-2 tracking-wider">{score.toString().padStart(6, '0')}</div>
              <div className="text-[#00ff88]/70 tracking-wider uppercase">Wave {wave}</div>
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
