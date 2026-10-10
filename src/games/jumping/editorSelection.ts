import { allSelections, clamp, deleteItem, itemBounds, itemDefinition, itemOutline, moveItem, reorderTerrain, transformTerrain } from './editor.ts'
import type { Selection, TerrainTransform } from './editor.ts'
import { copyLevel, levelHeight, newLevelId, parseLevel } from './level.ts'
import type { JumpLevel } from './level.ts'
import { asTrial } from './puzzleEditor.ts'
import { lineBlocked, polygonIntersects, polygonPoints } from './geometry.ts'
import { ropePath } from './climbables.ts'
import { platformSurface } from './terrain.ts'
import { terrainDrawOrder } from './terrainOrder.ts'
import { switchedItems } from './switchPower.ts'
import { waterControlId } from './waterLevel.ts'
import { goalBounds } from './goal.ts'
import { attachPressurePlateOnSurface, syncPressurePlateMounts } from './pressurePlateMount.ts'

type Rect = { x: number; y: number; w: number; h: number }
type Item = Record<string, unknown>
export interface EditorClipboard { level: JumpLevel; selections: Selection[] }
export const sameSelection = (a: Selection, b: Selection) => a.kind === b.kind && a.index === b.index
const key = (s: Selection) => `${s.kind}:${s.index}`
export const copyableSelection = (s: Selection) => s.kind !== 'spawn' && s.kind !== 'goal'

export function validSelections(level: JumpLevel, selections: readonly Selection[]): Selection[] {
  const seen = new Set<string>()
  return selections.filter(s => {
    if (!itemDefinition(level, s) || seen.has(key(s))) return false
    seen.add(key(s)); return true
  })
}
function visibleBounds(level: JumpLevel, s: Selection): Rect | null {
  if (s.kind === 'rope') {
    const rope = level.climbables.ropes[s.index]
    if (!rope) return null
    const path = ropePath(rope), x = Math.min(...path.map(p => p[0])), y = Math.min(...path.map(p => p[1]))
    return { x: x - 4, y: y - 4, w: Math.max(...path.map(p => p[0])) - x + 8, h: Math.max(...path.map(p => p[1])) - y + 8 }
  }
  const b = itemOutline(level, s)
  if (!b) return null
  return { x: b.w ? b.x : b.x - 8, y: b.h ? b.y : b.y - 62, w: b.w || 16, h: b.h || 62 }
}
export function selectionBounds(level: JumpLevel, selections: readonly Selection[]): Rect | null {
  const bounds = selections.flatMap(s => { const b = visibleBounds(level, s); return b ? [b] : [] })
  if (!bounds.length) return null
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y))
  return { x, y, w: Math.max(...bounds.map(b => b.x + b.w)) - x, h: Math.max(...bounds.map(b => b.y + b.h)) - y }
}
export function selectionsInRect(level: JumpLevel, rect: Rect): Selection[] {
  const overlaps = (b: Rect) => b.x <= rect.x + rect.w && b.x + b.w >= rect.x && b.y <= rect.y + rect.h && b.y + b.h >= rect.y
  return allSelections(level).filter(s => {
    if (s.kind === 'platform') return polygonIntersects(polygonPoints(level.platforms[s.index]), rect)
    if (s.kind === 'gravity-plate') {
      const p = level.gravityPlates![s.index]
      if (p.effect === 'water') return overlaps(p)
      return overlaps({ x: p.x, y: p.ceiling ? p.y : p.y + p.h - 10, w: p.w, h: 10 })
        || overlaps({ x: p.x, y: p.y, w: 2, h: p.h }) || overlaps({ x: p.x + p.w - 2, y: p.y, w: 2, h: p.h })
        || overlaps({ x: p.x, y: p.y, w: p.w, h: 2 }) || overlaps({ x: p.x, y: p.y + p.h - 2, w: p.w, h: 2 })
    }
    if (s.kind === 'rope') {
      const path = ropePath(level.climbables.ropes[s.index])
      return path.some(([x, y]) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h)
        || path.some((p, i) => i && lineBlocked(path[i - 1], p, [rect]))
    }
    const b = visibleBounds(level, s)
    return b && overlaps(b)
  })
}

/** Internal heterogeneous collections; all records come from validated level data. */
function itemArray(level: JumpLevel, kind: Selection['kind']): Item[] {
  if (kind === 'platform') return level.platforms as unknown as Item[]
  if (kind === 'rope') return level.climbables.ropes as unknown as Item[]
  if (kind === 'ladder') return level.climbables.ladders as unknown as Item[]
  if (kind === 'light') return level.lighting!.lights as unknown as Item[]
  if (kind === 'spawn' || kind === 'goal') throw new Error('Start and goal are unique markers.')
  const fields = { checkpoint: 'checkpoints', prop: 'props', robot: 'robots', mechanism: 'mechanisms', trigger: 'triggers',
    timer: 'timers', text: 'texts', pickup: 'pickups', 'wall-light': 'wallLights', 'logic-relay': 'logicRelays', 'gravity-plate': 'gravityPlates', 'force-field': 'forceFields' } as const
  const record = level as unknown as Record<string, unknown>
  return (record[fields[kind]] ??= []) as Item[]
}
function carriesSelection(level: JumpLevel, selection: Selection, selected: ReadonlySet<string>): boolean {
  if (selection.kind === 'rope') {
    const anchor = level.climbables.ropes[selection.index].anchor
    return !!anchor && selected.has(`platform:${anchor.platform}`)
  }
  if (selection.kind === 'ladder') return selected.has(`platform:${level.climbables.ladders[selection.index].platform}`)
  if (selection.kind === 'trigger') {
    const plate = level.triggers![selection.index]
    return plate.mode !== 'coins' && !!plate.mount
      && level.mechanisms!.some((m, index) => m.id === plate.mount!.mechanism && selected.has(`mechanism:${index}`))
  }
  return false
}
/** One translation for the whole group, clamped before any item is moved. */
export function moveSelections(level: JumpLevel, selections: readonly Selection[], dx: number, dy: number, carryMarkers = true): JumpLevel {
  const items = validSelections(level, selections)
  if (!items.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return level
  if (items.length === 1 && carryMarkers) return moveItem(level, items[0], dx, dy)
  let left = -Infinity, right = Infinity, top = -Infinity, bottom = Infinity
  for (const s of items) {
    const raw = itemBounds(level, s)!, b = s.kind === 'goal' ? goalBounds(level.goal!) : s.kind === 'rope' ? { ...raw, h: 0 }
      : s.kind === 'text' ? itemOutline(level, s)! : raw, margin = ['prop', 'robot', 'mechanism', 'trigger'].includes(s.kind) ? 24 : 0
    left = Math.max(left, margin - b.x); right = Math.min(right, level.width - margin - b.x - b.w)
    top = Math.max(top, -b.y); bottom = Math.min(bottom, levelHeight(level) - b.y - b.h)
    if (s.kind === 'platform') for (const ladder of level.climbables.ladders) if (ladder.platform === s.index) {
      left = Math.max(left, (ladder.side === 1 ? 16 : 0) - b.x)
      right = Math.min(right, level.width - b.x - b.w - (ladder.side === -1 ? 16 : 0))
    }
  }
  if (left > right || top > bottom) throw new Error('The selected group cannot fit inside the level.')
  dx = clamp(dx, left, right); dy = clamp(dy, top, bottom)
  if (!dx && !dy) return level
  const selected = new Set(items.map(key)), terrain = items.filter(s => s.kind === 'platform')
  const next = copyLevel(level)
  for (const s of items.filter(s => s.kind === 'platform' || s.kind === 'mechanism')) {
    const item = itemDefinition(next, s) as unknown as { x: number; y: number }
    item.x += dx; item.y += dy
  }
  for (const rope of next.climbables.ropes) if (rope.anchor && selected.has(`platform:${rope.anchor.platform}`)) {
    const host = next.platforms[rope.anchor.platform]
    rope.x = host.x + rope.anchor.x; rope.y = host.y + rope.anchor.y; delete rope.rest
  }
  for (const ladder of next.climbables.ladders) if (selected.has(`platform:${ladder.platform}`)) {
    ladder.x += dx; ladder.top += dy; ladder.bottom += dy
  }
  syncPressurePlateMounts(next)
  // A marker resting on two selected blocks must be carried only once.
  for (const s of allSelections(level).filter(s => ['spawn', 'checkpoint', 'goal'].includes(s.kind))) {
    if (selected.has(key(s))) continue
    const marker = itemDefinition(level, s) as unknown as { x: number; y: number }
    const supportX = s.kind === 'goal' ? (() => { const b = goalBounds(level.goal!); return b.x + b.w / 2 })() : marker.x
    const carried = carryMarkers && terrain.some(s => { const b = level.platforms[s.index]; return supportX >= b.x && supportX <= b.x + b.w && Math.abs(marker.y - platformSurface(b, supportX).y) < .1 })
    if (carried) Object.assign(itemDefinition(next, s)!, { x: marker.x + dx, y: marker.y + dy })
  }
  for (const s of items) {
    if (s.kind === 'platform' || s.kind === 'mechanism' || carriesSelection(level, s, selected)) continue
    if (s.kind === 'ladder') {
      const ladder = next.climbables.ladders[s.index]; ladder.x += dx; ladder.top += dy; ladder.bottom += dy; ladder.platform = -1
      continue
    }
    const item = itemDefinition(next, s) as unknown as { x: number; y: number }
    item.x += dx; item.y += dy
    if (s.kind === 'rope') { const rope = next.climbables.ropes[s.index]; delete rope.anchor; delete rope.rest }
    if (s.kind === 'robot') {
      const r = next.robots![s.index]
      r.left = clamp(r.left + dx, 50, Math.min(r.x, level.width - 100))
      r.right = clamp(r.right + dx, Math.max(r.x, r.left + 50), level.width - 50)
    }
    if (s.kind === 'trigger') attachPressurePlateOnSurface(next, next.triggers![s.index])
  }
  return next
}
export function deleteSelections(level: JumpLevel, selections: readonly Selection[]): JumpLevel {
  let next = level
  // Delete higher indices first so lower selections still identify their objects.
  for (const s of validSelections(level, selections).filter(copyableSelection).sort((a, b) => b.index - a.index)) next = deleteItem(next, s)
  return next
}

/** Rotate or reflect the layout around the group's center, then fit it as one unit. */
export function transformSelections(level: JumpLevel, selections: readonly Selection[], transform: TerrainTransform): JumpLevel {
  const items = validSelections(level, selections)
  if (!items.length || items.some(s => s.kind !== 'platform')) return level
  if (items.length === 1) return transformTerrain(level, items[0].index, transform)
  const bounds = selectionBounds(level, items)!, cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2
  const rotate = transform.startsWith('rotate'), w = rotate ? bounds.h : bounds.w, h = rotate ? bounds.w : bounds.h
  if (w > level.width || h > levelHeight(level)) throw new Error('The terrain group is too large to transform inside the level.')
  const shiftX = clamp(cx - w / 2, 0, level.width - w) - (cx - w / 2)
  const shiftY = clamp(cy - h / 2, 0, levelHeight(level) - h) - (cy - h / 2)
  let next = level
  for (const s of items) {
    const b = level.platforms[s.index], x = b.x + b.w / 2 - cx, y = b.y + b.h / 2 - cy
    const tx = transform === 'rotate-right' ? -y : transform === 'rotate-left' ? y : transform === 'flip-horizontal' ? -x : x
    const ty = transform === 'rotate-right' ? x : transform === 'rotate-left' ? -x : transform === 'flip-vertical' ? -y : y
    next = transformTerrain(next, s.index, transform)
    const changed = next.platforms[s.index]
    changed.x = cx + tx - changed.w / 2 + shiftX; changed.y = cy + ty - changed.h / 2 + shiftY
    for (const ladder of next.climbables.ladders) if (ladder.platform === s.index) {
      ladder.x = ladder.side === 1 ? changed.x - 16 : changed.x + changed.w + 16
      ladder.bottom += changed.y - b.y; ladder.top = changed.y
    }
    for (const rope of next.climbables.ropes) if (rope.anchor?.platform === s.index) {
      rope.x = changed.x + rope.anchor.x; rope.y = changed.y + rope.anchor.y
    }
  }
  return next
}

export function copySelections(level: JumpLevel, selections: readonly Selection[]): EditorClipboard {
  return { level: copyLevel(level), selections: validSelections(level, selections).filter(copyableSelection) }
}
const limits: Partial<Record<Selection['kind'], number>> = { platform: 160, rope: 40, ladder: 40, checkpoint: 30, prop: 80,
  robot: 30, mechanism: 40, trigger: 40, timer: 40, text: 80, pickup: 80, light: 16, 'wall-light': 40, 'logic-relay': 40, 'gravity-plate': 16, 'force-field': 40 }

export function pasteSelections(level: JumpLevel, clipboard: EditorClipboard, dx = 40, dy = 40): { level: JumpLevel; selections: Selection[] } {
  const source = clipboard.level, originals = validSelections(source, clipboard.selections).filter(copyableSelection)
  if (!originals.length) return { level, selections: [] }
  let next = copyLevel(level)
  if (originals.some(s => ['prop', 'robot', 'mechanism', 'trigger', 'timer', 'pickup', 'wall-light', 'logic-relay', 'gravity-plate', 'force-field'].includes(s.kind))) next = asTrial(next)
  if (originals.some(s => s.kind === 'light')) { next.version = 2; next.lighting ??= { nightMode: false, ambient: 0, lights: [] } }
  const indices = new Map<string, number>(), ids = new Map<string, string>(), pasted: Selection[] = []
  for (const s of originals) {
    const array = itemArray(next, s.kind)
    if (array.length >= limits[s.kind]!) throw new Error(`This level has no room for more ${s.kind} items.`)
    const definition = structuredClone(itemDefinition(source, s)) as Item
    if (typeof definition.id === 'string') {
      const id = newLevelId(); ids.set(definition.id, id)
      if (s.kind === 'gravity-plate' && source.gravityPlates?.[s.index]?.effect === 'water') for (const action of ['fill', 'drain'] as const)
        ids.set(waterControlId(definition.id, action), waterControlId(id, action))
      definition.id = id
    }
    const index = array.push(definition) - 1
    indices.set(key(s), index); pasted.push({ kind: s.kind, index })
  }
  const external = new Set(source.id === level.id ? switchedItems(level).map(t => t.id) : [])
  for (const s of pasted) {
    const definition = itemArray(next, s.kind)[s.index]
    if (Array.isArray(definition.targets)) definition.targets = definition.targets.flatMap(id => typeof id === 'string' && ids.has(id) ? [ids.get(id)!] : external.has(id) ? [id] : [])
    if (typeof definition.target === 'string') { definition.targets = ids.has(definition.target) ? [ids.get(definition.target)!] : external.has(definition.target) ? [definition.target] : []; delete definition.target }
    if (s.kind === 'rope') {
      const rope = next.climbables.ropes[s.index], index = rope.anchor && indices.get(`platform:${rope.anchor.platform}`)
      if (index !== undefined && rope.anchor) rope.anchor.platform = index; else delete rope.anchor
      delete rope.rest
    }
    if (s.kind === 'ladder') {
      const ladder = next.climbables.ladders[s.index]; ladder.platform = indices.get(`platform:${ladder.platform}`) ?? -1
    }
    if (s.kind === 'trigger') {
      const plate = next.triggers![s.index]
      if (plate.mode !== 'coins' && plate.mount) {
        const host = ids.get(plate.mount.mechanism)
        if (host) plate.mount.mechanism = host; else delete plate.mount
      }
    }
  }
  // Preserve relative terrain layering and place the whole pasted group in front.
  for (const i of terrainDrawOrder(source.platforms)) {
    const index = indices.get(`platform:${i}`)
    if (index !== undefined) next = reorderTerrain(next, index, 'front')
  }
  next = moveSelections(next, pasted, dx, dy, false)
  // Terrain edits leave temporary rope sketches in the live draft. They are
  // rebuilt by the editor; saved-file validation must not reject an unrelated paste.
  for (const rope of next.climbables.ropes) if (rope.rest?.key.startsWith('preview:')) delete rope.rest
  parseLevel(next)
  return { level: next, selections: pasted }
}
