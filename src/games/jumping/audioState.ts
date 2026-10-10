import type { Run } from './challenge.ts'
import type { Player } from './model.ts'
import { airBoostStrength } from './model.ts'
import { pressurePlatePosition } from './pressurePlateMount.ts'
import { playerSwimStrength, propWaterStrength } from './gravity.ts'

export type LoopKind = 'ball' | 'box' | 'gate-open' | 'gate-close' | 'elevator' | 'booster'
export type CueKind = 'footstep' | 'box-impact' | 'ball-impact' | 'water-entry' | 'switch' | 'timer-paused' | 'time-penalty' | 'coin' | 'emp'
export interface SoundCue { kind: CueKind; volume: number; pan: number; strength: number; size?: number }
export interface SoundLoop { id: string; kind: LoopKind; volume: number; pan: number; pace: number; size: number }
export interface SoundFrame { loops: SoundLoop[]; cues: SoundCue[] }
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n))

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
    feet: p.footwork?.feet.map(f => f.planted) ?? [],
    props: run?.props.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, water: propWaterStrength(run.gravityField, b), grounded: b.grounded, angle: b.angle, angularVelocity: b.angularVelocity })) ?? [],
    mechanisms: run?.mechanisms.map(m => ({ x: m.x, y: m.y })) ?? [],
    triggers: run?.triggers.map(t => t.active) ?? [],
    coins: run?.coinsCollected ?? 0,
    timeBonuses: run?.pickups.filter(p => p.definition.kind === 'time-bonus' && p.collectedAge !== null).length ?? 0,
    penalties: run?.pickups.filter(p => (p.definition.kind === 'time-penalty' || p.definition.kind === 'fast-stopwatch') && p.collectedAge !== null).length ?? 0,
    emps: run?.pickups.filter(p => p.definition.kind === 'emp' && p.collectedAge !== null).length ?? 0,
    goalLit: run?.goalLit ?? false, stopped: run?.timeStopRemaining ?? 0, exiting: !!run?.exit,
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
function splashStrength(speed: number, size: number) {
  return clamp((.2 + .8 * clamp(speed / 650)) * clamp(Math.sqrt(size / 60), .65, 1.3))
}

/** Observe solved contacts at physics cadence; drain cues once per rendered frame.
 * Water uses the existing active field and resolved body transforms. Sound never
 * changes physics, queries collision geometry, or advances the gait. */
export class JumpingAudioState {
  private previous: ReturnType<typeof snapshot> | null = null
  private loops: SoundLoop[] = []
  private cues: SoundCue[] = []
  private stepCooldown = 0
  private impacts: { angle: number; excursion: number; cooldown: number }[] = []
  private playerWater: WaterContact = waterContact(0)
  private propWater: WaterContact[] = []

  reset(p: Player, run: Run | null) {
    this.previous = snapshot(p, run)
    this.loops = []; this.cues = []; this.stepCooldown = 0; this.impacts = []
    this.playerWater = waterContact(this.previous.water)
    this.propWater = this.previous.props.map(b => waterContact(b.water))
  }

  step(p: Player, run: Run | null, dt: number) {
    if (!this.previous || dt <= 0) { this.reset(p, run); return }
    const before = this.previous
    const current = snapshot(p, run)
    const fieldChanged = current.fieldRevision !== before.fieldRevision
    this.stepCooldown = Math.max(0, this.stepCooldown - dt)
    const cue = (kind: CueKind, x: number, y: number, strength = 1, size?: number) => {
      const mix = soundPosition(x, y, p)
      if (mix.volume > .005 && this.cues.length < 8) this.cues.push({ kind, ...mix, strength, size })
    }
    // Respawns and editor changes are not impacts. Support transport is excluded
    // by the contact solver, so standing on an elevator never produces footsteps.
    const continuous = Math.hypot(p.x - before.x, p.y - before.y) < 80
    // Resuming, teleporting, or powering water around a body is not an entry.
    if (!continuous || fieldChanged) this.playerWater = waterContact(current.water)
    else if (enteredWater(this.playerWater, current.water, dt)) {
      cue('water-entry', p.x, p.y, splashStrength(Math.max(Math.hypot(before.vx, before.vy), Math.hypot(p.vx, p.vy)), 60), 60)
    }
    const speed = p.contacts?.motion.speed ?? 0
    const plant = p.footwork?.feet.some((f, i) => f.planted && before.feet[i] === false)
    const landing = !before.grounded && p.grounded && before.vy > 80
    if (continuous && !p.sliding?.active && !p.hang && !p.climbing && !p.mantle && this.stepCooldown === 0
      && (landing || p.grounded && !(p.freeFall?.amount && p.freeFall.recovery !== null) && speed > 8 && plant)) {
      cue('footstep', p.x, p.y, landing ? .5 + clamp(before.vy / 800) * .5 : .3 + clamp(speed / 350) * .5)
      this.stepCooldown = .09
    }
    this.loops = []
    const boost = airBoostStrength(p)
    if (continuous && !run?.exit && boost >= .01) {
      this.loops.push({ id: 'player:booster', kind: 'booster', volume: boost, pan: 0, pace: boost, size: 0 })
    }
    if (run) {
      for (let i = 0; i < run.props.length; i++) {
        const b = run.props[i], old = before.props[i]
        if (!old) { this.propWater[i] = waterContact(current.props[i].water); continue }
        const distance = Math.hypot(b.x - old.x, b.y - old.y), rotation = Math.abs(b.angle - old.angle)
        if (distance > 80 || rotation > Math.PI / 2) { delete this.impacts[i]; this.propWater[i] = waterContact(current.props[i].water); continue }
        if (fieldChanged) this.propWater[i] = waterContact(current.props[i].water)
        else if (enteredWater(this.propWater[i] ??= waterContact(old.water), current.props[i].water, dt)) {
          const speed = Math.max(Math.hypot(old.vx, old.vy), Math.hypot(b.vx, b.vy), Math.abs(b.angularVelocity) * b.size / 2)
          cue('water-entry', b.x, b.y - b.size / 2, splashStrength(speed, b.size), b.size)
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
          cue(b.kind === 'box' ? 'box-impact' : 'ball-impact', b.x, b.y, strength, b.size)
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
        const position = pressurePlatePosition(plate, run.mechanisms)
        if (t.active && before.triggers[i] === false || plate.mode !== 'coins' && plate.behavior === 'toggle' && !t.active && before.triggers[i] === true) cue('switch', position.x + plate.w / 2, position.y)
      })
      if (run.goalLit && !before.goalLit) cue('switch', run.level.goal.x, run.level.goal.y, .8)
      if (run.coinsCollected > before.coins) cue('coin', p.x, p.y - 30)
      if (run.pickups.filter(p => p.definition.kind === 'emp' && p.collectedAge !== null).length > before.emps) cue('emp', p.x, p.y - 30)
      if (run.pickups.filter(p => (p.definition.kind === 'time-penalty' || p.definition.kind === 'fast-stopwatch') && p.collectedAge !== null).length > before.penalties) cue('time-penalty', p.x, p.y - 30)
      // Another stopwatch extends an existing pause and still deserves feedback.
      if (run.timeStopRemaining > before.stopped + .01 || run.pickups.filter(p => p.definition.kind === 'time-bonus' && p.collectedAge !== null).length > before.timeBonuses
        || run.exit && !before.exiting) cue('timer-paused', p.x, p.y - 30)
    }
    this.previous = current
  }

  drain(): SoundFrame {
    const cues = this.cues; this.cues = []
    return { loops: this.loops, cues }
  }
}
