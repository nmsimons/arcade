import { useCallback, useEffect, useRef, useState } from 'react'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import './vectorMenus.css'

// Sound system for Final Approach using Web Audio API
class LanderSoundSystem {
  private ctx: AudioContext | null = null
  private initialized = false
  private thrustGain: GainNode | null = null
  private thrustOsc: OscillatorNode | null = null
  private thrustNoise: AudioBufferSourceNode | null = null
  private thrusting = false

  init() {
    if (this.initialized) return
    this.ctx = new AudioContext()
    this.initialized = true
  }

  startThrust() {
    if (!this.ctx || this.thrusting) return
    this.thrusting = true

    // Create a rumbling thrust sound - low frequency oscillator + filtered noise
    const bufferSize = this.ctx.sampleRate * 2
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
    const output = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1
    }

    this.thrustNoise = this.ctx.createBufferSource()
    this.thrustNoise.buffer = noiseBuffer
    this.thrustNoise.loop = true

    // Low rumble oscillator
    this.thrustOsc = this.ctx.createOscillator()
    this.thrustOsc.type = 'sawtooth'
    this.thrustOsc.frequency.value = 80

    // Filter the noise for whoosh
    const noiseFilter = this.ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 400
    noiseFilter.Q.value = 1

    // Oscillator filter
    const oscFilter = this.ctx.createBiquadFilter()
    oscFilter.type = 'lowpass'
    oscFilter.frequency.value = 200

    // Gains
    const noiseGain = this.ctx.createGain()
    noiseGain.gain.value = 0.15

    const oscGain = this.ctx.createGain()
    oscGain.gain.value = 0.1

    // Master gain with fade in
    this.thrustGain = this.ctx.createGain()
    this.thrustGain.gain.setValueAtTime(0, this.ctx.currentTime)
    this.thrustGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.05)

    // Connect noise path
    this.thrustNoise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.thrustGain)

    // Connect oscillator path
    this.thrustOsc.connect(oscFilter)
    oscFilter.connect(oscGain)
    oscGain.connect(this.thrustGain)

    this.thrustGain.connect(this.ctx.destination)

    this.thrustNoise.start()
    this.thrustOsc.start()
  }

  stopThrust() {
    if (!this.ctx || !this.thrusting) return
    this.thrusting = false

    if (this.thrustGain) {
      this.thrustGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1)
    }

    setTimeout(() => {
      this.thrustNoise?.stop()
      this.thrustOsc?.stop()
      this.thrustNoise = null
      this.thrustOsc = null
      this.thrustGain = null
    }, 150)
  }

  explosion() {
    if (!this.ctx) return
    const duration = 1.0

    // Noise burst
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

    // Deep thump
    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(50, this.ctx.currentTime)
    thump.frequency.exponentialRampToValueAtTime(15, this.ctx.currentTime + 0.5)
    thumpGain.gain.setValueAtTime(0.6, this.ctx.currentTime)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start()
    thump.stop(this.ctx.currentTime + 0.5)
  }

  success() {
    if (!this.ctx) return
    // Pleasant landing chime - ascending notes
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.3, this.ctx!.currentTime + i * 0.15 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + i * 0.15 + 0.4)
      osc.connect(gain)
      gain.connect(this.ctx!.destination)
      osc.start(this.ctx!.currentTime + i * 0.15)
      osc.stop(this.ctx!.currentTime + i * 0.15 + 0.4)
    })
  }
}

const sounds = new LanderSoundSystem()

type FinalApproachGameProps = {
  onExit: () => void
}

type Vector2 = {
  x: number
  y: number
}

type Terrain = {
  points: Vector2[]
  pad: { x1: number; x2: number; y: number }
}

type Debris = {
  pos: Vector2
  vel: Vector2
  angle: number
  rotSpeed: number
  life: number
  length: number
  color: string
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeAngleRad(angle: number) {
  const twoPi = Math.PI * 2
  let a = angle % twoPi
  if (a > Math.PI) a -= twoPi
  if (a < -Math.PI) a += twoPi
  return a
}

function terrainYAtX(terrain: Terrain, x: number) {
  const pts = terrain.points
  if (pts.length < 2) return 0

  if (x <= pts[0].x) return pts[0].y
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x)
      return a.y + (b.y - a.y) * t
    }
  }

  return pts[pts.length - 1].y
}

function generateTerrain(width: number, height: number, difficulty: 'easy' | 'medium' | 'hard' = 'easy'): Terrain {
  const marginX = 24
  const baseY = height * 0.75
  const variation = height * 0.25

  // Difficulty settings
  const difficultySettings = {
    easy: { segments: 16, wave1: 0.3, wave2: 0.15, noise: 0.2, padWidth: 120 },
    medium: { segments: 24, wave1: 0.4, wave2: 0.25, noise: 0.35, padWidth: 100 },
    hard: { segments: 32, wave1: 0.5, wave2: 0.35, noise: 0.5, padWidth: 80 },
  }
  const settings = difficultySettings[difficulty]

  // Generate terrain with difficulty-based roughness
  const segmentCount = settings.segments
  const dx = (width - marginX * 2) / segmentCount

  // Start with anchor points
  const heights: number[] = []
  for (let i = 0; i <= segmentCount; i++) {
    // Rolling hills - use sine waves + noise scaled by difficulty
    const t = i / segmentCount
    const wave1 = Math.sin(t * Math.PI * 2) * variation * settings.wave1
    const wave2 = Math.sin(t * Math.PI * 4 + 1) * variation * settings.wave2
    const noise = (Math.random() - 0.5) * variation * settings.noise
    heights.push(baseY + wave1 + wave2 + noise)
  }

  // Pick a pad location (favor center-right area)
  const padWidth = Math.min(settings.padWidth, width * 0.15)
  const padSegment = Math.floor(segmentCount * 0.5) + Math.floor(Math.random() * 4)
  const padX1 = marginX + padSegment * dx
  const padX2 = padX1 + padWidth
  const padY = clamp(baseY + variation * 0.1, height * 0.5, height * 0.85)

  // Build terrain points, flattening the pad area
  const points: Vector2[] = []
  for (let i = 0; i <= segmentCount; i++) {
    const x = marginX + i * dx
    let y = heights[i]

    // Flatten points that fall within pad region
    if (x >= padX1 && x <= padX2) {
      y = padY
    }

    points.push({ x, y })
  }

  // Insert explicit pad endpoints if needed
  const finalPoints: Vector2[] = []
  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    const next = points[i + 1]

    // Insert left pad edge
    if (next && curr.x < padX1 && next.x > padX1) {
      finalPoints.push(curr)
      finalPoints.push({ x: padX1, y: padY })
      continue
    }

    // Insert right pad edge
    if (next && curr.x < padX2 && next.x > padX2) {
      finalPoints.push({ x: curr.x, y: curr.x >= padX1 ? padY : curr.y })
      finalPoints.push({ x: padX2, y: padY })
      continue
    }

    finalPoints.push(curr)
  }

  return { points: finalPoints, pad: { x1: padX1, x2: padX2, y: padY } }
}

export function FinalApproachGame({ onExit }: FinalApproachGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)

  const starfieldCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const starfieldSizeRef = useRef({ width: 0, height: 0 })

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'landed' | 'crashed' | 'exploding'>('menu')
  const [finalScore, setFinalScore] = useState(0)
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy')
  const fuelRef = useRef(100)
  const explosionTimerRef = useRef(0)

  const terrainRef = useRef<Terrain>({ points: [], pad: { x1: 0, x2: 0, y: 0 } })
  const canvasSizeRef = useRef({ width: 800, height: 600 })

  const landerRef = useRef({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    angle: -Math.PI / 2,
    radius: 14,
  })
  const debrisRef = useRef<Debris[]>([])

  const createDebris = useCallback((x: number, y: number, velX: number, velY: number) => {
    const debris: Debris[] = []
    const count = 12
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
      const speed = 60 + Math.random() * 120
      debris.push({
        pos: { x, y },
        vel: { x: velX * 0.3 + Math.cos(angle) * speed, y: velY * 0.3 + Math.sin(angle) * speed },
        angle: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 10,
        life: 2000 + Math.random() * 1000,
        length: 5 + Math.random() * 12,
        color: Math.random() > 0.3 ? '0, 255, 136' : '255, 100, 0',
      })
    }
    debrisRef.current = debris
  }, [])

  const resetWorld = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    terrainRef.current = generateTerrain(width, height, difficulty)

    landerRef.current = {
      pos: { x: width * 0.25, y: height * 0.15 },
      vel: { x: 25, y: 0 },
      angle: -Math.PI / 2,
      radius: 14,
    }

    fuelRef.current = 100
    debrisRef.current = []
  }, [difficulty])

  const startGame = useCallback(() => {
    sounds.init()
    resetWorld()
    setGameState('playing')
  }, [resetWorld])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
        return
      }

      if (e.key.toLowerCase() === 'p' && (gameState === 'playing' || gameState === 'paused')) {
        setGameState((s) => (s === 'playing' ? 'paused' : 'playing'))
      }
      if (e.key.toLowerCase() === 'r' && (gameState === 'landed' || gameState === 'crashed')) {
        startGame()
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
  }, [gameState, startGame, onExit])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }

      // Only regenerate terrain if not mid-game (landed/crashed should keep terrain)
      if (gameState === 'menu') {
        terrainRef.current = generateTerrain(canvas.width, canvas.height, difficulty)
        // Keep a pleasant initial lander position.
        landerRef.current.pos.x = canvas.width * 0.25
        landerRef.current.pos.y = canvas.height * 0.2
      }
    }

    // Only set canvas size without regenerating terrain for landed/crashed states
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    canvasSizeRef.current = { width: canvas.width, height: canvas.height }

    if (gameState === 'menu') {
      terrainRef.current = generateTerrain(canvas.width, canvas.height, difficulty)
      landerRef.current.pos.x = canvas.width * 0.25
      landerRef.current.pos.y = canvas.height * 0.2
    }

    window.addEventListener('resize', resize)

    // Gravity increases by 20% per difficulty level
    const baseGravity = 45 // px/s^2
    const gravityMultiplier = difficulty === 'easy' ? 1.0 : difficulty === 'medium' ? 1.2 : 1.44 // 20% increase per level
    const gravity = baseGravity * gravityMultiplier
    
    const thrustAccel = 260 // px/s^2
    const rotSpeed = 2.6 // rad/s
    const fuelBurnPerSecond = 18

    const checkCollision = () => {
      const lander = landerRef.current
      const terrain = terrainRef.current
      const terrainY = terrainYAtX(terrain, lander.pos.x)
      return lander.pos.y + lander.radius >= terrainY
    }

    const handleTouchdown = () => {
      const lander = landerRef.current
      const terrain = terrainRef.current

      const vx = lander.vel.x
      const vy = lander.vel.y
      const angle = normalizeAngleRad(lander.angle + Math.PI / 2) // 0 means upright

      const onPad = lander.pos.x >= terrain.pad.x1 && lander.pos.x <= terrain.pad.x2
      const safe = onPad && Math.abs(vx) < 30 && Math.abs(vy) < 40 && Math.abs(angle) < 0.22

      if (safe) {
        // Snap lander to be upright and planted on pad
        lander.angle = -Math.PI / 2 // Upright position
        lander.pos.y = terrain.pad.y - 16 // Landing legs are at y=16 in local coords
        setFinalScore(Math.max(0, Math.round(fuelRef.current)))
        sounds.stopThrust()
        sounds.success()
        setGameState('landed')
      } else {
        // Create explosion debris
        createDebris(lander.pos.x, lander.pos.y, lander.vel.x, lander.vel.y)
        explosionTimerRef.current = 2000 // 2 seconds for explosion to play out
        sounds.stopThrust()
        sounds.explosion()
        setGameState('exploding')
      }

      // Stop movement at first contact.
      lander.vel.x = 0
      lander.vel.y = 0
    }

    const update = (dt: number) => {
      // Handle explosion timer
      if (gameState === 'exploding') {
        explosionTimerRef.current -= dt * 1000
        if (explosionTimerRef.current <= 0) {
          setGameState('crashed')
        }
        // Still update debris during explosion
        debrisRef.current = debrisRef.current.filter((d) => {
          d.pos.x += d.vel.x * dt
          d.pos.y += d.vel.y * dt
          d.vel.y += gravity * 0.5 * dt
          d.angle += d.rotSpeed * dt
          d.life -= dt * 1000
          d.vel.x *= 0.99
          d.vel.y *= 0.99
          return d.life > 0
        })
        return
      }

      if (gameState !== 'playing') return

      const lander = landerRef.current

      // Rotation
      if (keysRef.current.has('arrowleft') || keysRef.current.has('a')) {
        lander.angle -= rotSpeed * dt
      }
      if (keysRef.current.has('arrowright') || keysRef.current.has('d')) {
        lander.angle += rotSpeed * dt
      }

      // Thrust (infinite, but burns score)
      const thrusting = keysRef.current.has('arrowup') || keysRef.current.has('w')
      if (thrusting) {
        const ax = Math.cos(lander.angle) * thrustAccel
        const ay = Math.sin(lander.angle) * thrustAccel
        lander.vel.x += ax * dt
        lander.vel.y += ay * dt

        fuelRef.current = clamp(fuelRef.current - fuelBurnPerSecond * dt, 0, 100)
        sounds.startThrust()
      } else {
        sounds.stopThrust()
      }

      // Gravity
      lander.vel.y += gravity * dt

      // Integrate
      lander.pos.x += lander.vel.x * dt
      lander.pos.y += lander.vel.y * dt

      // Bounds
      const { width, height } = canvasSizeRef.current
      lander.pos.x = clamp(lander.pos.x, 0, width)
      lander.pos.y = clamp(lander.pos.y, 0, height)

      // Touchdown / crash
      if (checkCollision()) {
        handleTouchdown()
      }

      // Update debris
      debrisRef.current = debrisRef.current.filter((d) => {
        d.pos.x += d.vel.x * dt
        d.pos.y += d.vel.y * dt
        d.vel.y += gravity * 0.5 * dt // debris affected by gravity too
        d.angle += d.rotSpeed * dt
        d.life -= dt * 1000
        d.vel.x *= 0.99
        d.vel.y *= 0.99
        return d.life > 0
      })
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current

      const terrain = terrainRef.current

      const ensureStarfield = () => {
        if (starfieldCanvasRef.current && starfieldSizeRef.current.width === width && starfieldSizeRef.current.height === height) return

        const off = document.createElement('canvas')
        off.width = width
        off.height = height
        const octx = off.getContext('2d')
        if (!octx) return

        // Sparse, subtle starfield.
        const count = Math.round((width * height) / 9000)
        for (let i = 0; i < count; i++) {
          const x = Math.random() * width
          const y = Math.random() * height
          const r = Math.random() < 0.85 ? 1 : 1.6
          const a = 0.18 + Math.random() * 0.35
          const greenish = Math.random() < 0.18
          octx.fillStyle = greenish ? `rgba(0, 255, 136, ${a * 0.55})` : `rgba(255, 255, 255, ${a})`
          octx.beginPath()
          octx.arc(x, y, r, 0, Math.PI * 2)
          octx.fill()
        }

        starfieldCanvasRef.current = off
        starfieldSizeRef.current = { width, height }
      }

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Starfield (behind everything; masked out under terrain)
      ensureStarfield()
      if (starfieldCanvasRef.current) {
        ctx.drawImage(starfieldCanvasRef.current, 0, 0)
      }

      // Mask stars out under the terrain by filling the ground.
      if (terrain.points.length > 1) {
        const leftY = terrainYAtX(terrain, 0)
        const rightY = terrainYAtX(terrain, width)
        ctx.save()
        ctx.fillStyle = '#0a0a0a'
        ctx.beginPath()
        // Ensure the ground polygon covers the full screen width.
        ctx.moveTo(0, leftY)
        for (let i = 0; i < terrain.points.length; i++) ctx.lineTo(terrain.points[i].x, terrain.points[i].y)
        ctx.lineTo(width, rightY)
        ctx.lineTo(width, height)
        ctx.lineTo(0, height)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // Subtle scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // Terrain
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 2
      ctx.beginPath()
      {
        const leftY = terrainYAtX(terrain, 0)
        const rightY = terrainYAtX(terrain, width)
        ctx.moveTo(0, leftY)
        terrain.points.forEach((p) => ctx.lineTo(p.x, p.y))
        ctx.lineTo(width, rightY)
      }
      ctx.stroke()

      // Landing pad highlight - color based on landing safety
      const lander = landerRef.current
      const onPad = lander.pos.x >= terrain.pad.x1 && lander.pos.x <= terrain.pad.x2
      const landerAngle = normalizeAngleRad(lander.angle + Math.PI / 2)
      const velocitySafe = Math.abs(lander.vel.x) < 30 && Math.abs(lander.vel.y) < 40
      const angleSafe = Math.abs(landerAngle) < 0.22
      
      let padColor = '#00ff88' // green - safe
      if (gameState === 'playing') {
        if (!onPad || !velocitySafe || !angleSafe) {
          padColor = '#ff4444' // red - would crash
        }
      }
      
      ctx.strokeStyle = padColor
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(terrain.pad.x1, terrain.pad.y)
      ctx.lineTo(terrain.pad.x2, terrain.pad.y)
      ctx.stroke()

      // Lander (hide if crashed or exploding)
      if (gameState !== 'crashed' && gameState !== 'exploding') {
        ctx.save()
        ctx.translate(lander.pos.x, lander.pos.y)
        ctx.rotate(lander.angle + Math.PI / 2) // rotate so "up" is the top of the lander

        const landerFill = '#0a0a0a'
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2

        // Apollo-style LM shape (pointing up in local coords)
        // Descent stage (boxy octagonal base)
        ctx.beginPath()
        ctx.moveTo(-10, 2)
        ctx.lineTo(-12, 6)
        ctx.lineTo(-10, 10)
        ctx.lineTo(10, 10)
        ctx.lineTo(12, 6)
        ctx.lineTo(10, 2)
        ctx.closePath()
        ctx.fillStyle = landerFill
        ctx.fill()
        ctx.stroke()

        // Ascent stage (angular cabin on top)
        ctx.beginPath()
        ctx.moveTo(-8, 2)
        ctx.lineTo(-8, -6)
        ctx.lineTo(-4, -12)
        ctx.lineTo(4, -12)
        ctx.lineTo(8, -6)
        ctx.lineTo(8, 2)
        ctx.closePath()
        ctx.fillStyle = landerFill
        ctx.fill()
        ctx.stroke()

        // Window (triangular)
        ctx.beginPath()
        ctx.moveTo(-3, -6)
        ctx.lineTo(0, -9)
        ctx.lineTo(3, -6)
        ctx.closePath()
        ctx.fillStyle = landerFill
        ctx.fill()
        ctx.stroke()

        // Antenna on top
        ctx.beginPath()
        ctx.moveTo(0, -12)
        ctx.lineTo(0, -16)
        ctx.moveTo(-2, -16)
        ctx.lineTo(2, -16)
        ctx.stroke()

        // Landing legs (4 legs splaying outward)
        ctx.beginPath()
        // Left leg
        ctx.moveTo(-10, 8)
        ctx.lineTo(-18, 16)
        ctx.moveTo(-18, 16)
        ctx.lineTo(-20, 16)
        ctx.lineTo(-16, 16)
        // Right leg  
        ctx.moveTo(10, 8)
        ctx.lineTo(18, 16)
        ctx.moveTo(18, 16)
        ctx.lineTo(20, 16)
        ctx.lineTo(16, 16)
        ctx.stroke()

        // Thrust flame (comes from bottom of descent stage)
        const thrusting = (keysRef.current.has('arrowup') || keysRef.current.has('w')) && gameState === 'playing'
        if (thrusting) {
          ctx.strokeStyle = '#ff6600'
          ctx.beginPath()
          ctx.moveTo(-5, 10)
          ctx.lineTo(0, 18 + Math.random() * 8)
          ctx.lineTo(5, 10)
          ctx.stroke()
        }

        ctx.restore()
      }

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

      // HUD
      if (gameState === 'playing' || gameState === 'paused') {
        const vx = lander.vel.x
        const vy = lander.vel.y
        const upright = normalizeAngleRad(lander.angle + Math.PI / 2)

        ctx.save()
        ctx.fillStyle = '#00ff88'
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.textBaseline = 'top'

        const hudX = 16
        const hudY = 16
        const lines = [
          `SCORE ${Math.max(0, Math.round(fuelRef.current))}`,
          `VX ${vx.toFixed(1)}`,
          `VY ${vy.toFixed(1)}`,
          `TILT ${(upright * (180 / Math.PI)).toFixed(0)}°`,
          'P PAUSE',
        ]

        lines.forEach((line, i) => {
          ctx.fillText(line, hudX, hudY + i * 16)
        })
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
  }, [gameState, difficulty, createDebris])

  const exitToGameSelect = () => {
    onExit()
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState === 'menu' && (
        <KeyboardDialog label="Final Approach" focusKey={gameState} onClose={exitToGameSelect} className="vector-menu-overlay">
          <div className="vector-menu-panel">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] uppercase">Final Approach</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Arrow Keys / WASD: Rotate + Thrust
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Land on the glowing pad
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> P: Pause
              </div>
            </div>
            <div className="mb-6">
              <p className="text-[#00ff88]/70 text-xs uppercase tracking-widest mb-3 text-center">Difficulty</p>
              <div className="flex gap-2">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                    className="vector-menu-difficulty"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={startGame}
                className="vector-menu-button vector-menu-primary"
                data-initial-focus
              >
                Start
              </button>
              <button
                onClick={exitToGameSelect}
                className="vector-menu-button"
              >
                Back
              </button>
            </div>
            <p className="text-[#00ff88]/70 text-xs text-center mt-4 tracking-wider">Arrows / Tab to select • Enter to confirm • Esc to exit</p>
          </div>
        </KeyboardDialog>
      )}

      {gameState === 'paused' && (
        <KeyboardDialog label="Final Approach paused" focusKey={gameState} onClose={exitToGameSelect} className="vector-menu-overlay">
          <div className="vector-menu-panel">
            <h2 className="text-4xl text-[#00ff88] mb-4 tracking-[0.3em] uppercase">Paused</h2>
            <p className="text-[#00ff88]/70 text-center mb-6 tracking-wider">Press P to resume • Press Esc to exit</p>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={() => setGameState('playing')}
                className="vector-menu-button"
              >
                Resume
              </button>
              <button
                onClick={exitToGameSelect}
                className="vector-menu-button"
              >
                Back
              </button>
            </div>
          </div>
        </KeyboardDialog>
      )}

      {(gameState === 'landed' || gameState === 'crashed') && (
        <KeyboardDialog label="Final Approach result" focusKey={gameState} onClose={exitToGameSelect} className="vector-menu-overlay">
          <div className="vector-menu-panel">
            <h2
              className={`text-4xl mb-6 text-center tracking-[0.3em] uppercase ${
                gameState === 'landed' ? 'text-[#00ff88]' : 'text-[#ff4444]'
              }`}
            >
              {gameState === 'landed' ? 'Landed' : 'Crashed'}
            </h2>
            {gameState === 'landed' && (
              <p className="text-[#00ff88] text-2xl text-center mb-4 tracking-wider">
                SCORE: {finalScore}
              </p>
            )}
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={startGame}
                className="vector-menu-button vector-menu-primary"
                data-initial-focus
              >
                Play Again
              </button>
              <button
                onClick={exitToGameSelect}
                className="vector-menu-button"
              >
                Back
              </button>
            </div>
            <p className="text-[#00ff88]/70 text-xs text-center mt-4 tracking-wider">Arrows / Tab to select • Enter to confirm</p>
          </div>
        </KeyboardDialog>
      )}
    </div>
  )
}
