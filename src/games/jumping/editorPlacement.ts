import type { JumpLevel } from './level.ts'
import { levelTerrain, levelHeight } from './level.ts'
import { itemBounds, moveItem } from './editor.ts'
import type { Selection } from './editor.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from './geometry.ts'
import { ballShape } from './propGeometry.ts'
import { TUNING } from './model.ts'
import { goalBounds } from './goal.ts'
import { groundAt } from './terrain.ts'
import { canHangFromBox } from './boxSupport.ts'
import { disablePlatformLedges } from './terrainLedges.ts'

export function placementSolids(level: JumpLevel, selection?: Selection) {
  const props = (level.props ?? []).flatMap((p, i) => selection?.kind === 'prop' && i === selection.index ? []
    : [{ prop: p, shape: p.kind === 'ball' ? ballShape(p) : { x: p.x - p.size / 2, y: p.y - p.size, w: p.size, h: p.size } }])
  const solids = [...levelTerrain(level).filter(b => selection?.kind !== 'platform' || b !== level.platforms[selection.index]),
    ...(level.mechanisms ?? []).filter((_, i) => selection?.kind !== 'mechanism' || i !== selection.index),
    ...props.map(p => p.shape)]
  for (const { prop, shape } of props) if (!canHangFromBox({ ...prop, grounded: true, angle: 0, angularVelocity: 0, vx: 0, vy: 0 }, solids.filter(b => b !== shape))) disablePlatformLedges(shape)
  return solids
}

export function canPlaceOnSurface(selection: Selection) {
  return ['platform', 'prop', 'mechanism', 'robot', 'trigger', 'spawn', 'checkpoint', 'goal', 'ladder'].includes(selection.kind)
}

/** Find an exposed support under the actual footprint, not a distant nearest center point. */
export function surfacePlacement(level: JumpLevel, selection: Selection, reach = Infinity) {
  if (!canPlaceOnSurface(selection)) return null
  const bounds = itemBounds(level, selection)
  if (!bounds) return null
  const marker = ['spawn', 'checkpoint', 'goal'].includes(selection.kind)
  const footprint = selection.kind === 'goal' && level.goal ? goalBounds(level.goal) : { ...bounds, x: bounds.w ? bounds.x : bounds.x - TUNING.width / 2,
    w: bounds.w || TUNING.width, y: marker ? bounds.y - TUNING.height : bounds.y, h: marker ? TUNING.height : bounds.h }
  const bottom = footprint.y + footprint.h, solids = placementSolids(level, selection)
  const supports = marker ? levelTerrain(level) : solids
  const prop = selection.kind === 'prop' ? level.props?.[selection.index] : undefined
  const candidates: { y: number; left: number; right: number; delta: number }[] = []
  for (const solid of supports) {
    const points = polygonPoints(solid)
    for (const [i, a] of points.entries()) {
      const b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      if (dx <= .01 || Math.abs(dy / dx) > .8) continue
      const left = Math.max(footprint.x, a[0]), right = Math.min(footprint.x + footprint.w, b[0])
      if (right - left < .5) continue
      const slope = dy / dx, surface = (x: number) => a[1] + (x - a[0]) * slope
      let y = Math.min(surface(left), surface(right))
      if (marker) {
        if (bounds.x < a[0] || bounds.x > b[0]) continue
        y = surface(bounds.x)
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
      const shape = selection.kind === 'platform' ? { ...level.platforms[selection.index], y: bounds.y + delta }
        : prop?.kind === 'ball' ? ballShape({ ...prop, y: prop.y + delta }) : { ...footprint, y: footprint.y + delta }
      if (solids.some(other => marker && selection.kind !== 'goal' ? bodyIntersects(bounds.x, y, other)
        : polygonIntersects(polygonPoints(shape), other, .02))) continue
      candidates.push({ y, left, right, delta })
    }
  }
  candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))
  return candidates[0] ?? null
}

export function placeOnSurface(level: JumpLevel, selection: Selection, reach = Infinity) {
  const support = surfacePlacement(level, selection, reach)
  return support && Math.abs(support.delta) > .001 ? moveItem(level, selection, 0, support.delta) : level
}
