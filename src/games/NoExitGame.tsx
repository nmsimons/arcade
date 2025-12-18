import { useCallback, useEffect, useRef, useState } from 'react'

// Sound system for No Exit
class OmegaSoundSystem {
  private ctx: AudioContext | null = null
  private initialized = false
  private thrustGain: GainNode | null = null
  private thrustOsc: OscillatorNode | null = null
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
    osc.frequency.setValueAtTime(600, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.08)
  }

  startThrust() {
    if (!this.ctx || this.thrusting) return
    this.thrusting = true

    this.thrustOsc = this.ctx.createOscillator()
    this.thrustOsc.type = 'sawtooth'
    this.thrustOsc.frequency.value = 60

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 150

    this.thrustGain = this.ctx.createGain()
    this.thrustGain.gain.setValueAtTime(0, this.ctx.currentTime)
    this.thrustGain.gain.linearRampToValueAtTime(0.15, this.ctx.currentTime + 0.05)

    this.thrustOsc.connect(filter)
    filter.connect(this.thrustGain)
    this.thrustGain.connect(this.ctx.destination)

    this.thrustOsc.start()
  }

  stopThrust() {
    if (!this.ctx || !this.thrusting) return
    this.thrusting = false

    if (this.thrustGain) {
      this.thrustGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1)
    }

    setTimeout(() => {
      this.thrustOsc?.stop()
      this.thrustOsc = null
      this.thrustGain = null
    }, 150)
  }

  enemyDestroyed() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(400, this.ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.2)
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.2)
  }

  bounce() {
    if (!this.ctx) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 150
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.05)
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
    noiseGain.gain.setValueAtTime(0.4, this.ctx.currentTime)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(this.ctx.destination)
    noise.start()
    noise.stop(this.ctx.currentTime + duration)

    const thump = this.ctx.createOscillator()
    const thumpGain = this.ctx.createGain()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(60, this.ctx.currentTime)
    thump.frequency.exponentialRampToValueAtTime(20, this.ctx.currentTime + 0.4)
    thumpGain.gain.setValueAtTime(0.5, this.ctx.currentTime)
    thumpGain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.4)
    thump.connect(thumpGain)
    thumpGain.connect(this.ctx.destination)
    thump.start()
    thump.stop(this.ctx.currentTime + 0.4)
  }

  levelComplete() {
    if (!this.ctx) return
    const notes = [392, 523.25, 659.25, 783.99] // G4, C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator()
      const gain = this.ctx!.createGain()
      osc.type = 'square'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, this.ctx!.currentTime + i * 0.1)
      gain.gain.linearRampToValueAtTime(0.2, this.ctx!.currentTime + i * 0.1 + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx!.currentTime + i * 0.1 + 0.25)
      osc.connect(gain)
      gain.connect(this.ctx!.destination)
      osc.start(this.ctx!.currentTime + i * 0.1)
      osc.stop(this.ctx!.currentTime + i * 0.1 + 0.25)
    })
  }
}

const sounds = new OmegaSoundSystem()

type NoExitGameProps = {
  onExit: () => void
}

type Vector2 = {
  x: number
  y: number
}

type Ship = {
  pos: Vector2
  vel: Vector2
  angle: number
  radius: number
}

type Bullet = {
  pos: Vector2
  vel: Vector2
  life: number
}

type Enemy = {
  pos: Vector2
  vel: Vector2
  angle: number
  radius: number
  type: 'droid' | 'chaser' | 'shooter'
  shootTimer: number
}

type EnemyBullet = {
  pos: Vector2
  vel: Vector2
  life: number
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

type Arena = {
  outer: { left: number; right: number; top: number; bottom: number }
  inner: { left: number; right: number; top: number; bottom: number }
}

export function NoExitGame({ onExit }: NoExitGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [wave, setWave] = useState(1)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const shipRef = useRef<Ship>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, radius: 12 })
  const bulletsRef = useRef<Bullet[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const enemyBulletsRef = useRef<EnemyBullet[]>([])
  const debrisRef = useRef<Debris[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const invulnerableRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const arenaRef = useRef<Arena>({
    outer: { left: 0, right: 0, top: 0, bottom: 0 },
    inner: { left: 0, right: 0, top: 0, bottom: 0 },
  })
  const respawnTimerRef = useRef(0)
  const waveCompleteRef = useRef(false)
  const starFieldCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const ensureStarField = useCallback((width: number, height: number) => {
    if (starFieldCanvasRef.current && 
        starFieldCanvasRef.current.width === width && 
        starFieldCanvasRef.current.height === height) {
      return starFieldCanvasRef.current
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Draw stars
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * width
      const y = Math.random() * height
      const size = Math.random() * 1.5
      const alpha = Math.random() * 0.5 + 0.1
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(x, y, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1.0
    
    starFieldCanvasRef.current = canvas
    return canvas
  }, [])

  const createDebris = useCallback(
    (x: number, y: number, velX: number, velY: number, count: number = 8, color: string = '0, 255, 136') => {
      const debris: Debris[] = []
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
        const speed = 50 + Math.random() * 100
        debris.push({
          pos: { x, y },
          vel: { x: velX * 0.3 + Math.cos(angle) * speed, y: velY * 0.3 + Math.sin(angle) * speed },
          angle: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 10,
          life: 1000 + Math.random() * 500,
          length: 5 + Math.random() * 10,
          color,
        })
      }
      debrisRef.current = [...debrisRef.current, ...debris]
    },
    [],
  )

  const setupArena = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    const margin = 40
    const innerMargin = Math.min(width, height) * 0.25

    arenaRef.current = {
      outer: { left: margin, right: width - margin, top: margin, bottom: height - margin },
      inner: {
        left: width / 2 - innerMargin,
        right: width / 2 + innerMargin,
        top: height / 2 - innerMargin * 0.6,
        bottom: height / 2 + innerMargin * 0.6,
      },
    }
  }, [])

  const spawnEnemies = useCallback((waveNum: number) => {
    const arena = arenaRef.current
    const enemies: Enemy[] = []
    const count = 3 + waveNum

    for (let i = 0; i < count; i++) {
      // Spawn in corners/edges of track
      const side = Math.floor(Math.random() * 4)
      let x: number, y: number
      switch (side) {
        case 0: // Top track
          x = arena.outer.left + Math.random() * (arena.outer.right - arena.outer.left)
          y = arena.outer.top + 30
          break
        case 1: // Bottom track
          x = arena.outer.left + Math.random() * (arena.outer.right - arena.outer.left)
          y = arena.outer.bottom - 30
          break
        case 2: // Left track
          x = arena.outer.left + 30
          y = arena.outer.top + Math.random() * (arena.outer.bottom - arena.outer.top)
          break
        default: // Right track
          x = arena.outer.right - 30
          y = arena.outer.top + Math.random() * (arena.outer.bottom - arena.outer.top)
      }

      // Determine enemy type based on wave
      let type: 'droid' | 'chaser' | 'shooter' = 'droid'
      if (waveNum >= 3 && Math.random() < 0.3) type = 'chaser'
      if (waveNum >= 5 && Math.random() < 0.2) type = 'shooter'

      const angle = Math.random() * Math.PI * 2
      const speed = 40 + Math.random() * 30 + waveNum * 5

      enemies.push({
        pos: { x, y },
        vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        angle: Math.random() * Math.PI * 2,
        radius: type === 'droid' ? 12 : type === 'chaser' ? 10 : 14,
        type,
        shootTimer: 2000 + Math.random() * 2000,
      })
    }

    enemiesRef.current = enemies
  }, [])

  const resetShip = useCallback(() => {
    const { width, height } = canvasSizeRef.current
    shipRef.current = {
      pos: { x: width / 2, y: height - 100 },
      vel: { x: 0, y: 0 },
      angle: -Math.PI / 2,
      radius: 12,
    }
    invulnerableRef.current = 2000
  }, [])

  const startGame = useCallback(() => {
    sounds.init()
    setupArena()
    resetShip()
    bulletsRef.current = []
    enemyBulletsRef.current = []
    debrisRef.current = []
    setScore(0)
    setLives(3)
    setWave(1)
    waveCompleteRef.current = false
    spawnEnemies(1)
    setGameState('playing')
  }, [setupArena, resetShip, spawnEnemies])

  useEffect(() => {
    if (gameState !== 'menu') return

    setupArena()
    resetShip()
    bulletsRef.current = []
    enemyBulletsRef.current = []
    debrisRef.current = []
    spawnEnemies(1)
  }, [gameState, setupArena, resetShip, spawnEnemies])

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
        // Max 3 bullets on screen
        if (bulletsRef.current.length < 3) {
          const ship = shipRef.current
          bulletsRef.current.push({
            pos: { x: ship.pos.x, y: ship.pos.y },
            vel: {
              x: ship.vel.x * 0.3 + Math.cos(ship.angle) * 500,
              y: ship.vel.y * 0.3 + Math.sin(ship.angle) * 500,
            },
            life: 1500,
          })
          sounds.shoot()
        }
      }

      if (e.key === 'p' && gameState === 'playing') {
        setGameState('paused')
      } else if (e.key === 'p' && gameState === 'paused') {
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }
      setupArena()
    }

    resize()
    window.addEventListener('resize', resize)

    const bounceOffWalls = (
      pos: Vector2,
      vel: Vector2,
      radius: number,
      playSound: boolean = false,
    ): { bounced: boolean } => {
      const arena = arenaRef.current
      let bounced = false

      // Outer walls
      if (pos.x - radius < arena.outer.left) {
        pos.x = arena.outer.left + radius
        vel.x = Math.abs(vel.x) * 0.8
        bounced = true
      }
      if (pos.x + radius > arena.outer.right) {
        pos.x = arena.outer.right - radius
        vel.x = -Math.abs(vel.x) * 0.8
        bounced = true
      }
      if (pos.y - radius < arena.outer.top) {
        pos.y = arena.outer.top + radius
        vel.y = Math.abs(vel.y) * 0.8
        bounced = true
      }
      if (pos.y + radius > arena.outer.bottom) {
        pos.y = arena.outer.bottom - radius
        vel.y = -Math.abs(vel.y) * 0.8
        bounced = true
      }

      // Inner barrier
      const inner = arena.inner
      if (pos.x > inner.left && pos.x < inner.right && pos.y > inner.top && pos.y < inner.bottom) {
        // Find closest edge
        const distLeft = pos.x - inner.left
        const distRight = inner.right - pos.x
        const distTop = pos.y - inner.top
        const distBottom = inner.bottom - pos.y
        const minDist = Math.min(distLeft, distRight, distTop, distBottom)

        if (minDist === distLeft) {
          pos.x = inner.left - radius
          vel.x = -Math.abs(vel.x) * 0.8
        } else if (minDist === distRight) {
          pos.x = inner.right + radius
          vel.x = Math.abs(vel.x) * 0.8
        } else if (minDist === distTop) {
          pos.y = inner.top - radius
          vel.y = -Math.abs(vel.y) * 0.8
        } else {
          pos.y = inner.bottom + radius
          vel.y = Math.abs(vel.y) * 0.8
        }
        bounced = true
      }

      if (bounced && playSound) {
        sounds.bounce()
      }

      return { bounced }
    }

    const update = (dt: number) => {
      if (gameState !== 'playing') return

      const ship = shipRef.current

      // Respawn timer
      if (respawnTimerRef.current > 0) {
        respawnTimerRef.current -= dt * 1000
        if (respawnTimerRef.current <= 0) {
          resetShip()
        }
        // Update debris during respawn
        debrisRef.current = debrisRef.current.filter((d) => {
          d.pos.x += d.vel.x * dt
          d.pos.y += d.vel.y * dt
          d.angle += d.rotSpeed * dt
          d.life -= dt * 1000
          return d.life > 0
        })
        return
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
        ship.vel.x += Math.cos(ship.angle) * 400 * dt
        ship.vel.y += Math.sin(ship.angle) * 400 * dt
        sounds.startThrust()
      } else {
        sounds.stopThrust()
      }

      // Apply friction and speed limit
      const maxSpeed = 350
      const speed = Math.hypot(ship.vel.x, ship.vel.y)
      if (speed > maxSpeed) {
        ship.vel.x = (ship.vel.x / speed) * maxSpeed
        ship.vel.y = (ship.vel.y / speed) * maxSpeed
      }
      ship.vel.x *= 0.995
      ship.vel.y *= 0.995

      // Update ship position
      ship.pos.x += ship.vel.x * dt
      ship.pos.y += ship.vel.y * dt

      // Bounce ship off walls
      bounceOffWalls(ship.pos, ship.vel, ship.radius, true)

      // Update invulnerability
      if (invulnerableRef.current > 0) {
        invulnerableRef.current -= dt * 1000
      }

      // Update bullets
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        bullet.pos.x += bullet.vel.x * dt
        bullet.pos.y += bullet.vel.y * dt
        bullet.life -= dt * 1000

        // Bullets bounce too
        bounceOffWalls(bullet.pos, bullet.vel, 2)

        return bullet.life > 0
      })

      // Update enemies
      enemiesRef.current.forEach((enemy) => {
        // Movement based on type
        if (enemy.type === 'chaser') {
          // Chase player
          const dx = ship.pos.x - enemy.pos.x
          const dy = ship.pos.y - enemy.pos.y
          const dist = Math.hypot(dx, dy)
          if (dist > 0) {
            enemy.vel.x += (dx / dist) * 100 * dt
            enemy.vel.y += (dy / dist) * 100 * dt
          }
        } else {
          // Random direction changes
          if (Math.random() < 0.02) {
            const angle = Math.random() * Math.PI * 2
            const speed = Math.hypot(enemy.vel.x, enemy.vel.y)
            enemy.vel.x = Math.cos(angle) * speed
            enemy.vel.y = Math.sin(angle) * speed
          }
        }

        // Limit speed
        const espeed = Math.hypot(enemy.vel.x, enemy.vel.y)
        const maxEnemySpeed = enemy.type === 'chaser' ? 150 : 80
        if (espeed > maxEnemySpeed) {
          enemy.vel.x = (enemy.vel.x / espeed) * maxEnemySpeed
          enemy.vel.y = (enemy.vel.y / espeed) * maxEnemySpeed
        }

        // Move
        enemy.pos.x += enemy.vel.x * dt
        enemy.pos.y += enemy.vel.y * dt
        enemy.angle += dt * 2

        // Bounce
        bounceOffWalls(enemy.pos, enemy.vel, enemy.radius)

        // Shooter enemies fire at player
        if (enemy.type === 'shooter') {
          enemy.shootTimer -= dt * 1000
          if (enemy.shootTimer <= 0) {
            enemy.shootTimer = 2000 + Math.random() * 2000
            const dx = ship.pos.x - enemy.pos.x
            const dy = ship.pos.y - enemy.pos.y
            const dist = Math.hypot(dx, dy)
            if (dist > 0) {
              enemyBulletsRef.current.push({
                pos: { x: enemy.pos.x, y: enemy.pos.y },
                vel: { x: (dx / dist) * 200, y: (dy / dist) * 200 },
                life: 2000,
              })
            }
          }
        }
      })

      // Update enemy bullets
      enemyBulletsRef.current = enemyBulletsRef.current.filter((bullet) => {
        bullet.pos.x += bullet.vel.x * dt
        bullet.pos.y += bullet.vel.y * dt
        bullet.life -= dt * 1000
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

      // Collision: bullets vs enemies
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
          const enemy = enemiesRef.current[i]
          const dist = Math.hypot(bullet.pos.x - enemy.pos.x, bullet.pos.y - enemy.pos.y)
          if (dist < enemy.radius + 4) {
            // Destroy enemy
            createDebris(enemy.pos.x, enemy.pos.y, enemy.vel.x, enemy.vel.y, 6, '255, 100, 100')
            sounds.enemyDestroyed()
            enemiesRef.current.splice(i, 1)
            setScore((s) => s + (enemy.type === 'droid' ? 100 : enemy.type === 'chaser' ? 200 : 300))
            return false
          }
        }
        return true
      })

      // Collision: ship vs enemies
      if (invulnerableRef.current <= 0 && respawnTimerRef.current <= 0) {
        for (const enemy of enemiesRef.current) {
          const dist = Math.hypot(ship.pos.x - enemy.pos.x, ship.pos.y - enemy.pos.y)
          if (dist < ship.radius + enemy.radius) {
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 10)
            sounds.death()
            sounds.stopThrust()
            respawnTimerRef.current = 1500
            setLives((l) => {
              const newLives = l - 1
              if (newLives <= 0) {
                setTimeout(() => setGameState('gameOver'), 1500)
              }
              return newLives
            })
            break
          }
        }

        // Collision: ship vs enemy bullets
        for (let i = enemyBulletsRef.current.length - 1; i >= 0; i--) {
          const bullet = enemyBulletsRef.current[i]
          const dist = Math.hypot(ship.pos.x - bullet.pos.x, ship.pos.y - bullet.pos.y)
          if (dist < ship.radius + 4) {
            enemyBulletsRef.current.splice(i, 1)
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 10)
            sounds.death()
            sounds.stopThrust()
            respawnTimerRef.current = 1500
            setLives((l) => {
              const newLives = l - 1
              if (newLives <= 0) {
                setTimeout(() => setGameState('gameOver'), 1500)
              }
              return newLives
            })
            break
          }
        }
      }

      // Check wave complete
      if (enemiesRef.current.length === 0 && !waveCompleteRef.current) {
        waveCompleteRef.current = true
        sounds.levelComplete()
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
      const arena = arenaRef.current

      // Clear
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw Starfield
      const starField = ensureStarField(canvas.width, canvas.height)
      if (starField) {
        ctx.drawImage(starField, 0, 0)
      }

      // Outer walls
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.strokeRect(arena.outer.left, arena.outer.top, arena.outer.right - arena.outer.left, arena.outer.bottom - arena.outer.top)

      // Inner barrier
      ctx.strokeStyle = '#ff4444'
      ctx.strokeRect(arena.inner.left, arena.inner.top, arena.inner.right - arena.inner.left, arena.inner.bottom - arena.inner.top)

      // Force field effect on walls
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)'
      ctx.lineWidth = 1
      for (let i = 0; i < 3; i++) {
        const offset = 4 + i * 4
        ctx.strokeRect(
          arena.outer.left - offset,
          arena.outer.top - offset,
          arena.outer.right - arena.outer.left + offset * 2,
          arena.outer.bottom - arena.outer.top + offset * 2,
        )
      }

      // Draw enemies
      enemiesRef.current.forEach((enemy) => {
        ctx.save()
        ctx.translate(enemy.pos.x, enemy.pos.y)
        ctx.rotate(enemy.angle)

        // Opaque fill to block stars
        ctx.fillStyle = '#0a0a0a'
        ctx.beginPath()
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2)
        ctx.fill()

        if (enemy.type === 'droid') {
          // Droid: Spiky mine shape
          ctx.strokeStyle = '#ff4444'
          ctx.lineWidth = 2
          ctx.beginPath()
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2
            const r = i % 2 === 0 ? enemy.radius : enemy.radius * 0.5
            if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
            else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
          }
          ctx.closePath()
          ctx.stroke()
          
          // Inner detail
          ctx.beginPath()
          ctx.arc(0, 0, enemy.radius * 0.3, 0, Math.PI * 2)
          ctx.stroke()
        } else if (enemy.type === 'chaser') {
          // Chaser: Aggressive dart/fighter
          ctx.strokeStyle = '#ffaa00'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(enemy.radius, 0)
          ctx.lineTo(-enemy.radius, -enemy.radius * 0.6)
          ctx.lineTo(-enemy.radius * 0.5, 0)
          ctx.lineTo(-enemy.radius, enemy.radius * 0.6)
          ctx.closePath()
          ctx.stroke()
          
          // Engine detail
          ctx.beginPath()
          ctx.moveTo(-enemy.radius * 0.5, 0)
          ctx.lineTo(-enemy.radius * 0.8, 0)
          ctx.stroke()
        } else {
          // Shooter: Turret/Cannon shape
          ctx.strokeStyle = '#ff00ff'
          ctx.lineWidth = 2
          
          // Main body
          ctx.beginPath()
          ctx.arc(0, 0, enemy.radius * 0.7, 0, Math.PI * 2)
          ctx.stroke()
          
          // Cannons
          ctx.beginPath()
          ctx.moveTo(enemy.radius * 0.4, -enemy.radius * 0.4)
          ctx.lineTo(enemy.radius, -enemy.radius * 0.4)
          ctx.moveTo(enemy.radius * 0.4, enemy.radius * 0.4)
          ctx.lineTo(enemy.radius, enemy.radius * 0.4)
          ctx.stroke()
          
          // Center eye
          ctx.beginPath()
          ctx.arc(0, 0, enemy.radius * 0.3, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      })

      // Draw enemy bullets
      ctx.fillStyle = '#ff00ff'
      enemyBulletsRef.current.forEach((bullet) => {
        ctx.beginPath()
        ctx.arc(bullet.pos.x, bullet.pos.y, 4, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw bullets
      ctx.fillStyle = '#00ff88'
      bulletsRef.current.forEach((bullet) => {
        ctx.beginPath()
        ctx.arc(bullet.pos.x, bullet.pos.y, 3, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw debris
      debrisRef.current.forEach((d) => {
        const alpha = d.life / 1500
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
      if (respawnTimerRef.current <= 0) {
        const ship = shipRef.current
        const isInvulnerable = invulnerableRef.current > 0
        if (!isInvulnerable || Math.floor(Date.now() / 100) % 2 === 0) {
          ctx.save()
          ctx.translate(ship.pos.x, ship.pos.y)
          ctx.rotate(ship.angle)
          
          // Opaque fill
          ctx.fillStyle = '#0a0a0a'
          ctx.beginPath()
          ctx.moveTo(15, 0)
          ctx.lineTo(-10, -12)
          ctx.lineTo(-5, 0)
          ctx.lineTo(-10, 12)
          ctx.closePath()
          ctx.fill()

          ctx.strokeStyle = '#00ff88'
          ctx.lineWidth = 2
          
          // Main body
          ctx.beginPath()
          ctx.moveTo(15, 0)
          ctx.lineTo(-8, -10)
          ctx.lineTo(-4, 0)
          ctx.lineTo(-8, 10)
          ctx.closePath()
          ctx.stroke()
          
          // Wings/Details
          ctx.beginPath()
          ctx.moveTo(-4, -6)
          ctx.lineTo(-12, -12)
          ctx.moveTo(-4, 6)
          ctx.lineTo(-12, 12)
          ctx.stroke()

          // Thrust flame
          if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
            ctx.strokeStyle = '#ff6600'
            ctx.beginPath()
            ctx.moveTo(-6, -3)
            ctx.lineTo(-18 - Math.random() * 8, 0)
            ctx.lineTo(-6, 3)
            ctx.stroke()
          }

          ctx.restore()
        }
      }

      // Scanlines (matching Hard Vacuum style)
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < canvas.height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, canvas.width, 1)
      }
      ctx.restore()

      // HUD
      if (gameState === 'playing') {
        ctx.save()
        ctx.fillStyle = '#00ff88'
        ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'

        ctx.textAlign = 'left'
        ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, arena.outer.left, arena.outer.top - 15)
        ctx.fillText(`WAVE ${wave}`, arena.outer.left + 150, arena.outer.top - 15)

        ctx.textAlign = 'right'
        ctx.fillText(`LIVES`, arena.outer.right - 50, arena.outer.top - 15)

        // Draw lives as ships
        for (let i = 0; i < lives; i++) {
          ctx.save()
          ctx.translate(arena.outer.right - 40 + i * 20, arena.outer.top - 20)
          ctx.rotate(-Math.PI / 2)
          ctx.strokeStyle = '#00ff88'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(8, 0)
          ctx.lineTo(-5, -5)
          ctx.lineTo(-2, 0)
          ctx.lineTo(-5, 5)
          ctx.closePath()
          ctx.stroke()
          ctx.restore()
        }

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
  }, [gameState, score, lives, wave, setupArena, resetShip, spawnEnemies, createDebris])

  const exitToGameSelect = () => {
    sounds.stopThrust()
    onExit()
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] uppercase">No Exit</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Arrow Keys / WASD: Rotate + Thrust
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Space: Fire (max 3 shots)
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white">›</span> Bounce off force fields
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
                    : 'border-[#00ff88] bg-black text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Start
              </button>
              <button
                onClick={exitToGameSelect}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  menuIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88]/50 bg-black text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
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
                onClick={() => setGameState('playing')}
                className="w-64 px-8 py-3 border-2 border-[#00ff88] bg-black text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
              >
                Resume
              </button>
              <button
                onClick={exitToGameSelect}
                className="w-64 px-8 py-3 border-2 border-[#00ff88] bg-black text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
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
                    : 'border-[#00ff88] bg-black text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Play Again
              </button>
              <button
                onClick={() => setGameState('menu')}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88]/50 bg-black text-[#00ff88]/50 hover:border-[#00ff88] hover:text-[#00ff88]'
                }`}
              >
                Main Menu
              </button>
              <button
                onClick={exitToGameSelect}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 2
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#ff4444] bg-black text-[#ff4444] hover:bg-[#00ff88] hover:text-black hover:border-[#00ff88]'
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
