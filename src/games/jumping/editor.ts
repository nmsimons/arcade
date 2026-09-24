import type { JumpLevel } from './level.ts'
import { copyLevel, snapToGround, newLevelId, levelTerrain, levelHeight } from './level.ts'
import { TUNING } from './model.ts'
import type { Platform } from './model.ts'
import { asTrial, carvePit, pusherRange } from './puzzleEditor.ts'
import { platformSurface } from './terrain.ts'
import { nearestBoundary, pointInside, polygonPoints, validPolygon } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { ropePath, ropeSegmentCount } from './climbables.ts'
import { goalBounds } from './goal.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer.ts'
import { pickupBounds } from './pickups.ts'

export type Tool = 'select' | 'pan' | 'polygon' | 'platform' | 'ramp' | 'rough' | 'rope' | 'ladder' | 'spawn' | 'checkpoint' | 'pillar' | 'pit' | 'goal' | 'box' | 'ball' | 'pusher' | 'plate' | 'lift' | 'gate' | 'timer' | 'text' | 'stopwatch'
export type Selection = { kind: 'platform' | 'rope' | 'ladder' | 'spawn' | 'checkpoint' | 'goal' | 'prop' | 'robot' | 'mechanism' | 'trigger' | 'timer' | 'text' | 'pickup'; index: number }
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** The editor's origin is the bottom-left; version 1 files and physics use Y-down. */
export function resizeLevelHeight(level: JumpLevel, requested: number): JumpLevel {
  if (!Number.isFinite(requested)) return level
  const before = levelHeight(level)
  // Shrink from the ceiling, stopping before any authored object is cropped.
  const tops = allSelections(level).map(s => {
    const b = itemOutline(level, s)!
    const clearance = s.kind === 'spawn' || s.kind === 'checkpoint' ? TUNING.height : 0
    return b.y - clearance
  })
  const height = clamp(requested, Math.ceil(Math.max(400, ...tops.map(y => before - y))), 6000)
  const dy = height - before
  if (!dy) return level
  const next = copyLevel(level)
  next.height = height
  if (next.floor !== undefined) next.floor = height
  for (const point of [next.spawn, ...next.checkpoints, ...(next.goal ? [next.goal] : []), ...next.platforms,
    ...(next.props ?? []), ...(next.robots ?? []), ...(next.mechanisms ?? []), ...(next.triggers ?? []), ...(next.timers ?? []), ...(next.texts ?? []), ...(next.pickups ?? [])]) point.y += dy
  for (const ladder of next.climbables.ladders) { ladder.top += dy; ladder.bottom += dy }
  for (const rope of next.climbables.ropes) {
    rope.y += dy
    // Local terrain anchors stay unchanged. Rebuild cached world-space geometry
    // against the resized room before previewing, playing, or saving the level.
    delete rope.rest
  }
  return next
}
export function itemBounds(level: JumpLevel, selection: Selection) {
  const i = selection.index
  if (selection.kind === 'platform') return level.platforms[i] ?? null
  if (selection.kind === 'rope') { const r = level.climbables.ropes[i]; return r ? { x: r.x, y: r.y, w: 0, h: r.length } : null }
  if (selection.kind === 'ladder') { const l = level.climbables.ladders[i]; return l ? { x: l.x, y: l.top, w: 0, h: l.bottom - l.top } : null }
  if (selection.kind === 'prop') { const b = level.props?.[i]; return b ? { x: b.x - b.size / 2, y: b.y - b.size, w: b.size, h: b.size } : null }
  if (selection.kind === 'robot') { const r = level.robots?.[i]; return r ? { x: r.x - 26, y: r.y - 50, w: 52, h: 50 } : null }
  if (selection.kind === 'mechanism') return level.mechanisms?.[i] ?? null
  if (selection.kind === 'trigger') { const t = level.triggers?.[i]; return t ? { x: t.x, y: t.y - 8, w: t.w, h: 8 } : null }
  if (selection.kind === 'goal') return level.goal ? { ...level.goal, w: 0, h: 0 } : null
  if (selection.kind === 'timer') { const timer = level.timers?.[i]; return timer ? { ...timer, w: WALL_TIMER_WIDTH, h: WALL_TIMER_HEIGHT } : null }
  if (selection.kind === 'text') return level.texts?.[i] ?? null
  if (selection.kind === 'pickup') { const p = level.pickups?.[i]; return p ? pickupBounds(p) : null }
  const p = selection.kind === 'spawn' ? level.spawn : level.checkpoints[i]
  return p ? { x: p.x, y: p.y, w: 0, h: 0 } : null
}
export function itemOutline(level: JumpLevel, selection: Selection) {
  if (selection.kind === 'goal' && level.goal) return goalBounds(level.goal)
  const rope = selection.kind === 'rope' ? level.climbables.ropes[selection.index] : undefined
  const points = rope ? ropePath(rope) : undefined
  if (!points) return itemBounds(level, selection)
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
export function itemHandle(level: JumpLevel, selection: Selection) {
  const tip = selection.kind === 'rope' ? level.climbables.ropes[selection.index]?.rest?.points.at(-1) : undefined
  const b = itemBounds(level, selection)
  return tip ? { x: tip[0], y: tip[1] } : b ? { x: b.x + b.w, y: b.y + b.h } : null
}
export function hitItem(level: JumpLevel, x: number, y: number, tolerance: number): Selection | null {
  if (Math.abs(x - level.spawn.x) < tolerance * 1.5 && y <= level.spawn.y + tolerance && y >= level.spawn.y - 62 - tolerance) return { kind: 'spawn', index: 0 }
  for (let i = level.checkpoints.length - 1; i >= 0; i--) if (Math.hypot(x - level.checkpoints[i].x, y - level.checkpoints[i].y + 25) < tolerance * 3) return { kind: 'checkpoint', index: i }
  if (level.goal) {
    const b = goalBounds(level.goal)
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'goal', index: 0 }
  }
  for (let i = (level.pickups?.length ?? 0) - 1; i >= 0; i--) {
    const b = pickupBounds(level.pickups![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'pickup', index: i }
  }
  for (const kind of ['prop', 'robot', 'trigger', 'mechanism'] as const) {
    const length = (kind === 'prop' ? level.props : kind === 'robot' ? level.robots : kind === 'trigger' ? level.triggers : level.mechanisms)?.length ?? 0
    for (let i = length - 1; i >= 0; i--) { const b = itemBounds(level, { kind, index: i })!; if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind, index: i } }
  }
  for (let i = level.climbables.ropes.length - 1; i >= 0; i--) {
    const r = level.climbables.ropes[i]
    const points = ropePath(r)
    if (points.slice(1).some((b, j) => {
      const a = points[j], dx = b[0] - a[0], dy = b[1] - a[1]
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1)
      return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= tolerance
    })) return { kind: 'rope', index: i }
  }
  for (let i = level.climbables.ladders.length - 1; i >= 0; i--) {
    const l = level.climbables.ladders[i]
    if (Math.abs(x - l.x) <= tolerance + 8 && y >= l.top - tolerance && y <= l.bottom + tolerance) return { kind: 'ladder', index: i }
  }
  for (let i = level.platforms.length - 1; i >= 0; i--) {
    const b = level.platforms[i]
    if (pointInside(b, x, y)) return { kind: 'platform', index: i }
  }
  // Wall objects sit behind the terrain and other playable objects.
  for (let i = (level.timers?.length ?? 0) - 1; i >= 0; i--) {
    const t = level.timers![i]
    if (x >= t.x - tolerance && x <= t.x + WALL_TIMER_WIDTH + tolerance && y >= t.y - tolerance && y <= t.y + WALL_TIMER_HEIGHT + tolerance) return { kind: 'timer', index: i }
  }
  for (let i = (level.texts?.length ?? 0) - 1; i >= 0; i--) {
    const t = level.texts![i]
    if (x >= t.x - tolerance && x <= t.x + t.w + tolerance && y >= t.y - tolerance && y <= t.y + t.h + tolerance) return { kind: 'text', index: i }
  }
  return null
}
export function replacePlatform(level: JumpLevel, index: number, platform: Platform): JumpLevel {
  const next = copyLevel(level), before = level.platforms[index]
  next.platforms[index] = platform
  for (const ladder of next.climbables.ladders) if (ladder.platform === index) {
    ladder.x = ladder.side === 1 ? platform.x - 16 : platform.x + platform.w + 16
    ladder.bottom += platform.y - before.y; ladder.top = platform.y
  }
  for (const rope of next.climbables.ropes) if (rope.anchor?.platform === index) {
    rope.anchor.x *= platform.w / before.w; rope.anchor.y *= platform.h / before.h
    const edge = nearestBoundary(platform, platform.x + rope.anchor.x, platform.y + rope.anchor.y)
    rope.x = edge.x; rope.y = edge.y; rope.anchor.x = edge.x - platform.x; rope.anchor.y = edge.y - platform.y
  }
  // Carry start/checkpoint markers with the surface that supports them.
  for (const p of [next.spawn, ...next.checkpoints, ...(next.goal ? [next.goal] : [])]) if (p.x >= before.x && p.x <= before.x + before.w && Math.abs(p.y - platformSurface(before, p.x).y) < .1) {
    p.x = platform.x + (p.x - before.x) / before.w * platform.w; p.y = platformSurface(platform, p.x).y
  }
  return next
}
export function moveItem(level: JumpLevel, selection: Selection, dx: number, dy: number): JumpLevel {
  const b = itemBounds(level, selection)
  if (!b) return level
  const attached = selection.kind === 'platform' ? level.climbables.ladders.filter(l => l.platform === selection.index) : []
  const x = clamp(b.x + dx, attached.some(l => l.side === 1) ? 16 : 0, level.width - b.w - (attached.some(l => l.side === -1) ? 16 : 0))
  const y = clamp(b.y + dy, 0, levelHeight(level) - b.h)
  if (selection.kind === 'platform') return replacePlatform(level, selection.index, { ...level.platforms[selection.index], x, y })
  const next = copyLevel(level)
  if (selection.kind === 'rope') { Object.assign(next.climbables.ropes[selection.index], { x, y }); delete next.climbables.ropes[selection.index].anchor }
  if (selection.kind === 'ladder') {
    const ladder = next.climbables.ladders[selection.index]
    ladder.x = x; ladder.bottom = y + b.h; ladder.top = y; ladder.platform = -1
  }
  if (selection.kind === 'spawn') next.spawn = snapToGround(next, x, y)
  if (selection.kind === 'checkpoint') next.checkpoints[selection.index] = snapToGround(next, x, y)
  if (selection.kind === 'goal') {
    const b = goalBounds({ x: 0, y: 0 })
    next.goal = snapToGround(next, clamp(x, -b.x, level.width - b.x - b.w), y)
  }
  if (selection.kind === 'timer') Object.assign(next.timers![selection.index], { x, y })
  if (selection.kind === 'text') Object.assign(next.texts![selection.index], { x, y })
  if (selection.kind === 'pickup') {
    const bounds = pickupBounds({ x: 0, y: 0 })
    Object.assign(next.pickups![selection.index], { x: x - bounds.x, y: y - bounds.y })
  }
  if (selection.kind === 'prop') Object.assign(next.props![selection.index], { x: clamp(x + b.w / 2, 24 + b.w / 2, level.width - 24 - b.w / 2), y: Math.min(next.floor!, y + b.h) })
  if (selection.kind === 'robot') {
    const r = next.robots![selection.index], point = snapToGround(next, clamp(x + 26, 50, next.width - 50), y + 50)
    Object.assign(r, point, pusherRange(next, point.x, point.y))
  }
  if (selection.kind === 'mechanism') Object.assign(next.mechanisms![selection.index], { x: clamp(x, 24, next.width - b.w - 24), y: Math.min(next.floor! - b.h, y) })
  if (selection.kind === 'trigger') { const t = next.triggers![selection.index], point = snapToGround(next, x + b.w / 2, y + 8); t.x = clamp(x, 24, next.width - t.w - 24); t.y = point.y }
  return next
}
export function resizeItem(level: JumpLevel, selection: Selection, w: number, h: number): JumpLevel {
  const next = copyLevel(level)
  if (selection.kind === 'text') {
    const t = next.texts![selection.index]
    t.w = clamp(w, 40, Math.min(2000, next.width - t.x)); t.h = clamp(h, 24, Math.min(1200, levelHeight(next) - t.y))
  }
  if (selection.kind === 'platform') {
    const before = level.platforms[selection.index], rightLadder = level.climbables.ladders.some(l => l.platform === selection.index && l.side === -1)
    const width = clamp(w, 20, level.width - before.x - (rightLadder ? 16 : 0)), height = clamp(h, 10, levelHeight(level) - before.y)
    return replacePlatform(level, selection.index, { ...before, w: width, h: height,
      ...(before.polygon ? { polygon: before.polygon.map(([x, y]) => [x / before.w * width, y / before.h * height] as [number, number]) } : {}),
      ...(before.profile ? { profile: before.profile.map(([x, y]) => [x / before.w * width, y / before.h * height] as [number, number]) } : {}) })
  }
  if (selection.kind === 'rope') next.climbables.ropes[selection.index].length = clamp(h, 80, Math.min(2000, levelHeight(level) - next.climbables.ropes[selection.index].y))
  if (selection.kind === 'ladder') {
    const ladder = next.climbables.ladders[selection.index]; ladder.bottom = clamp(ladder.top + h, ladder.top + 80, levelHeight(level))
  }
  if (selection.kind === 'prop') {
    const b = next.props![selection.index], size = clamp(w !== b.size ? w : h, 30, 200)
    b.size = size; b.x = clamp(b.x, 24 + size / 2, next.width - 24 - size / 2)
  }
  if (selection.kind === 'mechanism') {
    const m = next.mechanisms![selection.index]; m.w = clamp(w, 30, Math.min(600, next.width - m.x - 24)); m.h = clamp(h, 12, 800); m.y = Math.min(m.y, next.floor! - m.h)
  }
  if (selection.kind === 'trigger') { const t = next.triggers![selection.index]; t.w = clamp(w, 40, Math.min(240, next.width - t.x - 24)) }
  return next
}
export function deleteItem(level: JumpLevel, selection: Selection): JumpLevel {
  const next = copyLevel(level), i = selection.index
  if (selection.kind === 'spawn' || selection.kind === 'goal') return level
  if (selection.kind === 'platform') {
    next.platforms.splice(i, 1)
    next.climbables.ladders = next.climbables.ladders.map(l => ({ ...l, platform: l.platform === i ? -1 : l.platform > i ? l.platform - 1 : l.platform }))
    for (const r of next.climbables.ropes) if (r.anchor) {
      if (r.anchor.platform === i) delete r.anchor
      else if (r.anchor.platform > i) r.anchor.platform--
    }
  } else if (selection.kind === 'rope') next.climbables.ropes.splice(i, 1)
  else if (selection.kind === 'timer') next.timers!.splice(i, 1)
  else if (selection.kind === 'text') next.texts!.splice(i, 1)
  else if (selection.kind === 'pickup') next.pickups!.splice(i, 1)
  else if (selection.kind === 'ladder') next.climbables.ladders.splice(i, 1)
  else if (selection.kind === 'prop') next.props!.splice(i, 1)
  else if (selection.kind === 'robot') next.robots!.splice(i, 1)
  else if (selection.kind === 'trigger') next.triggers!.splice(i, 1)
  else if (selection.kind === 'mechanism') { const [m] = next.mechanisms!.splice(i, 1); next.triggers!.forEach(t => { if (t.target === m.id) t.target = '' }) }
  else next.checkpoints.splice(i, 1)
  return next
}
export function addItem(level: JumpLevel, tool: Tool, start: { x: number; y: number }, end: { x: number; y: number }): { level: JumpLevel; selection: Selection } | null {
  const next = copyLevel(level), x = clamp(Math.min(start.x, end.x), 0, level.width - 40), y = clamp(Math.min(start.y, end.y), 0, levelHeight(level) - 80)
  if (tool === 'text') {
    const texts = next.texts ??= []
    if (texts.length >= 80) throw new Error('This level already has 80 wall text areas.')
    const click = Math.hypot(end.x - start.x, end.y - start.y) < 10
    const w = clamp(click ? 320 : Math.abs(end.x - start.x), 40, Math.min(2000, next.width))
    const h = clamp(click ? 100 : Math.abs(end.y - start.y), 24, Math.min(1200, levelHeight(next)))
    texts.push({ x: clamp(x, 0, next.width - w), y: clamp(y, 0, levelHeight(next) - h), w, h, text: 'Your text', fontSize: 28, align: 'left' })
    return { level: next, selection: { kind: 'text', index: texts.length - 1 } }
  }
  if (['platform', 'pillar', 'ramp', 'rough'].includes(tool)) {
    if (next.platforms.length >= 160) throw new Error('This level already has 160 terrain pieces.')
    const click = Math.hypot(end.x - start.x, end.y - start.y) < 10
    const w = Math.min(level.width - x, Math.max(40, click ? tool === 'platform' ? 180 : tool === 'pillar' ? 80 : 320 : Math.abs(end.x - start.x)))
    const h = Math.max(20, click ? tool === 'pillar' ? 180 : 100 : Math.abs(end.y - start.y)), b: Platform = { x, y, w, h: Math.min(levelHeight(level) - y, h) }
    if (tool === 'pillar') {
      const center = x + w / 2
      const support = levelTerrain(next).filter(s => center >= s.x && center <= s.x + s.w)
        .map(s => platformSurface(s, center).y).filter(top => top >= y + 20).sort((a, b) => a - b)[0]
      if (support !== undefined) b.h = Math.min(2000, support - y)
    }
    if (tool === 'ramp') b.profile = start.y < end.y ? [[0, 0], [w, b.h]] : [[0, b.h], [w, 0]]
    if (tool === 'rough') b.profile = [1, .65, .8, .35, .5, 0, .25, .15, .65, .5, 1].map((height, i) => [w * i / 10, b.h * height])
    next.platforms.push(b)
    return { level: next, selection: { kind: 'platform', index: next.platforms.length - 1 } }
  }
  if (tool === 'spawn' || tool === 'checkpoint') {
    const point = snapToGround(next, clamp(end.x, 10, next.width - 10), end.y)
    if (tool === 'spawn') next.spawn = point
    else { if (next.checkpoints.length >= 30) throw new Error('This level already has 30 checkpoints.'); next.checkpoints.push(point) }
    return { level: next, selection: { kind: tool, index: tool === 'spawn' ? 0 : next.checkpoints.length - 1 } }
  }
  if (tool === 'rope') {
    if (next.climbables.ropes.length >= 40) throw new Error('This level already has 40 ropes.')
    const length = clamp(Math.abs(end.y - start.y) || 260, 80, Math.min(2000, levelHeight(level) - y))
    next.climbables.ropes.push({ x, y, length, segments: ropeSegmentCount(length) })
    return { level: anchorRope(next, next.climbables.ropes.length - 1, 16), selection: { kind: 'rope', index: next.climbables.ropes.length - 1 } }
  }
  if (tool === 'ladder') {
    if (next.climbables.ladders.length >= 40) throw new Error('This level already has 40 ladders.')
    next.climbables.ladders.push({ x, top: y, bottom: y + clamp(Math.abs(end.y - start.y) || 260, 80, levelHeight(level) - y), platform: -1, side: 1 })
    return { level: next, selection: { kind: 'ladder', index: next.climbables.ladders.length - 1 } }
  }
  if (tool === 'pit') {
    const trial = carvePit(level, start, end)
    return { level: trial, selection: { kind: 'ladder', index: trial.climbables.ladders.length - 1 } }
  }
  if (tool === 'timer') {
    const trial = asTrial(level), timers = trial.timers ??= []
    if (timers.length >= 40) throw new Error('This level already has 40 wall timers.')
    timers.push({ x: clamp(start.x, 0, trial.width - WALL_TIMER_WIDTH), y: clamp(start.y, 0, levelHeight(trial) - WALL_TIMER_HEIGHT) })
    return { level: trial, selection: { kind: 'timer', index: timers.length - 1 } }
  }
  if (tool === 'stopwatch') {
    const trial = asTrial(level), pickups = trial.pickups ??= [], bounds = pickupBounds({ x: 0, y: 0 })
    if (pickups.length >= 80) throw new Error('This level already has 80 power-ups.')
    pickups.push({ kind: 'stopwatch', x: clamp(start.x, 0, trial.width - bounds.w) - bounds.x, y: clamp(start.y, 0, levelHeight(trial) - bounds.h) - bounds.y })
    return { level: trial, selection: { kind: 'pickup', index: pickups.length - 1 } }
  }
  if (['goal', 'box', 'ball', 'pusher', 'plate', 'lift', 'gate'].includes(tool)) {
    const trial = asTrial(level), point = snapToGround(trial, clamp(x, 70, trial.width - 110), y)
    if (tool === 'goal') { trial.goal = point; return { level: trial, selection: { kind: 'goal', index: 0 } } }
    if (tool === 'box' || tool === 'ball') {
      if (trial.props.length >= 80) throw new Error('This level already has 80 props.')
      trial.props.push({ kind: tool, ...point, size: tool === 'box' ? 80 : 68 })
      return { level: trial, selection: { kind: 'prop', index: trial.props.length - 1 } }
    }
    if (tool === 'pusher') {
      if (trial.robots.length >= 30) throw new Error('This level already has 30 pushers.')
      trial.robots.push({ ...point, ...pusherRange(trial, point.x, point.y) })
      return { level: trial, selection: { kind: 'robot', index: trial.robots.length - 1 } }
    }
    if (tool === 'plate') {
      if (trial.triggers.length >= 40) throw new Error('This level already has 40 pressure plates.')
      const nearest = [...trial.mechanisms].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
      trial.triggers.push({ x: clamp(point.x - 50, 24, trial.width - 124), y: point.y, w: 100, target: nearest?.id ?? '', mode: 'weight' })
      return { level: trial, selection: { kind: 'trigger', index: trial.triggers.length - 1 } }
    }
    if (tool === 'lift' || tool === 'gate') {
      if (trial.mechanisms.length >= 40) throw new Error('This level already has 40 mechanisms.')
      const h = tool === 'lift' ? 22 : 180, w = tool === 'lift' ? 140 : 44
      trial.mechanisms.push({ id: newLevelId(), kind: tool, x: clamp(x, 24, trial.width - w - 24), y: Math.min(trial.floor - h, tool === 'lift' ? Math.max(start.y, end.y) : point.y - h), w, h,
        travel: clamp(Math.abs(end.y - start.y) || (tool === 'gate' ? 220 : 300), 60, 1200) })
      return { level: trial, selection: { kind: 'mechanism', index: trial.mechanisms.length - 1 } }
    }
  }
  return null
}

export function duplicateItem(level: JumpLevel, selection: Selection): { level: JumpLevel; selection: Selection } | null {
  const next = copyLevel(level), i = selection.index
  if (selection.kind === 'spawn' || selection.kind === 'goal') return null
  let index = 0
  if (selection.kind === 'platform') {
    if (next.platforms.length >= 160) return null
    index = next.platforms.push(copyLevel(level).platforms[i]) - 1
  } else if (selection.kind === 'rope') { if (next.climbables.ropes.length >= 40) return null; index = next.climbables.ropes.push({ ...next.climbables.ropes[i] }) - 1 }
  else if (selection.kind === 'ladder') { if (next.climbables.ladders.length >= 40) return null; index = next.climbables.ladders.push({ ...next.climbables.ladders[i], platform: -1 }) - 1 }
  else if (selection.kind === 'timer') { if (next.timers!.length >= 40) return null; index = next.timers!.push({ ...next.timers![i] }) - 1 }
  else if (selection.kind === 'text') { if (next.texts!.length >= 80) return null; index = next.texts!.push({ ...next.texts![i] }) - 1 }
  else if (selection.kind === 'pickup') { if (next.pickups!.length >= 80) return null; index = next.pickups!.push({ ...next.pickups![i] }) - 1 }
  else if (selection.kind === 'prop') { if (next.props!.length >= 80) return null; index = next.props!.push({ ...next.props![i] }) - 1 }
  else if (selection.kind === 'robot') { if (next.robots!.length >= 30) return null; index = next.robots!.push({ ...next.robots![i] }) - 1 }
  else if (selection.kind === 'trigger') { if (next.triggers!.length >= 40) return null; index = next.triggers!.push({ ...next.triggers![i] }) - 1 }
  else if (selection.kind === 'mechanism') { if (next.mechanisms!.length >= 40) return null; index = next.mechanisms!.push({ ...next.mechanisms![i], id: newLevelId() }) - 1 }
  else { if (next.checkpoints.length >= 30) return null; index = next.checkpoints.push({ ...next.checkpoints[i] }) - 1 }
  const result = { kind: selection.kind, index }
  return { level: moveItem(next, result, 40, 0), selection: result }
}
export function allSelections(level: JumpLevel): Selection[] {
  return [{ kind: 'spawn', index: 0 }, ...(level.goal ? [{ kind: 'goal' as const, index: 0 }] : []),
    ...level.platforms.map((_, index) => ({ kind: 'platform' as const, index })),
    ...level.climbables.ropes.map((_, index) => ({ kind: 'rope' as const, index })), ...level.climbables.ladders.map((_, index) => ({ kind: 'ladder' as const, index })),
    ...level.checkpoints.map((_, index) => ({ kind: 'checkpoint' as const, index })),
    ...(level.timers ?? []).map((_, index) => ({ kind: 'timer' as const, index })),
    ...(level.texts ?? []).map((_, index) => ({ kind: 'text' as const, index })),
    ...(level.pickups ?? []).map((_, index) => ({ kind: 'pickup' as const, index })),
    ...(level.props ?? []).map((_, index) => ({ kind: 'prop' as const, index })), ...(level.robots ?? []).map((_, index) => ({ kind: 'robot' as const, index })),
    ...(level.triggers ?? []).map((_, index) => ({ kind: 'trigger' as const, index })), ...(level.mechanisms ?? []).map((_, index) => ({ kind: 'mechanism' as const, index }))]
}

/** Terrain anchors are stored in local coordinates so they travel with edited terrain. */
export function anchorRope(level: JumpLevel, index: number, maxDistance = 40): JumpLevel {
  const next = copyLevel(level), r = next.climbables.ropes[index]
  const candidates = next.platforms.map((b, platform) => ({ ...nearestBoundary(b, r.x, r.y), platform })).sort((a, b) => a.distance - b.distance)
  const best = candidates[0]
  if (!best || best.distance > maxDistance) return next
  const b = next.platforms[best.platform]
  r.x = best.x; r.y = best.y; r.anchor = { platform: best.platform, x: r.x - b.x, y: r.y - b.y }
  return next
}
export function polygonPlatform(points: readonly Vec[]): Platform {
  if (!validPolygon(points)) throw new Error('Use at least three corners without crossing the edges.')
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  const w = Math.max(...points.map(p => p[0])) - x, h = Math.max(...points.map(p => p[1])) - y
  if (w < 10 || h < 8) throw new Error('Terrain needs a little more width and height.')
  return { x, y, w, h, polygon: points.map(p => [p[0] - x, p[1] - y]) }
}
export function addPolygon(level: JumpLevel, points: readonly Vec[]) {
  if (level.platforms.length >= 160) throw new Error('This level already has 160 terrain pieces.')
  const b = polygonPlatform(points.map(([x, y]) => [clamp(x, 0, level.width), clamp(y, 0, levelHeight(level))]))
  const next = copyLevel(level); next.platforms.push(b)
  return { level: next, selection: { kind: 'platform' as const, index: next.platforms.length - 1 } }
}
export function moveVertex(level: JumpLevel, index: number, vertex: number, dx: number, dy: number): JumpLevel {
  const points = polygonPoints(level.platforms[index])
  const p = points[vertex]; points[vertex] = [clamp(p[0] + dx, 0, level.width), clamp(p[1] + dy, 0, levelHeight(level))]
  try { return replacePlatform(level, index, polygonPlatform(points)) } catch { return level }
}
