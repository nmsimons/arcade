import { polygonPoints } from './geometry'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { anchorRope, moveVertex, insertTerrainNode, terrainNodeTarget, addItem, allSelections, clamp, deleteItem, duplicateItem, hitItem, itemBounds, itemOutline, itemHandle, moveItem, replacePlatform, resizeItem, resizeLevelHeight } from './editor'
import type { ResizeCorner, Selection, Tool } from './editor'
import { copyLevel, LEVEL_GRID_SIZE, isPuzzleLevel, levelPlayer, levelProblems, levelTerrain, levelHeight, newLevelId, parseLevel, prepareLevelRopes } from './level'
import type { JumpLevel } from './level'
import { drawAthlete, drawClimbables, drawTerrain, drawLevelBackdrop } from './render'
import { blankTrial } from './level'
import type { LevelFile } from './levelAssets'
import { levelFileName } from './localLevels'
import type { LocalLevels } from './localLevels'
import { copyForEditing } from './puzzleEditor'
import { createRun } from './challenge'
import { drawPuzzleWorld } from './challengeRender'
import { BuilderIcon } from './BuilderIcon'
import { LevelThumbnail } from './LevelThumbnail'
import { LocalFolderPanel } from './LocalFolderPanel'
import { TUNING } from './model'
import { isHorizontalGate, mechanismAnchor, mechanismLabel, mechanismOpenPosition, mechanismRopeEnd } from './mechanisms'
import './builder.css'

type Point = { x: number; y: number }
type View = Point & { zoom: number }
const homeView = (level: JumpLevel, height: number): View => ({ x: Math.max(0, level.spawn.x - 200), y: Math.max(100, level.spawn.y - height / .8 * .72), zoom: .8 })
function selectionHandles(level: JumpLevel, selection: Selection | null, zoom: number): (Point & { corner: ResizeCorner })[] {
  if (!selection) return []
  const terrain = selection.kind === 'platform' ? level.platforms[selection.index] : null
  // Keep the resize frame outside the white geometry nodes at every zoom.
  if (terrain) return (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(corner => ({ corner,
    x: terrain.x + (corner.endsWith('left') ? -16 / zoom : terrain.w + 16 / zoom),
    y: terrain.y + (corner.startsWith('top') ? -16 / zoom : terrain.h + 16 / zoom) }))
  const point = itemHandle(level, selection)
  return point && ['rope', 'ladder', 'prop', 'mechanism', 'trigger', 'text'].includes(selection.kind)
    ? [{ ...point, y: point.y + 14 / zoom, corner: 'bottom-right' }] : []
}
type Drag = { mode: 'move' | 'resize' | 'point' | 'draw' | 'pan'; start: Point; screen: Point; base: JumpLevel; view: View; selection: Selection | null; point?: number; corner?: ResizeCorner; inserted?: boolean }
const TOOLS: { id: Tool; group: string; label: string; help: string }[] = [
  { id: 'select', group: 'Navigate', label: 'Select', help: 'Drag to move. Drag square handles to resize or white nodes to reshape terrain. Shift + arrow nudges one unit.' },
  { id: 'pan', group: 'Navigate', label: 'Pan', help: 'Drag to move around the level. Hold Space or the middle mouse button to pan from any tool.' },
  { id: 'platform', group: 'Terrain', label: 'Terrain', help: 'Drag to create terrain, then reshape it with the white nodes. Use the Node tool to add points along an edge.' },
  { id: 'node', group: 'Terrain', label: 'Node', help: 'Click a terrain edge to add a node at the highlighted point. Drag to reshape it. N selects this tool; Esc returns to Select.' },
  { id: 'rope', group: 'Movement', label: 'Rope', help: 'Drag down from the anchor. Start near a terrain edge to attach the anchor to it.' },
  { id: 'ladder', group: 'Movement', label: 'Ladder', help: 'Drag down anywhere to place a ladder. Move it or change its height in the inspector.' },
  { id: 'ball', group: 'Objects', label: 'Ball', help: 'Click a surface to place a ball. Move it or change its size in the inspector.' },
  { id: 'box', group: 'Objects', label: 'Box', help: 'Click a surface to place a box. Move it or change its size in the inspector.' },
  { id: 'pusher', group: 'Objects', label: 'Shovebot', help: 'Click a surface to place a shovebot. Set its patrol limits in the inspector.' },
  { id: 'lift', group: 'Mechanisms', label: 'Elevator', help: 'Click to place the platform, or drag vertically to set its travel. Connect a pressure plate to move it.' },
  { id: 'gate', group: 'Mechanisms', label: 'Gate', help: 'Click a surface to place a gate. It rises by its own height while a connected pressure plate is held.' },
  { id: 'horizontal-gate', group: 'Mechanisms', label: 'Horizontal gate', help: 'Click or drag horizontally to place a gate. It retracts by its own width. Flip it in the inspector to reverse its direction.' },
  { id: 'plate', group: 'Mechanisms', label: 'Pressure plate', help: 'Click a surface to place a pressure plate, then choose its elevator or gate in the inspector. The player, boxes, and balls can hold it down.' },
  { id: 'spawn', group: 'Markers', label: 'Start', help: 'Click a surface to choose where the player starts.' },
  { id: 'goal', group: 'Markers', label: 'Goal light', help: 'Press the plate to reveal the hidden exit beyond the light. Walk into the door to stop the timer and finish. Leave flat, clear space for the whole goal.' },
  { id: 'checkpoint', group: 'Markers', label: 'Checkpoint', help: 'Reset marker for movement playgrounds. Time trials always restart at the beginning.' },
  { id: 'timer', group: 'Back wall', label: 'Wall timer', help: 'Click to mount a timer on the back wall. Place as many as you need; all show the same run time and never block movement.' },
  { id: 'text', group: 'Back wall', label: 'Wall text', help: 'Click or drag a text area onto the back wall. Edit the text, size, and alignment in the inspector. Text never blocks movement.' },
  { id: 'stopwatch', group: 'Power-ups', label: 'Stopwatch', help: 'Place a stopwatch to collect. Touching it stops the level timer for 10 seconds while gameplay continues. Extra watches extend the pause.' },
]
const selectionLabel = (s: Selection, level: JumpLevel) => {
  const name = s.kind === 'spawn' ? 'Start' : s.kind === 'goal' ? 'Goal light' : s.kind === 'prop' ? level.props?.[s.index]?.kind === 'ball' ? 'Ball' : 'Box'
    : s.kind === 'pickup' ? 'Stopwatch' : s.kind === 'timer' ? 'Wall timer' : s.kind === 'text' ? 'Wall text' : s.kind === 'robot' ? 'Shovebot' : s.kind === 'trigger' ? 'Pressure plate' : s.kind === 'mechanism' ? mechanismLabel(level.mechanisms![s.index]) : s.kind === 'platform' ? 'Terrain' : s.kind[0].toUpperCase() + s.kind.slice(1)
  return `${name}${s.kind === 'spawn' || s.kind === 'goal' ? '' : ` ${s.index + 1}`}`
}


export function LevelBuilder({ active, onPlay, onClose, templates, local, initialFile, onFileChange }: {
  active: boolean; onPlay: (level: JumpLevel) => void; onClose: () => void
  templates: LevelFile[]; local: LocalLevels; initialFile?: LevelFile
  onFileChange: (fileName?: string) => void
}) {
  const [initial] = useState(() => ({ level: prepareLevelRopes(initialFile ? copyLevel(initialFile.level) : blankTrial()) }))
  const [fileName, setFileName] = useState(initialFile?.fileName ?? levelFileName(initial.level.name))
  const [fileSource, setFileSource] = useState(initialFile?.sourceText)
  const [history, setHistory] = useState({ past: [] as JumpLevel[], present: initial.level, future: [] as JumpLevel[] })
  const [preview, setPreview] = useState<JumpLevel | null>(null)
  const level = prepareLevelRopes(preview ?? history.present)
  const roomHeight = levelHeight(level)
  const [message, setMessage] = useState('')
  const [tool, setTool] = useState<Tool>('select'), [selection, setSelection] = useState<Selection | null>(null)
  const [panel, setPanel] = useState<'build' | 'library'>('build')
  const [jumpGuide, setJumpGuide] = useState(false), [keepTool, setKeepTool] = useState(false)
  const panHeld = useRef(false)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [snap, setSnap] = useState(true), [view, setView] = useState<View>({ x: 0, y: 100, zoom: .8 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<HTMLCanvasElement>(null), fileRef = useRef<HTMLInputElement>(null), drag = useRef<Drag | null>(null)
  const latestPreview = useRef<JumpLevel | null>(null)
  const framed = useRef(false)
  const bounds = selection ? itemBounds(level, selection) : null
  const outline = selection ? itemOutline(level, selection) : null
  const chosen = selection?.kind === 'platform' ? level.platforms[selection.index] : null
  const resizeHandles = selectionHandles(level, selection, view.zoom)
  const resizeHandleAt = (p: Point) => resizeHandles.find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) < 10 / view.zoom)
  const hoverHandle = pointer && resizeHandleAt(pointer)
  const resizeCorner = drag.current?.mode === 'resize' ? drag.current.corner : hoverHandle?.corner
  const resizeCursor = resizeCorner === 'top-left' || resizeCorner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
  const problems = levelProblems(level), problem = problems[0]
  const mechanism = selection?.kind === 'mechanism' ? level.mechanisms?.[selection.index] : null
  const trigger = selection?.kind === 'trigger' ? level.triggers?.[selection.index] : null
  const robot = selection?.kind === 'robot' ? level.robots?.[selection.index] : null
  const wallText = selection?.kind === 'text' ? level.texts?.[selection.index] : null
  const quantize = useCallback((v: number) => snap ? Math.round(v / LEVEL_GRID_SIZE) * LEVEL_GRID_SIZE : Math.round(v), [snap])
  const quantizeY = useCallback((y: number) => roomHeight - quantize(roomHeight - y), [roomHeight, quantize])
  const nodeTarget = tool === 'node' && pointer ? terrainNodeTarget(level, pointer.x, pointer.y, 12 / view.zoom, snap ? LEVEL_GRID_SIZE : 0) : null

  function commit(next: JumpLevel) {
    next = prepareLevelRopes(next)
    setHistory(h => JSON.stringify(next) === JSON.stringify(h.present) ? h : { past: [...h.past, h.present].slice(-60), present: next, future: [] })
    setPreview(null); latestPreview.current = null; setMessage('')
  }
  function undo() {
    if (history.past.length) keepFloorInView(history.past.at(-1)!)
    setHistory(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h)
    setSelection(null); setPreview(null); latestPreview.current = null; drag.current = null
  }
  function redo() {
    if (history.future.length) keepFloorInView(history.future[0])
    setHistory(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)
    setSelection(null); setPreview(null); latestPreview.current = null; drag.current = null
  }
  function keepFloorInView(next: JumpLevel) {
    const dy = levelHeight(next) - levelHeight(history.present)
    if (!dy) return
    setView(v => ({ ...v, y: v.y + dy }))
    setPointer(p => p && { ...p, y: p.y + dy })
  }
  function load(next: JumpLevel, file?: LevelFile, fromFolder = false) {
    setFileName(file?.fileName ?? levelFileName(next.name)); setFileSource(file?.sourceText)
    commit(copyLevel(next)); setSelection(null); setTool('select'); setView(homeView(next, size.height))
    onFileChange(fromFolder ? file?.fileName : undefined)
  }
  function remove() {
    if (selection) { commit(deleteItem(history.present, selection)); setSelection(null) }
  }
  function add(tool: Tool, start: Point, end: Point) {
    try {
      const added = addItem(history.present, tool, start, end)
      if (added) { commit(added.level); setSelection(added.selection); if (!keepTool) setTool('select') }
    } catch (error) { setMessage((error as Error).message) }
  }
  async function save() {
    try {
      if (local.canWrite) {
        const next = local.files.some(file => file.fileName !== fileName && file.level.id === level.id)
          ? { ...history.present, id: newLevelId() } : history.present
        const source = await local.save(fileName, next, fileSource)
        if (next.id !== history.present.id) commit(next)
        setFileSource(source); setMessage(`Saved “${fileName}” to ${local.name}.`)
        onFileChange(fileName)
      } else exportLevel()
    } catch (error) { setMessage(`Could not save: ${(error as Error).message}`) }
  }
  function exportLevel() {
    try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(parseLevel(prepareLevelRopes(history.present)), null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = fileName || levelFileName(level.name); a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(`Downloaded “${fileName || levelFileName(level.name)}”. Open a local folder to save directly to it.`)
    } catch (error) { setMessage(`Could not export: ${(error as Error).message}`) }
  }
  async function importFile(file?: File) {
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error('Please choose a level file smaller than 1 MB.')
      const sourceText = await file.text(), imported = parseLevel(JSON.parse(sourceText))
      load(imported, { fileName: file.name, level: imported, sourceText }); setMessage(`Opened “${file.name}”. Save level writes a JSON file.`)
    } catch (error) { setMessage(`Could not import: ${(error as Error).message}`) }
    if (fileRef.current) fileRef.current.value = ''
  }
  useEffect(() => {
    if (!active || !canvasRef.current) return
    const canvas = canvasRef.current
    const resize = () => {
      const r = canvas.getBoundingClientRect(); setSize({ width: r.width, height: r.height })
      if (!framed.current && r.height > 0) {
        setView({ x: -60, y: -60, zoom: Math.min(r.width / (initial.level.width + 120), r.height / (levelHeight(initial.level) + 120)) }); framed.current = true
      }
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    canvas.focus({ preventScroll: true })
    return () => observer.disconnect()
  }, [active, initial.level])
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!, ratio = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#eeeee6'; ctx.fillRect(0, 0, size.width, size.height)
    ctx.save(); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x, -view.y)
    drawLevelBackdrop(ctx, level, { x: view.x, y: view.y, w: size.width / view.zoom, h: size.height / view.zoom }, view.zoom)
    const player = levelPlayer(level)
    if (isPuzzleLevel(level)) drawPuzzleWorld(ctx, createRun(level), true)
    else { drawTerrain(ctx, levelTerrain(level)); drawClimbables(ctx, player, level.climbables); ctx.globalAlpha = .55; drawAthlete(ctx, player); ctx.globalAlpha = 1 }
    ctx.fillStyle = '#ce6548'; ctx.beginPath(); ctx.arc(level.spawn.x, level.spawn.y + 12, 4 / view.zoom, 0, Math.PI * 2); ctx.fill()
    if (jumpGuide) {
      const origin = chosen ? { x: chosen.x + chosen.w - 14, y: chosen.y } : level.spawn
      for (const [speed, color] of [[TUNING.jumpSpeed, '#98a58b'], [TUNING.chargedJumpSpeed, '#b28543']] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5 / view.zoom; ctx.setLineDash([4 / view.zoom, 4 / view.zoom]); ctx.beginPath()
        const duration = speed * 2 / TUNING.gravity
        for (let i = 0; i <= 60; i++) { const t = i / 60 * duration, x = origin.x + TUNING.runSpeed * t, y = origin.y - speed * t + TUNING.gravity * t * t / 2; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
        ctx.stroke(); ctx.setLineDash([])
      }
    }
    if (mechanism) {
      const open = mechanismOpenPosition(mechanism), anchor = mechanismAnchor(mechanism), end = mechanismRopeEnd(mechanism)
      ctx.strokeStyle = '#b78947'; ctx.lineWidth = 1 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
      ctx.strokeRect(open.x, open.y, mechanism.w, mechanism.h)
      ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.lineTo(anchor.x, anchor.y); ctx.stroke(); ctx.setLineDash([])
    }
    if (robot) {
      ctx.strokeStyle = '#cc6a49'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 3 / view.zoom]); ctx.beginPath(); ctx.moveTo(robot.left, robot.y - 65); ctx.lineTo(robot.right, robot.y - 65); ctx.stroke(); ctx.setLineDash([])
      for (const x of [robot.left, robot.right]) { ctx.beginPath(); ctx.arc(x, robot.y - 65, 3 / view.zoom, 0, Math.PI * 2); ctx.fill() }
    }
    if (outline) {
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
      const padding = chosen ? 16 / view.zoom : 4
      ctx.strokeRect(outline.x - padding, outline.y - padding - (outline.h ? 0 : 62), Math.max(8, outline.w + padding * 2), Math.max(8, outline.h + padding * 2 + (outline.h ? 0 : 62)))
      ctx.setLineDash([])
      for (const point of resizeHandles) {
        const handle = 9 / view.zoom; ctx.fillStyle = '#c65231'
        ctx.fillRect(point.x - handle / 2, point.y - handle / 2, handle, handle)
      }
      if (chosen) for (const [wx, wy] of polygonPoints(chosen)) {
        ctx.beginPath(); ctx.arc(wx, wy, 4.5 / view.zoom, 0, Math.PI * 2)
        ctx.fillStyle = '#fffdf5'; ctx.fill(); ctx.stroke()
      }
    }
    if (nodeTarget) {
      const points = polygonPoints(level.platforms[nodeTarget.index]), a = points[nodeTarget.edge], b = points[(nodeTarget.edge + 1) % points.length]
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke()
      ctx.beginPath(); ctx.arc(nodeTarget.x, nodeTarget.y, 6 / view.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#c65231'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
      const cross = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(nodeTarget.x - cross, nodeTarget.y); ctx.lineTo(nodeTarget.x + cross, nodeTarget.y)
      ctx.moveTo(nodeTarget.x, nodeTarget.y - cross); ctx.lineTo(nodeTarget.x, nodeTarget.y + cross); ctx.stroke()
    }
    ctx.restore()
  }, [active, level, view, size, outline, resizeHandles, chosen, jumpGuide, mechanism, robot, nodeTarget])

  function position(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: view.x + (event.clientX - rect.left) / view.zoom, y: view.y + (event.clientY - rect.top) / view.zoom }
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
    const p = position(event), screen = { x: event.clientX, y: event.clientY }, base = history.present
    latestPreview.current = null
    if (tool === 'pan' || panHeld.current || event.button === 1) { drag.current = { mode: 'pan', start: p, screen, base, view, selection: null }; return }
    if (tool === 'node') {
      const target = terrainNodeTarget(base, p.x, p.y, 12 / view.zoom, snap ? LEVEL_GRID_SIZE : 0)
      if (!target) { setMessage('Click a terrain edge away from an existing node.'); return }
      try {
        const next = insertTerrainNode(base, target), selected = { kind: 'platform' as const, index: target.index }
        setSelection(selected); setMessage(''); setPreview(next); latestPreview.current = next
        drag.current = { mode: 'point', start: p, screen, base: next, view, selection: selected, point: target.edge + 1, inserted: true }
        if (!keepTool) setTool('select')
      } catch (error) { setMessage((error as Error).message) }
      return
    }
    if (tool !== 'select') { drag.current = { mode: 'draw', start: { x: quantize(p.x), y: quantizeY(p.y) }, screen, base, view, selection: null }; return }
    const handle = resizeHandleAt(p)
    if (selection && handle) {
      drag.current = { mode: 'resize', start: p, screen, base, view, selection, corner: handle.corner }; return
    }
    if (selection && chosen) {
      const point = polygonPoints(chosen).findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 10 / view.zoom)
      if (point >= 0) { drag.current = { mode: 'point', start: p, screen, base, view, selection, point }; return }
    }
    const hit = hitItem(level, p.x, p.y, 9 / view.zoom)
    setSelection(hit); drag.current = hit ? { mode: 'move', start: p, screen, base, view, selection: hit } : null
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    if (!d) { setPointer(position(event)); return }
    if (d.mode === 'pan') { setView({ ...d.view, x: d.view.x - (event.clientX - d.screen.x) / d.view.zoom, y: d.view.y - (event.clientY - d.screen.y) / d.view.zoom }); return }
    const p = position(event), dx = p.x - d.start.x, dy = p.y - d.start.y
    let next: JumpLevel | null = null
    if (d.mode === 'draw') {
      try { next = addItem(d.base, tool, d.start, { x: quantize(p.x), y: quantizeY(p.y) })?.level ?? null } catch { /* Explain invalid placement when released. */ }
    } else if (d.selection) {
      const b = itemBounds(d.base, d.selection)!
      if (d.mode === 'move') next = moveItem(d.base, d.selection, quantize(b.x + dx) - b.x, quantizeY(b.y + dy) - b.y)
      if (d.mode === 'resize') {
        const width = d.corner?.endsWith('left') ? b.x + b.w - quantize(b.x + dx) : quantize(b.x + b.w + dx) - b.x
        const height = d.corner?.startsWith('top') ? b.y + b.h - quantizeY(b.y + dy) : quantizeY(b.y + b.h + dy) - b.y
        next = resizeItem(d.base, d.selection, Math.max(snap ? LEVEL_GRID_SIZE : 1, width), Math.max(snap ? LEVEL_GRID_SIZE : 1, height), d.corner)
      }
      if (d.mode === 'point') {
        const point = polygonPoints(d.base.platforms[d.selection.index])[d.point!]
        next = d.inserted && Math.hypot(dx, dy) * view.zoom < 3 ? d.base
          : moveVertex(d.base, d.selection.index, d.point!, quantize(point[0] + dx) - point[0], quantizeY(point[1] + dy) - point[1])
      }
    }
    if (next) { latestPreview.current = next; setPreview(next) }
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current; drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!d) return
    if (d.mode === 'draw') { const p = position(event); add(tool, d.start, { x: quantize(p.x), y: quantizeY(p.y) }) }
    else if (latestPreview.current) commit(latestPreview.current)
    setPreview(null); latestPreview.current = null
  }
  function zoom(factor: number, at = { x: size.width / 2, y: size.height / 2 }) {
    setView(v => { const z = clamp(v.zoom * factor, .08, 2.5); return { zoom: z, x: v.x + at.x / v.zoom - at.x / z, y: v.y + at.y / v.zoom - at.y / z } })
  }
  function setDimension(axis: 'x' | 'y' | 'w' | 'h', value: number) {
    if (!selection || !bounds || !Number.isFinite(value)) return
    commit(axis === 'x' || axis === 'y' ? moveItem(history.present, selection, axis === 'x' ? value - bounds.x : 0, axis === 'y' ? roomHeight - value - bounds.y : 0)
      : resizeItem(history.present, selection, axis === 'w' ? value : bounds.w, axis === 'h' ? value : bounds.h))
  }

  function duplicate() {
    if (!selection) return
    const result = duplicateItem(history.present, selection)
    if (result) { commit(result.level); setSelection(result.selection) }
  }
  function fitLevel(next = level) {
    const z = Math.min(size.width / (next.width + 120), size.height / (levelHeight(next) + 120))
    setView({ x: -60, y: -60, zoom: clamp(z, .08, 2.5) })
  }
  function chooseTemplate(template: JumpLevel, sourceName?: string) {
    const next = copyForEditing(template)
    const suggested = sourceName ? sourceName.replace(/((?:\.jump-level)?\.json)$/i, '-copy$1') : levelFileName(next.name)
    const extension = suggested.match(/(?:\.jump-level)?\.json$/i)![0], stem = suggested.slice(0, -extension.length)
    const used = new Set(local.files.map(file => file.fileName.toLowerCase()))
    let name = suggested
    for (let suffix = 2; used.has(name.toLowerCase()); suffix++) name = `${stem}-${suffix}${extension}`
    load(next); setFileName(name); fitLevel(next); setPanel('build')
    setMessage(`Created a new level from “${template.name}”. Save it as “${name}”.`)
    requestAnimationFrame(() => canvasRef.current?.focus())
  }
  function changeObject(field: string, value: number | string) {
    if (!selection) return
    const next = copyLevel(history.present)
    if (selection.kind === 'text') {
      const text = next.texts![selection.index]
      if (field === 'text') text.text = String(value).slice(0, 1000)
      if (field === 'fontSize' && Number.isFinite(Number(value))) text.fontSize = clamp(Number(value), 12, 96)
      if (field === 'align' && (value === 'left' || value === 'center' || value === 'right')) text.align = value
    }
    if (selection.kind === 'mechanism' && next.mechanisms![selection.index].kind === 'lift') next.mechanisms![selection.index].travel = clamp(Number(value), 60, 1200)
    if (selection.kind === 'trigger') {
      const t = next.triggers![selection.index]
      if (field === 'target') t.target = String(value)
    }
    if (selection.kind === 'robot') {
      const r = next.robots![selection.index]
      if (field === 'left') r.left = clamp(Number(value), 50, Math.min(r.x, r.right - 50))
      else r.right = clamp(Number(value), Math.max(r.x, r.left + 50), next.width - 50)
    }
    commit(next)
  }

  return <section className={`jumping-builder ${panel === 'library' ? 'builder-library-open' : ''}`} hidden={!active} aria-label="Level builder" onKeyDown={event => {
    if ((event.target as HTMLElement).matches('input, select, textarea')) return
    if (event.code === 'Space') { event.preventDefault(); panHeld.current = true }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
    else if (event.key === 'Escape') { setTool('select'); setSelection(null); drag.current = null; setPreview(null); latestPreview.current = null }
    else if (!event.ctrlKey && !event.metaKey && ({ v: 'select', h: 'pan', n: 'node', p: 'platform', r: 'rope', l: 'ladder', f: 'goal' } as Record<string, Tool>)[event.key.toLowerCase()]) { event.preventDefault(); setTool(({ v: 'select', h: 'pan', n: 'node', p: 'platform', r: 'rope', l: 'ladder', f: 'goal' } as Record<string, Tool>)[event.key.toLowerCase()]) }
    else if (event.target === canvasRef.current && selection) {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 1 : snap ? LEVEL_GRID_SIZE : 5
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        commit(moveItem(history.present, selection,
          snap && !event.shiftKey && bounds && dx ? quantize(bounds.x + dx) - bounds.x : dx,
          snap && !event.shiftKey && bounds && dy ? quantizeY(bounds.y + dy) - bounds.y : dy))
      }
    }
  }} onKeyUp={event => { if (event.code === 'Space') panHeld.current = false }} onBlur={() => { panHeld.current = false }}>
    <header className="builder-header">
      <div className="builder-brand"><span className="builder-brand-mark" aria-hidden="true">↗</span><div><p className="jumping-eyebrow">UNTITLED JUMPING GAME</p><h1>Level studio</h1></div></div>
      <label className="builder-name">YOUR LEVEL<input aria-label="Level name" maxLength={80} value={level.name} onChange={e => { if (!fileSource && fileName === levelFileName(level.name)) setFileName(levelFileName(e.target.value)); commit({ ...history.present, name: e.target.value }) }} /></label>
      <div className="builder-main-actions"><button className="builder-back" onClick={onClose}>Back to game</button><div className="builder-file-actions"><button disabled={local.busy} onClick={() => void save()}>Save level</button><button onClick={exportLevel}>Export</button></div><button className="builder-play" disabled={!!problem} onClick={() => onPlay(copyLevel(history.present))}><span aria-hidden="true">▶</span> Playtest</button></div>
    </header>
    <aside className="builder-tools" aria-label="Building tools">
      <div className="builder-panel-tabs"><button aria-pressed={panel === 'build'} onClick={() => setPanel('build')}>Build</button><button aria-pressed={panel === 'library'} onClick={() => setPanel('library')}>Library</button></div>
      {panel === 'build' ? <>
        {['Terrain', 'Movement', 'Objects', 'Mechanisms', 'Markers', 'Power-ups', 'Back wall'].map(group => <div className="builder-tool-group" key={group}><h2>{group}</h2><div className="builder-tool-grid">{TOOLS.filter(item => item.group === group && (item.id !== 'checkpoint' || !isPuzzleLevel(level))).map(item => <button key={item.id} aria-pressed={tool === item.id} title={item.help} onClick={() => { setTool(item.id); setMessage('') }}><BuilderIcon kind={item.id} /><span>{item.label}</span></button>)}</div></div>)}
        <label className="builder-snap"><input type="checkbox" checked={keepTool} onChange={e => setKeepTool(e.target.checked)} /> Keep placing</label>
        {!['select', 'pan', 'node'].includes(tool) && <button className="builder-add" onClick={() => { const p = { x: quantize(view.x + size.width / view.zoom / 2), y: quantizeY(view.y + size.height / view.zoom / 2) }; add(tool, p, p) }}>Add at view center</button>}
      </> : <>
        <div className="builder-library-actions"><button onClick={() => { load(blankTrial()); setPanel('build') }}><span aria-hidden="true">+ </span>New level</button><button onClick={() => fileRef.current?.click()}>Open file…</button></div>
        <h2>Local folder</h2>
        <LocalFolderPanel local={local} compact />
        {local.files.length > 0 && <div className="builder-local-files" role="group" aria-label="Local level files">{local.files.map(file => <div className="builder-local-file" key={file.fileName}>
          <button disabled={local.busy} aria-label={`Open ${file.fileName}`} aria-pressed={fileName === file.fileName && level.id === file.level.id}
          onClick={() => { load(file.level, file, true); fitLevel(file.level); setPanel('build'); requestAnimationFrame(() => canvasRef.current?.focus()) }}>
          <span className="builder-file-number" aria-hidden="true">↗</span><span><strong>{file.level.name}</strong><small title={file.fileName}>{file.fileName}</small></span>
          </button>
          <button className="builder-use-template" disabled={local.busy} aria-label={`Use ${file.fileName} as template`} onClick={() => chooseTemplate(file.level, file.fileName)}>Use as template</button>
        </div>)}</div>}
        {templates.length > 0 && <><h2>Built-in levels</h2>
        <div className="builder-templates">{templates.map(({ fileName, level: template }) => <button key={fileName} onClick={() => chooseTemplate(template)}><LevelThumbnail level={template} /><strong>{template.name}</strong><span>{fileName}</span></button>)}</div></>}
      </>}
      <input ref={fileRef} aria-label="Import level file" type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} />
    </aside>
    <div className="builder-stage">
      <div className="builder-view-controls">
        <div className="builder-control-group" role="group" aria-label="Canvas tools">{(['select', 'pan'] as const).map(id => <button key={id} aria-label={id === 'select' ? 'Select' : 'Pan'} aria-pressed={tool === id} title={id === 'select' ? 'Select (V)' : 'Pan (H / hold Space)'} onClick={() => setTool(id)}><BuilderIcon kind={id} /></button>)}</div>
        <div className="builder-control-group" role="group" aria-label="Edit history"><button disabled={!history.past.length} onClick={undo}>Undo</button><button disabled={!history.future.length} onClick={redo}>Redo</button></div>
        <div className="builder-control-group"><label className="builder-inline-check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap {LEVEL_GRID_SIZE}</label>
        <label className="builder-inline-check"><input type="checkbox" checked={jumpGuide} onChange={e => setJumpGuide(e.target.checked)} />Jump guide</label></div>
        <div className="builder-control-group builder-zoom-controls" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => zoom(.8)}>−</button><output aria-label="Zoom">{Math.round(view.zoom * 100)}%</output><button aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button></div>
        <div className="builder-control-group" role="group" aria-label="Canvas view"><button onClick={() => fitLevel()}>Fit level</button><button onClick={() => setView(homeView(level, size.height))}>Find start</button></div>
      </div>
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Level canvas" aria-describedby="builder-help" style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? resizeCorner ? resizeCursor : 'default' : 'crosshair' }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setPreview(null); latestPreview.current = null }} onContextMenu={e => e.preventDefault()}
        onWheel={e => { if (e.ctrlKey || e.metaKey) { const r = e.currentTarget.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * .003), { x: e.clientX - r.left, y: e.clientY - r.top }) } else setView(v => ({ ...v, x: v.x + (e.shiftKey ? e.deltaY : e.deltaX) / v.zoom, y: v.y + (e.shiftKey ? 0 : e.deltaY) / v.zoom })) }} />
      <button className="builder-minimap" aria-label="Fit level overview" title="Click to fit the whole level" onClick={() => fitLevel()}><LevelThumbnail level={level} /><span>OVERVIEW</span></button>
      <p id="builder-help" className="builder-help">{TOOLS.find(t => t.id === tool)?.help}</p>
    </div>
    <aside className="builder-inspector" aria-label="Object properties">
      <h2>Inspector</h2>
      <label>Selected object<select aria-label="Selected object" value={selection ? `${selection.kind}:${selection.index}` : ''} onChange={e => { const [kind, index] = e.target.value.split(':'); setSelection(kind ? { kind: kind as Selection['kind'], index: Number(index) } : null); setTool('select') }}>
        <option value="">Nothing selected</option>{allSelections(level).map(s => <option key={`${s.kind}:${s.index}`} value={`${s.kind}:${s.index}`}>{selectionLabel(s, level)}</option>)}
      </select></label>
      {selection && bounds ? <div className="builder-property-card">
        <h3>{selectionLabel(selection, level)}</h3>
        <div className="builder-dimensions">{(['x', 'y', 'w', 'h'] as const).filter(axis => ['platform', 'prop', 'mechanism', 'text'].includes(selection.kind) || (axis === 'x' || axis === 'y') || axis === 'h' && ['rope', 'ladder'].includes(selection.kind) || axis === 'w' && selection.kind === 'trigger').map(axis =>
          <label key={axis}>{({ x: 'X', y: 'Y', w: 'Width', h: 'Height' })[axis]}<input type="number" aria-label={`Object ${axis}`} disabled={!!mechanism && (mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? axis === 'w' : axis === 'h')} step={snap ? LEVEL_GRID_SIZE : 1} value={Math.round((axis === 'y' ? roomHeight - bounds.y : bounds[axis]) * 100) / 100} onChange={e => setDimension(axis, Number(e.target.value))} onBlur={e => { if (snap && e.currentTarget.value !== '') setDimension(axis, quantize(Number(e.currentTarget.value))) }} /></label>)}</div>
        <p>Y is height above the floor, measured at {selection.kind === 'goal' ? 'the plate’s surface' : ['spawn', 'checkpoint'].includes(selection.kind) ? 'the feet' : selection.kind === 'rope' ? 'the anchor' : 'the top of the object'}.</p>
        {selection.kind === 'goal' && level.goal && <button aria-pressed={!!level.goal.flipX} onClick={() => {
          const next = copyLevel(history.present)
          if (next.goal) { if (next.goal.flipX) delete next.goal.flipX; else next.goal.flipX = true }
          commit(next)
        }}>Flip horizontally</button>}
        {chosen?.profile && <><button onClick={() => commit(replacePlatform(history.present, selection.index, { ...chosen, profile: [...chosen.profile!].reverse().map(([x, y]) => [chosen.w - x, y]) }))}>Flip slope</button><p>Drag the white points to shape the surface.</p></>}
        {chosen && <><button aria-pressed={tool === 'node'} onClick={() => { setTool('node'); setMessage('') }}>Add node</button><p>Drag square handles to resize the whole shape. Drag white nodes to change its geometry. Steeper slopes leave less grip for climbing and can cause sliding.</p></>}
        {selection.kind === 'ladder' && <p>Climb with Up / Down. Jump to leave the ladder.</p>}
        {selection.kind === 'timer' && <p>Mounted on the back wall. Shows the run time, stops when the player enters the exit, and never blocks the player or objects.</p>}
        {selection.kind === 'pickup' && <p>Touch to stop the level timer for 10 seconds while gameplay continues. Extra watches add 10 seconds to the remaining pause. Collected once per run; returns on restart.</p>}
        {wallText && <>
          <label>Text<textarea aria-label="Wall text content" rows={4} maxLength={1000} value={wallText.text} onChange={e => changeObject('text', e.target.value)} /></label>
          <div className="builder-dimensions">
            <label>Font size<input aria-label="Text font size" type="number" min={12} max={96} step={2} value={wallText.fontSize} onChange={e => changeObject('fontSize', Number(e.target.value))} /></label>
            <label>Alignment<select aria-label="Text alignment" value={wallText.align} onChange={e => changeObject('align', e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </div>
          <p>Text wraps inside this area. Resize it to show more lines. Mounted on the back wall, with no collision.</p>
        </>}
        {selection.kind === 'rope' && <><p>{level.climbables.ropes[selection.index].anchor ? 'Anchored to terrain. Moving that terrain carries the anchor.' : 'Free anchor. Place it near a terrain edge to attach it.'}</p><button onClick={() => {
          const next = copyLevel(history.present), r = next.climbables.ropes[selection.index]
          if (r.anchor) { delete r.anchor; commit(next) } else commit(anchorRope(next, selection.index))
        }}>{level.climbables.ropes[selection.index].anchor ? 'Detach anchor' : 'Anchor to nearby terrain'}</button></>}
        {mechanism?.kind === 'lift' && <label>Distance to anchor<input aria-label="Distance to anchor" type="number" min={60} max={1200} step={20} value={mechanism.travel} onChange={e => changeObject('travel', Number(e.target.value))} /></label>}
        {mechanism && isHorizontalGate(mechanism) && <><button aria-pressed={!!mechanism.flipX} onClick={() => {
          const next = copyLevel(level), m = next.mechanisms![selection.index]
          if (m.flipX) delete m.flipX; else m.flipX = true
          commit(next)
        }}>Flip horizontally</button><p>20 units thick. Retracts {mechanism.flipX ? 'right' : 'left'} by its own width while the plate is held. Releasing it closes the gate. The rope length follows the width.</p></>}
        {mechanism?.kind === 'gate' && !isHorizontalGate(mechanism) && <p>20 units thick. Rises by its own height while the plate is held. Releasing it lowers the gate. The rope length follows the height.</p>}
        {mechanism?.kind === 'gate' && <p>If closing catches the player or an object, the gate reopens and waits for the path to clear.</p>}
        {mechanism?.kind === 'lift' && <p>20 units thick. Moves between its starting position and the anchor while the plate is held. Pauses in place when released. Adjust the width to set the platform size.</p>}
        {trigger && <><label>Activates<select aria-label="Connected mechanism" value={trigger.target} onChange={e => changeObject('target', e.target.value)}><option value="">Choose a mechanism</option>{level.mechanisms?.map((m, i) => <option key={m.id} value={m.id}>{mechanismLabel(m)} {i + 1}</option>)}</select></label><p>The player, a crate, or a ball can hold this plate. Releasing pauses elevators and closes gates.</p></>}
        {robot && <><div className="builder-dimensions"><label>Left limit<input aria-label="Shovebot left limit" type="number" value={Math.round(robot.left)} onChange={e => changeObject('left', Number(e.target.value))} /></label><label>Right limit<input aria-label="Shovebot right limit" type="number" value={Math.round(robot.right)} onChange={e => changeObject('right', Number(e.target.value))} /></label></div><p>Chases on sight. A brief wind-up, a hard shove, then straight back after you.</p></>}
        <div className="builder-object-actions"><button disabled={['spawn', 'goal'].includes(selection.kind)} onClick={duplicate}>Duplicate</button><button className="builder-delete" disabled={['spawn', 'goal'].includes(selection.kind)} onClick={remove}>Delete object</button></div>
      </div> : <div className="builder-empty-selection"><BuilderIcon kind="select" /><strong>Make it yours.</strong><p>Choose a tool and draw in the canvas, or select an object to refine it.</p></div>}
      <details className="builder-level-settings" open={!selection}>
        <summary>Level settings</summary>
        <label>File name<input aria-label="Level file name" value={fileName} onChange={e => { setFileName(e.target.value); setFileSource(undefined) }} /></label>
        <p>Filenames set level order. Saving under a new filename creates a copy.</p>
        <button className="builder-save-location" title={local.canWrite ? local.name : 'Choose a save folder in Library'} onClick={() => setPanel('library')}><span>Save location</span><strong>{local.canWrite ? local.name : 'Downloads'}</strong><span aria-hidden="true">↗</span></button>
        <label>Level width<input type="number" aria-label="Level width" step={100} value={level.width} min={800} max={20000} onChange={e => {
          const extent = Math.max(800, level.spawn.x + 40, ...allSelections(level).map(s => { const b = itemBounds(level, s)!; return b.x + b.w + (level.floor === undefined ? 0 : 24) }))
          commit({ ...history.present, width: clamp(Number(e.target.value), extent, 20000) })
        }} /></label>
        <label>Level height<input type="number" aria-label="Level height" step={100} value={levelHeight(level)} min={400} max={6000} onChange={e => {
          const next = resizeLevelHeight(history.present, Number(e.target.value))
          keepFloorInView(next); commit(next)
        }} /></label>
        <p>Height adds or removes space at the top. The floor stays at Y = 0.</p>
        {isPuzzleLevel(level) && <>
          <h3>Medal times <small>seconds</small></h3><div className="builder-medal-inputs">{(['gold', 'silver', 'bronze'] as const).map(medal => <label key={medal}>{medal}<input type="number" aria-label={`${medal} time`} min={.1} max={3600} step={.5} value={level.times[medal]} onChange={e => commit({ ...history.present, times: { ...level.times, [medal]: clamp(Number(e.target.value), .1, 3600) } })} /></label>)}</div>
          <label>Player hint<textarea aria-label="Player hint" rows={3} maxLength={600} value={level.description ?? ''} onChange={e => commit({ ...history.present, description: e.target.value })} /></label>
        </>}
      </details>
      <div className={`builder-validation ${problems.length ? 'has-problems' : ''}`}><strong>{problems.length ? 'Before you play' : 'Ready to playtest'}</strong>{problems.length ? problems.map(issue => <p key={issue} role="alert">{issue}</p>) : <p>{isPuzzleLevel(level) ? 'Start and goal are placed. Test the route, then export it.' : 'The player has a clear place to start.'}</p>}</div>
      <p className="builder-shortcuts">V Select · H / Space Pan<br />⌘ / Ctrl D Duplicate · Z Undo<br />Arrow keys Move · Delete Remove</p>
    </aside>
    <footer className="builder-status"><span role="status" aria-label="Builder status">{message || 'Changes stay in this session until you save a JSON file.'}</span><span><output aria-label="Cursor coordinates">{pointer ? `${Math.round(pointer.x)}, ${Math.round(roomHeight - pointer.y)}` : '0, 0 = bottom left'}</output> · Scroll to pan · Ctrl + scroll to zoom</span></footer>
  </section>
}
