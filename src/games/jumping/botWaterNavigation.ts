import type { Run } from './challenge.ts'
import type { Platform, Player } from './model.ts'
import { createPlayer, TUNING } from './model.ts'
import { bodyIntersects } from './geometry.ts'
import { playerWaterCenterOffset } from './gravity.ts'
import { groundAt } from './terrain.ts'

type Point = { x: number; y: number }
export const MAX_BOT_WATER_NODES = 64
const standingCenter = playerWaterCenterOffset(createPlayer({ x: 0, y: 0 }))
/** Swimming changes the foot root as the body turns. Route the displaced body,
 * so entering a prone stroke cannot move its apparent destination downward. */
export const botWaterPosition = (actor: Player): Point => ({ x: actor.x, y: actor.y + playerWaterCenterOffset(actor) - standingCenter })
/** Feet coordinates, matching the surface and climb graph. */
export function botWaterPoint(run: Run, point: Point) {
  const y = point.y - TUNING.height / 2
  return run.water.pools.some(({ region: p }) => p.h > 0 && point.x >= p.x && point.x <= p.x + p.w && y >= p.y && y <= p.y + p.h)
}

/** Waterlines move continuously; refresh topology only after a meaningful change.
 * Live connections still check the actual filled rectangles on every replan. */
export const botWaterGraphKey = (run: Run) => run.water.pools.map(({ region: p }) => `${Math.round(p.y / 40)}:${p.h > 0}`).join('|')

export function botWaterSurface(run: Run, point: Point): Point | undefined {
  const pool = run.water.pools.find(({ region: p }) => p.h > 0 && point.x >= p.x && point.x <= p.x + p.w
    && point.y - TUNING.height / 2 >= p.y && point.y - TUNING.height / 2 <= p.y + p.h)
  return pool && { x: point.x, y: pool.region.y + Math.min(pool.region.h, TUNING.height * .78) }
}

/** Clear the whole swimmer beneath a bank before rising beside its lip. A
 * diagonal shortcut can fit an upright route hull while pinning a pitched rig. */
export function botWaterDetour(run: Run, actor: Player, target: Point, solids: readonly Platform[]) {
  const position = botWaterPosition(actor), ceiling = (actor.waterMotion?.ceiling?.amount ?? 0) > .05
  const launchReach = TUNING.directedJumpSpeed ** 2 / (2 * TUNING.gravity) + TUNING.height
  if (!ceiling && target.y >= position.y - 10) return
  for (const roof of solids) {
    const bottom = roof.y + roof.h, margin = TUNING.height * .6
    if (actor.x < roof.x - margin || actor.x > roof.x + roof.w + margin
      || bottom > position.y - TUNING.height * .25 || bottom < position.y - launchReach
      || !ceiling && target.y - TUNING.height / 2 >= bottom) continue
    const side = target.x >= roof.x + roof.w ? 1 : target.x <= roof.x ? -1
      : actor.x >= roof.x + roof.w / 2 ? 1 : -1
    const edge = side > 0 ? roof.x + roof.w : roof.x
    const y = Math.max(position.y, bottom + TUNING.height + 16)
    for (const gap of [60, 48, 36, 24]) {
      const x = edge + side * gap, surface = botWaterSurface(run, { x, y })
      if (surface && botSwimClear(run, position, { x, y }, solids)
        && botSwimClear(run, { x, y }, surface, solids)) return { x, y, surfaceY: surface.y, cleared: false }
    }
  }
}

/** Add a bounded set of water waypoints without displacing land/climb routes.
 * The first lane is a surface float; deeper lanes permit deliberate dives and
 * routes beneath obstacles instead of aiming at an unreachable dry floor. */
export function botWaterNodes(run: Run, solids: readonly Platform[]): Point[] {
  const pools = run.water.pools.filter(p => p.region.h > 0), nodes: Point[] = []
  const budget = Math.max(4, Math.floor(MAX_BOT_WATER_NODES / Math.max(1, pools.length)))
  for (const { region: p } of pools) {
    const columns = Math.max(2, Math.min(12, Math.floor(budget / 2), Math.floor(Math.sqrt(budget * p.w / Math.max(100, p.h)))))
    const rows = Math.max(2, Math.floor(budget / columns))
    const top = Math.min(p.y + p.h, p.y + TUNING.height * .78), bottom = p.y + p.h
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = p.x + 20 + Math.max(0, p.w - 40) * column / (columns - 1), y = top + (bottom - top) * row / (rows - 1)
      if (!solids.some(s => bodyIntersects(x, y - .05, s, TUNING.height))) nodes.push({ x, y })
    }
  }
  return nodes
}

/** A swimming edge needs continuous water and real body clearance. Disconnected
 * reservoirs, exposed gaps, red fields and mechanisms cannot become swim routes. */
export function botSwimClear(run: Run, a: Point, b: Point, solids: readonly Platform[]) {
  if ('waterMotion' in a && a.waterMotion) {
    const position = botWaterPosition(a as Player), floor = groundAt(solids, position.x, position.y, TUNING.height * .25)
    // A prone swimmer's equivalent standing feet may sit just beneath the
    // floor. Start the route hull on that floor instead of losing every edge
    // and repeatedly turning back toward a nearest-node fallback.
    a = { ...position, y: floor ? Math.min(position.y, floor.y) : position.y }
  }
  const length = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.max(1, Math.ceil(length / 20))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (!botWaterPoint(run, point) || solids.some(s => bodyIntersects(point.x, point.y - .05, s, TUNING.height))) return false
  }
  return true
}
