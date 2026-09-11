import { useEffect, useRef, useState, useCallback } from 'react'
import type {
  BaseShot,
  Bullet,
  Debris,
  HardVacuumGameProps,
  Harpoon,
  PhaserBeam,
  PhaserParticle,
  Rock,
  RockKind,
  Ship,
  Vector2,
  V3,
} from './types'
import { clamp, makeRockMesh } from './math'
import { rayCircleHitDistance } from './phaserGeometry'
import {
  WORLD_CENTER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  isInsideCavern,
  raycastCavern,
  resolveCircleInCavern,
} from './worldGeometry'
import { sounds } from './sound'
import {
  ATTRACTOR_BEAM_DURATION,
  ATTRACTOR_BEAM_RANGE_MULTIPLIER,
  ATTRACTOR_BEAM_STRENGTH,
  BASE_GUN_INITIAL_COOLDOWNS,
  BASE_SHOT_SPEED,
  BLUE_ROCK_SPAWN_CHANCE_BASE,
  BLUE_ROCK_SPAWN_CHANCE_MAX,
  BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL,
  BULLET_SPEED,
  COLLISION_DAMAGE_FAST,
  COLLISION_DAMAGE_MEDIUM,
  COLLISION_DAMAGE_SLOW,
  CREDITS_SHOOTING_ROCK_DIVISOR,
  DEBRIS_LIFETIME_MAX,
  DEBRIS_LIFETIME_MIN,
  DEBRIS_SPEED_MAX,
  DEBRIS_SPEED_MIN,
  DYING_ANIMATION_DURATION,
  INVULNERABILITY_AFTER_HIT,
  INVULNERABILITY_GAME_START,
  INVULNERABILITY_LEVEL_START,
  INVULNERABILITY_MIN_AFTER_REPAIR,
  PHASER_BEAM_RADIUS,
  PHASER_COOLDOWN,
  PHASER_HIT_INTERVAL,
  PHASER_MAX_FIRE_DURATION,
  PHASER_RANGE,
  ROCK_BASE_CLEARANCE,
  ROCK_BASE_SPEED_MAX,
  ROCK_BASE_SPEED_MIN,
  ROCK_SPAWN_AVOID_RADIUS,
  RED_ROCK_BLAST_IMPULSE,
  RED_ROCK_BLAST_RADIUS,
  RED_ROCK_DETONATION_DELAY,
  RED_ROCK_SPAWN_CHANCE,
  SHIELD_REPAIR_TIME,
  SHIP_FRICTION,
  SHIP_LATERAL_FRICTION,
  SHIP_MAX_SHIELDS,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  SHIP_THRUST_ACCELERATION,
  TIME_BONUS_MAX_MULTIPLIER,
  TIME_BONUS_TARGET_SECONDS,
} from './tuning'
import {
  HardVacuumGameOverOverlay,
  HardVacuumLeftHud,
  HardVacuumMenuOverlay,
  HardVacuumPausedOverlay,
  HardVacuumRightHud,
  HardVacuumWaveCompleteOverlay,
  HardVacuumTopCenterHud,
} from './ui'
import { drawHardVacuumFrame } from './render'
import { updateBaseDefenseAndProcessing } from './baseDefense'
import { updateHarpoon } from './harpoon'
import { updateAttractorBeam } from './attractor'
import { updateBulletsAndPlayerRockCollisions } from './bullets'

export function HardVacuumGame({ onExit }: HardVacuumGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'waveComplete' | 'dying' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [shields, setShields] = useState(SHIP_MAX_SHIELDS)
  const shieldsRef = useRef(shields)
  const gameStateRef = useRef(gameState)
  const [level, setLevel] = useState(1)
  const [attractorActive, setAttractorActive] = useState(false)
  const [attractorTimer, setAttractorTimer] = useState(ATTRACTOR_BEAM_DURATION)
  const attractorActiveRef = useRef(attractorActive)
  const attractorTimerRef = useRef(attractorTimer)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)
  
  // Wave timing for bonus multiplier
  const [waveStartTime, setWaveStartTime] = useState(0)
  const [waveElapsedTime, setWaveElapsedTime] = useState(0) // Updated each frame during gameplay
  const [waveCompletionTime, setWaveCompletionTime] = useState(0)
  const [waveCreditsEarned, setWaveCreditsEarned] = useState(0)
  const [waveTimeBonus, setWaveTimeBonus] = useState(0)
  const waveCreditsRef = useRef(0)
  const waveStartTimeRef = useRef(waveStartTime)

  useEffect(() => {
    shieldsRef.current = shields
  }, [shields])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    attractorActiveRef.current = attractorActive
  }, [attractorActive])

  useEffect(() => {
    attractorTimerRef.current = attractorTimer
  }, [attractorTimer])

  useEffect(() => {
    waveStartTimeRef.current = waveStartTime
  }, [waveStartTime])

  const setGameStateWithRef = useCallback((next: 'menu' | 'playing' | 'paused' | 'waveComplete' | 'dying' | 'gameOver') => {
    gameStateRef.current = next
    setGameState(next)
  }, [])

  const setAttractorActiveWithRef = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setAttractorActive((prev) => {
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value
      attractorActiveRef.current = next
      return next
    })
  }, [])

  const setAttractorTimerWithRef = useCallback((value: number | ((prev: number) => number)) => {
    setAttractorTimer((prev) => {
      const next = typeof value === 'function' ? (value as (p: number) => number)(prev) : value
      attractorTimerRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    // Ensure continuous audio loops don't get stuck across state transitions.
    if (gameState !== 'playing') sounds.stopThrust()
    if (gameState !== 'playing') sounds.stopRepairHum()
    if (gameState !== 'playing') sounds.stopPhaser()
    if (gameState !== 'playing') sounds.stopAttractor()

    if (gameState === 'waveComplete') sounds.startStoreMusic()
    else sounds.stopStoreMusic()

    return () => {
      // Ensure no loop persists across unmount / StrictMode re-mounts.
      sounds.stopThrust()
      sounds.stopStoreMusic()
      sounds.stopRepairHum()
      sounds.stopPhaser(true)
      sounds.stopAttractor(true)
    }
  }, [gameState])

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
  const lastTimeRef = useRef(0)
  const invulnerableRef = useRef(0)
  const lastShieldHitAtRef = useRef(0)
  const lastShieldRechargeAtRef = useRef(0)
  const dyingTimerRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const levelingUpRef = useRef(false)
  const waitingForWaveEndFxRef = useRef(false)
  const harpoonRef = useRef<Harpoon>({ state: 'idle' })
  const miningBaseAngleRef = useRef(0)
  const miningGunCooldownsRef = useRef<[number, number, number]>(BASE_GUN_INITIAL_COOLDOWNS)

  const phaserStateRef = useRef<{ energyMs: number; cooldownMs: number; hitCooldownMs: number; particleCarry: number }>({
    energyMs: PHASER_MAX_FIRE_DURATION * 1000,
    cooldownMs: 0,
    hitCooldownMs: 0,
    particleCarry: 0,
  })
  const phaserBeamRef = useRef<PhaserBeam>({
    active: false,
    start: { x: 0, y: 0 },
    direction: { x: 1, y: 0 },
    length: 0,
    energy01: 1,
  })
  const phaserParticlesRef = useRef<PhaserParticle[]>([])

  // Updated each frame while playing.
  const shipFullyInBaseRef = useRef(false)

  const pendingNextWaveRef = useRef<number | null>(null)

  // Curated menu “action shot” scene.
  const menuSceneInitializedRef = useRef(false)

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

  const calculateTimeMultiplier = useCallback((completionTimeSeconds: number) => {
    // Exponential decay: rewards speed significantly
    // Fast completion = high multiplier, slow completion approaches 1.0x (no bonus)
    return 1 + TIME_BONUS_MAX_MULTIPLIER * Math.exp(-completionTimeSeconds / TIME_BONUS_TARGET_SECONDS)
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
    // Legacy callback shape used by the physics helpers; distance is now ordinary world space.
    void w
    void h
    return { dx: bx - ax, dy: by - ay }
  }, [])

  const buildRopeBetween = useCallback(
    (ax: number, ay: number, bx: number, by: number, ropeLen: number) => {
      const segments = clamp(Math.ceil(ropeLen / 14), 10, 44)
      const segLen = ropeLen / segments
      const d = { dx: bx - ax, dy: by - ay }
      const rope: Vector2[] = []
      const ropePrev: Vector2[] = []
      for (let k = 1; k < segments; k++) {
        const t = k / segments
        const px = ax + d.dx * t
        const py = ay + d.dy * t
        rope.push({ x: px, y: py })
        ropePrev.push({ x: px, y: py })
      }
      return { rope, ropePrev, segLen }
    },
    [],
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
    const speed = ROCK_BASE_SPEED_MIN + Math.random() * (ROCK_BASE_SPEED_MAX - ROCK_BASE_SPEED_MIN)

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
        const speed = DEBRIS_SPEED_MIN + Math.random() * (DEBRIS_SPEED_MAX - DEBRIS_SPEED_MIN)
        debris.push({
          pos: { x, y },
          vel: { x: velX + Math.cos(angle) * speed, y: velY + Math.sin(angle) * speed },
          angle: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 10,
          life: (DEBRIS_LIFETIME_MIN + Math.random() * (DEBRIS_LIFETIME_MAX - DEBRIS_LIFETIME_MIN)) * lifeMult,
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
      const ship = shipRef.current
      const sampleSpawn = () => {
        const a = Math.random() * Math.PI * 2
        const distance = 430 + Math.random() * 520
        const x = ship.pos.x + Math.cos(a) * distance
        const y = ship.pos.y + Math.sin(a) * distance
        const travelAngle = a + Math.PI + (Math.random() - 0.5) * Math.PI * 0.85
        const speed = (ROCK_BASE_SPEED_MIN + Math.random() * (ROCK_BASE_SPEED_MAX - ROCK_BASE_SPEED_MIN)) * speedMult
        const vel: Vector2 = { x: Math.cos(travelAngle) * speed, y: Math.sin(travelAngle) * speed }
        return { x, y, vel }
      }

      for (let i = 0; i < count; i++) {
        const radius = 30 + Math.random() * 15
        let chosen = { x: WORLD_CENTER.x, y: WORLD_CENTER.y - 450, vel: { x: 0, y: 30 } }
        for (let tries = 0; tries < 80; tries++) {
          const candidate = sampleSpawn()
          if (
            isInsideCavern(candidate, radius + 32) &&
            Math.hypot(candidate.x - ship.pos.x, candidate.y - ship.pos.y) >= avoidRadius &&
            Math.hypot(candidate.x - WORLD_CENTER.x, candidate.y - WORLD_CENTER.y) >= MINING_BASE_RADIUS + ROCK_BASE_CLEARANCE
          ) {
            chosen = candidate
            break
          }
        }

        newRocks.push(createRock(chosen.x, chosen.y, radius, chosen.vel))
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
    sounds.stopStoreMusic()
    shipRef.current = { pos: { ...WORLD_CENTER }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15 }
    rocksRef.current = []
    shipRepairTimeRef.current = 0
    bulletsRef.current = []
    baseShotsRef.current = []
    setScore(0)
    shieldsRef.current = SHIP_MAX_SHIELDS
    setShields(SHIP_MAX_SHIELDS)
    setLevel(1)
    resetBlueRocksForLevel(1)
    setGameStateWithRef('playing')
    invulnerableRef.current = INVULNERABILITY_GAME_START
    const now = Date.now()
    waveStartTimeRef.current = now
    setWaveStartTime(now)
    setWaveElapsedTime(0)
    setWaveCompletionTime(0)
    setWaveCreditsEarned(0)
    setWaveTimeBonus(0)
    waveCreditsRef.current = 0
    debrisRef.current = []
    levelingUpRef.current = false
    harpoonRef.current = { state: 'idle' }
    miningBaseAngleRef.current = 0
    miningGunCooldownsRef.current = BASE_GUN_INITIAL_COOLDOWNS
    phaserStateRef.current = { energyMs: PHASER_MAX_FIRE_DURATION * 1000, cooldownMs: 0, hitCooldownMs: 0, particleCarry: 0 }
    phaserBeamRef.current = { active: false, start: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, length: 0, energy01: 1 }
    phaserParticlesRef.current = []
    setAttractorActiveWithRef(false)
    setAttractorTimerWithRef(ATTRACTOR_BEAM_DURATION)
    pendingNextWaveRef.current = null
    spawnRocks(rockCountForLevel(1), ROCK_SPAWN_AVOID_RADIUS, speedMultForLevel(1))
  }, [spawnRocks, rockCountForLevel, speedMultForLevel, resetBlueRocksForLevel, setGameStateWithRef, setAttractorActiveWithRef, setAttractorTimerWithRef])

  const continueToNextWave = useCallback(() => {
    const next = pendingNextWaveRef.current
    if (!next) return

    setLevel(next)
    resetBlueRocksForLevel(next)
    baseShotsRef.current = []
    bulletsRef.current = []
    phaserStateRef.current = { energyMs: PHASER_MAX_FIRE_DURATION * 1000, cooldownMs: 0, hitCooldownMs: 0, particleCarry: 0 }
    phaserBeamRef.current = { active: false, start: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, length: 0, energy01: 1 }
    phaserParticlesRef.current = []
    shipFullyInBaseRef.current = false
    shipRepairTimeRef.current = 0
    setAttractorActiveWithRef(false)
    setAttractorTimerWithRef(ATTRACTOR_BEAM_DURATION)

    // Wave transitions cannot leave the ship beyond a cavern wall.
    resolveCircleInCavern(shipRef.current.pos, shipRef.current.vel, shipRef.current.radius)

    spawnRocks(rockCountForLevel(next), ROCK_SPAWN_AVOID_RADIUS, speedMultForLevel(next))
    invulnerableRef.current = INVULNERABILITY_LEVEL_START
    levelingUpRef.current = false
    waitingForWaveEndFxRef.current = false
    pendingNextWaveRef.current = null
    setGameStateWithRef('playing')
    const now = Date.now()
    waveStartTimeRef.current = now
    setWaveStartTime(now)
    setWaveElapsedTime(0)
    setWaveCompletionTime(0)
    setWaveCreditsEarned(0)
    setWaveTimeBonus(0)
    waveCreditsRef.current = 0
  }, [resetBlueRocksForLevel, spawnRocks, rockCountForLevel, speedMultForLevel, setGameStateWithRef, setAttractorActiveWithRef, setAttractorTimerWithRef])

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useEffect(() => {
    if (gameState !== 'menu') return

    // Menu should be an enticing action shot that is still consistent with game mechanics.
    // We stage a deterministic-ish scene (ship + bullets + harpoon + base processing) and keep
    // rock *positions* static so nothing drifts into ugly overlaps.
    // Avoid rebuilding the scene repeatedly while staying on the menu.
    if (menuSceneInitializedRef.current) return
    menuSceneInitializedRef.current = true

    // Reset visuals.
    shieldsRef.current = 2
    queueMicrotask(() => setShields(2))
    miningBaseAngleRef.current = 0
    debrisRef.current = []

    // Place ship in a dramatic but plausible position.
    const baseX = WORLD_CENTER.x
    const baseY = WORLD_CENTER.y
    shipRef.current = {
      pos: { x: baseX - 330, y: baseY + 145 },
      vel: { x: 0, y: 0 },
      angle: Math.atan2(-145, 330),
      radius: SHIP_RADIUS,
    }

    // One rock being processed inside the base (mechanic-accurate and visually interesting).
    const processingRock = createRock(baseX + MINING_BASE_RADIUS * 0.18, baseY - MINING_BASE_RADIUS * 0.08, 26, {
      x: 0,
      y: 0,
    })
    // Mark it as “in base long enough” so base-gun shots make sense visually.
    ;(processingRock as Rock & { inBaseTime?: number }).inBaseTime = 3

    const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)

    // Additional spaced rocks around the arena for an “in-progress” feel.
    const levelForShot = 5
    const speedMult = speedMultForLevel(levelForShot)
    const count = clamp(rockCountForLevel(levelForShot), 5, 7)

    const sampleSpawn = () => {
      const angle = Math.random() * Math.PI * 2
      const distanceFromShip = 360 + Math.random() * 500
      const x = shipRef.current.pos.x + Math.cos(angle) * distanceFromShip
      const y = shipRef.current.pos.y + Math.sin(angle) * distanceFromShip
      const a = angle + Math.PI + (Math.random() - 0.5) * Math.PI * 0.7
      const speed = (20 + Math.random() * 30) * speedMult
      return { x, y, vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed } as Vector2 }
    }

    const nextRocks: Rock[] = [processingRock]
    for (let i = 0; i < count; i++) {
      const radius = 30 + Math.random() * 15
      let chosen = sampleSpawn()

      for (let tries = 0; tries < 120; tries++) {
        const candidate = sampleSpawn()
        if (!isInsideCavern(candidate, radius + 30)) continue
        const distToShip = distance(candidate.x, candidate.y, shipRef.current.pos.x, shipRef.current.pos.y)
        const distToBase = distance(candidate.x, candidate.y, baseX, baseY)
        if (distToShip < 140) continue
        if (distToBase < MINING_BASE_RADIUS + 190) continue

        let ok = true
        for (const r of nextRocks) {
          const d = distance(candidate.x, candidate.y, r.pos.x, r.pos.y)
          if (d < (radius + r.radius) * 1.2) {
            ok = false
            break
          }
        }
        if (!ok) continue

        chosen = candidate
        break
      }

      nextRocks.push(createRock(chosen.x, chosen.y, radius, chosen.vel))
    }

    rocksRef.current = nextRocks

    // Keep harpoon hidden on the menu.
    harpoonRef.current = { state: 'idle' }

    // Stage looping ship bullets aimed toward the base area.
    const ship = shipRef.current
    const aim = Math.atan2(baseY - ship.pos.y, baseX - ship.pos.x)
    ship.angle = aim
    const bulletSpeed = BULLET_SPEED
    bulletsRef.current = Array.from({ length: 6 }, (_, k) => {
      const t = (k / 6) * Math.PI * 2
      const spread = (Math.random() - 0.5) * 0.25
      const a = aim + spread
      const r = 18 + 6 * Math.sin(t)
      return {
        pos: { x: ship.pos.x + Math.cos(a) * r, y: ship.pos.y + Math.sin(a) * r },
        vel: { x: Math.cos(a) * bulletSpeed, y: Math.sin(a) * bulletSpeed },
        life: 1e9,
        isEnemy: false,
      }
    })

    // Stage looping base shots pointed at the processing rock.
    const gunRadius = MINING_BASE_RADIUS * 0.63
    const baseShotSpeed = BASE_SHOT_SPEED
    const gunAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]
    baseShotsRef.current = gunAngles.map((ga) => {
      const gx = baseX + Math.cos(ga) * gunRadius
      const gy = baseY + Math.sin(ga) * gunRadius
      const dx = processingRock.pos.x - gx
      const dy = processingRock.pos.y - gy
      const dl = Math.max(1e-6, Math.hypot(dx, dy))
      return {
        pos: { x: gx, y: gy },
        vel: { x: (dx / dl) * baseShotSpeed, y: (dy / dl) * baseShotSpeed },
        life: 1e9,
      }
    })
  }, [gameState, SHIP_RADIUS, MINING_BASE_RADIUS, createRock, rockCountForLevel, speedMultForLevel])

  useEffect(() => {
    if (gameState !== 'menu') {
      menuSceneInitializedRef.current = false
    }
  }, [gameState])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      if (e.key === 'Escape') {
        e.preventDefault()
        onExit()
        return
      }

      if (e.key === ' ' && gameState === 'playing') {
        // Primary fire is handled in the update loop for hold-to-fire behavior.
        e.preventDefault()
      }
      if (e.key.toLowerCase() === 'p' && gameState === 'playing') {
        setGameState('paused')
      } else if (e.key.toLowerCase() === 'p' && gameState === 'paused') {
        setGameState('playing')
      }

      if (gameState === 'waveComplete') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          continueToNextWave()
        }
      }

      // Harpoon grapple (F): fire / release.
      if (!e.repeat && e.key.toLowerCase() === 'f' && gameState === 'playing') {
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

      // Attractor beam remains the single auxiliary system.
      if (!e.repeat && e.key.toLowerCase() === 'a' && gameState === 'playing') {
        setAttractorActiveWithRef((active) => {
          if (!active && attractorTimerRef.current > 0) return true
          if (active) return false
          return active
        })
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
  }, [gameState, menuIndex, gameOverIndex, startGame, onExit, continueToNextWave, buildRopeBetween, toroidalDelta, HARPOON_HOOK_MASS, setAttractorActiveWithRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const newWidth = window.innerWidth
      const newHeight = window.innerHeight
      
      canvas.width = newWidth
      canvas.height = newHeight
      canvasSizeRef.current = { width: newWidth, height: newHeight }
    }

    resize()
    window.addEventListener('resize', resize)

    const update = (dt: number) => {
      const gameState = gameStateRef.current
      const waveStartTime = waveStartTimeRef.current
      const attractorActive = attractorActiveRef.current
      const attractorTimer = attractorTimerRef.current

      const phaser = phaserStateRef.current

      // Phaser timers tick even if we aren't actively playing (so cooldowns don't get stuck).
      if (phaser.cooldownMs > 0) {
        phaser.cooldownMs -= dt * 1000
        if (phaser.cooldownMs <= 0) {
          phaser.cooldownMs = 0
          phaser.energyMs = PHASER_MAX_FIRE_DURATION * 1000
        }
      }

      // Update wave timer display
      if (gameState === 'playing' && waveStartTime > 0) {
        setWaveElapsedTime((Date.now() - waveStartTime) / 1000)
      }
      
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
        if (dyingTimerRef.current <= 0) setGameStateWithRef('gameOver')
        return
      }

      // Menu: animate the action shot without moving rocks (prevents overlap drift).
      if (gameState === 'menu') {
        miningBaseAngleRef.current += dt * MINING_ROT_SPEED

        // Tumble rocks in place (no translation).
        for (const rock of rocksRef.current) {
          rock.rot[0] += rock.angVel[0] * dt
          rock.rot[1] += rock.angVel[1] * dt
          rock.rot[2] += rock.angVel[2] * dt
        }

        // Let staged projectiles cross the camera naturally; the menu is rebuilt when revisited.
        if (bulletsRef.current.length > 0) {
          for (const b of bulletsRef.current) {
            b.pos.x += b.vel.x * dt
            b.pos.y += b.vel.y * dt
          }
        }

        if (baseShotsRef.current.length > 0) {
          for (const s of baseShotsRef.current) {
            s.pos.x += s.vel.x * dt
            s.pos.y += s.vel.y * dt
          }
        }

        return
      }

      // Keep the base alive even when not playing.
      miningBaseAngleRef.current += dt * MINING_ROT_SPEED

      if (gameState !== 'playing') return

      const ship = shipRef.current

      const w = WORLD_WIDTH
      const h = WORLD_HEIGHT
      // Physics helpers retain this callback shape, but the finite world never wraps.
      const wrapX = (x: number) => x
      const wrapY = (y: number) => y

      const pendingRedDetonations: Rock[] = []

      const armRedRock = (rock: Rock) => {
        if (rock.kind !== 'red') return
        if (rock.redFuseS == null) rock.redFuseS = RED_ROCK_DETONATION_DELAY
      }

      const releaseHarpoonIfAttached = (rock: Rock) => {
        const hp = harpoonRef.current
        if (hp.state === 'attached' && hp.rock === rock) {
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
      }

      const hitRockLikeShipWeapon = (rock: Rock, pushDir?: Vector2) => {
        if (rock.kind === 'red') {
          armRedRock(rock)
          return
        }
        if (rock.kind === 'blue') {
          // Blue smallest rocks cannot be destroyed by ship weapons; they only get pushed.
          const ux = pushDir ? pushDir.x : 0
          const uy = pushDir ? pushDir.y : 0
          const dl = Math.hypot(ux, uy)
          if (dl > 1e-6) {
            const px = ux / dl
            const py = uy / dl
            const push = 170
            rock.vel.x += px * push
            rock.vel.y += py * push
          }
          return
        }

        releaseHarpoonIfAttached(rock)

        const idx = rocksRef.current.indexOf(rock)
        if (idx === -1) return
        rocksRef.current.splice(idx, 1)
        const credits = Math.floor(CREDITS_SHOOTING_ROCK_DIVISOR / rock.radius)
        setScore((s) => s + credits)
        waveCreditsRef.current += credits

        const explosionSize = rock.radius > 35 ? 'large' : rock.radius > 20 ? 'medium' : 'small'
        sounds.explosion(explosionSize)

        if (rock.radius > SMALLEST_ROCK_RADIUS) {
          const newRadius = rock.radius / 2
          for (let j = 0; j < 2; j++) {
            let kind: RockKind = 'normal'
            if (newRadius <= SMALLEST_ROCK_RADIUS) {
              if (levelRef.current >= 3) {
                if (blueRocksSpawnedThisLevelRef.current < blueRockQuotaRef.current) {
                  kind = 'blue'
                  blueRocksSpawnedThisLevelRef.current += 1
                } else {
                  const p = clamp(
                    BLUE_ROCK_SPAWN_CHANCE_BASE + (levelRef.current - 1) * BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL,
                    BLUE_ROCK_SPAWN_CHANCE_BASE,
                    BLUE_ROCK_SPAWN_CHANCE_MAX,
                  )
                  if (Math.random() < p) {
                    kind = 'blue'
                    blueRocksSpawnedThisLevelRef.current += 1
                  }
                }
              }

              if (kind === 'normal' && Math.random() < RED_ROCK_SPAWN_CHANCE) {
                kind = 'red'
              }
            }
            rocksRef.current.push(createRock(rock.pos.x, rock.pos.y, newRadius, undefined, kind))
          }
        } else {
          createDebris(rock.pos.x, rock.pos.y, rock.vel.x, rock.vel.y, 5, 0.5, '255, 255, 255')
        }
      }

      const resolveRedDetonations = () => {
        if (pendingRedDetonations.length === 0) return
        const processed = new Set<Rock>()

        while (pendingRedDetonations.length > 0) {
          const source = pendingRedDetonations.pop()
          if (!source) break
          if (processed.has(source)) continue
          processed.add(source)
          if (source.kind !== 'red') continue

          releaseHarpoonIfAttached(source)

          const idx = rocksRef.current.indexOf(source)
          if (idx === -1) continue
          rocksRef.current.splice(idx, 1)

          sounds.explosion('large')
          createDebris(source.pos.x, source.pos.y, source.vel.x, source.vel.y, 26, 1.4, '255, 80, 80')

          // AOE: ship
          {
            const d = toroidalDelta(source.pos.x, source.pos.y, ship.pos.x, ship.pos.y, w, h)
            const dist = Math.hypot(d.dx, d.dy)
            if (dist < RED_ROCK_BLAST_RADIUS) {
              const t = clamp(1 - dist / RED_ROCK_BLAST_RADIUS, 0, 1)
              const impactSpeed = 60 + t * 340
              applyImpactShield(impactSpeed)
              if (dist > 1e-6) {
                const nx = d.dx / dist
                const ny = d.dy / dist
                const kick = RED_ROCK_BLAST_IMPULSE * (0.25 + 0.55 * t)
                ship.vel.x += nx * kick
                ship.vel.y += ny * kick
              }
            }
          }

          // AOE: rocks (damage = as if hit by ship weapon) + chain reaction.
          const affected = [...rocksRef.current]
          for (const other of affected) {
            if (rocksRef.current.indexOf(other) === -1) continue
            const d = toroidalDelta(source.pos.x, source.pos.y, other.pos.x, other.pos.y, w, h)
            const dist = Math.hypot(d.dx, d.dy)
            if (dist >= RED_ROCK_BLAST_RADIUS || dist < 1e-6) continue

            const t = clamp(1 - dist / RED_ROCK_BLAST_RADIUS, 0, 1)
            const nx = d.dx / dist
            const ny = d.dy / dist
            const kick = (RED_ROCK_BLAST_IMPULSE * t) / Math.max(0.8, other.radius / 16)
            other.vel.x += nx * kick
            other.vel.y += ny * kick

            if (other.kind === 'red') {
              // Chain reaction arms other red rocks; they detonate after their own fuse.
              armRedRock(other)
              continue
            }

            hitRockLikeShipWeapon(other, { x: d.dx, y: d.dy })
          }
        }
      }

      const applyImpactShield = (impactSpeed: number) => {
        if (invulnerableRef.current > 0) return
        // Calibrated for gameplay feel (ship max speed ~300):
        // very slow -> 0, slow -> 1, medium -> 2, fast -> 3.
        // User-calibrated collision thresholds (relative speed):
        // < 30 -> 0, 30-100 -> 1, 100-250 -> 2, 250+ -> 3
        const slow = COLLISION_DAMAGE_SLOW
        const medium = COLLISION_DAMAGE_MEDIUM
        const fast = COLLISION_DAMAGE_FAST
        const amt = impactSpeed >= fast ? 3 : impactSpeed >= medium ? 2 : impactSpeed >= slow ? 1 : 0
        if (amt <= 0) return
        invulnerableRef.current = INVULNERABILITY_AFTER_HIT

        // Guard against React StrictMode double-invoking state updaters in dev.
        let shieldSoundPlayed = false
        setShields((s) => {
          // Shields are a visual indicator only; collision math stays unchanged.
          // Starts at 2 and ticks down (by the same impact amounts as the old damage system).
          // Once shields are gone, the next hit destroys the ship.
          if (s <= 0) {
            shieldsRef.current = 0
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 18, 1.2, '255, 255, 255')
            createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 10, 1.0, '255, 170, 0')
            sounds.explosion('large')
            sounds.stopThrust()
            keysRef.current.clear()
            dyingTimerRef.current = DYING_ANIMATION_DURATION
            setGameState('dying')
            return 0
          }

          const next = Math.max(0, s - amt)
          shieldsRef.current = next
          if (next < s) {
            lastShieldHitAtRef.current = Date.now()
            if (!shieldSoundPlayed) {
              shieldSoundPlayed = true
              sounds.shieldHit(next)
            }
          }
          return next
        })
      }

      // Ship controls
      if (keysRef.current.has('arrowleft')) {
        ship.angle -= SHIP_ROTATION_SPEED * dt
      }
      if (keysRef.current.has('arrowright')) {
        ship.angle += SHIP_ROTATION_SPEED * dt
      }
      const isThrusting = keysRef.current.has('arrowup')
      if (isThrusting) {
        ship.vel.x += Math.cos(ship.angle) * SHIP_THRUST_ACCELERATION * dt
        ship.vel.y += Math.sin(ship.angle) * SHIP_THRUST_ACCELERATION * dt
        sounds.startThrust()
      } else {
        sounds.stopThrust()
      }

      // Apply friction and speed limit
      const maxSpeed = SHIP_MAX_SPEED
      const speed = Math.hypot(ship.vel.x, ship.vel.y)
      if (speed > maxSpeed) {
        ship.vel.x = (ship.vel.x / speed) * maxSpeed
        ship.vel.y = (ship.vel.y / speed) * maxSpeed
      }

      // Damp velocity in the ship's local frame: reduce sideways drift more than forward motion.
      const fx = Math.cos(ship.angle)
      const fy = Math.sin(ship.angle)
      const rx = -fy
      const ry = fx

      const vForward = ship.vel.x * fx + ship.vel.y * fy
      const vRight = ship.vel.x * rx + ship.vel.y * ry

      const nextForward = vForward * SHIP_FRICTION
      const nextRight = vRight * SHIP_LATERAL_FRICTION

      ship.vel.x = nextForward * fx + nextRight * rx
      ship.vel.y = nextForward * fy + nextRight * ry

      // Update ship in persistent world coordinates.
      ship.pos.x += ship.vel.x * dt
      ship.pos.y += ship.vel.y * dt
      const shipWallHit = resolveCircleInCavern(ship.pos, ship.vel, ship.radius, 0.42)
      if (shipWallHit.maxImpactSpeed > 0) applyImpactShield(shipWallHit.maxImpactSpeed)

      // Update invulnerability
      if (invulnerableRef.current > 0) {
        invulnerableRef.current -= dt * 1000
      }

      // Update rocks and bounce them off the cavern boundary.
      rocksRef.current.forEach((rock) => {
        rock.pos.x += rock.vel.x * dt
        rock.pos.y += rock.vel.y * dt

        // 3D tumbling
        rock.rot[0] += rock.angVel[0] * dt
        rock.rot[1] += rock.angVel[1] * dt
        rock.rot[2] += rock.angVel[2] * dt

        const wallHit = resolveCircleInCavern(rock.pos, rock.vel, rock.radius, 0.82)
        if (wallHit.collided && rock.kind === 'red') armRedRock(rock)
      })

      // Force field collision: prevent rocks from exiting base through doors when attractor is active
      if (attractorActive && attractorTimer > 0) {
        const baseX = w / 2
        const baseY = h / 2
        const baseAng = miningBaseAngleRef.current
        const doorVertices = [1, 3, 5]
        
        for (const rock of rocksRef.current) {
          // Check if rock is near base using toroidal distance
          const d = toroidalDelta(baseX, baseY, rock.pos.x, rock.pos.y, w, h)
          const distToBase = Math.hypot(d.dx, d.dy)
          
          // Only check rocks that are inside the base
          if (distToBase > MINING_BASE_RADIUS - rock.radius) continue
          
          // Check each door - if rock is trying to exit through a door, bounce it back
          for (const vertIdx of doorVertices) {
            const doorAngle = baseAng + (vertIdx / 6) * Math.PI * 2
            
            // Check if rock is near this door
            const angleToRock = Math.atan2(d.dy, d.dx)
            let angleDiff = angleToRock - doorAngle
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
            
            // If rock is heading towards this door (within 30 degrees)
            if (Math.abs(angleDiff) < Math.PI / 6) {
              // Check if it's trying to leave
              if (distToBase > MINING_BASE_RADIUS - rock.radius - 5) {
                // Bounce the rock back towards center
                const velDot = rock.vel.x * d.dx / distToBase + rock.vel.y * d.dy / distToBase
                
                if (velDot > 0) { // Moving outward
                  rock.vel.x -= 1.8 * velDot * d.dx / distToBase
                  rock.vel.y -= 1.8 * velDot * d.dy / distToBase
                }
              }
            }
          }
        }
      }

      // Rock-rock collisions in ordinary world space.
      // This uses a simple impulse + positional correction so rocks "bump" off each other.
      const rocks = rocksRef.current
      const restitution = 0.9

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
          collideWithWalls(a.pos, a.vel, a.radius, 0.85, () => {
            if (a.kind === 'red') armRedRock(a)
          })
        }

        updateBaseDefenseAndProcessing({
          dt,
          w,
          h,
          baseX,
          baseY,
          MINING_BASE_RADIUS,
          miningBaseAngleRef,
          miningGunCooldownsRef,
          baseShotsRef,
          rocksRef,
          wrapX,
          wrapY,
          toroidalDelta,
          setScore,
          waveCreditsRef,
          createDebris,
          onRedRockDetonate: (rock) => armRedRock(rock),
        })
        collideWithWalls(ship.pos, ship.vel, ship.radius, 0.55, (impact) => applyImpactShield(impact))
        {
          const d = toroidalDelta(baseX, baseY, ship.pos.x, ship.pos.y, w, h)
          const fullyInside = circleFullyInHex(d.dx, d.dy, ship.radius)
          shipFullyInBaseRef.current = fullyInside
          if (!fullyInside) {
            shipRepairTimeRef.current = 0
          } else {
            shipRepairTimeRef.current += dt
            if (shipRepairTimeRef.current >= SHIELD_REPAIR_TIME) {
              shipRepairTimeRef.current = SHIELD_REPAIR_TIME

              // Guard against React StrictMode double-invoking state updaters in dev.
              let shieldChargePlayed = false
              setShields((s) => {
                if (s >= SHIP_MAX_SHIELDS) return s
                lastShieldRechargeAtRef.current = Date.now()
                if (!shieldChargePlayed) {
                  shieldChargePlayed = true
                  sounds.shieldCharge()
                }
                shieldsRef.current = SHIP_MAX_SHIELDS
                return SHIP_MAX_SHIELDS
              })
              if (invulnerableRef.current < INVULNERABILITY_MIN_AFTER_REPAIR) invulnerableRef.current = INVULNERABILITY_MIN_AFTER_REPAIR
            }
          }

        }
      }

      updateHarpoon({
        dt,
        w,
        h,
        ship,
        shipRef,
        rocks,
        harpoonRef,
        wrapX,
        wrapY,
        toroidalDelta,
        buildRopeBetween,
        HARPOON_HOOK_MASS,
        HARPOON_VISUAL_SLACK,
        HARPOON_REEL_MIN_LEN,
      })

      const updatedHarpoon = harpoonRef.current
      if (updatedHarpoon.state === 'flying' || updatedHarpoon.state === 'deployed') {
        const hookWallHit = resolveCircleInCavern(updatedHarpoon.pos, updatedHarpoon.vel, HARPOON_HOOK_RADIUS, 0.15)
        if (hookWallHit.collided && updatedHarpoon.state === 'flying') {
          harpoonRef.current = { ...updatedHarpoon, state: 'deployed' }
        }
      }

      for (let i = 0; i < rocks.length; i++) {
        const a = rocks[i]
        for (let j = i + 1; j < rocks.length; j++) {
          const b = rocks[j]

          const dx = a.pos.x - b.pos.x
          const dy = a.pos.y - b.pos.y

          const rSum = a.radius + b.radius
          const dist2 = dx * dx + dy * dy
          if (dist2 >= rSum * rSum) continue

          if (a.kind === 'red') armRedRock(a)
          if (b.kind === 'red') armRedRock(b)
          if (a.kind === 'red' || b.kind === 'red') continue

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

      updateAttractorBeam({
        dt,
        w,
        h,
        attractorActive,
        attractorTimer,
        setAttractorTimer: setAttractorTimerWithRef,
        setAttractorActive: setAttractorActiveWithRef,
        miningBaseAngle: miningBaseAngleRef.current,
        rocksRef,
        toroidalDelta,
        MINING_BASE_RADIUS,
        ATTRACTOR_BEAM_RANGE_MULTIPLIER,
        ATTRACTOR_BEAM_STRENGTH,
      })

      // Attractor beam sound
      if (attractorActive && attractorTimer > 0) sounds.startAttractor()
      else sounds.stopAttractor()

      // Phaser (SPACE): hold-to-fire beam with energy + cooldown.
      {
        const wantFire = keysRef.current.has(' ')

        // Recharge while not firing (unless in cooldown).
        if (phaser.cooldownMs <= 0 && !wantFire && phaser.energyMs < PHASER_MAX_FIRE_DURATION * 1000) {
          phaser.energyMs = Math.min(PHASER_MAX_FIRE_DURATION * 1000, phaser.energyMs + dt * 1000)
        }

        const canFire = wantFire && phaser.cooldownMs <= 0 && phaser.energyMs > 0
        const justStarted = canFire && !phaserBeamRef.current.active

        if (justStarted) {
          sounds.startPhaser()
          phaser.hitCooldownMs = 0
        }

        if (canFire) {
          if (!phaserBeamRef.current.active) sounds.startPhaser()
          phaser.energyMs = Math.max(0, phaser.energyMs - dt * 1000)
          phaser.hitCooldownMs = Math.max(0, phaser.hitCooldownMs - dt * 1000)

          const ux = Math.cos(ship.angle)
          const uy = Math.sin(ship.angle)
          const len = raycastCavern(ship.pos, { x: ux, y: uy }, PHASER_RANGE)

          phaserBeamRef.current = {
            active: true,
            start: { x: ship.pos.x, y: ship.pos.y },
            direction: { x: ux, y: uy },
            length: len,
            energy01: clamp(phaser.energyMs / (PHASER_MAX_FIRE_DURATION * 1000), 0, 1),
          }

          if (phaser.hitCooldownMs <= 0) {
            // Find the nearest rock before the beam meets the cavern wall.
            let bestRock: Rock | null = null
            let bestT = Infinity

            for (const rock of rocksRef.current) {
              const hitR = rock.radius + PHASER_BEAM_RADIUS
              const hitDistance = rayCircleHitDistance(
                ship.pos,
                { x: ux, y: uy },
                len,
                rock.pos,
                hitR,
              )
              if (hitDistance == null) continue

              if (hitDistance < bestT) {
                bestT = hitDistance
                bestRock = rock
              }
            }

            if (bestRock) {
              hitRockLikeShipWeapon(bestRock, { x: ux, y: uy })
              phaser.hitCooldownMs = PHASER_HIT_INTERVAL * 1000
            } else {
              // Still throttle targeting work a bit even if we didn't hit.
              phaser.hitCooldownMs = Math.min(phaser.hitCooldownMs + 1, PHASER_HIT_INTERVAL * 1000)
            }
          }

          // Particle effects around the beam (biased toward the far end).
          {
            const ratePerSec = 120
            phaser.particleCarry += dt * ratePerSec
            const spawnCount = Math.min(6, Math.floor(phaser.particleCarry))
            phaser.particleCarry -= spawnCount
            if (spawnCount > 0) {
              for (let i = 0; i < spawnCount; i++) {
                const t = 0.6 + Math.random() * 0.4
                const baseX = ship.pos.x + ux * (len * t)
                const baseY = ship.pos.y + uy * (len * t)
                const px = -uy
                const py = ux
                const off = (Math.random() * 2 - 1) * (6 + 10 * (1 - t))
                const x = baseX + px * off
                const y = baseY + py * off

                const jitterAng = Math.random() * Math.PI * 2
                const jitterSpd = 40 + Math.random() * 120
                const vx = (px * off * 0.6 + Math.cos(jitterAng) * jitterSpd) * 0.6
                const vy = (py * off * 0.6 + Math.sin(jitterAng) * jitterSpd) * 0.6

                phaserParticlesRef.current.push({
                  pos: { x, y },
                  vel: { x: vx, y: vy },
                  life: 240 + Math.random() * 120,
                })
              }
              const cap = 180
              if (phaserParticlesRef.current.length > cap) {
                phaserParticlesRef.current.splice(0, phaserParticlesRef.current.length - cap)
              }
            }
          }

          if (phaser.energyMs <= 0) {
            phaserBeamRef.current = {
              ...phaserBeamRef.current,
              active: false,
            }
            sounds.stopPhaser()
            phaser.cooldownMs = PHASER_COOLDOWN * 1000
          }
        } else {
          // Not firing.
          sounds.stopPhaser()
          phaserBeamRef.current = {
            ...phaserBeamRef.current,
            active: false,
            energy01: clamp(phaser.energyMs / (PHASER_MAX_FIRE_DURATION * 1000), 0, 1),
          }
        }
      }

      // Update phaser particles
      if (phaserParticlesRef.current.length > 0) {
        phaserParticlesRef.current = phaserParticlesRef.current.filter((p) => {
          p.pos.x += p.vel.x * dt
          p.pos.y += p.vel.y * dt
          p.vel.x *= 0.95
          p.vel.y *= 0.95
          p.life -= dt * 1000
          return p.life > 0 && isInsideCavern(p.pos)
        })
      }

      // Drive the repair hum from simulation state (not rendering).
      const isHealing =
        shipFullyInBaseRef.current &&
        shieldsRef.current < SHIP_MAX_SHIELDS &&
        shipRepairTimeRef.current > 0 &&
        shipRepairTimeRef.current < 2
      if (isHealing) sounds.startRepairHum()
      else sounds.stopRepairHum()

      updateBulletsAndPlayerRockCollisions({
        dt,
        w,
        h,
        bulletsRef,
        rocksRef,
        harpoonRef,
        shipRef,
        toroidalDelta,
        buildRopeBetween,
        setScore,
        waveCreditsRef,
        sounds,
        onRedRockDetonate: (rock) => armRedRock(rock),
        createRock,
        createDebris,
        levelRef,
        blueRocksSpawnedThisLevelRef,
        blueRockQuotaRef,
        CREDITS_SHOOTING_ROCK_DIVISOR,
        SMALLEST_ROCK_RADIUS,
        HARPOON_VISUAL_SLACK,
        BLUE_ROCK_SPAWN_CHANCE_BASE,
        BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL,
        BLUE_ROCK_SPAWN_CHANCE_MAX,
        RED_ROCK_SPAWN_CHANCE,
      })

      // Tick any armed red rocks and detonate those whose fuse has expired.
      for (const rock of rocksRef.current) {
        if (rock.kind !== 'red') continue
        if (rock.redFuseS == null) continue
        rock.redFuseS -= dt
        if (rock.redFuseS <= 0) {
          pendingRedDetonations.push(rock)
          // Prevent re-queuing if, for any reason, detonation is deferred.
          rock.redFuseS = undefined
        }
      }

      // Resolve any queued red detonations from base/bullets/phaser/rock collisions before ship collision math.
      resolveRedDetonations()

      // Collision detection: ship vs rocks (bounce + shield loss based on impact speed)
      {
        const shipMass = 1
        for (let i = 0; i < rocksRef.current.length; i++) {
          const rock = rocksRef.current[i]
          const d = toroidalDelta(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, w, h)
          const dist = Math.hypot(d.dx, d.dy)
          const minDist = ship.radius + rock.radius
          if (dist >= minDist || dist < 1e-6) continue

          if (rock.kind === 'red') {
            armRedRock(rock)
            continue
          }

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
            applyImpactShield(Math.hypot(ship.vel.x - rock.vel.x, ship.vel.y - rock.vel.y))
            const e = 0.55
            const j = (-(1 + e) * relAlong) / invSum
            ship.vel.x -= j * nx * invShip
            ship.vel.y -= j * ny * invShip
            rock.vel.x += j * nx * invRock
            rock.vel.y += j * ny * invRock
          }
        }
      }

      // Ship collisions can queue detonations; resolve them now.
      resolveRedDetonations()

      // Check if all rocks destroyed
      if (rocksRef.current.length === 0 && gameState === 'playing' && !levelingUpRef.current) {
        levelingUpRef.current = true
        const nextLevel = levelRef.current + 1

        // Prepare the wave-complete summary before spawning the next wave,
        // but wait until the final explosion/debris animation finishes.
        pendingNextWaveRef.current = nextLevel
        waitingForWaveEndFxRef.current = true
      }

      // If the wave is clear, wait for the wave-ending animation before showing the summary.
      if (
        gameState === 'playing' &&
        levelingUpRef.current &&
        waitingForWaveEndFxRef.current &&
        rocksRef.current.length === 0 &&
        debrisRef.current.length === 0
      ) {
        baseShotsRef.current = []
        
        // Calculate time bonus ONCE at wave completion
        // The multiplier is applied to ALL credits earned during the wave
        // Credits are tracked in waveCreditsRef.current throughout gameplay
        const completionTime = (Date.now() - waveStartTime) / 1000
        const multiplier = calculateTimeMultiplier(completionTime)
        const creditsEarned = waveCreditsRef.current
        const bonus = Math.floor(creditsEarned * (multiplier - 1))
        
        setWaveCompletionTime(completionTime)
        setWaveCreditsEarned(creditsEarned)
        setWaveTimeBonus(bonus)
        setScore((s) => s + bonus) // Apply bonus only here, not during gameplay
        
        setAttractorActiveWithRef(false)
        setAttractorTimerWithRef(ATTRACTOR_BEAM_DURATION)
        setGameStateWithRef('waveComplete')
        waitingForWaveEndFxRef.current = false
      }
    }

    const draw = () => {
      const gameState = gameStateRef.current
      const attractorActive = attractorActiveRef.current
      const attractorTimer = attractorTimerRef.current

      drawHardVacuumFrame({
        ctx,
        gameState,
        canvasSizeRef,
        MINING_BASE_RADIUS,
        MINING_DOOR_TRIM,
        miningBaseAngleRef,
        attractorActive,
        attractorTimer,
        RED_ROCK_DETONATION_DELAY,
        baseShotsRef,
        rocksRef,
        bulletsRef,
        phaserBeamRef,
        phaserParticlesRef,
        debrisRef,
        harpoonRef,
        shipRef,
        keysRef,
        shields: shieldsRef.current,
        shieldsRef,
        shipRepairTimeRef,
        lastShieldHitAtRef,
        lastShieldRechargeAtRef,
        toroidalDelta,
      })
    }

    let rafId: number | null = null
    let disposed = false
    const animate = (timestamp: number) => {
      if (disposed) return
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = timestamp

      update(dt)
      draw()

      if (!disposed) rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)

    return () => {
      disposed = true
      window.removeEventListener('resize', resize)
      if (rafId != null) cancelAnimationFrame(rafId)
      sounds.stopRepairHum(true)
    }
  }, [createRock, createDebris, spawnRocks, buildRopeBetween, toroidalDelta, HARPOON_HOOK_MASS, HARPOON_REEL_MIN_LEN, calculateTimeMultiplier, setGameStateWithRef, setAttractorActiveWithRef, setAttractorTimerWithRef])

  const exitToGameSelect = () => {
    sounds.stopThrust()
    sounds.stopStoreMusic()
    onExit()
  }

  const setVirtualKey = (key: string, pressed: boolean) => {
    if (pressed) keysRef.current.add(key)
    else keysRef.current.delete(key)
  }

  const tapVirtualKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key }))
  }

  const holdButtonClass =
    'touch-none select-none min-w-16 h-16 rounded-full border-2 border-white/45 bg-black/65 text-white text-xl font-bold active:border-[#00ff88] active:bg-[#00ff88]/30'

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {HardVacuumTopCenterHud({
        gameState,
        level,
        waveStartTime,
        waveElapsedTime,
        calculateTimeMultiplier,
      })}

      {HardVacuumLeftHud({ gameState, score })}

      {HardVacuumRightHud({
        gameState,
        attractorTimer,
      })}

      {gameState === 'playing' && (
        <div className="absolute inset-x-0 bottom-4 z-30 flex items-end justify-between px-4 lg:hidden pointer-events-none">
          <div className="flex items-end gap-2 pointer-events-auto">
            <button
              type="button"
              aria-label="Rotate left"
              className={holdButtonClass}
              onPointerDown={(event) => {
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                setVirtualKey('arrowleft', true)
              }}
              onPointerUp={() => setVirtualKey('arrowleft', false)}
              onPointerCancel={() => setVirtualKey('arrowleft', false)}
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Thrust"
              className={`${holdButtonClass} mb-12`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                setVirtualKey('arrowup', true)
              }}
              onPointerUp={() => setVirtualKey('arrowup', false)}
              onPointerCancel={() => setVirtualKey('arrowup', false)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Rotate right"
              className={holdButtonClass}
              onPointerDown={(event) => {
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                setVirtualKey('arrowright', true)
              }}
              onPointerUp={() => setVirtualKey('arrowright', false)}
              onPointerCancel={() => setVirtualKey('arrowright', false)}
            >
              ↷
            </button>
          </div>

          <div className="flex items-end gap-3 pointer-events-auto">
            <button
              type="button"
              aria-label="Fire harpoon"
              className={`${holdButtonClass} text-xs text-[#00ff88]`}
              onPointerDown={(event) => {
                event.preventDefault()
                tapVirtualKey('f')
              }}
            >
              HOOK
            </button>
            <button
              type="button"
              aria-label="Fire laser"
              className={`${holdButtonClass} mb-12 text-xs text-[#44aaff]`}
              onPointerDown={(event) => {
                event.preventDefault()
                event.currentTarget.setPointerCapture(event.pointerId)
                setVirtualKey(' ', true)
              }}
              onPointerUp={() => setVirtualKey(' ', false)}
              onPointerCancel={() => setVirtualKey(' ', false)}
            >
              LASER
            </button>
          </div>
        </div>
      )}

      {HardVacuumWaveCompleteOverlay({
        gameState,
        level,
        waveCompletionTime,
        waveCreditsEarned,
        waveTimeBonus,
        calculateTimeMultiplier,
        continueToNextWave,
      })}

      {HardVacuumMenuOverlay({
        gameState,
        menuIndex,
        startGame,
        exitToGameSelect,
      })}

      {HardVacuumPausedOverlay({
        gameState,
        resume: () => setGameState('playing'),
        exitToGameSelect,
      })}

      {HardVacuumGameOverOverlay({
        gameState,
        score,
        level,
        gameOverIndex,
        startGame,
        mainMenu: () => setGameState('menu'),
        exitToGameSelect,
      })}
    </div>
  )
}
