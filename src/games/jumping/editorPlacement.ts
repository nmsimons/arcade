import type { JumpLevel } from './level.ts'
import { copyLevel, levelTerrain, levelHeight } from './level.ts'
import { attachPressurePlateOnSurface } from './pressurePlateMount.ts'
import { itemBounds, moveItem } from './editor.ts'
import type { Selection } from './editor.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from './geometry.ts'
import { ballShape } from './propGeometry.ts'
import { TUNING } from './model.ts'
import { goalBounds } from './goal.ts'
import { groundAt } from './terrain.ts'
import { editorSolids } from './editorGeometry.ts'
import { robotHulls, robotSupport } from './robotPhysics.ts'
import { plateSolids, plateSurface } from './plateSurface.ts'

export function canPlaceOnSurface(selection: Selection, level?: JumpLevel) {
  if (selection.kind === 'trigger' && level?.triggers?.[selection.index]?.mode === 'coins') return false
  return ['platform', 'prop', 'mechanism', 'robot', 'trigger', 'spawn', 'checkpoint', 'goal', 'ladder', 'gravity-plate'].includes(selection.kind)
}

type SurfacePlacement = { y: number; left: number; right: number; delta: number; ceiling?: boolean }
/** Find an exposed support under the actual footprint, not a distant nearest center point. */
export function surfacePlacement(level: JumpLevel, selection: Selection, reach = Infinity): SurfacePlacement | null {
  if (!canPlaceOnSurface(selection, level)) return null
  const plate = selection.kind === 'gravity-plate' ? level.gravityPlates?.[selection.index]
    : selection.kind === 'trigger' ? level.triggers?.[selection.index] : undefined
  if (plate && (!('mode' in plate) || plate.mode !== 'coins')) {
    const gravity = 'gravity' in plate, anchor = gravity && !plate.ceiling ? plate.y + plate.h : plate.y
    const support = plateSurface(plateSolids(level), plate.x, plate.w, anchor, reach, !!plate.ceiling,
      (y, ceiling) => !gravity || (ceiling ? y >= 0 && y + plate.h <= levelHeight(level) : y - plate.h >= 0 && y <= levelHeight(level)))
    return support && { ...support, delta: gravity ? support.y - (support.ceiling ? 0 : plate.h) - plate.y : support.delta }
  }
  const bounds = itemBounds(level, selection)
  if (!bounds) return null
  const marker = ['spawn', 'checkpoint', 'goal'].includes(selection.kind)
  const footprint = selection.kind === 'goal' && level.goal ? goalBounds(level.goal) : { ...bounds, x: bounds.w ? bounds.x : bounds.x - TUNING.width / 2,
    w: bounds.w || TUNING.width, y: marker ? bounds.y - TUNING.height : bounds.y, h: marker ? TUNING.height : bounds.h }
  const bottom = footprint.y + footprint.h, solids = editorSolids(level, selection)
  const supports = marker ? levelTerrain(level) : solids
  const prop = selection.kind === 'prop' ? level.props?.[selection.index] : undefined
  const robot = selection.kind === 'robot' ? level.robots?.[selection.index] : undefined
  const candidates: { y: number; left: number; right: number; delta: number }[] = []
  for (const solid of supports) {
    const points = polygonPoints(solid)
    for (const [i, a] of points.entries()) {
      const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      if (dx <= .01 || !robot && Math.abs(dy / dx) > .8) continue
      const left = Math.max(footprint.x, a[0]), right = Math.min(footprint.x + footprint.w, b[0])
      if (right - left < .5) continue
      const slope = dy / dx, surface = (x: number) => a[1] + (x - a[0]) * slope
      let y = Math.min(surface(left), surface(right))
      if (robot) {
        if (robot.x < a[0] || robot.x > b[0]) continue
        // Files retain the surface height at the bot's center. Rendering and
        // gameplay solve the round wheels from that same authored anchor.
        y = surface(robot.x)
      }
      if (marker) {
        const supportX = selection.kind === 'goal' ? footprint.x + footprint.w / 2 : bounds.x
        if (supportX < a[0] || supportX > b[0]) continue
        y = surface(supportX)
        if (selection.kind === 'goal' && (Math.abs(slope) > .001 || Array.from({ length: Math.ceil(footprint.w / 8) + 1 }, (_, j) => {
          const support = groundAt(supports, footprint.x + Math.min(j * 8, footprint.w), y, .15)
          return !support || Math.abs(support.angle) > .001
        }).some(Boolean))) continue
      }
      if (prop?.kind === 'ball') {
        // Use the same round hull as physics, including contacts at an edge's end.
        const hull = polygonPoints(ballShape(prop)), contacts = hull.filter(p => p[0] >= a[0] && p[0] <= b[0])
        hull.forEach((p, j) => {
          const q = hull[(j + 1) % hull.length]
          for (const x of [a[0], b[0]]) if ((p[0] - x) * (q[0] - x) < 0) contacts.push([x, p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0])])
        })
        y = Math.min(...contacts.map(p => surface(p[0]) - p[1] + prop.y))
      }
      const delta = y - bottom
      if (y < footprint.h || y > levelHeight(level) || Math.abs(delta) > reach || reach === Infinity && delta < -20) continue
      let robotShapes: ReturnType<typeof robotHulls> | undefined
      if (robot) {
        const pose = robotSupport(solids, robot.x, y, Math.atan(slope), 55)
        if (!pose) continue
        robotShapes = robotHulls({ ...pose, facing: -1, phase: 'patrol' })
        if (robotShapes.some(hull => hull.some(([x, y]) => x < 0 || x > level.width || y < 0 || y > levelHeight(level)))) continue
      }
      const shape = selection.kind === 'platform' ? { ...level.platforms[selection.index], y: bounds.y + delta }
        : prop?.kind === 'ball' ? ballShape({ ...prop, y: prop.y + delta }) : { ...footprint, y: footprint.y + delta }
      if (solids.some(other => robotShapes ? robotShapes.some(hull => polygonIntersects(hull, other, .02))
        : marker && selection.kind !== 'goal' ? bodyIntersects(bounds.x, y, other)
        : polygonIntersects(polygonPoints(shape), other, .02))) continue
      candidates.push({ y, left, right, delta })
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
  return candidates[0] ?? null
}

export function placeOnSurface(level: JumpLevel, selection: Selection, reach = Infinity) {
  const support = surfacePlacement(level, selection, reach)
  if (support?.ceiling !== undefined) {
    const next = copyLevel(level)
    const plate = selection.kind === 'gravity-plate' ? next.gravityPlates![selection.index] : next.triggers![selection.index]
    if ('mode' in plate && plate.mode === 'coins') return level
    if (support.ceiling) plate.ceiling = true; else delete plate.ceiling
    plate.y = support.y - ('gravity' in plate && !support.ceiling ? plate.h : 0)
    if ('mode' in plate) attachPressurePlateOnSurface(next, plate)
    return next
  }
  const next = support && Math.abs(support.delta) > .001 ? moveItem(level, selection, 0, support.delta) : level
  if (support && selection.kind === 'trigger') {
    const attached = copyLevel(next)
    attachPressurePlateOnSurface(attached, attached.triggers![selection.index])
    return attached
  }
  return next
}
