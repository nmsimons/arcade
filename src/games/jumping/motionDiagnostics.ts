import { athletePose } from './athlete.ts'
import type { JumpInput, Player } from './model.ts'
import { playerTurnAngle } from './ropeGravity.ts'

const HISTORY_SECONDS = 2, WINDOW_SECONDS = .25, MAX_SAMPLES = 240, MAX_REPORTS = 8
const pointNames = ['hip', 'shoulder', 'head', 'frontElbow', 'frontHand', 'backElbow', 'backHand',
  'frontKnee', 'frontFoot', 'backKnee', 'backFoot'] as const

function snapshot(p: Player, input: JumpInput, time: number) {
  const pose = athletePose(p)
  return {
    time, x: p.x, y: p.y, vx: p.vx, vy: p.vy, input: { ...input },
    signals: {
      mode: p.mantle?.step ? 'step' : p.mantle ? 'mantle' : p.hang ? 'hang' : p.climbing?.kind
        ?? ((p.freeFall?.amount ?? 0) > 0 ? p.freeFall?.recovery === null ? 'fall' : 'get-up' : 'free'),
      grounded: p.grounded, inverted: !!p.inverted, sliding: !!p.sliding?.active, bracing: !!p.wallBrace?.active, facing: p.facing,
      support: p.contacts?.support?.collider.id ?? null, push: p.contacts?.push?.collider.id ?? null,
    },
    blends: { push: p.pushing?.amount ?? 0, slide: p.sliding?.amount ?? 0, air: p.gait?.air ?? 0, fall: p.freeFall?.amount ?? 0, gravityTurn: playerTurnAngle(p) },
    contacts: {
      palms: p.pushing?.palms?.map(palm => ({ ...palm })) ?? [],
      feet: [pose.frontLeg, pose.backLeg].map(leg => ({ planted: leg.planted,
        x: p.x + leg.end[0] * p.facing, y: p.y + leg.end[1] * (p.inverted ? -1 : 1) })),
      hands: [pose.frontArm, pose.backArm].map(arm => ({
        x: p.x + (arm.hand ?? arm.end)[0] * p.facing, y: p.y + (arm.hand ?? arm.end)[1] * (p.inverted ? -1 : 1) })),
    },
    // Local-space joints separate pose changes from physical root and camera travel.
    points: [pose.hip, pose.shoulder, pose.head, pose.frontArm.joint, pose.frontArm.end,
      pose.backArm.joint, pose.backArm.end, pose.frontLeg.joint, pose.frontLeg.end,
      pose.backLeg.joint, pose.backLeg.end].map(point => [...point]),
  }
}
type MotionSample = ReturnType<typeof snapshot>
export interface MotionReport { time: number; level: string; reasons: string[]; samples: MotionSample[] }

function sameIntent(a: JumpInput, b: JumpInput) {
  return Math.sign(a.move) === Math.sign(b.move) && a.jump === b.jump && a.climb === b.climb
    && a.drop === b.drop && a.crouch === b.crouch && a.reach === b.reach
    && !!a.descend === !!b.descend && !!a.detach === !!b.detach
}

/** Repeated A/B reversals, not a normal sequence through several different contacts. */
function chatters(values: unknown[]) {
  const changes = values.filter((value, i) => !i || value !== values[i - 1])
  return changes.filter((value, i) => i >= 2 && value === changes[i - 2]).length >= 3
}

function reversals(samples: MotionSample[], point: (sample: MotionSample) => number[], minimumSpeed: number) {
  let previous: number[] | null = null, count = 0
  for (let i = 1; i < samples.length; i++) {
    const a = point(samples[i - 1]), b = point(samples[i]), dt = samples[i].time - samples[i - 1].time
    const velocity = b.map((v, j) => (v - a[j]) / dt)
    const speed = Math.hypot(...velocity), oldSpeed = previous ? Math.hypot(...previous) : 0
    if (previous && speed > minimumSpeed && oldSpeed > minimumSpeed
      && velocity.reduce((sum, v, j) => sum + v * previous![j], 0) < -.75 * speed * oldSpeed) count++
    previous = velocity
  }
  return count >= 3
}

/** Opt-in observer of completed physics steps. Never changes contacts, controls or poses. */
export class JumpingMotionDiagnostics {
  private player: Player | null = null
  private time = 0
  private intentSince = 0
  private episodeUntil = 0
  private samples: MotionSample[] = []
  private reports: MotionReport[] = []

  reset() {
    this.player = null; this.samples = []; this.intentSince = this.time; this.episodeUntil = 0
  }

  read() {
    // No live Player, collider or pose references escape through the debug interface.
    return structuredClone({ reports: this.reports, recent: this.samples })
  }

  step(p: Player, input: JumpInput, dt: number, level: string): MotionReport | null {
    if (!(dt > 0 && dt <= .05) || !p.contacts) { this.reset(); return null }
    const previous = this.samples.at(-1)
    // New runs, respawns and teleports are discontinuities, not instability.
    if (this.player !== p || previous && Math.hypot(p.x - previous.x, p.y - previous.y) > 80) this.reset()
    this.player = p; this.time += dt
    if (!previous || !sameIntent(previous.input, input)) this.intentSince = this.time
    const sample = snapshot(p, input, this.time)
    this.samples.push(sample)
    while (this.samples.length > MAX_SAMPLES || this.samples[0].time < this.time - HISTORY_SECONDS) this.samples.shift()
    const window = this.samples.filter(s => s.time >= Math.max(this.intentSince, this.time - WINDOW_SECONDS))
    if (window.length < 5) return null
    const reasons: string[] = []
    for (const signal of Object.keys(sample.signals) as (keyof MotionSample['signals'])[]) {
      if (chatters(window.map(s => s.signals[signal]))) reasons.push(`state:${signal}`)
    }
    for (const axis of ['x', 'y'] as const) {
      if (reversals(window, s => [s[axis]], 20)) reasons.push(`root:${axis}`)
    }
    for (const [i, name] of pointNames.entries()) {
      if (reversals(window, s => s.points[i], 240)) reasons.push(`pose:${name}`)
    }
    if (!reasons.length) return null
    const continuing = this.time < this.episodeUntil
    this.episodeUntil = this.time + .5
    if (continuing) return null
    const report = { time: this.time, level, reasons, samples: structuredClone(this.samples) }
    this.reports.push(report)
    if (this.reports.length > MAX_REPORTS) this.reports.shift()
    return structuredClone(report)
  }
}
