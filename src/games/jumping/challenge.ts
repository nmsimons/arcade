import { bodyIntersects } from './geometry.ts'
import { cancelJumpInput, STEP, stepPlayer, TUNING } from './model.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { levelPlayer, levelTerrain, prepareLevelRopes } from './level.ts'
import type { PuzzleLevel, Mechanism, Pusher } from './level.ts'
import { FIRST_LEVEL } from './levels.ts'
export { FIRST_LEVEL } from './levels.ts'
export type { PuzzleLevel } from './level.ts'
import { groundAt, platformSurface } from './terrain.ts'

export type Medal = 'Gold' | 'Silver' | 'Bronze' | 'No medal'
export interface Prop {
  kind: 'box' | 'ball'; x: number; y: number; size: number; vx: number; vy: number; angle: number; grounded: boolean
}
export interface MechanismState { definition: Mechanism; y: number; direction: number; wait: number; active: boolean }
export interface RobotState { definition: Pusher; x: number; y: number; facing: number; phase: 'patrol' | 'chase' | 'windup' | 'charge' | 'recover'; time: number; hit: boolean }
export interface Run {
  level: PuzzleLevel; player: Player; props: Prop[]; platforms: Platform[]; terrain: Platform[]
  mechanisms: MechanismState[]; triggers: { held: number; active: boolean }[]; robots: RobotState[]; shoveCooldown: number
  elapsed: number; started: boolean; finished: boolean; medal: Medal | null
}
export const BEST_TIME_KEY = 'arcade.jumping.times.v1'
export function medalFor(seconds: number, level = FIRST_LEVEL): Medal {
  return seconds <= level.times.gold ? 'Gold' : seconds <= level.times.silver ? 'Silver' : seconds <= level.times.bronze ? 'Bronze' : 'No medal'
}
export function formatTime(seconds: number) {
  const centiseconds = Math.floor((seconds + 1e-7) * 100)
  return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`
}
export function readBest(storage: Pick<Storage, 'getItem'>, id = FIRST_LEVEL.id): number | null {
  try { const value = JSON.parse(storage.getItem(BEST_TIME_KEY) ?? '{}')[id]; return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null } catch { return null }
}
export function saveBest(storage: Pick<Storage, 'getItem' | 'setItem'>, seconds: number, id = FIRST_LEVEL.id): number {
  const best = Math.min(readBest(storage, id) ?? Infinity, seconds)
  let values: Record<string, unknown> = {}
  try { const parsed: unknown = JSON.parse(storage.getItem(BEST_TIME_KEY) ?? '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) values = parsed as Record<string, unknown> } catch { /* Replace an unreadable record. */ }
  storage.setItem(BEST_TIME_KEY, JSON.stringify({ ...values, [id]: best }))
  return best
}
const boxShape = (b: Prop): Platform => ({ x: b.x - b.size / 2, y: b.y - b.size, w: b.size, h: b.size })
export function createRun(level = FIRST_LEVEL): Run {
  level = prepareLevelRopes(level)
  const run: Run = { level, player: levelPlayer(level), props: level.props.map(p => ({ ...p, vx: 0, vy: 0, angle: 0, grounded: true })),
    terrain: levelTerrain(level), platforms: [],
    mechanisms: level.mechanisms.map(definition => ({ definition, y: definition.y, direction: -1, wait: 0, active: false })),
    triggers: level.triggers.map(() => ({ held: 0, active: false })),
    robots: level.robots.map(definition => ({ definition, x: definition.x, y: definition.y, facing: -1, phase: 'patrol', time: 0, hit: false })),
    shoveCooldown: 0, elapsed: 0, started: false, finished: false, medal: null }
  syncPlatforms(run)
  return run
}
function syncPlatforms(run: Run) {
  run.platforms = [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, y: m.y })), ...run.props.filter(b => b.kind === 'box').map(boxShape)]
}
const approach = (from: number, to: number, delta: number) => from + Math.max(-delta, Math.min(delta, to - from))
const bodyOverlap = (p: Player, b: Platform, dy = 0) => bodyIntersects(p.x, p.y + dy, b)
function translatePlayer(p: Player, dx: number, dy: number) {
  p.x += dx; p.y += dy
  if (p.footwork) for (const foot of p.footwork.feet) { foot.x += dx; foot.y += dy; foot.anchorX += dx; foot.anchorY += dy; foot.groundY += dy }
  if (p.hang) { p.hang.edgeX += dx; p.hang.edgeY += dy; p.hang.caught.x += dx; p.hang.caught.y += dy }
  if (p.mantle) { p.mantle.edgeX += dx; p.mantle.edgeY += dy; p.mantle.toX += dx; p.mantle.toY += dy }
}
function stepMechanisms(run: Run, dt: number) {
  for (const [index, m] of run.mechanisms.entries()) {
    if (!m.active) continue
    if (m.wait > 0) { m.wait -= dt; continue }
    const def = m.definition, oldY = m.y, target = m.direction < 0 ? def.y - def.travel : def.y
    const next = approach(oldY, target, 130 * dt), dy = next - oldY, p = run.player
    const platformIndex = run.terrain.length + index
    const onCrate = run.props.some(b => b.kind === 'box' && b.grounded && Math.abs(b.y - oldY) < .2 && b.x >= def.x && b.x <= def.x + def.w
      && p.grounded && Math.abs(p.y - (b.y - b.size)) < .2 && Math.abs(p.x - b.x) < b.size / 2)
    const rider = onCrate || p.grounded && Math.abs(p.y - oldY) < .2 && p.x >= def.x && p.x <= def.x + def.w
      || p.hang?.platform === platformIndex || !!p.mantle && Math.abs(p.mantle.edgeY - oldY) < .2 && p.mantle.edgeX >= def.x && p.mantle.edgeX <= def.x + def.w
    const nextShape = { ...def, y: next }
    const obstacles = run.platforms.filter((_, i) => i !== platformIndex)
    if (rider && obstacles.some(b => bodyOverlap(p, b, dy)) || !rider && bodyOverlap(p, nextShape)) continue
    if (run.props.some(b => b.x + b.size / 2 > def.x && b.x - b.size / 2 < def.x + def.w
      && b.y > next + .2 && b.y - b.size < next + def.h && Math.abs(b.y - oldY) > .2)) continue
    m.y = next
    if (rider) translatePlayer(p, 0, dy)
    for (const b of run.props) if (b.grounded && Math.abs(b.y - oldY) < .2 && b.x > def.x && b.x < def.x + def.w) b.y += dy
    if (next === target && def.kind === 'lift') { m.direction *= -1; m.wait = target < def.y ? 3 : 2 }
  }
}
function propSurface(b: Prop, terrain: Platform, x: number) {
  const s = platformSurface(terrain, x)
  // Circle center follows the normal offset of the slope, so its rim stays tangent.
  return { ...s, y: s.y - (b.kind === 'ball' ? b.size / 2 * (1 / Math.cos(s.angle) - 1) : 0) }
}
function stepProps(run: Run, input: JumpInput, dt: number) {
  const p = run.player
  for (const b of run.props) {
    const oldX = b.x, oldY = b.y, r = b.size / 2
    const solids = [...run.terrain, ...run.mechanisms.map(m => ({ ...m.definition, y: m.y })), ...run.props.filter(other => other !== b && other.kind === 'box').map(boxShape)]
    const direction = Math.sign(input.move), edge = b.x - direction * r, gap = (edge - p.x) * direction
    const pushing = p.grounded && !p.climbing && !p.hang && !p.mantle && direction && gap >= 8 && gap < 34
      && p.y > b.y - b.size + 12 && p.y - 42 < b.y && p.y <= b.y + b.size * .6
    const support = solids.find(s => oldX >= s.x && oldX <= s.x + s.w && Math.abs(oldY - propSurface(b, s, oldX).y) < 2)
    if (pushing) b.vx = direction * (b.kind === 'ball' ? 175 : 90) * Math.abs(input.move)
    else if (support) {
      const angle = propSurface(b, support, oldX).angle
      if (b.kind === 'ball') b.vx += Math.sin(angle) * 900 * dt
      const onPlate = run.level.triggers.some(t => Math.abs(b.x - (t.x + t.w / 2)) < t.w / 2 && Math.abs(b.y - t.y) < 4)
      b.vx = approach(b.vx, 0, (b.kind === 'box' ? 850 : onPlate ? 350 : 65) * dt)
    }
    b.x += b.vx * dt
    // Solid sides and ceilings are resolved independently from terrain tops.
    for (const s of solids) {
      if (b.x + r <= s.x || b.x - r >= s.x + s.w || oldY <= propSurface(b, s, b.x).y + 1 || oldY - b.size >= s.y + s.h) continue
      if (oldX + r <= s.x + .1 && b.vx > 0) { b.x = s.x - r; b.vx = 0 }
      else if (oldX - r >= s.x + s.w - .1 && b.vx < 0) { b.x = s.x + s.w + r; b.vx = 0 }
    }
    b.vy = Math.min(1000, b.vy + TUNING.gravity * dt); b.y += b.vy * dt; b.grounded = false
    for (const s of solids) {
      if (b.x < s.x || b.x > s.x + s.w) continue
      const surface = propSurface(b, s, b.x), before = propSurface(b, s, oldX)
      const follow = support === s && Math.abs(surface.angle) < .75
      if (b.vy >= 0 && (oldY <= before.y + 2 || follow) && b.y >= surface.y) { b.y = surface.y; b.vy = 0; b.grounded = true }
    }
    const riding = b.kind === 'box' && p.grounded && Math.abs(p.y - (oldY - b.size)) < .2 && Math.abs(p.x - oldX) < r
    const holding = b.kind === 'box' && p.hang?.platform === run.terrain.length + run.mechanisms.length + run.props.filter(other => other.kind === 'box').indexOf(b)
    if (b.kind === 'box' && !riding && !holding && bodyOverlap(p, boxShape(b))) {
      // Loose crates displace a person only into free space, and stop when pinned.
      const side = p.x + 12 <= oldX - r + .1 ? -1 : p.x - 12 >= oldX + r - .1 ? 1 : 0
      if (side) {
        const x = b.x + side * (r + 12 + .01)
        if (!solids.some(s => bodyOverlap({ ...p, x }, s))) translatePlayer(p, x - p.x, 0)
        else { b.x = oldX; b.vx = 0 }
      } else if (oldY <= p.y - TUNING.height + .1) { b.y = p.y - TUNING.height - .01; b.vy = 0 }
    }
    const dx = b.x - oldX, dy = b.y - oldY
    if (b.kind === 'ball') b.angle += dx / r
    if (riding || holding) translatePlayer(p, dx, dy)
  }
}
function collideBalls(run: Run) {
  const p = run.player
  if (p.climbing || p.hang || p.mantle) return
  for (const ball of run.props.filter(b => b.kind === 'ball')) {
    const r = ball.size / 2, cy = ball.y - r
    const nearestY = Math.max(p.y - 50, Math.min(p.y - 12, cy)), dx = p.x - ball.x, dy = nearestY - cy, distance = Math.hypot(dx, dy)
    if (distance >= r + 12 || !distance) continue
    const nx = dx / distance, ny = dy / distance, overlap = r + 12 - distance
    const nextX = p.x + nx * overlap, nextY = p.y + ny * overlap
    // Resolve only into free space; a ball never squeezes someone through terrain.
    if (!run.platforms.some(s => bodyOverlap({ ...p, x: nextX, y: nextY }, s))) {
      p.x = nextX; p.y = nextY
      if (ny < -.65 && p.vy >= 0) { p.vy = 0; p.grounded = true }
      else if (Math.sign(p.vx) !== Math.sign(nx)) p.vx = 0
    } else { ball.vx = 0; ball.x = p.x - Math.sign(nx || 1) * (r + 12) }
  }
}
function stepRobots(run: Run, dt: number) {
  const p = run.player
  run.shoveCooldown = Math.max(0, run.shoveCooldown - dt)
  for (const r of run.robots) {
    const bounds = r.definition, gap = p.x - r.x
    const seesPlayer = Math.abs(p.y - r.y) < 240 && Math.abs(gap) < 850 && p.x >= bounds.left - 200 && p.x <= bounds.right + 200
    r.time += dt
    let speed = 0
    if (r.phase === 'patrol' || r.phase === 'chase') {
      r.phase = seesPlayer ? 'chase' : 'patrol'
      if (seesPlayer) {
        r.facing = Math.sign(gap) || r.facing
        if (Math.abs(gap) < 145 && Math.abs(p.y - r.y) < 95) { r.phase = 'windup'; r.time = 0; r.hit = false }
      }
      speed = r.phase === 'chase' ? 235 : r.phase === 'patrol' ? 92 : 0
    } else if (r.phase === 'windup' && r.time >= .22) { r.phase = 'charge'; r.time = 0 }
    else if (r.phase === 'charge') {
      speed = 540
      if (!r.hit && run.shoveCooldown === 0 && Math.abs(p.x - r.x) < 52 && p.y > r.y - 52 && p.y - 62 < r.y && !p.mantle) {
        p.hang = null; p.climbing = null; p.wallBrace = null; p.wallJump = null; p.grabCooldown = .5
        p.knockback = r.facing * 510; p.vx = p.knockback; p.vy = -170; p.grounded = false; p.footwork = null
        cancelJumpInput(p); r.hit = true; run.shoveCooldown = .8
      }
      for (const b of run.props) if (Math.abs(b.x - r.x) < b.size / 2 + 34 && Math.abs(b.y - r.y) < 60) b.vx = r.facing * (b.kind === 'ball' ? 500 : 280)
      if (r.time >= .52 || r.x <= bounds.left || r.x >= bounds.right) { r.phase = 'recover'; r.time = 0 }
    } else if (r.phase === 'recover' && r.time >= .34) { r.phase = 'chase'; r.time = 0 }
    if (speed) {
      const x = Math.max(bounds.left, Math.min(bounds.right, r.x + r.facing * speed * dt))
      const surface = groundAt(run.platforms, x, r.y, Math.abs(x - r.x) * .85 + 2)
      const blocked = !surface || run.platforms.some(b => x + 25 > b.x && x - 25 < b.x + b.w && r.y - 2 > platformSurface(b, x).y && r.y - 42 < b.y + b.h)
      if (!blocked) { r.x = x; r.y = surface.y }
      if ((blocked || x === bounds.left || x === bounds.right) && r.phase === 'patrol') r.facing *= -1
    }
  }
}
export function stepRun(run: Run, input: JumpInput, dt = STEP) {
  if (run.finished) return
  if (!run.started && (Math.abs(input.move) > .01 || input.jump || input.climb || input.descend)) run.started = true
  if (!run.started) return
  run.elapsed += dt
  stepMechanisms(run, dt); syncPlatforms(run)
  stepProps(run, input, dt); syncPlatforms(run)
  stepPlayer(run.player, input, dt, run.platforms, run.level.climbables, { checkpoints: [], fallY: Infinity })
  collideBalls(run); stepRobots(run, dt)
  run.level.triggers.forEach((plate, index) => {
    const sensor = run.triggers[index]
    const weighted = run.props.some(b => Math.abs(b.x - (plate.x + plate.w / 2)) <= plate.w / 2 - 6 && Math.abs(b.y - plate.y) < 3 && b.grounded)
    const touched = plate.mode === 'touch' && run.player.grounded && Math.abs(run.player.y - plate.y) < 3 && run.player.x >= plate.x && run.player.x <= plate.x + plate.w
    sensor.held = weighted || touched ? sensor.held + dt : 0
    if (sensor.held >= .15) sensor.active = true
    if (sensor.active) { const mechanism = run.mechanisms.find(m => m.definition.id === plate.target); if (mechanism) mechanism.active = true }
  })
  if (run.player.grounded && Math.abs(run.player.x - run.level.flag.x) < 28 && Math.abs(run.player.y - run.level.flag.y) < 4) {
    run.finished = true; run.medal = medalFor(run.elapsed, run.level); cancelJumpInput(run.player)
  }
}
