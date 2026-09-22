import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { FIELD, JEEP_MAX_HEALTH, JEEP_TUNING } from './urbanFire/types'
import type { ArmorUpgrade, Bullet, Debris, Helicopter, Jeep, RepairKit, Tank, Vector2, Wall } from './urbanFire/types'
import { ArmorSoundSystem } from './urbanFire/sound'
import { createStaticCityWalls } from './urbanFire/battlefield'
import { civilianCover, createCivilianVehicles, hitCivilianBullet, stepCivilianVehicles } from './urbanFire/civilianVehicles'
import { CITY } from './urbanFire/cityPlan'
import { driveJeep, steerJeep } from './urbanFire/driving'
import { closingImpactSpeed, createCollisionFeedback, stepCollisionFeedback } from './urbanFire/collisionFeedback'
import type { JeepCollisionContact } from './urbanFire/collisionFeedback'
import type { CivilianVehicle } from './urbanFire/civilianVehicles'
import { collectSupplies, createArmorUpgrade, createSupplyArrival, stepSupplyArrivals } from './urbanFire/supplies'
import { createHelicopterReinforcements, createTankReinforcements, stepHelicopterArrival, stepTankArrival, tankGrounded, tanksRemaining } from './urbanFire/reinforcements'
import { SCENERY_MARGIN } from './urbanFire/perimeter'
import { clamp, clear, createNavigator, segmentEntry } from './urbanFire/navigation'
import { createImpactDebris, stepImpactDebris } from './urbanFire/combatEffects'
import { aimTank, createContact, driveTank, flyHelicopter, observe } from './urbanFire/ai'
import { drawBattle, drawCity } from './urbanFire/render'
import { createVehicleVisuals, stepVehicleVisuals, vehiclePose } from './urbanFire/appearance'
import { createControllerReader } from './hardVacuum/controllerInput'
import { neutralController } from './hardVacuum/flightInput'
import { controllerDialog, controlDialog, scrollDialog } from './hardVacuum/controllerUi'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { GameArt } from '../arcade/GameArt'
import { controllerButtonLabel } from './hardVacuum/controllerLayouts'

type UrbanFireGameProps = { onExit: () => void }

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
  const visualsRef = useRef(createVehicleVisuals())
  const collisionFeedbackRef = useRef(createCollisionFeedback())

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
  const civilianVehiclesRef = useRef(createCivilianVehicles())
  const debrisRef = useRef<Debris[]>([])
  const effectSequenceRef = useRef(0)
  const repairKitsRef = useRef<RepairKit[]>([])
  const armorUpgradesRef = useRef<ArmorUpgrade[]>([])
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
      return !clear({x,y},{x,y},[...wallsRef.current,...civilianVehiclesRef.current.map(civilianCover)],radius)
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
    repairKitsRef.current = [{ pos, spawnedAtMs: Date.now(), arrival:createSupplyArrival(.4) }]
  }, [])

  const createDebris = useCallback((x: number, y: number, count: number = 8, material:Debris['material']='metal',direction?:number) => {
    const particles=createImpactDebris(x,y,count,++effectSequenceRef.current,material,direction)
    debrisRef.current = [...debrisRef.current, ...particles].slice(-320)
  }, [])

  const spawnArmorUpgrade=useCallback((waveNum:number)=>{
    if(armorUpgradesRef.current.length)return
    const upgrade=createArmorUpgrade(waveNum,jeepRef.current.pos,
      [...wallsRef.current,...civilianVehiclesRef.current.map(civilianCover)],repairKitsRef.current)
    if(upgrade)armorUpgradesRef.current=[upgrade]
  },[])

  const generateWalls = useCallback(() => {
    // Permanent cover is immutable across deployments; only live cars reset.
    if(!wallsRef.current.length)wallsRef.current = createStaticCityWalls()
    civilianVehiclesRef.current = createCivilianVehicles()
  }, [])

  const spawnEnemies = useCallback((waveNum: number) => {
    const tanks=createTankReinforcements(waveNum,jeepRef.current.pos,
      [...wallsRef.current,...civilianVehiclesRef.current.map(civilianCover)])
    const helicopters=createHelicopterReinforcements(waveNum,jeepRef.current.pos,
      {width:canvasRef.current?.width||window.innerWidth,height:canvasRef.current?.height||window.innerHeight})

    tanksRef.current = tanks
    helicoptersRef.current = helicopters
  }, [])

  const resetJeep = useCallback(() => {
    jeepRef.current = {
      pos: { ...CITY.playerSpawn },
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
    visualsRef.current = createVehicleVisuals()
    collisionFeedbackRef.current = createCollisionFeedback()
    effectSequenceRef.current = 0
    bulletsRef.current = []
    debrisRef.current = []
    repairKitsRef.current = []
    armorUpgradesRef.current = []
    setScore(0)
    setWave(1)
    spawnEnemies(1)
    spawnRepairKit()
    spawnArmorUpgrade(1)
    setGameState('playing')
  }, [generateWalls, resetJeep, spawnEnemies, spawnRepairKit, spawnArmorUpgrade, sounds, controller])

  useEffect(() => {
    if (gameState !== 'menu') return

    generateWalls()
    resetJeep()
    bulletsRef.current = []
    debrisRef.current = []
    repairKitsRef.current = []
    armorUpgradesRef.current = []
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
    if (gameState !== 'playing' || jeep.state !== 'active') return
    const muzzle = { x: jeep.pos.x + Math.cos(jeep.angle) * 17, y: jeep.pos.y + Math.sin(jeep.angle) * 17 }
    if (!clear(jeep.pos, muzzle, wallsRef.current)) return
    const velocity={ x: Math.cos(jeep.angle) * JEEP_TUNING.playerBulletSpeed, y: Math.sin(jeep.angle) * JEEP_TUNING.playerBulletSpeed }
    const hit=hitCivilianBullet(civilianVehiclesRef.current,wallsRef.current,jeep.pos,muzzle,velocity)
    if(hit)createDebris(hit.point.x,hit.point.y,3)
    else bulletsRef.current.push({ pos: muzzle, vel: velocity, life: JEEP_TUNING.playerBulletLifeMs, isEnemy: false })
    vehiclePose(visualsRef.current, jeep).recoil = 1
    sounds.shoot()
  }, [gameState, sounds, createDebris])
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

  const readFrameState = useEffectEvent(() => ({gameState,score,wave}))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let needsDraw=true
    let lastDrawState: string | undefined
    let fps: number | undefined
    let fpsFrames=0, fpsStartedAt=0
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      needsDraw=true
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
    city.width = FIELD.width + SCENERY_MARGIN * 2; city.height = FIELD.height + SCENERY_MARGIN * 2
    const cityContext = city.getContext('2d')!
    cityContext.translate(SCENERY_MARGIN, SCENERY_MARGIN); drawCity(cityContext, wallsRef.current)

    const update = (dt: number) => {
      const {gameState,wave}=readFrameState()
      if (gameState !== 'playing') return

      const { width, height } = FIELD
      const jeep = jeepRef.current
      debrisRef.current = stepImpactDebris(debrisRef.current,dt)
      stepSupplyArrivals([...repairKitsRef.current,...armorUpgradesRef.current],dt)

      // Fairness: cap concurrent enemy bullets so difficulty stays readable.
      const maxEnemyBullets = 6

      if (jeep.state === 'exploding') {
        jeep.explodeTime -= dt * 1000
        if (jeep.explodeTime <= 0) {
          jeep.state = 'dead'
          sounds.stopEngine()
          setGameState('gameOver')
        }
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
      const previousPosition={...jeep.pos},previousAngle=jeep.angle
      const collisionContacts:JeepCollisionContact[]=[]
      vehiclePose(visualsRef.current,jeep).steeringInput=turn
      sounds.setEngineSpeed(driveJeep(jeep,{turn,forward,reverse},dt))

      // Wall collision for jeep
      for (const wall of wallsRef.current) {
        const { collision, pushX, pushY } = rectCollision(jeep.pos.x, jeep.pos.y, JEEP_TUNING.collisionRadius, wall)
        if (collision) {
          collisionContacts.push({body:wall,material:wall.impactMaterial??'masonry',
            speed:closingImpactSpeed(jeep.vel,{x:pushX,y:pushY})})
          jeep.pos.x += pushX
          jeep.pos.y += pushY
          jeep.vel.x *= JEEP_TUNING.collisionVelocityDamping
          jeep.vel.y *= JEEP_TUNING.collisionVelocityDamping
        }
      }

      // Battlefield bounds
      jeep.pos.x = Math.max(JEEP_TUNING.screenMargin, Math.min(width - JEEP_TUNING.screenMargin, jeep.pos.x))
      jeep.pos.y = Math.max(JEEP_TUNING.screenMargin, Math.min(height - JEEP_TUNING.screenMargin, jeep.pos.y))

      const cover=()=>[...wallsRef.current,...civilianVehiclesRef.current.map(civilianCover)]
      observe(contactRef.current, jeep, [...tanksRef.current, ...helicoptersRef.current], cover(), dt)
      tanksRef.current = tanksRef.current.filter(tank => {
        if (tank.state === 'exploding') { tank.explodeTime -= dt * 1000; return tank.explodeTime > 0 }
        if(tank.state==='incoming'){
          const traffic=[{pos:jeep.pos,radius:JEEP_TUNING.collisionRadius},
            ...tanksRef.current.filter(other=>other!==tank&&other.state!=='exploding').map(other=>({pos:other.pos,radius:28})),
            ...civilianVehiclesRef.current.map(car=>({pos:car.pos,radius:Math.hypot(car.length,car.width)/2}))]
          if(stepTankArrival(tank,dt,wallsRef.current,traffic))sounds.tankLanding()
          if(!tankGrounded(tank))return true
        }
        const tankPreviousPosition={...tank.pos}
        if(tank.state==='active')driveTank(tank, tanksRef.current, contactRef.current, wallsRef.current, route, dt)
        // Physical contacts still constrain the tactical planner.
        for (const wall of wallsRef.current) {
          const hit = rectCollision(tank.pos.x, tank.pos.y, 28, wall)
          tank.pos.x += hit.pushX; tank.pos.y += hit.pushY
        }
        const dx = jeep.pos.x - tank.pos.x, dy = jeep.pos.y - tank.pos.y, dist = Math.hypot(dx, dy)
        if (dist > 0 && dist < 40) {
          const tankMotion=dt>0?{x:(tank.pos.x-tankPreviousPosition.x)/dt,y:(tank.pos.y-tankPreviousPosition.y)/dt}:{x:0,y:0}
          collisionContacts.push({body:tank,material:'armor',speed:closingImpactSpeed(jeep.vel,{x:dx,y:dy},tankMotion)})
          jeep.pos.x += dx / dist * (40 - dist); jeep.pos.y += dy / dist * (40 - dist)
        }
        const muzzle = tank.state==='active'?aimTank(tank, jeep, tanksRef.current, cover(), dt):null
        if (muzzle && bulletsRef.current.filter(b => b.isEnemy).length < maxEnemyBullets) {
          bulletsRef.current.push({ pos: muzzle, vel: { x: Math.cos(tank.turretAngle) * 250, y: Math.sin(tank.turretAngle) * 250 }, life: 2000, isEnemy: true })
          tank.shootCooldown = 2200 + Math.random() * 1700; tank.recoil = 1; sounds.tankShoot()
        }
        return true
      })
      helicoptersRef.current = helicoptersRef.current.filter(heli => {
        if (heli.state === 'exploding') { heli.explodeTime -= dt * 1000; return heli.explodeTime > 0 }
        heli.soundTimer -= dt * 1000
        const heliAudible=Math.hypot(heli.pos.x-jeep.pos.x,heli.pos.y-jeep.pos.y)<850
        if (heli.soundTimer <= 0) { heli.soundTimer = 180; if(heliAudible)sounds.helicopter() }
        if(heli.state==='incoming'){stepHelicopterArrival(heli,dt);return true}
        if (flyHelicopter(heli, jeep, contactRef.current, cover(), dt) && bulletsRef.current.filter(b => b.isEnemy).length < maxEnemyBullets) {
          bulletsRef.current.push({ pos: { ...heli.pos }, vel: { x: Math.cos(heli.angle) * 220, y: Math.sin(heli.angle) * 220 }, life: 2000, isEnemy: true })
          heli.shootCooldown = 2400 + Math.random() * 1400; heli.recoil = 1; sounds.tankShoot()
        }
        return true
      })

      // Unpowered civilian cars remain solid, but trade momentum with the jeep
      // and tanks. Routing uses permanent structures; tanks can shove cars aside.
      const groundActors=[{pos:jeep.pos,vel:jeep.vel,radius:JEEP_TUNING.collisionRadius,mass:1,
        onContact:(car:CivilianVehicle,speed:number)=>collisionContacts.push({body:car,material:'metal',speed})},
        ...tanksRef.current.filter(tankGrounded).map(t=>({pos:t.pos,vel:t.vel,radius:28,mass:7}))]
      stepCivilianVehicles(civilianVehiclesRef.current,wallsRef.current,dt,groundActors)
      for(const actor of groundActors)for(const wall of wallsRef.current){
        const hit=rectCollision(actor.pos.x,actor.pos.y,actor.radius,wall)
        if(actor===groundActors[0]&&hit.collision)collisionContacts.push({body:wall,material:wall.impactMaterial??'masonry',
          speed:closingImpactSpeed(actor.vel,{x:hit.pushX,y:hit.pushY})})
        actor.pos.x+=hit.pushX;actor.pos.y+=hit.pushY
      }
      const impact=stepCollisionFeedback(collisionFeedbackRef.current,collisionContacts,dt)
      if(impact)sounds.jeepCollision(impact.material,impact.strength)
      steerJeep(jeep,turn,dt,previousPosition,previousAngle)
      const supplies=collectSupplies(jeep,repairKitsRef.current,armorUpgradesRef.current,cover())
      if(supplies.armor||supplies.repaired){
        if(supplies.armor)sounds.armorPickup();else sounds.repairPickup()
      }

      // Update bullets
      bulletsRef.current = bulletsRef.current.filter((bullet) => {
        const prevX = bullet.pos.x
        const prevY = bullet.pos.y
        bullet.pos.x += bullet.vel.x * dt
        bullet.pos.y += bullet.vel.y * dt
        bullet.life -= dt * 1000

        const carHit=hitCivilianBullet(civilianVehiclesRef.current,wallsRef.current,
          {x:prevX,y:prevY},bullet.pos,bullet.vel,bullet.isEnemy)
        if(carHit){createDebris(carHit.point.x,carHit.point.y,3);return false}

        // Wall collision (bullets don't pass through)
        let wallHit=Infinity
        for (const wall of wallsRef.current) {
          const entry=segmentEntry({x:prevX,y:prevY},bullet.pos,wall)
          if(entry!==null)wallHit=Math.min(wallHit,entry)
        }
        if(wallHit!==Infinity){
          createDebris(prevX+(bullet.pos.x-prevX)*wallHit,prevY+(bullet.pos.y-prevY)*wallHit,
            4,'masonry',Math.atan2(-bullet.vel.y,-bullet.vel.x))
          return false
        }

        // Battlefield bounds
        if (bullet.pos.x < 0 || bullet.pos.x > width || bullet.pos.y < 0 || bullet.pos.y > height) {
          return false
        }

        return bullet.life > 0
      })

      // Collision: player bullets vs tanks
      for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
        const bullet = bulletsRef.current[i]
        if (bullet.isEnemy) continue

        for (const tank of tanksRef.current) {
          if (!tankGrounded(tank)) continue
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
              createDebris(bullet.pos.x,bullet.pos.y,4,'metal',Math.atan2(-bullet.vel.y,-bullet.vel.x))
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
      const activeHelis = helicoptersRef.current.filter((h) => h.state !== 'exploding').length
      if (!tanksRemaining(tanksRef.current) && activeHelis === 0 && jeep.state === 'active') {
        waveDelayRef.current += dt
        if (waveDelayRef.current >= 1.5) {
          const nextWave = wave + 1
          setWave(nextWave); spawnEnemies(nextWave); spawnRepairKit()
          spawnArmorUpgrade(nextWave)
          waveDelayRef.current = 0
        }
      }
    }
    const draw = () => {
      const {score,wave}=readFrameState()
      drawBattle(ctx, city, {
      jeep: jeepRef.current, tanks: tanksRef.current, helicopters: helicoptersRef.current,
      bullets: bulletsRef.current, debris: debrisRef.current, kits: repairKitsRef.current,
      armor: armorUpgradesRef.current,
      civilianVehicles: civilianVehiclesRef.current,
      }, canvas.width, canvas.height, score, wave, visualsRef.current, fps)
    }

    const animate = (timestamp: number) => {
      const {gameState}=readFrameState()
      const dt = Math.max(0, Math.min((timestamp - lastTimeRef.current) / 1000, 0.05))
      lastTimeRef.current = timestamp

      // Measure actual frame cadence, not the clamped simulation step. Updating
      // twice a second keeps the HUD readable without adding React renders.
      if(gameState!=='playing' || lastDrawState!=='playing'){
        fps=undefined;fpsFrames=0;fpsStartedAt=timestamp
      }else{
        fpsFrames++
        const elapsed=timestamp-fpsStartedAt
        if(elapsed>=500){fps=Math.round(fpsFrames*1000/elapsed);fpsFrames=0;fpsStartedAt=timestamp}
      }

      if (pollController(timestamp, dt) && gameState === 'playing') {
        update(dt)
        stepVehicleVisuals(visualsRef.current, [
          [jeepRef.current, 'jeep'],
          ...tanksRef.current.map(tank => [tank, 'tank'] as const),
          ...helicoptersRef.current.map(heli => [heli, 'helicopter'] as const),
        ], dt)
        sounds.setTireSqueal(jeepRef.current.state==='active'?visualsRef.current.tires.squeal:0)
      }
      if(gameState==='playing' || needsDraw || lastDrawState!==gameState){
        draw();needsDraw=false;lastDrawState=gameState
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [spawnEnemies, spawnRepairKit, spawnArmorUpgrade, createDebris, sounds])

  const exitToGameSelect = () => {
    sounds.stopEngine()
    onExit()
  }

  return (
    <div ref={rootRef} className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} tabIndex={-1} role="img" aria-label="Urban Fire battlefield" className="absolute inset-0 outline-none" />
      {gameState !== 'playing' && <KeyboardDialog label={gameState === 'menu' ? 'Urban Fire' : gameState === 'paused' ? 'Paused' : 'Mission ended'} focusKey={gameState} onClose={gameState === 'paused' ? resumeGame : exitToGameSelect} className="urban-overlay">
        <div className="urban-menu">
          <div className="urban-nameplate"><span className="urban-eyebrow">ARMORED RECON</span><span className="urban-sector">SECTOR <strong>04</strong></span></div>
          {gameState === 'menu' ? <>
            <h1>Urban Fire</h1>
            <div className="urban-cover"><GameArt theme="urban" compact /></div>
            <p className="urban-brief"><strong>Hold the district.</strong> Break the armored advance.<br />Use the buildings for cover. Keep moving to stay out of the crossfire.</p>
            <div className="urban-actions"><button className="urban-button urban-button-primary" onClick={startGame}>Deploy</button><button className="urban-button" onClick={exitToGameSelect}>Back</button></div>
          </> : gameState === 'paused' ? <>
            <p className="urban-game-label">URBAN FIRE / FIELD REPORT</p>
            <h2>PAUSED</h2>
            <div className="urban-report"><span>WAVE <strong>{String(wave).padStart(2, '0')}</strong></span><span>POINTS <strong>{score.toString().padStart(6, '0')}</strong></span></div>
            <div className="urban-actions"><button className="urban-button urban-button-primary" onClick={resumeGame}>Resume</button><button className="urban-button" onClick={exitToGameSelect}>Back</button></div>
          </> : <>
            <p className="urban-game-label">URBAN FIRE / AFTER ACTION</p>
            <h2>MISSION ENDED</h2>
            <div className="urban-report"><span>WAVE <strong>{String(wave).padStart(2, '0')}</strong></span><span>POINTS <strong>{score.toString().padStart(6, '0')}</strong></span></div>
            <div className="urban-actions"><button className="urban-button urban-button-primary" onClick={startGame}>Redeploy</button><button className="urban-button" onClick={() => setGameState('menu')}>Main menu</button><button className="urban-button" onClick={exitToGameSelect}>Back</button></div>
          </>}
          <div className="urban-help">
            {gameState === 'menu' ? <>
              <p><strong>{controllerConnected ? 'Left stick turns · RT / R2 forward · LT / L2 reverse' : 'Arrow keys / WASD to drive'}</strong></p>
              <p>{controllerConnected ? `${controllerButtonLabel(controller.layout.buttons.confirm)} fires · ${controllerButtonLabel(controller.layout.buttons.pause)} pauses` : 'Space fires · P pauses'}</p>
              <p className="urban-field-note">Tanks: 2 hits · Helicopters: 1 hit<br />Medical cases repair to 3. Armor repairs to 3, then adds 1.</p>
            </> : gameState === 'paused' ? <p>{controllerConnected ? `${controllerButtonLabel(controller.layout.buttons.pause)} / ${controllerButtonLabel(controller.layout.buttons.back)} resumes · Back exits` : 'P / Esc resumes · Back exits'}</p> : null}
            {gameState !== 'paused' && <p>{controllerConnected ? `Stick / D-pad selects · ${controllerButtonLabel(controller.layout.buttons.confirm)} confirms · ${controllerButtonLabel(controller.layout.buttons.back)} exits` : '↑ ↓ / Tab selects · Enter confirms · Esc exits'}</p>}
          </div>
        </div>
      </KeyboardDialog>}
    </div>
  )
}
