import { useEffect, useRef, useState, useCallback } from 'react'
import type { BaseShot, Bullet, Debris, HardVacuumGameProps, Harpoon, Rock, RockKind, Ship, Vector2, V3 } from './types'
import { clamp, makeRockMesh } from './math'
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
  ROCK_BASE_CLEARANCE,
  ROCK_BASE_SPEED_MAX,
  ROCK_BASE_SPEED_MIN,
  ROCK_SPAWN_AVOID_RADIUS,
  SHIELD_REPAIR_TIME,
  SHIP_FRICTION,
  SHIP_LATERAL_FRICTION,
  SHIP_MAX_SHIELDS,
  SHIP_MAX_SPEED,
  SHIP_ROTATION_SPEED,
  SHIP_THRUST_ACCELERATION,
  STORE_PRICE_ATTRACTOR_RECHARGE,
  STORE_PRICE_GRAVITY_PULSE,
  STORE_PRICE_STASIS_FIELD,
  TIME_BONUS_MAX_MULTIPLIER,
  TIME_BONUS_TARGET_SECONDS,
} from './tuning'
import {
  HardVacuumGameOverOverlay,
  HardVacuumLeftHud,
  HardVacuumMenuOverlay,
  HardVacuumPausedOverlay,
  HardVacuumRightHud,
  HardVacuumStoreOverlay,
  HardVacuumTopCenterHud,
} from './ui'
import { drawHardVacuumFrame } from './render'
import { updateBaseDefenseAndProcessing } from './baseDefense'
import { updateHarpoon } from './harpoon'
import { updateAttractorBeam } from './attractor'
import { updateBulletsAndPlayerRockCollisions } from './bullets'

export function HardVacuumGame({ onExit }: HardVacuumGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'store' | 'dying' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [shields, setShields] = useState(SHIP_MAX_SHIELDS)
  const shieldsRef = useRef(shields)
  const gameStateRef = useRef(gameState)
  const [level, setLevel] = useState(1)
  const [gravityCharges, setGravityCharges] = useState(0)
  const [stasisCharges, setStasisCharges] = useState(0)
  const [attractorActive, setAttractorActive] = useState(false)
  const [attractorTimer, setAttractorTimer] = useState(ATTRACTOR_BEAM_DURATION)
  const attractorActiveRef = useRef(attractorActive)
  const attractorTimerRef = useRef(attractorTimer)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)
  const [storeIndex, setStoreIndex] = useState(0)
  
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

  const setGameStateWithRef = useCallback((next: 'menu' | 'playing' | 'paused' | 'store' | 'dying' | 'gameOver') => {
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

    if (gameState === 'store') sounds.startStoreMusic()
    else sounds.stopStoreMusic()

    return () => {
      // Ensure no loop persists across unmount / StrictMode re-mounts.
      sounds.stopThrust()
      sounds.stopStoreMusic()
      sounds.stopRepairHum()
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

  // Updated each frame while playing.
  const shipFullyInBaseRef = useRef(false)

  const pendingNextWaveRef = useRef<number | null>(null)

  // Powerups: charges carry over; players buy more in the store.
  const gravityPulseChargesRef = useRef(0)
  const stasisChargesRef = useRef(0)
  const queuedGravityPulseRef = useRef(false)
  const queuedStasisRef = useRef(false)

  const powerPulsesRef = useRef<Array<{ kind: 'gravity' | 'stasis'; at: number }>>([])

  const GRAVITY_PULSE_COST = STORE_PRICE_GRAVITY_PULSE
  const STASIS_FIELD_COST = STORE_PRICE_STASIS_FIELD
  const ATTRACTOR_RECHARGE_COST = STORE_PRICE_ATTRACTOR_RECHARGE

  // Cached background starfield (offscreen) so it costs ~one drawImage per frame.
  const starFieldCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const starFieldSizeRef = useRef({ width: 0, height: 0 })

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
    // Vector from A -> B under wrapping (shortest).
    let dx = bx - ax
    let dy = by - ay
    if (dx > w / 2) dx -= w
    else if (dx < -w / 2) dx += w
    if (dy > h / 2) dy -= h
    else if (dy < -h / 2) dy += h
    return { dx, dy }
  }, [])

  const buildRopeBetween = useCallback(
    (ax: number, ay: number, bx: number, by: number, ropeLen: number) => {
      const { width: w, height: h } = canvasSizeRef.current
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

      const segments = clamp(Math.ceil(ropeLen / 14), 10, 44)
      const segLen = ropeLen / segments
      const d = toroidalDelta(ax, ay, bx, by, w, h)
      const rope: Vector2[] = []
      const ropePrev: Vector2[] = []
      for (let k = 1; k < segments; k++) {
        const t = k / segments
        const px = wrapX(ax + d.dx * t)
        const py = wrapY(ay + d.dy * t)
        rope.push({ x: px, y: py })
        ropePrev.push({ x: px, y: py })
      }
      return { rope, ropePrev, segLen }
    },
    [toroidalDelta],
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
      const { width, height } = canvasSizeRef.current
      const ship = shipRef.current
      const edgeInset = 1.5

      const baseX = width / 2
      const baseY = height / 2

      const toroidalDistToShip = (x: number, y: number) => {
        const dxRaw = Math.abs(x - ship.pos.x)
        const dyRaw = Math.abs(y - ship.pos.y)
        const dx = Math.min(dxRaw, width - dxRaw)
        const dy = Math.min(dyRaw, height - dyRaw)
        return Math.hypot(dx, dy)
      }

      const toroidalDistToBase = (x: number, y: number) => {
        const dxRaw = Math.abs(x - baseX)
        const dyRaw = Math.abs(y - baseY)
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
        const speed = (ROCK_BASE_SPEED_MIN + Math.random() * (ROCK_BASE_SPEED_MAX - ROCK_BASE_SPEED_MIN)) * speedMult
        const vel: Vector2 = { x: Math.cos(a) * speed, y: Math.sin(a) * speed }
        return { x, y, vel }
      }

      for (let i = 0; i < count; i++) {
        let chosen = sampleEdgeSpawn()
        for (let tries = 0; tries < 40; tries++) {
          const candidate = sampleEdgeSpawn()
          if (
            toroidalDistToShip(candidate.x, candidate.y) >= avoidRadius &&
            toroidalDistToBase(candidate.x, candidate.y) >= MINING_BASE_RADIUS + ROCK_BASE_CLEARANCE
          ) {
            chosen = candidate
            break
          }
          // Keep the best candidate so far if we can't satisfy avoidRadius (e.g., ship hugging an edge).
          if (toroidalDistToShip(candidate.x, candidate.y) > toroidalDistToShip(chosen.x, chosen.y)) {
            chosen = candidate
          }
        }

        newRocks.push(createRock(chosen.x, chosen.y, 30 + Math.random() * 15, chosen.vel))
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
    const { width, height } = canvasSizeRef.current
    shipRef.current = { pos: { x: width / 2, y: height / 2 }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15 }
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
    gravityPulseChargesRef.current = 1
    stasisChargesRef.current = 1
    setGravityCharges(1)
    setStasisCharges(1)
    setAttractorActiveWithRef(false)
    setAttractorTimerWithRef(ATTRACTOR_BEAM_DURATION)
    queuedGravityPulseRef.current = false
    queuedStasisRef.current = false
    pendingNextWaveRef.current = null
    spawnRocks(rockCountForLevel(1), ROCK_SPAWN_AVOID_RADIUS, speedMultForLevel(1))
  }, [spawnRocks, rockCountForLevel, speedMultForLevel, resetBlueRocksForLevel, setGameStateWithRef, setAttractorActiveWithRef, setAttractorTimerWithRef])

  const continueToNextWave = useCallback(() => {
    const next = pendingNextWaveRef.current
    if (!next) return

    const { width: w, height: h } = canvasSizeRef.current
    setLevel(next)
    resetBlueRocksForLevel(next)
    baseShotsRef.current = []
    bulletsRef.current = []
    queuedGravityPulseRef.current = false
    queuedStasisRef.current = false
    shipFullyInBaseRef.current = false
    shipRepairTimeRef.current = 0
    setAttractorActiveWithRef(false)

    // Ensure ship stays inside bounds on resume.
    shipRef.current.pos.x = clamp(shipRef.current.pos.x, 0, w)
    shipRef.current.pos.y = clamp(shipRef.current.pos.y, 0, h)

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
  }, [resetBlueRocksForLevel, spawnRocks, rockCountForLevel, speedMultForLevel, setGameStateWithRef, setAttractorActiveWithRef])

  const isStoreOptionEnabled = useCallback(
    (index: number) => {
      if (index === 0) return score >= GRAVITY_PULSE_COST
      if (index === 1) return score >= STASIS_FIELD_COST
      if (index === 2) return score >= ATTRACTOR_RECHARGE_COST && attractorTimer < 30
      return true // Continue
    },
    [score, GRAVITY_PULSE_COST, STASIS_FIELD_COST, ATTRACTOR_RECHARGE_COST, attractorTimer],
  )

  const firstEnabledStoreIndex = useCallback(() => {
    if (isStoreOptionEnabled(0)) return 0
    if (isStoreOptionEnabled(1)) return 1
    if (isStoreOptionEnabled(2)) return 2
    return 3
  }, [isStoreOptionEnabled])

  const buyGravityPulse = useCallback(() => {
    // Keep this handler side-effect free w.r.t. React state updaters.
    // In React StrictMode, updater functions may be invoked more than once in dev.
    if (score < GRAVITY_PULSE_COST) return
    setScore((s) => s - GRAVITY_PULSE_COST)
    setGravityCharges((c) => c + 1)
  }, [score, GRAVITY_PULSE_COST])

  const buyStasisField = useCallback(() => {
    if (score < STASIS_FIELD_COST) return
    setScore((s) => s - STASIS_FIELD_COST)
    setStasisCharges((c) => c + 1)
  }, [score, STASIS_FIELD_COST])

  const buyAttractorRecharge = useCallback(() => {
    if (score < ATTRACTOR_RECHARGE_COST) return
    setScore((s) => s - ATTRACTOR_RECHARGE_COST)
    setAttractorTimerWithRef(30)
  }, [score, ATTRACTOR_RECHARGE_COST, setAttractorTimerWithRef])

  useEffect(() => {
    if (gameState !== 'store') return
    if (!isStoreOptionEnabled(storeIndex)) {
      queueMicrotask(() => setStoreIndex(firstEnabledStoreIndex()))
    }
  }, [gameState, score, storeIndex, isStoreOptionEnabled, firstEnabledStoreIndex])

  useEffect(() => {
    gravityPulseChargesRef.current = gravityCharges
  }, [gravityCharges])

  useEffect(() => {
    stasisChargesRef.current = stasisCharges
  }, [stasisCharges])

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useEffect(() => {
    if (gameState !== 'menu') return

    // Menu should be an enticing action shot that is still consistent with game mechanics.
    // We stage a deterministic-ish scene (ship + bullets + harpoon + base processing) and keep
    // rock *positions* static so nothing drifts into ugly overlaps.
    const { width, height } = canvasSizeRef.current

    // Avoid rebuilding the scene repeatedly while staying on the menu.
    if (menuSceneInitializedRef.current) return
    menuSceneInitializedRef.current = true

    // Reset visuals.
    shieldsRef.current = 2
    queueMicrotask(() => setShields(2))
    miningBaseAngleRef.current = 0
    debrisRef.current = []

    // Place ship in a dramatic but plausible position.
    const baseX = width / 2
    const baseY = height / 2
    shipRef.current = {
      pos: { x: width * 0.28, y: height * 0.62 },
      vel: { x: 0, y: 0 },
      angle: Math.atan2(baseY - height * 0.62, baseX - width * 0.28),
      radius: SHIP_RADIUS,
    }

    // One rock being processed inside the base (mechanic-accurate and visually interesting).
    const processingRock = createRock(baseX + MINING_BASE_RADIUS * 0.18, baseY - MINING_BASE_RADIUS * 0.08, 26, {
      x: 0,
      y: 0,
    })
    // Mark it as “in base long enough” so base-gun shots make sense visually.
    ;(processingRock as Rock & { inBaseTime?: number }).inBaseTime = 3

    const toroidalDist = (ax: number, ay: number, bx: number, by: number) => {
      const dxRaw = Math.abs(ax - bx)
      const dyRaw = Math.abs(ay - by)
      const dx = Math.min(dxRaw, width - dxRaw)
      const dy = Math.min(dyRaw, height - dyRaw)
      return Math.hypot(dx, dy)
    }

    // Additional spaced rocks around the arena for an “in-progress” feel.
    const levelForShot = 5
    const speedMult = speedMultForLevel(levelForShot)
    const count = clamp(rockCountForLevel(levelForShot), 5, 7)

    const edgeInset = 1.5
    const sampleEdgeSpawn = () => {
      const edge = Math.floor(Math.random() * 4)
      let x = 0
      let y = 0
      let inwardDir = 0

      if (edge === 0) {
        x = edgeInset
        y = Math.random() * height
        inwardDir = 0
      } else if (edge === 1) {
        x = width - edgeInset
        y = Math.random() * height
        inwardDir = Math.PI
      } else if (edge === 2) {
        x = Math.random() * width
        y = edgeInset
        inwardDir = Math.PI / 2
      } else {
        x = Math.random() * width
        y = height - edgeInset
        inwardDir = -Math.PI / 2
      }

      const spread = Math.PI * 0.7
      const a = inwardDir + (Math.random() - 0.5) * spread
      const speed = (20 + Math.random() * 30) * speedMult
      return { x, y, vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed } as Vector2 }
    }

    const nextRocks: Rock[] = [processingRock]
    for (let i = 0; i < count; i++) {
      const radius = 30 + Math.random() * 15
      let chosen = sampleEdgeSpawn()

      for (let tries = 0; tries < 120; tries++) {
        const candidate = sampleEdgeSpawn()
        const distToShip = toroidalDist(candidate.x, candidate.y, shipRef.current.pos.x, shipRef.current.pos.y)
        const distToBase = toroidalDist(candidate.x, candidate.y, baseX, baseY)
        if (distToShip < 140) continue
        if (distToBase < MINING_BASE_RADIUS + 190) continue

        let ok = true
        for (const r of nextRocks) {
          const d = toroidalDist(candidate.x, candidate.y, r.pos.x, r.pos.y)
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
      if (e.key.toLowerCase() === 'p' && gameState === 'playing') {
        setGameState('paused')
      } else if (e.key.toLowerCase() === 'p' && gameState === 'paused') {
        setGameState('playing')
      }

      // Store keyboard navigation
      if (gameState === 'store') {
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setStoreIndex((current) => {
            // Move up in 2x2 grid (subtract 2 to go up a row)
            let next = current >= 2 ? current - 2 : current + 2
            // If disabled, try the other option in the same row
            if (!isStoreOptionEnabled(next)) {
              next = next % 2 === 0 ? next + 1 : next - 1
            }
            // If still disabled, stay where we are
            if (!isStoreOptionEnabled(next)) return current
            return next
          })
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setStoreIndex((current) => {
            // Move down in 2x2 grid (add 2 to go down a row)
            let next = current < 2 ? current + 2 : current - 2
            // If disabled, try the other option in the same row
            if (!isStoreOptionEnabled(next)) {
              next = next % 2 === 0 ? next + 1 : next - 1
            }
            // If still disabled, stay where we are
            if (!isStoreOptionEnabled(next)) return current
            return next
          })
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          setStoreIndex((current) => {
            // Move left in 2x2 grid
            let next = current % 2 === 1 ? current - 1 : current + 1
            // If disabled, try moving up or down in the same column
            if (!isStoreOptionEnabled(next)) {
              next = current < 2 ? current + 2 : current - 2
            }
            // If still disabled, stay where we are
            if (!isStoreOptionEnabled(next)) return current
            return next
          })
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          setStoreIndex((current) => {
            // Move right in 2x2 grid
            let next = current % 2 === 0 ? current + 1 : current - 1
            // If disabled, try moving up or down in the same column
            if (!isStoreOptionEnabled(next)) {
              next = current < 2 ? current + 2 : current - 2
            }
            // If still disabled, stay where we are
            if (!isStoreOptionEnabled(next)) return current
            return next
          })
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (storeIndex === 0) buyGravityPulse()
          else if (storeIndex === 1) buyStasisField()
          else if (storeIndex === 2) buyAttractorRecharge()
          else continueToNextWave()
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

      // Powerups: D = demolition pulse, S = stasis field, A = attractor beam.
      if (!e.repeat && e.key.toLowerCase() === 'd' && gameState === 'playing') {
        if (gravityPulseChargesRef.current > 0 && !queuedGravityPulseRef.current) {
          gravityPulseChargesRef.current -= 1
          setGravityCharges(gravityPulseChargesRef.current)
          queuedGravityPulseRef.current = true
          powerPulsesRef.current.push({ kind: 'gravity', at: Date.now() })
        }
      }

      if (!e.repeat && e.key.toLowerCase() === 's' && gameState === 'playing') {
        if (stasisChargesRef.current > 0 && !queuedStasisRef.current) {
          stasisChargesRef.current -= 1
          setStasisCharges(stasisChargesRef.current)
          queuedStasisRef.current = true
          powerPulsesRef.current.push({ kind: 'stasis', at: Date.now() })
        }
      }

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
  }, [gameState, menuIndex, gameOverIndex, storeIndex, startGame, onExit, continueToNextWave, buyGravityPulse, buyStasisField, buyAttractorRecharge, isStoreOptionEnabled, buildRopeBetween, toroidalDelta, HARPOON_HOOK_MASS, setAttractorActiveWithRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const newWidth = window.innerWidth
      const newHeight = window.innerHeight
      
      // Only reset starfield if size actually changed
      const sizeChanged = canvas.width !== newWidth || canvas.height !== newHeight
      
      canvas.width = newWidth
      canvas.height = newHeight
      canvasSizeRef.current = { width: newWidth, height: newHeight }

      // Force starfield regeneration only when size actually changes
      if (sizeChanged) {
        starFieldCanvasRef.current = null
        starFieldSizeRef.current = { width: 0, height: 0 }
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const update = (dt: number) => {
      const gameState = gameStateRef.current
      const waveStartTime = waveStartTimeRef.current
      const attractorActive = attractorActiveRef.current
      const attractorTimer = attractorTimerRef.current

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
        const { width: w, height: h } = canvasSizeRef.current
        miningBaseAngleRef.current += dt * MINING_ROT_SPEED

        // Tumble rocks in place (no translation).
        for (const rock of rocksRef.current) {
          rock.rot[0] += rock.angVel[0] * dt
          rock.rot[1] += rock.angVel[1] * dt
          rock.rot[2] += rock.angVel[2] * dt
        }

        // Loop bullets with wrapping.
        if (bulletsRef.current.length > 0) {
          for (const b of bulletsRef.current) {
            b.pos.x += b.vel.x * dt
            b.pos.y += b.vel.y * dt
            if (b.pos.x > w) b.pos.x = 0
            if (b.pos.x < 0) b.pos.x = w
            if (b.pos.y > h) b.pos.y = 0
            if (b.pos.y < 0) b.pos.y = h
          }
        }

        // Loop base shots with wrapping.
        if (baseShotsRef.current.length > 0) {
          for (const s of baseShotsRef.current) {
            s.pos.x += s.vel.x * dt
            s.pos.y += s.vel.y * dt
            if (s.pos.x > w) s.pos.x = 0
            if (s.pos.x < 0) s.pos.x = w
            if (s.pos.y > h) s.pos.y = 0
            if (s.pos.y < 0) s.pos.y = h
          }
        }

        return
      }

      // Keep the base alive even when not playing.
      miningBaseAngleRef.current += dt * MINING_ROT_SPEED

      if (gameState !== 'playing') return

      const ship = shipRef.current

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

      // Update rocks with wrapping
      const { width: w, height: h } = canvasSizeRef.current
      rocksRef.current.forEach((rock) => {
        rock.pos.x += rock.vel.x * dt
        rock.pos.y += rock.vel.y * dt

        // 3D tumbling
        rock.rot[0] += rock.angVel[0] * dt
        rock.rot[1] += rock.angVel[1] * dt
        rock.rot[2] += rock.angVel[2] * dt

        if (rock.pos.x > w) rock.pos.x = 0
        if (rock.pos.x < 0) rock.pos.x = w
        if (rock.pos.y > h) rock.pos.y = 0
        if (rock.pos.y < 0) rock.pos.y = h
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

      // Rock-rock collisions (treat as circles in a wrapped/toroidal space)
      // This uses a simple impulse + positional correction so rocks "bump" off each other.
      const rocks = rocksRef.current
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

      // Powerups: process queued activations inside the simulation step.
      // Demolition Pulse: hits each asteroid once as if shot by the ship.
      // Stasis Field: removes all momentum from all asteroids.
      if (queuedStasisRef.current) {
        queuedStasisRef.current = false
        for (const rock of rocksRef.current) {
          rock.vel.x = 0
          rock.vel.y = 0
        }
      }

      if (queuedGravityPulseRef.current) {
        queuedGravityPulseRef.current = false

        const originX = shipRef.current.pos.x
        const originY = shipRef.current.pos.y
        const targets = [...rocksRef.current]

        const releaseHarpoonIfAttached = (rock: Rock) => {
          const hp = harpoonRef.current
          if (hp.state === 'attached' && hp.rock === rock) {
            const ship = shipRef.current
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

        const hitRockLikeShipBullet = (rock: Rock) => {
          if (rock.kind === 'blue') {
            // Blue smallest rocks cannot be destroyed by ship bullets.
            // Impacts transfer momentum (push).
            const d = toroidalDelta(originX, originY, rock.pos.x, rock.pos.y, w, h)
            const dl = Math.hypot(d.dx, d.dy)
            if (dl > 1e-6) {
              const ux = d.dx / dl
              const uy = d.dy / dl
              const push = 170
              rock.vel.x += ux * push
              rock.vel.y += uy * push
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

          // Play explosion sound based on size
          const explosionSize = rock.radius > 35 ? 'large' : rock.radius > 20 ? 'medium' : 'small'
          sounds.explosion(explosionSize)

          // Split rock or create debris for smallest ones
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
                    const p = clamp(BLUE_ROCK_SPAWN_CHANCE_BASE + (levelRef.current - 1) * BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL, BLUE_ROCK_SPAWN_CHANCE_BASE, BLUE_ROCK_SPAWN_CHANCE_MAX)
                    if (Math.random() < p) {
                      kind = 'blue'
                      blueRocksSpawnedThisLevelRef.current += 1
                    }
                  }
                }
              }

              rocksRef.current.push(createRock(rock.pos.x, rock.pos.y, newRadius, undefined, kind))
            }
          } else {
            // Smallest rock destroyed - create particle debris
            createDebris(rock.pos.x, rock.pos.y, rock.vel.x, rock.vel.y, 5, 0.5, '255, 255, 255')
          }
        }

        for (const rock of targets) {
          // Only hit asteroids that existed at activation time.
          if (rocksRef.current.indexOf(rock) === -1) continue
          hitRockLikeShipBullet(rock)
        }
      }

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
          collideWithWalls(a.pos, a.vel, a.radius, 0.85)
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

      for (let i = 0; i < rocks.length; i++) {
        const a = rocks[i]
        for (let j = i + 1; j < rocks.length; j++) {
          const b = rocks[j]

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
      })

      // Collision detection: ship vs rocks (bounce + shield loss based on impact speed)
      {
        const shipMass = 1
        for (let i = 0; i < rocksRef.current.length; i++) {
          const rock = rocksRef.current[i]
          const d = toroidalDelta(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, w, h)
          const dist = Math.hypot(d.dx, d.dy)
          const minDist = ship.radius + rock.radius
          if (dist >= minDist || dist < 1e-6) continue

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

      // Check if all rocks destroyed
      if (rocksRef.current.length === 0 && gameState === 'playing' && !levelingUpRef.current) {
        levelingUpRef.current = true
        const nextLevel = levelRef.current + 1

        // Prepare to open the store before spawning the next wave,
        // but wait until the final explosion/debris animation finishes.
        queuedGravityPulseRef.current = false
        queuedStasisRef.current = false

        pendingNextWaveRef.current = nextLevel
        waitingForWaveEndFxRef.current = true
      }

      // If the wave is clear, don't show the store until the wave-ending animation completes.
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
        
        setStoreIndex(firstEnabledStoreIndex())
        setGameState('store')
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
        starFieldCanvasRef,
        starFieldSizeRef,
        MINING_BASE_RADIUS,
        MINING_DOOR_TRIM,
        miningBaseAngleRef,
        attractorActive,
        attractorTimer,
        baseShotsRef,
        rocksRef,
        bulletsRef,
        debrisRef,
        harpoonRef,
        shipRef,
        powerPulsesRef,
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
  }, [createRock, createDebris, spawnRocks, buildRopeBetween, toroidalDelta, firstEnabledStoreIndex, HARPOON_HOOK_MASS, HARPOON_REEL_MIN_LEN, calculateTimeMultiplier, setGameStateWithRef, setAttractorActiveWithRef, setAttractorTimerWithRef])

  const exitToGameSelect = () => {
    sounds.stopThrust()
    sounds.stopStoreMusic()
    onExit()
  }

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
        gravityCharges,
        stasisCharges,
        attractorTimer,
      })}

      {HardVacuumStoreOverlay({
        gameState,
        level,
        score,
        storeIndex,
        attractorTimer,
        waveCompletionTime,
        waveCreditsEarned,
        waveTimeBonus,
        GRAVITY_PULSE_COST,
        STASIS_FIELD_COST,
        ATTRACTOR_RECHARGE_COST,
        calculateTimeMultiplier,
        buyGravityPulse,
        buyStasisField,
        buyAttractorRecharge,
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
