import { useEffect, useRef, useState, useCallback } from 'react'

type Vector2 = { x: number; y: number }
type Vector3 = { x: number; y: number; z: number }

type GameState = 'menu' | 'playing' | 'paused' | 'goal' | 'gameOver'

type Vehicle = {
  pos: Vector2
  vel: Vector2
  angle: number
  wheelAngle: number
  side: 'left' | 'right'
}

type Ball = {
  pos: Vector2
  vel: Vector2
  radius: number
}

type AiOffenseState = 'orbit' | 'setup' | 'strike'

type AiMemory = {
  offenseState: AiOffenseState
  orbitSideSign: 1 | -1
  commitMs: number
  stuckMs: number
  lastPos: Vector2
  lastDistToBall: number
  heldDir: Vector2
  heldDirMs: number
}

type Bumper = {
  pos: Vector2
  radius: number
  hitTimer: number
}

type Goal = {
  pos: Vector2
  radius: number
  gravityRadius: number
  side: 'left' | 'right'
}

// Sound system
class SoundSystem {
  private ctx: AudioContext | null = null

  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
  }

  bump() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(200, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  kick() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(150, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.15)
  }

  wallBounce() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 120
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.05)
  }

  goal() {
    if (!this.ctx) return
    // Epic triumphant fanfare with bass hit
    
    // Bass hit first
    const bass = this.ctx.createOscillator()
    const bassGain = this.ctx.createGain()
    bass.type = 'sine'
    bass.frequency.setValueAtTime(80, this.ctx.currentTime)
    bass.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3)
    bassGain.gain.setValueAtTime(0.4, this.ctx.currentTime)
    bassGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3)
    bass.connect(bassGain)
    bassGain.connect(this.ctx.destination)
    bass.start()
    bass.stop(this.ctx.currentTime + 0.3)
    
    // Rising triumphant chord
    const freqs = [523, 659, 784, 1047] // C5, E5, G5, C6
    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.08)
      gain.gain.linearRampToValueAtTime(0.2, this.ctx!.currentTime + i * 0.08 + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + 1.2)
      osc.connect(gain)
      gain.connect(this.ctx!.destination)
      osc.start(this.ctx!.currentTime + i * 0.1)
      osc.stop(this.ctx!.currentTime + 0.8)
    })
  }

  engine() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 35
    gain.gain.setValueAtTime(0.03, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.1)
  }

  explosion() {
    if (!this.ctx) return

    // Short, punchy "boom" using layered oscillators.
    const now = this.ctx.currentTime

    const bass = this.ctx.createOscillator()
    const bassGain = this.ctx.createGain()
    bass.type = 'sine'
    bass.frequency.setValueAtTime(90, now)
    bass.frequency.exponentialRampToValueAtTime(35, now + 0.35)
    bassGain.gain.setValueAtTime(0.45, now)
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
    bass.connect(bassGain)
    bassGain.connect(this.ctx.destination)
    bass.start(now)
    bass.stop(now + 0.35)

    const crack = this.ctx.createOscillator()
    const crackGain = this.ctx.createGain()
    crack.type = 'square'
    crack.frequency.setValueAtTime(240, now)
    crack.frequency.exponentialRampToValueAtTime(70, now + 0.12)
    crackGain.gain.setValueAtTime(0.16, now)
    crackGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12)
    crack.connect(crackGain)
    crackGain.connect(this.ctx.destination)
    crack.start(now)
    crack.stop(now + 0.12)
  }
}

interface KickballGameProps {
  onExit: () => void
}

export function KickballGame({ onExit }: KickballGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const MATCH_TIME_MS = 3 * 60 * 1000
  const [gameState, setGameState] = useState<GameState>('menu')
  const [gameMode, setGameMode] = useState<'0p' | '1p' | '2p'>('2p')
  const [redScore, setRedScore] = useState(0)  // Left side (WASD player or AI)
  const [blueScore, setBlueScore] = useState(0) // Right side (Arrow player)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const timeLeftMsRef = useRef(MATCH_TIME_MS)

  type ExplosionParticle = { x: number; y: number; vx: number; vy: number; life: number; ttl: number; r: number; color: string }
  type ExplosionRing = { x: number; y: number; r: number; dr: number; life: number; ttl: number; color: string }
  const endSequenceRef = useRef<{
    msLeft: number
    explodedSides: Set<'left' | 'right'>
    particles: ExplosionParticle[]
    rings: ExplosionRing[]
  } | null>(null)

  const vehicle1Ref = useRef<Vehicle>({
    pos: { x: 200, y: 300 },
    vel: { x: 0, y: 0 },
    angle: 0,
    wheelAngle: 0,
    side: 'left',
  })

  const vehicle2Ref = useRef<Vehicle>({
    pos: { x: 600, y: 300 },
    vel: { x: 0, y: 0 },
    angle: Math.PI,
    wheelAngle: 0,
    side: 'right',
  })

  const ballRef = useRef<Ball>({
    pos: { x: 400, y: 300 },
    vel: { x: 0, y: 0 },
    radius: 30,
  })

  const bumpersRef = useRef<Bumper[]>([])
  const goalsRef = useRef<Goal[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const soundsRef = useRef<SoundSystem>(new SoundSystem())
  const engineTimerRef = useRef(0)
  const goalCelebrationRef = useRef(0)
  const lastScorerRef = useRef<'red' | 'blue'>('red')
  const goalFlashRef = useRef(0)
  const ripplesRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; color: string }[]>([])
  const ambientRipplesRef = useRef<{ goalSide: 'left' | 'right'; radius: number; maxRadius: number }[]>([])
  const drainAnimRef = useRef<{ goalPos: Vector2; startPos: Vector2; progress: number; spinAngle: number } | null>(null)

  const ballSpinAngleRef = useRef(0)
  const ballSpinAxisRef = useRef<Vector3>({ x: 0, y: 1, z: 0 })

  const ai1Ref = useRef<AiMemory>({ offenseState: 'orbit', orbitSideSign: 1, commitMs: 0, stuckMs: 0, lastPos: { x: 0, y: 0 }, lastDistToBall: Number.POSITIVE_INFINITY, heldDir: { x: 1, y: 0 }, heldDirMs: 0 })
  const ai2Ref = useRef<AiMemory>({ offenseState: 'orbit', orbitSideSign: -1, commitMs: 0, stuckMs: 0, lastPos: { x: 0, y: 0 }, lastDistToBall: Number.POSITIVE_INFINITY, heldDir: { x: -1, y: 0 }, heldDirMs: 0 })

  const fieldRef = useRef({
    left: 50,
    right: 750,
    top: 50,
    bottom: 550,
  })

  const generateField = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    const margin = 50
    const field = {
      left: margin,
      right: width - margin,
      top: margin,
      bottom: height - margin,
    }
    fieldRef.current = field

    const fieldWidth = field.right - field.left
    const fieldHeight = field.bottom - field.top
    const centerX = (field.left + field.right) / 2
    const centerY = (field.top + field.bottom) / 2

    // Generate bumpers in a pattern
    const bumpers: Bumper[] = []
    const bumperRadius = 20

    // Center circle bumper (just visual, the center is open)
    // Add bumpers in strategic positions
    
    // Top row
    bumpers.push({ pos: { x: centerX - fieldWidth * 0.25, y: field.top + fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: centerX + fieldWidth * 0.25, y: field.top + fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
    
    // Middle row (flanking center)
    bumpers.push({ pos: { x: centerX - fieldWidth * 0.15, y: centerY }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: centerX + fieldWidth * 0.15, y: centerY }, radius: bumperRadius, hitTimer: 0 })
    
    // Bottom row
    bumpers.push({ pos: { x: centerX - fieldWidth * 0.25, y: field.bottom - fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: centerX + fieldWidth * 0.25, y: field.bottom - fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })

    // Side bumpers near goals
    bumpers.push({ pos: { x: field.left + fieldWidth * 0.15, y: field.top + fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: field.left + fieldWidth * 0.15, y: field.bottom - fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: field.right - fieldWidth * 0.15, y: field.top + fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
    bumpers.push({ pos: { x: field.right - fieldWidth * 0.15, y: field.bottom - fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })

    bumpersRef.current = bumpers

    // Goals - circles with gravity (ball radius is 30, so 60+ allows full containment)
    const goalRadius = 60
    const goalGravityRadius = 200
    const goalOffset = 100 // Offset from field edge

    goalsRef.current = [
      { pos: { x: field.left + goalOffset, y: centerY }, radius: goalRadius, gravityRadius: goalGravityRadius, side: 'left' },
      { pos: { x: field.right - goalOffset, y: centerY }, radius: goalRadius, gravityRadius: goalGravityRadius, side: 'right' },
    ]
  }, [])

  const resetPositions = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    const centerX = width / 2
    const centerY = height / 2

    // Reset ball to center
    ballRef.current = {
      pos: { x: centerX, y: centerY },
      vel: { x: 0, y: 0 },
      radius: 30,
    }

    // Reset vehicle positions - each on their own side
    // Left vehicle (red) - controlled by WASD, tries to score on right goal (blue)
    vehicle1Ref.current = {
      pos: { x: centerX - 150, y: centerY },
      vel: { x: 0, y: 0 },
      angle: 0, // Facing right
      wheelAngle: 0,
      side: 'left',
    }
    
    // Right vehicle (blue) - controlled by arrows, tries to score on left goal (red)
    vehicle2Ref.current = {
      pos: { x: centerX + 150, y: centerY },
      vel: { x: 0, y: 0 },
      angle: Math.PI, // Facing left
      wheelAngle: 0,
      side: 'right',
    }
  }, [])

  const startGame = useCallback(() => {
    soundsRef.current.init()
    setRedScore(0)
    setBlueScore(0)
    timeLeftMsRef.current = MATCH_TIME_MS
    setGameOverIndex(0)
    generateField()
    resetPositions()
    setGameState('playing')
  }, [MATCH_TIME_MS, generateField, resetPositions])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }
      generateField()
    }
    resize()
    window.addEventListener('resize', resize)

    const sounds = soundsRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'playing') {
        setGameState('paused')
      } else if ((e.key === 'p' || e.key === 'Escape') && gameState === 'paused') {
        setGameState('playing')
      }

      // Menu navigation
      if (gameState === 'menu') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setMenuIndex((i) => (i > 0 ? i - 1 : 2))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setMenuIndex((i) => (i < 2 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (menuIndex === 0) { setGameMode('1p'); startGame() }
          else if (menuIndex === 1) { setGameMode('2p'); startGame() }
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

    let lastTime = performance.now()
    let animationId: number

    const update = (dt: number) => {
      if (gameState !== 'playing' && gameState !== 'goal') return

      // Match end sequence: play a quick explosion event before showing Game Over.
      if (endSequenceRef.current) {
        const endSeq = endSequenceRef.current
        endSeq.msLeft -= dt * 1000
        for (const p of endSeq.particles) {
          p.life -= dt * 1000
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vx *= 0.98
          p.vy *= 0.98
          p.vy += 220 * dt
        }
        endSeq.particles = endSeq.particles.filter(p => p.life > 0)

        for (const r of endSeq.rings) {
          r.life -= dt * 1000
          r.r += r.dr * dt
        }
        endSeq.rings = endSeq.rings.filter(r => r.life > 0)

        if (endSeq.msLeft <= 0) {
          endSequenceRef.current = null
          setGameState('gameOver')
        }
        return
      }

      // Match timer (max 5 minutes). Pause during goal celebration.
      if (gameState === 'playing') {
        timeLeftMsRef.current = Math.max(0, timeLeftMsRef.current - dt * 1000)
        if (timeLeftMsRef.current <= 0) {
          const explodedSides = new Set<'left' | 'right'>()
          if (redScore > blueScore) explodedSides.add('right')
          else if (blueScore > redScore) explodedSides.add('left')
          else {
            explodedSides.add('left')
            explodedSides.add('right')
          }

          const particles: ExplosionParticle[] = []
          const rings: ExplosionRing[] = []
          const spawnExplosion = (x: number, y: number, side: 'left' | 'right') => {
            const palette = side === 'left'
              ? ['#ff4444', '#ffaa00', '#ffffff']
              : ['#4444ff', '#00ff88', '#ffffff']
            const count = 90
            for (let i = 0; i < count; i++) {
              const a = Math.random() * Math.PI * 2
              const sp = 120 + Math.random() * 380
              const ttl = 650 + Math.random() * 550
              particles.push({
                x,
                y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 60,
                life: ttl,
                ttl,
                r: 1.5 + Math.random() * 2.2,
                color: palette[Math.floor(Math.random() * palette.length)],
              })
            }
            rings.push({ x, y, r: 10, dr: 420, life: 420, ttl: 420, color: palette[0] })
            rings.push({ x, y, r: 18, dr: 520, life: 520, ttl: 520, color: 'rgba(255,255,255,0.9)' })
          }

          const vehicle1 = vehicle1Ref.current
          const vehicle2 = vehicle2Ref.current
          if (explodedSides.has('left')) spawnExplosion(vehicle1.pos.x, vehicle1.pos.y, 'left')
          if (explodedSides.has('right')) spawnExplosion(vehicle2.pos.x, vehicle2.pos.y, 'right')

          sounds.explosion()
          endSequenceRef.current = { msLeft: 1200, explodedSides, particles, rings }
          return
        }
      }

      const field = fieldRef.current
      const vehicle1 = vehicle1Ref.current
      const vehicle2 = vehicle2Ref.current
      const ball = ballRef.current

      // Goal celebration pause
      if (gameState === 'goal') {
        goalCelebrationRef.current -= dt * 1000
        goalFlashRef.current = Math.max(0, goalFlashRef.current - dt * 2)
        
        // Update drain animation - ball spirals into center
        if (drainAnimRef.current) {
          const drain = drainAnimRef.current
          drain.progress = Math.min(1, drain.progress + dt * 2) // Complete in 0.5 seconds
          drain.spinAngle += dt * 15 // Fast spin
          
          // Spiral path - starts at ball position, spirals to goal center
          const t = drain.progress
          const easeT = 1 - Math.pow(1 - t, 3) // Ease out cubic - accelerates into drain
          const spiralRadius = (1 - easeT) * 40 // Spiral gets tighter
          
          // Update ball position to follow spiral
          ball.pos.x = drain.goalPos.x + Math.cos(drain.spinAngle) * spiralRadius
          ball.pos.y = drain.goalPos.y + Math.sin(drain.spinAngle) * spiralRadius
        }
        
        // Update ripples - shrink inward rapidly for goal celebration
        const rippleSpeed = 400
        ripplesRef.current = ripplesRef.current.filter(r => {
          r.radius -= rippleSpeed * dt
          return r.radius > r.maxRadius // maxRadius is now minimum (goal radius)
        })
        
        // Spawn new inward ripples rapidly during goal celebration
        if (drainAnimRef.current && ripplesRef.current.length < 8) {
          const lastRipple = ripplesRef.current[ripplesRef.current.length - 1]
          if (!lastRipple || lastRipple.radius < 350) {
            const goal = goalsRef.current.find(g => 
              g.pos.x === drainAnimRef.current!.goalPos.x
            )
            if (goal) {
              ripplesRef.current.push({
                x: goal.pos.x,
                y: goal.pos.y,
                radius: 400, // Start from far out
                maxRadius: goal.radius, // Shrink to goal radius
                color: goal.side === 'left' ? '#ff4444' : '#4444ff'
              })
            }
          }
        }
        
        if (goalCelebrationRef.current <= 0) {
          resetPositions()
          ripplesRef.current = []
          drainAnimRef.current = null
          setGameState('playing')
        }
        return
      }
      
      // Update ambient goal ripples (always active during play) - ripple inward
      const ambientRippleSpeed = 80
      ambientRipplesRef.current = ambientRipplesRef.current.filter(r => {
        r.radius -= ambientRippleSpeed * dt
        return r.radius > r.maxRadius // maxRadius is now the minimum (goal radius)
      })
      
      // Spawn ambient ripples for each goal - start at gravity radius, shrink to goal
      for (const goal of goalsRef.current) {
        const goalRipples = ambientRipplesRef.current.filter(r => r.goalSide === goal.side)
        const lastRipple = goalRipples[goalRipples.length - 1]
        if (!lastRipple || lastRipple.radius < goal.gravityRadius - 50) {
          ambientRipplesRef.current.push({
            goalSide: goal.side,
            radius: goal.gravityRadius,
            maxRadius: goal.radius // Now used as minimum radius
          })
        }
      }

      // Vehicle 1 controls - Red car
      // In 1 player mode: AI controls
      // In 2 player mode: WASD controls
      const accel = 350
      let isAccelerating = false

      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
      const normalizeAngle = (a: number) => {
        let angle = a
        while (angle > Math.PI) angle -= Math.PI * 2
        while (angle < -Math.PI) angle += Math.PI * 2
        return angle
      }

      const rotate = (v: Vector2, angle: number): Vector2 => {
        const c = Math.cos(angle)
        const s = Math.sin(angle)
        return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
      }

      const normalize = (v: Vector2): Vector2 => {
        const d = Math.hypot(v.x, v.y)
        if (d <= 0.0001) return { x: 1, y: 0 }
        return { x: v.x / d, y: v.y / d }
      }

      const segmentDistanceToPoint = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => {
        const abx = bx - ax
        const aby = by - ay
        const apx = px - ax
        const apy = py - ay
        const ab2 = abx * abx + aby * aby
        if (ab2 <= 0.0001) return Math.hypot(apx, apy)
        const t = clamp((apx * abx + apy * aby) / ab2, 0, 1)
        const cx = ax + abx * t
        const cy = ay + aby * t
        return Math.hypot(px - cx, py - cy)
      }

      const chooseDesiredDir = (
        ballPos: Vector2,
        baseDir: Vector2,
        scoringTarget: Vector2,
        attackGoal: Goal | undefined,
        avoidGoal: Goal | undefined,
      ) => {
        // Sample candidate directions around baseDir and pick the one that
        // best converts into a goal (when attacking) while still avoiding hazards.
        //
        // Key upgrade vs. pure geometry:
        // - incorporate goal gravity via a cheap rollout so the AI can intentionally
        //   "feed" the gravity well rather than only aiming at the goal center.
        const base = normalize(baseDir)
        const sampleAngles = [-1.1, -0.85, -0.6, -0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4, 0.6, 0.85, 1.1]
        const horizon = 420
        const ballClear = ballRef.current.radius + 14
        const ballRadius = ballRef.current.radius

        const rolloutScore = (dir: Vector2) => {
          if (!attackGoal) return 0

          // Start from current ball velocity plus a "strike" impulse along dir.
          const strikeImpulse = 240
          let vx = ball.vel.x + dir.x * strikeImpulse
          let vy = ball.vel.y + dir.y * strikeImpulse
          const v0 = Math.hypot(vx, vy)
          const maxV0 = 520
          if (v0 > maxV0) {
            vx = (vx / v0) * maxV0
            vy = (vy / v0) * maxV0
          }

          let px = ballPos.x
          let py = ballPos.y
          let bestDistToGoal = Number.POSITIVE_INFINITY

          // ~1.1s horizon at 30Hz is enough to see "capture" by gravity.
          const dtSim = 1 / 30
          const steps = 33
          const frictionPerFrame = 0.995

          for (let i = 0; i < steps; i++) {
            // Approximate the game's friction (which is applied per frame).
            const f = Math.pow(frictionPerFrame, dtSim * 60)
            vx *= f
            vy *= f

            // Gravity toward the attack goal.
            const gdx = attackGoal.pos.x - px
            const gdy = attackGoal.pos.y - py
            const gdist = Math.hypot(gdx, gdy)

            // Check if fully inside goal at any point in the rollout.
            if (gdist + ballRadius < attackGoal.radius) {
              // Strong win signal: earlier is better.
              return -20000 - i * 180
            }

            bestDistToGoal = Math.min(bestDistToGoal, gdist)

            if (gdist < attackGoal.gravityRadius && gdist > 0) {
              const gravityStrength = 400 * (1 - gdist / attackGoal.gravityRadius)
              const nx = gdx / gdist
              const ny = gdy / gdist
              vx += nx * gravityStrength * dtSim
              vy += ny * gravityStrength * dtSim
            }

            // Avoid our own goal well during rollout (especially important during clears).
            if (avoidGoal) {
              const odx = avoidGoal.pos.x - px
              const ody = avoidGoal.pos.y - py
              const od = Math.hypot(odx, ody)
              if (od < avoidGoal.gravityRadius && od > 0) {
                const danger = (avoidGoal.gravityRadius - od) / avoidGoal.gravityRadius
                // Treat this as a large negative outcome even if not yet "scored".
                return 9000 + danger * 9000 + i * 120
              }
            }

            px += vx * dtSim
            py += vy * dtSim

            // Bumper collisions (approximate the real physics; enough for planning).
            for (const bumper of bumpersRef.current) {
              const bdx = px - bumper.pos.x
              const bdy = py - bumper.pos.y
              const bd = Math.hypot(bdx, bdy)
              const minDist = bumper.radius + ballRadius
              if (bd < minDist && bd > 0) {
                const nx = bdx / bd
                const ny = bdy / bd
                const push = minDist - bd
                px += nx * push
                py += ny * push

                // Bounce with energy boost (mirrors game behavior).
                const dot = vx * nx + vy * ny
                vx -= 2.5 * dot * nx
                vy -= 2.5 * dot * ny
                const boostSpeed = 150
                vx += nx * boostSpeed
                vy += ny * boostSpeed
              }
            }

            // Rough wall bounces (mirrors game physics) so rollouts aren't overly optimistic.
            if (px < field.left + ballRadius) {
              px = field.left + ballRadius
              vx *= -0.8
            } else if (px > field.right - ballRadius) {
              px = field.right - ballRadius
              vx *= -0.8
            }
            if (py < field.top + ballRadius) {
              py = field.top + ballRadius
              vy *= -0.8
            } else if (py > field.bottom - ballRadius) {
              py = field.bottom - ballRadius
              vy *= -0.8
            }
          }

          // No goal during rollout: reward getting deep into the gravity well.
          // (Using bestDistToGoal is important; end-of-horizon can bounce away.)
          const wellBonus = attackGoal.gravityRadius > 0
            ? clamp((attackGoal.gravityRadius - bestDistToGoal) / attackGoal.gravityRadius, 0, 1)
            : 0
          return bestDistToGoal - wellBonus * 260
        }

        let bestDir = base
        let bestScore = Number.POSITIVE_INFINITY

        for (const a of sampleAngles) {
          const dir = normalize(rotate(base, a))
          const endX = ballPos.x + dir.x * horizon
          const endY = ballPos.y + dir.y * horizon

          // Primary objective: progress toward scoringTarget (goal center for attack, center-ish for defense).
          const distToTarget = Math.hypot(scoringTarget.x - endX, scoringTarget.y - endY)
          let score = distToTarget

          // Gravity-aware scoring when attacking.
          score += rolloutScore(dir)

          // Penalize paths that would clip bumpers.
          for (const bumper of bumpersRef.current) {
            const d = segmentDistanceToPoint(ballPos.x, ballPos.y, endX, endY, bumper.pos.x, bumper.pos.y)
            const minSafe = bumper.radius + ballClear
            if (d < minSafe) {
              score += (minSafe - d) * 30
            }
          }

          // Avoid drifting into our own goal / gravity well.
          if (avoidGoal) {
            const d0 = segmentDistanceToPoint(ballPos.x, ballPos.y, endX, endY, avoidGoal.pos.x, avoidGoal.pos.y)
            if (d0 < avoidGoal.gravityRadius + 30) {
              score += (avoidGoal.gravityRadius + 30 - d0) * 18
            }
            const inner = avoidGoal.radius - ballRadius
            if (inner > 0 && d0 < inner) {
              score += 20000
            }
          }

          // Penalize hugging walls (makes the ball easy to pin and hard to re-angle).
          const wallPad = ballRadius + 55
          const distLeft = endX - field.left
          const distRight = field.right - endX
          const distTop = endY - field.top
          const distBottom = field.bottom - endY
          const wallMin = Math.min(distLeft, distRight, distTop, distBottom)
          if (wallMin < wallPad) {
            score += (wallPad - wallMin) * 8
          }

          // Mild penalty for aiming away from the base direction (keeps intent consistent).
          const alignment = dir.x * base.x + dir.y * base.y
          score += (1 - alignment) * 80

          if (score < bestScore) {
            bestScore = score
            bestDir = dir
          }
        }

        return bestDir
      }

      const applyAvoidanceToTarget = (
        vehicle: Vehicle,
        opponent: Vehicle,
        target: Vector2,
        mode: 'none' | 'hard' | 'soft',
      ) => {
        // Walls are always avoided; bumpers/opponent are soft or hard depending on mode.
        const vehicleRadiusForAvoid = 20
        let steerAwayX = 0
        let steerAwayY = 0

        // Hard avoidance is always applied when dangerously close.
        const hardOnly = mode === 'hard'
        const doSoft = mode === 'soft'

        for (const bumper of bumpersRef.current) {
          const toBumperX = bumper.pos.x - vehicle.pos.x
          const toBumperY = bumper.pos.y - vehicle.pos.y
          const distToBumper = Math.hypot(toBumperX, toBumperY)
          if (distToBumper <= 0) continue

          const hardDist = bumper.radius + vehicleRadiusForAvoid + 26
          if (distToBumper < hardDist) {
            const strength = (hardDist - distToBumper) / hardDist
            steerAwayX -= (toBumperX / distToBumper) * strength * 380
            steerAwayY -= (toBumperY / distToBumper) * strength * 380
            continue
          }

          if (!hardOnly && doSoft) {
            const avoidDist = bumper.radius + vehicleRadiusForAvoid + 120
            if (distToBumper < avoidDist) {
              const strength = (avoidDist - distToBumper) / avoidDist
              steerAwayX -= (toBumperX / distToBumper) * strength * 200
              steerAwayY -= (toBumperY / distToBumper) * strength * 200
            }
          }
        }

        // Opponent avoidance (soft/hard). Hard is only when very close.
        const toOpponentX = opponent.pos.x - vehicle.pos.x
        const toOpponentY = opponent.pos.y - vehicle.pos.y
        const distToOpponent = Math.hypot(toOpponentX, toOpponentY)
        if (distToOpponent > 0) {
          const hardDist = 52
          if (distToOpponent < hardDist) {
            const strength = (hardDist - distToOpponent) / hardDist
            steerAwayX -= (toOpponentX / distToOpponent) * strength * 260
            steerAwayY -= (toOpponentY / distToOpponent) * strength * 260
          } else if (!hardOnly && doSoft) {
            const avoidDist = 90
            if (distToOpponent < avoidDist) {
              const strength = (avoidDist - distToOpponent) / avoidDist
              steerAwayX -= (toOpponentX / distToOpponent) * strength * 120
              steerAwayY -= (toOpponentY / distToOpponent) * strength * 120
            }
          }
        }

        const wallMargin = 60
        if (vehicle.pos.x < field.left + wallMargin) {
          steerAwayX += (wallMargin - (vehicle.pos.x - field.left)) * 1.5
        }
        if (vehicle.pos.x > field.right - wallMargin) {
          steerAwayX -= (wallMargin - (field.right - vehicle.pos.x)) * 1.5
        }
        if (vehicle.pos.y < field.top + wallMargin) {
          steerAwayY += (wallMargin - (vehicle.pos.y - field.top)) * 1.5
        }
        if (vehicle.pos.y > field.bottom - wallMargin) {
          steerAwayY -= (wallMargin - (field.bottom - vehicle.pos.y)) * 1.5
        }

        return { x: target.x + steerAwayX, y: target.y + steerAwayY }
      }

      const applyAiDriving = (
        vehicle: Vehicle,
        moveTarget: Vector2,
        aimTarget: Vector2,
        accelMult: number,
        allowReverse: boolean,
        allowDetour: boolean,
        detourSideSign: 1 | -1,
      ) => {
        const planDetourAroundBumpers = (from: Vector2, to: Vector2, preferSideSign: 1 | -1) => {
          const dx = to.x - from.x
          const dy = to.y - from.y
          const dist = Math.hypot(dx, dy)
          if (dist < 120) return to

          const dirX = dx / dist
          const dirY = dy / dist
          const perpX = -dirY
          const perpY = dirX

          // Find the bumper that most threatens the straight-line path.
          let bestBumper: Bumper | null = null
          let bestPenetration = 0
          for (const bumper of bumpersRef.current) {
            const d = segmentDistanceToPoint(from.x, from.y, to.x, to.y, bumper.pos.x, bumper.pos.y)
            const expanded = bumper.radius + 42 // approx vehicle radius + safety
            const penetration = expanded - d
            if (penetration > bestPenetration) {
              bestPenetration = penetration
              bestBumper = bumper
            }
          }
          if (!bestBumper) return to

          // Choose detour side: prefer stable orbit side, but also avoid detouring *into* the bumper.
          const bx = bestBumper.pos.x - from.x
          const by = bestBumper.pos.y - from.y
          const cross = dirX * by - dirY * bx
          const sideFromGeometry: 1 | -1 = cross > 0 ? -1 : 1
          const side: 1 | -1 = (Math.abs(cross) > 25 ? sideFromGeometry : preferSideSign)

          const detourDist = bestBumper.radius + 105
          const waypoint = {
            x: bestBumper.pos.x + perpX * detourDist * side,
            y: bestBumper.pos.y + perpY * detourDist * side,
          }

          // Keep the waypoint on the field.
          const pad = 30
          return {
            x: clamp(waypoint.x, field.left + pad, field.right - pad),
            y: clamp(waypoint.y, field.top + pad, field.bottom - pad),
          }
        }

        // Route the move target around bumpers to prevent "slow ramming".
        const plannedMoveTarget = allowDetour
          ? planDetourAroundBumpers(vehicle.pos, moveTarget, detourSideSign)
          : moveTarget
        const isDetouring = allowDetour && (Math.hypot(plannedMoveTarget.x - moveTarget.x, plannedMoveTarget.y - moveTarget.y) > 1.5)

        // Only override aim when the phase already aims at the move target.
        // (Setup aims through the ball; we must not override that.)
        const aimIsMove = Math.hypot(aimTarget.x - moveTarget.x, aimTarget.y - moveTarget.y) < 1.5
        const plannedAimTarget = (isDetouring && aimIsMove) ? plannedMoveTarget : aimTarget

        const moveDx = plannedMoveTarget.x - vehicle.pos.x
        const moveDy = plannedMoveTarget.y - vehicle.pos.y
        const distToMoveTarget = Math.hypot(moveDx, moveDy)

        const aimDx = plannedAimTarget.x - vehicle.pos.x
        const aimDy = plannedAimTarget.y - vehicle.pos.y
        const distToAimTarget = Math.hypot(aimDx, aimDy)

        // If we're already at the aim target (or very close), don't force angle to atan2(0,0)=0.
        const targetAngle = distToAimTarget > 0.5 ? Math.atan2(aimDy, aimDx) : vehicle.angle
        const angleDiff = normalizeAngle(targetAngle - vehicle.angle)

        // Proportional steering (turn a bit faster when close to the target).
        const turnSpeed = 4.5 + (distToMoveTarget < 180 ? (180 - distToMoveTarget) / 180 * 2.2 : 0)
        const turn = clamp(angleDiff * 3.0, -turnSpeed, turnSpeed)
        vehicle.angle += turn * dt

        // Speed control: avoid overshooting the move target
        const closeSlowdown = distToMoveTarget < 120 ? distToMoveTarget / 120 : 1
        const facingOk = Math.abs(angleDiff) < Math.PI / 2

        // Additional speed limiting near bumpers (prevents ramming them),
        // but avoid globally slowing the AI down. Only slow when a bumper is
        // close AND roughly in front of the car, and never while detouring.
        let bumperSpeedMult = 1.0
        if (!isDetouring) {
          let nearestBumper: Bumper | null = null
          let nearestBumperDist = Number.POSITIVE_INFINITY
          for (const bumper of bumpersRef.current) {
            const d = Math.hypot(bumper.pos.x - vehicle.pos.x, bumper.pos.y - vehicle.pos.y) - bumper.radius
            if (d < nearestBumperDist) {
              nearestBumperDist = d
              nearestBumper = bumper
            }
          }

          if (nearestBumper && nearestBumperDist < 70) {
            const toBx = nearestBumper.pos.x - vehicle.pos.x
            const toBy = nearestBumper.pos.y - vehicle.pos.y
            const toBd = Math.hypot(toBx, toBy)
            if (toBd > 0.001) {
              const hx = Math.cos(vehicle.angle)
              const hy = Math.sin(vehicle.angle)
              const dotAhead = (hx * (toBx / toBd)) + (hy * (toBy / toBd))
              // Only slow if the bumper is actually in front.
              if (dotAhead > 0.35) {
                const t = clamp(nearestBumperDist / 70, 0.55, 1.0)
                bumperSpeedMult = t
              }
            }
          }
        }

        if (facingOk) {
          const effectiveAccel = accelMult * closeSlowdown * bumperSpeedMult
          if (effectiveAccel > 0.001) {
            vehicle.vel.x += Math.cos(vehicle.angle) * accel * effectiveAccel * dt
            vehicle.vel.y += Math.sin(vehicle.angle) * accel * effectiveAccel * dt
            isAccelerating = true
          }
        } else if (allowReverse && distToMoveTarget > 110) {
          vehicle.vel.x -= Math.cos(vehicle.angle) * accel * 0.35 * dt
          vehicle.vel.y -= Math.sin(vehicle.angle) * accel * 0.35 * dt
        }
      }

      const runKickballAi = (opts: {
        vehicle: Vehicle
        opponent: Vehicle
        memoryRef: React.MutableRefObject<AiMemory>
        attackGoal: Goal
        defendGoal: Goal
      }) => {
        const { vehicle, opponent, memoryRef, attackGoal, defendGoal } = opts
        const mem = memoryRef.current

        // Countdown "held direction" timer (used to prevent dead-ball dithering).
        if (mem.heldDirMs > 0) mem.heldDirMs = Math.max(0, mem.heldDirMs - dt * 1000)

        const carToBallX = ball.pos.x - vehicle.pos.x
        const carToBallY = ball.pos.y - vehicle.pos.y
        const carToBallDist = Math.hypot(carToBallX, carToBallY)

        // Decide whether we are in a "danger" situation and should clear defensively.
        const ballToDefGoalX = ball.pos.x - defendGoal.pos.x
        const ballToDefGoalY = ball.pos.y - defendGoal.pos.y
        const ballToDefGoalDist = Math.hypot(ballToDefGoalX, ballToDefGoalY)
        const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
        const ballIsStill = ballSpeed < 28

        const isOnOwnSide = defendGoal.side === 'left' ? ball.pos.x < (field.left + field.right) / 2 : ball.pos.x > (field.left + field.right) / 2
        const movingTowardOwnGoal = defendGoal.side === 'left' ? ball.vel.x < -40 : ball.vel.x > 40
        const nearOwnWell = ballToDefGoalDist < defendGoal.gravityRadius + 45
        const inDanger = nearOwnWell || (ballToDefGoalDist < 260) || (isOnOwnSide && movingTowardOwnGoal && ballSpeed > 80)

        // Emergency clear: ball is moving toward our goal and likely to enter soon.
        // In this mode, the defender should aggressively hit the ball away.
        const innerDefRadius = defendGoal.radius - ball.radius
        const tThreat = 0.45
        const threatEnd = { x: ball.pos.x + ball.vel.x * tThreat, y: ball.pos.y + ball.vel.y * tThreat }
        const segToGoalDist = innerDefRadius > 0
          ? segmentDistanceToPoint(ball.pos.x, ball.pos.y, threatEnd.x, threatEnd.y, defendGoal.pos.x, defendGoal.pos.y)
          : Number.POSITIVE_INFINITY
        const toDefX = defendGoal.pos.x - ball.pos.x
        const toDefY = defendGoal.pos.y - ball.pos.y
        const toDefD = Math.hypot(toDefX, toDefY)
        const towardDef = toDefD > 0.001 ? ((ball.vel.x * (toDefX / toDefD) + ball.vel.y * (toDefY / toDefD)) > 55) : false
        const emergencyClear = (segToGoalDist < (innerDefRadius + 10)) || (towardDef && ballToDefGoalDist < defendGoal.gravityRadius + 60)

        // Predict ball a bit so we hit the correct face when it's moving.
        // When the ball is nearly stopped, leading creates oscillation; treat it as stationary.
        let tLead = clamp(carToBallDist / 450, 0.12, 0.6)
        tLead += clamp(ballSpeed / 900, 0, 0.25)
        tLead = clamp(tLead, 0.12, 0.7)
        if (ballIsStill) tLead = 0.12

        const ballPred = ballIsStill
          ? { x: ball.pos.x, y: ball.pos.y }
          : { x: ball.pos.x + ball.vel.x * tLead, y: ball.pos.y + ball.vel.y * tLead }

        // Choose a strategic push direction.
        const attackBase = { x: attackGoal.pos.x - ballPred.x, y: attackGoal.pos.y - ballPred.y }
        const defendClearTarget = {
          x: (field.left + field.right) / 2 + (defendGoal.side === 'left' ? 120 : -120),
          y: (field.top + field.bottom) / 2,
        }

        // Defensive block point: get between ball and our goal to stop easy pushes.
        const toBallFromDefX = ballPred.x - defendGoal.pos.x
        const toBallFromDefY = ballPred.y - defendGoal.pos.y
        const toBallFromDefD = Math.hypot(toBallFromDefX, toBallFromDefY)
        const goalieDist = defendGoal.radius + 120
        const goaliePoint = toBallFromDefD > 0.001
          ? { x: defendGoal.pos.x + (toBallFromDefX / toBallFromDefD) * goalieDist, y: defendGoal.pos.y + (toBallFromDefY / toBallFromDefD) * goalieDist }
          : { x: defendGoal.pos.x + (defendGoal.side === 'left' ? 1 : -1) * goalieDist, y: defendGoal.pos.y }
        const defendBase = { x: defendClearTarget.x - ballPred.x, y: defendClearTarget.y - ballPred.y }

        const base = inDanger ? defendBase : attackBase
        const goalPosForScoring = inDanger ? defendClearTarget : attackGoal.pos
        let desiredDir = chooseDesiredDir(
          ballPred,
          base,
          goalPosForScoring,
          inDanger ? undefined : attackGoal,
          defendGoal,
        )

        // If the ball is near a wall, bias the desired direction to extract toward the center-ish
        // so the AI doesn't "give up" by endlessly trying unreachable contact points.
        const wallMargin = ball.radius + 52
        const dLeft = ballPred.x - field.left
        const dRight = field.right - ballPred.x
        const dTop = ballPred.y - field.top
        const dBottom = field.bottom - ballPred.y
        const wallMin = Math.min(dLeft, dRight, dTop, dBottom)
        if (!inDanger && wallMin < wallMargin) {
          let away = { x: 0, y: 0 }
          if (wallMin === dLeft) away = { x: 1, y: 0 }
          else if (wallMin === dRight) away = { x: -1, y: 0 }
          else if (wallMin === dTop) away = { x: 0, y: 1 }
          else away = { x: 0, y: -1 }

          const toGoal = normalize({ x: attackGoal.pos.x - ballPred.x, y: attackGoal.pos.y - ballPred.y })
          const mixed = normalize({ x: away.x * 0.8 + toGoal.x * 0.6, y: away.y * 0.8 + toGoal.y * 0.6 })

          // Re-pick around the mixed base to keep bumper awareness.
          desiredDir = chooseDesiredDir(
            ballPred,
            mixed,
            attackGoal.pos,
            attackGoal,
            defendGoal,
          )
        }

        // When the ball is basically stopped, hold the chosen direction briefly.
        // This keeps contact points stable and stops micro-oscillation.
        if (!inDanger && !emergencyClear && ballIsStill) {
          if (mem.heldDirMs > 0) {
            desiredDir = mem.heldDir
          } else {
            mem.heldDir = desiredDir
            mem.heldDirMs = 380
          }
        } else {
          mem.heldDirMs = 0
        }

        // Where the car can actually be (center point constraints)
        const vehicleRadiusForContact = 15
        const boundsPad = 8
        const minX = field.left + vehicleRadiusForContact + boundsPad
        const maxX = field.right - vehicleRadiusForContact - boundsPad
        const minY = field.top + vehicleRadiusForContact + boundsPad
        const maxY = field.bottom - vehicleRadiusForContact - boundsPad
        const isInBounds = (p: Vector2) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
        const clampToBounds = (p: Vector2): Vector2 => ({ x: clamp(p.x, minX, maxX), y: clamp(p.y, minY, maxY) })

        // Contact point: where the car should be so it pushes ball along desiredDir
        const contactOffset = ball.radius + vehicleRadiusForContact + 12
        let contactPoint = {
          x: ballPred.x - desiredDir.x * contactOffset,
          y: ballPred.y - desiredDir.y * contactOffset,
        }

        // If the "ideal" contact point is unreachable (ball near a wall), switch to a wall-bounce shot.
        // This avoids jittering/orbiting when the car can't physically get behind the ball.
        if (!isInBounds(contactPoint)) {
          const overLeft = minX - contactPoint.x
          const overRight = contactPoint.x - maxX
          const overTop = minY - contactPoint.y
          const overBottom = contactPoint.y - maxY

          // Pick the dominant out-of-bounds axis
          const maxOver = Math.max(overLeft, overRight, overTop, overBottom)

          const yTowardGoal = clamp((goalPosForScoring.y - ballPred.y) / 240, -0.6, 0.6)
          const xTowardGoal = clamp((goalPosForScoring.x - ballPred.x) / 240, -0.6, 0.6)

          if (maxOver === overLeft) {
            // Need to be too far left to strike toward goal => instead push ball into LEFT wall to bounce out
            desiredDir = { x: -1, y: yTowardGoal }
          } else if (maxOver === overRight) {
            desiredDir = { x: 1, y: yTowardGoal }
          } else if (maxOver === overTop) {
            desiredDir = { x: xTowardGoal, y: -1 }
          } else if (maxOver === overBottom) {
            desiredDir = { x: xTowardGoal, y: 1 }
          }

          const dd = Math.hypot(desiredDir.x, desiredDir.y)
          if (dd > 0.0001) desiredDir = { x: desiredDir.x / dd, y: desiredDir.y / dd }

          contactPoint = {
            x: ballPred.x - desiredDir.x * contactOffset,
            y: ballPred.y - desiredDir.y * contactOffset,
          }
        }

        // Always clamp the computed targets so we don't "orbit" to impossible points near walls.
        contactPoint = clampToBounds(contactPoint)

        const toCarX = vehicle.pos.x - ballPred.x
        const toCarY = vehicle.pos.y - ballPred.y
        const behindMetric = toCarX * desiredDir.x + toCarY * desiredDir.y
        // Increase margin slightly when the ball is still to avoid state jitter near the ball.
        const behindEnough = behindMetric < (ballIsStill ? -28 : -18)
        const wrongSide = behindMetric > (ballIsStill ? 28 : 18)

        const perp = { x: -desiredDir.y, y: desiredDir.x }
        const cross = toCarX * desiredDir.y - toCarY * desiredDir.x
        // Reduce orbit-side jitter near walls / close geometry
        if (!ballIsStill && Math.abs(cross) > 35) {
          memoryRef.current.orbitSideSign = cross > 0 ? 1 : -1
        }

        // State machine: orbit -> setup -> strike
        const facing = { x: Math.cos(vehicle.angle), y: Math.sin(vehicle.angle) }
        const headingAlign = facing.x * desiredDir.x + facing.y * desiredDir.y
        const distToContact = Math.hypot(contactPoint.x - vehicle.pos.x, contactPoint.y - vehicle.pos.y)
        const distToBallPred = Math.hypot(ballPred.x - vehicle.pos.x, ballPred.y - vehicle.pos.y)

        // Possession / yielding (critical for AI-vs-AI): avoid both cars crowding a dead ball.
        const oppDistToBallPred = Math.hypot(ballPred.x - opponent.pos.x, ballPred.y - opponent.pos.y)
        const oppToBallX = opponent.pos.x - ballPred.x
        const oppToBallY = opponent.pos.y - ballPred.y
        const oppBehindMetric = oppToBallX * desiredDir.x + oppToBallY * desiredDir.y
        const opponentHasBetterAngle = oppBehindMetric < behindMetric - 14
        const clearlyFarther = distToBallPred > oppDistToBallPred + 18
        const nearTie = Math.abs(distToBallPred - oppDistToBallPred) < 10
        const tieBreakerYield = nearTie && vehicle.side === 'right'
        // Don't yield purely on "angle" if we're clearly closer.
        const closerByLot = distToBallPred + 14 < oppDistToBallPred
        const shouldYield = !inDanger && !emergencyClear && ballIsStill && !closerByLot && (clearlyFarther || (opponentHasBetterAngle && oppDistToBallPred <= distToBallPred + 10) || tieBreakerYield)

        // Countdown commit timer (reduces state flip-flopping).
        if (mem.commitMs > 0) mem.commitMs = Math.max(0, mem.commitMs - dt * 1000)

        // Simple stuck detector: if we're not making progress toward the ball, flip orbit side.
        const distToBallNow = Math.hypot(ballPred.x - vehicle.pos.x, ballPred.y - vehicle.pos.y)
        if (!Number.isFinite(mem.lastDistToBall)) {
          mem.lastPos = { x: vehicle.pos.x, y: vehicle.pos.y }
          mem.lastDistToBall = distToBallNow
          mem.stuckMs = 0
        }
        const moved = Math.hypot(vehicle.pos.x - mem.lastPos.x, vehicle.pos.y - mem.lastPos.y)
        const progress = mem.lastDistToBall - distToBallNow
        const verySlow = moved < 0.6
        const notProgressing = progress < 0.2
        if (verySlow && notProgressing) mem.stuckMs += dt * 1000
        else mem.stuckMs = Math.max(0, mem.stuckMs - dt * 650)
        mem.lastPos = { x: vehicle.pos.x, y: vehicle.pos.y }
        mem.lastDistToBall = distToBallNow

        if (mem.stuckMs > 520) {
          mem.orbitSideSign = (mem.orbitSideSign === 1 ? -1 : 1)
          mem.offenseState = 'orbit'
          mem.commitMs = 220
          mem.stuckMs = 0
        }

        // Only allow state changes when not committed.
        const canChange = mem.commitMs <= 0

        // Dead-ball behavior: commit to getting the ball moving instead of orbit-dithering.
        if (!inDanger && ballIsStill && canChange && distToBallPred < 210) {
          if (mem.offenseState !== 'strike') {
            mem.offenseState = 'setup'
            mem.commitMs = Math.max(mem.commitMs, 420)
          }
        }

        if (mem.offenseState === 'strike') {
          // Once we overshoot the ball, go back to orbit
          if (canChange && (distToBallPred > 180 || wrongSide)) mem.offenseState = 'orbit'
        } else if (mem.offenseState === 'setup') {
          if (canChange && !behindEnough) mem.offenseState = 'orbit'
          else if (canChange && distToContact < 90 && headingAlign > (ballIsStill ? 0.05 : 0.25)) {
            mem.offenseState = 'strike'
            mem.commitMs = ballIsStill ? 520 : 280
          }
        } else {
          // orbit
          if (canChange && behindEnough && distToContact < 280) {
            mem.offenseState = 'setup'
            mem.commitMs = 220
          }
        }

        // When in danger, bias toward more decisive clears.
        if (inDanger && mem.offenseState === 'setup' && distToBallPred < 150) {
          mem.offenseState = 'strike'
          mem.commitMs = Math.max(mem.commitMs, 320)
        }

        const orbitRadius = wrongSide ? 200 : 150
        const orbitBack = contactOffset + 60
        let orbitTarget = {
          x: ballPred.x - desiredDir.x * orbitBack + perp.x * orbitRadius * mem.orbitSideSign,
          y: ballPred.y - desiredDir.y * orbitBack + perp.y * orbitRadius * mem.orbitSideSign,
        }

        // If orbit target would push into top/bottom, flip orbit side
        if (orbitTarget.y < field.top + 50 || orbitTarget.y > field.bottom - 50) {
          mem.orbitSideSign = (mem.orbitSideSign === 1 ? -1 : 1)
          orbitTarget = {
            x: ballPred.x - desiredDir.x * orbitBack + perp.x * orbitRadius * mem.orbitSideSign,
            y: ballPred.y - desiredDir.y * orbitBack + perp.y * orbitRadius * mem.orbitSideSign,
          }
        }

        orbitTarget = clampToBounds(orbitTarget)

        let moveTarget: Vector2
        let aimTarget: Vector2
        let accelMult = 1.0
        let allowAvoidance = true
        let allowReverse = true

        if (emergencyClear) {
          // Full send: hit the ball away from our goal as hard as possible.
          const away = normalize({ x: ballPred.x - defendGoal.pos.x, y: ballPred.y - defendGoal.pos.y })
          const centerBias = normalize({
            x: ((field.left + field.right) / 2) - ballPred.x,
            y: ((field.top + field.bottom) / 2) - ballPred.y,
          })
          const clearDir = normalize({ x: away.x * 0.9 + centerBias.x * 0.35, y: away.y * 0.9 + centerBias.y * 0.35 })
          moveTarget = { x: ballPred.x + clearDir.x * 420, y: ballPred.y + clearDir.y * 420 }
          aimTarget = moveTarget
          accelMult = 1.75
          allowAvoidance = false
          allowReverse = false
          mem.offenseState = 'strike'
          mem.commitMs = Math.max(mem.commitMs, 520)
        } else if (inDanger && distToBallPred > 140 && ballToDefGoalDist < 340) {
          // Goalkeeping: block first, then clear.
          moveTarget = goaliePoint
          aimTarget = ballPred
          accelMult = 1.05
          allowAvoidance = true
          allowReverse = true
        } else if (shouldYield) {
          // Support role: stay out of the immediate contest and give space.
          // Position behind the ball but offset, ready for the next touch.
          const supportBack = contactOffset + 170
          const supportSide = 160
          const support = clampToBounds({
            x: ballPred.x - desiredDir.x * supportBack + perp.x * supportSide * mem.orbitSideSign,
            y: ballPred.y - desiredDir.y * supportBack + perp.y * supportSide * mem.orbitSideSign,
          })
          moveTarget = support
          aimTarget = ballPred
          accelMult = 0.95
          allowAvoidance = true
          allowReverse = true
          mem.offenseState = 'orbit'
        } else if (mem.offenseState === 'orbit') {
          moveTarget = orbitTarget
          aimTarget = orbitTarget
          accelMult = carToBallDist > 260 ? 1.05 : 0.95
          allowAvoidance = true
          allowReverse = true
        } else if (mem.offenseState === 'setup') {
          // Move to contact point, but AIM through the ball so we don't stop facing a zero-vector.
          moveTarget = contactPoint
          aimTarget = { x: ballPred.x + desiredDir.x * 280, y: ballPred.y + desiredDir.y * 280 }

          // If far from the contact point, keep moving; when close, prioritize alignment.
          // Near walls / dead balls: allow a bit more "creep" to finish lining up instead of stalling.
          if (distToContact > 45) accelMult = 0.75
          else accelMult = headingAlign > 0.15 ? 0.65 : (ballIsStill ? 0.28 : 0.12)

          // Allow soft avoidance while far from the contact point (prevents bumper-route stalls),
          // but keep close-in setup clean. When ball is dead, allow a bit more maneuvering.
          allowAvoidance = distToContact > (ballIsStill ? 70 : 120)
          allowReverse = ballIsStill && distToContact > 120
        } else {
          // strike: drive through ball along desiredDir
          moveTarget = { x: ballPred.x + desiredDir.x * 360, y: ballPred.y + desiredDir.y * 360 }
          aimTarget = moveTarget
          if (!inDanger) {
            const dToAttackGoal = Math.hypot(attackGoal.pos.x - ballPred.x, attackGoal.pos.y - ballPred.y)
            // When the ball is already in the goal's gravity well, blasting it can actually reduce
            // conversion; prefer controlled pushes so gravity can "sink" the ball.
            if (dToAttackGoal < attackGoal.gravityRadius * 0.95) {
              accelMult = ballSpeed > 240 ? 0.9 : 1.1
            } else {
              accelMult = 1.25
            }
          } else {
            accelMult = 1.35
          }
          allowAvoidance = false
          allowReverse = false
        }

        // Avoidance can destabilize close-in ball control; keep it mostly for orbiting
        const avoidanceMode: 'none' | 'hard' | 'soft' = allowAvoidance && carToBallDist > 90 ? 'soft' : 'hard'
        const finalMoveTarget = applyAvoidanceToTarget(vehicle, opponent, moveTarget, avoidanceMode)
        const finalAimTarget = allowAvoidance ? finalMoveTarget : aimTarget
        const allowDetour = allowAvoidance && mem.offenseState !== 'strike' && distToBallPred > 120
        applyAiDriving(vehicle, finalMoveTarget, finalAimTarget, accelMult, allowReverse, allowDetour, mem.orbitSideSign)
      }
      
      if (gameMode === '1p' || gameMode === '0p') {
        const rightGoal = goalsRef.current.find(g => g.side === 'right')
        const leftGoal = goalsRef.current.find(g => g.side === 'left')
        if (rightGoal && leftGoal) {
          runKickballAi({
            vehicle: vehicle1,
            opponent: vehicle2,
            memoryRef: ai1Ref,
            attackGoal: rightGoal,
            defendGoal: leftGoal,
          })
        }
      } else {
        // 2 player mode - WASD controls
        if (keysRef.current.has('a')) {
          vehicle1.angle -= 4 * dt
        }
        if (keysRef.current.has('d')) {
          vehicle1.angle += 4 * dt
        }
        if (keysRef.current.has('w')) {
          vehicle1.vel.x += Math.cos(vehicle1.angle) * accel * dt
          vehicle1.vel.y += Math.sin(vehicle1.angle) * accel * dt
          isAccelerating = true
        }
        if (keysRef.current.has('s')) {
          vehicle1.vel.x -= Math.cos(vehicle1.angle) * accel * 0.5 * dt
          vehicle1.vel.y -= Math.sin(vehicle1.angle) * accel * 0.5 * dt
          isAccelerating = true
        }
      }

      // Vehicle 2 controls (Arrow keys) - Right/Blue car
      // In 0 player mode: AI controls blue car too
      if (gameMode === '0p') {
        const leftGoal = goalsRef.current.find(g => g.side === 'left')
        const rightGoal = goalsRef.current.find(g => g.side === 'right')
        if (leftGoal && rightGoal) {
          runKickballAi({
            vehicle: vehicle2,
            opponent: vehicle1,
            memoryRef: ai2Ref,
            attackGoal: leftGoal,
            defendGoal: rightGoal,
          })
        }
      } else {
        // Human controls
        if (keysRef.current.has('arrowleft')) {
          vehicle2.angle -= 4 * dt
        }
        if (keysRef.current.has('arrowright')) {
          vehicle2.angle += 4 * dt
        }
        if (keysRef.current.has('arrowup')) {
          vehicle2.vel.x += Math.cos(vehicle2.angle) * accel * dt
          vehicle2.vel.y += Math.sin(vehicle2.angle) * accel * dt
          isAccelerating = true
        }
        if (keysRef.current.has('arrowdown')) {
          vehicle2.vel.x -= Math.cos(vehicle2.angle) * accel * 0.5 * dt
          vehicle2.vel.y -= Math.sin(vehicle2.angle) * accel * 0.5 * dt
          isAccelerating = true
        }
      }

      // Engine sound
      if (isAccelerating) {
        engineTimerRef.current -= dt * 1000
        if (engineTimerRef.current <= 0) {
          engineTimerRef.current = 100
          sounds.engine()
        }
      }

      // Vehicle physics helper function
      const vRadius = 15
      const updateVehiclePhysics = (vehicle: Vehicle) => {
        // Drift physics
        const speed = Math.hypot(vehicle.vel.x, vehicle.vel.y)
        const gripFactor = Math.max(0.02, 0.08 - speed * 0.0003)
        const facingX = Math.cos(vehicle.angle)
        const facingY = Math.sin(vehicle.angle)
        const dot = vehicle.vel.x * facingX + vehicle.vel.y * facingY
        vehicle.vel.x += (facingX * dot - vehicle.vel.x) * gripFactor
        vehicle.vel.y += (facingY * dot - vehicle.vel.y) * gripFactor

        // Friction
        vehicle.vel.x *= 0.97
        vehicle.vel.y *= 0.97

        // Animate wheels
        vehicle.wheelAngle += speed * dt * 0.3

        // Move vehicle
        vehicle.pos.x += vehicle.vel.x * dt
        vehicle.pos.y += vehicle.vel.y * dt

        // Wall collision
        if (vehicle.pos.x < field.left + vRadius) {
          vehicle.pos.x = field.left + vRadius
          vehicle.vel.x *= -0.5
        }
        if (vehicle.pos.x > field.right - vRadius) {
          vehicle.pos.x = field.right - vRadius
          vehicle.vel.x *= -0.5
        }
        if (vehicle.pos.y < field.top + vRadius) {
          vehicle.pos.y = field.top + vRadius
          vehicle.vel.y *= -0.5
        }
        if (vehicle.pos.y > field.bottom - vRadius) {
          vehicle.pos.y = field.bottom - vRadius
          vehicle.vel.y *= -0.5
        }

        // Bumper collision
        for (const bumper of bumpersRef.current) {
          const dx = vehicle.pos.x - bumper.pos.x
          const dy = vehicle.pos.y - bumper.pos.y
          const dist = Math.hypot(dx, dy)
          const minDist = vRadius + bumper.radius
          if (dist < minDist && dist > 0) {
            const nx = dx / dist
            const ny = dy / dist
            const push = minDist - dist
            vehicle.pos.x += nx * push
            vehicle.pos.y += ny * push
            const dotV = vehicle.vel.x * nx + vehicle.vel.y * ny
            vehicle.vel.x -= 2.2 * dotV * nx
            vehicle.vel.y -= 2.2 * dotV * ny
            const boostSpeed = 120
            vehicle.vel.x += nx * boostSpeed
            vehicle.vel.y += ny * boostSpeed
            bumper.hitTimer = 200
            sounds.bump()
          }
        }
      }

      // Update both vehicles
      updateVehiclePhysics(vehicle1)
      updateVehiclePhysics(vehicle2)

      // Vehicle-Vehicle collision
      const v1v2Dx = vehicle2.pos.x - vehicle1.pos.x
      const v1v2Dy = vehicle2.pos.y - vehicle1.pos.y
      const v1v2Dist = Math.hypot(v1v2Dx, v1v2Dy)
      const v1v2MinDist = vRadius * 2
      if (v1v2Dist < v1v2MinDist && v1v2Dist > 0) {
        const nx = v1v2Dx / v1v2Dist
        const ny = v1v2Dy / v1v2Dist
        const push = (v1v2MinDist - v1v2Dist) / 2
        vehicle1.pos.x -= nx * push
        vehicle1.pos.y -= ny * push
        vehicle2.pos.x += nx * push
        vehicle2.pos.y += ny * push
        
        // Exchange momentum
        const relVelX = vehicle1.vel.x - vehicle2.vel.x
        const relVelY = vehicle1.vel.y - vehicle2.vel.y
        const relVelDot = relVelX * nx + relVelY * ny
        if (relVelDot > 0) {
          vehicle1.vel.x -= relVelDot * nx * 0.8
          vehicle1.vel.y -= relVelDot * ny * 0.8
          vehicle2.vel.x += relVelDot * nx * 0.8
          vehicle2.vel.y += relVelDot * ny * 0.8
          sounds.bump()
        }
      }

      // Ball physics
      const prevBallPos = { x: ball.pos.x, y: ball.pos.y }
      ball.vel.x *= 0.995 // Very low friction on ball
      ball.vel.y *= 0.995
      ball.pos.x += ball.vel.x * dt
      ball.pos.y += ball.vel.y * dt

      // Ball collision with walls
      // Goal gravity effect on ball
      for (const goal of goalsRef.current) {
        const dx = goal.pos.x - ball.pos.x
        const dy = goal.pos.y - ball.pos.y
        const dist = Math.hypot(dx, dy)

        // Continuous scoring check to avoid tunneling at high speeds.
        // If the ball center crosses into the inner goal circle at any point during this frame,
        // treat it as a score (equivalent to "fully inside" at some moment).
        const innerRadius = goal.radius - ball.radius
        const segDist = innerRadius > 0
          ? segmentDistanceToPoint(prevBallPos.x, prevBallPos.y, ball.pos.x, ball.pos.y, goal.pos.x, goal.pos.y)
          : Number.POSITIVE_INFINITY
        const enteredGoalThisFrame = segDist < innerRadius
        
        // Check if ball is FULLY inside goal (ball edge must be within goal circle)
        if (enteredGoalThisFrame || (dist + ball.radius < goal.radius)) {
          // Start drain animation
          drainAnimRef.current = {
            goalPos: { x: goal.pos.x, y: goal.pos.y },
            startPos: { x: ball.pos.x, y: ball.pos.y },
            progress: 0,
            spinAngle: 0
          }
          
          // Start ripple emanation from goal
          const rippleColor = goal.side === 'left' ? '#ff4444' : '#4444ff'
          ripplesRef.current = []
          // Create initial ripple
          ripplesRef.current.push({
            x: goal.pos.x,
            y: goal.pos.y,
            radius: goal.radius,
            maxRadius: 300,
            color: rippleColor
          })
          goalFlashRef.current = 1.0
          
          if (goal.side === 'left') {
            // Ball went in left (red) goal - Blue team (arrows) scored!
            setBlueScore(s => {
              const newScore = s + 1
              return newScore
            })
            lastScorerRef.current = 'blue'
          } else {
            // Ball went in right (blue) goal - Red team (WASD) scored!
            setRedScore(s => {
              const newScore = s + 1
              return newScore
            })
            lastScorerRef.current = 'red'
          }
          sounds.goal()
          goalCelebrationRef.current = 1500
          setGameState('goal')
          return
        }
        
        // Apply gravity when ball is within gravity radius
        if (dist < goal.gravityRadius && dist > 0) {
          const gravityStrength = 400 * (1 - dist / goal.gravityRadius) // Stronger as it gets closer
          const nx = dx / dist
          const ny = dy / dist
          ball.vel.x += nx * gravityStrength * dt
          ball.vel.y += ny * gravityStrength * dt
        }
      }

      // Ball collision with walls (no more goal openings in walls)
      if (ball.pos.x < field.left + ball.radius) {
        ball.pos.x = field.left + ball.radius
        ball.vel.x *= -0.8
        sounds.wallBounce()
      }
      if (ball.pos.x > field.right - ball.radius) {
        ball.pos.x = field.right - ball.radius
        ball.vel.x *= -0.8
        sounds.wallBounce()
      }
      if (ball.pos.y < field.top + ball.radius) {
        ball.pos.y = field.top + ball.radius
        ball.vel.y *= -0.8
        sounds.wallBounce()
      }
      if (ball.pos.y > field.bottom - ball.radius) {
        ball.pos.y = field.bottom - ball.radius
        ball.vel.y *= -0.8
        sounds.wallBounce()
      }

      // Ball collision with bumpers
      for (const bumper of bumpersRef.current) {
        // Decay hit timer
        if (bumper.hitTimer > 0) {
          bumper.hitTimer -= dt * 1000
        }
        
        const dx = ball.pos.x - bumper.pos.x
        const dy = ball.pos.y - bumper.pos.y
        const dist = Math.hypot(dx, dy)
        const minDist = ball.radius + bumper.radius
        if (dist < minDist && dist > 0) {
          const nx = dx / dist
          const ny = dy / dist
          const push = minDist - dist
          ball.pos.x += nx * push
          ball.pos.y += ny * push
          // Bounce with energy boost (like pinball)
          const dot = ball.vel.x * nx + ball.vel.y * ny
          ball.vel.x -= 2.5 * dot * nx
          ball.vel.y -= 2.5 * dot * ny
          // Add acceleration boost in bounce direction
          const boostSpeed = 150
          ball.vel.x += nx * boostSpeed
          ball.vel.y += ny * boostSpeed
          // Trigger animation
          bumper.hitTimer = 200
          sounds.bump()
        }
      }

      // Vehicle-Ball collision helper (vRadius defined above)
      const handleVehicleBallCollision = (vehicle: Vehicle) => {
        const bvDx = ball.pos.x - vehicle.pos.x
        const bvDy = ball.pos.y - vehicle.pos.y
        const bvDist = Math.hypot(bvDx, bvDy)
        const bvMinDist = ball.radius + vRadius
        if (bvDist < bvMinDist && bvDist > 0) {
          const nx = bvDx / bvDist
          const ny = bvDy / bvDist
          const push = bvMinDist - bvDist
          ball.pos.x += nx * push
          ball.pos.y += ny * push

          const relVelX = vehicle.vel.x - ball.vel.x
          const relVelY = vehicle.vel.y - ball.vel.y
          const relVelDot = relVelX * nx + relVelY * ny

          if (relVelDot > 0) {
            const kickPower = 1.8
            ball.vel.x += relVelDot * nx * kickPower
            ball.vel.y += relVelDot * ny * kickPower
            vehicle.vel.x -= relVelDot * nx * 0.3
            vehicle.vel.y -= relVelDot * ny * 0.3
            sounds.kick()
          }
        }
      }

      handleVehicleBallCollision(vehicle1)
      handleVehicleBallCollision(vehicle2)

      // Limit ball speed
      const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
      const maxBallSpeed = 600
      if (ballSpeed > maxBallSpeed) {
        ball.vel.x = (ball.vel.x / ballSpeed) * maxBallSpeed
        ball.vel.y = (ball.vel.y / ballSpeed) * maxBallSpeed
      }

      // Update ball spin so it visually rolls.
      // Rolling angular speed (no slip) is w = v / r, axis is perpendicular to velocity.
      const speedForSpin = Math.hypot(ball.vel.x, ball.vel.y)
      if (speedForSpin > 0.5) {
        const ax = -ball.vel.y
        const ay = ball.vel.x
        const al = Math.hypot(ax, ay)
        if (al > 0.0001) {
          ballSpinAxisRef.current = { x: ax / al, y: ay / al, z: 0 }
        }
        ballSpinAngleRef.current += (speedForSpin / Math.max(10, ball.radius)) * dt
      }
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current
      const field = fieldRef.current

      const normalize3 = (v: Vector3): Vector3 => {
        const d = Math.hypot(v.x, v.y, v.z)
        if (d <= 0.000001) return { x: 0, y: 0, z: 1 }
        return { x: v.x / d, y: v.y / d, z: v.z / d }
      }

      const dot3 = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z

      const cross3 = (a: Vector3, b: Vector3): Vector3 => ({
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
      })

      const rotateAroundAxis = (v: Vector3, axis: Vector3, angle: number): Vector3 => {
        // Rodrigues' rotation formula
        const k = normalize3(axis)
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const kv = dot3(k, v)
        const kxv = cross3(k, v)
        return {
          x: v.x * cos + kxv.x * sin + k.x * kv * (1 - cos),
          y: v.y * cos + kxv.y * sin + k.y * kv * (1 - cos),
          z: v.z * cos + kxv.z * sin + k.z * kv * (1 - cos),
        }
      }

      const projectSpherePoint = (centerX: number, centerY: number, radius: number, p: Vector3) => {
        // Mild fake perspective based on z
        const persp = 1 / (1 - p.z * 0.35)
        return {
          x: centerX + p.x * radius * persp,
          y: centerY + p.y * radius * persp,
          z: p.z,
        }
      }

      const drawSoccerBall = (x: number, y: number, r: number) => {
        ctx.save()
        // Ensure the ball isn't affected by any prior alpha/compositing state.
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'

        const spinAxis = ballSpinAxisRef.current
        const spinAngle = ballSpinAngleRef.current

        // Outline-only ball (no fill)

        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.clip()

        // Seams only: thin white arcs, front hemisphere only.
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = Math.max(1, Math.round(r * 0.03))
        ctx.lineCap = 'round'

        const seamPlanes: Vector3[] = [
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0, z: 1 },
          { x: 0.6, y: 0.2, z: 0.0 },
        ]

        for (const n0 of seamPlanes) {
          const n = normalize3(rotateAroundAxis(n0, spinAxis, spinAngle))
          const ref = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }
          const a = normalize3(cross3(n, ref))
          const b = cross3(n, a)

          ctx.beginPath()
          let started = false
          for (let i = 0; i <= 64; i++) {
            const t = (i / 64) * Math.PI * 2
            const p = normalize3({
              x: a.x * Math.cos(t) + b.x * Math.sin(t),
              y: a.y * Math.cos(t) + b.y * Math.sin(t),
              z: a.z * Math.cos(t) + b.z * Math.sin(t),
            })

            // Front hemisphere only.
            if (p.z < 0.08) {
              started = false
              continue
            }

            const pr = projectSpherePoint(x, y, r, p)
            if (!started) {
              ctx.moveTo(pr.x, pr.y)
              started = true
            } else {
              ctx.lineTo(pr.x, pr.y)
            }
          }
          ctx.stroke()
        }

        ctx.restore()

        // Outline
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.lineWidth = Math.max(2, Math.round(r * 0.08))
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()

        ctx.restore()
      }

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

      // Draw field
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 3

      // Field outline with rounded corners
      const cornerRadius = 30
      ctx.beginPath()
      ctx.moveTo(field.left + cornerRadius, field.top)
      ctx.lineTo(field.right - cornerRadius, field.top)
      ctx.arcTo(field.right, field.top, field.right, field.top + cornerRadius, cornerRadius)
      ctx.lineTo(field.right, field.bottom - cornerRadius)
      ctx.arcTo(field.right, field.bottom, field.right - cornerRadius, field.bottom, cornerRadius)
      ctx.lineTo(field.left + cornerRadius, field.bottom)
      ctx.arcTo(field.left, field.bottom, field.left, field.bottom - cornerRadius, cornerRadius)
      ctx.lineTo(field.left, field.top + cornerRadius)
      ctx.arcTo(field.left, field.top, field.left + cornerRadius, field.top, cornerRadius)
      ctx.closePath()
      ctx.stroke()

      // Goals - circles with gravity wells
      for (const goal of goalsRef.current) {
        const isScoring = gameState === 'goal' && drainAnimRef.current && 
          drainAnimRef.current.goalPos.x === goal.pos.x
        
        // Pulsing effect during goal celebration
        const pulseScale = isScoring ? 1 + Math.sin(Date.now() * 0.02) * 0.15 : 1
        const glowIntensity = isScoring ? 0.5 + Math.sin(Date.now() * 0.015) * 0.3 : 0
        
        // Ambient ripples emanating inward toward goal
        const goalRipples = ambientRipplesRef.current.filter(r => r.goalSide === goal.side)
        for (const ripple of goalRipples) {
          // Progress goes from 0 (at gravity radius) to 1 (at goal radius)
          const progress = (goal.gravityRadius - ripple.radius) / (goal.gravityRadius - goal.radius)
          const alpha = 0.1 + progress * 0.4 // Start light, get darker toward center
          ctx.strokeStyle = goal.side === 'left' ? `rgba(255, 68, 68, ${alpha})` : `rgba(68, 68, 255, ${alpha})`
          ctx.lineWidth = 1.5 + progress * 1.5 // Also get thicker
          ctx.beginPath()
          ctx.arc(goal.pos.x, goal.pos.y, ripple.radius, 0, Math.PI * 2)
          ctx.stroke()
        }
        
        // Gravity radius indicator (subtle)
        ctx.strokeStyle = goal.side === 'left' ? 'rgba(255, 68, 68, 0.2)' : 'rgba(68, 68, 255, 0.2)'
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.arc(goal.pos.x, goal.pos.y, goal.gravityRadius * pulseScale, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Outline-only pulse when scoring (no fills)
        if (isScoring && glowIntensity > 0) {
          ctx.strokeStyle = goal.side === 'left'
            ? `rgba(255, 68, 68, ${0.25 + glowIntensity * 0.35})`
            : `rgba(68, 68, 255, ${0.25 + glowIntensity * 0.35})`
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(goal.pos.x, goal.pos.y, goal.radius * pulseScale * 1.35, 0, Math.PI * 2)
          ctx.stroke()
        }
        
        // Goal circle
        ctx.strokeStyle = goal.side === 'left' ? '#ff4444' : '#4444ff'
        ctx.lineWidth = isScoring ? 4 : 3
        ctx.beginPath()
        ctx.arc(goal.pos.x, goal.pos.y, goal.radius * pulseScale, 0, Math.PI * 2)
        ctx.stroke()
        
        // No goal fill (outline-only)
      }

      // Draw bumpers
      for (const bumper of bumpersRef.current) {
        const isHit = bumper.hitTimer > 0
        const hitProgress = isHit ? bumper.hitTimer / 200 : 0
        
        // Outer ring - expands when hit
        const outerExpand = isHit ? 1 + hitProgress * 0.4 : 1
        ctx.strokeStyle = isHit ? '#ffffff' : '#ffaa00'
        ctx.lineWidth = isHit ? 3 : 2
        ctx.beginPath()
        ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius * outerExpand, 0, Math.PI * 2)
        ctx.stroke()
        
        // Inner ring - stays fixed
        ctx.strokeStyle = '#ffaa00'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius * 0.6, 0, Math.PI * 2)
        ctx.stroke()
        
        // Cross hatching in center
        const innerR = bumper.radius * 0.5
        ctx.strokeStyle = isHit ? '#ffffff' : '#ffaa00'
        ctx.lineWidth = 1
        // Diagonal lines one direction
        for (let i = -2; i <= 2; i++) {
          const offset = i * 8
          const x1 = bumper.pos.x + offset - innerR
          const y1 = bumper.pos.y - innerR
          const x2 = bumper.pos.x + offset + innerR
          const y2 = bumper.pos.y + innerR
          ctx.beginPath()
          ctx.moveTo(Math.max(bumper.pos.x - innerR, x1), Math.max(bumper.pos.y - innerR, y1 + (Math.max(bumper.pos.x - innerR, x1) - x1)))
          ctx.lineTo(Math.min(bumper.pos.x + innerR, x2), Math.min(bumper.pos.y + innerR, y2 - (x2 - Math.min(bumper.pos.x + innerR, x2))))
          ctx.stroke()
        }
        // Diagonal lines other direction
        for (let i = -2; i <= 2; i++) {
          const offset = i * 8
          const x1 = bumper.pos.x + offset - innerR
          const y1 = bumper.pos.y + innerR
          const x2 = bumper.pos.x + offset + innerR
          const y2 = bumper.pos.y - innerR
          ctx.beginPath()
          ctx.moveTo(Math.max(bumper.pos.x - innerR, x1), Math.min(bumper.pos.y + innerR, y1 - (Math.max(bumper.pos.x - innerR, x1) - x1)))
          ctx.lineTo(Math.min(bumper.pos.x + innerR, x2), Math.max(bumper.pos.y - innerR, y2 + (x2 - Math.min(bumper.pos.x + innerR, x2))))
          ctx.stroke()
        }
      }

      // Draw ball
      const ball = ballRef.current
      drawSoccerBall(ball.pos.x, ball.pos.y, ball.radius)

      // Draw vehicle helper function
      const drawVehicle = (vehicle: Vehicle) => {
        const endSeq = endSequenceRef.current
        if (endSeq && endSeq.explodedSides.has(vehicle.side)) return
        const color = vehicle.side === 'left' ? '#ff4444' : '#4444ff'
        ctx.save()
        ctx.translate(vehicle.pos.x, vehicle.pos.y)
        ctx.rotate(vehicle.angle)
        ctx.strokeStyle = color
        ctx.lineWidth = 2

        // Four tires
        const drawTire = (tx: number, ty: number) => {
          const tireWidth = 8
          const tireHeight = 4
          ctx.beginPath()
          ctx.rect(tx - tireWidth / 2, ty - tireHeight / 2, tireWidth, tireHeight)
          ctx.stroke()
          const treadSpacing = 3
          for (let i = -1; i <= 1; i++) {
            const xOff = ((i * treadSpacing + vehicle.wheelAngle * 3) % (treadSpacing * 3)) - treadSpacing * 1.5
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

        // Body
        ctx.beginPath()
        ctx.moveTo(12, -6)
        ctx.lineTo(12, 6)
        ctx.lineTo(-10, 6)
        ctx.lineTo(-12, 4)
        ctx.lineTo(-12, -4)
        ctx.lineTo(-10, -6)
        ctx.closePath()
        ctx.stroke()

        // Front bumper (for pushing)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(12, -7)
        ctx.lineTo(15, -5)
        ctx.lineTo(15, 5)
        ctx.lineTo(12, 7)
        ctx.stroke()

        ctx.restore()
      }

      // Draw both vehicles
      drawVehicle(vehicle1Ref.current)
      drawVehicle(vehicle2Ref.current)

      // Match end explosions
      if (endSequenceRef.current) {
        const endSeq = endSequenceRef.current

        // Rings
        for (const r of endSeq.rings) {
          const a = Math.max(0, r.life / r.ttl)
          ctx.save()
          ctx.globalAlpha = 0.7 * a
          ctx.strokeStyle = r.color
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }

        // Particles
        for (const p of endSeq.particles) {
          const a = Math.max(0, p.life / p.ttl)
          ctx.save()
          ctx.globalAlpha = a
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // Score display - Red (WASD) on left, Blue (Arrows) on right
      ctx.font = '48px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ff4444'
      ctx.fillText(redScore.toString(), width * 0.25, 40)
      ctx.fillStyle = '#4444ff'
      ctx.fillText(blueScore.toString(), width * 0.75, 40)

      // Time remaining (centered between scores)
      const totalSeconds = Math.ceil(timeLeftMsRef.current / 1000)
      const mm = Math.floor(totalSeconds / 60)
      const ss = totalSeconds % 60
      const timeText = `${mm}:${ss.toString().padStart(2, '0')}`
      ctx.textAlign = 'center'
      ctx.font = '26px monospace'
      ctx.fillStyle = '#00ff88'
      ctx.fillText(timeText, width / 2, 40)

      // Goal celebration effects
      if (gameState === 'goal') {
        // Screen flash effect
        if (goalFlashRef.current > 0) {
          ctx.fillStyle = lastScorerRef.current === 'blue' 
            ? `rgba(68, 68, 255, ${goalFlashRef.current * 0.3})` 
            : `rgba(255, 68, 68, ${goalFlashRef.current * 0.3})`
          ctx.fillRect(0, 0, width, height)
        }
        
        // Draw ripples - rushing inward with increasing intensity
        for (const ripple of ripplesRef.current) {
          const startRadius = 400
          const endRadius = ripple.maxRadius
          const progress = (startRadius - ripple.radius) / (startRadius - endRadius)
          const alpha = 0.3 + progress * 0.7 // Start light, get bright toward center
          ctx.strokeStyle = ripple.color
          ctx.globalAlpha = alpha
          ctx.lineWidth = 2 + progress * 4 // Get thicker as it rushes in
          ctx.beginPath()
          ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        
        // Pulsing GOAL text
        const pulse = 1 + Math.sin(Date.now() * 0.01) * 0.15
        ctx.font = `${Math.floor(64 * pulse)}px monospace`
        ctx.fillStyle = lastScorerRef.current === 'blue' ? '#4444ff' : '#ff4444'
        ctx.textAlign = 'center'
        
        // Text glow effect
        ctx.shadowColor = lastScorerRef.current === 'blue' ? '#4444ff' : '#ff4444'
        ctx.shadowBlur = 20
        ctx.fillText('GOAL!', width / 2, height / 2)
        ctx.fillText('GOAL!', width / 2, height / 2) // Draw twice for stronger glow
        ctx.shadowBlur = 0
      }
    }

    const gameLoop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time

      update(dt)
      draw()

      animationId = requestAnimationFrame(gameLoop)
    }

    animationId = requestAnimationFrame(gameLoop)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, gameMode, startGame, generateField, resetPositions, onExit, menuIndex, gameOverIndex, redScore, blueScore])

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Menu */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] font-mono">BUMPER BALL</h1>
            <p className="text-[#00ff88]/60 text-sm mb-8 tracking-widest">BUMP THE BALL INTO THE GOAL</p>
            <div className="flex flex-col gap-3">
              {['1 Player', '2 Players', 'Exit'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    if (i === 0) { setGameMode('1p'); startGame() }
                    else if (i === 1) { setGameMode('2p'); startGame() }
                    else onExit()
                  }}
                  className={`px-8 py-3 border-2 font-mono uppercase tracking-widest transition-colors ${
                    menuIndex === i
                      ? 'border-[#00ff88] bg-[#00ff88] text-black'
                      : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-8 text-[#00ff88]/50 text-xs tracking-widest">
              <p>1P: Arrow Keys to move</p>
              <p className="mt-1">2P: WASD + Arrows</p>
              <p className="mt-1">5:00 time limit — highest score wins.</p>
            </div>
          </div>
        </div>
      )}

      {/* Paused */}
      {gameState === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <h2 className="text-4xl text-[#00ff88] mb-4 tracking-[0.3em] font-mono">PAUSED</h2>
            <p className="text-[#00ff88]/60 text-sm tracking-widest">Press P or ESC to resume</p>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <h2 className="text-4xl text-[#00ff88] mb-2 tracking-[0.3em] font-mono">GAME OVER</h2>
            <p
              className={`text-2xl mb-6 font-mono ${
                redScore === blueScore ? 'text-[#00ff88]' : redScore > blueScore ? 'text-[#ff4444]' : 'text-[#4444ff]'
              }`}
            >
              {redScore === blueScore ? 'TIE GAME!' : redScore > blueScore ? 'RED WINS!' : 'BLUE WINS!'}
            </p>
            <p className="text-[#00ff88]/60 text-lg mb-6 font-mono">
              Final Score: <span className="text-[#ff4444]">{redScore}</span> - <span className="text-[#4444ff]">{blueScore}</span>
            </p>
            <div className="flex flex-col gap-3">
              {['Play Again', 'Main Menu', 'Exit'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    if (i === 0) startGame()
                    else if (i === 1) setGameState('menu')
                    else onExit()
                  }}
                  className={`px-8 py-3 border-2 font-mono uppercase tracking-widest transition-colors ${
                    gameOverIndex === i
                      ? 'border-[#00ff88] bg-[#00ff88] text-black'
                      : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
