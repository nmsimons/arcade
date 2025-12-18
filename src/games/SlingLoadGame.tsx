import { useCallback, useEffect, useRef, useState } from 'react'

type SlingLoadGameProps = {
  onExit: () => void
}

type Vector2 = { x: number; y: number }

type CargoType = 'medical' | 'food' | 'ordinance'

type OutpostName = 'ALPHA' | 'BRAVO' | 'CHARLIE'

type Helicopter = {
  pos: Vector2
  vel: Vector2
  radius: number
  rotor: number
  hitFlashMs: number
  yaw: number
  pitch: number
}

type Crate = {
  pos: Vector2
  vel: Vector2
  radius: number
  cargo: CargoType
  homeSlot: number
  angle: number
  angVel: number
  attached: boolean
  delivered: boolean
  destroyed: boolean
}

type Explosion = {
  pos: Vector2
  tMs: number
  lifeMs: number
  maxRadius: number
  color: string
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

type Emplacement = {
  id: number
  pos: Vector2
  alive: boolean
  cooldownMs: number
  fireRateMs: number
  range: number
}

type Projectile = {
  pos: Vector2
  vel: Vector2
  lifeMs: number
  radius: number
}

type Outpost = {
  name: OutpostName
  pad: Pad
}

type Mission = {
  id: number
  cargo: CargoType
  outpost: OutpostName
  createdAtMs: number
  dueAtMs: number
}

type Pad = {
  x: number
  width: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function SlingLoadGame({ onExit }: SlingLoadGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [deliveries, setDeliveries] = useState(0)
  const [missionQueue, setMissionQueue] = useState<Mission[]>([])
  const [failedMissions, setFailedMissions] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const missionQueueRef = useRef<Mission[]>([])
  useEffect(() => {
    missionQueueRef.current = missionQueue
  }, [missionQueue])

  const gameClockMsRef = useRef(0)
  const missionIdRef = useRef(1)
  const lastMissionSpawnMsRef = useRef(0)

  const MISSION_DEADLINE_MS = 3 * 60 * 1000
  const MISSION_SPAWN_INTERVAL_MS = 60 * 1000
  const MAX_MISSION_QUEUE = 6

  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })

  const worldWidthRef = useRef(4200)
  const cameraXRef = useRef(0)
  const prevCameraXRef = useRef(0)
  const cameraVelRef = useRef(0)

  const heliRef = useRef<Helicopter>({
    pos: { x: 300, y: 200 },
    vel: { x: 0, y: 0 },
    radius: 16,
    rotor: 0,
    hitFlashMs: 0,
    yaw: 1,
    pitch: 0,
  })

  // Rotor spool (0..1). Toggled with X.
  // This affects both visuals and flight physics.
  const rotorPowerRef = useRef(1)
  const rotorTargetRef = useRef(1)

  const ropeLengthRef = useRef(110)
  const cratesRef = useRef<Crate[]>([
    {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 14,
      cargo: 'medical',
      homeSlot: 0,
      angle: 0,
      angVel: 0,
      attached: false,
      delivered: false,
      destroyed: false,
    },
    {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 14,
      cargo: 'food',
      homeSlot: 1,
      angle: 0,
      angVel: 0,
      attached: false,
      delivered: false,
      destroyed: false,
    },
    {
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      radius: 14,
      cargo: 'ordinance',
      homeSlot: 2,
      angle: 0,
      angVel: 0,
      attached: false,
      delivered: false,
      destroyed: false,
    },
  ])

  const explosionsRef = useRef<Explosion[]>([])
  const debrisRef = useRef<Debris[]>([])
  const emplacementsRef = useRef<Emplacement[]>([])
  const projectilesRef = useRef<Projectile[]>([])

  const startPadRef = useRef<Pad>({ x: 260, width: 220 })
  const outpostsRef = useRef<Outpost[]>([
    { name: 'ALPHA', pad: { x: 1400, width: 180 } },
    { name: 'BRAVO', pad: { x: 2600, width: 180 } },
    { name: 'CHARLIE', pad: { x: 3800, width: 180 } },
  ])

  const hookRangeRef = useRef(80)

  const getHookPoint = useCallback((heli: Helicopter) => {
    const offY = heli.radius * 0.9
    const yawSign = heli.yaw >= 0 ? 1 : -1
    const yawAbs = Math.abs(heli.yaw)
    // When yaw is near 0 (front-facing), we intentionally squash X so that the left/right mirror flip is visually smooth.
    const yawScaleMag = 0.35 + 0.65 * smoothstep(0.08, 0.55, yawAbs)
    const sx = yawSign * yawScaleMag

    // Apply the same transform order as drawing: scaleX, then pitch rotation.
    const c = Math.cos(heli.pitch)
    const s = Math.sin(heli.pitch)

    // Start from local offset (0, offY)
    // After pitch rotation: (x, y) = (-offY*sin, offY*cos)
    // After scaleX: x *= sx
    const localX = (-offY * s) * sx
    const localY = offY * c

    return { x: heli.pos.x + localX, y: heli.pos.y + localY }
  }, [])

  const rot2 = useCallback((v: Vector2, a: number): Vector2 => {
    const c = Math.cos(a)
    const s = Math.sin(a)
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
  }, [])

  const getCrateAttachPoint = useCallback(
    (crate: Crate) => {
      // Attach at the top of the crate (local up).
      const local = { x: 0, y: -crate.radius }
      const off = rot2(local, crate.angle)
      return { x: crate.pos.x + off.x, y: crate.pos.y + off.y }
    },
    [rot2],
  )

  const groundHeightAt = useCallback((x: number) => {
    const { height } = canvasSizeRef.current
    void x
    return height * 0.82
  }, [])

  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]

  const makeMission = useCallback((nowMs: number): Mission => {
    const cargo = pick(['medical', 'food', 'ordinance'] as const)
    const outpost = pick(['ALPHA', 'BRAVO', 'CHARLIE'] as const)
    const id = missionIdRef.current++
    return { id, cargo, outpost, createdAtMs: nowMs, dueAtMs: nowMs + MISSION_DEADLINE_MS }
  }, [])

  const spawnCrateAtBase = useCallback(
    (crate: Crate) => {
      const startPad = startPadRef.current
      const slotSpacing = 54
      const x = startPad.x + 260 + crate.homeSlot * slotSpacing
      const y = groundHeightAt(x) - crate.radius
      crate.attached = false
      crate.delivered = false
      crate.destroyed = false
      crate.angle = 0
      crate.angVel = 0
      crate.vel = { x: 0, y: 0 }
      crate.pos = { x, y }
    },
    [groundHeightAt],
  )

  const createDebris = useCallback(
    (x: number, y: number, velX: number, velY: number, count: number, lifeMult: number, color: string) => {
      const d: Debris[] = []
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5
        const speed = 70 + Math.random() * 160
        d.push({
          pos: { x, y },
          vel: { x: velX + Math.cos(a) * speed, y: velY + Math.sin(a) * speed },
          angle: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 10,
          life: (900 + Math.random() * 650) * lifeMult,
          length: 6 + Math.random() * 14,
          color,
        })
      }
      debrisRef.current = [...debrisRef.current, ...d]
    },
    [],
  )

  const resetWorld = useCallback(() => {
    const heli = heliRef.current

    const nowMs = gameClockMsRef.current || performance.now()
    gameClockMsRef.current = nowMs
    missionIdRef.current = 1
    lastMissionSpawnMsRef.current = nowMs

    // Missions: first click-stop is still "deliver gear", but now queued + timed.
    const m = makeMission(nowMs)
    missionQueueRef.current = [m]
    setMissionQueue([m])

    // Start on the heliport pad with rotors spun down.
    const startPad = startPadRef.current
    const groundY = groundHeightAt(startPad.x)
    const renderScale = 1.6
    const skidYLocal = 14
    const skidBottomOffset = skidYLocal * renderScale + 2 // matches collision cushion

    heli.pos = { x: startPad.x, y: groundY - skidBottomOffset }
    heli.vel = { x: 0, y: 0 }
    heli.hitFlashMs = 0
    heli.pitch = 0
    heli.rotor = 0

    rotorPowerRef.current = 0
    rotorTargetRef.current = 0

    // Always keep each cargo type staged at base.
    const crates = cratesRef.current
    for (const c of crates) spawnCrateAtBase(c)

    // Spawn enemy emplacements between outposts (projectile hazard).
    const outposts = outpostsRef.current
    const mids: number[] = []
    if (outposts.length >= 2) {
      for (let i = 0; i < outposts.length - 1; i++) {
        mids.push((outposts[i].pad.x + outposts[i + 1].pad.x) / 2)
      }
    }
    emplacementsRef.current = mids.slice(0, 3).map((mx, i) => {
      const x = clamp(mx + (Math.random() - 0.5) * 240, 260, worldWidthRef.current - 260)
      const y = groundHeightAt(x)
      return {
        id: i + 1,
        pos: { x, y },
        alive: true,
        cooldownMs: 700 + Math.random() * 600,
        fireRateMs: 900,
        range: 950,
      }
    })
    projectilesRef.current = []

    ropeLengthRef.current = 110
    cameraXRef.current = 0
    prevCameraXRef.current = 0
    cameraVelRef.current = 0
  }, [groundHeightAt, makeMission, spawnCrateAtBase])

  const startGame = useCallback(() => {
    setScore(0)
    setLives(3)
    setDeliveries(0)
    setFailedMissions(0)
    resetWorld()
    setGameState('playing')
  }, [resetWorld])

  useEffect(() => {
    if (gameState !== 'menu') return
    resetWorld()
  }, [gameState, resetWorld])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
        return
      }

      // Rotor toggle (full <-> almost-off). A tiny amount remains for autorotation.
      if (!e.repeat && e.key.toLowerCase() === 'x' && gameState === 'playing') {
        rotorTargetRef.current = rotorTargetRef.current > 0.5 ? 0 : 1
      }

      // Pause
      if (e.key === 'p' && gameState === 'playing') {
        setGameState('paused')
        return
      }
      if (e.key === 'p' && gameState === 'paused') {
        setGameState('playing')
        return
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
        return
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
        return
      }

      // Sling attach / release
      if (gameState === 'playing' && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault()
        if (e.repeat) return
        const heli = heliRef.current
        const crates = cratesRef.current
        const attached = crates.find((c) => c.attached)

        if (attached) {
          attached.attached = false
          // Give a tiny separation impulse so it doesn't immediately reattach.
          attached.vel.x += heli.vel.x * 0.1
          attached.vel.y += heli.vel.y * 0.1
          attached.angVel += (Math.random() - 0.5) * 1.2
        } else {
          const hook = getHookPoint(heli)
          const hookRange = hookRangeRef.current

          let best: Crate | null = null
          let bestD = Infinity
          for (const c of crates) {
            if (c.delivered || c.destroyed) continue
            const attach = getCrateAttachPoint(c)
            const dx = attach.x - hook.x
            const dy = attach.y - hook.y
            const d = Math.hypot(dx, dy)
            if (d < hookRange && d < bestD) {
              best = c
              bestD = d
            }
          }

          if (best) {
            // Ensure only one crate can be attached.
            crates.forEach((c) => (c.attached = false))
            best.attached = true
          }
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
  }, [gameState, menuIndex, gameOverIndex, startGame, onExit, getHookPoint])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }

      // Keep world scale roughly comparable across screens.
      worldWidthRef.current = Math.max(5200, Math.floor(canvas.width * 7.0))

      // Heliport at the beginning of the level.
      startPadRef.current = { x: Math.max(240, canvas.width * 0.22), width: 220 }

      // Outposts spread across the map.
      const worldWidth = worldWidthRef.current
      const margin = Math.max(520, canvas.width * 0.55)
      const usable = Math.max(1200, worldWidth - margin * 2)
      const xs = [
        margin + usable * 0.25,
        margin + usable * 0.55,
        margin + usable * 0.85,
      ]
      outpostsRef.current = [
        { name: 'ALPHA', pad: { x: xs[0], width: 180 } },
        { name: 'BRAVO', pad: { x: xs[1], width: 180 } },
        { name: 'CHARLIE', pad: { x: xs[2], width: 180 } },
      ]

      if (gameState === 'menu') {
        resetWorld()
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const killPlayer = () => {
      if (gameState !== 'playing') return
      setLives((l) => {
        const nl = l - 1
        if (nl <= 0) {
          setTimeout(() => setGameState('gameOver'), 350)
        } else {
          // Soft reset position without resetting score.
          const { height } = canvasSizeRef.current
          heliRef.current.pos = { x: startPadRef.current.x, y: height * 0.35 }
          heliRef.current.vel = { x: 0, y: 0 }
          cratesRef.current.forEach((c) => (c.attached = false))
        }
        return nl
      })
    }

    const update = (dt: number, time: number) => {
      if (gameState !== 'playing') return

      gameClockMsRef.current = time

      const { width, height } = canvasSizeRef.current
      const worldWidth = worldWidthRef.current
      const heli = heliRef.current
      const crates = cratesRef.current

      const setQueue = (next: Mission[]) => {
        missionQueueRef.current = next
        setMissionQueue(next)
      }

      // Ensure we always have at least one active mission.
      if (missionQueueRef.current.length === 0) {
        const nm = makeMission(time)
        setQueue([nm])
        lastMissionSpawnMsRef.current = time
      }

      // Add a new mission every 60s (up to a small max queue).
      const elapsedSinceSpawn = time - lastMissionSpawnMsRef.current
      if (elapsedSinceSpawn >= MISSION_SPAWN_INTERVAL_MS) {
        const dueCount = Math.min(3, Math.floor(elapsedSinceSpawn / MISSION_SPAWN_INTERVAL_MS))
        if (dueCount > 0) {
          lastMissionSpawnMsRef.current += dueCount * MISSION_SPAWN_INTERVAL_MS

          const q = missionQueueRef.current
          const canAdd = Math.max(0, Math.min(dueCount, MAX_MISSION_QUEUE - q.length))
          if (canAdd > 0) {
            const added: Mission[] = []
            for (let i = 0; i < canAdd; i++) added.push(makeMission(time))
            setQueue([...q, ...added])
          }
        }
      }

      // Expire missions (3 minute deadline).
      const activeMission = missionQueueRef.current[0]
      if (activeMission && time > activeMission.dueAtMs) {
        const nextQ = missionQueueRef.current.slice(1)
        setFailedMissions((f) => f + 1)

        if (nextQ.length === 0) {
          const nm = makeMission(time)
          setQueue([nm])
          lastMissionSpawnMsRef.current = time
        } else {
          setQueue(nextQ)
        }
      }

      // Update explosion visuals
      explosionsRef.current = explosionsRef.current.filter((e) => {
        e.tMs -= dt * 1000
        return e.tMs > 0
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

      // Enemy emplacements: fire projectiles when in range
      const emplacements = emplacementsRef.current
      const projectiles = projectilesRef.current
      for (const e of emplacements) {
        if (!e.alive) continue
        e.cooldownMs -= dt * 1000

        const dx = heli.pos.x - e.pos.x
        const dy = heli.pos.y - (e.pos.y - 22)
        const dist = Math.hypot(dx, dy)
        if (dist < e.range && e.cooldownMs <= 0) {
          const inv = dist > 1e-4 ? 1 / dist : 0
          const nx = dx * inv
          const ny = dy * inv
          const speed = 620
          projectiles.push({
            pos: { x: e.pos.x, y: e.pos.y - 26 },
            vel: { x: nx * speed, y: ny * speed },
            lifeMs: 3600,
            radius: 4,
          })
          e.cooldownMs = e.fireRateMs
        }
      }

      // Projectiles update + heli collision
      projectilesRef.current = projectiles.filter((p) => {
        p.pos.x += p.vel.x * dt
        p.pos.y += p.vel.y * dt
        p.lifeMs -= dt * 1000
        if (p.lifeMs <= 0) return false

        // Cull if wildly out of bounds.
        if (p.pos.x < -200 || p.pos.x > worldWidth + 200 || p.pos.y < -200 || p.pos.y > height + 200) return false

        const dh = Math.hypot(p.pos.x - heli.pos.x, p.pos.y - heli.pos.y)
        if (dh < heli.radius * 1.1 + p.radius) {
          // Hit feedback
          explosionsRef.current.push({
            pos: { x: p.pos.x, y: p.pos.y },
            tMs: 220,
            lifeMs: 220,
            maxRadius: 46,
            color: '255, 255, 255',
          })
          createDebris(p.pos.x, p.pos.y, p.vel.x * 0.2, p.vel.y * 0.2, 10, 0.7, '255, 160, 40')
          killPlayer()
          return false
        }

        return true
      })

      heli.hitFlashMs = Math.max(0, heli.hitFlashMs - dt * 1000)

      // Controls (arcade thrust model)
      const thrust = 520
      const drag = 0.985

      // Rotor power (spools up/down via X)
      const spoolT = 1 - Math.exp(-3.2 * dt)
      rotorPowerRef.current += (rotorTargetRef.current - rotorPowerRef.current) * spoolT
      const rotorPower = clamp(rotorPowerRef.current, 0, 1)

      // Thrust scaling: when rotors are cut, almost no thrust remains.
      const thrustScale = 0.06 + 0.94 * rotorPower
      const thrustEff = thrust * thrustScale

      const left = keysRef.current.has('arrowleft') || keysRef.current.has('a')
      const right = keysRef.current.has('arrowright') || keysRef.current.has('d')
      const up = keysRef.current.has('arrowup') || keysRef.current.has('w')
      const down = keysRef.current.has('arrowdown') || keysRef.current.has('s')
      const stabilize = keysRef.current.has('shift')

      // Hover drift (when no input)
      if (!left && !right && !up && !down && !stabilize) {
        const t = time / 1000
        heli.vel.x += Math.sin(t * 1.1) * 15 * dt
        heli.vel.y += Math.cos(t * 1.4) * 12 * dt
      }

      if (left) heli.vel.x -= thrustEff * dt
      if (right) heli.vel.x += thrustEff * dt
      if (up) heli.vel.y -= thrustEff * dt
      if (down) heli.vel.y += thrustEff * dt

      // 3D-ish yaw + pitch:
      // - yaw: smoothly transitions between left (-1) and right (+1)
      // - pitch: nose-down tilt in the direction of travel (never upside down)
      const vx = heli.vel.x
      const vxAbs = Math.abs(vx)
      
      // If moving, face that direction. If stopped, maintain last facing direction.
      // We use a hysteresis threshold to prevent flipping during drift or small backward movements.
      let yawTarget = heli.yaw
      const turnThreshold = 60
      
      if (heli.yaw > 0) {
        // Facing Right: only turn left if moving significantly left
        if (vx < -turnThreshold) yawTarget = -1
        else yawTarget = 1
      } else {
        // Facing Left: only turn right if moving significantly right
        if (vx > turnThreshold) yawTarget = 1
        else yawTarget = -1
      }

      const yawT = 1 - Math.exp(-7 * dt)
      heli.yaw += (yawTarget - heli.yaw) * yawT

      const maxPitch = 0.28 // ~16 degrees
      // Tilt nose down in direction of travel relative to facing
      // If moving forward (vx and yaw same sign), pitch > 0 (Nose Down)
      // If moving backward (vx and yaw diff sign), pitch < 0 (Nose Up)
      const isMovingForward = (vx * heli.yaw) >= 0
      const pitchSign = isMovingForward ? 1 : -1
      const pitchTarget = pitchSign * maxPitch * smoothstep(0, 260, vxAbs)
      const pitchT = 1 - Math.exp(-8 * dt)
      heli.pitch += (pitchTarget - heli.pitch) * pitchT

      // The helicopter should not auto-descend unless it's carrying a load.
      // If the attached load is still resting on the ground, it shouldn't pull the chopper down.
      const carried = crates.find((c) => c.attached && !c.delivered && !c.destroyed)
      const groundUnderCrate = carried ? groundHeightAt(carried.pos.x) : 0
      const crateOnGround =
        !!carried && carried.pos.y + carried.radius >= groundUnderCrate - 0.5
      const isLoaded = !!carried && !crateOnGround

      // Gravity / lift model:
      // - With rotors on, we keep the original arcade feel (no gravity unless loaded).
      // - With rotors cut, add gravity, but allow autorotation to reduce descent.
      if (rotorPower < 0.15) {
        // Fall, but with some autorotation (more effective when descending / moving forward).
        const gravity = 260
        const autorotateLift = clamp(heli.vel.y, 0, 520) * 0.42 + clamp(Math.abs(heli.vel.x), 0, 520) * 0.08
        heli.vel.y += gravity * dt
        heli.vel.y -= clamp(autorotateLift, 0, 220) * dt
      } else if (isLoaded) {
        heli.vel.y += 220 * dt
      }

      const maxSpeed = 420
      const speed = Math.hypot(heli.vel.x, heli.vel.y)
      if (speed > maxSpeed) {
        heli.vel.x = (heli.vel.x / speed) * maxSpeed
        heli.vel.y = (heli.vel.y / speed) * maxSpeed
      }

      const d = stabilize ? 0.94 : drag
      heli.vel.x *= d
      heli.vel.y *= d

      heli.pos.x += heli.vel.x * dt
      heli.pos.y += heli.vel.y * dt

      // If you fly off either end of the level, the game ends.
      // Give it enough margin that the whole helicopter (incl. rotor disc) can disappear first.
      const edgeMargin = 32 * 1.6 + 24
      if (heli.pos.x < -edgeMargin || heli.pos.x > worldWidth + edgeMargin) {
        setGameState('gameOver')
        return
      }
      heli.pos.y = clamp(heli.pos.y, 30, height - 30)

      // Rotor animation (spools up/down via X)
      // When rotors are cut, blades keep spinning a bit during descent (autorotation).
      const autoSpin = rotorPower < 0.2 ? clamp(heli.vel.y / 420, 0, 1) * 0.35 : 0
      const rotorSpin = clamp(rotorPower + autoSpin, 0, 1.2)

      const rotorBase = 10
      const rotorMoveBoost = clamp(Math.hypot(heli.vel.x, heli.vel.y) / 60, 0, 8)
      heli.rotor += dt * (rotorBase + rotorMoveBoost) * rotorSpin

      // Crate physics
      for (const crate of crates) {
        if (crate.delivered || crate.destroyed) continue
        const crateDrag = stabilize ? 0.965 : 0.988
        crate.vel.y += 300 * dt
        crate.vel.x *= crateDrag
        crate.vel.y *= crateDrag
        crate.pos.x += crate.vel.x * dt
        crate.pos.y += crate.vel.y * dt

        // Angular dynamics (air drag)
        crate.angVel *= stabilize ? 0.92 : 0.985
        crate.angle += crate.angVel * dt
      }

      // Sling constraint (only max distance, slack allowed)
      const attachedCrate = crates.find((c) => c.attached && !c.delivered && !c.destroyed)
      if (attachedCrate) {
        const crate = attachedCrate
        const hook = getHookPoint(heli)
        const attach = getCrateAttachPoint(crate)
        const dx = attach.x - hook.x
        const dy = attach.y - hook.y
        const dist = Math.hypot(dx, dy)
        const L = ropeLengthRef.current

        if (dist > L && dist > 0.0001) {
          const nx = dx / dist
          const ny = dy / dist

          // Rotate crate naturally toward the rope direction.
          const toHookX = hook.x - crate.pos.x
          const toHookY = hook.y - crate.pos.y
          const toHookD = Math.hypot(toHookX, toHookY)
          if (toHookD > 1e-4) {
            const target = Math.atan2(toHookY, toHookX) + Math.PI / 2
            // Wrap to [-pi, pi]
            let err = target - crate.angle
            err = Math.atan2(Math.sin(err), Math.cos(err))
            const k = 14
            const damp = 4.2
            crate.angVel += (err * k - crate.angVel * damp) * dt
          }

          // Center offset from attach point (world)
          const rLocal = { x: 0, y: -crate.radius }
          const r = rot2(rLocal, crate.angle)

          // Project ATTACH point to rope circle, then back-compute crate center.
          crate.pos.x = hook.x + nx * L - r.x
          crate.pos.y = hook.y + ny * L - r.y

          // Remove outward velocity component (prevents energy blow-up)
          const relVx = crate.vel.x - heli.vel.x
          const relVy = crate.vel.y - heli.vel.y
          const outward = relVx * nx + relVy * ny
          if (outward > 0) {
            crate.vel.x -= outward * nx
            crate.vel.y -= outward * ny
          }

          // Add some tension damping
          crate.vel.x = crate.vel.x * 0.995 + heli.vel.x * 0.005
          crate.vel.y = crate.vel.y * 0.995 + heli.vel.y * 0.005
        }
      }

      // Ground collisions
      const groundHHeli = groundHeightAt(heli.pos.x)
      // Use the skid contact point (matches the rendered model) instead of the generic radius.
      // This prevents the skids from visually clipping through the ground.
      const renderScale = 1.6
      const skidYLocal = 14
      const skidProfile: Array<[number, number]> = [
        [-10, skidYLocal],
        [12, skidYLocal],
        [16, skidYLocal - 2],
      ]
      const cP = Math.cos(heli.pitch)
      const sP = Math.sin(heli.pitch)
      let skidMaxY = -Infinity
      for (const [x, y] of skidProfile) {
        // rotZ: y' = x*sin(pitch) + y*cos(pitch)
        const yRot = x * sP + y * cP
        skidMaxY = Math.max(skidMaxY, yRot)
      }
      const skidBottomOffset = skidMaxY * renderScale + 2 // small cushion for line width
      const skidBottom = heli.pos.y + skidBottomOffset

      if (skidBottom > groundHHeli) {
        const impact = Math.hypot(heli.vel.x, heli.vel.y)
        heli.pos.y = groundHHeli - skidBottomOffset
        if (rotorPower < 0.15) {
          // With rotors cut, settle onto the skids (landing).
          heli.vel.y = 0
          heli.vel.x *= 0.75
        } else {
          heli.vel.y *= -0.15
          heli.vel.x *= 0.6
        }
        heli.hitFlashMs = 150
        if (impact > 220) {
          killPlayer()
        }
      }

      for (const crate of crates) {
        const groundHCrate = groundHeightAt(crate.pos.x)
        const crateBottom = crate.pos.y + crate.radius
        if (!crate.delivered && !crate.destroyed && crateBottom > groundHCrate) {
          const impact = Math.abs(crate.vel.y)
          crate.pos.y = groundHCrate - crate.radius
          crate.vel.y = 0
          crate.vel.x *= 0.86

          // Hard impacts destroy cargo. Ordinance also explodes.
          // (This approximates "dropped from a height" via impact velocity.)
          const destroyImpact = 240
          if (impact >= destroyImpact) {
            crate.attached = false
            crate.destroyed = true

            const debrisColor =
              crate.cargo === 'medical'
                ? '255, 68, 68'
                : crate.cargo === 'food'
                  ? '255, 210, 74'
                  : '220, 220, 220'

            // Chunky debris burst
            createDebris(crate.pos.x, crate.pos.y, crate.vel.x, crate.vel.y, 14, 1, debrisColor)

            if (crate.cargo === 'ordinance') {
              // BOOM.
              const blastRadius = 160
              explosionsRef.current.push({
                pos: { x: crate.pos.x, y: crate.pos.y },
                tMs: 520,
                lifeMs: 520,
                maxRadius: blastRadius,
                color: '255, 160, 40',
              })

              // Blast destroys nearby emplacements.
              const emplacements2 = emplacementsRef.current
              for (const e of emplacements2) {
                if (!e.alive) continue
                const de = Math.hypot(e.pos.x - crate.pos.x, (e.pos.y - 18) - crate.pos.y)
                if (de < blastRadius) {
                  e.alive = false
                  explosionsRef.current.push({
                    pos: { x: e.pos.x, y: e.pos.y - 14 },
                    tMs: 300,
                    lifeMs: 300,
                    maxRadius: 70,
                    color: '255, 160, 40',
                  })
                  createDebris(e.pos.x, e.pos.y - 14, 0, -20, 16, 0.95, '255, 160, 40')
                }
              }

              // Blast clears projectiles too.
              projectilesRef.current = projectilesRef.current.filter((p) => {
                const dp = Math.hypot(p.pos.x - crate.pos.x, p.pos.y - crate.pos.y)
                return dp > blastRadius
              })

              // Extra spark debris on BOOM
              createDebris(crate.pos.x, crate.pos.y, crate.vel.x, crate.vel.y, 18, 0.9, '255, 160, 40')

              // Blast can take out the chopper if you're too close.
              const dh = Math.hypot(heli.pos.x - crate.pos.x, heli.pos.y - crate.pos.y)
              if (dh < blastRadius * 0.75) {
                killPlayer()
              }
            } else {
              // Small puff for destroyed cargo.
              explosionsRef.current.push({
                pos: { x: crate.pos.x, y: crate.pos.y },
                tMs: 260,
                lifeMs: 260,
                maxRadius: 60,
                color: '255, 255, 255',
              })
            }

            // Re-stage that crate type back at base.
            setTimeout(() => {
              spawnCrateAtBase(crate)
            }, 650)
            continue
          }

          // Delivery check: crate can satisfy ANY queued mission (out of order).
          const outposts = outpostsRef.current
          const onOutpost = outposts.find((o) => {
            const pad = o.pad
            return crate.pos.x >= pad.x - pad.width / 2 && crate.pos.x <= pad.x + pad.width / 2
          })

          if (!crate.attached && onOutpost && impact < 140) {
            const q = missionQueueRef.current
            const idx = q.findIndex((m) => m.outpost === onOutpost.name && m.cargo === crate.cargo)
            if (idx !== -1) {
              const deliveredMissionId = q[idx].id
              crate.delivered = true
              setDeliveries((d) => d + 1)
              setScore((s) => s + 500)

              setTimeout(() => {
                const qq = missionQueueRef.current
                const nextQ = qq.filter((m) => m.id !== deliveredMissionId)
                if (nextQ.length === 0) {
                  const nm = makeMission(gameClockMsRef.current)
                  setQueue([nm])
                  lastMissionSpawnMsRef.current = gameClockMsRef.current
                } else {
                  setQueue(nextQ)
                }

                // Re-stage the delivered crate back at base.
                spawnCrateAtBase(crate)
              }, 500)
            }
          }
        }
      }

      // Grounded crates should feel heavy: keep snapping toward a stable "flat" orientation
      // while resting on the ground (not just on the single penetration frame).
      for (const crate of crates) {
        if (crate.delivered || crate.destroyed || crate.attached) continue
        const groundH = groundHeightAt(crate.pos.x)
        const onGround = crate.pos.y + crate.radius >= groundH - 0.5
        if (onGround) {
          const step = Math.PI / 2
          const target = Math.round(crate.angle / step) * step
          let err = target - crate.angle
          err = Math.atan2(Math.sin(err), Math.cos(err))

          const kGround = 140
          const dampGround = 22
          crate.angVel += (err * kGround - crate.angVel * dampGround) * dt

          // Strong angular friction on contact.
          crate.angVel *= 0.35

          // Stop tiny jitter once essentially settled.
          if (Math.abs(err) < 0.01 && Math.abs(crate.angVel) < 0.08) {
            crate.angle = target
            crate.angVel = 0
          }
        }
      }

      // Camera follows heli
      const camTarget = clamp(heli.pos.x - width * 0.45, 0, worldWidth - width)
      cameraXRef.current += (camTarget - cameraXRef.current) * (1 - Math.pow(0.001, dt))

      if (dt > 0) {
        cameraVelRef.current = (cameraXRef.current - prevCameraXRef.current) / dt
      }
      prevCameraXRef.current = cameraXRef.current
    }

    const drawGround = (ctx2: CanvasRenderingContext2D) => {
      const { width, height } = canvasSizeRef.current
      const camX = cameraXRef.current
      const bufferPx = 260

      // --- Foreground ground plane (collidable) ---
      const groundY = groundHeightAt(0)

      ctx2.fillStyle = 'rgba(0, 255, 136, 0.06)'
      ctx2.beginPath()
      ctx2.moveTo(-bufferPx, height)
      ctx2.lineTo(-bufferPx, groundY)
      ctx2.lineTo(width + bufferPx, groundY)
      ctx2.lineTo(width + bufferPx, height)
      ctx2.closePath()
      ctx2.fill()

      // Grounded vegetation wisps (same layer/speed as crates/objects).
      const camVel = cameraVelRef.current
      const speed01 = clamp(Math.abs(camVel) / 520, 0, 1)
      const t = Date.now() / 1000

      const hash01 = (n: number) => {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
        return s - Math.floor(s)
      }

      const tuftSpacing = 26
      const xLeftWorld = camX - bufferPx
      const xRightWorld = camX + width + bufferPx
      const i0 = Math.floor(xLeftWorld / tuftSpacing)
      const i1 = Math.ceil(xRightWorld / tuftSpacing)

      const startPad = startPadRef.current
      const outposts = outpostsRef.current

      // Lean opposite camera movement to imply wind/speed.
      const baseLean = clamp(-camVel / 520, -1.3, 1.3)
      const wispAlpha = 0.10 + 0.18 * speed01

      ctx2.strokeStyle = `rgba(0,255,136,${wispAlpha})`
      ctx2.lineWidth = 1.5
      ctx2.beginPath()
      for (let i = i0; i <= i1; i++) {
        const r = hash01(i)
        // Not every slot has a tuft.
        if (r < 0.38) continue

        const wx = (i + (r - 0.5) * 0.9) * tuftSpacing

        // Keep pads clear (so objects and markings feel grounded/intentional).
        const onAnyPad =
          (wx >= startPad.x - startPad.width / 2 && wx <= startPad.x + startPad.width / 2) ||
          outposts.some((o) => wx >= o.pad.x - o.pad.width / 2 && wx <= o.pad.x + o.pad.width / 2)
        if (onAnyPad) continue

        const x = wx - camX
        const h = 4 + r * 10
        const lean = baseLean * (3 + h) + (hash01(i + 9.7) - 0.5) * 2
        const sway = Math.sin(t * (1.2 + r * 1.3) + i * 0.7) * (0.6 + 0.9 * speed01)

        // A few blades per tuft.
        const blades = 2 + Math.floor(hash01(i + 3.1) * 3)
        for (let b = 0; b < blades; b++) {
          const br = hash01(i * 13.7 + b * 7.3)
          const bx = x + (br - 0.5) * 6
          const bh = h * (0.65 + br * 0.8)
          const bend = (lean + sway) * (0.25 + br * 0.25)
          ctx2.moveTo(bx, groundY)
          ctx2.lineTo(bx + bend, groundY - bh)
        }

        // Occasional longer wisp that feels like vegetation.
        if (hash01(i + 22.9) > 0.86) {
          const wh = h * 1.8
          ctx2.moveTo(x, groundY)
          ctx2.lineTo(x + (lean + sway) * 0.45, groundY - wh)
        }
      }
      ctx2.stroke()

      // Crisp ground line on top to "ground" everything.
      ctx2.strokeStyle = '#00ff88'
      ctx2.lineWidth = 2
      ctx2.beginPath()
      ctx2.moveTo(-bufferPx, groundY)
      ctx2.lineTo(width + bufferPx, groundY)
      ctx2.stroke()
    }

    const drawHeliport = (ctx2: CanvasRenderingContext2D) => {
      const groundY = groundHeightAt(0)
      const startPad = startPadRef.current

      // Concrete pad
      const padTop = groundY - 10
      ctx2.fillStyle = 'rgba(0,0,0,0.72)'
      ctx2.fillRect(startPad.x - startPad.width / 2, padTop, startPad.width, 10)
      ctx2.strokeStyle = '#00ff88'
      ctx2.lineWidth = 2
      ctx2.strokeRect(startPad.x - startPad.width / 2, padTop, startPad.width, 10)

      // Pad markings
      ctx2.strokeStyle = 'rgba(0,255,136,0.55)'
      ctx2.lineWidth = 1
      ctx2.beginPath()
      ctx2.moveTo(startPad.x - 42, groundY - 7)
      ctx2.lineTo(startPad.x + 42, groundY - 7)
      ctx2.stroke()
      ctx2.fillStyle = 'rgba(0,255,136,0.55)'
      ctx2.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      ctx2.fillText('H', startPad.x - 4, groundY - 10)

      // Control tower (simple, grounded)
      const towerX = startPad.x - startPad.width / 2 - 70
      const towerW = 34
      const towerH = 92
      const baseY = groundY

      ctx2.fillStyle = 'rgba(0,0,0,0.72)'
      ctx2.fillRect(towerX, baseY - towerH, towerW, towerH)
      ctx2.strokeStyle = '#00ff88'
      ctx2.lineWidth = 2
      ctx2.strokeRect(towerX, baseY - towerH, towerW, towerH)

      // Cab
      const cabW = 54
      const cabH = 24
      const cabX = towerX - (cabW - towerW) / 2
      const cabY = baseY - towerH - cabH + 6
      ctx2.fillStyle = 'rgba(0,0,0,0.72)'
      ctx2.fillRect(cabX, cabY, cabW, cabH)
      ctx2.strokeStyle = '#00ff88'
      ctx2.lineWidth = 2
      ctx2.strokeRect(cabX, cabY, cabW, cabH)

      // Windows (subtle tint)
      ctx2.fillStyle = 'rgba(26,59,92,0.6)'
      ctx2.fillRect(cabX + 6, cabY + 6, cabW - 12, cabH - 12)
      ctx2.strokeStyle = 'rgba(0,255,136,0.35)'
      ctx2.lineWidth = 1
      ctx2.strokeRect(cabX + 6, cabY + 6, cabW - 12, cabH - 12)

      // Antenna
      ctx2.strokeStyle = 'rgba(0,255,136,0.55)'
      ctx2.lineWidth = 2
      ctx2.beginPath()
      ctx2.moveTo(towerX + towerW / 2, cabY)
      ctx2.lineTo(towerX + towerW / 2, cabY - 18)
      ctx2.stroke()

      // Simple cargo staging area (visual only)
      const yardX = startPad.x + startPad.width / 2 + 40
      const yardW = 180
      const yardH = 46
      ctx2.fillStyle = 'rgba(0,0,0,0.55)'
      ctx2.fillRect(yardX, groundY - yardH, yardW, yardH)
      ctx2.strokeStyle = 'rgba(0,255,136,0.6)'
      ctx2.lineWidth = 2
      ctx2.strokeRect(yardX, groundY - yardH, yardW, yardH)
      ctx2.strokeStyle = 'rgba(0,255,136,0.35)'
      ctx2.lineWidth = 1
      for (let i = 0; i < 6; i++) {
        const sx = yardX + 14 + i * 26
        ctx2.beginPath()
        ctx2.moveTo(sx, groundY - 6)
        ctx2.lineTo(sx + 16, groundY - 22)
        ctx2.stroke()
      }
      ctx2.fillStyle = 'rgba(0,255,136,0.65)'
      ctx2.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      ctx2.fillText('BASE SUPPLIES', yardX + 10, groundY - yardH - 8)
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current
      const camX = cameraXRef.current

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // World transform
      ctx.save()
      ctx.translate(-camX, 0)

      // Heliport + tower (at start of level)
      drawHeliport(ctx)

      // Ground
      ctx.save()
      ctx.translate(camX, 0)
      drawGround(ctx)
      ctx.restore()

      // Outpost pads (Alpha/Bravo/Charlie)
      const outposts = outpostsRef.current
      for (const o of outposts) {
        const pad = o.pad
        const padY = groundHeightAt(pad.x)
        const isTarget = missionQueue[0]?.outpost === o.name

        ctx.strokeStyle = isTarget ? 'rgba(255,255,255,0.95)' : '#00ff88'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(pad.x - pad.width / 2, padY)
        ctx.lineTo(pad.x - pad.width / 2, padY - 18)
        ctx.lineTo(pad.x + pad.width / 2, padY - 18)
        ctx.lineTo(pad.x + pad.width / 2, padY)
        ctx.stroke()

        ctx.strokeStyle = isTarget ? 'rgba(255,255,255,0.45)' : 'rgba(0,255,136,0.45)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pad.x - pad.width / 2 + 10, padY - 10)
        ctx.lineTo(pad.x + pad.width / 2 - 10, padY - 10)
        ctx.stroke()

        // Label
        ctx.fillStyle = isTarget ? 'rgba(255,255,255,0.9)' : 'rgba(0,255,136,0.8)'
        ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText(o.name, pad.x - pad.width / 2, padY - 24)

        // Simple outpost structures (visual character only)
        const baseY = padY
        const structureFill = 'rgba(0,0,0,0.72)'
        const structureStroke = isTarget ? 'rgba(255,255,255,0.85)' : 'rgba(0,255,136,0.7)'

        // Tent
        const tentW = 72
        const tentH = 34
        const tentX = pad.x - pad.width / 2 - 98
        const tentY = baseY - tentH
        ctx.fillStyle = structureFill
        ctx.fillRect(tentX, tentY, tentW, tentH)
        ctx.strokeStyle = structureStroke
        ctx.lineWidth = 2
        ctx.strokeRect(tentX, tentY, tentW, tentH)
        ctx.strokeStyle = 'rgba(0,255,136,0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(tentX, tentY)
        ctx.lineTo(tentX + tentW, tentY + tentH)
        ctx.moveTo(tentX + tentW, tentY)
        ctx.lineTo(tentX, tentY + tentH)
        ctx.stroke()

        // Comms tower
        const towerX = pad.x + pad.width / 2 + 56
        const towerH = 86
        ctx.strokeStyle = structureStroke
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(towerX, baseY)
        ctx.lineTo(towerX, baseY - towerH)
        ctx.stroke()
        ctx.strokeStyle = 'rgba(0,255,136,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(towerX - 10, baseY - 16)
        ctx.lineTo(towerX + 10, baseY - 16)
        ctx.moveTo(towerX - 8, baseY - 34)
        ctx.lineTo(towerX + 8, baseY - 34)
        ctx.moveTo(towerX - 6, baseY - 52)
        ctx.lineTo(towerX + 6, baseY - 52)
        ctx.stroke()

        // Fuel tank
        const tankX = pad.x - 10
        const tankW = 52
        const tankH = 22
        ctx.fillStyle = structureFill
        ctx.fillRect(tankX, baseY - tankH, tankW, tankH)
        ctx.strokeStyle = structureStroke
        ctx.lineWidth = 2
        ctx.strokeRect(tankX, baseY - tankH, tankW, tankH)
        ctx.strokeStyle = 'rgba(0,255,136,0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(tankX + 10, baseY - tankH)
        ctx.lineTo(tankX + 10, baseY)
        ctx.moveTo(tankX + 26, baseY - tankH)
        ctx.lineTo(tankX + 26, baseY)
        ctx.moveTo(tankX + 42, baseY - tankH)
        ctx.lineTo(tankX + 42, baseY)
        ctx.stroke()
      }

      // Enemy emplacements + projectiles
      const emps = emplacementsRef.current
      for (const e of emps) {
        if (!e.alive) continue
        const baseY = e.pos.y
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.strokeStyle = 'rgba(255,160,40,0.85)'
        ctx.lineWidth = 2
        ctx.fillRect(e.pos.x - 14, baseY - 18, 28, 18)
        ctx.strokeRect(e.pos.x - 14, baseY - 18, 28, 18)
        // Barrel points at heli
        const ang = Math.atan2(heliRef.current.pos.y - (baseY - 24), heliRef.current.pos.x - e.pos.x)
        ctx.strokeStyle = 'rgba(255,160,40,0.95)'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(e.pos.x, baseY - 24)
        ctx.lineTo(e.pos.x + Math.cos(ang) * 22, baseY - 24 + Math.sin(ang) * 22)
        ctx.stroke()
      }

      // Projectiles (tracers)
      for (const p of projectilesRef.current) {
        const a = clamp(p.lifeMs / 3600, 0, 1)
        const vx = p.vel.x
        const vy = p.vel.y
        const v = Math.hypot(vx, vy) || 1
        const nx = vx / v
        const ny = vy / v
        ctx.strokeStyle = `rgba(255,160,40,${0.35 + 0.55 * a})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(p.pos.x - nx * 6, p.pos.y - ny * 6)
        ctx.lineTo(p.pos.x + nx * 8, p.pos.y + ny * 8)
        ctx.stroke()
      }

      // Rope + crate
      const heli = heliRef.current
      const crates = cratesRef.current
      const hook = getHookPoint(heli)

      // Debris particles (vector-style)
      debrisRef.current.forEach((d) => {
        const a = clamp(d.life / 1600, 0, 1)
        ctx.strokeStyle = `rgba(${d.color}, ${a})`
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

      const attachedCrate = crates.find((c) => c.attached && !c.delivered && !c.destroyed)
      if (attachedCrate) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(hook.x, hook.y)
        const attach = getCrateAttachPoint(attachedCrate)
        ctx.lineTo(attach.x, attach.y)
        ctx.stroke()
      }

      for (const crate of crates) {
        if (crate.delivered || crate.destroyed) continue

        // Crate visuals: outline + braces + cargo icon
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.save()
        ctx.translate(crate.pos.x, crate.pos.y)
        ctx.rotate(crate.angle)

        // Body
        ctx.fillStyle = 'rgba(0,0,0,0.75)'
        ctx.beginPath()
        ctx.rect(-crate.radius, -crate.radius, crate.radius * 2, crate.radius * 2)
        ctx.fill()
        ctx.stroke()

        // Bracing
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(-crate.radius + 3, -crate.radius + 3)
        ctx.lineTo(crate.radius - 3, crate.radius - 3)
        ctx.moveTo(crate.radius - 3, -crate.radius + 3)
        ctx.lineTo(-crate.radius + 3, crate.radius - 3)
        ctx.stroke()

        // Icon
        const iconSize = Math.max(10, crate.radius * 0.9)
        const cx = 0
        const cy = 0
        const drawMedical = () => {
          ctx.fillStyle = 'rgba(255,68,68,0.95)'
          const bar = iconSize * 0.25
          const arm = iconSize * 0.9
          ctx.fillRect(cx - bar / 2, cy - arm / 2, bar, arm)
          ctx.fillRect(cx - arm / 2, cy - bar / 2, arm, bar)
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'
          ctx.lineWidth = 1
          ctx.strokeRect(cx - bar / 2, cy - arm / 2, bar, arm)
          ctx.strokeRect(cx - arm / 2, cy - bar / 2, arm, bar)
        }

        const drawFood = () => {
          // Canned food (cylinder + label band). Much clearer at small sizes.
          ctx.save()
          ctx.translate(cx, cy + 1)
          ctx.rotate(-0.12)

          const canW = iconSize * 0.92
          const canH = iconSize * 1.05
          const rx = canW * 0.50
          const ry = Math.max(2.2, canH * 0.18)
          const topY = -canH * 0.48
          const botY = canH * 0.48

          // Body
          ctx.fillStyle = 'rgba(220,220,220,0.92)'
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(-rx, topY)
          ctx.lineTo(-rx, botY)
          ctx.ellipse(0, botY, rx, ry, 0, Math.PI, 0, true)
          ctx.lineTo(rx, topY)
          ctx.ellipse(0, topY, rx, ry, 0, 0, Math.PI, true)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()

          // Label band
          const bandH = canH * 0.40
          const bandY = -bandH * 0.10
          ctx.fillStyle = 'rgba(255,210,74,0.90)'
          ctx.beginPath()
          ctx.rect(-rx + 1.2, bandY - bandH / 2, rx * 2 - 2.4, bandH)
          ctx.fill()
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'
          ctx.lineWidth = 1
          ctx.strokeRect(-rx + 1.2, bandY - bandH / 2, rx * 2 - 2.4, bandH)

          // Small highlight stripe
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(-rx * 0.35, topY + ry * 0.2)
          ctx.lineTo(-rx * 0.35, botY - ry * 0.2)
          ctx.stroke()

          // Top rim accent
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.ellipse(0, topY, rx * 0.92, ry * 0.70, 0, 0, Math.PI * 2)
          ctx.stroke()

          ctx.restore()
        }

        const drawOrdinance = () => {
          // Simple bomb icon.
          ctx.fillStyle = 'rgba(220,220,220,0.9)'
          const r = iconSize * 0.42
          ctx.beginPath()
          ctx.arc(cx, cy + 2, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'
          ctx.lineWidth = 1
          ctx.stroke()

          // Fuse
          ctx.strokeStyle = 'rgba(255,160,40,0.95)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(cx + r * 0.25, cy - r * 0.6)
          ctx.quadraticCurveTo(cx + r * 0.85, cy - r * 1.05, cx + r * 0.95, cy - r * 0.35)
          ctx.stroke()
          // Spark
          ctx.strokeStyle = 'rgba(255,160,40,0.75)'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(cx + r * 0.98, cy - r * 0.38)
          ctx.lineTo(cx + r * 1.25, cy - r * 0.62)
          ctx.moveTo(cx + r * 0.98, cy - r * 0.38)
          ctx.lineTo(cx + r * 1.33, cy - r * 0.28)
          ctx.stroke()
        }

        if (crate.cargo === 'medical') drawMedical()
        else if (crate.cargo === 'food') drawFood()
        else drawOrdinance()

        ctx.restore()

        // Hook hint ring
        const attach = getCrateAttachPoint(crate)
        const dx = attach.x - hook.x
        const dy = attach.y - hook.y
        const dist = Math.hypot(dx, dy)
        const hookRange = hookRangeRef.current
        if (!crate.attached && dist < hookRange) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(attach.x, attach.y, 26, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // Explosions (shockwaves)
      for (const e of explosionsRef.current) {
        const age01 = 1 - e.tMs / e.lifeMs
        const r = e.maxRadius * (0.15 + 0.85 * age01)
        const a = 1 - age01
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = `rgba(${e.color}, ${0.55 * a})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(e.pos.x, e.pos.y, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = `rgba(255,255,255, ${0.22 * a})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(e.pos.x, e.pos.y, r * 0.72, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // ========== 3D Helicopter Rendering ==========
      // 3D point type: [x, y, z] where +X is forward, +Y is down, +Z is right (viewer's left)
      type V3 = [number, number, number]
      type Renderable = 
        | { type: 'poly', pts: V3[], fill: string, stroke: string, z?: number, _tPts?: V3[], _depth?: number }
        | { type: 'line', pts: V3[], stroke: string, width: number, z?: number, _tPts?: V3[], _depth?: number }

      // Rotate around Y axis (yaw)
      const rotY = (p: V3, angle: number): V3 => {
        const c = Math.cos(angle), s = Math.sin(angle)
        return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
      }
      // Rotate around Z axis (pitch)
      const rotZ = (p: V3, angle: number): V3 => {
        const c = Math.cos(angle), s = Math.sin(angle)
        return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
      }
      // Project 3D to 2D (side view: Z->screen X, Y->screen Y)
      const proj = (p: V3): [number, number] => [p[2], p[1]]

      // Helicopter 3D model (scale factor)
      const S3 = 1.6
      const bodyFill = '#000000' // Occlude background
      const bodyStroke = '#ffffff'
      
      const renderables: Renderable[] = []
      const addFace = (pts: V3[], fill: string, stroke: string) => renderables.push({ type: 'poly', pts, fill, stroke })
      const addLine = (pts: V3[], stroke: string, width: number) => renderables.push({ type: 'line', pts, stroke, width })

      // --- Fuselage Geometry (Huey-style) ---
      // Define profile points (Left side)
      const wBody = 5
      const wNose = 3.5
      const wTailStart = 2.5
      
      // 0: Nose Tip, 1: Windshield Top, 2: Roof Front, 3: Roof Rear, 4: Tail Start Top
      // 5: Tail Start Bot, 6: Belly Rear, 7: Belly Front
      const nodesL: V3[] = [
        [24, 3, -wNose],      // 0
        [14, -4, -wBody],     // 1
        [6, -6, -wBody],      // 2
        [-8, -6, -wBody],     // 3
        [-12, -2, -wTailStart], // 4
        [-12, 4, -wTailStart],  // 5
        [-6, 8, -wBody],      // 6
        [14, 8, -wBody]       // 7
      ]
      const nodesR = nodesL.map(p => [p[0], p[1], -p[2]] as V3)

      // Side Faces
      addFace(nodesL, bodyFill, bodyStroke)
      addFace(nodesR.slice().reverse(), bodyFill, bodyStroke)

      // Windows and Doors
      const windowFill = '#1a3b5c'
      const doorStroke = bodyStroke
      const zSide = wBody + 0.1 // Slight offset to prevent z-fighting

      // Pilot Window (Sleek, following nose line)
      // Helper to interpolate Z for nose points
      const getZ = (x: number) => {
        if (x <= 14) return zSide
        const t = (x - 14) / (24 - 14)
        return wBody + t * (wNose - wBody) + 0.1
      }

      const winL: V3[] = [
        [6, -5, -getZ(6)],
        [14, -4, -getZ(14)],
        [20, 0, -getZ(20)],
        [14, 2, -getZ(14)],
        [6, 2, -getZ(6)]
      ]
      const winR: V3[] = winL.map(p => [p[0], p[1], -p[2]] as V3)
      
      addFace(winL, windowFill, bodyStroke)
      addFace(winR, windowFill, bodyStroke)

      // Cargo Door Outline (Large sliding door)
      const doorL: V3[] = [
        [6, -5, -zSide], [-6, -5, -zSide], [-6, 7, -zSide], [6, 7, -zSide], [6, -5, -zSide]
      ]
      const doorR: V3[] = [
        [6, -5, zSide], [-6, -5, zSide], [-6, 7, zSide], [6, 7, zSide], [6, -5, zSide]
      ]
      addLine(doorL, doorStroke, 1)
      addLine(doorR, doorStroke, 1)

      // Connecting Faces (Perimeter strip)
      for (let i = 0; i < nodesL.length; i++) {
        const next = (i + 1) % nodesL.length
        addFace([nodesL[i], nodesR[i], nodesR[next], nodesL[next]], bodyFill, bodyStroke)
      }

      // Engine Housing (Hump on roof)
      const engW = 2.5
      const engL: V3[] = [[4, -6, -engW], [4, -10, -engW], [-8, -10, -engW], [-8, -6, -engW]]
      const engR: V3[] = engL.map(p => [p[0], p[1], -p[2]] as V3)
      addFace(engL, bodyFill, bodyStroke)
      addFace(engR.slice().reverse(), bodyFill, bodyStroke)
      addFace([engL[1], engR[1], engR[2], engL[2]], bodyFill, bodyStroke) // Top
      addFace([engL[0], engR[0], engR[1], engL[1]], bodyFill, bodyStroke) // Front
      addFace([engL[2], engR[2], engR[3], engL[3]], bodyFill, bodyStroke) // Back

      // Tail Boom
      const tbStartW = wTailStart
      const tbEndW = 1
      const tbL: V3[] = [[-12, -2, -tbStartW], [-40, -2, -tbEndW], [-40, 1, -tbEndW], [-12, 4, -tbStartW]]
      const tbR: V3[] = [[-12, -2, tbStartW], [-40, -2, tbEndW], [-40, 1, tbEndW], [-12, 4, tbStartW]]
      addFace(tbL, bodyFill, bodyStroke)
      addFace(tbR.slice().reverse(), bodyFill, bodyStroke)
      addFace([tbL[0], tbR[0], tbR[1], tbL[1]], bodyFill, bodyStroke) // Top
      addFace([tbL[2], tbR[2], tbR[3], tbL[3]], bodyFill, bodyStroke) // Bottom
      addFace([tbL[1], tbR[1], tbR[2], tbL[2]], bodyFill, bodyStroke) // End cap

      // Tail Fin
      const fin: V3[] = [[-36, -2, 0], [-42, -12, 0], [-46, -12, 0], [-40, 1, 0]]
      addFace(fin, bodyFill, bodyStroke)

      // Skids
      const skidZ = 7
      const skidY = 14
      const skidL: V3[] = [[-10, skidY, -skidZ], [12, skidY, -skidZ], [16, skidY - 2, -skidZ]] // Curved front
      const skidR: V3[] = [[-10, skidY, skidZ], [12, skidY, skidZ], [16, skidY - 2, skidZ]]
      addLine(skidL, bodyStroke, 2)
      addLine(skidR, bodyStroke, 2)
      // Struts
      addLine([[-4, 8, -4], [-4, skidY, -skidZ]], bodyStroke, 1.5)
      addLine([[4, 8, -4], [4, skidY, -skidZ]], bodyStroke, 1.5)
      addLine([[-4, 8, 4], [-4, skidY, skidZ]], bodyStroke, 1.5)
      addLine([[4, 8, 4], [4, skidY, skidZ]], bodyStroke, 1.5)
      // Cross bars
      addLine([[-4, skidY, -skidZ], [-4, skidY, skidZ]], bodyStroke, 1.5)
      addLine([[4, skidY, -skidZ], [4, skidY, skidZ]], bodyStroke, 1.5)

      // Mast
      addLine([[0, -6, 0], [0, -14, 0]], bodyStroke, 2)

      // Main Rotor
      const rotorRadius = 32
      const rotorAngle = heli.rotor
      const rotorBlade1: V3[] = [
        [Math.cos(rotorAngle) * rotorRadius, -14, Math.sin(rotorAngle) * rotorRadius],
        [-Math.cos(rotorAngle) * rotorRadius, -14, -Math.sin(rotorAngle) * rotorRadius]
      ]
      const rotorBlade2: V3[] = [
        [Math.cos(rotorAngle + Math.PI/2) * rotorRadius, -14, Math.sin(rotorAngle + Math.PI/2) * rotorRadius],
        [-Math.cos(rotorAngle + Math.PI/2) * rotorRadius, -14, -Math.sin(rotorAngle + Math.PI/2) * rotorRadius]
      ]
      addLine(rotorBlade1, 'rgba(255,255,255,0.8)', 2)
      addLine(rotorBlade2, 'rgba(255,255,255,0.8)', 2)

      // Tail Rotor (XY plane, axis along Z - perpendicular to fuselage side)
      const trRadius = 8
      const trAngle = heli.rotor * 3
      const trOffset = 2 // Right side
      const trCenter: V3 = [-42, -12, trOffset] 
      const trBlade: V3[] = [
        [trCenter[0] + Math.cos(trAngle) * trRadius, trCenter[1] + Math.sin(trAngle) * trRadius, trCenter[2]],
        [trCenter[0] - Math.cos(trAngle) * trRadius, trCenter[1] - Math.sin(trAngle) * trRadius, trCenter[2]]
      ]
      addLine(trBlade, 'rgba(255,255,255,0.6)', 1.5)
      // Tail rotor hub
      addLine([[-42, -12, 0], [-42, -12, trOffset]], bodyStroke, 1)


      // --- Rendering ---
      ctx.save()
      ctx.translate(heli.pos.x, heli.pos.y)

      // Convert yaw/pitch
      const yawAngle = -heli.yaw * (Math.PI / 2)
      const pitchAngle = heli.pitch

      // Transform and Sort
      renderables.forEach(r => {
        // Transform points
        const tPts = r.pts.map(p => {
          let tp = rotZ(p, pitchAngle)
          tp = rotY(tp, yawAngle)
          return tp
        })
        // Store transformed points for drawing
        // We can't mutate r.pts because it's shared/const. 
        // But we can store the projected 2D points and the Z depth.
        
        // Compute average Z for sorting
        let zSum = 0
        tPts.forEach(p => zSum += p[0]) // In our projection, Z is mapped to X, but depth is...
        // Wait, our coordinate system: +X forward, +Y down, +Z right.
        // Viewer is looking from +Z side? No, side view.
        // proj = (p) => [p[2], p[1]] (Z -> Screen X, Y -> Screen Y)
        // So Screen X is Z (Right), Screen Y is Y (Down).
        // The depth axis (into the screen) is X (Forward/Backward of heli).
        // If we view from the side (Right side), then +Z is towards us.
        // Wait, if proj is [p[2], p[1]], then p[2] is horizontal screen pos.
        // p[0] (Forward) is the depth axis relative to the screen?
        // Let's check rotY (Yaw).
        // rotY rotates X and Z.
        // If yaw=0, X is depth?
        // Yes. If we look from the side, X is left-right on the heli, but depth in the view?
        // No, if proj is [p[2], p[1]], then p[2] (Right) is Screen X.
        // p[1] (Down) is Screen Y.
        // p[0] (Forward) is NOT drawn. So p[0] is the depth (Z-buffer value).
        // Positive X is Forward. If we view from the Right (+Z), then +X is to our Left?
        // Let's assume p[0] is depth.
        
        const depth = tPts.reduce((sum, p) => sum + p[0], 0) / tPts.length
        
        // Store for render
        // We'll attach a temporary property or return a new object
        r._tPts = tPts
        r._depth = depth
      })

      // Sort by depth (furthest first). 
      // If +X is depth, and we view from +Z? 
      // Actually, let's just try sorting by p[0].
      // If p[0] is large (Forward), is it close or far?
      // If we view from the side, X is perpendicular to view direction.
      // Wait, if proj uses p[2] and p[1], then p[0] is the axis perpendicular to the screen.
      // So yes, p[0] is depth.
      // We want to draw furthest X first? Or closest?
      // Standard painter's: draw furthest away first.
      // If +X is "into" the screen or "out of"?
      // Let's guess: Sort ascending or descending.
      // If we rotate 90 deg, X becomes Z.
      renderables.sort((a, b) => (a._depth || 0) - (b._depth || 0)) // Try ascending first

      // Draw
      renderables.forEach(r => {
        const tPts = r._tPts as V3[]
        const screenPts = tPts.map(p => proj(p))
        
        ctx.beginPath()
        if (screenPts.length > 0) {
          ctx.moveTo(screenPts[0][0] * S3, screenPts[0][1] * S3)
          for (let i = 1; i < screenPts.length; i++) {
            ctx.lineTo(screenPts[i][0] * S3, screenPts[i][1] * S3)
          }
        }
        
        if (r.type === 'poly') {
          ctx.closePath()
          ctx.fillStyle = r.fill
          ctx.fill()
          ctx.strokeStyle = r.stroke
          ctx.lineWidth = 1.5
          ctx.stroke()
        } else if (r.type === 'line') {
          ctx.strokeStyle = r.stroke
          ctx.lineWidth = r.width
          ctx.stroke()
        }
      })

      // Hook point (transformed)
      const carried = cratesRef.current.find((c) => c.attached && !c.delivered && !c.destroyed)
      const groundUnderCrate = carried ? groundHeightAt(carried.pos.x) : 0
      const crateOnGround =
        !!carried && carried.pos.y + carried.radius >= groundUnderCrate - 0.5
      const isLoaded = !!carried && !crateOnGround

      const hookLocal: V3 = [0, 8, 0] // Belly center
      let hp = rotZ(hookLocal, pitchAngle)
      hp = rotY(hp, yawAngle)
      const [hx, hy] = proj(hp)
      ctx.strokeStyle = isLoaded ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(hx * S3, hy * S3, 3, 0, Math.PI * 2)
      ctx.stroke()

      ctx.restore()

      ctx.restore() // world

      // HUD
      if (gameState === 'playing') {
        ctx.fillStyle = '#00ff88'
        ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 16, 28)
        ctx.fillText(`LIVES ${lives}`, 16, 48)
        ctx.fillText(`DELIVERED ${deliveries}`, 16, 68)

        const threats = emplacementsRef.current.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
        ctx.fillStyle = 'rgba(255,160,40,0.85)'
        ctx.fillText(`THREATS ${threats}`, 16, 86)

        const nowMs = gameClockMsRef.current || performance.now()
        const q = missionQueue
        const active = q[0]
        if (active) {
          const remainingMs = Math.max(0, active.dueAtMs - nowMs)
          const mm = Math.floor(remainingMs / 60000)
          const ss = Math.floor((remainingMs % 60000) / 1000)
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.fillText(
            `MISSION: DELIVER ${active.cargo.toUpperCase()} TO ${active.outpost}  (${mm}:${ss
              .toString()
              .padStart(2, '0')})`,
            16,
            108,
          )
        }

        if (q.length > 1) {
          ctx.fillStyle = 'rgba(0,255,136,0.7)'
          ctx.fillText(`QUEUE ${q.length - 1}  FAILED ${failedMissions}`, 16, 128)

          ctx.fillStyle = 'rgba(0,255,136,0.55)'
          const maxShow = Math.min(q.length - 1, 3)
          for (let i = 1; i <= maxShow; i++) {
            const m = q[i]
            const remainingMs = Math.max(0, m.dueAtMs - nowMs)
            const mm = Math.floor(remainingMs / 60000)
            const ss = Math.floor((remainingMs % 60000) / 1000)
            ctx.fillText(
              `NEXT ${i}: ${m.cargo.toUpperCase()} → ${m.outpost}  (${mm}:${ss.toString().padStart(2, '0')})`,
              16,
              128 + 18 * i,
            )
          }
        } else if (failedMissions > 0) {
          ctx.fillStyle = 'rgba(0,255,136,0.7)'
          ctx.fillText(`FAILED ${failedMissions}`, 16, 128)
        }

        // Minimal instructions
        ctx.fillStyle = 'rgba(0,255,136,0.65)'
        ctx.fillText('ARROWS/WASD: THRUST  •  SPACE: HOOK/RELEASE  •  SHIFT: STABILIZE  •  P: PAUSE  •  ESC: EXIT', 16, height - 18)
      }
    }

    const animate = (t: number) => {
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = t
      update(dt, t)
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [
    gameState,
    groundHeightAt,
    score,
    lives,
    deliveries,
    missionQueue,
    failedMissions,
    getHookPoint,
    makeMission,
    spawnCrateAtBase,
  ])

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center max-w-md px-8">
            <h1 className="text-6xl text-[#00ff88] mb-2 tracking-[0.2em] uppercase">Sling Load</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2"><span className="text-white">›</span> Arrows / WASD: Thrust</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> Space: Hook / Release</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> X: Rotor on / off</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> Shift: Stabilize (damping)</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> P: Pause</div>
            </div>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={startGame}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  menuIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'bg-black border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Start
              </button>
              <button
                onClick={onExit}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  menuIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'bg-black border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to confirm • Esc to exit</p>
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
                className="w-64 px-8 py-3 bg-black border-2 border-[#00ff88] text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
              >
                Resume
              </button>
              <button
                onClick={onExit}
                className="w-64 px-8 py-3 bg-black border-2 border-[#00ff88] text-[#00ff88] uppercase tracking-widest hover:bg-[#00ff88] hover:text-black transition-colors"
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
            <h1 className="text-4xl text-[#00ff88] mb-2 tracking-[0.3em] uppercase">Game Over</h1>
            <div className="text-[#00ff88] text-sm mb-8 tracking-wider text-center">
              <div>Score {score.toString().padStart(6, '0')}</div>
              <div>Delivered {deliveries}</div>
            </div>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={startGame}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'bg-black border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Play Again
              </button>
              <button
                onClick={() => setGameState('menu')}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'bg-black border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Main Menu
              </button>
              <button
                onClick={onExit}
                className={`w-64 px-8 py-3 border-2 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 2
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'bg-black border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to confirm • Esc to exit</p>
          </div>
        </div>
      )}
    </div>
  )
}
