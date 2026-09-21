import { useEffect, useEffectEvent, useRef, useState, useCallback } from 'react'
import { createControllerReader } from './hardVacuum/controllerInput'
import { controllerButtonLabel, controllerTurnLabel } from './hardVacuum/controllerLayouts'
import { controllerDialog, controlDialog, scrollDialog } from './hardVacuum/controllerUi'
import { neutralController } from './hardVacuum/flightInput'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { FIELD, CENTER, createArena, stepPhysics } from './bumperBall/physics'
import type { Ball, Bumper, Goal, Vehicle, Vector2 } from './bumperBall/physics'
import { advanceComputerBoost, createAiMemory, driveComputer } from './bumperBall/ai'
import { createBoost, startBoost, updateBoost } from './bumperBall/boost'
import { createVehicleAppearance, settleVehicleAppearance, stepVehicleAppearance } from './bumperBall/appearance'

import { COLORS, INK, drawCourt, drawGoal, drawBumper, drawBall, drawVehicle, drawScoreboard, drawBoostMeter } from './bumperBall/render'
import type { Vector3 } from './bumperBall/render'
import './bumperBall/bumperBall.css'

type GameState = 'menu' | 'playing' | 'paused' | 'goal' | 'gameOver'

// World coordinates stay fixed; resizing only changes the camera's view and zoom.
const BASE_VIEWPORT = { width: 1280, height: 800 } as const

// Sound system
class SoundSystem {
  private ctx: AudioContext | null = null

  init() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
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

  boost() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const now = this.ctx.currentTime
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(70, now)
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.2)
    gain.gain.setValueAtTime(0.01, now)
    gain.gain.linearRampToValueAtTime(0.12, now + 0.025)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start(now)
    osc.stop(now + 0.4)
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
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const MATCH_TIME_MS = 3 * 60 * 1000
  const [gameState, setGameState] = useState<GameState>('menu')
  const [redScore, setRedScore] = useState(0)  // Left side (computer)
  const [blueScore, setBlueScore] = useState(0) // Right side (player)
  const [controller] = useState(createControllerReader)
  const [controllerConnected, setControllerConnected] = useState(false)
  const controllerInputRef = useRef(neutralController())
  const boostRef = useRef(createBoost())
  const boostRequestedRef = useRef(false)
  const appearanceRef = useRef({ left: createVehicleAppearance(), right: createVehicleAppearance() })
  const pausedStateRef = useRef<'playing' | 'goal'>('playing')

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
    pos: { x: CENTER.x - 150, y: CENTER.y },
    vel: { x: 0, y: 0 },
    angle: 0,
    wheelAngle: 0,
    side: 'left',
  })

  const vehicle2Ref = useRef<Vehicle>({
    pos: { x: CENTER.x + 150, y: CENTER.y },
    vel: { x: 0, y: 0 },
    angle: Math.PI,
    wheelAngle: 0,
    side: 'right',
  })

  const ballRef = useRef<Ball>({
    pos: { ...CENTER },
    vel: { x: 0, y: 0 },
    radius: 30,
  })

  const bumpersRef = useRef<Bumper[]>([])
  const goalsRef = useRef<Goal[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const viewportSizeRef = useRef({ width: 800, height: 600 })
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

  const ai1Ref = useRef(createAiMemory())

  const generateField = useCallback(() => {
    const { bumpers, goals } = createArena()
    bumpersRef.current = bumpers
    goalsRef.current = goals
  }, [])

  const resetPositions = useCallback(() => {
    ai1Ref.current = createAiMemory()
    boostRef.current = createBoost()
    boostRequestedRef.current = false
    const { x: centerX, y: centerY } = CENTER
    appearanceRef.current = { left: createVehicleAppearance(), right: createVehicleAppearance() }

    // Reset ball to center
    ballRef.current = {
      pos: { x: centerX, y: centerY },
      vel: { x: 0, y: 0 },
      radius: 30,
    }

    // Reset vehicle positions - each on their own side
    // Left vehicle (red) - computer opponent, attacks the blue goal.
    vehicle1Ref.current = {
      pos: { x: centerX - 150, y: centerY },
      vel: { x: 0, y: 0 },
      angle: 0, // Facing right
      wheelAngle: 0,
      side: 'left',
    }
    
    // Right vehicle (blue) - player, attacks the red goal.
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
    keysRef.current.clear()
    controller.reset()
    setRedScore(0)
    setBlueScore(0)
    timeLeftMsRef.current = MATCH_TIME_MS
    generateField()
    resetPositions()
    setGameState('playing')
  }, [MATCH_TIME_MS, controller, generateField, resetPositions])

  const pauseGame = useCallback(() => {
    if (gameState !== 'playing' && gameState !== 'goal') return
    pausedStateRef.current = gameState
    keysRef.current.clear()
    boostRequestedRef.current = false
    controller.reset()
    setGameState('paused')
  }, [controller, gameState])

  const resumeGame = useCallback(() => {
    keysRef.current.clear()
    boostRequestedRef.current = false
    controller.reset()
    setGameState(pausedStateRef.current)
  }, [controller])

  const pollController = useEffectEvent((timestamp: number, dt: number) => {
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard remains available. */ }
    const dialog = controllerDialog(rootRef.current)
    const screen = dialog ? `menu:bumper-ball:${gameState}`
      : gameState === 'playing' && !endSequenceRef.current ? 'flight' : gameState
    const focused = document.hasFocus() && document.visibilityState !== 'hidden'
    const input = controller.sample(pads, screen, timestamp, focused)
    controllerInputRef.current = input.flight
    if (input.connected !== controllerConnected) setControllerConnected(input.connected)
    if (input.disconnected) { pauseGame(); return false }
    if (!focused) return false

    const buttons = controller.layout.buttons
    const pressed = (button: number) => input.pressed.includes(button)
    if (dialog) {
      if (gameState === 'paused' && (pressed(buttons.back) || pressed(buttons.pause))) resumeGame()
      else if (pressed(buttons.back)) controlDialog(dialog, 'back')
      else if (pressed(buttons.confirm)) controlDialog(dialog, 'confirm')
      else if (input.navigation) controlDialog(dialog, input.navigation)
      scrollDialog(dialog, input.scroll * 450 * dt)
      return false
    }
    if (pressed(buttons.pause)) { pauseGame(); return false }
    if (gameState === 'playing' && !endSequenceRef.current && pressed(buttons.confirm)) boostRequestedRef.current = true
    return true
  })

  useEffect(() => {
    if (gameState === 'playing' || gameState === 'goal') canvasRef.current?.focus({ preventScroll: true })
  }, [gameState])

  useEffect(() => {
    generateField()
  }, [generateField])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Fast Refresh can preserve a match created before computer boosts existed.
    ai1Ref.current.boost ??= createBoost()

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      viewportSizeRef.current = { width: canvas.width, height: canvas.height }
    }
    resize()
    window.addEventListener('resize', resize)

    const sounds = soundsRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const key = e.key.toLowerCase()
      sounds.init()

      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
        return
      }

      if (key === 'p') {
        e.preventDefault()
        if (!e.repeat) {
          if (gameState === 'paused') resumeGame()
          else pauseGame()
        }
        return
      }
      if (key === ' ' && gameState === 'playing') {
        e.preventDefault()
        if (!e.repeat && !keysRef.current.has(key) && !endSequenceRef.current) boostRequestedRef.current = true
        keysRef.current.add(key)
        return
      }
      if (gameState === 'playing' && ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(key)) {
        e.preventDefault()
        keysRef.current.add(key)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }
    const handleBlur = () => { keysRef.current.clear(); controller.reset(); pauseGame() }
    const handleFocus = () => controller.reset()
    const handleVisibility = () => { if (document.visibilityState === 'hidden') handleBlur(); else handleFocus() }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

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

      // Match timer pauses during goal celebration.
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
              ? [COLORS.red, COLORS.brass, COLORS.cream]
              : [COLORS.blue, '#bad3b0', COLORS.cream]
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

      const field = FIELD
      const vehicle1 = vehicle1Ref.current
      const vehicle2 = vehicle2Ref.current
      const ball = ballRef.current

      // Goal celebration pause
      if (gameState === 'goal') {
        settleVehicleAppearance(appearanceRef.current.left, dt)
        settleVehicleAppearance(appearanceRef.current.right, dt)
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
                color: goal.side === 'left' ? COLORS.red : COLORS.blue
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

      const world = { field, vehicle1, vehicle2, ball, bumpers: bumpersRef.current, goals: goalsRef.current }
      const previous1 = { angle: vehicle1.angle, vel: { ...vehicle1.vel } }
      const previous2 = { angle: vehicle2.angle, vel: { ...vehicle2.vel } }
      const accel = 350
      let isAccelerating = driveComputer(world, ai1Ref.current, dt)
      if (advanceComputerBoost(world, ai1Ref.current, dt)) sounds.boost()
      isAccelerating ||= ai1Ref.current.boost.activeRemaining > 0

      // Keyboard and controller share the same steering and acceleration limits.
      const input = controllerInputRef.current
      const left = keysRef.current.has('arrowleft') || keysRef.current.has('a')
      const right = keysRef.current.has('arrowright') || keysRef.current.has('d')
      const turn = left || right ? Number(right) - Number(left) : input.turn
      const forward = Math.max(Number(keysRef.current.has('arrowup') || keysRef.current.has('w')), input.thrust)
      const reverse = Math.max(Number(keysRef.current.has('arrowdown') || keysRef.current.has('s')), input.reverse)
      vehicle2.angle += turn * 4 * dt
      const drive = (forward - reverse * 0.5) * accel * dt
      vehicle2.vel.x += Math.cos(vehicle2.angle) * drive
      vehicle2.vel.y += Math.sin(vehicle2.angle) * drive
      isAccelerating ||= forward > 0 || reverse > 0

      if (boostRequestedRef.current) {
        if (startBoost(boostRef.current, vehicle2)) sounds.boost()
        boostRequestedRef.current = false
      }
      updateBoost(boostRef.current, vehicle2, dt)
      isAccelerating ||= boostRef.current.activeRemaining > 0

      // Engine sound
      if (isAccelerating) {
        engineTimerRef.current -= dt * 1000
        if (engineTimerRef.current <= 0) {
          engineTimerRef.current = 100
          sounds.engine()
        }
      }

      const goal = stepPhysics(world, dt, sounds)
      stepVehicleAppearance(appearanceRef.current.left, vehicle1, previous1, dt)
      stepVehicleAppearance(appearanceRef.current.right, vehicle2, previous2, dt)
      if (goal) {
        boostRef.current.activeRemaining = 0
        ai1Ref.current.boost.activeRemaining = 0
        boostRequestedRef.current = false
        // Start drain animation
        drainAnimRef.current = {
          goalPos: { x: goal.pos.x, y: goal.pos.y },
          startPos: { x: ball.pos.x, y: ball.pos.y },
          progress: 0,
          spinAngle: 0
        }

        // Start ripple emanation from goal
        const rippleColor = goal.side === 'left' ? COLORS.red : COLORS.blue
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
          // Ball went in the red goal - the blue player scored!
          setBlueScore(s => {
            const newScore = s + 1
            return newScore
          })
          lastScorerRef.current = 'blue'
        } else {
          // Ball went in the blue goal - the red computer scored!
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
      const { width, height } = viewportSizeRef.current
      const visualTime = performance.now() / 1000
      ctx.fillStyle = INK
      ctx.fillRect(0, 0, width, height)

      // Keep the player exactly centered, including at the arena walls.
      // Enlarge the world on bigger screens without changing its geometry.
      // Smaller windows retain 1:1 scale; use one zoom factor to avoid stretching.
      const player = vehicle2Ref.current
      const zoom = Math.max(1, Math.min(width / BASE_VIEWPORT.width, height / BASE_VIEWPORT.height))
      ctx.save()
      ctx.translate(width / 2, height / 2)
      ctx.scale(zoom, zoom)
      ctx.translate(-player.pos.x, -player.pos.y)

      drawCourt(ctx)
      for (const goal of goalsRef.current) {
        const scoring = gameState === 'goal' && drainAnimRef.current?.goalPos.x === goal.pos.x
        drawGoal(ctx, goal, visualTime, scoring, ambientRipplesRef.current)
      }
      for (const bumper of bumpersRef.current) drawBumper(ctx, bumper)
      drawBall(ctx, ballRef.current, ballSpinAxisRef.current, ballSpinAngleRef.current)
      for (const vehicle of [vehicle1Ref.current, vehicle2Ref.current]) {
        if (!endSequenceRef.current?.explodedSides.has(vehicle.side)) {
          const boost = vehicle.side === 'right' ? boostRef.current : ai1Ref.current.boost
          const boosting = boost.activeRemaining > 0 && !endSequenceRef.current
          drawVehicle(ctx, vehicle, visualTime, appearanceRef.current[vehicle.side], !!boosting)
        }
      }

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

      // Goal ripples belong to the world and move with the camera.
      if (gameState === 'goal') {
        for (const ripple of ripplesRef.current) {
          const startRadius = 400
          const endRadius = ripple.maxRadius
          const progress = (startRadius - ripple.radius) / (startRadius - endRadius)
          const alpha = 0.12 + progress * 0.4
          ctx.strokeStyle = ripple.color
          ctx.globalAlpha = alpha
          ctx.lineWidth = 1 + progress * 2
          ctx.beginPath()
          ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.restore()

      // The compact scoreboard stays independent of camera position and zoom.
      drawScoreboard(ctx, width, redScore, blueScore, timeLeftMsRef.current)
      drawBoostMeter(ctx, width, height, boostRef.current,
        controllerConnected ? controllerButtonLabel(controller.layout.buttons.confirm) : 'SPACE')
      if (gameState === 'goal') {
        const color = lastScorerRef.current === 'blue' ? COLORS.blue : COLORS.red
        const lift = Math.max(0, goalFlashRef.current) * 10
        ctx.save()
        ctx.textAlign = 'center'
        ctx.font = '12px ui-monospace, monospace'
        ctx.fillStyle = color
        const bannerY = Math.max(148, height * 0.28)
        ctx.fillText(lastScorerRef.current === 'blue' ? 'NICELY BUMPED.' : 'THE LITTLE RASCAL.', width / 2, bannerY - 37 - lift)
        ctx.font = '42px ui-monospace, monospace'
        ctx.fillStyle = COLORS.cream
        ctx.shadowColor = '#030907'
        ctx.shadowBlur = 14
        ctx.fillText('GOAL!', width / 2, bannerY - lift)
        ctx.restore()
      }
    }

    const gameLoop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time

      if (pollController(time, dt)) update(dt)
      draw()

      animationId = requestAnimationFrame(gameLoop)
    }

    animationId = requestAnimationFrame(gameLoop)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [gameState, controller, controllerConnected, pauseGame, resumeGame, resetPositions, onExit, redScore, blueScore])

  return (
    <div ref={rootRef} data-controller-connected={controllerConnected} className="relative w-screen h-screen overflow-hidden bg-black" onPointerDown={() => soundsRef.current.init()}>
      <canvas ref={canvasRef} tabIndex={0} aria-label="Bumper Ball arena" className="block w-full h-full outline-none" />

      {/* Menu */}
      {gameState === 'menu' && (
        <KeyboardDialog label="Bumper Ball" focusKey="bumper-menu" onClose={onExit} className="bumper-overlay">
          <div className="bumper-menu">
            <div className="bumper-marque" aria-hidden="true"><span /><i /><span /></div>
            <p className="bumper-eyebrow">THREE MINUTES OF FRIENDLY COLLISIONS</p>
            <h1>BUMPER BALL</h1>
            <p className="bumper-tagline">Small cars. Questionable manners.</p>
            <div className="flex flex-col gap-3">
              {['Play', 'Back'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    if (i === 0) startGame()
                    else onExit()
                  }}
                  className="menu-button bumper-button"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="bumper-help">
              {controllerConnected && <div className="mb-3 space-y-1">
                <p>{controllerTurnLabel(controller.layout)}</p>
                <p>{controllerButtonLabel(controller.layout.buttons.thrust)} forward · {controllerButtonLabel(controller.layout.buttons.reverse)} reverse</p>
                <p>{controllerButtonLabel(controller.layout.buttons.confirm)} boosts</p>
                <p>{controllerButtonLabel(controller.layout.buttons.pause)} pauses</p>
              </div>}
              <p>Arrow keys / WASD to drive · P to pause</p>
              <p>Space to boost · 3-second cooldown</p>
              <p className="mt-3"><span className="bumper-blue">You are blue.</span> Bump the ball into the <span className="bumper-red">red goal.</span></p>
              <p>Highest score wins. Mind the bumpers.</p>
              <p className="mt-2">{controllerConnected
                ? `Stick / D-pad · Choose · ${controllerButtonLabel(controller.layout.buttons.confirm)} · Play · ${controllerButtonLabel(controller.layout.buttons.back)} · Back`
                : 'Press Esc to exit'}</p>
            </div>
          </div>
        </KeyboardDialog>
      )}

      {/* Paused */}
      {gameState === 'paused' && (
        <KeyboardDialog label="Bumper Ball paused" focusKey="bumper-paused" onClose={onExit} className="bumper-overlay">
          <div className="bumper-menu">
            <h2 className="bumper-dialog-title">PAUSED</h2>
            <p className="bumper-tagline">{controllerConnected
              ? `${controllerButtonLabel(controller.layout.buttons.pause)} / ${controllerButtonLabel(controller.layout.buttons.back)} · Resume`
              : 'Press P to resume • Press Esc to exit'}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={resumeGame}
                className="menu-button bumper-button"
              >
                Resume
              </button>
              <button
                onClick={onExit}
                className="menu-button bumper-button"
              >
                Back
              </button>
            </div>
          </div>
        </KeyboardDialog>
      )}

      {/* Game Over */}
      {gameState === 'gameOver' && (
        <KeyboardDialog label="Bumper Ball game over" focusKey="bumper-game-over" onClose={onExit} className="bumper-overlay">
          <div className="bumper-menu">
            <h2 className="bumper-dialog-title">GAME OVER</h2>
            <p
              className={`text-2xl mb-6 font-mono ${
                redScore === blueScore ? 'bumper-cream' : redScore > blueScore ? 'bumper-red' : 'bumper-blue'
              }`}
            >
              {redScore === blueScore ? 'TIE GAME!' : redScore > blueScore ? 'RED WINS!' : 'BLUE WINS!'}
            </p>
            <p className="bumper-final-score">
              Final Score: <span className="bumper-red">{redScore}</span> - <span className="bumper-blue">{blueScore}</span>
            </p>
            <div className="flex flex-col gap-3">
              {['Play Again', 'Main Menu', 'Back'].map((label, i) => (
                <button
                  key={label}
                  onClick={() => {
                    if (i === 0) startGame()
                    else if (i === 1) setGameState('menu')
                    else onExit()
                  }}
                  className="menu-button bumper-button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </KeyboardDialog>
      )}
    </div>
  )
}
