import { polygonPoints } from './geometry'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { anchorRope, moveVertex, insertTerrainNode, deleteTerrainNode, terrainNodeTarget, addItem, allSelections, clamp, deleteItem, duplicateItem, hitItem, itemBounds, itemOutline, itemHandle, moveItem, replacePlatform, resizeItem, resizeLevelHeight, setElevatorTravel, setTriggerTargets } from './editor'
import type { ResizeHandle, Selection, Tool } from './editor'
import { copyLevel, LEVEL_GRID_SIZE, isPuzzleLevel, levelPlayer, levelProblems, levelTerrain, levelHeight, parseLevel, prepareLevelRopes, triggerTargets } from './level'
import type { JumpLevel } from './level'
import { drawAthlete, drawClimbables, drawTerrain, drawLevelBackdrop } from './render'
import { blankTrial } from './level'
import type { LevelFile } from './levelAssets'
import { levelFileName } from './localLevels'
import type { LocalLevels } from './localLevels'
import { copyForEditing } from './puzzleEditor'
import { createPreviewRun } from './challenge'
import { useRopePreview } from './useRopePreview'
import { prepareLevelInWorker } from './levelPreparation'
import { drawPuzzleWorld } from './challengeRender'
import { canPlaceOnSurface, placeOnSurface, surfacePlacement } from './editorPlacement'
import { NumberField } from './NumberField'
import { BuilderIcon } from './BuilderIcon'
import { LevelThumbnail } from './LevelThumbnail'
import { BuilderLibrary } from './BuilderLibrary'
import type { LibraryChoice } from './BuilderLibrary'
import type { LevelSource } from './routes'
import { isHorizontalGate, mechanismAnchor, mechanismLabel, mechanismOpenPosition, mechanismRopeEnd } from './mechanisms'
import './builder.css'

// Rope rest shapes are derived asynchronously, not unsaved author edits.
function editSignature(level: JumpLevel) {
  const next = copyLevel(level)
  for (const rope of next.climbables.ropes) delete rope.rest
  return JSON.stringify(next)
}

type Point = { x: number; y: number }
type View = Point & { zoom: number }
const homeView = (level: JumpLevel, height: number): View => ({ x: Math.max(0, level.spawn.x - 200), y: Math.max(100, level.spawn.y - height / .8 * .72), zoom: .8 })
function selectionHandles(level: JumpLevel, selection: Selection | null, zoom: number): (Point & { corner: ResizeHandle })[] {
  if (!selection) return []
  const terrain = selection.kind === 'platform' ? level.platforms[selection.index] : null
  // Keep the resize frame outside the white geometry nodes at every zoom.
  if (terrain) return (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(corner => ({ corner,
    x: terrain.x + (corner.endsWith('left') ? -16 / zoom : terrain.w + 16 / zoom),
    y: terrain.y + (corner.startsWith('top') ? -16 / zoom : terrain.h + 16 / zoom) }))
  const bounds = itemBounds(level, selection)
  if (!bounds) return []
  const mechanism = selection.kind === 'mechanism' ? level.mechanisms?.[selection.index] : null
  if (selection.kind === 'rope') {
    const point = itemHandle(level, selection)
    return point ? [{ ...point, y: point.y + 8 / zoom, corner: 'bottom' }] : []
  }
  const corners: ResizeHandle[] = selection.kind === 'ladder' ? ['top', 'bottom']
    : mechanism ? mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? ['top', 'bottom'] : ['left', 'right']
    : selection.kind === 'trigger' ? ['left', 'right']
    : ['prop', 'text'].includes(selection.kind) ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []
  return corners.map(corner => ({ corner,
    x: bounds.x + (corner.endsWith('left') ? -8 / zoom : corner.endsWith('right') ? bounds.w + 8 / zoom : bounds.w / 2),
    y: bounds.y + (corner.startsWith('top') ? -8 / zoom : corner.startsWith('bottom') ? bounds.h + 8 / zoom : bounds.h / 2) }))
}
type Drag = { mode: 'move' | 'resize' | 'travel' | 'point' | 'draw' | 'pan'; start: Point; screen: Point; base: JumpLevel; view: View; selection: Selection | null; point?: number; corner?: ResizeHandle; inserted?: boolean }
const TOOLS: { id: Tool; group: string; label: string; help: string }[] = [
  { id: 'platform', group: 'Terrain', label: 'Terrain', help: 'Drag to create terrain, then reshape it with the white nodes. Use the Node tool to add points along an edge.' },
  { id: 'node', group: 'Terrain', label: 'Node', help: 'Click a terrain edge to add a node at the highlighted point. Drag to reshape it. N activates this tool.' },
  { id: 'rope', group: 'Movement', label: 'Rope', help: 'Drag down from the anchor. Start near a terrain edge to attach the anchor to it.' },
  { id: 'ladder', group: 'Movement', label: 'Ladder', help: 'Drag down anywhere to place a ladder. Move it or change its height in the inspector.' },
  { id: 'ball', group: 'Objects', label: 'Ball', help: 'Click for a standard ball, or drag to choose its size. Corner handles resize it.' },
  { id: 'box', group: 'Objects', label: 'Box', help: 'Click for a standard box, or drag to choose its size. Corner handles resize it.' },
  { id: 'pusher', group: 'Objects', label: 'Shovebot', help: 'Click a surface to place a shovebot. Set its patrol limits in the inspector.' },
  { id: 'lift', group: 'Mechanisms', label: 'Elevator', help: 'Click to place the platform, or drag vertically to set its travel. Select it and drag the upper stop to change travel height. Connect a pressure plate to move it.' },
  { id: 'gate', group: 'Mechanisms', label: 'Gate', help: 'Click for a standard gate, or drag vertically to choose its height. Drag its top or bottom handle to resize.' },
  { id: 'horizontal-gate', group: 'Mechanisms', label: 'Horizontal gate', help: 'Click or drag horizontally to place a gate. It retracts by its own width. Flip it in the inspector to reverse its direction.' },
  { id: 'plate', group: 'Mechanisms', label: 'Pressure plate', help: 'Click a surface to place a pressure plate, then choose which elevators and gates it activates in the inspector. The player, boxes, and balls can hold it down.' },
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


export function LevelBuilder({ active, onPlay, onClose, templates, local, collections, initialFile, onFileChange }: {
  active: boolean; onPlay: (level: JumpLevel) => void; onClose: () => void
  templates: LevelFile[]; local: LocalLevels; initialFile?: LevelFile
  collections?: { local: LocalLevels; builtIn: LocalLevels }
  onFileChange: (fileName?: string, source?: LevelSource) => void
}) {
  const [initial] = useState(() => ({ level: prepareLevelRopes(initialFile ? copyLevel(initialFile.level) : blankTrial(), true) }))
  const [fileName, setFileName] = useState(initialFile?.fileName ?? levelFileName(initial.level.name))
  const suggestFileName = useRef(!initialFile)
  const [fileSource, setFileSource] = useState({ text: initialFile?.sourceText, fileName: initialFile?.fileName, folderId: local.folderId })
  const [saved, setSaved] = useState<{ level: string | null; fileName: string }>({ level: editSignature(initial.level), fileName })
  const [history, setHistory] = useState({ past: [] as JumpLevel[], present: initial.level, future: [] as JumpLevel[] })
  const [preview, setPreview] = useState<JumpLevel | null>(null)
  const { level, busy: preparingRopes } = useRopePreview(preview ?? history.present, preview !== null)
  const previewRun = useMemo(() => isPuzzleLevel(level) ? createPreviewRun(level) : null, [level])
  const previewPlayer = useMemo(() => previewRun?.player ?? levelPlayer(level, true), [level, previewRun])
  const roomHeight = levelHeight(level)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false), savePending = useRef(false)
  const savePreparation = useRef<AbortController | null>(null)
  useEffect(() => () => savePreparation.current?.abort(), [])
  const [tool, setTool] = useState<Tool>('select'), [selection, setSelection] = useState<Selection | null>(null)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const observedRemoval = useRef(local.lastRemoved)
  const signature = useMemo(() => editSignature(history.present), [history.present])
  const dirty = saved.level !== signature || saved.fileName !== fileName
  const detachDeletedFile = useEffectEvent(() => {
    if (local.lastRemoved?.folderId !== fileSource.folderId || local.lastRemoved?.fileName !== fileSource.fileName) return
    setFileSource({ text: undefined, fileName: undefined, folderId: local.folderId })
    setSaved({ level: null, fileName }); onFileChange(undefined)
    setMessage('')
  })
  useEffect(() => {
    if (observedRemoval.current === local.lastRemoved) return
    observedRemoval.current = local.lastRemoved
    if (local.lastRemoved) detachDeletedFile()
  }, [local.lastRemoved])
  const [keepTool, setKeepTool] = useState(false)
  const panHeld = useRef(false)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [snap, setSnap] = useState(true), [view, setView] = useState<View>({ x: 0, y: 100, zoom: .8 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<HTMLCanvasElement>(null), drag = useRef<Drag | null>(null)
  const latestPreview = useRef<JumpLevel | null>(null)
  const framed = useRef(false)
  const bounds = useMemo(() => selection ? itemBounds(level, selection) : null, [level, selection])
  const outline = useMemo(() => selection ? itemOutline(level, selection) : null, [level, selection])
  const support = useMemo(() => selection ? surfacePlacement(level, selection) : null, [level, selection])
  const chosen = selection?.kind === 'platform' ? level.platforms[selection.index] : null
  const resizeHandles = useMemo(() => selectionHandles(level, selection, view.zoom), [level, selection, view.zoom])
  const resizeHandleAt = (p: Point) => resizeHandles.find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) < 10 / view.zoom)
  const hoverHandle = pointer && resizeHandleAt(pointer)
  const resizeCorner = drag.current?.mode === 'resize' ? drag.current.corner : hoverHandle?.corner
  const resizeCursor = resizeCorner === 'top' || resizeCorner === 'bottom' ? 'ns-resize' : resizeCorner === 'left' || resizeCorner === 'right' ? 'ew-resize' : resizeCorner === 'top-left' || resizeCorner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
  const problems = useMemo(() => levelProblems(level), [level]), problem = problems[0]
  const mechanism = selection?.kind === 'mechanism' ? level.mechanisms?.[selection.index] : null
  const travelHandle = mechanism?.kind === 'lift' ? mechanismAnchor(mechanism) : null
  const travelHandleAt = (p: Point) => travelHandle && Math.hypot(p.x - travelHandle.x, p.y - travelHandle.y) < 10 / view.zoom
  const adjustingTravel = drag.current?.mode === 'travel' || pointer && travelHandleAt(pointer)
  const trigger = selection?.kind === 'trigger' ? level.triggers?.[selection.index] : null
  const robot = selection?.kind === 'robot' ? level.robots?.[selection.index] : null
  const wallText = selection?.kind === 'text' ? level.texts?.[selection.index] : null
  const quantize = useCallback((v: number) => snap ? Math.round(v / LEVEL_GRID_SIZE) * LEVEL_GRID_SIZE : Math.round(v), [snap])
  const quantizeY = useCallback((y: number) => roomHeight - quantize(roomHeight - y), [roomHeight, quantize])
  const nodeTarget = useMemo(() => tool === 'node' && pointer ? terrainNodeTarget(level, pointer.x, pointer.y, 12 / view.zoom, snap ? LEVEL_GRID_SIZE : 0) : null,
    [tool, pointer, level, view.zoom, snap])

  function chooseSelection(next: Selection | null) { setSelection(next); setSelectedNode(null) }
  function commit(next: JumpLevel) {
    next = prepareLevelRopes(next, true)
    setHistory(h => JSON.stringify(next) === JSON.stringify(h.present) ? h : { past: [...h.past, h.present].slice(-60), present: next, future: [] })
    setPreview(null); latestPreview.current = null; setMessage('')
  }
  function undo() {
    if (history.past.length) keepFloorInView(history.past.at(-1)!)
    setHistory(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h)
    chooseSelection(null); setPreview(null); latestPreview.current = null; drag.current = null
  }
  function redo() {
    if (history.future.length) keepFloorInView(history.future[0])
    setHistory(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)
    chooseSelection(null); setPreview(null); latestPreview.current = null; drag.current = null
  }
  function keepFloorInView(next: JumpLevel) {
    const dy = levelHeight(next) - levelHeight(history.present)
    if (!dy) return
    setView(v => ({ ...v, y: v.y + dy }))
    setPointer(p => p && { ...p, y: p.y + dy })
  }
  function load(next: JumpLevel, file?: LevelFile, source: LevelSource = local.repository ? 'built-in' : 'local') {
    next = prepareLevelRopes(copyLevel(next), true)
    const name = file?.fileName ?? levelFileName(next.name)
    suggestFileName.current = !file
    const target = collections ? source === 'built-in' ? collections.builtIn : collections.local : local
    setFileName(name); setFileSource({ text: file?.sourceText, fileName: file?.fileName, folderId: target.folderId })
    setHistory({ past: [], present: next, future: [] })
    setSaved({ level: editSignature(next), fileName: name })
    setPreview(null); latestPreview.current = null; drag.current = null
    chooseSelection(null); setTool('select'); setView(homeView(next, size.height)); setMessage('')
    onFileChange(file?.fileName, source)
  }
  function chooseLibraryItem(choice: LibraryChoice) {
    if (choice.kind === 'template') chooseTemplate(choice.file.level, choice.source)
    else {
      const next = choice.kind === 'open' ? choice.file.level : blankTrial()
      load(next, choice.kind === 'open' ? choice.file : undefined, choice.source)
      if (choice.kind === 'open') fitLevel(next)
    }
    setLibraryOpen(false)
    requestAnimationFrame(() => canvasRef.current?.focus())
  }
  function remove() {
    if (selection) { commit(deleteItem(history.present, selection)); chooseSelection(null) }
  }
  function removeNode() {
    if (selection?.kind !== 'platform' || selectedNode === null) return
    try {
      const next = deleteTerrainNode(history.present, selection.index, selectedNode)
      commit(next); setSelectedNode(Math.min(selectedNode, polygonPoints(next.platforms[selection.index]).length - 1))
    } catch (error) { setMessage((error as Error).message) }
  }
  function add(tool: Tool, start: Point, end: Point, free = false) {
    try {
      const added = addItem(history.present, tool, start, end)
      if (added) { commit(snap && !free ? placeOnSurface(added.level, added.selection, 12 / view.zoom) : added.level); chooseSelection(added.selection); if (!keepTool) setTool('select') }
    } catch (error) { setMessage((error as Error).message) }
  }
  async function save(testAfter = false, updateRoute = true): Promise<LevelFile | undefined> {
    if (savePending.current || local.busy) return undefined
    if (!local.canWrite) {
      setMessage(local.hasHandle ? 'Enable saving in this folder before saving your level.' : 'Choose a writable level folder before saving your level.')
      setLibraryOpen(true)
      return undefined
    }
    savePending.current = true; setSaving(true)
    try {
      const controller = new AbortController(); savePreparation.current = controller
      const next = parseLevel((await prepareLevelInWorker(level, { signal: controller.signal })).level)
      const name = suggestFileName.current ? levelFileName(next.name) : fileName
      const ownsFile = fileSource.folderId === local.folderId && fileSource.text !== undefined
      const previousName = ownsFile ? fileSource.fileName! : name
      if (local.files.some(file => file.fileName !== previousName && file.fileName !== name && file.level.id === next.id)) {
        throw new Error('Another file in this folder uses this level’s ID. Use a template to create an independent level.')
      }
      const source = await local.save(name, next, ownsFile ? fileSource.text : undefined, previousName)
      suggestFileName.current = false
      setFileName(name); setFileSource({ text: source, fileName: name, folderId: local.folderId })
      setSaved({ level: editSignature(history.present), fileName: name })
      setMessage(previousName !== name ? `Renamed “${previousName}” to “${name}” and saved.` : `Saved “${name}” to ${local.name}.`)
      if (updateRoute) onFileChange(name)
      if (testAfter) onPlay(copyLevel(next))
      return { fileName: name, level: next, sourceText: source }
    } catch (error) { setMessage(`Could not save: ${(error as Error).message}`); return undefined }
    finally { savePreparation.current = null; savePending.current = false; setSaving(false) }
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
    if (previewRun) drawPuzzleWorld(ctx, previewRun, true)
    else { drawTerrain(ctx, levelTerrain(level)); drawClimbables(ctx, previewPlayer, level.climbables); ctx.globalAlpha = .55; drawAthlete(ctx, previewPlayer); ctx.globalAlpha = 1 }
    ctx.fillStyle = '#ce6548'; ctx.beginPath(); ctx.arc(level.spawn.x, level.spawn.y + 12, 4 / view.zoom, 0, Math.PI * 2); ctx.fill()
    if (mechanism) {
      const open = mechanismOpenPosition(mechanism)
      ctx.strokeStyle = '#b78947'; ctx.lineWidth = 1 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
      ctx.strokeRect(open.x, open.y, mechanism.w, mechanism.h)
      ctx.setLineDash([])
      if (mechanism.kind === 'lift') {
        const anchor = mechanismAnchor(mechanism), end = mechanismRopeEnd(mechanism)
        ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
        ctx.beginPath(); ctx.moveTo(end.x, end.y); ctx.lineTo(anchor.x, anchor.y); ctx.stroke(); ctx.setLineDash([])
        const handle = 9 / view.zoom; ctx.fillStyle = '#c65231'
        ctx.fillRect(anchor.x - handle / 2, anchor.y - handle / 2, handle, handle)
      }
    }
    if (robot) {
      ctx.strokeStyle = '#cc6a49'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 3 / view.zoom]); ctx.beginPath(); ctx.moveTo(robot.left, robot.y - 65); ctx.lineTo(robot.right, robot.y - 65); ctx.stroke(); ctx.setLineDash([])
      for (const x of [robot.left, robot.right]) { ctx.beginPath(); ctx.arc(x, robot.y - 65, 3 / view.zoom, 0, Math.PI * 2); ctx.fill() }
    }
    if (support && Math.abs(support.delta) < .1) {
      ctx.strokeStyle = '#60826a'; ctx.lineWidth = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(support.left, support.y); ctx.lineTo(support.right, support.y); ctx.stroke()
    }
    if (outline) {
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
      const padding = (chosen ? 16 : 8) / view.zoom
      ctx.strokeRect(outline.x - padding, outline.y - padding - (outline.h ? 0 : 62), Math.max(8, outline.w + padding * 2), Math.max(8, outline.h + padding * 2 + (outline.h ? 0 : 62)))
      ctx.setLineDash([])
      for (const point of resizeHandles) {
        const handle = 9 / view.zoom; ctx.fillStyle = '#c65231'
        ctx.fillRect(point.x - handle / 2, point.y - handle / 2, handle, handle)
      }
      if (chosen) for (const [i, [wx, wy]] of polygonPoints(chosen).entries()) {
        ctx.beginPath(); ctx.arc(wx, wy, (i === selectedNode ? 6 : 4.5) / view.zoom, 0, Math.PI * 2)
        ctx.fillStyle = i === selectedNode ? '#c65231' : '#fffdf5'; ctx.fill(); ctx.stroke()
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
  }, [active, level, previewRun, previewPlayer, view, size, outline, resizeHandles, chosen, selectedNode, mechanism, robot, nodeTarget, support])

  function position(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: view.x + (event.clientX - rect.left) / view.zoom, y: view.y + (event.clientY - rect.top) / view.zoom }
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
    const p = position(event), screen = { x: event.clientX, y: event.clientY }, base = history.present
    latestPreview.current = null
    if (panHeld.current || event.button === 1) { drag.current = { mode: 'pan', start: p, screen, base, view, selection: null }; return }
    if (tool === 'node') {
      const target = terrainNodeTarget(base, p.x, p.y, 12 / view.zoom, snap ? LEVEL_GRID_SIZE : 0)
      if (!target) { setMessage('Click a terrain edge away from an existing node.'); return }
      try {
        const next = insertTerrainNode(base, target), selected = { kind: 'platform' as const, index: target.index }
        chooseSelection(selected); setSelectedNode(target.edge + 1); setMessage(''); setPreview(next); latestPreview.current = next
        drag.current = { mode: 'point', start: p, screen, base: next, view, selection: selected, point: target.edge + 1, inserted: true }
        if (!keepTool) setTool('select')
      } catch (error) { setMessage((error as Error).message) }
      return
    }
    if (tool !== 'select') { drag.current = { mode: 'draw', start: event.altKey ? p : { x: quantize(p.x), y: quantizeY(p.y) }, screen, base, view, selection: null }; return }
    if (selection && travelHandleAt(p)) {
      drag.current = { mode: 'travel', start: p, screen, base, view, selection }; return
    }
    const handle = resizeHandleAt(p)
    if (selection && handle) {
      setSelectedNode(null)
      drag.current = { mode: 'resize', start: p, screen, base, view, selection, corner: handle.corner }; return
    }
    if (selection && chosen) {
      const point = polygonPoints(chosen).findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 10 / view.zoom)
      if (point >= 0) { setSelectedNode(point); drag.current = { mode: 'point', start: p, screen, base, view, selection, point }; return }
    }
    const hit = hitItem(level, p.x, p.y, 9 / view.zoom)
    chooseSelection(hit); drag.current = { mode: hit ? 'move' : 'pan', start: p, screen, base, view, selection: hit }
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    if (!d) { setPointer(position(event)); return }
    if (d.mode === 'pan') { setView({ ...d.view, x: d.view.x - (event.clientX - d.screen.x) / d.view.zoom, y: d.view.y - (event.clientY - d.screen.y) / d.view.zoom }); return }
    const p = position(event), dx = p.x - d.start.x, dy = p.y - d.start.y
    const qx = (v: number) => event.altKey ? v : quantize(v), qy = (v: number) => event.altKey ? v : quantizeY(v)
    let next: JumpLevel | null = null
    if (d.mode === 'draw') {
      try {
        const added = addItem(d.base, tool, d.start, event.altKey ? p : { x: quantize(p.x), y: quantizeY(p.y) })
        next = added ? snap && !event.altKey ? placeOnSurface(added.level, added.selection, 12 / view.zoom) : added.level : null
      } catch { /* Explain invalid placement when released. */ }
    } else if (d.selection) {
      const b = itemBounds(d.base, d.selection)!
      if (d.mode === 'move') {
        next = moveItem(d.base, d.selection, event.altKey ? dx : quantize(b.x + dx) - b.x, event.altKey ? dy : quantizeY(b.y + dy) - b.y)
        if (snap && !event.altKey) next = placeOnSurface(next, d.selection, 12 / view.zoom)
      }
      if (d.mode === 'travel') {
        const elevator = d.base.mechanisms![d.selection.index]
        next = setElevatorTravel(d.base, d.selection.index, elevator.y - qy(mechanismAnchor(elevator).y + dy))
      }
      if (d.mode === 'resize') {
        const width = d.corner === 'top' || d.corner === 'bottom' ? b.w : d.corner?.endsWith('left') ? b.x + b.w - qx(b.x + dx) : qx(b.x + b.w + dx) - b.x
        const height = d.corner === 'left' || d.corner === 'right' ? b.h : d.corner?.startsWith('top') ? b.y + b.h - qy(b.y + dy) : qy(b.y + b.h + dy) - b.y
        next = resizeItem(d.base, d.selection, Math.max(snap && !event.altKey ? LEVEL_GRID_SIZE : 1, width), Math.max(snap && !event.altKey ? LEVEL_GRID_SIZE : 1, height), d.corner)
      }
      if (d.mode === 'point') {
        const point = polygonPoints(d.base.platforms[d.selection.index])[d.point!]
        next = d.inserted && Math.hypot(dx, dy) * view.zoom < 3 ? d.base
          : moveVertex(d.base, d.selection.index, d.point!, qx(point[0] + dx) - point[0], qy(point[1] + dy) - point[1])
      }
    }
    if (next) { latestPreview.current = next; setPreview(next) }
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current; drag.current = null
    setPointer(position(event))
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!d) return
    if (d.mode === 'draw') { const p = position(event); add(tool, d.start, event.altKey ? p : { x: quantize(p.x), y: quantizeY(p.y) }, event.altKey) }
    else if (latestPreview.current) commit(latestPreview.current)
    setPreview(null); latestPreview.current = null
  }
  function zoom(factor: number, at = { x: size.width / 2, y: size.height / 2 }) {
    setView(v => {
      const z = clamp(v.zoom * factor, .08, 2.5)
      if (outline) return { zoom: z, x: outline.x + outline.w / 2 - size.width / (2 * z),
        y: outline.y + (outline.h ? outline.h / 2 : -31) - size.height / (2 * z) }
      return { zoom: z, x: v.x + at.x / v.zoom - at.x / z, y: v.y + at.y / v.zoom - at.y / z }
    })
  }
  function setDimension(axis: 'x' | 'y' | 'w' | 'h', value: number) {
    if (!selection || !bounds || !Number.isFinite(value)) return
    commit(axis === 'x' || axis === 'y' ? moveItem(history.present, selection, axis === 'x' ? value - bounds.x : 0, axis === 'y' ? roomHeight - value - bounds.y : 0)
      : resizeItem(history.present, selection, axis === 'w' ? value : bounds.w, axis === 'h' ? value : bounds.h))
  }

  function duplicate() {
    if (!selection) return
    const result = duplicateItem(history.present, selection)
    if (result) { commit(result.level); chooseSelection(result.selection) }
  }
  function fitLevel(next = level) {
    const z = Math.min(size.width / (next.width + 120), size.height / (levelHeight(next) + 120))
    setView({ x: -60, y: -60, zoom: clamp(z, .08, 2.5) })
  }
  function chooseTemplate(template: JumpLevel, source?: LevelSource) {
    const next = copyForEditing(template)
    load(next, undefined, source); fitLevel(next); setSaved({ level: null, fileName: levelFileName(next.name) })
    setMessage(`Created a new level from “${template.name}”. Its file will be created when you save.`)
    requestAnimationFrame(() => canvasRef.current?.focus())
  }
  function changeObject(field: string, value: number | string) {
    if (!selection) return
    if (selection.kind === 'mechanism' && field === 'travel') {
      commit(setElevatorTravel(history.present, selection.index, Number(value))); return
    }
    const next = copyLevel(history.present)
    if (selection.kind === 'text') {
      const text = next.texts![selection.index]
      if (field === 'text') text.text = String(value).slice(0, 1000)
      if (field === 'fontSize' && Number.isFinite(Number(value))) text.fontSize = clamp(Number(value), 12, 96)
      if (field === 'align' && (value === 'left' || value === 'center' || value === 'right')) text.align = value
    }
    if (selection.kind === 'robot') {
      const r = next.robots![selection.index]
      if (field === 'left') r.left = clamp(Number(value), 50, Math.min(r.x, r.right - 50))
      else r.right = clamp(Number(value), Math.max(r.x, r.left + 50), next.width - 50)
    }
    commit(next)
  }

  return <section className="jumping-builder" hidden={!active} aria-label="Level builder" onKeyDown={event => {
    if (libraryOpen) return
    if ((event.target as HTMLElement).matches('input, select, textarea')) return
    if (event.code === 'Space') { event.preventDefault(); panHeld.current = true }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
    else if (event.key === 'Escape') { setTool('select'); chooseSelection(null); drag.current = null; setPreview(null); latestPreview.current = null }
    else if (!event.ctrlKey && !event.metaKey && ({ v: 'select', n: 'node', p: 'platform', r: 'rope', l: 'ladder', f: 'goal' } as Record<string, Tool>)[event.key.toLowerCase()]) { event.preventDefault(); setTool(({ v: 'select', n: 'node', p: 'platform', r: 'rope', l: 'ladder', f: 'goal' } as Record<string, Tool>)[event.key.toLowerCase()]) }
    else if (event.target === canvasRef.current && selection) {
      if (event.key === 'End') { event.preventDefault(); commit(placeOnSurface(history.present, selection)) }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selectedNode !== null && chosen) removeNode(); else remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 1 : snap ? LEVEL_GRID_SIZE : 5
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const node = chosen && selectedNode !== null ? polygonPoints(chosen)[selectedNode] : null
        const origin = node ? { x: node[0], y: node[1] } : bounds
        const shiftX = snap && !event.shiftKey && origin && dx ? quantize(origin.x + dx) - origin.x : dx
        const shiftY = snap && !event.shiftKey && origin && dy ? quantizeY(origin.y + dy) - origin.y : dy
        commit(node ? moveVertex(history.present, selection.index, selectedNode!, shiftX, shiftY)
          : moveItem(history.present, selection, shiftX, shiftY))
      }
    }
  }} onKeyUp={event => { if (event.code === 'Space') panHeld.current = false }} onBlur={() => { panHeld.current = false }}>
    <header className="builder-header">
      <div className="builder-brand"><span className="builder-brand-mark" aria-hidden="true">↗</span><div><p className="jumping-eyebrow">UNTITLED JUMPING GAME</p><h1>Level studio</h1></div></div>
      <div className="builder-identity">
        <label className="builder-name">Level name<input aria-label="Level name" maxLength={80} value={level.name} onChange={e => { if (suggestFileName.current) setFileName(levelFileName(e.target.value)); commit({ ...history.present, name: e.target.value }) }} /></label>
        <label className="builder-name builder-file-name">File name<input aria-label="Level file name" placeholder={levelFileName(level.name)} title="Created on first save. Changing a saved filename renames that file on the next save." spellCheck={false} value={fileName} onChange={e => { suggestFileName.current = !e.target.value; setFileName(e.target.value) }} /></label>
      </div>
      <div className="builder-main-actions"><button className="builder-back" disabled={saving} onClick={onClose}>Back to game</button><button aria-haspopup="dialog" disabled={saving} onClick={() => { setMessage(''); setLibraryOpen(true) }}>Library</button><button disabled={local.busy || saving} onClick={() => void save()}>Save level</button><button className="builder-play" disabled={!!problem || local.busy || saving} aria-busy={saving} onClick={() => void save(true)}><span aria-hidden="true">▶</span> Save and Test</button></div>
    </header>
    <aside className="builder-tools" aria-label="Building tools">
        {['Terrain', 'Movement', 'Objects', 'Mechanisms', 'Markers', 'Power-ups', 'Back wall'].map(group => <div className="builder-tool-group" key={group}><h2>{group}</h2><div className="builder-tool-grid">{TOOLS.filter(item => item.group === group && (item.id !== 'checkpoint' || !isPuzzleLevel(level))).map(item => <button key={item.id} aria-pressed={tool === item.id} title={item.help} onClick={() => { setTool(tool === item.id ? 'select' : item.id); setMessage('') }}><BuilderIcon kind={item.id} /><span>{item.label}</span></button>)}</div></div>)}
        <label className="builder-snap"><input type="checkbox" checked={keepTool} onChange={e => setKeepTool(e.target.checked)} /> Keep placing</label>
        {!['select', 'node'].includes(tool) && <button className="builder-add" onClick={() => { const p = { x: quantize(view.x + size.width / view.zoom / 2), y: quantizeY(view.y + size.height / view.zoom / 2) }; add(tool, p, p) }}>Add at view center</button>}
    </aside>
    <div className="builder-stage">
      <div className="builder-view-controls">
        <div className="builder-control-group" role="group" aria-label="Edit history"><button disabled={!history.past.length} onClick={undo}>Undo</button><button disabled={!history.future.length} onClick={redo}>Redo</button></div>
        <div className="builder-control-group"><label className="builder-inline-check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap {LEVEL_GRID_SIZE}</label></div>
        <div className="builder-control-group builder-zoom-controls" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => zoom(.8)}>−</button><output aria-label="Zoom">{Math.round(view.zoom * 100)}%</output><button aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button></div>
        <div className="builder-control-group" role="group" aria-label="Canvas view"><button onClick={() => fitLevel()}>Fit level</button><button onClick={() => setView(homeView(level, size.height))}>Find start</button></div>
      </div>
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Level canvas" aria-describedby="builder-help" aria-busy={preparingRopes} style={{ cursor: drag.current?.mode === 'pan' ? 'grabbing' : tool === 'select' ? adjustingTravel ? 'ns-resize' : resizeCorner ? resizeCursor : 'default' : 'crosshair' }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setPreview(null); latestPreview.current = null }} onContextMenu={e => e.preventDefault()}
        onWheel={e => { if (e.ctrlKey || e.metaKey) { const r = e.currentTarget.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * .003), { x: e.clientX - r.left, y: e.clientY - r.top }) } else setView(v => ({ ...v, x: v.x + (e.shiftKey ? e.deltaY : e.deltaX) / v.zoom, y: v.y + (e.shiftKey ? 0 : e.deltaY) / v.zoom })) }} />
      <button className="builder-minimap" aria-label="Fit level overview" title="Click to fit the whole level" onClick={() => fitLevel()}><LevelThumbnail level={level} preview /><span>OVERVIEW</span></button>
      <p id="builder-help" className="builder-help">{tool === 'select' ? 'Drag to move; handles resize. Snap catches nearby surfaces. Alt bypasses snapping. Space + drag pans.' : `${TOOLS.find(t => t.id === tool)?.help} Esc or click the active tool to stop.`}</p>
    </div>
    <aside className="builder-inspector" aria-label="Object properties">
      <h2>Inspector</h2>
      <label>Selected object<select aria-label="Selected object" value={selection ? `${selection.kind}:${selection.index}` : ''} onChange={e => { const [kind, index] = e.target.value.split(':'); chooseSelection(kind ? { kind: kind as Selection['kind'], index: Number(index) } : null); setTool('select') }}>
        <option value="">Nothing selected</option>{allSelections(level).map(s => <option key={`${s.kind}:${s.index}`} value={`${s.kind}:${s.index}`}>{selectionLabel(s, level)}</option>)}
      </select></label>
      {selection && bounds ? <div className="builder-property-card">
        <h3>{selectionLabel(selection, level)}</h3>
        <div className="builder-dimensions" key={`${selection.kind}:${selection.index}`}>
          {(['x', 'y', 'w', 'h'] as const).filter(axis => axis === 'x' || axis === 'y'
            || axis === 'w' && ['platform', 'prop', 'mechanism', 'text', 'trigger'].includes(selection.kind)
            || axis === 'h' && ['platform', 'mechanism', 'text', 'rope', 'ladder'].includes(selection.kind)).map(axis => {
            const fixed = !!mechanism && (mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? axis === 'w' : axis === 'h')
            const label = axis === 'w' && selection.kind === 'prop' ? 'Size' : fixed ? 'Thickness' : axis === 'h' && selection.kind === 'rope' ? 'Length'
              : ({ x: bounds.w ? 'Left' : 'X', y: bounds.h ? 'Top' : 'Y', w: 'Width', h: 'Height' })[axis]
            return <label key={axis}>{label}<NumberField label={`Object ${axis}`} disabled={fixed} step={snap ? LEVEL_GRID_SIZE : 1}
              value={axis === 'y' ? roomHeight - bounds.y : bounds[axis]} onCommit={value => setDimension(axis, value)} /></label>
          })}
        </div>
        <p className="builder-field-hint">Heights are measured from the floor. Enter applies; Esc cancels.</p>
        {canPlaceOnSurface(selection) && <div className="builder-surface-placement">
          <button disabled={!support || Math.abs(support.delta) < .1} title="Place on the next surface below · End" onClick={() => commit(placeOnSurface(history.present, selection))}>Place on surface <span aria-hidden="true">↓</span></button>
          <span className={support && Math.abs(support.delta) < .1 ? 'is-supported' : ''}>{support ? Math.abs(support.delta) < .1 ? 'On surface' : support.delta > 0 ? `${Math.round(support.delta)} above surface` : 'Overlaps surface' : 'No clear surface below'}</span>
        </div>}
        {selection.kind === 'goal' && level.goal && <button aria-pressed={!!level.goal.flipX} onClick={() => {
          const next = copyLevel(history.present)
          if (next.goal) { if (next.goal.flipX) delete next.goal.flipX; else next.goal.flipX = true }
          commit(next)
        }}>Flip horizontally</button>}
        {chosen?.profile && <><button onClick={() => commit(replacePlatform(history.present, selection.index, { ...chosen, profile: [...chosen.profile!].reverse().map(([x, y]) => [chosen.w - x, y]) }))}>Flip slope</button><p>Drag the white points to shape the surface.</p></>}
        {chosen && <><div className="builder-object-actions"><button aria-pressed={tool === 'node'} onClick={() => { setTool(tool === 'node' ? 'select' : 'node'); setMessage('') }}>Add node</button><button disabled={selectedNode === null || polygonPoints(chosen).length <= 3} onClick={removeNode}>Delete node</button></div><p>Drag square handles to resize the shape. Select a node to move it or press Delete to remove it. At least three nodes must remain.</p></>}
        {selection.kind === 'ladder' && <p>Climb with Up / Down. Jump to leave the ladder.</p>}
        {selection.kind === 'timer' && <p>Mounted on the back wall. Shows the run time, stops when the player enters the exit, and never blocks the player or objects.</p>}
        {selection.kind === 'pickup' && <p>Touch to stop the level timer for 10 seconds while gameplay continues. Extra watches add 10 seconds to the remaining pause. Collected once per run; returns on restart.</p>}
        {wallText && <>
          <label>Text<textarea aria-label="Wall text content" rows={4} maxLength={1000} value={wallText.text} onChange={e => changeObject('text', e.target.value)} /></label>
          <div className="builder-dimensions">
            <label>Font size<NumberField label="Text font size" min={12} max={96} step={2} value={wallText.fontSize} onCommit={value => changeObject('fontSize', value)} /></label>
            <label>Alignment<select aria-label="Text alignment" value={wallText.align} onChange={e => changeObject('align', e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </div>
          <p>Text wraps inside this area. Resize it to show more lines. Mounted on the back wall, with no collision.</p>
        </>}
        {selection.kind === 'rope' && <><p>{level.climbables.ropes[selection.index].anchor ? 'Anchored to terrain. Moving that terrain carries the anchor.' : 'Free anchor. Place it near a terrain edge to attach it.'}</p><button onClick={() => {
          const next = copyLevel(history.present), r = next.climbables.ropes[selection.index]
          if (r.anchor) { delete r.anchor; commit(next) } else commit(anchorRope(next, selection.index))
        }}>{level.climbables.ropes[selection.index].anchor ? 'Detach anchor' : 'Anchor to nearby terrain'}</button></>}
        {mechanism?.kind === 'lift' && <label>Travel height<NumberField label="Travel height" min={60} max={1200} step={snap ? LEVEL_GRID_SIZE : 1} value={mechanism.travel} onCommit={value => changeObject('travel', value)} /></label>}
        {mechanism && isHorizontalGate(mechanism) && <><button aria-pressed={!!mechanism.flipX} onClick={() => {
          const next = copyLevel(level), m = next.mechanisms![selection.index]
          if (m.flipX) delete m.flipX; else m.flipX = true
          commit(next)
        }}>Flip horizontally</button><p>20 units thick. Retracts {mechanism.flipX ? 'right' : 'left'} by its own width while the plate is held. Releasing it closes the gate.</p></>}
        {mechanism?.kind === 'gate' && !isHorizontalGate(mechanism) && <p>20 units thick. Rises by its own height while the plate is held. Releasing it lowers the gate.</p>}
        {mechanism?.kind === 'gate' && <p>If closing catches the player or an object, the gate reopens and waits for the path to clear.</p>}
        {mechanism?.kind === 'lift' && <p>Drag the upper stop to set travel height. Moves while the plate is held and pauses when released.</p>}
        {trigger && <><fieldset className="builder-connections"><legend>Activates</legend>
          {level.mechanisms?.length ? level.mechanisms.map((m, i) => <label key={m.id}><input type="checkbox" checked={triggerTargets(trigger).includes(m.id)} onChange={e => {
            const targets = triggerTargets(trigger)
            commit(setTriggerTargets(history.present, selection.index, e.target.checked ? [...targets, m.id] : targets.filter(id => id !== m.id)))
          }} />{mechanismLabel(m)} {i + 1}</label>) : <p>Add an elevator or gate to connect this plate.</p>}
        </fieldset><p>The player, a crate, or a ball can hold this plate. Releasing pauses elevators and closes gates.</p></>}
        {robot && <><div className="builder-dimensions"><label>Left limit<NumberField label="Shovebot left limit" step={snap ? LEVEL_GRID_SIZE : 1} value={robot.left} onCommit={value => changeObject('left', value)} /></label><label>Right limit<NumberField label="Shovebot right limit" step={snap ? LEVEL_GRID_SIZE : 1} value={robot.right} onCommit={value => changeObject('right', value)} /></label></div><p>Chases on sight. A brief wind-up, a hard shove, then straight back after you.</p></>}
        <div className="builder-object-actions"><button disabled={['spawn', 'goal'].includes(selection.kind)} onClick={duplicate}>Duplicate</button><button className="builder-delete" disabled={['spawn', 'goal'].includes(selection.kind)} onClick={remove}>Delete object</button></div>
      </div> : <div className="builder-empty-selection"><BuilderIcon kind="select" /><strong>Make it yours.</strong><p>Choose a tool and draw in the canvas, or select an object to refine it.</p></div>}
      <details className="builder-level-settings" open={!selection}>
        <summary>Level settings</summary>
        <p>Files are created on the first save. Filename changes rename the current file when saved.</p>
        <button className="builder-save-location" title={local.canWrite ? local.name : 'Choose a save folder in Library'} onClick={() => { setMessage(''); setLibraryOpen(true) }}><span>Save location</span><strong>{local.name || 'Choose level folder'}</strong><span aria-hidden="true">↗</span></button>
        <label>Level width<NumberField label="Level width" step={100} value={level.width} min={800} max={20000} onCommit={value => {
          const extent = Math.max(800, level.spawn.x + 40, ...allSelections(level).map(s => { const b = itemBounds(level, s)!; return b.x + b.w + (level.floor === undefined ? 0 : 24) }))
          commit({ ...history.present, width: clamp(value, extent, 20000) })
        }} /></label>
        <label>Level height<NumberField label="Level height" step={100} value={levelHeight(level)} min={400} max={6000} onCommit={value => {
          const next = resizeLevelHeight(history.present, value)
          keepFloorInView(next); commit(next)
        }} /></label>
        <p>Height adds or removes space at the top. The floor stays at Y = 0.</p>
        {isPuzzleLevel(level) && <>
          <h3>Medal times <small>seconds</small></h3><div className="builder-medal-inputs">{(['gold', 'silver', 'bronze'] as const).map(medal => <label key={medal}>{medal}<NumberField label={`${medal} time`} min={.1} max={3600} step={.5} value={level.times[medal]} onCommit={value => commit({ ...history.present, times: { ...level.times, [medal]: value } })} /></label>)}</div>
          <label>Player hint<textarea aria-label="Player hint" rows={3} maxLength={600} value={level.description ?? ''} onChange={e => commit({ ...history.present, description: e.target.value })} /></label>
        </>}
      </details>
      <div className={`builder-validation ${problems.length ? 'has-problems' : ''}`}><strong>{problems.length ? 'Before you play' : 'Ready to playtest'}</strong>{problems.length ? problems.map(issue => <p key={issue} role="alert">{issue}</p>) : <p>{isPuzzleLevel(level) ? 'Start and goal are placed. Save and test the route.' : 'The player has a clear place to start.'}</p>}</div>
      <p className="builder-shortcuts">V Select · H / Space Pan<br />⌘ / Ctrl D Duplicate · Z Undo<br />Arrow keys Move · Delete Remove</p>
    </aside>
    <footer className="builder-status"><span role="status" aria-label="Builder status">{message || (dirty ? 'Unsaved changes · Save to your level folder to keep them.' : 'Levels are saved as JSON files in your level folder.')}</span><span><output aria-label="Cursor coordinates">{pointer ? `${Math.round(pointer.x)}, ${Math.round(roomHeight - pointer.y)}` : '0, 0 = bottom left'}</output> · Scroll to pan · Ctrl + scroll to zoom</span></footer>
    {active && libraryOpen && <BuilderLibrary local={local} collections={collections} templates={templates} fileName={fileName} level={level} dirty={dirty} saving={saving}
      message={message} onSave={() => save(false, false)} onChoose={chooseLibraryItem} onClose={() => setLibraryOpen(false)} />}
  </section>
}
