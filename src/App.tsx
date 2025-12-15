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
}

interface Bullet {
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

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  
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

  const createAsteroid = useCallback((x: number, y: number, radius: number): Asteroid => {
    const points: Vector2[] = []
    const vertices = 8 + Math.floor(Math.random() * 4)
    for (let i = 0; i < vertices; i++) {
      const angle = (i / vertices) * Math.PI * 2
      const variance = 0.7 + Math.random() * 0.6
      points.push({
        x: Math.cos(angle) * radius * variance,
        y: Math.sin(angle) * radius * variance
      })
    }
    
    const angle = Math.random() * Math.PI * 2
    const speed = 20 + Math.random() * 30
    
    return {
      pos: { x, y },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius,
      points
    }
  }, [])

  const createDebris = useCallback((x: number, y: number, velX: number, velY: number, count: number = 8, lifeMult: number = 1, color: string = '0, 255, 136') => {
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
        color
      })
    }
    debrisRef.current = [...debrisRef.current, ...debris]
  }, [])

  const spawnAsteroids = useCallback((count: number, avoidRadius: number = 100) => {
    const newAsteroids: Asteroid[] = []
    const { width, height } = canvasSizeRef.current
    for (let i = 0; i < count; i++) {
      let x, y
      do {
        x = Math.random() * width
        y = Math.random() * height
      } while (Math.hypot(x - shipRef.current.pos.x, y - shipRef.current.pos.y) < avoidRadius)
      
      newAsteroids.push(createAsteroid(x, y, 30 + Math.random() * 15))
    }
    asteroidsRef.current = [...asteroidsRef.current, ...newAsteroids]
  }, [createAsteroid])

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
            y: ship.vel.y + Math.sin(ship.angle) * 400
          },
          life: 1000
        }
        bulletsRef.current.push(bullet)
        sounds.shoot()
      }
      if (e.key === 'p' && gameState === 'playing') {
        setGameState('paused')
      } else if (e.key === 'p' && gameState === 'paused') {
        setGameState('playing')
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
  }, [gameState])

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
      asteroidsRef.current.forEach(asteroid => {
        asteroid.pos.x += asteroid.vel.x * dt
        asteroid.pos.y += asteroid.vel.y * dt
        
        if (asteroid.pos.x > w) asteroid.pos.x = 0
        if (asteroid.pos.x < 0) asteroid.pos.x = w
        if (asteroid.pos.y > h) asteroid.pos.y = 0
        if (asteroid.pos.y < 0) asteroid.pos.y = h
      })

      // Update bullets with wrapping
      bulletsRef.current = bulletsRef.current.filter(bullet => {
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
      debrisRef.current = debrisRef.current.filter(d => {
        d.pos.x += d.vel.x * dt
        d.pos.y += d.vel.y * dt
        d.angle += d.rotSpeed * dt
        d.life -= dt * 1000
        d.vel.x *= 0.99
        d.vel.y *= 0.99
        return d.life > 0
      })

      // Collision detection: bullets vs asteroids
      bulletsRef.current = bulletsRef.current.filter(bullet => {
        for (let i = 0; i < asteroidsRef.current.length; i++) {
          const asteroid = asteroidsRef.current[i]
          const dist = Math.hypot(bullet.pos.x - asteroid.pos.x, bullet.pos.y - asteroid.pos.y)
          if (dist < asteroid.radius) {
            asteroidsRef.current.splice(i, 1)
            setScore(s => s + Math.floor(100 / asteroid.radius))
            
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

      // Collision detection: ship vs asteroids
      if (invulnerableRef.current <= 0 && respawnTimerRef.current <= 0) {
        for (let i = 0; i < asteroidsRef.current.length; i++) {
          const asteroid = asteroidsRef.current[i]
          const dist = Math.hypot(ship.pos.x - asteroid.pos.x, ship.pos.y - asteroid.pos.y)
          if (dist < ship.radius + asteroid.radius) {
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y)
            sounds.death()
            respawnTimerRef.current = 1000 // 1 second delay
            setLives(l => {
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
        setLevel(l => {
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

      // Draw asteroids
      ctx.strokeStyle = '#888'
      ctx.lineWidth = 2
      asteroidsRef.current.forEach(asteroid => {
        ctx.beginPath()
        asteroid.points.forEach((point, i) => {
          const x = asteroid.pos.x + point.x
          const y = asteroid.pos.y + point.y
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.closePath()
        ctx.stroke()
      })

      // Draw bullets
      ctx.fillStyle = '#00ff88'
      bulletsRef.current.forEach(bullet => {
        ctx.beginPath()
        ctx.arc(bullet.pos.x, bullet.pos.y, 2, 0, Math.PI * 2)
        ctx.fill()
      })
      
      // Draw debris
      debrisRef.current.forEach(d => {
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
                  <polygon 
                    points="0,-10 6,8 0,4 -6,8" 
                    fill="none" 
                    stroke="#00ff88" 
                    strokeWidth="1.5"
                  />
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
            <h1 className="text-4xl text-[#00ff88] mb-8 text-center tracking-[0.3em] uppercase">
              Asteroids
            </h1>
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
            <button 
              onClick={startGame}
              className="w-full border-2 border-[#00ff88] text-[#00ff88] py-3 uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
            >
              Start Game
            </button>
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
              onClick={() => setGameState('menu')}
              className="w-full border-2 border-[#ff4444] text-[#ff4444] py-3 uppercase tracking-widest hover:bg-[#ff4444] hover:text-black transition-colors"
            >
              Quit to Menu
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
                className="w-full border-2 border-[#00ff88] text-[#00ff88] py-3 uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
              >
                Play Again
              </button>
              <button 
                onClick={() => setGameState('menu')}
                className="w-full border-2 border-[#00ff88]/50 text-[#00ff88]/50 py-3 uppercase tracking-widest hover:border-[#00ff88] hover:text-[#00ff88] transition-colors"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
