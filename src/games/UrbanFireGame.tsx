import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { FIELD, JEEP_MAX_HEALTH, JEEP_TUNING } from './urbanFire/types'
import type { Bullet, Debris, Helicopter, Jeep, RepairKit, Tank, Vector2, Wall } from './urbanFire/types'
import { ArmorSoundSystem } from './urbanFire/sound'
import { createBuildings } from './urbanFire/battlefield'
import { clamp, clear, createNavigator, intersects } from './urbanFire/navigation'
import { aimTank, createContact, createTankBrain, driveTank, flyHelicopter, observe } from './urbanFire/ai'
import { drawBattle, drawCity } from './urbanFire/render'
import { createControllerReader } from './hardVacuum/controllerInput'
import { neutralController } from './hardVacuum/flightInput'
import { controllerDialog, controlDialog, scrollDialog } from './hardVacuum/controllerUi'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import './urbanFire/urbanFire.css'

type UrbanFireGameProps = { onExit: () => void }
const lineIntersectsRect = (x1: number, y1: number, x2: number, y2: number, x: number, y: number, width: number, height: number) =>
  intersects({ x: x1, y: y1 }, { x: x2, y: y2 }, { x, y, width, height })

export function UrbanFireGame({ onExit }: UrbanFireGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [wave, setWave] = useState(1)
  const rootRef = useRef<HTMLDivElement>(null)
  const [sounds] = useState(() => new ArmorSoundSystem())
  const [controller] = useState(() => createControllerReader())
  const controllerInputRef = useRef(neutralController())
  const [controllerConnected, setControllerConnected] = useState(false)
  const contactRef = useRef(createContact())
  const waveDelayRef = useRef(0)

  const jeepRef = useRef<Jeep>({
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    angle: 0,
    health: JEEP_MAX_HEALTH,
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
  const repairKitsRef = useRef<RepairKit[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)

  const spawnRepairKit = useCallback(() => {
    const { width, height } = FIELD
    if (width <= 0 || height <= 0) return

    // Only ever allow one repair kit; if it's still on the map, don't spawn another.
    if (repairKitsRef.current.length > 0) return

    const spawnMargin = clamp(Math.min(width, height) * 0.12, 70, 140)
    const kitRadius = 20
    const jeep = jeepRef.current

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

    let best: Vector2 | null = null
    let bestScore = -Infinity

    // Try multiple candidates and pick the one farthest from the jeep (feels fair).
    for (let i = 0; i < 50; i++) {
      const x = spawnMargin + Math.random() * (width - spawnMargin * 2)
      const y = spawnMargin + Math.random() * (height - spawnMargin * 2)

      if (isInsideWall(x, y, kitRadius)) continue
      const dJeep = Math.hypot(x - jeep.pos.x, y - jeep.pos.y)
      if (dJeep < 120) continue

      // Prefer positions with some breathing room from walls.
      let wallPenalty = 0
      for (const wall of wallsRef.current) {
        const cx = clamp(x, wall.x, wall.x + wall.width)
        const cy = clamp(y, wall.y, wall.y + wall.height)
        const d = Math.hypot(x - cx, y - cy)
        if (d < 40) wallPenalty += (40 - d)
      }

      const score = dJeep - wallPenalty * 0.8
      if (score > bestScore) {
        bestScore = score
        best = { x, y }
      }
    }

    const pos = best ?? { x: width / 2, y: height / 2 }
    repairKitsRef.current = [{ pos, spawnedAtMs: Date.now() }]
  }, [])

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

  const generateWalls = useCallback(() => { wallsRef.current = createBuildings() }, [])

  const spawnEnemies = useCallback((waveNum: number) => {
    const { width, height } = FIELD
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
            y = 32
            angle = Math.PI / 2 + (Math.random() - 0.5) * 0.3
            break
          case 1: // Bottom edge
            x = width * spawn.pos
            y = height - 32
            angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3
            break
          case 2: // Left edge
            x = 32
            y = height * spawn.pos
            angle = 0 + (Math.random() - 0.5) * 0.3
            break
          default: // Right edge
            x = width - 32
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
            y = 32
            angle = Math.PI / 2
            break
          case 1:
            x = width / 2
            y = height - 32
            angle = -Math.PI / 2
            break
          case 2:
            x = 32
            y = height / 2
            angle = 0
            break
          default:
            x = width - 32
            y = height / 2
            angle = Math.PI
        }
      }

      tanks.push({
        pos: { x: x!, y: y! },
        vel: { x: Math.cos(angle!) * 40, y: Math.sin(angle!) * 40 },
        angle: angle!,
        turretAngle: angle!,
        health: 2,
        state: 'active',
        explodeTime: 0,
        shootCooldown: 2000 + Math.random() * 2000,
        trackOffset: 0,
        losTimeMs: 0,
        role: i,
        brain: createTankBrain(),
        recoil: 0,
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
        orbit: i % 2 ? -1 : 1,
        recoil: 0,
      })
    }

    tanksRef.current = tanks
    helicoptersRef.current = helicopters
  }, [])

  const resetJeep = useCallback(() => {
    const { width, height } = FIELD
    
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
      health: JEEP_MAX_HEALTH,
      state: 'active',
      explodeTime: 0,
      wheelAngle: 0,
      hitFlash: 0,
    }
  }, [])

  const startGame = useCallback(() => {
    sounds.init()
    sounds.startEngine()
    keysRef.current.clear()
    controller.reset()
    contactRef.current = createContact()
    waveDelayRef.current = 0
    generateWalls()
    resetJeep()
    bulletsRef.current = []
    debrisRef.current = []
    repairKitsRef.current = []
    setScore(0)
    setWave(1)
    spawnEnemies(1)
    spawnRepairKit()
    setGameState('playing')
  }, [generateWalls, resetJeep, spawnEnemies, spawnRepairKit, sounds, controller])

  useEffect(() => {
    if (gameState !== 'menu') return

    generateWalls()
    resetJeep()
    bulletsRef.current = []
    debrisRef.current = []
    repairKitsRef.current = []
    if (tanksRef.current.length === 0 && helicoptersRef.current.length === 0) {
      spawnEnemies(1)
    }
  }, [gameState, generateWalls, resetJeep, spawnEnemies])

  const pauseGame = useCallback(() => {
    if (gameState !== 'playing') return
    keysRef.current.clear(); controller.reset(); sounds.stopEngine(); setGameState('paused')
  }, [gameState, controller, sounds])
  const resumeGame = useCallback(() => {
    keysRef.current.clear(); controller.reset(); sounds.startEngine(); setGameState('playing')
  }, [controller, sounds])
  const fire = useCallback(() => {
    const jeep = jeepRef.current
    if (gameState !== 'playing' || jeep.state !== 'active' || bulletsRef.current.filter(b => !b.isEnemy).length >= JEEP_TUNING.maxPlayerBullets) return
    const muzzle = { x: jeep.pos.x + Math.cos(jeep.angle) * 17, y: jeep.pos.y + Math.sin(jeep.angle) * 17 }
    if (!clear(jeep.pos, muzzle, wallsRef.current)) return
    bulletsRef.current.push({ pos: muzzle, vel: { x: Math.cos(jeep.angle) * JEEP_TUNING.playerBulletSpeed, y: Math.sin(jeep.angle) * JEEP_TUNING.playerBulletSpeed }, life: JEEP_TUNING.playerBulletLifeMs, isEnemy: false })
    sounds.shoot()
  }, [gameState, sounds])
  const pollController = useEffectEvent((time: number, dt: number) => {
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard remains available. */ }
    const dialog = controllerDialog(rootRef.current)
    const focused = document.hasFocus() && document.visibilityState !== 'hidden'
    const input = controller.sample(pads, dialog ? `menu:urban:${gameState}` : gameState === 'playing' ? 'flight' : gameState, time, focused)
    controllerInputRef.current = input.flight
    if (input.connected !== controllerConnected) setControllerConnected(input.connected)
    if (input.disconnected) { pauseGame(); return false }
    if (!focused) return false
    const buttons = controller.layout.buttons, pressed = (b: number) => input.pressed.includes(b)
    if (dialog) {
      if (gameState === 'paused' && (pressed(buttons.pause) || pressed(buttons.back))) resumeGame()
      else if (pressed(buttons.back)) controlDialog(dialog, 'back')
      else if (pressed(buttons.confirm)) controlDialog(dialog, 'confirm')
      else if (input.navigation) controlDialog(dialog, input.navigation)
      scrollDialog(dialog, input.scroll * 450 * dt)
      return false
    }
    if (pressed(buttons.pause)) { pauseGame(); return false }
    if (pressed(buttons.confirm)) fire()
    return true
  })

  useEffect(() => {
    if (gameState === 'playing') canvasRef.current?.focus({ preventScroll: true })
    const down = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'escape') { e.preventDefault(); sounds.stopEngine(); onExit(); return }
      if (key === 'p') { e.preventDefault(); if (!e.repeat) { if (gameState === 'paused') resumeGame(); else pauseGame() }; return }
      if (gameState !== 'playing') return
      if (['arrowleft','arrowright','arrowup','arrowdown','a','d','w','s',' '].includes(key)) {
        e.preventDefault(); keysRef.current.add(key)
        if (key === ' ' && !e.repeat) fire()
      }
    }
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
    const blur = () => { keysRef.current.clear(); controller.reset(); pauseGame() }
    const visibility = () => { if (document.visibilityState === 'hidden') blur(); else controller.reset() }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility) }
  }, [gameState, sounds, onExit, pauseGame, resumeGame, fire, controller])
  useEffect(() => () => sounds.stopEngine(), [sounds])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
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
      if (dist === 0) {
        const exits = [
          { pushX: rect.x - radius - x, pushY: 0 },
          { pushX: rect.x + rect.width + radius - x, pushY: 0 },
          { pushX: 0, pushY: rect.y - radius - y },
          { pushX: 0, pushY: rect.y + rect.height + radius - y },
        ].sort((a, b) => Math.hypot(a.pushX, a.pushY) - Math.hypot(b.pushX, b.pushY))
        return { collision: true, ...exits[0] }
      }
      return { collision: false, pushX: 0, pushY: 0 }
    }

    const route = createNavigator(wallsRef.current)
    const city = document.createElement('canvas')
    city.width = FIELD.width + 24; city.height = FIELD.height + 24
    const cityContext = city.getContext('2d')!
    cityContext.translate(12, 12); drawCity(cityContext, wallsRef.current)

    const update = (dt: number) => {
      if (gameState !== 'playing') return

      const { width, height } = FIELD
      const jeep = jeepRef.current

      // Fairness: cap concurrent enemy bullets so difficulty stays readable.
      const maxEnemyBullets = 6

      if (jeep.state === 'exploding') {
        jeep.explodeTime -= dt * 1000
        if (jeep.explodeTime <= 0) {
          jeep.state = 'dead'
          sounds.stopEngine()
          setGameState('gameOver')
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

      // Keyboard and controller share the same steering and acceleration limits.
      const input = controllerInputRef.current
      const turn = (Number(keysRef.current.has('arrowright') || keysRef.current.has('d')) - Number(keysRef.current.has('arrowleft') || keysRef.current.has('a'))) || input.turn
      const forward = keysRef.current.has('arrowup') || keysRef.current.has('w') ? 1 : input.thrust
      const reverse = keysRef.current.has('arrowdown') || keysRef.current.has('s') ? 1 : input.reverse
      jeep.angle += turn * JEEP_TUNING.turnSpeed * dt
      jeep.vel.x += Math.cos(jeep.angle) * JEEP_TUNING.accelForward * (forward - reverse * JEEP_TUNING.accelReverseFactor) * dt
      jeep.vel.y += Math.sin(jeep.angle) * JEEP_TUNING.accelForward * (forward - reverse * JEEP_TUNING.accelReverseFactor) * dt

      // Drift physics - velocity gradually aligns with facing direction
      const speed = Math.hypot(jeep.vel.x, jeep.vel.y)
      if (speed > JEEP_TUNING.driftSpeedThreshold) {
        const velAngle = Math.atan2(jeep.vel.y, jeep.vel.x)
        const heading = Math.cos(velAngle - jeep.angle) < 0 ? jeep.angle + Math.PI : jeep.angle
        let angleDiff = heading - velAngle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
        
        // The faster you go, the more you drift (less grip)
        // Grip factor: 1.0 = instant alignment, lower = more drift
        const gripFactor = Math.max(JEEP_TUNING.gripMin, JEEP_TUNING.gripBase - speed * JEEP_TUNING.gripSpeedFactor)
        const alignAmount = angleDiff * (1 - Math.pow(1 - gripFactor, dt * 60))
        
        // Rotate velocity toward facing direction
        const newVelAngle = velAngle + alignAmount
        jeep.vel.x = Math.cos(newVelAngle) * speed
        jeep.vel.y = Math.sin(newVelAngle) * speed
      }

      // Friction (slightly less when drifting sideways)
      jeep.vel.x *= Math.pow(JEEP_TUNING.friction, dt * 60)
      jeep.vel.y *= Math.pow(JEEP_TUNING.friction, dt * 60)

      // Speed limit
      const maxSpeed = JEEP_TUNING.maxSpeed
      if (speed > maxSpeed) {
        jeep.vel.x = (jeep.vel.x / speed) * maxSpeed
        jeep.vel.y = (jeep.vel.y / speed) * maxSpeed
      }

      // Animate wheels
      jeep.wheelAngle += speed * dt * JEEP_TUNING.wheelSpinFactor

      sounds.setEngineSpeed(speed)

      // Move jeep
      jeep.pos.x += jeep.vel.x * dt
      jeep.pos.y += jeep.vel.y * dt

      // Wall collision for jeep
      for (const wall of wallsRef.current) {
        const { collision, pushX, pushY } = rectCollision(jeep.pos.x, jeep.pos.y, JEEP_TUNING.collisionRadius, wall)
        if (collision) {
          jeep.pos.x += pushX
          jeep.pos.y += pushY
          jeep.vel.x *= JEEP_TUNING.collisionVelocityDamping
          jeep.vel.y *= JEEP_TUNING.collisionVelocityDamping
        }
      }

      // Battlefield bounds
      jeep.pos.x = Math.max(JEEP_TUNING.screenMargin, Math.min(width - JEEP_TUNING.screenMargin, jeep.pos.x))
      jeep.pos.y = Math.max(JEEP_TUNING.screenMargin, Math.min(height - JEEP_TUNING.screenMargin, jeep.pos.y))

      // Repair kit pickup
      if (repairKitsRef.current.length > 0 && jeep.health < JEEP_MAX_HEALTH) {
        for (let i = repairKitsRef.current.length - 1; i >= 0; i--) {
          const kit = repairKitsRef.current[i]
          const dist = Math.hypot(kit.pos.x - jeep.pos.x, kit.pos.y - jeep.pos.y)
          if (dist < JEEP_TUNING.repairPickupRadius) {
            jeep.health = Math.min(JEEP_MAX_HEALTH, jeep.health + 1)
            repairKitsRef.current.splice(i, 1)
            sounds.repairPickup()
          }
        }
      }

      observe(contactRef.current, jeep, [...tanksRef.current, ...helicoptersRef.current], wallsRef.current, dt)
      tanksRef.current = tanksRef.current.filter(tank => {
        if (tank.state === 'exploding') { tank.explodeTime -= dt * 1000; return tank.explodeTime > 0 }
        driveTank(tank, tanksRef.current, contactRef.current, wallsRef.current, route, dt)
        // Physical contacts still constrain the tactical planner.
        for (const wall of wallsRef.current) {
          const hit = rectCollision(tank.pos.x, tank.pos.y, 28, wall)
          tank.pos.x += hit.pushX; tank.pos.y += hit.pushY
        }
        const dx = jeep.pos.x - tank.pos.x, dy = jeep.pos.y - tank.pos.y, dist = Math.hypot(dx, dy)
        if (dist > 0 && dist < 40) { jeep.pos.x += dx / dist * (40 - dist); jeep.pos.y += dy / dist * (40 - dist) }
        const muzzle = aimTank(tank, jeep, tanksRef.current, wallsRef.current, dt)
        if (muzzle && bulletsRef.current.filter(b => b.isEnemy).length < maxEnemyBullets) {
          bulletsRef.current.push({ pos: muzzle, vel: { x: Math.cos(tank.turretAngle) * 250, y: Math.sin(tank.turretAngle) * 250 }, life: 2000, isEnemy: true })
          tank.shootCooldown = 2200 + Math.random() * 1700; tank.recoil = 1; sounds.tankShoot()
        }
        return true
      })
      helicoptersRef.current = helicoptersRef.current.filter(heli => {
        if (heli.state === 'exploding') { heli.explodeTime -= dt * 1000; return heli.explodeTime > 0 }
        heli.soundTimer -= dt * 1000
        if (heli.soundTimer <= 0) { heli.soundTimer = 180; sounds.helicopter() }
        if (flyHelicopter(heli, jeep, contactRef.current, wallsRef.current, dt) && bulletsRef.current.filter(b => b.isEnemy).length < maxEnemyBullets) {
          bulletsRef.current.push({ pos: { ...heli.pos }, vel: { x: Math.cos(heli.angle) * 220, y: Math.sin(heli.angle) * 220 }, life: 2000, isEnemy: true })
          heli.shootCooldown = 2400 + Math.random() * 1400; heli.recoil = 1; sounds.tankShoot()
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

        // Battlefield bounds
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
      if (activeTanks === 0 && activeHelis === 0 && jeep.state === 'active') {
        waveDelayRef.current += dt
        if (waveDelayRef.current >= 1.5) {
          const nextWave = wave + 1
          setWave(nextWave); spawnEnemies(nextWave); spawnRepairKit()
          waveDelayRef.current = 0
        }
      }
    }
    const draw = () => drawBattle(ctx, city, {
      jeep: jeepRef.current, tanks: tanksRef.current, helicopters: helicoptersRef.current,
      bullets: bulletsRef.current, debris: debrisRef.current, kits: repairKitsRef.current, walls: wallsRef.current,
    }, canvas.width, canvas.height, score, wave)

    const animate = (timestamp: number) => {
      const dt = Math.max(0, Math.min((timestamp - lastTimeRef.current) / 1000, 0.05))
      lastTimeRef.current = timestamp

      if (pollController(timestamp, dt)) update(dt)
      draw()

      rafRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [gameState, score, wave, generateWalls, resetJeep, spawnEnemies, spawnRepairKit, createDebris, sounds])

  const exitToGameSelect = () => {
    sounds.stopEngine()
    onExit()
  }

  return (
    <div ref={rootRef} className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} tabIndex={-1} role="img" aria-label="Urban Fire battlefield" className="absolute inset-0 outline-none" />
      {gameState !== 'playing' && <KeyboardDialog label={gameState === 'menu' ? 'Urban Fire' : gameState === 'paused' ? 'Paused' : 'Mission ended'} focusKey={gameState} onClose={gameState === 'paused' ? resumeGame : exitToGameSelect} className="urban-overlay">
        <div className="urban-menu">
          <div className="urban-eyebrow">ARMORED RECON / SECTOR 04</div>
          {gameState === 'menu' ? <>
            <h1>Urban Fire</h1>
            <p className="urban-brief">Hold the district. Break the armored advance.<br />Use the buildings for cover and keep moving as enemy units establish crossfire.</p>
            <div className="urban-actions"><button onClick={startGame}>Deploy</button><button onClick={exitToGameSelect}>Back</button></div>
          </> : gameState === 'paused' ? <>
            <h2>PAUSED</h2>
            <p className="urban-brief">Wave {wave} · {score.toString().padStart(6, '0')} points</p>
            <div className="urban-actions"><button onClick={resumeGame}>Resume</button><button onClick={exitToGameSelect}>Back</button></div>
          </> : <>
            <h2>MISSION ENDED</h2>
            <p className="urban-brief">Wave {wave} · {score.toString().padStart(6, '0')} points</p>
            <div className="urban-actions"><button onClick={startGame}>Redeploy</button><button onClick={() => setGameState('menu')}>Main menu</button><button onClick={exitToGameSelect}>Back</button></div>
          </>}
          <div className="urban-help">
            <strong>{controllerConnected ? 'Left stick turns · RT / R2 forward · LT / L2 reverse' : 'Arrow keys / WASD to drive'}</strong><br />
            {gameState === 'paused' ? 'P / Menu or Esc / B resumes · Back exits' : controllerConnected ? 'A / × fires · Menu / Options pauses' : 'Space fires · P pauses · Esc exits'}<br />
            Tanks: 2 hits · Helicopters: 1 hit<br />Two shots in flight. Recover field kits to repair armor.
          </div>
        </div>
      </KeyboardDialog>}
    </div>
  )
}
