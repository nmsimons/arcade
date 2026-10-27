import { levelHeight } from './level.ts'
import { groundAt } from './terrain.ts'
import { bodyIntersects, pointInside } from './geometry.ts'
import { advanceFootwork } from './footwork.ts'
import { translatePlayer } from './playerContacts.ts'
import type { Run } from './challenge.ts'

const KEY = 'arcade.jumping.exterior.v1'
/** Only an untimed outdoor ending resumes, never a timed course or live puzzle. */
export function saveExteriorProgress(storage: Pick<Storage, 'setItem'>, run: Run) {
  const p = run.player
  if (run.level.goal.kind !== 'overlook' || run.level.environment?.kind !== 'landscape' || !p.grounded || p.hang || p.climbing || p.mantle || run.finished) return
  const support = groundAt(run.terrain, p.x, p.y, .15)
  if (!support || Math.abs(support.angle) > .5) return
  // Resume starts from authored machine positions. Keep the previous checkpoint
  // while crossing a gateway that would initially overlap the standing body.
  if (run.level.mechanisms.some(m => bodyIntersects(p.x, p.y, m))) return
  const inside = run.level.environment.walls.some(w => pointInside(w, p.x, p.y - 40))
  if (inside) return
  storage.setItem(KEY, JSON.stringify({ id: run.level.id, x: p.x, y: p.y,
    switches: run.level.triggers.map((t, i) => t.mode !== 'coins' && t.behavior === 'switch' ? run.triggers[i].active : null) }))
}
export function restoreExteriorProgress(storage: Pick<Storage, 'getItem'>, run: Run) {
  if (run.level.goal.kind !== 'overlook' || run.level.environment?.kind !== 'landscape') return false
  try {
    const point = JSON.parse(storage.getItem(KEY) ?? 'null')
    if (!point || point.id !== run.level.id || !Number.isFinite(point.x) || !Number.isFinite(point.y)
      || point.x < 30 || point.x > run.level.width - 30 || point.y < 80 || point.y > levelHeight(run.level)) return false
    const surface = groundAt(run.terrain, point.x, point.y, 2)
    if (!surface || Math.abs(surface.angle) > .5 || run.platforms.some(b => bodyIntersects(point.x, surface.y, b))) return false
    if (run.level.environment.walls.some(w => pointInside(w, point.x, surface.y - 40))) return false
    const p = run.player
    translatePlayer(p, point.x - p.x, surface.y - p.y)
    p.spawnX = p.x; p.spawnY = p.y; p.vx = 0; p.vy = 0; p.grounded = true; p.groundAngle = surface.angle
    run.level.triggers.forEach((t, i) => {
      if (t.mode !== 'coins' && t.behavior === 'switch' && typeof point.switches?.[i] === 'boolean') run.triggers[i].active = point.switches[i]
    })
    advanceFootwork(p, 0, p.x, run.terrain)
    run.started = true; run.entrance = null
    return true
  } catch { return false }
}
export function clearExteriorProgress(storage: Pick<Storage, 'removeItem'>) { storage.removeItem(KEY) }
