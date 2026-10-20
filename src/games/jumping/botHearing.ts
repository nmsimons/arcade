import type { RobotState, Run } from './challenge.ts'
import type { Player } from './model.ts'
import { lineBlocked } from './geometry.ts'

type NoiseKind = 'running' | 'landing' | 'gadget'
interface Noise { x: number; y: number; time: number; kind: NoiseKind; range: number; serial: number }
export interface HeardNoise { x: number; y: number; time: number; kind: NoiseKind; uncertainty: number; serial: number }
const snapshot = (run: Run) => ({ player: run.player, x: run.player.x, y: run.player.y, vy: run.player.vy,
  grounded: run.player.grounded, feet: run.player.footwork?.feet.map(foot => foot.planted) ?? [], shots: run.gadgets.shots })
interface Acoustics { previous: ReturnType<typeof snapshot>; cooldown: number; serial: number; noises: Noise[] }
const acoustics = new WeakMap<Run, Acoustics>(), heard = new WeakMap<RobotState, HeardNoise>(), processed = new WeakMap<RobotState, number>()
export const botLastHeard = (robot: RobotState) => { const noise = heard.get(robot); return noise && { ...noise } }

export function resetPlayerNoise(run: Run) {
  acoustics.set(run, { previous: snapshot(run), cooldown: 0, serial: 0, noises: [] })
}

/** Observe solved player contacts, independently of speaker volume or rendering.
 * Quiet travel, transport, respawning and NPC shots do not reveal the player. */
export function recordPlayerNoise(run: Run, dt: number) {
  if (!run.robots.some(robot => robot.definition.kind === 'repulsor')) return
  if (!acoustics.has(run)) resetPlayerNoise(run)
  const state = acoustics.get(run)!, before = state.previous, p: Player = run.player
  state.cooldown = Math.max(0, state.cooldown - dt)
  state.noises = state.noises.filter(noise => run.activeTime - noise.time < .15)
  const emit = (kind: NoiseKind, range: number) => state.noises.push({ kind, range, x: p.x, y: p.y,
    time: run.activeTime, serial: ++state.serial })
  const continuous = before.player === p && Math.hypot(p.x - before.x, p.y - before.y) < 80
  if (continuous) {
    const landed = !before.grounded && p.grounded && Math.abs(before.vy) > 240
    const planted = p.footwork?.feet.some((foot, index) => foot.planted && before.feet[index] === false)
    const speed = p.contacts?.motion.speed ?? 0
    if (landed) emit('landing', Math.min(850, 500 + Math.abs(before.vy) * .4) * (p.crouching ? .65 : 1))
    else if (!state.cooldown && p.grounded && speed > 180 && planted && !p.crouching && !p.sliding?.active
      && !p.climbing && !p.hang && !p.mantle) { emit('running', 500); state.cooldown = .2 }
  }
  if (run.gadgets.shots > before.shots) emit('gadget', 1000)
  state.previous = snapshot(run)
}

/** Each listener receives a brief event once, then remembers its coarse bearing.
 * The remembered point never follows a silent player behind cover. */
export function hearPlayer(run: Run, robot: RobotState) {
  const state = acoustics.get(run)
  if (!state) return heard.get(robot)
  const previousSerial = processed.get(robot) ?? 0
  if (state.serial <= previousSerial) return heard.get(robot)
  const solids = [...run.terrain, ...run.mechanisms.map(mechanism => ({ ...mechanism.definition, x: mechanism.x, y: mechanism.y }))]
  for (const noise of state.noises) {
    if (noise.serial <= previousSerial || run.activeTime - noise.time >= .15) continue
    const distance = Math.hypot(noise.x - robot.x, noise.y - robot.y)
    if (distance > noise.range) continue
    const from = [robot.x, robot.y - 45] as const, to = [noise.x, noise.y - 30] as const
    const walls = solids.filter(solid => lineBlocked(from, to, [solid])).length
    if (distance > noise.range * .5 ** Math.min(walls, 3)) continue
    const grid = walls ? 96 : 64
    heard.set(robot, { kind: noise.kind, x: Math.round(noise.x / grid) * grid, y: Math.round(noise.y / 32) * 32,
      time: noise.time, uncertainty: grid * .75, serial: noise.serial })
  }
  processed.set(robot, state.serial)
  return heard.get(robot)
}
