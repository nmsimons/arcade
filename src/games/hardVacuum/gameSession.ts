import { worldDelta } from './worldDelta.ts'
import type {
  BaseShot,
  Bullet,
  Debris,
  Harpoon,
  PhaserBeam,
  PhaserParticle,
  Rock,
  RockKind,
  Ship,
  TetherBody,
  Vector2,
  V3,
} from './types.ts'
import { clamp, makeRockMesh } from './math.ts'
import { rayCircleHitDistance } from './phaserGeometry.ts'
import {
  DEMO_CENTER,

  getDemoCavernMap,
  isInsideCavern,
  raycastCavern,
  resolveCircleInCavern,
} from './worldGeometry.ts'
import type { sounds as BrowserSounds } from './sound.ts'
import {
  BASE_GUN_INITIAL_COOLDOWNS,
  BASE_SHOT_SPEED,

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

  SHIELD_REPAIR_TIME,
} from './tuning.ts'
import { addDevelopmentCredits, advanceDevelopmentLevel } from './development.ts'
import { TERMINALS, terminalVisible } from './terminals.ts'
import { coreReleased, havenPose, havenPosition, havenReady, launchHaven, moveHaven, settleHaven, stepHaven } from './campaign.ts'
import { havenLinkTargets, retireHavenLink, stepHavenLinkRetraction } from './havenActivation.ts'
import type { BerthId } from './campaignWorld.ts'
import { IGNITION_CRADLE } from './campaignWorld.ts'
import type { HardVacuumGameState } from './ui.ts'
import { bankAtCheckpoint, bankCarriedCredits, blastGate, cargoBodies, checkpointPosition, crashExpedition, expeditionMap, newExpedition, freshRuntime, interaction, maxShields, purchaseUpgrade, powerCellSpawns, sectorAt, snapshotCargo, stepCargoRecovery, stepExpedition, teleportToHaven, visibleBetween } from './expedition.ts'
import { BLASTER_BLAST_RADIUS, fireBlaster, pulverizeAsteroid, stepBlaster } from './blaster.ts'
import type { BlasterVisuals } from './blaster.ts'
import { angleDelta, dockingReadiness, driftCargo, repelBody, repelBlueBody, stepShipMovement } from './expeditionPhysics.ts'
import { SimulationClock } from './simulationClock.ts'
import { laserImpactMs, stepLaserContact } from './laser.ts'
import type { LaserContact } from './laser.ts'
import { freshRadiationFeedback, inRadiation, stepRadiation, stepRadiationFeedback, stepRadiationRecharge } from './radiation.ts'
import { needsRecharge, restoreShipSystems } from './supplies.ts'
import { creditAsteroidDestruction } from './oreCredits.ts'
import { debrisField, fragmentKindFor, fragmentProfileAt } from './debrisField.ts'
import { BOT_BLASTER_DAMAGE, BOT_LASER_DAMAGE, damageBot, freshBots, stepBots, stepBotSparks, stepSecurityShots } from './stationBots.ts'
import type { StationBot } from './stationBots.ts'
import { havenColliders } from './havenGeometry.ts'
import { laserCapacityMs, tetherReachMultiplier, upgradeOffer, SHIP_UPGRADES } from './upgrades.ts'
import type { ShipUpgrade } from './upgrades.ts'
import { freshShipAppearance } from './shipAppearance.ts'
import { updateBaseDefenseAndProcessing } from './baseDefense.ts'
import { updateHarpoon } from './harpoon.ts'
import { updateBulletsAndPlayerRockCollisions } from './bullets.ts'

import { seededRandom } from './random.ts'
import { identifyBody, isRock } from './bodyDefinitions.ts'
import { isStationBot } from './stationBots.ts'
import type { Expedition } from './expedition.ts'
import { neutralController, sanitizeController } from './flightInput.ts'
import type { ControllerFlightInput } from './flightInput'
import { freshTraining, populateTraining, stepTraining, stepTrainingEmitter, trainingExpedition, trainingMap, TRAINING_LOG } from './training.ts'
import { resolveWorldContacts } from './bodyCollisions.ts'
type SessionAudio = Pick<typeof BrowserSounds, 'blaster' | 'stopThrust' | 'stopPhaser' | 'stopRadiation' | 'teleport' | 'collect' | 'init' | 'stopStoreMusic' | 'havenRecovery' | 'explosion' | 'shieldHit' | 'radiationTick' | 'botCue' | 'shieldCharge' | 'startPhaser' | 'startRepairHum' | 'stopRepairHum' | 'havenImpact'>
export type SessionAudioEvent = { [K in keyof SessionAudio]: { type: 'audio'; name: K; args: Parameters<SessionAudio[K]> } }[keyof SessionAudio]

export type SessionEvent = SessionAudioEvent | { type: 'hud' | 'state' | 'persist' } | { type: 'notification'; message: string }
export type GameCommand =
  | { type: 'start'; fresh?: boolean }
  | { type: 'load'; expedition: Expedition }
  | { type: 'key'; key: string; pressed: boolean }
  | { type: 'controller'; input: ControllerFlightInput }
  | { type: 'suspend'; suspended: boolean }
  | { type: 'pause' | 'resume' | 'menu' | 'blaster' | 'teleport' | 'tether' | 'interact' | 'credits' | 'launch' }
  | { type: 'jump' | 'relocate'; berth: BerthId }
  | { type: 'upgrade'; id: ShipUpgrade }
const cell = <T>(current: T) => ({ current })

/** Authoritative state, transitions, commands and update order, independent of browser services. */
export function createGameSession(initial: Expedition = newExpedition(), options: { seed?: number; cosmeticRandom?: () => number; training?: boolean } = {}) {
  const training = !!options.training
  const trainingRef = cell(freshTraining())
  const expedition = training ? trainingExpedition() : structuredClone(initial)
  const expeditionRef = cell(expedition)
  const runtimeRef = cell(freshRuntime())
  const worldMap = () => training ? trainingMap(trainingRef.current.door) : expeditionMap(expeditionRef.current)
  const worldCargo = () => training ? [] : cargoBodies(expeditionRef.current, runtimeRef.current)
  const worldLinks = () => training ? [] : havenLinkTargets(expeditionRef.current, runtimeRef.current)
  const worldTerminals = () => training ? [trainingRef.current.terminal] : TERMINALS
  const gameStateRef = cell<HardVacuumGameState>('menu')
  const shieldsRef = { get current() { return expeditionRef.current.shields }, set current(value: number) { expeditionRef.current.shields = value } }

  const simulationClock = new SimulationClock()
  const random = seededRandom(options.seed ?? 1)
  const cosmeticRandom = options.cosmeticRandom ?? Math.random
  const events: SessionEvent[] = []
  let timeMs = 0, hudElapsed = 0, saveElapsed = 0, lostCredits = 0, suspended = false
  const setLostCredits = (value: number) => { lostCredits = value }
  const setGameStateWithRef = (next: HardVacuumGameState) => {
    controllerRef.current = neutralController()
    simulationClock.reset()
    gameStateRef.current = next
    events.push({ type: 'state' })
    if (next === 'menu') stageMenuScene()
    else if (!training) events.push({ type: 'persist' })
  }
  const publishExpedition = (message?: string) => {
    if (message) {
      runtimeRef.current.message = message; runtimeRef.current.messageTime = 2.5
      events.push({ type: 'notification', message })
    }
  }
  const sounds: SessionAudio = {
    blaster: (...args) => { events.push({ type: 'audio', name: 'blaster', args }) },
    stopThrust: (...args) => { events.push({ type: 'audio', name: 'stopThrust', args }) },
    stopPhaser: (...args) => { events.push({ type: 'audio', name: 'stopPhaser', args }) },
    stopRadiation: (...args) => { events.push({ type: 'audio', name: 'stopRadiation', args }) },
    teleport: (...args) => { events.push({ type: 'audio', name: 'teleport', args }) },
    collect: (...args) => { events.push({ type: 'audio', name: 'collect', args }) },
    init: (...args) => { events.push({ type: 'audio', name: 'init', args }) },
    stopStoreMusic: (...args) => { events.push({ type: 'audio', name: 'stopStoreMusic', args }) },
    havenRecovery: (...args) => { events.push({ type: 'audio', name: 'havenRecovery', args }) },
    explosion: (...args) => { events.push({ type: 'audio', name: 'explosion', args }) },
    shieldHit: (...args) => { events.push({ type: 'audio', name: 'shieldHit', args }) },
    radiationTick: (...args) => { events.push({ type: 'audio', name: 'radiationTick', args }) },
    botCue: (...args) => { events.push({ type: 'audio', name: 'botCue', args }) },
    shieldCharge: (...args) => { events.push({ type: 'audio', name: 'shieldCharge', args }) },
    startPhaser: (...args) => { events.push({ type: 'audio', name: 'startPhaser', args }) },
    startRepairHum: (...args) => { events.push({ type: 'audio', name: 'startRepairHum', args }) },
    stopRepairHum: (...args) => { events.push({ type: 'audio', name: 'stopRepairHum', args }) },
    havenImpact: (...args) => { events.push({ type: 'audio', name: 'havenImpact', args }) },
  }
  const SHIP_RADIUS = 15
  const SMALLEST_ROCK_RADIUS = 20
  const HARPOON_REEL_SPEED = 440
  const HARPOON_VISUAL_SLACK = 1.18
  const HARPOON_HOOK_RADIUS = 5
  const HARPOON_HOOK_MASS = Math.max(0.2, (HARPOON_HOOK_RADIUS / 18) * (HARPOON_HOOK_RADIUS / 18))
  const HARPOON_REEL_MIN_LEN = SHIP_RADIUS + HARPOON_HOOK_RADIUS + 2
  const MINING_ROT_SPEED = 0.18
  const shipRef = cell<Ship>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, radius: SHIP_RADIUS })
  const rocksRef = cell<Rock[]>([])
  const botsRef = cell(freshBots(expedition))

  const shipRepairTimeRef = cell(0)
  const bulletsRef = cell<Bullet[]>([])
  const blasterRef = cell<BlasterVisuals>({ shots: [], bursts: [] })
  const laserContactRef = cell<LaserContact>({ elapsedMs: 0 })
  const baseShotsRef = cell<BaseShot[]>([])
  const debrisRef = cell<Debris[]>([])
  const keysRef = cell<Set<string>>(new Set())
  const controllerRef = cell(neutralController())
  const invulnerableRef = cell(0)
  const lastShieldHitAtRef = cell(-Infinity)
  const lastShieldRechargeAtRef = cell(-Infinity)
  const dyingTimerRef = cell(0)

  const harpoonRef = cell<Harpoon>({ state: 'idle' })
  const miningBaseAngleRef = cell(0)
  const shipAppearanceRef = cell(freshShipAppearance())
  const miningGunCooldownsRef = cell<[number, number, number]>(BASE_GUN_INITIAL_COOLDOWNS)
  const phaserStateRef = cell<{ energyMs: number; cooldownMs: number; particleCarry: number }>({
    energyMs: laserCapacityMs(expedition),
    cooldownMs: 0,
    particleCarry: 0,
  })
  const phaserBeamRef = cell<PhaserBeam>({
    active: false,
    start: { x: 0, y: 0 },
    direction: { x: 1, y: 0 },
    length: 0,
    energy01: 1,
  })
  const phaserParticlesRef = cell<PhaserParticle[]>([])
  const shipFullyInBaseRef = cell(false)

  const buildRopeBetween = (ax: number, ay: number, bx: number, by: number, ropeLen: number) => {
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
    }

  const createRock = (x: number, y: number, radius: number, velOverride?: Vector2, kind: RockKind = 'normal'): Rock => {
    const points: Vector2[] = []
    const vertices = 8 + Math.floor(cosmeticRandom() * 4)
    for (let i = 0; i < vertices; i++) {
      const angle = (i / vertices) * Math.PI * 2
      const variance = 0.7 + cosmeticRandom() * 0.6
      points.push({
        x: Math.cos(angle) * radius * variance,
        y: Math.sin(angle) * radius * variance,
      })
    }

    const angle = random() * Math.PI * 2
    const speed = ROCK_BASE_SPEED_MIN + random() * (ROCK_BASE_SPEED_MAX - ROCK_BASE_SPEED_MIN)

    // 3D tumbling: independent angular velocity per axis.
    // Smaller rocks tend to tumble faster.
    const spinBase = 0.9 + 42 / Math.max(18, radius)
    const seed = cosmeticRandom() * 10000
    const angVel: V3 = [
      (cosmeticRandom() - 0.5) * spinBase,
      (cosmeticRandom() - 0.5) * spinBase,
      (cosmeticRandom() - 0.5) * spinBase,
    ]

    return identifyBody<Rock>({
      pos: { x, y },
      vel: velOverride ?? { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      radius,
      points,
      rot: [cosmeticRandom() * Math.PI * 2, cosmeticRandom() * Math.PI * 2, cosmeticRandom() * Math.PI * 2],
      angVel,
      mesh: makeRockMesh(radius, seed),
      kind,
      fragmentRates: fragmentProfileAt({x,y}),
    }, { type: 'asteroid' })
    }

  const createDebris = (
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
        const angle = (i / count) * Math.PI * 2 + cosmeticRandom() * 0.5
        const speed = DEBRIS_SPEED_MIN + cosmeticRandom() * (DEBRIS_SPEED_MAX - DEBRIS_SPEED_MIN)
        debris.push({
          pos: { x, y },
          vel: { x: velX + Math.cos(angle) * speed, y: velY + Math.sin(angle) * speed },
          angle: cosmeticRandom() * Math.PI * 2,
          rotSpeed: (cosmeticRandom() - 0.5) * 10,
          life: (DEBRIS_LIFETIME_MIN + cosmeticRandom() * (DEBRIS_LIFETIME_MAX - DEBRIS_LIFETIME_MIN)) * lifeMult,
          length: 5 + cosmeticRandom() * 10,
          color,
        })
      }
      debrisRef.current = [...debrisRef.current, ...debris]
    }

  const populateExpedition = () => {
    if (training) { rocksRef.current=populateTraining(createRock); return }
    rocksRef.current = debrisField(expeditionRef.current).map(({ pos, radius, vel, kind }) => createRock(pos.x, pos.y, radius, vel, kind))
    const state = expeditionRef.current
    for (const cell of powerCellSpawns(state)) {
      const rock = createRock(cell.pos.x, cell.pos.y, 20, cell.vel, 'blue')
      identifyBody(rock, { type: 'cell', id: cell.sourceId }); rock.tethered = cell.tethered
      rocksRef.current.push(rock)
    }
    cargoBodies(state, runtimeRef.current)
  }

  const retractTether = () => {
    const hp = harpoonRef.current
    if (hp.state === 'idle' || hp.state === 'reeling') return
    if (hp.state==='attached' && hp.rock===runtimeRef.current.havenLink && retireHavenLink(expeditionRef.current,runtimeRef.current)) events.push({type:'persist'})
    const end = hp.state === 'attached' ? hp.rock.pos : hp.pos
    const ship = shipRef.current
    const reelLength = Math.hypot(end.x - ship.pos.x, end.y - ship.pos.y)
    const ropeLength = reelLength * HARPOON_VISUAL_SLACK
    harpoonRef.current = { state: 'reeling', pos: { ...end }, reelSpeed: HARPOON_REEL_SPEED, reelLength, ropeLength, ...buildRopeBetween(ship.pos.x, ship.pos.y, end.x, end.y, ropeLength) }
  }

  const shootBlaster = () => {
    if (gameStateRef.current !== 'playing' || suspended || expeditionRef.current.campaign.journey?.riding || !expeditionRef.current.blasterInstalled) return
    const shot = fireBlaster(expeditionRef.current, runtimeRef.current, shipRef.current)
    if (!shot) {
      if (expeditionRef.current.blasterCharges <= 0) publishExpedition('Blaster empty')
      return
    }
    blasterRef.current.shots.push(shot)
    shipRepairTimeRef.current = 0
    sounds.blaster()
    publishExpedition()
  }

  const teleportHome = () => {
    if (gameStateRef.current !== 'playing' || suspended) return
    const ship = shipRef.current, state = expeditionRef.current, rt = runtimeRef.current
    const from = { ...ship.pos }
    if (!teleportToHaven(state, ship)) return
    // Teleport the ship only. Released cargo stays in the world for later recovery.
    retractTether()
    harpoonRef.current = { state: 'idle' }
    rt.towing = undefined
    rt.teleport = { from, time: 0.6 }
    rt.radiation = freshRadiationFeedback()
    shipRepairTimeRef.current = 0
    keysRef.current.clear()
    phaserBeamRef.current.active = false
    controllerRef.current = neutralController()
    laserContactRef.current = { elapsedMs: 0 }
    sounds.stopThrust(); sounds.stopPhaser(); sounds.stopRadiation()
    shipAppearanceRef.current.turn=0
    sounds.teleport()
    snapshotCargo(state, rt, rocksRef.current)
    publishExpedition()
  }

  const resumeFlight = () => {

    keysRef.current.clear()
    if (gameStateRef.current === 'complete' && expeditionRef.current.campaign.journey?.departure) {
      settleHaven(expeditionRef.current)
      shipRef.current.pos={...havenPosition(expeditionRef.current)}
      shipRef.current.vel={x:0,y:0}
      expeditionRef.current.position={...shipRef.current.pos}
    }
    if (gameStateRef.current !== 'docked') {
      setGameStateWithRef('playing')
      return
    }
    const ship = shipRef.current
    const heading = miningBaseAngleRef.current + Math.PI
    const distance = 62
    runtimeRef.current.docking = { id: expeditionRef.current.checkpoint, phase: 'out', time: 0, from: { ...ship.pos }, to: { x: ship.pos.x + Math.cos(heading) * distance, y: ship.pos.y + Math.sin(heading) * distance }, angle: ship.angle, targetAngle: heading }
    setGameStateWithRef('docking')
  }

  const interact = () => {
    if (training) return
    if (gameStateRef.current !== 'playing' || suspended) return
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
  }

  const relocateHaven = (destination: BerthId) => {
    const state = expeditionRef.current
    if (gameStateRef.current !== 'docked' || !moveHaven(state, destination, true, expeditionMap(state), miningBaseAngleRef.current)) return
    retractTether(); harpoonRef.current = { state:'idle' }; baseShotsRef.current = []
    keysRef.current.clear(); phaserBeamRef.current.active = false
    setGameStateWithRef('playing'); publishExpedition('Haven departing')
  }

  const buyUpgrade = (id: ShipUpgrade) => {
    if (gameStateRef.current !== 'docked' || !SHIP_UPGRADES.includes(id)) return
    const offer = upgradeOffer(expeditionRef.current, id)
    if (!purchaseUpgrade(expeditionRef.current, id)) return
    shieldsRef.current = maxShields(expeditionRef.current)

    expeditionRef.current.shields = shieldsRef.current
    sounds.collect()
    phaserStateRef.current.energyMs = laserCapacityMs(expeditionRef.current)
    publishExpedition(`${offer.name} installed.`)
  }

  const startGame = (fresh = false) => {
    if (training) { expeditionRef.current=trainingExpedition();trainingRef.current=freshTraining() }
    else if (fresh) expeditionRef.current = newExpedition()
    random.reset()
    suspended = false
    botsRef.current = freshBots(expeditionRef.current)
    if (training) botsRef.current.units=[]
    runtimeRef.current = freshRuntime()
    shipAppearanceRef.current = freshShipAppearance()
    lastShieldHitAtRef.current = -Infinity
    lastShieldRechargeAtRef.current = -Infinity
    blasterRef.current = { shots: [], bursts: [] }
    laserContactRef.current = { elapsedMs: 0 }
    keysRef.current.clear()
    sounds.init()
    sounds.stopStoreMusic()
    const savedPosition = expeditionRef.current.position
    const spawn = isInsideCavern(savedPosition, 15, worldMap()) ? { ...savedPosition } : checkpointPosition(expeditionRef.current)
    shipRef.current = identifyBody({ pos: spawn, vel: { x: 0, y: 0 }, angle: Math.PI, angularVelocity: 0, radius: 15 }, { type: 'ship' })
    if (training) shipRef.current.angle=0
    rocksRef.current = []
    shipRepairTimeRef.current = 0
    bulletsRef.current = []
    baseShotsRef.current = []
    shieldsRef.current = Math.min(maxShields(expeditionRef.current), expeditionRef.current.shields)

    setGameStateWithRef(expeditionRef.current.complete ? 'complete' : 'playing')
    invulnerableRef.current = INVULNERABILITY_GAME_START

    debrisRef.current = []
    harpoonRef.current = { state: 'idle' }
    miningBaseAngleRef.current = expeditionRef.current.campaign.havenAngle
    miningGunCooldownsRef.current = BASE_GUN_INITIAL_COOLDOWNS
    phaserStateRef.current = { energyMs: laserCapacityMs(expeditionRef.current), cooldownMs: 0, particleCarry: 0 }
    phaserBeamRef.current = { active: false, start: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, length: 0, energy01: 1 }
    phaserParticlesRef.current = []
    populateExpedition()
    publishExpedition()
  }
  const stageMenuScene = () => {

    miningBaseAngleRef.current = expeditionRef.current.campaign.havenAngle
    debrisRef.current = []

    // Place ship in a dramatic but plausible position.
    const baseX = DEMO_CENTER.x
    const baseY = DEMO_CENTER.y
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
    processingRock.inBaseTime = 3

    const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)

    // Additional spaced rocks around the arena for an “in-progress” feel.
    const speedMult = 1.3
    const count = 6

    const sampleSpawn = () => {
      const angle = cosmeticRandom() * Math.PI * 2
      const distanceFromShip = 360 + cosmeticRandom() * 500
      const x = shipRef.current.pos.x + Math.cos(angle) * distanceFromShip
      const y = shipRef.current.pos.y + Math.sin(angle) * distanceFromShip
      const a = angle + Math.PI + (cosmeticRandom() - 0.5) * Math.PI * 0.7
      const speed = (20 + cosmeticRandom() * 30) * speedMult
      return { x, y, vel: { x: Math.cos(a) * speed, y: Math.sin(a) * speed } as Vector2 }
    }

    const nextRocks: Rock[] = [processingRock]
    for (let i = 0; i < count; i++) {
      const radius = 30 + cosmeticRandom() * 15
      let chosen = sampleSpawn()

      for (let tries = 0; tries < 120; tries++) {
        const candidate = sampleSpawn()
        if (!isInsideCavern(candidate, radius + 30, getDemoCavernMap(1))) continue
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
      const spread = (cosmeticRandom() - 0.5) * 0.25
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

  }
  const toggleTether = () => {
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
          retractTether()
        } else {
          // Any other non-idle state (flying/deployed): reel in.
          const ship = shipRef.current

          const d0 = worldDelta(ship.pos.x, ship.pos.y, hp.pos.x, hp.pos.y)
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
  const update = (dt: number) => {
      const gameState = gameStateRef.current

      if (suspended || gameState === 'paused' || gameState === 'complete') return
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
        if (havenArrived && expeditionRef.current.complete && expeditionRef.current.campaign.journey?.departure) {
          const state=expeditionRef.current
          state.position={...shipRef.current.pos}
          keysRef.current.clear();retractTether();phaserBeamRef.current.active=false
          sounds.stopThrust();sounds.stopPhaser();sounds.stopRadiation();sounds.collect()
          snapshotCargo(state,runtimeRef.current,rocksRef.current)
          setGameStateWithRef('complete');publishExpedition('Haven clear of Orison · everyone is coming home')
          return
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
        if (dyingTimerRef.current <= 0) { if (training) startGame(); else setGameStateWithRef('gameOver') }
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

      // Keep the first lesson's approach open while a new pilot reads or aims.
      // After installation the deployed ring idles; transit keeps its heading.
      const teachingImpactShield = !expeditionRef.current.impactShieldInstalled && expeditionRef.current.campaign.berth === 'breach'
      if (!teachingImpactShield && havenReady(expeditionRef.current) && !havenArrived && !runtimeRef.current.recovery) miningBaseAngleRef.current += dt * MINING_ROT_SPEED
      expeditionRef.current.campaign.havenAngle = miningBaseAngleRef.current

      if (gameState !== 'playing') return

      const ship = shipRef.current
      const cavernMap = worldMap()

      const pendingRedDetonations: Rock[] = []
      const initialBanked = expeditionRef.current.banked
      let asteroidRewarded = false
      const rewardAsteroid = (rock: Rock) => {
        if (gameStateRef.current !== 'playing') return
        const credits = creditAsteroidDestruction(expeditionRef.current, rock, { pos:havenPosition(expeditionRef.current), radius:havenReady(expeditionRef.current) ? MINING_BASE_RADIUS : 0 })
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
            const kind = newRadius <= SMALLEST_ROCK_RADIUS ? fragmentKindFor(rock,random()) : 'normal'
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
            const d = worldDelta(source.pos.x, source.pos.y, ship.pos.x, ship.pos.y)
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
            const d = worldDelta(source.pos.x, source.pos.y, other.pos.x, other.pos.y)
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
        setLostCredits(training ? 0 : crashExpedition(expeditionRef.current))
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

        lastShieldHitAtRef.current = timeMs
        sounds.shieldHit(next)
      }

      // Passengers remain secured inside the tender while the world keeps moving.
      if (!riding) {
        stepShipMovement(ship, keysRef.current, dt, controllerRef.current)
        const shipWallHit = resolveCircleInCavern(ship.pos, ship.vel, ship.radius, 0.42, cavernMap)
        if (shipWallHit.maxImpactSpeed > 0) applyImpactShield(shipWallHit.maxImpactSpeed)
        if (gameStateRef.current !== 'playing') return
        if (!training) {
          const radiationDose = stepRadiation(expeditionRef.current, ship.pos, dt, cavernMap)
          const radiationFeedback = stepRadiationFeedback(runtimeRef.current.radiation, radiationDose, expeditionRef.current, dt)
          if (radiationDose.failed) { loseShip(); return }
          if (radiationFeedback.stopped) sounds.stopRadiation()
          if (radiationFeedback.tick) sounds.radiationTick(radiationFeedback.urgency, runtimeRef.current.radiation.unprotected)
        }
      } else {
        ship.angularVelocity=0
        // Passengers retain Haven's protection; passive refill still requires a clear field.
        if (!inRadiation(ship.pos, cavernMap)) stepRadiationRecharge(expeditionRef.current, dt)
      }

      // Update invulnerability
      if (invulnerableRef.current > 0) {
        invulnerableRef.current -= dt * 1000
      }

      // Update rocks and bounce them off the cavern boundary.
      const activeRock = (rock: Rock) => training || Math.hypot(rock.pos.x-ship.pos.x,rock.pos.y-ship.pos.y) < 1400 || Math.hypot(rock.pos.x-havenPosition(expeditionRef.current).x,rock.pos.y-havenPosition(expeditionRef.current).y) < 450
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
      const botCues = training ? [] : stepBots(botsRef.current, expeditionRef.current, {
        dt, ship, map: securityMap, bodies: [...rocksRef.current, ...worldCargo()],
        towed: harpoonRef.current.state === 'attached' ? harpoonRef.current.rock : undefined,
        shipSafe: riding || (havenReady(expeditionRef.current) && Math.hypot(ship.pos.x-havenPosition(expeditionRef.current).x,ship.pos.y-havenPosition(expeditionRef.current).y)<MINING_BASE_RADIUS),
      })
      for (const cue of botCues) if (Math.hypot(cue.pos.x-ship.pos.x,cue.pos.y-ship.pos.y)<650) sounds.botCue(cue.kind)
      for (const bot of botBodies) if (Math.hypot(bot.pos.x-ship.pos.x,bot.pos.y-ship.pos.y)<750) debrisRef.current.push(...stepBotSparks(bot,dt))
      for (const impact of stepSecurityShots(botsRef.current,dt,securityMap,[...(riding ? [] : [ship]),...rocksRef.current,...worldCargo(),...botBodies])) {
        createDebris(impact.pos.x,impact.pos.y,0,0,3,.2,'255, 162, 125')
        if (impact.target === ship) applyImpactShield(80)
        else if (impact.target && isStationBot(impact.target)) hitBot(impact.target,1)
        else if (impact.target && isRock(impact.target) && rocksRef.current.includes(impact.target)) hitRockLikeShipWeapon(impact.target,impact.direction)
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
          sounds,

          baseX,
          baseY,
          MINING_BASE_RADIUS,
          miningBaseAngleRef,
          miningGunCooldownsRef,
          baseShotsRef,
          rocksRef,

          expedition: expeditionRef.current,

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

                lastShieldRechargeAtRef.current = timeMs
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
          rt.recharging = fullyInside && needsRecharge(state) && shipRepairTimeRef.current < SHIELD_REPAIR_TIME
          rt.rechargeProgress = shipRepairTimeRef.current / SHIELD_REPAIR_TIME
        }
      }

      updateHarpoon({
        dt,

        ship,
        shipRef,
        rocks: [...worldLinks(), ...rocks.filter(rock => !rock.socketId), ...worldCargo().filter(body => !body.anchored && !body.retrieving && (body.cargoId !== 'core' || coreReleased(expeditionRef.current))), ...botBodies.filter(bot=>bot.health>0 && !bot.anchored), ...worldTerminals()].filter(body => Math.hypot(ship.pos.x-body.pos.x,ship.pos.y-body.pos.y) < 700 && (body.terminalId ? terminalVisible(ship.pos,body,cavernMap) : visibleBetween(ship.pos, body.pos, cavernMap))),
        harpoonRef,

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
        const wantFire = keysRef.current.has(' ') || controllerRef.current.laser

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
          let target: TetherBody | undefined
          let nearest = Infinity
          // Beam blocking and hit response use the same nearest body. Cargo
          // absorbs the hit as momentum instead of shielding an unhit target.
          for (const body of [...worldLinks(), ...worldCargo(), ...rocksRef.current, ...botBodies.filter(bot=>bot.health>0 && !bot.anchored)]) {
            const hit = rayCircleHitDistance(ship.pos, { x: ux, y: uy }, len, body.pos, body.radius + PHASER_BEAM_RADIUS)
            if (hit != null && hit < nearest) { len = hit; nearest = hit; target = body }
          }

          phaserBeamRef.current = {
            active: true,
            start: { x: ship.pos.x, y: ship.pos.y },
            direction: { x: ux, y: uy },
            length: len,
            energy01: clamp(phaser.energyMs / (phaserCapacity), 0, 1),
          }

          const impactMs = laserImpactMs(expeditionRef.current)
          if (stepLaserContact(laserContactRef.current, target, dt, impactMs) && target) {
            if (isStationBot(target)) hitBot(target,BOT_LASER_DAMAGE)
            else if (isRock(target)) hitRockLikeShipWeapon(target, { x: ux, y: uy })
            else repelBody(target, { x: ux, y: uy })
          }

          // Particle effects around the beam (biased toward the far end).
          {
            const ratePerSec = 120
            phaser.particleCarry += dt * ratePerSec
            const spawnCount = Math.min(6, Math.floor(phaser.particleCarry))
            phaser.particleCarry -= spawnCount
            if (spawnCount > 0) {
              for (let i = 0; i < spawnCount; i++) {
                const t = 0.6 + cosmeticRandom() * 0.4
                const baseX = ship.pos.x + ux * (len * t)
                const baseY = ship.pos.y + uy * (len * t)
                const px = -uy
                const py = ux
                const off = (cosmeticRandom() * 2 - 1) * (6 + 10 * (1 - t))
                const x = baseX + px * off
                const y = baseY + py * off

                const jitterAng = cosmeticRandom() * Math.PI * 2
                const jitterSpd = 40 + cosmeticRandom() * 120
                const vx = (px * off * 0.6 + Math.cos(jitterAng) * jitterSpd) * 0.6
                const vy = (py * off * 0.6 + Math.sin(jitterAng) * jitterSpd) * 0.6

                phaserParticlesRef.current.push({
                  pos: { x, y },
                  vel: { x: vx, y: vy },
                  life: 240 + cosmeticRandom() * 120,
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

      blasterRef.current.bursts = blasterRef.current.bursts.filter(burst => { burst.life -= dt; return burst.life > 0 })
      const blasterStep = stepBlaster(blasterRef.current.shots, dt, cavernMap, [...rocksRef.current, ...worldCargo(),...botBodies.filter(bot=>bot.health>0 && !bot.anchored)])
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

        bulletsRef,
        rocksRef,
        harpoonRef,
        shipRef,
        cavernMap,

        buildRopeBetween,
        sounds,
        onRedRockDetonate: (rock) => armRedRock(rock),
        onAsteroidDestroyed: rewardAsteroid,
        fragmentKind: fragmentKindFor,
        random,
        createRock,
        createDebris,

        SMALLEST_ROCK_RADIUS,
        HARPOON_VISUAL_SLACK,

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
      if (training) {
        rt.elapsed+=dt
        resolveWorldContacts([...rocksRef.current,ship],cavernMap,contact=>{
          if (contact.body===ship || contact.other===ship) applyImpactShield(contact.speed)
          for (const body of [contact.body,contact.other]) if (body && isRock(body)) armRedRock(body)
        })
        if (gameStateRef.current!=='playing') return
        const removed=stepTraining(trainingRef.current,state,rocksRef.current,harpoonRef.current,dt)
        baseShotsRef.current=trainingRef.current.hoppers.flatMap(hopper=>hopper.shots.current)
        for (const rock of removed) {
          releaseHarpoonIfAttached(rock)
          createDebris(rock.pos.x,rock.pos.y,0,0,12,.8,rock.sourceId ? '100, 190, 255' : '0, 255, 136')
          sounds.collect()
        }
        const hook=harpoonRef.current
        if(hook.state==='attached' && hook.rock.socketId) retractTether()
        stepTrainingEmitter(trainingRef.current,rocksRef.current,ship,createRock,dt)
        state.position={...ship.pos}
        return
      }
      rt.havenImpact = Math.max(0,(rt.havenImpact ?? 0)-dt*4)
      rt.havenImpactCooldown = Math.max(0,(rt.havenImpactCooldown ?? 0)-dt)
      const pose = havenPose(state,miningBaseAngleRef.current)
      const previousRadio = rt.radio?.id
      const events = stepExpedition(state, rt, {
        dt, ship, rocks: rocksRef.current, harpoon: harpoonRef.current, beam: phaserBeamRef.current, aboard:riding,
        extraBodies: botBodies.filter(bot=>bot.health>0 && !bot.anchored),
        havenMotion:{ previous:previousHaven,current:pose,dt },
        onContact: contact => {
          for (const body of [contact.body,contact.other]) if (body && isRock(body) && body.kind === 'red') armRedRock(body)
          for (const body of [contact.body,contact.other]) if (body && isStationBot(body) && contact.speed>115 && body.stun<=0) hitBot(body,contact.speed>230 ? 2 : 1)
          if (contact.surface !== 'haven') return
          const body=contact.body,point=contact.point!
          if (isRock(body) && contact.speed>20) {
            const rock=body
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
          bankAtCheckpoint(state,'haven');shieldsRef.current=state.shields;
          setGameStateWithRef('docked');publishExpedition('Haven secured')
        }
      }
      const tether = harpoonRef.current
      if (tether.state === 'attached' && (tether.rock.socketId || tether.rock.retrieving || ![...havenLinkTargets(state,rt), ...rocksRef.current, ...cargoBodies(expeditionRef.current, runtimeRef.current), ...botBodies.filter(bot=>bot.health>0 && !bot.anchored), ...TERMINALS].some(body => body === tether.rock))) retractTether()
      if (runtimeRef.current.impactSpeed > 0) applyImpactShield(runtimeRef.current.impactSpeed)
      resolveCircleInCavern(ship.pos, ship.vel, ship.radius, 0.42, cavernMap)
      if (gameStateRef.current !== 'playing' && !(riding && havenArrived)) return
      expeditionRef.current.position = { ...ship.pos }
      expeditionRef.current.shields = shieldsRef.current
      snapshotCargo(expeditionRef.current, runtimeRef.current, rocksRef.current)
      if (events.length) { sounds.collect(); publishExpedition(events[events.length - 1]) }
      else if (asteroidRewarded || expeditionRef.current.banked !== initialBanked) publishExpedition()

    }
  const snapshot = () => ({
    gameState: gameStateRef.current, expedition: structuredClone(expeditionRef.current), shields: shieldsRef.current, lostCredits,
    hud: { room: training ? 'Flight training' : expeditionRef.current.campaign.journey?.riding ? 'Haven · in transit' : sectorAt(shipRef.current.pos)?.name ?? 'Transit tunnels', prompt: training ? '' : interaction(expeditionRef.current, shipRef.current)?.label ?? '', message: runtimeRef.current.messageTime > 0 ? runtimeRef.current.message : '', towing: runtimeRef.current.towing ?? '', radio: training ? trainingRef.current.connected ? TRAINING_LOG.id : '' : runtimeRef.current.radio?.id ?? '', grappleHint: '' },
  })
  const step = () => {
    if (suspended || gameStateRef.current === 'paused' || gameStateRef.current === 'complete') return
    const dt = 1 / 60
    timeMs += dt * 1000
    const hadImpactShield = expeditionRef.current.impactShieldInstalled
    const hadRecoveryLink = expeditionRef.current.campaign.havenActivated
    update(dt)
    if (!hadRecoveryLink && expeditionRef.current.campaign.havenActivated) events.push({type:'persist'})
    const rt = runtimeRef.current, mode = gameStateRef.current
    if (mode!=='menu') stepHavenLinkRetraction(rt,dt)
    // Installation already supplies its two charges. Play the full recharge
    // feedback separately, even if Haven's service timer was already full.
    if (!hadImpactShield && expeditionRef.current.impactShieldInstalled) rt.shieldInstallRecharge = 0
    if (mode !== 'playing' && mode !== 'docking' && mode !== 'docked') delete rt.shieldInstallRecharge
    if (rt.shieldInstallRecharge !== undefined) {
      rt.shieldInstallRecharge += dt
      if (rt.shieldInstallRecharge + 1e-7 >= SHIELD_REPAIR_TIME) {
        delete rt.shieldInstallRecharge
        if (lastShieldRechargeAtRef.current !== timeMs) sounds.shieldCharge()
        lastShieldRechargeAtRef.current = timeMs
      }
    }
    // Drive both servicing and first-install audio from the same fixed clock.
    if (rt.shieldInstallRecharge !== undefined || (mode === 'playing' && rt.recharging)) sounds.startRepairHum()
    else sounds.stopRepairHum()
    hudElapsed += dt
    if (hudElapsed >= .15) { hudElapsed = 0; events.push({ type: 'hud' }) }
    if (!training && gameStateRef.current !== 'menu') {
      saveElapsed += dt
      if (saveElapsed >= 3) { saveElapsed = 0; events.push({ type: 'persist' }) }
    }
  }
  const command = (command: GameCommand) => {
    if (training && ['load','jump','credits','upgrade','launch','relocate','teleport','blaster','interact'].includes(command.type)) return
    switch (command.type) {
      case 'start': startGame(command.fresh); hudElapsed = 0; saveElapsed = 0; break
      case 'load': expeditionRef.current = structuredClone(command.expedition); startGame(); break
      case 'key':
        if (command.pressed && gameStateRef.current === 'playing' && !suspended) keysRef.current.add(command.key)
        else keysRef.current.delete(command.key)
        if (command.key === ' ' && !command.pressed && !controllerRef.current.laser) laserContactRef.current = { elapsedMs: 0 }
        return
      case 'controller': {
        const input = gameStateRef.current === 'playing' && !suspended && !expeditionRef.current.campaign.journey?.riding ? sanitizeController(command.input) : neutralController()
        if (controllerRef.current.laser && !input.laser && !keysRef.current.has(' ')) laserContactRef.current = { elapsedMs: 0 }
        controllerRef.current = input
        return
      }
      case 'suspend': suspended = command.suspended; simulationClock.reset(); keysRef.current.clear(); controllerRef.current = neutralController(); phaserBeamRef.current.active = false; laserContactRef.current = { elapsedMs: 0 }; return
      case 'pause': if (gameStateRef.current !== 'playing') return; keysRef.current.clear(); setGameStateWithRef('paused'); break
      case 'resume': if (gameStateRef.current !== 'paused' && gameStateRef.current !== 'docked' && gameStateRef.current !== 'complete') return; resumeFlight(); break
      case 'menu': keysRef.current.clear(); phaserBeamRef.current.active = false; setGameStateWithRef('menu'); break
      case 'blaster': shootBlaster(); break
      case 'teleport': teleportHome(); break
      case 'tether': if (gameStateRef.current === 'playing' && !suspended && !expeditionRef.current.campaign.journey?.riding) toggleTether(); break
      case 'interact': interact(); break
      case 'relocate': relocateHaven(command.berth); break
      case 'launch': {
        if (gameStateRef.current !== 'docked' || runtimeRef.current.recovery || !launchHaven(expeditionRef.current,expeditionMap(expeditionRef.current),miningBaseAngleRef.current)) return
        retractTether();harpoonRef.current={state:'idle'};baseShotsRef.current=[]
        keysRef.current.clear();controllerRef.current=neutralController();phaserBeamRef.current.active=false
        sounds.stopThrust();sounds.stopPhaser()
        setGameStateWithRef('playing');publishExpedition('Everyone aboard · Haven departing through the Access Tunnel')
        break
      }
      case 'upgrade': buyUpgrade(command.id); break
      case 'credits': addDevelopmentCredits(expeditionRef.current); publishExpedition(); break
      case 'jump':
        if (gameStateRef.current !== 'menu') snapshotCargo(expeditionRef.current, runtimeRef.current, rocksRef.current)
        if (advanceDevelopmentLevel(expeditionRef.current, command.berth)) startGame()
        break
    }
    events.push({ type: 'hud' })
    if (!training && command.type !== 'menu' && command.type !== 'tether' && command.type !== 'blaster') events.push({ type: 'persist' })
  }
  if (training) startGame(); else stageMenuScene()
  return {
    command, step, snapshot, clock: simulationClock,
    advance: (timestamp: number, beforeStep?: () => void) => simulationClock.advance(timestamp, !suspended && gameStateRef.current !== 'paused' && gameStateRef.current !== 'complete', () => { beforeStep?.(); step() }),
    drainEvents: () => events.splice(0),
    get timeMs() { return timeMs },
    get expedition() { return expeditionRef.current },
    get mode() { return gameStateRef.current },
    get training() { return training ? trainingRef.current : undefined },
    randomState: random.state,
    createRock,
    refs: { expeditionRef, runtimeRef, gameStateRef, shieldsRef, shipRef, rocksRef, botsRef,    shipRepairTimeRef, bulletsRef, blasterRef, laserContactRef, baseShotsRef, debrisRef, keysRef, controllerRef, invulnerableRef, lastShieldHitAtRef, lastShieldRechargeAtRef, dyingTimerRef, harpoonRef, miningBaseAngleRef, shipAppearanceRef, miningGunCooldownsRef, phaserStateRef, phaserBeamRef, phaserParticlesRef, shipFullyInBaseRef },
  }
}
export type GameSession = ReturnType<typeof createGameSession>
