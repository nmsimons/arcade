import type { Prop, Run } from './challenge.ts'
import { solidColliders } from './challenge.ts'
import { pointInside } from './geometry.ts'
import type { Player } from './model.ts'
import { airBoostStrength } from './model.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { playerSwimStrength, propWaterStrength } from './gravity.ts'
import { robotDrive, robotPlatforms } from './robotPhysics.ts'
import { chargingBayOpening } from './goal.ts'
import { triggerToggleGroup } from './toggleGroups.ts'
import { powerOut } from './power.ts'
import { powerDownWarning } from './powerDownWarning.ts'
import { landingDustStrength, PROP_TICK_STRENGTH, recordWorldEffect, splashEnergy, splashEntrySpeed } from './worldEffects.ts'
import type { WorldEffectKind } from './worldEffects.ts'
import type { PlayerCollider } from './playerContacts.ts'
import { levelAmbience, listenerUnderwater, runningPumps, underOpenSky } from './ambience.ts'
import type { Ambience } from './ambience.ts'
import { busEndingFrame } from './busEnding.ts'
import type { BusEnding } from './busEnding.ts'
import { goalEase } from './goal.ts'
import { openAirAt } from './environment.ts'

export type LoopKind = 'ball' | 'box' | 'gate-open' | 'gate-close' | 'elevator' | 'booster' | 'shovebot' | 'robot-servo' | 'pump'
export type CueKind = 'footstep' | 'robot-footstep' | 'landing' | 'robot-landing' | 'box-impact' | 'ball-impact' | 'water-entry' | 'switch' | 'timer-paused' | 'time-penalty' | 'coin' | 'emp' | 'power-down' | 'power-warning' | 'emp-shot' | 'repulsor' | 'tractor' | 'shove'
  | 'relay' | 'drip' | 'bubble' | 'bird-whistle' | 'bird-trill' | 'bird-chirp' | 'air-brake'
/** What a step or landing comes down on, which colours its sound (sound.ts). */
export type Surface = 'stone' | 'earth' | 'grass' | 'metal' | 'wood' | 'rubber'
/** `pitch` plays a cue faster or slower than written: a bird or a bubble of another size. */
export interface SoundCue { kind: CueKind; volume: number; pan: number; strength: number; size?: number; surface?: Surface; pitch?: number }
export interface SoundLoop { id: string; kind: LoopKind; volume: number; pan: number; pace: number; size: number }
/**
 * `ambience` is the level's standing sound (ambience.ts); a frame without it lets every bed fall silent. `underwater`,
 * 0 to 1, is how far under water the listener's head is: everything heard through the air is muffled by it.
 */
export interface SoundFrame { loops: SoundLoop[]; cues: SoundCue[]; ambience?: Ambience; underwater?: number }
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))

/**
 * The surface of a supporting solid: a crate is wood and a ball rubber; machinery, the bus and robots are
 * metal; terrain is its material, with any ground cover over it sounding as grass. Chalk sounds as stone.
 */
export function surfaceOf(collider: PlayerCollider | undefined): Surface | undefined {
  if (!collider) return undefined
  if (collider.prop) return collider.prop.kind === 'box' ? 'wood' : 'rubber'
  if (collider.robot || collider.id === 'player' || collider.id === 'bus' || collider.id.startsWith('mechanism:')) return 'metal'
  if (collider.id.startsWith('force-field:')) return undefined
  const { material, groundCover } = collider.platform
  if (groundCover && groundCover !== 'none') return 'grass'
  return material === 'steel' ? 'metal' : material === 'earth' ? 'earth' : 'stone'
}

/**
 * The surface a crate or ball strikes: what lies just past its lowest point, in the direction of its weight.
 * A box probes its lowest corners and the middle between them, so one tipped onto a ledge finds the ledge.
 */
export function surfaceUnder(run: Run, prop: Prop): Surface | undefined {
  const down = (prop.gravity ?? 1) < 0 ? -1 : 1, half = prop.size / 2
  let probes: [number, number][]
  if (prop.kind === 'box') {
    const cos = Math.cos(prop.angle), sin = Math.sin(prop.angle), cx = prop.x, cy = prop.y - half
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]): [number, number] => [cx + half * (u * cos - v * sin), cy + half * (u * sin + v * cos)])
    const lowest = Math.max(...corners.map(([, y]) => y * down))
    const contact = corners.filter(([, y]) => y * down > lowest - 1)
    probes = [...contact, [contact.reduce((sum, [x]) => sum + x, 0) / contact.length, contact[0][1]]]
  } else probes = [[prop.x, down > 0 ? prop.y : prop.y - prop.size]]
  const solids = [...solidColliders(run).filter(c => c.prop !== prop),
    ...run.robots.flatMap((robot, i) => robotPlatforms(robot).map((platform, piece) => ({ id: `robot:${i}:${piece}`, platform, robot })))]
  for (const [x, y] of probes) {
    const hit = solids.find(c => pointInside(c.platform, x, y + 3 * down))
    if (hit) return surfaceOf(hit)
  }
  return undefined
}

/** World-space falloff keeps distant machinery from filling the whole level with noise. */
export function soundPosition(x: number, y: number, listener: Player) {
  const distance = Math.hypot(x - listener.x, y - (listener.y - 30))
  return { volume: clamp((1400 - distance) / 500) / (1 + (distance / 400) ** 2), pan: clamp((x - listener.x) / 600, -.8, .8) }
}

function snapshot(p: Player, run: Run | null) {
  return {
    x: p.x, y: p.y, grounded: p.grounded, vx: p.vx, vy: p.vy,
    water: run ? playerSwimStrength(run.gravityField, p) : 0,
    fieldRevision: run?.gravityField.revision ?? 0,
    feet: p.anim.footwork?.feet.map(f => f.planted) ?? [],
    robots: run?.robots.map(robot => ({ robot, x: robot.x, y: robot.y, grounded: robot.actor?.grounded ?? false,
      vy: robot.actor?.vy ?? 0, feet: robot.actor?.anim.footwork?.feet.map(f => f.planted) ?? [],
      climbable: robot.actor?.climbing?.rope ?? robot.actor?.climbing?.ladder, climbDistance: robot.actor?.climbing?.distance,
      mantle: robot.actor?.mantle, mantleTime: robot.actor?.mantle?.time, awakening: robot.awakening?.elapsed ?? 0 })) ?? [],
    props: run?.props.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, water: propWaterStrength(run.gravityField, b), grounded: b.grounded, angle: b.angle, angularVelocity: b.angularVelocity })) ?? [],
    mechanisms: run?.mechanisms.map(m => ({ x: m.x, y: m.y })) ?? [],
    triggers: run?.triggers.map(t => t.active) ?? [],
    triggerPresses: run?.triggers.map(t => t.pressed) ?? [],
    coins: run?.coinsCollected ?? 0,
    outage: run?.empRemaining ?? 0, failed: run?.failed ?? false, playerOutage: run?.gadgets.disabled.get(p) ?? 0, shots: run?.gadgets.shots ?? 0,
    robotShots: run?.robots.map(robot => robot.shots ?? 0) ?? [],
    robotRams: run?.robots.map(robot => robot.rams ?? 0) ?? [],
    shoves: p.shoves ?? 0, robotShoves: run?.robots.map(robot => robot.actor?.shoves ?? 0) ?? [],
    propIdentities: run?.props.slice() ?? [],
    timeBonuses: run?.pickups.filter(p => p.definition.kind === 'time-bonus' && p.collectedAge !== null).length ?? 0,
    penalties: run?.pickups.filter(p => (p.definition.kind === 'time-penalty' || p.definition.kind === 'fast-stopwatch') && p.collectedAge !== null).length ?? 0,
    emps: run?.pickups.filter(p => p.definition.kind === 'emp' && p.collectedAge !== null).length ?? 0,
    goalLit: run?.goalLit ?? false, stopped: run?.timeStopRemaining ?? 0, exiting: !!run?.exit,
    lights: run?.level.wallLights?.map(light => !!run.switchStates.get(light.id)) ?? [],
    fields: run?.forceFields.map(field => field.active) ?? [],
    floats: run?.floatSwitches.map(float => float.active) ?? [],
    gauges: run?.levelGauges?.map(gauge => gauge.active) ?? [],
    shut: run?.gateShut?.map(contact => contact.active) ?? [],
  }
}

interface WaterContact { wet: boolean; dryTime: number }
const waterContact = (immersion: number): WaterContact => ({ wet: immersion > .001, dryTime: 0 })
function enteredWater(contact: WaterContact, immersion: number, dt: number) {
  // A little immersion rejects edge jitter. Fully clearing the water briefly
  // rearms the splash, so surface bobbing cannot replay an entry every frame.
  contact.dryTime = immersion <= .001 ? contact.dryTime + dt : 0
  if (contact.dryTime >= .12) contact.wet = false
  if (immersion < .02 || contact.wet) return false
  contact.wet = true
  return true
}
/** The resting waterline of the pool a body has entered at x, so a splash sits on the surface rather than at the body. */
function waterline(run: Run, x: number, y: number) {
  for (const plate of run.water.plates) {
    if (plate.effect !== 'water' || x < plate.x || x > plate.x + plate.w || y < plate.y - 80 || y > plate.y + plate.h) continue
    return plate.y
  }
  return y
}

/** Sounds that come now and then, spaced and placed from a fixed seed of their own, so a replay hears them as before. */
class Occasional {
  next = 0
  private seed: number; private readonly gap: number; private readonly spread: number
  constructor(seed: number, gap: number, spread: number) { this.seed = seed; this.gap = gap; this.spread = spread }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0
    return this.seed / 4294967296
  }
  start(time: number) { this.next = time + .4 * this.gap + this.spread * this.random() }
  due(time: number) {
    if (time < this.next) return false
    this.next = time + this.gap + this.spread * this.random()
    return true
  }
}
const BIRDS: readonly CueKind[] = ['bird-whistle', 'bird-trill', 'bird-chirp']

/** Observe solved contacts at physics cadence; drain cues once per rendered frame.
 * Water uses the existing active field and resolved body transforms. Sound never
 * changes physics, queries collision geometry, or advances the gait. */
export class JumpingAudioState {
  private previous: ReturnType<typeof snapshot> | null = null
  private loops: SoundLoop[] = []
  private cues: SoundCue[] = []
  private stepCooldown = 0
  private robotStepCooldowns: number[] = []
  private impacts: { angle: number; excursion: number; cooldown: number }[] = []
  private playerWater: WaterContact = waterContact(0)
  private propWater: WaterContact[] = []
  /** Where the ambience is heard from, read once per drawn frame rather than every step. */
  private listening: { run: Run | null; listener: Player } | null = null
  /** How far under water the listener's head is (listenerUnderwater). */
  private underwater = 0
  /** Drops into pools, birds under open sky and bubbles under water, on `run.activeTime`; the ending's birds on its own clock. */
  private readonly drips = new Occasional(1, 2.5, 5.5)
  private readonly birds = new Occasional(7, 2.2, 5)
  private readonly bubbles = new Occasional(13, .9, 2.2)
  private readonly endingBirds = new Occasional(29, 2.2, 5)
  private endingTime: number | null = null
  /** The power-down warning beat last sounded, so each beat beeps once. */
  private warningBeat: number | null = null

  reset(p: Player, run: Run | null) {
    this.previous = snapshot(p, run)
    this.loops = []; this.cues = []; this.stepCooldown = 0; this.robotStepCooldowns = []; this.impacts = []
    this.playerWater = waterContact(this.previous.water)
    this.propWater = this.previous.props.map(b => waterContact(b.water))
    this.listening = { run, listener: p }
    this.underwater = listenerUnderwater(run, p)
    const time = run?.activeTime ?? 0
    this.drips.start(time); this.birds.start(time); this.bubbles.start(time)
    this.endingTime = null
    // A respawn or resumed view does not repeat the beat already heard.
    this.warningBeat = run ? powerDownWarning(run)?.beat ?? null : null
  }

  step(p: Player, run: Run | null, dt: number) {
    if (!this.previous || dt <= 0) { this.reset(p, run); return }
    const before = this.previous
    const current = snapshot(p, run)
    if (current.propIdentities.length !== before.propIdentities.length || current.propIdentities.some((prop, i) => prop !== before.propIdentities[i])) { this.reset(p, run); return }
    const fieldChanged = current.fieldRevision !== before.fieldRevision
    this.stepCooldown = Math.max(0, this.stepCooldown - dt)
    const cue = (kind: CueKind, x: number, y: number, strength = 1, size?: number, surface?: Surface) => {
      const mix = soundPosition(x, y, p)
      if (mix.volume > .005 && this.cues.length < 8) this.cues.push({ kind, ...mix, strength, size, ...surface ? { surface } : {} })
    }
    // What the player sees of the same impacts, wherever they are, heard or not (worldEffects.ts).
    const effect = (kind: WorldEffectKind, x: number, y: number, strength: number, size: number, angle = 0, up = 1) => {
      if (run) recordWorldEffect(run, { kind, x, y, strength, size, angle, up, time: run.activeTime })
    }
    // A reduced-quality run draws no splashes; recording none keeps a later restore from replaying them.
    const splashes = run?.waterEffectsEnabled === true && run.waterSurface?.enabled !== false
    // Respawns and editor changes are not impacts. Support transport is excluded
    // by the contact solver, so standing on an elevator never produces footsteps.
    const continuous = Math.hypot(p.x - before.x, p.y - before.y) < 80
    // Resuming, teleporting, or powering water around a body is not an entry.
    if (!continuous || fieldChanged) this.playerWater = waterContact(current.water)
    else if (enteredWater(this.playerWater, current.water, dt)) {
      // Walking in makes no splash, and so no sound; a harder entry makes both, the picture growing on past the sound.
      const strength = splashEnergy(Math.max(splashEntrySpeed(before.vx, before.vy), splashEntrySpeed(p.vx, p.vy)), 60)
      if (strength > 0) cue('water-entry', p.x, p.y, Math.min(1, strength), 60)
      if (run && splashes && strength > 0) effect('splash', p.x, waterline(run, p.x, p.y), strength, 60)
    }
    const speed = p.contacts?.motion.speed ?? 0
    const plant = p.anim.footwork?.feet.some((f, i) => f.planted && before.feet[i] === false)
    const landing = !before.grounded && p.grounded && before.vy > 80
    // Hard landings kick up dust and land with a thump of their own, louder than any step; a slide makes its
    // own grit, and the bottom of a pool none. A softer landing sounds as a step.
    const dust = continuous && !before.grounded && p.grounded && !p.sliding?.active && current.water < .02
      ? landingDustStrength(before.vy * (p.inverted ? -1 : 1)) : 0
    if (continuous && !p.sliding?.active && !p.hang && !p.climbing && !p.mantle && this.stepCooldown === 0
      && (landing || p.grounded && !(p.freeFall?.amount && p.freeFall.recovery !== null) && speed > 8 && plant)) {
      const surface = surfaceOf(p.contacts?.support?.collider)
      if (landing && dust > 0) cue('landing', p.x, p.y, .45 + .55 * dust, undefined, surface)
      else cue('footstep', p.x, p.y, landing ? .5 + clamp(before.vy / 800) * .5 : .3 + clamp(speed / 350) * .5, undefined, surface)
      this.stepCooldown = .09
    }
    if (dust > 0) effect('landing', p.x, p.y, dust, 60, p.groundAngle, p.inverted ? -1 : 1)
    this.loops = []
    const boost = airBoostStrength(p)
    if (continuous && !run?.exit && boost >= .01) {
      this.loops.push({ id: 'player:booster', kind: 'booster', volume: boost, pan: 0, pace: boost, size: 0 })
    }
    if (run) {
      if (current.playerOutage > before.playerOutage + .1) cue('emp', p.x, p.y - 30)
      if ((p.shoves ?? 0) > before.shoves) cue('shove', p.x, p.y - 30)
      for (const [i, robot] of run.robots.entries()) if ((robot.actor?.shoves ?? 0) > (before.robotShoves[i] ?? 0)) cue('shove', robot.x, robot.y - 30)
      for (const [i, robot] of run.robots.entries()) if ((robot.shots ?? 0) > (before.robotShots[i] ?? 0)) cue('repulsor', robot.x, robot.y)
      for (const [i, robot] of run.robots.entries()) if ((robot.rams ?? 0) > (before.robotRams[i] ?? 0)) cue('shove', robot.x, robot.y - 20)
      for (const [i, robot] of run.robots.entries()) {
        const old = before.robots[i], actor = robot.actor
        this.robotStepCooldowns[i] = Math.max(0, (this.robotStepCooldowns[i] ?? 0) - dt)
        if (!old || old.robot !== robot) { this.robotStepCooldowns[i] = 0; continue }
        const distance = Math.hypot(robot.x - old.x, robot.y - old.y)
        if (distance >= 80 || powerOut(run) || robot.deactivated || run.gadgets.disabled.has(robot)) continue
        if (actor) {
          const waking = robot.awakening?.elapsed ?? 0
          if (waking > old.awakening && waking > 1 && waking < 3.3) {
            const opening = chargingBayOpening(waking) > chargingBayOpening(old.awakening)
            const mix = soundPosition(robot.definition.x, robot.definition.y - 45, p)
            this.loops.push({ id: `robot:${i}:pod`, kind: opening ? 'gate-open' : 'robot-servo', ...mix,
              volume: mix.volume * .6, pace: .3, size: 0 })
          }
          const speed = actor.contacts?.motion.speed ?? 0
          const plant = actor.anim.footwork?.feet.some((foot, footIndex) => foot.planted && old.feet[footIndex] === false)
          const landing = !old.grounded && actor.grounded && old.vy * (actor.inverted ? -1 : 1) > 80
          const dust = !old.grounded && actor.grounded && !actor.sliding?.active ? landingDustStrength(old.vy * (actor.inverted ? -1 : 1)) : 0
          if (!actor.sliding?.active && !actor.hang && !actor.climbing && !actor.mantle && !this.robotStepCooldowns[i]
            && (landing || actor.grounded && !(actor.freeFall?.amount && actor.freeFall.recovery !== null) && speed > 8 && plant)) {
            const surface = surfaceOf(actor.contacts?.support?.collider)
            if (landing && dust > 0) cue('robot-landing', robot.x, robot.y, .7 + .3 * dust, undefined, surface)
            else cue('robot-footstep', robot.x, robot.y, landing ? .7 + clamp(Math.abs(old.vy) / 800) * .3 : .5 + clamp(speed / 350) * .4, undefined, surface)
            this.robotStepCooldowns[i] = .11
          }
          if (dust > 0) effect('landing', robot.x, robot.y, dust, 60, actor.groundAngle, actor.inverted ? -1 : 1)
          // Material grip travel excludes idle rope swing. Pull-ups publish root
          // positions rather than velocities, so follow their advancing pose.
          const climb = actor.climbing
          const motor = climb && old.climbable === (climb.rope ?? climb.ladder) && old.climbDistance !== undefined
            ? Math.abs(climb.distance - old.climbDistance) / dt
            : actor.mantle && old.mantle === actor.mantle && old.mantleTime !== actor.mantle.time ? distance / dt : 0
          const travel = Math.min(distance / dt, motor)
          if (travel > 5) {
            const mix = soundPosition(robot.x, robot.y - 30, p)
            this.loops.push({ id: `robot:${i}:servo`, kind: 'robot-servo', ...mix,
              volume: mix.volume * clamp(travel / 90), pace: clamp(travel / 240), size: 0 })
          }
        } else if (robot.fallVelocity === undefined && robotDrive(robot)) {
          // Solved horizontal travel rejects blocked wheels and carried bodies.
          const speed = Math.min(Math.abs(robot.x - old.x) / dt, Math.abs(robot.vx))
          if (speed <= 5) continue
          const mix = soundPosition(robot.x, robot.y - 20, p)
          this.loops.push({ id: `robot:${i}:wheels`, kind: 'shovebot', ...mix,
            volume: mix.volume * clamp(speed / 90), pace: clamp(speed / 540), size: 0 })
        }
      }
      for (let i = 0; i < run.props.length; i++) {
        const b = run.props[i], old = before.props[i]
        if (!old) { this.propWater[i] = waterContact(current.props[i].water); continue }
        const distance = Math.hypot(b.x - old.x, b.y - old.y), rotation = Math.abs(b.angle - old.angle)
        if (distance > 80 || rotation > Math.PI / 2) { delete this.impacts[i]; this.propWater[i] = waterContact(current.props[i].water); continue }
        if (fieldChanged) this.propWater[i] = waterContact(current.props[i].water)
        else if (enteredWater(this.propWater[i] ??= waterContact(old.water), current.props[i].water, dt)) {
          // A rolling edge moves along the surface, as sideways motion does.
          const speed = Math.max(splashEntrySpeed(old.vx, old.vy), splashEntrySpeed(b.vx, b.vy), Math.abs(b.angularVelocity) * b.size / 4)
          const strength = splashEnergy(speed, b.size)
          if (strength > 0) cue('water-entry', b.x, b.y - b.size / 2, Math.min(1, strength), b.size)
          if (splashes && strength > 0) effect('splash', b.x, waterline(run, b.x, b.y - b.size / 2), strength, b.size)
        }
        const contact = this.impacts[i] ??= { angle: old.angle, excursion: 0, cooldown: 0 }
        contact.cooldown = Math.max(0, contact.cooldown - dt)
        // Ground contact includes terrain, elevators and supported props. Read
        // the incoming fall speed, before the solver removes it on landing.
        const landed = !old.grounded && b.grounded && old.vy > 60
        let strength = landed ? .2 + clamp((old.vy - 60) / 740) * .8 : 0
        if (b.kind === 'box') {
          contact.excursion = Math.max(contact.excursion, Math.abs(b.angle - contact.angle))
          // Each new edge hitting its support abruptly slows the tumble, even
          // when the box never leaves the ground. Ignore tiny settling chatter.
          const impact = (Math.abs(old.angularVelocity) - Math.abs(b.angularVelocity)) * b.size / 2
          if (b.grounded && impact > 18 && contact.excursion > .12) strength = Math.max(strength, .25 + clamp((impact - 18) / 160) * .7)
        }
        if (strength > 0 && contact.cooldown === 0) {
          cue(b.kind === 'box' ? 'box-impact' : 'ball-impact', b.x, b.y, strength, b.size, surfaceUnder(run, b))
          if (strength >= PROP_TICK_STRENGTH && current.props[i].water < .02) {
            // A tilted box rests on its lowest corner, below its upright base.
            const half = b.size / 2, contactY = b.kind === 'box' ? b.y - half + half * (Math.abs(Math.cos(b.angle)) + Math.abs(Math.sin(b.angle))) : b.y
            effect(b.kind === 'box' ? 'box-impact' : 'ball-impact', b.x, contactY, strength, b.size)
          }
          contact.angle = b.angle; contact.excursion = 0; contact.cooldown = .1
        }
        if (!b.grounded) continue
        // Velocities exclude being carried. Displacement excludes unresolved
        // pushing forces at a wall. A box pivoting on a corner makes impacts;
        // only travel beyond that rotation contributes to its sliding scrape.
        const travel = Math.min(distance / dt, Math.hypot(b.vx, b.vy))
        const roll = rotation * b.size / (2 * dt)
        const speed = b.kind === 'box' ? Math.max(0, travel - roll * Math.SQRT2) : Math.max(travel, roll)
        if (speed < 3) continue
        const mix = soundPosition(b.x, b.y, p), pace = clamp(speed / 240)
        this.loops.push({ id: `prop:${i}`, kind: b.kind, ...mix, volume: mix.volume * clamp((speed - 3) / 65), pace, size: b.size })
      }
      for (let i = 0; i < run.mechanisms.length; i++) {
        const m = run.mechanisms[i], old = before.mechanisms[i], d = m.definition
        if (!old) continue
        const speed = Math.hypot(m.x - old.x, m.y - old.y) / dt
        if (speed < 1) continue
        const opening = Math.hypot(m.x - d.x, m.y - d.y) > Math.hypot(old.x - d.x, old.y - d.y)
        const kind = d.kind === 'lift' ? 'elevator' : opening ? 'gate-open' : 'gate-close'
        const mix = soundPosition(m.x + d.w / 2, m.y + d.h / 2, p)
        this.loops.push({ id: `mechanism:${i}`, kind, ...mix, volume: mix.volume * clamp(speed / 65), pace: clamp(speed / 130), size: 100 })
      }
      run.triggers.forEach((t, i) => {
        const plate = run.level.triggers[i]
        // Shared indicator changes are silent at remote or already-held members.
        if (triggerToggleGroup(plate) && (!t.pressed || before.triggerPresses[i])) return
        const position = pressurePlatePosition(plate, run.mechanisms)
        if (t.active && before.triggers[i] === false || plate.mode !== 'coins' && (plate.behavior === 'switch' || plate.behavior === 'toggle') && !t.active && before.triggers[i] === true) cue('switch', position.x + plate.w / 2, position.y)
      })
      if (run.goalLit && !before.goalLit && run.level.goal) {
        // Exit activation announces progress throughout the level. Keep its
        // bearing, but bypass falloff and give it a slot ahead of nearby impacts.
        this.cues.unshift({ kind: 'switch', ...soundPosition(run.level.goal.x, run.level.goal.y, p), volume: 1, strength: 1 })
        if (this.cues.length > 8) this.cues.pop()
      }
      if (run.coinsCollected > before.coins) cue('coin', p.x, p.y - 30)
      if (run.empRemaining > before.outage + .01) cue('emp', p.x, p.y - 30)
      // Running out of time powers the whole level down: heard everywhere, ahead of nearby impacts.
      if (run.failed && !before.failed) {
        this.cues.unshift({ kind: 'power-down', volume: 1, pan: 0, strength: 1 })
        if (this.cues.length > 8) this.cues.pop()
      }
      // Its last ten seconds beep once a second, everywhere, until the power goes; the final three a little higher.
      const warning = powerDownWarning(run)
      if (warning && warning.beat !== this.warningBeat) {
        this.cues.unshift({ kind: 'power-warning', volume: 1, pan: 0, strength: 1, pitch: warning.remaining < 3 ? 1.19 : 1 })
        if (this.cues.length > 8) this.cues.pop()
      }
      this.warningBeat = warning?.beat ?? null
      if (run.gadgets.shots > before.shots) cue(run.gadgets.lastShotKind === 'emp' ? 'emp-shot' : run.gadgets.lastShotKind === 'tractor' ? 'tractor' : 'repulsor', p.x, p.y - 30)
      if (run.pickups.filter(p => (p.definition.kind === 'time-penalty' || p.definition.kind === 'fast-stopwatch') && p.collectedAge !== null).length > before.penalties) cue('time-penalty', p.x, p.y - 30)
      // Another stopwatch extends an existing pause and still deserves feedback.
      if (run.timeStopRemaining > before.stopped + .01 || run.pickups.filter(p => p.definition.kind === 'time-bonus' && p.collectedAge !== null).length > before.timeBonuses
        || run.exit && !before.exiting) cue('timer-paused', p.x, p.y - 30)
    }
    if (run) {
      for (const pump of runningPumps(run)) {
        const mix = soundPosition(pump.x, pump.y, p)
        this.loops.push({ id: `pump:${pump.index}`, kind: 'pump', ...mix, volume: mix.volume * .8, pace: clamp(pump.rate / 30), size: 0 })
      }
      // A light, a force field, a float switch or a level gauge changing over clicks its relay.
      const relays: [number, number][] = []
      for (const [i, light] of (run.level.wallLights ?? []).entries()) if (current.lights[i] !== before.lights[i]) relays.push([light.x, light.y])
      for (const [i, field] of run.forceFields.entries()) if (current.fields[i] !== before.fields[i]) {
        const d = field.definition
        relays.push([d.orientation === 'vertical' ? d.x + d.w / 2 : d.x, d.orientation === 'vertical' ? d.y : d.y + d.h / 2])
      }
      for (const [i, float] of run.floatSwitches.entries()) if (current.floats[i] !== before.floats[i]) relays.push([float.definition.x, float.definition.y])
      for (const [i, gauge] of (run.levelGauges ?? []).entries()) if (current.gauges[i] !== before.gauges[i]) relays.push([gauge.definition.x, gauge.definition.y])
      for (const [i, gate] of run.mechanisms.entries()) if (before.shut.length && current.shut[i] !== before.shut[i]) relays.push([gate.x + gate.definition.w / 2, gate.y])
      if (relays.length <= 4) for (const [x, y] of relays) cue('relay', x, y)
      else cue('relay', p.x, p.y - 30)
      this.drip(run, p)
      this.underwater = listenerUnderwater(run, p)
      // Under open sky the birds sing now and then; under water, bubbles rise past the head.
      if (this.birds.due(run.activeTime) && !this.underwater && underOpenSky(run, p) && this.cues.length < 8) this.cues.push(this.bird(this.birds))
      if (this.bubbles.due(run.activeTime) && this.underwater > .6 && this.cues.length < 8) {
        const b = this.bubbles
        this.cues.push({ kind: 'bubble', volume: 1, pan: (b.random() - .5) * .4, strength: .5 + .5 * b.random(), pitch: .8 + .45 * b.random() })
      }
    } else this.underwater = 0
    this.listening = { run, listener: p }
    this.previous = current
  }

  /** Now and then a drop falls into a pool within earshot, at a random place along its surface. Not outdoors. */
  private drip(run: Run, listener: Player) {
    const drips = this.drips
    if (!drips.due(run.activeTime)) return
    const environment = run.level.environment
    const pools = run.water.pools.filter(pool => pool.region.h > 0 && pool.region.w > 0)
    if (!pools.length) return
    const pool = pools[Math.floor(drips.random() * pools.length)].region
    const x = pool.x + pool.w * (.1 + .8 * drips.random())
    if (environment && openAirAt(environment, x, pool.y) && environment.kind === 'landscape') return
    const mix = soundPosition(x, pool.y, listener)
    if (mix.volume > .005 && this.cues.length < 8) this.cues.push({ kind: 'drip', ...mix, strength: .6 + .4 * drips.random() })
  }

  /** A bird somewhere out in the open, at a distance: one of a few calls, at its own pitch, off to one side. */
  private bird(schedule: Occasional): SoundCue {
    const kind = BIRDS[Math.floor(schedule.random() * BIRDS.length)]
    return { kind, volume: .3 + .7 * schedule.random(), pan: (schedule.random() - .5) * 1.4, strength: 1, pitch: .85 + .35 * schedule.random() }
  }

  drain(): SoundFrame {
    const cues = this.cues; this.cues = []
    const listening = this.listening
    return { loops: this.loops, cues, underwater: this.underwater,
      ambience: listening ? levelAmbience(listening.run, listening.listener, this.underwater) : {} }
  }

  /**
   * The bus ending, which plays on after the run: the bus idling while the robot boards, its doors and then its
   * brakes letting go, its engine revving through a gear change as it pulls away, and fading as the bus shrinks into
   * the distance, under the open air and the birds.
   */
  ending(ending: BusEnding, run: Run | null): SoundFrame {
    const t = ending.elapsed, before = this.endingTime ?? t
    if (this.endingTime === null) this.endingBirds.start(t)
    this.endingTime = t
    const frame = busEndingFrame(ending), cues: SoundCue[] = []
    const crossed = (time: number) => before < time && t >= time
    if (crossed(5.6)) cues.push({ kind: 'air-brake', volume: 1, pan: 0, strength: .55 })
    if (crossed(7.7)) cues.push({ kind: 'air-brake', volume: 1, pan: 0, strength: 1 })
    const goal = run?.level.goal
    const outside = goal?.kind === 'bus' && run ? underOpenSky(run, goal) : true
    if (this.endingBirds.due(t) && outside) cues.push(this.bird(this.endingBirds))
    // Revs: idle, then up as it pulls away, down through a gear change at 9.3 s, and up again.
    const rev = t < 7.9 ? 0 : t < 9.3 ? .85 * goalEase((t - 7.9) / 1.4) : t < 9.9 ? .85 - .35 * goalEase((t - 9.3) / .6) : .5 + .3 * goalEase((t - 9.9) / 2.5)
    // Walking up to a bus waiting at a stop brings it nearer; driving away it fades as it shrinks, a little lower in pitch.
    const near = t < 3.8 ? .55 + .45 * t / 3.8 : 1
    const ambience = goal?.kind === 'bus' && run ? levelAmbience(run, goal) : { air: { volume: 1, pan: 0, power: 1 } }
    ambience.engine = { volume: frame.busVisible ? near * frame.busScale ** 1.2 : 0, pan: 0, power: 1, pace: rev * (.85 + .15 * frame.busScale) }
    return { loops: [], cues, ambience }
  }
}
