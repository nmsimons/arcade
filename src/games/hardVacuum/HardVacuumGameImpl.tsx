import { useEffect, useRef, useState, useCallback } from 'react'
import type { ButtonHTMLAttributes } from 'react'
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
  TetherBody,
  Vector2,
  V3,
} from './types'
import { clamp, makeRockMesh } from './math'
import { rayCircleHitDistance } from './phaserGeometry'
import {
  WORLD_CENTER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  getCavernMap,
  isInsideCavern,
  raycastCavern,
  resolveCircleInCavern,
} from './worldGeometry'
import { sounds } from './sound'
import {
  BASE_GUN_INITIAL_COOLDOWNS,
  BASE_SHOT_SPEED,
  BLUE_ROCK_SPAWN_CHANCE_BASE,
  BLUE_ROCK_SPAWN_CHANCE_MAX,
  BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL,
  BULLET_SPEED,
  COLLISION_DAMAGE_FAST,
  COLLISION_DAMAGE_MEDIUM,
  COLLISION_DAMAGE_SLOW,
  DEBRIS_LIFETIME_MAX,
  DEBRIS_LIFETIME_MIN,
  DEBRIS_SPEED_MAX,
  DEBRIS_SPEED_MIN,
  DYING_ANIMATION_DURATION,
  HARPOON_CABLE_LENGTH,
  INVULNERABILITY_AFTER_HIT,
  INVULNERABILITY_GAME_START,
  INVULNERABILITY_MIN_AFTER_REPAIR,
  MINING_BASE_RADIUS,
  PHASER_BEAM_RADIUS,
  PHASER_COOLDOWN,
  PHASER_RANGE,
  ROCK_BASE_SPEED_MAX,
  ROCK_BASE_SPEED_MIN,
  RED_ROCK_BLAST_IMPULSE,
  RED_ROCK_BLAST_RADIUS,
  RED_ROCK_DETONATION_DELAY,
  RED_ROCK_SPAWN_CHANCE,
  SHIELD_REPAIR_TIME,
  SHIP_FRICTION,
  SHIP_LATERAL_FRICTION,
  SHIP_MAX_SHIELDS,
  SHIP_MAX_SPEED,
  SHIP_THRUST_ACCELERATION,
} from './tuning'
import { ExpeditionHud, ExpeditionOverlay, StationSurveyControls } from './expeditionUi'
import { DevelopmentPanel } from './DevelopmentPanel'
import { addDevelopmentCredits, advanceDevelopmentLevel } from './development'
import { TERMINALS, terminalVisible } from './terminals'
import { coreReleased, havenPose, havenPosition, havenReady, moveHaven, regionForRoom, stepHaven } from './campaign'
import type { BerthId } from './campaignWorld'
import { IGNITION_CRADLE } from './campaignWorld'
import type { HardVacuumGameState } from './ui'
import { bankAtCheckpoint, bankCarriedCredits, blastGate, cargoBodies, checkpointPosition, crashExpedition, expeditionMap, freshExpedition, freshRuntime, interaction, maxShields, purchaseUpgrade, readExpedition, powerCellSpawns, saveExpedition, sectorAt, snapshotCargo, stepCargoRecovery, stepExpedition, teleportToHaven, visibleBetween } from './expedition'
import { BLASTER_BLAST_RADIUS, fireBlaster, pulverizeAsteroid, stepBlaster } from './blaster'
import type { BlasterVisuals } from './blaster'
import { angleDelta, applyNoseThrust, dockingReadiness, driftCargo, repelBlueBody, stepShipTurn } from './expeditionPhysics'
import { laserImpactMs, stepLaserContact } from './laser'
import type { LaserContact } from './laser'
import { freshRadiationFeedback, stepRadiation, stepRadiationFeedback } from './radiation'
import { activateRemoteRecharge, needsRecharge, purchaseSupply, restoreShipSystems, stepRemoteRecharge } from './supplies'
import type { SupplyPurchase } from './supplies'
import { creditAsteroidDestruction } from './oreCredits'
import { debrisField, fragmentKindFor, fragmentProfileAt } from './debrisField'
import { BOT_BLASTER_DAMAGE, BOT_LASER_DAMAGE, damageBot, freshBots, stepBots, stepBotSparks, stepSecurityShots } from './stationBots'
import type { StationBot } from './stationBots'
import { surveyView } from './surveyView'
import { havenColliders } from './havenGeometry'
import { laserCapacityMs, tetherReachMultiplier, upgradeOffer } from './upgrades'
import type { ShipUpgrade } from './upgrades'
import { FLIGHT_KEYS, flightInput } from './flightInput'
import { drawHardVacuumFrame } from './render'
import { freshShipAppearance, stepShipAppearance, stepHullSparks } from './shipRender'
import { updateBaseDefenseAndProcessing } from './baseDefense'
import { updateHarpoon } from './harpoon'
import { updateBulletsAndPlayerRockCollisions } from './bullets'

export function HardVacuumGame({ onExit }: HardVacuumGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<HardVacuumGameState>('menu')
  const [initialSave] = useState(readExpedition)
  const [expedition, setExpedition] = useState(() => initialSave ?? freshExpedition())
  const expeditionRef = useRef(expedition)
  const runtimeRef = useRef(freshRuntime())
  const [hud, setHud] = useState({ room: 'Haven', prompt: '', message: '', towing: '', radio: '', grappleHint: '' })
  const [hasSave, setHasSave] = useState(initialSave !== null)
  const [saveAvailable, setSaveAvailable] = useState(true)
  const [lostCredits, setLostCredits] = useState(0)
  const hudTimerRef = useRef(0)
  const saveTimerRef = useRef(0)
  const mapOpenRef = useRef(false)
  const [mapOpen, setMapOpen] = useState(false)
  const mapOverviewRef = useRef(false)
  const [mapOverview, setMapOverview] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const mapZoomRef = useRef(1)
  const mapFocusRef = useRef<Vector2 | undefined>(undefined)
  const [journalOpen, setJournalOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const devOpenRef = useRef(false)
  const [devMapRevealed, setDevMapRevealed] = useState(false)
  const toggleOverview = useCallback(() => {
    mapFocusRef.current = undefined
    mapOverviewRef.current = !mapOverviewRef.current
    setMapOverview(mapOverviewRef.current)
  }, [])
  const publishExpedition = useCallback((message?: string) => {
    if (message) {
      runtimeRef.current.message = message
      runtimeRef.current.messageTime = 2.5
    }
    setExpedition({ ...expeditionRef.current, upgrades: [...expeditionRef.current.upgrades] })
    const saved = saveExpedition(expeditionRef.current)
    setSaveAvailable(saved)
    if (saved) setHasSave(true)
  }, [])
  const [shields, setShields] = useState(SHIP_MAX_SHIELDS)
  const shieldsRef = useRef(shields)
  const gameStateRef = useRef(gameState)
  const waveCreditsRef = useRef(0)

  useEffect(() => {
    shieldsRef.current = shields
  }, [shields])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  const setGameStateWithRef = useCallback((next: HardVacuumGameState) => {
    gameStateRef.current = next
    setGameState(next)
  }, [])

  useEffect(() => {
    // Ensure continuous audio loops don't get stuck across state transitions.
    if (gameState !== 'playing' || devOpen || mapOpen) sounds.stopThrust()
    if (gameState !== 'playing' || devOpen || mapOpen) sounds.stopRepairHum()
    if (gameState !== 'playing' || devOpen || mapOpen) sounds.stopPhaser()
    if (gameState !== 'playing' || devOpen || mapOpen) sounds.stopRadiation()

    if (gameState === 'docked' && !devOpen && !mapOpen) sounds.startStoreMusic()
    else sounds.stopStoreMusic()

    return () => {
      // Ensure no loop persists across unmount / StrictMode re-mounts.
      sounds.stopThrust()
      sounds.stopStoreMusic()
      sounds.stopRepairHum()
      sounds.stopPhaser(true)
      sounds.stopRadiation()
    }
  }, [gameState, devOpen, mapOpen])

  const SHIP_RADIUS = 15
  const SMALLEST_ROCK_RADIUS = 20
  const shipRef = useRef<Ship>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, radius: SHIP_RADIUS })
  const rocksRef = useRef<Rock[]>([])
  const botsRef = useRef(freshBots(expedition))
  const levelRef = useRef(1)
  const blueRockQuotaRef = useRef(0)
  const blueRocksSpawnedThisLevelRef = useRef(0)
  const shipRepairTimeRef = useRef(0)
  const bulletsRef = useRef<Bullet[]>([])
  const blasterRef = useRef<BlasterVisuals>({ shots: [], bursts: [] })
  const laserContactRef = useRef<LaserContact>({ elapsedMs: 0 })
  const baseShotsRef = useRef<BaseShot[]>([])
  const debrisRef = useRef<Debris[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const lastTimeRef = useRef(0)
  const invulnerableRef = useRef(0)
  const lastShieldHitAtRef = useRef(0)
  const lastShieldRechargeAtRef = useRef(0)
  const dyingTimerRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const harpoonRef = useRef<Harpoon>({ state: 'idle' })
  const miningBaseAngleRef = useRef(0)
  const shipAppearanceRef = useRef(freshShipAppearance())
  const miningGunCooldownsRef = useRef<[number, number, number]>(BASE_GUN_INITIAL_COOLDOWNS)

  const phaserStateRef = useRef<{ energyMs: number; cooldownMs: number; particleCarry: number }>({
    energyMs: laserCapacityMs(expedition),
    cooldownMs: 0,
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


  // Curated menu “action shot” scene.
  const menuSceneInitializedRef = useRef(false)

  const HARPOON_REEL_SPEED = 440
  // Visual-only slack so the cable can look weighty/curvy even when fully extended.
  const HARPOON_VISUAL_SLACK = 1.18
  const HARPOON_HOOK_RADIUS = 5
  const HARPOON_HOOK_MASS = Math.max(0.2, (HARPOON_HOOK_RADIUS / 18) * (HARPOON_HOOK_RADIUS / 18))
  const HARPOON_REEL_MIN_LEN = SHIP_RADIUS + HARPOON_HOOK_RADIUS + 2

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
      fragmentRates: fragmentProfileAt({x,y}),
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

  const populateExpedition = useCallback(() => {
    rocksRef.current = debrisField(expeditionRef.current).map(({ pos, radius, vel, kind }) => createRock(pos.x, pos.y, radius, vel, kind))
    const state = expeditionRef.current
    for (const cell of powerCellSpawns(state)) {
      const rock = createRock(cell.pos.x, cell.pos.y, 20, cell.vel, 'blue')
      rock.sourceId = cell.sourceId; rock.tethered = cell.tethered
      rocksRef.current.push(rock)
    }
    cargoBodies(state, runtimeRef.current)
  }, [createRock])

  const startGame = useCallback((fresh = false) => {
    if (fresh) expeditionRef.current = freshExpedition()
    botsRef.current = freshBots(expeditionRef.current)
    runtimeRef.current = freshRuntime()
    shipAppearanceRef.current = freshShipAppearance()
    lastShieldHitAtRef.current = 0
    lastShieldRechargeAtRef.current = 0
    blasterRef.current = { shots: [], bursts: [] }
    laserContactRef.current = { elapsedMs: 0 }
    mapOpenRef.current = false
    setMapOpen(false)
    keysRef.current.clear()
    sounds.init()
    sounds.stopStoreMusic()
    const savedPosition = expeditionRef.current.position
    const spawn = isInsideCavern(savedPosition, 15, expeditionMap(expeditionRef.current)) ? { ...savedPosition } : checkpointPosition(expeditionRef.current)
    shipRef.current = { pos: spawn, vel: { x: 0, y: 0 }, angle: Math.PI, angularVelocity: 0, radius: 15 }
    rocksRef.current = []
    shipRepairTimeRef.current = 0
    bulletsRef.current = []
    baseShotsRef.current = []
    shieldsRef.current = Math.min(maxShields(expeditionRef.current), expeditionRef.current.shields)
    setShields(shieldsRef.current)
    setGameStateWithRef('playing')
    invulnerableRef.current = INVULNERABILITY_GAME_START
    waveCreditsRef.current = 0
    debrisRef.current = []
    harpoonRef.current = { state: 'idle' }
    miningBaseAngleRef.current = expeditionRef.current.campaign.havenAngle
    miningGunCooldownsRef.current = BASE_GUN_INITIAL_COOLDOWNS
    phaserStateRef.current = { energyMs: laserCapacityMs(expeditionRef.current), cooldownMs: 0, particleCarry: 0 }
    phaserBeamRef.current = { active: false, start: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, length: 0, energy01: 1 }
    phaserParticlesRef.current = []
    populateExpedition()
    publishExpedition()
  }, [populateExpedition, publishExpedition, setGameStateWithRef])

  const setDevelopmentOpen = useCallback((open: boolean) => {
    devOpenRef.current = open
    setDevOpen(open)
    keysRef.current.clear()
    if (open) {
      phaserBeamRef.current.active = false
      laserContactRef.current = { elapsedMs: 0 }
    }
  }, [])

  const jumpToDevelopmentLevel = useCallback((id: BerthId) => {
    if (!import.meta.env.DEV) return
    if (gameStateRef.current !== 'menu') snapshotCargo(expeditionRef.current, runtimeRef.current, rocksRef.current)
    if (!advanceDevelopmentLevel(expeditionRef.current, id)) return
    setJournalOpen(false)
    startGame()
    setDevelopmentOpen(false)
  }, [startGame, setDevelopmentOpen])

  const grantDevelopmentCredits = useCallback(() => {
    if (!import.meta.env.DEV) return
    addDevelopmentCredits(expeditionRef.current)
    publishExpedition()
  }, [publishExpedition])

  const setSurveyOpen = useCallback((open: boolean) => {
    mapOpenRef.current = open
    setMapOpen(open)
    keysRef.current.clear()
    if (open) {
      mapFocusRef.current = undefined
      // A full-map request should never reopen cropped to the last local region.
      if (import.meta.env.DEV && devMapRevealed) {
        mapOverviewRef.current = true
        setMapOverview(true)
      }
      sounds.stopThrust(); sounds.stopPhaser(); sounds.stopRepairHum(); sounds.stopRadiation()
    }
  }, [devMapRevealed])

  const toggleMapZoom = useCallback(() => {
    mapZoomRef.current = mapZoomRef.current === 1 ? 2 : 1
    mapFocusRef.current = undefined
    setMapZoom(mapZoomRef.current)
  }, [])
  const panSurvey = useCallback((dx: number, dy: number) => {
    if (mapZoomRef.current === 1) return
    const pos = gameStateRef.current === 'menu' ? expeditionRef.current.position : shipRef.current.pos
    const { width,height } = canvasSizeRef.current
    const view = surveyView(pos,width,height,mapOverviewRef.current,mapZoomRef.current,mapFocusRef.current)
    mapFocusRef.current = {x:view.center.x+dx/view.scale,y:view.center.y+dy/view.scale}
  }, [])

  const toggleDevelopmentMap = useCallback(() => {
    if (!import.meta.env.DEV) return
    const revealed = !devMapRevealed
    setDevMapRevealed(revealed)
    if (revealed) {
      mapOverviewRef.current = true
      setMapOverview(true)
      setSurveyOpen(true)
      setDevelopmentOpen(false)
    }
  }, [devMapRevealed, setSurveyOpen, setDevelopmentOpen])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const toggle = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code !== 'Backquote' && event.key !== '`' && event.key !== '~') return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!event.repeat) setDevelopmentOpen(!devOpenRef.current)
    }
    // Capture also reaches the shortcut while a keyboard dialog has focus.
    window.addEventListener('keydown', toggle, true)
    return () => window.removeEventListener('keydown', toggle, true)
  }, [setDevelopmentOpen])

  const shootBlaster = useCallback(() => {
    if (gameStateRef.current !== 'playing' || mapOpenRef.current || expeditionRef.current.campaign.journey?.riding || !expeditionRef.current.blasterInstalled) return
    const shot = fireBlaster(expeditionRef.current, runtimeRef.current, shipRef.current)
    if (!shot) {
      if (expeditionRef.current.blasterCharges <= 0) publishExpedition('Blaster empty')
      return
    }
    blasterRef.current.shots.push(shot)
    shipRepairTimeRef.current = 0
    sounds.blaster()
    publishExpedition()
  }, [publishExpedition])

  const rechargeRemotely = useCallback(() => {
    if (gameStateRef.current !== 'playing' || mapOpenRef.current) return
    expeditionRef.current.shields = shieldsRef.current
    if (!activateRemoteRecharge(expeditionRef.current)) return
    runtimeRef.current.recharging = true
    runtimeRef.current.rechargeProgress = 0
    publishExpedition()
  }, [publishExpedition])

  const teleportHome = useCallback(() => {
    if (gameStateRef.current !== 'playing' || mapOpenRef.current) return
    const ship = shipRef.current, state = expeditionRef.current, rt = runtimeRef.current
    const from = { ...ship.pos }
    if (!teleportToHaven(state, ship)) return
    // Teleport the ship only. Released cargo stays in the world for later recovery.
    harpoonRef.current = { state: 'idle' }
    rt.towing = undefined
    rt.teleport = { from, time: 0.6 }
    rt.radiation = freshRadiationFeedback()
    shipRepairTimeRef.current = 0
    keysRef.current.clear()
    phaserBeamRef.current.active = false
    laserContactRef.current = { elapsedMs: 0 }
    sounds.stopThrust(); sounds.stopPhaser(); sounds.stopRadiation()
    shipAppearanceRef.current.turn=0
    sounds.teleport()
    snapshotCargo(state, rt, rocksRef.current)
    publishExpedition()
  }, [publishExpedition])

  const retractTether = useCallback(() => {
    const hp = harpoonRef.current
    if (hp.state === 'idle' || hp.state === 'reeling') return
    const end = hp.state === 'attached' ? hp.rock.pos : hp.pos
    const ship = shipRef.current
    const reelLength = Math.hypot(end.x - ship.pos.x, end.y - ship.pos.y)
    const ropeLength = reelLength * HARPOON_VISUAL_SLACK
    harpoonRef.current = { state: 'reeling', pos: { ...end }, reelSpeed: HARPOON_REEL_SPEED, reelLength, ropeLength, ...buildRopeBetween(ship.pos.x, ship.pos.y, end.x, end.y, ropeLength) }
  }, [buildRopeBetween])

  const resumeFlight = useCallback(() => {
    setJournalOpen(false)
    keysRef.current.clear()
    if (gameStateRef.current !== 'docked') {
      setGameStateWithRef('playing')
      return
    }
    const ship = shipRef.current
    const heading = miningBaseAngleRef.current + Math.PI
    const distance = 62
    runtimeRef.current.docking = { id: expeditionRef.current.checkpoint, phase: 'out', time: 0, from: { ...ship.pos }, to: { x: ship.pos.x + Math.cos(heading) * distance, y: ship.pos.y + Math.sin(heading) * distance }, angle: ship.angle, targetAngle: heading }
    setGameStateWithRef('docking')
  }, [setGameStateWithRef])

  const interact = useCallback(() => {
    if (gameStateRef.current !== 'playing' || mapOpenRef.current) return
    const state = expeditionRef.current
    const action = interaction(state, shipRef.current)
    if (!action) return
    if (action.kind === 'recall' && action.ready) {
      if (moveHaven(state, action.id as BerthId, false, expeditionMap(state), miningBaseAngleRef.current)) {
        baseShotsRef.current = []; sounds.collect(); publishExpedition('Haven en route')
      } else publishExpedition('Haven’s service route is still obstructed')
      return
    }
    if (action.kind === 'dock') {
      if (!action.ready) return
      const ship = shipRef.current
      const dock = havenPosition(state)
      runtimeRef.current.docking = { id: action.id, phase: 'in', time: 0, from: { ...ship.pos }, to: { ...dock }, angle: ship.angle, targetAngle: ship.angle }
      keysRef.current.clear()
      retractTether()
      phaserBeamRef.current.active = false
      setGameStateWithRef('docking')

    }
  }, [retractTether, setGameStateWithRef, publishExpedition])

  const relocateHaven = useCallback((destination: BerthId) => {
    const state = expeditionRef.current
    if (gameStateRef.current !== 'docked' || !moveHaven(state, destination, true, expeditionMap(state), miningBaseAngleRef.current)) return
    retractTether(); harpoonRef.current = { state:'idle' }; baseShotsRef.current = []
    keysRef.current.clear(); phaserBeamRef.current.active = false
    setGameStateWithRef('playing'); publishExpedition('Haven departing')
  }, [retractTether, setGameStateWithRef, publishExpedition])

  const buyUpgrade = useCallback((id: ShipUpgrade) => {
    const offer = upgradeOffer(expeditionRef.current, id)
    if (gameStateRef.current !== 'docked' || !purchaseUpgrade(expeditionRef.current, id)) return
    shieldsRef.current = maxShields(expeditionRef.current)
    setShields(shieldsRef.current)
    expeditionRef.current.shields = shieldsRef.current
    sounds.collect()
    phaserStateRef.current.energyMs = laserCapacityMs(expeditionRef.current)
    publishExpedition(`${offer.name} installed.`)
  }, [publishExpedition])

  const buySupply = useCallback((id: SupplyPurchase) => {
    if (gameStateRef.current !== 'docked' || !purchaseSupply(expeditionRef.current, id)) return
    sounds.collect()
    publishExpedition()
  }, [publishExpedition])

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
    miningBaseAngleRef.current = expeditionRef.current.campaign.havenAngle
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
    const speedMult = 1.3
    const count = 6

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
        if (!isInsideCavern(candidate, radius + 30, getCavernMap(1))) continue
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
  }, [gameState, SHIP_RADIUS, createRock])

  useEffect(() => {
    if (gameState !== 'menu') {
      menuSceneInitializedRef.current = false
    }
  }, [gameState])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (devOpenRef.current) return
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const key = e.code === 'Semicolon' ? ';' : e.key.toLowerCase()
      // Dialogs handle their own focused buttons before the event reaches here.
      // The developer map can be inspected without leaving menus or undocking.
      if (mapOpenRef.current) {
        if (['o', 'z', 'm', 'escape', 'p'].includes(key)) {
          e.preventDefault()
          if (e.repeat) return
          if (key === 'o') toggleOverview()
          else if (key === 'z') toggleMapZoom()
          else {
            setSurveyOpen(false)
            if (key === 'p' && gameState === 'playing') setGameStateWithRef('paused')
          }
        }
        return
      }
      if (key === 'escape' || key === 'p') {
        if (gameState !== 'playing' && gameState !== 'paused') return
        e.preventDefault()
        if (e.repeat) return
        keysRef.current.clear()
        setGameStateWithRef(gameState === 'playing' ? 'paused' : 'playing')
        return
      }
      if (key === 'g' && !mapOpenRef.current && (gameState === 'playing' || gameState === 'paused' || gameState === 'docked')) {
        e.preventDefault(); if (e.repeat) return
        keysRef.current.clear(); setJournalOpen(true)
        if (gameState === 'playing') setGameStateWithRef('paused')
        return
      }
      if (key === 'm' && (gameState === 'playing' || (import.meta.env.DEV && devMapRevealed))) {
        e.preventDefault()
        if (e.repeat) return
        setSurveyOpen(true)
        return
      }
      if (gameState !== 'playing' || expeditionRef.current.campaign.journey?.riding) return
      // Tab and native button activation are UI input, never ship input.
      if (e.target instanceof HTMLElement && e.target.closest('button, input, a')) {
        if (['enter', ' ', 'tab', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end'].includes(key)) return
      }
      if (key === 'e') {
        e.preventDefault()
        if (!e.repeat) interact()
        return
      }
      if (key === 'b') {
        e.preventDefault()
        if (!e.repeat) shootBlaster()
        return
      }
      if (key === 'r' || key === 't') {
        e.preventDefault()
        if (!e.repeat) { if (key === 'r') rechargeRemotely(); else teleportHome() }
        return
      }
      if ([...FLIGHT_KEYS, ' '].includes(key)) {
        e.preventDefault()
        keysRef.current.add(key)
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

          const cableLength = HARPOON_CABLE_LENGTH * tetherReachMultiplier(expeditionRef.current)
          const ropeLength = cableLength * HARPOON_VISUAL_SLACK
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
            maxLength: cableLength,
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

    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code === 'Semicolon' ? ';' : e.key.toLowerCase())
      if (e.key === ' ') laserContactRef.current = { elapsedMs: 0 }
    }

    const handleBlur = () => {
      keysRef.current.clear()
      if (gameStateRef.current === 'playing') setGameStateWithRef('paused')
    }
    window.addEventListener('blur', handleBlur)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, devMapRevealed, interact, shootBlaster, rechargeRemotely, teleportHome, setGameStateWithRef, buildRopeBetween, toroidalDelta, HARPOON_HOOK_MASS, toggleOverview, toggleMapZoom, setSurveyOpen])

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

      if (devOpenRef.current || gameState === 'paused' || gameState === 'complete' || mapOpenRef.current) return
      const playRecoveryCues = () => {
        const rt=runtimeRef.current,base=havenPosition(expeditionRef.current),ship=shipRef.current
        if(Math.hypot(ship.pos.x-base.x,ship.pos.y-base.y)<800 || rt.coreLatch && Math.hypot(ship.pos.x-IGNITION_CRADLE.x,ship.pos.y-IGNITION_CRADLE.y)<800) for(const cue of rt.recoveryCues ?? []) sounds.havenRecovery(cue)
        rt.recoveryCues=[]
      }
      // Haven finishes handling a load while the pilot is in the service menu.
      if(gameState==='docked'||gameState==='docking') {
        const state=expeditionRef.current,rt=runtimeRef.current
        if(gameState==='docked') rt.elapsed+=dt
        const events=stepCargoRecovery(state,rt,dt)
        playRecoveryCues()
        if(events.length) { snapshotCargo(state,rt,rocksRef.current);sounds.collect();publishExpedition(events.at(-1)) }
        if(gameState==='docked') return
      }
      const riding = gameState === 'playing' && !!expeditionRef.current.campaign.journey?.riding
      const previousHaven = havenPose(expeditionRef.current, miningBaseAngleRef.current)
      let havenArrived = false
      if (gameState === 'playing' && expeditionRef.current.campaign.journey) {
        havenArrived = stepHaven(expeditionRef.current,dt)
        miningBaseAngleRef.current = expeditionRef.current.campaign.havenAngle
        if (riding) {
          keysRef.current.clear()
          shipRef.current.pos = { ...havenPosition(expeditionRef.current) }
          shipRef.current.vel = { x:0,y:0 }
          shipRef.current.angle = miningBaseAngleRef.current
          sounds.stopRadiation()
        }
        if (havenArrived && !riding) publishExpedition('Haven secured at the service berth')
      }
      if (gameState === 'docking') {
        const rt = runtimeRef.current, dock = rt.docking!, ship = shipRef.current
        rt.elapsed += dt
        dock.time += dt
        const t = Math.min(1, dock.time / 0.7), ease = t * t * (3 - 2 * t)
        ship.pos = { x: dock.from.x + (dock.to.x - dock.from.x) * ease, y: dock.from.y + (dock.to.y - dock.from.y) * ease }
        ship.angle = dock.angle + angleDelta(dock.angle, dock.targetAngle) * ease
        ship.angularVelocity = 0
        ship.vel = { x: 0, y: 0 }
        const hook = harpoonRef.current
        if (hook.state === 'reeling') {
          const dx = hook.pos.x - ship.pos.x, dy = hook.pos.y - ship.pos.y
          const length = Math.max(0, Math.hypot(dx, dy) - hook.reelSpeed * dt)
          if (length < HARPOON_REEL_MIN_LEN) harpoonRef.current = { state: 'idle' }
          else {
            const angle = Math.atan2(dy, dx)
            hook.pos = { x: ship.pos.x + Math.cos(angle) * length, y: ship.pos.y + Math.sin(angle) * length }
            hook.reelLength = length; hook.ropeLength = length * HARPOON_VISUAL_SLACK
            Object.assign(hook, buildRopeBetween(ship.pos.x, ship.pos.y, hook.pos.x, hook.pos.y, hook.ropeLength))
          }
        }
        if (t < 1) return
        if (dock.phase === 'out') {
          ship.vel = { x: Math.cos(ship.angle) * 45, y: Math.sin(ship.angle) * 45 }
          rt.docking = undefined
          setGameStateWithRef('playing')
        } else {
          const state = expeditionRef.current
          const deposited = bankAtCheckpoint(state, dock.id)
          shieldsRef.current = maxShields(state)
          setShields(shieldsRef.current)
          state.position = { ...ship.pos }; state.shields = shieldsRef.current
          sounds.collect()
          setGameStateWithRef('docked')
          publishExpedition(deposited > 0 ? `+${deposited} banked` : 'Haven')
        }
        return
      }
      const phaser = phaserStateRef.current
      const phaserCapacity = laserCapacityMs(expeditionRef.current)

      // Phaser timers tick even if we aren't actively playing (so cooldowns don't get stuck).
      if (phaser.cooldownMs > 0) {
        phaser.cooldownMs -= dt * 1000
        if (phaser.cooldownMs <= 0) {
          phaser.cooldownMs = 0
          phaser.energyMs = phaserCapacity
        }
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

      // The deployed ring idles; transit keeps the tender's actual heading.
      if (havenReady(expeditionRef.current) && !havenArrived && !runtimeRef.current.recovery) miningBaseAngleRef.current += dt * MINING_ROT_SPEED
      expeditionRef.current.campaign.havenAngle = miningBaseAngleRef.current

      if (gameState !== 'playing') return

      const ship = shipRef.current
      const cavernMap = expeditionMap(expeditionRef.current)

      const w = WORLD_WIDTH
      const h = WORLD_HEIGHT
      // Physics helpers retain this callback shape, but the finite world never wraps.
      const wrapX = (x: number) => x
      const wrapY = (y: number) => y

      const pendingRedDetonations: Rock[] = []
      const initialBanked = expeditionRef.current.banked
      let asteroidRewarded = false
      const rewardAsteroid = (rock: Rock) => {
        if (gameStateRef.current !== 'playing') return
        const credits = creditAsteroidDestruction(expeditionRef.current, rock, { pos:havenPosition(expeditionRef.current), radius:havenReady(expeditionRef.current) ? MINING_BASE_RADIUS : 0 })
        waveCreditsRef.current += credits
        asteroidRewarded ||= credits > 0
      }

      const armRedRock = (rock: Rock) => {
        if (rock.kind !== 'red') return
        if (rock.redFuseS == null) rock.redFuseS = RED_ROCK_DETONATION_DELAY
      }

      const releaseHarpoonIfAttached = (rock: TetherBody) => {
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

      const hitBot = (bot: StationBot, damage: number) => {
        // A death resets the encounter. Remaining impacts in this frame must
        // not mark enemies defeated again after that reset.
        if (bot.health <= 0 || gameStateRef.current !== 'playing') return
        const destroyed = damageBot(expeditionRef.current, bot, damage)
        createDebris(bot.pos.x, bot.pos.y, bot.vel.x, bot.vel.y, destroyed ? 18 : 4, destroyed ? .9 : .25, '225, 171, 114')
        if (destroyed) {
          releaseHarpoonIfAttached(bot)
          sounds.explosion('medium')
          publishExpedition()
        }
      }

      const hitRockLikeShipWeapon = (rock: Rock, pushDir?: Vector2) => {
        if (rock.kind === 'red') {
          armRedRock(rock)
          return
        }
        if (repelBlueBody(rock, pushDir)) return

        releaseHarpoonIfAttached(rock)

        const idx = rocksRef.current.indexOf(rock)
        if (idx === -1) return
        rocksRef.current.splice(idx, 1)
        rewardAsteroid(rock)

        const explosionSize = rock.radius > 35 ? 'large' : rock.radius > 20 ? 'medium' : 'small'
        sounds.explosion(explosionSize)

        if (rock.radius > SMALLEST_ROCK_RADIUS) {
          const newRadius = rock.radius / 2
          for (let j = 0; j < 2; j++) {
            const kind = newRadius <= SMALLEST_ROCK_RADIUS ? fragmentKindFor(rock,Math.random()) : 'normal'
            const fragment=createRock(rock.pos.x,rock.pos.y,newRadius,undefined,kind)
            fragment.fragmentRates=rock.fragmentRates ?? fragmentProfileAt(rock.pos)
            rocksRef.current.push(fragment)
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
          rewardAsteroid(source)

          sounds.explosion('large')
          createDebris(source.pos.x, source.pos.y, source.vel.x, source.vel.y, 26, 1.4, '255, 80, 80')

          for (const bot of botsRef.current.units) if (bot.health > 0 && Math.hypot(bot.pos.x-source.pos.x,bot.pos.y-source.pos.y) < RED_ROCK_BLAST_RADIUS && visibleBetween(source.pos,bot.pos,cavernMap)) hitBot(bot,3)

          // AOE: ship
          {
            const d = toroidalDelta(source.pos.x, source.pos.y, ship.pos.x, ship.pos.y, w, h)
            const dist = Math.hypot(d.dx, d.dy)
            if (!riding && dist < RED_ROCK_BLAST_RADIUS) {
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
            if (other.socketId) continue
            const d = toroidalDelta(source.pos.x, source.pos.y, other.pos.x, other.pos.y, w, h)
            const dist = Math.hypot(d.dx, d.dy)
            if (dist >= RED_ROCK_BLAST_RADIUS || !visibleBetween(source.pos, other.pos, cavernMap)) continue

            const t = clamp(1 - dist / RED_ROCK_BLAST_RADIUS, 0, 1)
            const nx = dist > 1e-6 ? d.dx / dist : 1
            const ny = dist > 1e-6 ? d.dy / dist : 0
            const kick = (RED_ROCK_BLAST_IMPULSE * t) / Math.max(0.8, other.radius / 16)
            if (repelBlueBody(other, { x: nx, y: ny }, kick)) continue
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

      const loseShip = () => {
        createDebris(ship.pos.x, ship.pos.y, ship.vel.x, ship.vel.y, 18, 1.2, '255, 255, 255')
        sounds.explosion('large'); sounds.stopThrust(); sounds.stopRadiation()
        keysRef.current.clear()
        dyingTimerRef.current = DYING_ANIMATION_DURATION
        setLostCredits(crashExpedition(expeditionRef.current))
        publishExpedition()
        setGameStateWithRef('dying')
      }
      const applyImpactShield = (impactSpeed: number) => {
        if (riding || invulnerableRef.current > 0 || gameStateRef.current !== 'playing') return
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

        const current = shieldsRef.current
        if (current <= 0) {
          loseShip()
          return
        }
        const next = Math.max(0, current - amt)
        shieldsRef.current = next
        setShields(next)
        lastShieldHitAtRef.current = Date.now()
        sounds.shieldHit(next)
      }

      // Passengers remain secured inside the tender while the world keeps moving.
      if (!riding) {
        // Ship controls
        const {left:turningLeft,right:turningRight,forward:isThrusting,reverse:noseThrusting}=flightInput(keysRef.current)
        stepShipTurn(ship, Number(turningRight) - Number(turningLeft), dt)
        if (isThrusting) {
          ship.vel.x += Math.cos(ship.angle) * SHIP_THRUST_ACCELERATION * dt
          ship.vel.y += Math.sin(ship.angle) * SHIP_THRUST_ACCELERATION * dt
        }
        if (noseThrusting) applyNoseThrust(ship, dt)
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
        const shipWallHit = resolveCircleInCavern(ship.pos, ship.vel, ship.radius, 0.42, cavernMap)
        if (shipWallHit.maxImpactSpeed > 0) applyImpactShield(shipWallHit.maxImpactSpeed)
        if (gameStateRef.current !== 'playing') return
        const radiationDose = stepRadiation(expeditionRef.current, ship.pos, dt, cavernMap)
        const radiationFeedback = stepRadiationFeedback(runtimeRef.current.radiation, radiationDose, expeditionRef.current, dt)
        if (radiationDose.failed) { loseShip(); return }
        if (radiationFeedback.stopped) sounds.stopRadiation()
        if (radiationFeedback.tick) sounds.radiationTick(radiationFeedback.urgency, runtimeRef.current.radiation.unprotected)
      } else ship.angularVelocity=0

      // Update invulnerability
      if (invulnerableRef.current > 0) {
        invulnerableRef.current -= dt * 1000
      }

      // Update rocks and bounce them off the cavern boundary.
      const activeRock = (rock: Rock) => Math.hypot(rock.pos.x-ship.pos.x,rock.pos.y-ship.pos.y) < 1400 || Math.hypot(rock.pos.x-havenPosition(expeditionRef.current).x,rock.pos.y-havenPosition(expeditionRef.current).y) < 450
      rocksRef.current.forEach((rock) => {
        if (!activeRock(rock)) return
        rock.laserGlow = (rock.laserGlow ?? 0) * Math.exp(-5 * dt)
        if (rock.socketId) return
        if (rock.sourceId) driftCargo(rock, dt)
        else { rock.pos.x += rock.vel.x * dt; rock.pos.y += rock.vel.y * dt }

        // 3D tumbling
        rock.rot[0] += rock.angVel[0] * dt
        rock.rot[1] += rock.angVel[1] * dt
        rock.rot[2] += rock.angVel[2] * dt

        const wallHit = resolveCircleInCavern(rock.pos, rock.vel, rock.radius, 0.82, cavernMap)
        if (wallHit.collided && rock.kind === 'red') armRedRock(rock)
      })

      const rocks = rocksRef.current.filter(activeRock)
      const botBodies = botsRef.current.units.filter(bot => bot.health > 0)
      const securityMap = { ...cavernMap, obstacles: [...cavernMap.obstacles, ...havenColliders(havenPose(expeditionRef.current))] }
      const botCues = stepBots(botsRef.current, expeditionRef.current, {
        dt, ship, map: securityMap, bodies: [...rocksRef.current, ...cargoBodies(expeditionRef.current,runtimeRef.current)],
        towed: harpoonRef.current.state === 'attached' ? harpoonRef.current.rock : undefined,
        shipSafe: riding || (havenReady(expeditionRef.current) && Math.hypot(ship.pos.x-havenPosition(expeditionRef.current).x,ship.pos.y-havenPosition(expeditionRef.current).y)<MINING_BASE_RADIUS),
      })
      for (const cue of botCues) if (Math.hypot(cue.pos.x-ship.pos.x,cue.pos.y-ship.pos.y)<650) sounds.botCue(cue.kind)
      for (const bot of botBodies) if (Math.hypot(bot.pos.x-ship.pos.x,bot.pos.y-ship.pos.y)<750) debrisRef.current.push(...stepBotSparks(bot,dt))
      for (const impact of stepSecurityShots(botsRef.current,dt,securityMap,[...(riding ? [] : [ship]),...rocksRef.current,...cargoBodies(expeditionRef.current,runtimeRef.current),...botBodies])) {
        createDebris(impact.pos.x,impact.pos.y,0,0,3,.2,'255, 162, 125')
        if (impact.target === ship) applyImpactShield(80)
        else if (impact.target?.botId) hitBot(impact.target as StationBot,1)
        else if (impact.target && rocksRef.current.includes(impact.target as Rock)) hitRockLikeShipWeapon(impact.target as Rock,impact.direction)
        else if (impact.target && !impact.target.anchored && !impact.target.retrieving) {
          impact.target.vel.x += impact.direction.x*45; impact.target.vel.y += impact.direction.y*45
        }
      }
      if (gameStateRef.current !== 'playing') return

      // Processing and repairs work only while the recovery ring is deployed.
      {
        const baseX = havenPosition(expeditionRef.current).x
        const baseY = havenPosition(expeditionRef.current).y

        if (havenReady(expeditionRef.current)) updateBaseDefenseAndProcessing({
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
          expedition: expeditionRef.current,
          waveCreditsRef,
          createDebris,
          onRedRockDetonate: (rock) => armRedRock(rock),
        })
        if (gameStateRef.current !== 'playing') return
        {
          const state = expeditionRef.current, rt = runtimeRef.current
          state.shields = shieldsRef.current
          const fullyInside = !riding && havenReady(state) && dockingReadiness(ship, havenPosition(state)) === 'ready'
          shipFullyInBaseRef.current = fullyInside
          if (!fullyInside) {
            shipRepairTimeRef.current = 0
          } else {
            shipRepairTimeRef.current += dt
            if (shipRepairTimeRef.current >= SHIELD_REPAIR_TIME) {
              shipRepairTimeRef.current = SHIELD_REPAIR_TIME

              if (restoreShipSystems(state)) {
                shieldsRef.current = state.shields
                setShields(shieldsRef.current)
                lastShieldRechargeAtRef.current = Date.now()
                sounds.shieldCharge()
                publishExpedition()
              }
              if (state.credits > 0) {
                const deposited = bankCarriedCredits(state)
                sounds.collect()
                publishExpedition(`+${deposited} banked`)
              }
              if (invulnerableRef.current < INVULNERABILITY_MIN_AFTER_REPAIR) invulnerableRef.current = INVULNERABILITY_MIN_AFTER_REPAIR
            }
          }
          if (stepRemoteRecharge(state, dt)) {
            shieldsRef.current = state.shields
            setShields(shieldsRef.current)
            lastShieldRechargeAtRef.current = Date.now()
            sounds.shieldCharge()
            invulnerableRef.current = Math.max(invulnerableRef.current, INVULNERABILITY_MIN_AFTER_REPAIR)
            publishExpedition()
          }
          rt.recharging = state.remoteRechargeRemaining > 0 || (fullyInside && needsRecharge(state) && shipRepairTimeRef.current < SHIELD_REPAIR_TIME)
          rt.rechargeProgress = state.remoteRechargeRemaining > 0 ? 1 - state.remoteRechargeRemaining / SHIELD_REPAIR_TIME : shipRepairTimeRef.current / SHIELD_REPAIR_TIME
        }
      }

      updateHarpoon({
        dt,
        w,
        h,
        ship,
        shipRef,
        rocks: [...rocks.filter(rock => !rock.socketId), ...cargoBodies(expeditionRef.current, runtimeRef.current).filter(body => !body.retrieving && (body.cargoId !== 'core' || coreReleased(expeditionRef.current))), ...botBodies.filter(bot=>bot.health>0 && !bot.anchored), ...TERMINALS].filter(body => Math.hypot(ship.pos.x-body.pos.x,ship.pos.y-body.pos.y) < 700 && (body.terminalId ? terminalVisible(ship.pos,body,cavernMap) : visibleBetween(ship.pos, body.pos, cavernMap))),
        harpoonRef,
        wrapX,
        wrapY,
        toroidalDelta,
        buildRopeBetween,
        HARPOON_HOOK_MASS,
        HARPOON_VISUAL_SLACK,
        HARPOON_REEL_MIN_LEN,
      })

      resolveCircleInCavern(ship.pos, ship.vel, ship.radius, 0.42, cavernMap)
      for (const rock of rocks) if (!rock.socketId) resolveCircleInCavern(rock.pos, rock.vel, rock.radius, 0.5, cavernMap)
      const updatedHarpoon = harpoonRef.current
      if (updatedHarpoon.state === 'flying' || updatedHarpoon.state === 'deployed') {
        const hookWallHit = resolveCircleInCavern(
          updatedHarpoon.pos,
          updatedHarpoon.vel,
          HARPOON_HOOK_RADIUS,
          0.15,
          cavernMap,
        )
        if (hookWallHit.collided && updatedHarpoon.state === 'flying') {
          harpoonRef.current = { ...updatedHarpoon, state: 'deployed' }
        }
      }

      // Phaser (SPACE): hold-to-fire beam with energy + cooldown.
      {
        const wantFire = keysRef.current.has(' ')

        // Recharge while not firing (unless in cooldown).
        if (phaser.cooldownMs <= 0 && !wantFire && phaser.energyMs < phaserCapacity) {
          phaser.energyMs = Math.min(phaserCapacity, phaser.energyMs + dt * 1000)
        }

        const canFire = wantFire && phaser.cooldownMs <= 0 && phaser.energyMs > 0
        if (canFire) {
          if (!phaserBeamRef.current.active) sounds.startPhaser()
          phaser.energyMs = Math.max(0, phaser.energyMs - dt * 1000)

          const ux = Math.cos(ship.angle)
          const uy = Math.sin(ship.angle)
          let len = raycastCavern(ship.pos, { x: ux, y: uy }, PHASER_RANGE, cavernMap)
          for (const body of cargoBodies(expeditionRef.current, runtimeRef.current)) {
            const hit = rayCircleHitDistance(ship.pos, { x: ux, y: uy }, len, body.pos, body.radius + PHASER_BEAM_RADIUS)
            if (hit != null) len = Math.min(len, hit)
          }
          for (const rock of [...rocksRef.current,...botBodies.filter(bot=>bot.health>0 && !bot.anchored)]) {
            const hit = rayCircleHitDistance(ship.pos, { x: ux, y: uy }, len, rock.pos, rock.radius + PHASER_BEAM_RADIUS)
            if (hit != null) len = Math.min(len, hit)
          }

          phaserBeamRef.current = {
            active: true,
            start: { x: ship.pos.x, y: ship.pos.y },
            direction: { x: ux, y: uy },
            length: len,
            energy01: clamp(phaser.energyMs / (phaserCapacity), 0, 1),
          }

          {
            // Find the nearest rock before the beam meets the cavern wall.
            let bestRock: TetherBody | undefined
            let bestT = Infinity

            for (const rock of [...rocksRef.current,...botBodies.filter(bot=>bot.health>0 && !bot.anchored)]) {
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

            const impactMs = laserImpactMs(expeditionRef.current)
            if (stepLaserContact(laserContactRef.current, bestRock, dt, impactMs) && bestRock) {
              if (bestRock.botId) hitBot(bestRock as StationBot,BOT_LASER_DAMAGE)
              else hitRockLikeShipWeapon(bestRock as Rock, { x: ux, y: uy })
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
          stepLaserContact(laserContactRef.current, undefined, 0, laserImpactMs(expeditionRef.current))
          sounds.stopPhaser()
          phaserBeamRef.current = {
            ...phaserBeamRef.current,
            active: false,
            energy01: clamp(phaser.energyMs / (phaserCapacity), 0, 1),
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
          return p.life > 0 && isInsideCavern(p.pos, 0, cavernMap)
        })
      }

      // Drive the repair hum from simulation state (not rendering).
      const isHealing = runtimeRef.current.recharging
      if (isHealing) sounds.startRepairHum()
      else sounds.stopRepairHum()

      blasterRef.current.bursts = blasterRef.current.bursts.filter(burst => { burst.life -= dt; return burst.life > 0 })
      const blasterStep = stepBlaster(blasterRef.current.shots, dt, cavernMap, [...rocksRef.current, ...cargoBodies(expeditionRef.current, runtimeRef.current),...botBodies.filter(bot=>bot.health>0 && !bot.anchored)])
      blasterRef.current.shots = blasterStep.shots
      for (const impact of blasterStep.impacts) {
        blasterRef.current.bursts.push({ pos: impact.pos, life: 0.28 })
        createDebris(impact.pos.x, impact.pos.y, 0, 0, 18, 0.7, '255, 76, 64')
        sounds.explosion('medium')
        if (blastGate(expeditionRef.current, impact.pos, BLASTER_BLAST_RADIUS)) publishExpedition('Blast door breached.')
        const impactMap = expeditionMap(expeditionRef.current)
        for (const bot of botBodies) if (bot.health > 0 && (bot === impact.target || (Math.hypot(bot.pos.x-impact.pos.x,bot.pos.y-impact.pos.y)<BLASTER_BLAST_RADIUS+bot.radius && visibleBetween(impact.pos,bot.pos,impactMap)))) hitBot(bot,BOT_BLASTER_DAMAGE)
        for (const rock of [...rocksRef.current]) {
          if (rock.socketId) continue
          const distance = Math.hypot(rock.pos.x - impact.pos.x, rock.pos.y - impact.pos.y)
          if (rock === impact.target || (distance < BLASTER_BLAST_RADIUS + rock.radius && visibleBetween(impact.pos, rock.pos, impactMap))) {
            const direction = distance > 1e-6 ? { x: rock.pos.x - impact.pos.x, y: rock.pos.y - impact.pos.y } : impact.direction
            const push = 320 * Math.max(0.25, 1 - distance / (BLASTER_BLAST_RADIUS + rock.radius))
            if (rock.sourceId) repelBlueBody(rock, direction, push)
            else if (pulverizeAsteroid(rocksRef.current, rock)) {
              rewardAsteroid(rock)
              releaseHarpoonIfAttached(rock)
              createDebris(rock.pos.x, rock.pos.y, rock.vel.x, rock.vel.y, 18, 0.6, rock.kind === 'blue' ? '80, 160, 255' : '200, 200, 190')
            }
          }
        }
      }

      updateBulletsAndPlayerRockCollisions({
        dt,
        w,
        h,
        bulletsRef,
        rocksRef,
        harpoonRef,
        shipRef,
        cavernMap,
        toroidalDelta,
        buildRopeBetween,
        sounds,
        onRedRockDetonate: (rock) => armRedRock(rock),
        onAsteroidDestroyed: rewardAsteroid,
        fragmentKind: fragmentKindFor,
        createRock,
        createDebris,
        levelRef,
        blueRocksSpawnedThisLevelRef,
        blueRockQuotaRef,
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

      if (gameStateRef.current !== 'playing') return
      const rt = runtimeRef.current, state = expeditionRef.current
      rt.havenImpact = Math.max(0,(rt.havenImpact ?? 0)-dt*4)
      rt.havenImpactCooldown = Math.max(0,(rt.havenImpactCooldown ?? 0)-dt)
      const pose = havenPose(state,miningBaseAngleRef.current)
      const previousRadio = rt.radio?.id
      const wasComplete = state.complete
      const events = stepExpedition(state, rt, {
        dt, ship, rocks: rocksRef.current, harpoon: harpoonRef.current, beam: phaserBeamRef.current, aboard:riding,
        extraBodies: botBodies.filter(bot=>bot.health>0 && !bot.anchored),
        havenMotion:{ previous:previousHaven,current:pose,dt },
        onContact: contact => {
          for (const body of [contact.body,contact.other]) if (body?.kind === 'red') armRedRock(body as Rock)
          for (const body of [contact.body,contact.other]) if (body?.botId && contact.speed>115 && (body as StationBot).stun<=0) hitBot(body as StationBot,contact.speed>230 ? 2 : 1)
          if (contact.surface !== 'haven') return
          const body=contact.body,point=contact.point!
          if ('angVel' in body && contact.speed>20) {
            const rock=body as Rock
            rock.angVel[2]+=Math.max(-.7,Math.min(.7,((point.x-rock.pos.x)*rock.vel.y-(point.y-rock.pos.y)*rock.vel.x)/Math.max(1,rock.radius*rock.radius)*.02))
          }
          if (contact.speed>22) {
            rt.havenImpact=Math.min(1,contact.speed/180)
            if (state.campaign.journey) state.campaign.journey.speed=Math.max(0,state.campaign.journey.speed-Math.min(9,contact.speed*.035))
            if (!rt.havenImpactCooldown && Math.hypot(ship.pos.x-pose.pos.x,ship.pos.y-pose.pos.y)<800) {
              sounds.havenImpact(contact.speed)
              createDebris(point.x,point.y,body.vel.x*.2,body.vel.y*.2,3,.22,'185, 205, 190')
              rt.havenImpactCooldown=.16
            }
          }
        },
      })
      playRecoveryCues()
      if (rt.radio && rt.radio.id !== previousRadio && !events.length) sounds.collect()
      if (riding) {
        ship.pos={...havenPosition(state)};ship.vel={x:0,y:0}
        if (havenArrived) {
          bankAtCheckpoint(state,'haven');shieldsRef.current=state.shields;setShields(state.shields)
          setGameStateWithRef('docked');publishExpedition('Haven secured')
        }
      }
      const tether = harpoonRef.current
      if (tether.state === 'attached' && (tether.rock.socketId || tether.rock.retrieving || ![...rocksRef.current, ...cargoBodies(expeditionRef.current, runtimeRef.current), ...botBodies.filter(bot=>bot.health>0 && !bot.anchored), ...TERMINALS].some(body => body === tether.rock))) retractTether()
      if (runtimeRef.current.impactSpeed > 0) applyImpactShield(runtimeRef.current.impactSpeed)
      resolveCircleInCavern(ship.pos, ship.vel, ship.radius, 0.42, cavernMap)
      if (gameStateRef.current !== 'playing' && !(riding && havenArrived)) return
      expeditionRef.current.position = { ...ship.pos }
      expeditionRef.current.shields = shieldsRef.current
      snapshotCargo(expeditionRef.current, runtimeRef.current, rocksRef.current)
      if (!wasComplete && state.complete) {
        keysRef.current.clear();retractTether()
        phaserBeamRef.current.active=false
        sounds.stopThrust();sounds.stopPhaser();sounds.stopRadiation();sounds.collect()
        setGameStateWithRef('complete');publishExpedition('Orison awakening bus online')
        return
      }
      if (events.length) { sounds.collect(); publishExpedition(events[events.length - 1]) }
      else if (asteroidRewarded || expeditionRef.current.banked !== initialBanked) publishExpedition()
      hudTimerRef.current += dt
      saveTimerRef.current += dt
      if (hudTimerRef.current >= 0.15) {
        hudTimerRef.current = 0
        setHud({ room: riding ? 'Haven · in transit' : sectorAt(ship.pos)?.name ?? 'Transit tunnels', prompt: interaction(expeditionRef.current, ship)?.label ?? '', message: runtimeRef.current.messageTime > 0 ? runtimeRef.current.message : '', towing: runtimeRef.current.towing ?? '', radio:runtimeRef.current.radio?.id ?? '', grappleHint:runtimeRef.current.grappleHint ?? '' })
        setExpedition({ ...expeditionRef.current })
      }
      if (saveTimerRef.current > 3) { saveTimerRef.current = 0; setSaveAvailable(saveExpedition(expeditionRef.current)) }
    }

    const draw = () => {
      const gameState = gameStateRef.current

      drawHardVacuumFrame({
        ctx,
        gameState,
        level: levelRef.current,
        expedition: expeditionRef.current,
        expeditionRuntime: runtimeRef.current,
        mapOpen: mapOpenRef.current,
        mapOverview: mapOverviewRef.current,
        mapZoom: mapZoomRef.current,
        mapFocus: mapFocusRef.current,
        // Use the same state as the dev panel; restarting this effect on a
        // toggle keeps the animation loop from retaining an older reveal value.
        mapRevealed: import.meta.env.DEV && devMapRevealed,
        canvasSizeRef,
        miningBaseAngleRef,
        RED_ROCK_DETONATION_DELAY,
        baseShotsRef,
        rocksRef,
        bots: botsRef.current,
        bulletsRef,
        blasterRef,
        phaserBeamRef,
        phaserParticlesRef,
        debrisRef,
        harpoonRef,
        shipRef,
        shipAppearance:shipAppearanceRef.current,
        shields: shieldsRef.current,
        lastShieldHitAtRef,
        lastShieldRechargeAtRef,
        toroidalDelta,
      })
    }

    let rafId: number | null = null
    let disposed = false
    const animate = (timestamp: number) => {
      if (disposed) return
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 1 / 30)
      lastTimeRef.current = timestamp

      update(dt)
      if (!devOpenRef.current && gameStateRef.current === 'playing' && !mapOpenRef.current && !expeditionRef.current.campaign.journey?.riding) {
        stepShipAppearance(shipAppearanceRef.current,keysRef.current,dt,shipRef.current.angularVelocity)
        const controls=flightInput(keysRef.current)
        if (controls.forward||controls.reverse) sounds.startThrust()
        else if (shipAppearanceRef.current.turn!==0) sounds.startThrust(0.25)
        else sounds.stopThrust()
        debrisRef.current.push(...stepHullSparks(shipAppearanceRef.current,shipRef.current,shieldsRef.current,dt))
      } else {
        shipAppearanceRef.current.turn=0
        sounds.stopThrust()
        if (!devOpenRef.current && gameStateRef.current !== 'paused') {
          stepShipAppearance(shipAppearanceRef.current,new Set(),dt)
          shipAppearanceRef.current.sparkDelay=0
        }
      }
      draw()

      if (!disposed) rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)

    return () => {
      disposed = true
      window.removeEventListener('resize', resize)
      if (rafId != null) cancelAnimationFrame(rafId)
      sounds.stopRepairHum(true)
      sounds.stopRadiation()
    }
  }, [createRock, createDebris, publishExpedition, retractTether, buildRopeBetween, toroidalDelta, HARPOON_HOOK_MASS, HARPOON_REEL_MIN_LEN, setGameStateWithRef, devMapRevealed])

  useEffect(() => {
    if (gameState === 'playing' && !mapOpen && !devOpen) canvasRef.current?.focus({ preventScroll: true })
    keysRef.current.clear()
  }, [gameState, mapOpen, devOpen])

  const exitToGameSelect = () => {
    saveExpedition(expeditionRef.current)
    sounds.stopThrust()
    sounds.stopStoreMusic()
    sounds.stopRadiation()
    onExit()
  }

  const setVirtualKey = (key: string, pressed: boolean) => {
    if (pressed) keysRef.current.add(key)
    else {
      keysRef.current.delete(key)
      if (key === ' ') laserContactRef.current = { elapsedMs: 0 }
    }
  }

  const tapVirtualKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key }))
  }

  const holdControl = (key: string): ButtonHTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: event => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setVirtualKey(key, true)
    },
    onPointerUp: () => setVirtualKey(key, false),
    onPointerCancel: () => setVirtualKey(key, false),
    onLostPointerCapture: () => setVirtualKey(key, false),
    onKeyDown: event => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      setVirtualKey(key, true)
    },
    onKeyUp: event => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      setVirtualKey(key, false)
    },
    onBlur: () => setVirtualKey(key, false),
  })

  const holdButtonClass =
    'touch-none select-none min-w-12 w-12 h-12 sm:min-w-16 sm:w-16 sm:h-16 rounded-full border-2 border-white/45 bg-black/65 text-white text-xl font-bold active:border-[#00ff88] active:bg-[#00ff88]/30'

  return (
    <div className="hard-vacuum relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} tabIndex={-1} aria-label="Hard Vacuum flight controls: WASD, O K L semicolon, or arrows to fly, Space for laser, B for blaster, F to tether, R to recharge, T to teleport, E to dock, M for map, G for log, P to pause" className="absolute inset-0 outline-none" />

      <div hidden={devOpen} inert={devOpen}>
      <ExpeditionHud state={expedition} gameState={gameState} shields={shields} hud={hud} mapOpen={mapOpen} onJournal={() => tapVirtualKey('g')} onMap={() => setSurveyOpen(!mapOpenRef.current)} onInteract={interact} onBlaster={shootBlaster} onRecharge={rechargeRemotely} onTeleport={teleportHome} onPause={() => tapVirtualKey('p')} />

      {gameState === 'playing' && !mapOpen && (
        <div className="absolute inset-x-0 bottom-4 z-30 flex items-end justify-between px-4 lg:hidden pointer-events-none">
          <div className="flex items-end gap-2 pointer-events-auto">
            <button
              type="button"
              aria-label="Rotate left"
              aria-keyshortcuts="A K ArrowLeft"
              className={holdButtonClass}
              {...holdControl('arrowleft')}
            >
              ↶<kbd className="block text-[9px] leading-3 font-normal">A</kbd>
            </button>
            <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-label="Thrust"
              aria-keyshortcuts="W O ArrowUp"
              className={holdButtonClass}
              {...holdControl('arrowup')}
            >
              ↑<kbd className="block text-[9px] leading-3 font-normal">W</kbd>
            </button>
            <button
              type="button"
              aria-label="Nose thruster / brake"
              aria-keyshortcuts="S L ArrowDown"
              className={`${holdButtonClass} text-xs`}
              {...holdControl('arrowdown')}
            >
              ↓<kbd className="block text-[9px] leading-3 font-normal">S</kbd>
            </button>
            </div>
            <button
              type="button"
              aria-label="Rotate right"
              aria-keyshortcuts="D ; ArrowRight"
              className={holdButtonClass}
              {...holdControl('arrowright')}
            >
              ↷<kbd className="block text-[9px] leading-3 font-normal">D</kbd>
            </button>
          </div>

          <div className="flex items-end gap-3 pointer-events-auto">
            {expedition.blasterInstalled && <button type="button" aria-label={`Fire blaster, ${expedition.blasterCharges} of 3 charges`} aria-keyshortcuts="B" className={`${holdButtonClass} text-[10px] text-[#ff665e] border-[#ff665e]/70`} onClick={shootBlaster}>
              <span className="underline underline-offset-2">B</span>LAST<br />{expedition.blasterCharges}/3
            </button>}
            <button
              type="button"
              aria-label="Fire harpoon"
              aria-keyshortcuts="F"
              className={`${holdButtonClass} text-xs text-[#00ff88]`}
              onClick={() => tapVirtualKey('f')}
            >
              HOOK<kbd className="block text-[9px] leading-3 font-normal">F</kbd>
            </button>
            <button
              type="button"
              aria-label="Fire laser"
              aria-keyshortcuts="Space"
              className={`${holdButtonClass} mb-12 text-xs text-[#44aaff]`}
              {...holdControl(' ')}
            >
              LASER<kbd className="block text-[9px] leading-3 font-normal">Space</kbd>
            </button>
          </div>
        </div>
      )}

      <div hidden={mapOpen} inert={mapOpen}>
      <ExpeditionOverlay
        gameState={gameState} state={expedition} hasSave={hasSave} saveAvailable={saveAvailable}
        lostCredits={lostCredits}
        onStart={() => startGame(false)} onNew={() => startGame(true)} onBuy={buyUpgrade}
        onBuySupply={buySupply}
        onRelocate={relocateHaven}
        journalOpen={journalOpen} onJournal={() => setJournalOpen(true)} onCloseJournal={() => setJournalOpen(false)}
        onResume={resumeFlight}
        onMenu={() => setGameStateWithRef('menu')} onExit={exitToGameSelect}
      />
      </div>
      {mapOpen && <StationSurveyControls overview={mapOverview} zoom={mapZoom} onZoom={toggleMapZoom} onPan={panSurvey} onOverview={toggleOverview} onClose={() => setSurveyOpen(false)} />}
      </div>
      {import.meta.env.DEV && devOpen && <DevelopmentPanel current={regionForRoom(sectorAt(expedition.position)?.id)?.id} banked={expedition.banked} mapRevealed={devMapRevealed}
        onLevel={jumpToDevelopmentLevel} onCredits={grantDevelopmentCredits} onRevealMap={toggleDevelopmentMap} onClose={() => setDevelopmentOpen(false)} />}
    </div>
  )
}
