import { nightModeEnabled } from './ambientLight'
import { polygonPoints } from './geometry'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { anchorRope, itemDefinition, renameItem, moveVertex, insertTerrainNode, deleteTerrainNode, terrainNodeTarget, terrainVertexTarget, addItem, allSelections, clamp, deleteItem, duplicateItem, hitItem, itemBounds, itemOutline, itemHandle, moveItem, resizeItem, resizeLevelHeight, setElevatorTravel, setTriggerTargets, setCoinThreshold, setCoinSwitchOrientation } from './editor'
import type { ResizeHandle, Selection, Tool, TerrainTransform } from './editor'
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
import { setPickupSeconds, setWallTextRotation, transformTerrain } from './editor'
import { wallTextLocalPoint, wallTextPoint } from './wallText'
import { useWallTextFont } from './useWallTextFont'
import { pickupLabel } from './pickups'
import { ObjectNameField } from './ObjectNameField'
import { TerrainMaterialPicker } from './TerrainMaterialPicker'
import { BuilderIcon } from './BuilderIcon'
import { LevelThumbnail } from './LevelThumbnail'
import { BuilderLibrary } from './BuilderLibrary'
import { SaveFailureDialog } from './LevelFileActions'
import { BuilderHelp } from './BuilderHelp'
import type { LibraryChoice } from './BuilderLibrary'
import type { LevelSource } from './routes'
import { isHorizontalGate, mechanismAnchor, mechanismLabel, mechanismOpenPosition, mechanismRopeEnd } from './mechanisms'
import { LightingRenderer, lightingPixelRatio } from './lightingRender'
import { playgroundLightingWorld } from './lightingModel'
import { editLight, lightHandles, setLevelAmbient, setLevelNightMode } from './lightingEditor'
import { lightTravelBounds } from './lightingDefinition'
import { useLightingGeometry } from './useLightingGeometry'
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
  const trigger = selection.kind === 'trigger' ? level.triggers?.[selection.index] : null
  if (selection.kind === 'rope') {
    const point = itemHandle(level, selection)
    return point ? [{ ...point, y: point.y + 8 / zoom, corner: 'bottom' }] : []
  }
  const corners: ResizeHandle[] = selection.kind === 'ladder' ? ['top', 'bottom']
    : mechanism ? mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? ['top', 'bottom'] : ['left', 'right']
    : trigger ? trigger.mode === 'coins' && trigger.orientation === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
    : ['prop', 'text'].includes(selection.kind) ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []
  const handles = corners.map(corner => ({ corner,
    x: bounds.x + (corner.endsWith('left') ? -8 / zoom : corner.endsWith('right') ? bounds.w + 8 / zoom : bounds.w / 2),
    y: bounds.y + (corner.startsWith('top') ? -8 / zoom : corner.startsWith('bottom') ? bounds.h + 8 / zoom : bounds.h / 2) }))
  return selection.kind === 'text' ? handles.map(p => ({ ...p, ...wallTextPoint(level.texts![selection.index], p.x - bounds.x, p.y - bounds.y) })) : handles
}
type Drag = { mode: 'move' | 'resize' | 'travel' | 'point' | 'draw' | 'pan' | 'aim' | 'spread'; start: Point; screen: Point; base: JumpLevel; view: View; selection: Selection | null; point?: number; corner?: ResizeHandle; inserted?: boolean }
const TOOLS: { id: Tool; group: string; label: string; help: string }[] = [
  { id: 'select', group: 'Editing', label: 'Pointer', help: 'Drag to move; handles resize. Snap catches nearby surfaces. Alt bypasses snapping. Space + drag pans.' },
  { id: 'node', group: 'Editing', label: 'Node', help: 'Drag an existing node to reshape terrain, or click an edge to add one. N activates this tool.' },
  { id: 'platform', group: 'Terrain', label: 'Terrain', help: 'Drag to create terrain, then reshape it with the white nodes. Use the Node tool to add points along an edge.' },
  { id: 'steps-narrow', group: 'Terrain', label: 'Steps narrow', help: 'Click to place five steps with a stepped underside and a two-square top landing. Each rise and tread is one grid square. Resize, reshape, rotate, or flip after placing.' },
  { id: 'steps-wide', group: 'Terrain', label: 'Steps wide', help: 'Click to place five steps with a stepped underside and a four-square top landing. Each rise is one grid square; each tread is two squares wide. Resize, reshape, rotate, or flip after placing.' },
  { id: 'rope', group: 'Movement', label: 'Rope', help: 'Drag down from the anchor. Start near a terrain edge to attach the anchor to it.' },
  { id: 'ladder', group: 'Movement', label: 'Ladder', help: 'Drag down anywhere to place a ladder. Move it or change its height in the inspector.' },
  { id: 'ball', group: 'Objects', label: 'Ball', help: 'Click for a standard ball, or drag to choose its size. Corner handles resize it.' },
  { id: 'box', group: 'Objects', label: 'Box', help: 'Click for a standard box, or drag to choose its size. Corner handles resize it.' },
  { id: 'pusher', group: 'Objects', label: 'Shovebot', help: 'Click a surface to place a shovebot. Set its patrol limits in the inspector.' },
  { id: 'lift', group: 'Mechanisms', label: 'Elevator', help: 'Click to place the platform, or drag vertically to set its travel. Select it and drag the upper stop to change travel height. Connect a pressure plate or coin switch to move it.' },
  { id: 'moving-platform', group: 'Mechanisms', label: 'Moving platform', help: 'Click to place, or drag horizontally from the starting position to set travel and direction. Drag the far stop to change travel distance. Flip horizontally reverses direction. Connect a pressure plate or coin switch to move it.' },
  { id: 'gate', group: 'Mechanisms', label: 'Gate', help: 'Click for a standard gate, or drag vertically to choose its height. Drag its top or bottom handle to resize.' },
  { id: 'horizontal-gate', group: 'Mechanisms', label: 'Horizontal gate', help: 'Click or drag horizontally to place a gate. It retracts by its own width. Flip it in the inspector to reverse its direction.' },
  { id: 'plate', group: 'Mechanisms', label: 'Pressure plate', help: 'Click a surface to place a pressure plate, then choose which mechanisms and spotlights it activates in the inspector. The player, boxes, and balls can hold it down.' },
  { id: 'coin-switch', group: 'Mechanisms', label: 'Coin switch', help: 'Mount a coin switch on the back wall. Choose horizontal or vertical orientation in the inspector. Its meter fills with collected coins; reaching Coins required activates its connected mechanisms and spotlights until restart.' },
  { id: 'checkpoint', group: 'Markers', label: 'Checkpoint', help: 'Reset marker for movement playgrounds. Time trials always restart at the beginning.' },
  { id: 'timer', group: 'Back wall', label: 'Wall timer', help: 'Click to mount a timer on the back wall. Place as many as you need; all show the same run time and never block movement.' },
  { id: 'light', group: 'Back wall', label: 'Spotlight', help: 'Click to mount a spotlight, or drag to aim it. Drag its center handle to aim and its outer handles to widen the beam. Lights have no range limit. EMP cuts their power.' },
  { id: 'text', group: 'Back wall', label: 'Wall text', help: 'Click or drag a text area onto the back wall. Choose Official or red Graffiti, and edit the text, size, alignment, and rotation in the inspector. Text never blocks movement.' },
  { id: 'coin', group: 'Collectibles', label: 'Coin', help: 'Place a slowly spinning gold coin. Touch it to collect it and fill every coin switch in the level. Restarting restores all coins.' },
  { id: 'stopwatch', group: 'Collectibles', label: 'Stopwatch', help: 'Place a stopwatch to collect. Touching it stops the level timer for 10 seconds while gameplay continues. Extra watches extend the pause.' },
  { id: 'time-bonus', group: 'Collectibles', label: 'Time bonus', help: 'Touch to remove time from the clock, down to zero. Set Seconds off from 1 to 9 in the inspector; the number appears inside the arrow.' },
  { id: 'time-penalty', group: 'Collectibles', label: 'Time penalty', help: 'A dark-red clockwise arrow. Touching it adds its number to the clock. Set Seconds added from 1 to 9 in the inspector.' },
  { id: 'fast-stopwatch', group: 'Collectibles', label: 'Fast stopwatch', help: 'A dark-red stopwatch. Touching it makes the clock run twice as fast for 5 seconds. Extra watches extend the effect.' },
  { id: 'emp', group: 'Collectibles', label: 'EMP', help: 'A gold lightning bolt. Cuts power to mechanisms, switches, shovebots, and spotlights for 5 seconds. Ambient light remains. The exit keeps working.' },
]
const defaultSelectionLabel = (s: Selection, level: JumpLevel) => {
  const name = s.kind === 'spawn' ? 'Start' : s.kind === 'goal' ? 'Goal light' : s.kind === 'prop' ? level.props?.[s.index]?.kind === 'ball' ? 'Ball' : 'Box'
    : s.kind === 'pickup' ? pickupLabel(level.pickups![s.index].kind) : s.kind === 'light' ? 'Spotlight' : s.kind === 'timer' ? 'Wall timer' : s.kind === 'text' ? 'Wall text' : s.kind === 'robot' ? 'Shovebot' : s.kind === 'trigger' ? level.triggers?.[s.index]?.mode === 'coins' ? 'Coin switch' : 'Pressure plate' : s.kind === 'mechanism' ? mechanismLabel(level.mechanisms![s.index]) : s.kind === 'platform' ? 'Terrain' : s.kind[0].toUpperCase() + s.kind.slice(1)
  return `${name}${s.kind === 'spawn' || s.kind === 'goal' ? '' : ` ${s.index + 1}`}`
}
const selectionLabel = (s: Selection, level: JumpLevel) => {
  const fallback = defaultSelectionLabel(s, level), name = itemDefinition(level, s)?.name
  return name ? `${name} · ${fallback}` : fallback
}

export function LevelBuilder({ active, onPlay, onClose, templates, local, collections, initialFile, onFileChange }: {
  active: boolean; onPlay: (level: JumpLevel) => void; onClose: () => void
  templates: LevelFile[]; local: LocalLevels; initialFile?: LevelFile
  collections?: { local: LocalLevels; builtIn: LocalLevels }
  onFileChange: (fileName?: string, source?: LevelSource) => void
}) {
  const wallTextFontReady = useWallTextFont()
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
  const [lightingRenderer] = useState(() => new LightingRenderer())
  useEffect(() => () => lightingRenderer.dispose(), [lightingRenderer])
  useEffect(() => { if (!active) lightingRenderer.release() }, [active, lightingRenderer])
  const [lightingPreview, setLightingPreview] = useState(true)
  const [previewLight, setPreviewLight] = useState<string | null>(null)
  useEffect(() => {
    const clear = () => setPreviewLight(null)
    window.addEventListener('blur', clear)
    return () => window.removeEventListener('blur', clear)
  }, [])
  const lightingGeometry = useLightingGeometry(level, active && lightingPreview)
  const roomHeight = levelHeight(level)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false), savePending = useRef(false)
  const [saveFailure, setSaveFailure] = useState<{ fileName: string; reason: string; returnFocus: HTMLElement | null } | null>(null)
  const savePreparation = useRef<AbortController | null>(null)
  useEffect(() => () => savePreparation.current?.abort(), [])
  const [tool, setTool] = useState<Tool>('select'), [selection, setSelection] = useState<Selection | null>(null)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
  const verticalCoinSwitch = trigger?.mode === 'coins' && trigger.orientation === 'vertical'
  const robot = selection?.kind === 'robot' ? level.robots?.[selection.index] : null
  const light = selection?.kind === 'light' ? level.lighting?.lights[selection.index] : null
  const aimHandles = useMemo(() => light ? lightHandles(light, view.zoom) : [], [light, view.zoom])
  const wallText = selection?.kind === 'text' ? level.texts?.[selection.index] : null
  const pickup = selection?.kind === 'pickup' ? level.pickups?.[selection.index] : null
  const quantize = useCallback((v: number) => snap ? Math.round(v / LEVEL_GRID_SIZE) * LEVEL_GRID_SIZE : Math.round(v), [snap])
  const quantizeY = useCallback((y: number) => roomHeight - quantize(roomHeight - y), [roomHeight, quantize])
  const hoveredNode = useMemo(() => tool === 'node' && pointer ? terrainVertexTarget(level, pointer.x, pointer.y, 10 / view.zoom) : null,
    [tool, pointer, level, view.zoom])
  const nodeTarget = useMemo(() => tool === 'node' && pointer && !hoveredNode ? terrainNodeTarget(level, pointer.x, pointer.y, 12 / view.zoom, snap ? LEVEL_GRID_SIZE : 0) : null,
    [tool, pointer, hoveredNode, level, view.zoom, snap])

  function chooseSelection(next: Selection | null) { setSelection(next); setSelectedNode(null); setPreviewLight(null) }
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
  function transformSelectedTerrain(transform: TerrainTransform) {
    if (selection?.kind !== 'platform') return
    try {
      commit(transformTerrain(history.present, selection.index, transform)); setSelectedNode(null)
    } catch (error) { setMessage((error as Error).message) }
  }
  function add(tool: Tool, start: Point, end: Point, free = false) {
    try {
      const added = addItem(history.present, tool, start, end)
      if (added) { commit(snap && !free ? placeOnSurface(added.level, added.selection, 12 / view.zoom) : added.level); chooseSelection(added.selection); if (!keepTool) setTool('select') }
    } catch (error) { setMessage((error as Error).message) }
  }
  async function save(testAfter = false, updateRoute = true): Promise<LevelFile | undefined> {
    if (savePending.current || local.busy || saveFailure) return undefined
    if (!local.canWrite) {
      setMessage(local.hasHandle ? 'Enable saving in this folder before saving your level.' : 'Choose a writable level folder before saving your level.')
      setLibraryOpen(true)
      return undefined
    }
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const name = suggestFileName.current ? levelFileName(level.name) : fileName
    savePending.current = true; setSaving(true); setMessage('')
    try {
      const controller = new AbortController(); savePreparation.current = controller
      const next = parseLevel((await prepareLevelInWorker(level, { signal: controller.signal })).level)
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
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).trim() || 'The file could not be written. Try saving again.'
      setSaveFailure({ fileName: name, reason, returnFocus })
      return undefined
    }
    finally { savePreparation.current = null; savePending.current = false; setSaving(false) }
  }
  useEffect(() => {
    if (!active || !canvasRef.current) return
    const canvas = canvasRef.current
    const resize = () => {
      // Hiding the editor for playtest can deliver one last zero-size observation.
      // Keep the last visible size until the returning editor is measured again.
      const r = canvas.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      setSize({ width: r.width, height: r.height })
      if (!framed.current && r.height > 0) {
        setView({ x: -60, y: -60, zoom: Math.min(r.width / (initial.level.width + 120), r.height / (levelHeight(initial.level) + 120)) }); framed.current = true
      }
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    canvas.focus({ preventScroll: true })
    return () => observer.disconnect()
  }, [active, initial.level])
  useEffect(() => {
    if (!active || !lightingGeometry.ready || size.width <= 0 || size.height <= 0) return
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!, ratio = level.lighting ? lightingPixelRatio(size.width, size.height, devicePixelRatio || 1) : Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#eeeee6'; ctx.fillRect(0, 0, size.width, size.height)
    if (level.lighting) {
      if (lightingGeometry.groups) lightingRenderer.prepare(level, lightingGeometry.groups)
      const definition = { ...level.lighting, nightMode: lightingPreview && nightModeEnabled(level.lighting),
        lights: level.lighting.lights.map(l => l.id === previewLight && !helpOpen && !libraryOpen ? { ...l, power: 'always' as const } : l) }
      lightingRenderer.render(ctx, previewRun ?? playgroundLightingWorld(level, previewPlayer), definition,
        { ...view, width: canvas.width, height: canvas.height, zoom: view.zoom * ratio }, .2, undefined, true)
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.save(); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x, -view.y)
    if (!level.lighting) {
      drawLevelBackdrop(ctx, level, { x: view.x, y: view.y, w: size.width / view.zoom, h: size.height / view.zoom }, view.zoom)
      if (previewRun) drawPuzzleWorld(ctx, previewRun, true)
      else { drawTerrain(ctx, levelTerrain(level)); drawClimbables(ctx, previewPlayer, level.climbables); ctx.globalAlpha = .55; drawAthlete(ctx, previewPlayer); ctx.globalAlpha = 1 }
    }
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
    if (light) {
      ctx.strokeStyle = '#c65231'; ctx.fillStyle = '#c65231'; ctx.lineWidth = 2 / view.zoom
      for (const handle of aimHandles) {
        ctx.beginPath(); ctx.moveTo(light.x, light.y); ctx.lineTo(handle.x, handle.y); ctx.stroke()
        ctx.beginPath(); ctx.arc(handle.x, handle.y, (handle.kind === 'aim' ? 5 : 4) / view.zoom, 0, Math.PI * 2); ctx.fill()
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
      if (wallText) {
        ctx.save(); ctx.translate(wallText.x + wallText.w / 2, wallText.y + wallText.h / 2); ctx.rotate((wallText.rotation ?? 0) * Math.PI / 180)
        ctx.strokeRect(-wallText.w / 2 - padding, -wallText.h / 2 - padding, wallText.w + padding * 2, wallText.h + padding * 2); ctx.restore()
      } else ctx.strokeRect(outline.x - padding, outline.y - padding - (outline.h ? 0 : 62), Math.max(8, outline.w + padding * 2), Math.max(8, outline.h + padding * 2 + (outline.h ? 0 : 62)))
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
    if (hoveredNode) {
      ctx.beginPath(); ctx.arc(hoveredNode.x, hoveredNode.y, 6 / view.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#c65231'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
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
  }, [active, level, previewRun, previewPlayer, view, size, outline, resizeHandles, chosen, selectedNode, mechanism, robot, hoveredNode, nodeTarget, support, wallText, wallTextFontReady, light, aimHandles, lightingPreview, previewLight, helpOpen, libraryOpen, lightingGeometry.ready, lightingGeometry.groups, lightingRenderer])

  function position(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: view.x + (event.clientX - rect.left) / view.zoom, y: view.y + (event.clientY - rect.top) / view.zoom }
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
    const p = position(event), screen = { x: event.clientX, y: event.clientY }, base = history.present
    setPointer(p)
    latestPreview.current = null
    if (panHeld.current || event.button === 1) { drag.current = { mode: 'pan', start: p, screen, base, view, selection: null }; return }
    if (tool === 'node') {
      const node = terrainVertexTarget(base, p.x, p.y, 10 / view.zoom)
      if (node) {
        const selected = { kind: 'platform' as const, index: node.index }
        chooseSelection(selected); setSelectedNode(node.vertex); setMessage('')
        drag.current = { mode: 'point', start: p, screen, base, view, selection: selected, point: node.vertex }
        return
      }
      const target = terrainNodeTarget(base, p.x, p.y, 12 / view.zoom, snap ? LEVEL_GRID_SIZE : 0)
      if (!target) { setMessage('Click a terrain edge to add a node, or drag an existing node.'); return }
      try {
        const next = insertTerrainNode(base, target), selected = { kind: 'platform' as const, index: target.index }
        chooseSelection(selected); setSelectedNode(target.edge + 1); setMessage(''); setPreview(next); latestPreview.current = next
        drag.current = { mode: 'point', start: p, screen, base: next, view, selection: selected, point: target.edge + 1, inserted: true }
      } catch (error) { setMessage((error as Error).message) }
      return
    }
    if (tool !== 'select') { drag.current = { mode: 'draw', start: event.altKey ? p : { x: quantize(p.x), y: quantizeY(p.y) }, screen, base, view, selection: null }; return }
    const aimHandle = aimHandles.find(h => Math.hypot(p.x - h.x, p.y - h.y) < 10 / view.zoom)
    if (selection?.kind === 'light' && aimHandle) { drag.current = { mode: aimHandle.kind, start: p, screen, base, view, selection }; return }
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
    setPointer(p)
    const qx = (v: number) => event.altKey ? v : quantize(v), qy = (v: number) => event.altKey ? v : quantizeY(v)
    let next: JumpLevel | null = null
    if (d.mode === 'draw') {
      try {
        const added = addItem(d.base, tool, d.start, event.altKey ? p : { x: quantize(p.x), y: quantizeY(p.y) })
        next = added ? snap && !event.altKey ? placeOnSurface(added.level, added.selection, 12 / view.zoom) : added.level : null
      } catch { /* Explain invalid placement when released. */ }
    } else if (d.selection) {
      const rawBounds = itemBounds(d.base, d.selection)!
      const b = d.selection.kind === 'light' ? { ...rawBounds, ...d.base.lighting!.lights[d.selection.index] } : rawBounds
      if (d.mode === 'move') {
        next = moveItem(d.base, d.selection, event.altKey ? dx : quantize(b.x + dx) - b.x, event.altKey ? dy : quantizeY(b.y + dy) - b.y)
        if (snap && !event.altKey) next = placeOnSurface(next, d.selection, 12 / view.zoom)
      }
      if (d.mode === 'aim' || d.mode === 'spread') {
        const source = d.base.lighting!.lights[d.selection.index]
        const angle = Math.atan2(p.y - source.y, p.x - source.x) * 180 / Math.PI
        const value = d.mode === 'aim' ? angle : Math.abs(((angle - source.direction + 540) % 360) - 180) * 2
        next = editLight(d.base, d.selection.index, { [d.mode === 'aim' ? 'direction' : 'spread']: snap && !event.altKey ? Math.round(value / 5) * 5 : value })
      }
      if (d.mode === 'travel') {
        const elevator = d.base.mechanisms![d.selection.index]
        const stop = mechanismOpenPosition(elevator)
        // Snap the platform's edge, so changing its width cannot offset the travel grid.
        const travel = elevator.orientation === 'horizontal'
          ? (elevator.flipX ? 1 : -1) * (qx(stop.x + dx) - elevator.x)
          : elevator.y - qy(stop.y + dy)
        next = setElevatorTravel(d.base, d.selection.index, travel)
      }
      if (d.mode === 'resize') {
        const text = d.selection.kind === 'text' ? d.base.texts![d.selection.index] : null
        const start = text ? wallTextLocalPoint(text, d.start.x, d.start.y) : d.start
        const end = text ? wallTextLocalPoint(text, p.x, p.y) : p
        const localX = end.x - start.x, localY = end.y - start.y
        const width = text ? qx(b.w + (d.corner?.endsWith('left') ? -localX : localX))
          : d.corner === 'top' || d.corner === 'bottom' ? b.w : d.corner?.endsWith('left') ? b.x + b.w - qx(b.x + dx) : qx(b.x + b.w + dx) - b.x
        const height = text ? qx(b.h + (d.corner?.startsWith('top') ? -localY : localY))
          : d.corner === 'left' || d.corner === 'right' ? b.h : d.corner?.startsWith('top') ? b.y + b.h - qy(b.y + dy) : qy(b.y + b.h + dy) - b.y
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
  const handleWheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault()
    const rect = canvasRef.current!.getBoundingClientRect()
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
    zoom(Math.exp(-delta * .003), { x: event.clientX - rect.left, y: event.clientY - rect.top })
  })
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current!
    // A non-passive listener keeps canvas zoom from also scrolling the editor or page.
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [active])
  function setDimension(axis: 'x' | 'y' | 'w' | 'h', value: number) {
    if (!selection || !bounds || !Number.isFinite(value)) return
    commit(axis === 'x' || axis === 'y' ? moveItem(history.present, selection, axis === 'x' ? value - (light?.x ?? bounds.x) : 0, axis === 'y' ? roomHeight - value - (light?.y ?? bounds.y) : 0)
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
    if (selection.kind === 'light') { commit(editLight(history.present, selection.index, { [field]: value })); return }
    if (selection.kind === 'mechanism' && field === 'travel') {
      commit(setElevatorTravel(history.present, selection.index, Number(value))); return
    }
    if (selection.kind === 'text' && field === 'rotation') {
      commit(setWallTextRotation(history.present, selection.index, Number(value))); return
    }
    const next = copyLevel(history.present)
    if (selection.kind === 'text') {
      const text = next.texts![selection.index]
      if (field === 'text') text.text = String(value).slice(0, 1000)
      if (field === 'fontSize' && Number.isFinite(Number(value))) text.fontSize = clamp(Number(value), 12, 96)
      if (field === 'align' && (value === 'left' || value === 'center' || value === 'right')) text.align = value
      if (field === 'style' && (value === 'official' || value === 'graffiti')) text.style = value
    }
    if (selection.kind === 'robot') {
      const r = next.robots![selection.index]
      if (field === 'left') r.left = clamp(Number(value), 50, Math.min(r.x, r.right - 50))
      else r.right = clamp(Number(value), Math.max(r.x, r.left + 50), next.width - 50)
    }
    commit(next)
  }

  return <section className="jumping-builder" hidden={!active} aria-label="Level builder" onKeyDown={event => {
    if (libraryOpen || helpOpen || saveFailure) return
    if (event.key === 'F1') { event.preventDefault(); setHelpOpen(true); return }
    if ((event.target as HTMLElement).matches('input, select, textarea')) return
    if (event.code === 'Space' && event.target === canvasRef.current) { event.preventDefault(); panHeld.current = true }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
    else if (event.key === 'Escape') { setTool('select'); chooseSelection(null); drag.current = null; setPreview(null); latestPreview.current = null }
    else if (!event.ctrlKey && !event.metaKey && ({ v: 'select', n: 'node', p: 'platform', r: 'rope', l: 'ladder' } as Record<string, Tool>)[event.key.toLowerCase()]) { event.preventDefault(); setTool(({ v: 'select', n: 'node', p: 'platform', r: 'rope', l: 'ladder' } as Record<string, Tool>)[event.key.toLowerCase()]) }
    else if (event.target === canvasRef.current && selection) {
      if (event.key === 'End') { event.preventDefault(); commit(placeOnSurface(history.present, selection)) }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selectedNode !== null && chosen) removeNode(); else remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 1 : snap ? LEVEL_GRID_SIZE : 5
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const node = chosen && selectedNode !== null ? polygonPoints(chosen)[selectedNode] : null
        const origin = node ? { x: node[0], y: node[1] } : light ?? bounds
        const shiftX = snap && !event.shiftKey && origin && dx ? quantize(origin.x + dx) - origin.x : dx
        const shiftY = snap && !event.shiftKey && origin && dy ? quantizeY(origin.y + dy) - origin.y : dy
        commit(node ? moveVertex(history.present, selection.index, selectedNode!, shiftX, shiftY)
          : moveItem(history.present, selection, shiftX, shiftY))
      }
    }
  }} onKeyUp={event => { if (event.code === 'Space') panHeld.current = false }} onBlur={() => { panHeld.current = false }}>
    <header className="builder-header">
      <div className="builder-brand"><p className="jumping-eyebrow">Untitled jumping game</p><h1>Level studio.</h1></div>
      <div className="builder-main-actions">
        <button className="builder-play" title="Save this level and playtest it" disabled={!!problem || local.busy || saving} aria-busy={saving} onClick={() => void save(true)}><span aria-hidden="true">▶</span> Save and Test</button>
        <button title="Save this level (Ctrl/⌘ + S)" disabled={local.busy || saving} onClick={() => void save()}>Save level</button>
        <button aria-haspopup="dialog" title="Level builder help (F1)" onClick={() => setHelpOpen(true)}>Help</button>
        <button aria-haspopup="dialog" title="Open the library to create or choose a level" disabled={saving} onClick={() => { setMessage(''); setLibraryOpen(true) }}>Library</button>
        <button className="builder-back" title="Return to the game" disabled={saving} onClick={onClose}>Back to game</button>
      </div>
    </header>
    <div className="builder-view-controls" role="group" aria-label="Canvas controls">
      <div className="builder-control-group builder-mode-controls" role="group" aria-label="Editing tools">
        {TOOLS.filter(item => item.group === 'Editing').map(item => <button key={item.id} aria-label={item.label} aria-pressed={tool === item.id} aria-keyshortcuts={item.id === 'select' ? 'V' : 'N'} title={item.id === 'select' ? 'Pointer (V): select, move, and resize objects' : 'Node (N): move terrain nodes or add them along an edge'} onClick={() => { setTool(item.id); setMessage('') }}><BuilderIcon kind={item.id} /></button>)}
      </div>
      <div className="builder-control-group" role="group" aria-label="Terrain transforms">
        {([
          ['rotate-left', 'Rotate left', 'Rotate selected terrain 90° counterclockwise'],
          ['rotate-right', 'Rotate right', 'Rotate selected terrain 90° clockwise'],
          ['flip-horizontal', 'Flip horizontal', 'Mirror selected terrain left to right'],
          ['flip-vertical', 'Flip vertical', 'Mirror selected terrain top to bottom'],
        ] as const).map(([kind, label, title]) => <button key={kind} aria-label={label} title={title} disabled={!chosen} onClick={() => transformSelectedTerrain(kind)}><BuilderIcon kind={kind} /></button>)}
      </div>
      <div className="builder-control-group builder-placement-options" role="group" aria-label="Placement options">
        <label className="builder-inline-check" title={`Snap to the ${LEVEL_GRID_SIZE}-unit grid and nearby surfaces. Hold Alt to bypass.`}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap</label>
        <label className="builder-inline-check" title="Keep the object tool active after placing an object. Pointer and Node stay active until you switch tools."><input type="checkbox" checked={keepTool} onChange={e => setKeepTool(e.target.checked)} />Keep placing</label>
      </div>
      <div className="builder-control-group" role="group" aria-label="Edit history"><button title="Undo the last edit (Ctrl/⌘ + Z)" disabled={!history.past.length} onClick={undo}>Undo</button><button title="Redo the last undone edit (Ctrl/⌘ + Shift + Z)" disabled={!history.future.length} onClick={redo}>Redo</button></div>
      <div className="builder-control-group builder-zoom-controls" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" title="Zoom out to see more of the level" onClick={() => zoom(.8)}>−</button><output aria-label="Zoom" title="Current canvas zoom">{Math.round(view.zoom * 100)}%</output><button aria-label="Zoom in" title="Zoom in for more precise editing" onClick={() => zoom(1.25)}>+</button></div>
      <div className="builder-control-group" role="group" aria-label="Canvas view"><label className="builder-inline-check" title="Show authored lighting in this view. This does not change the saved level."><input type="checkbox" checked={lightingPreview} onChange={e => setLightingPreview(e.target.checked)} />Lighting</label><button title="Fit the entire level in the canvas" onClick={() => fitLevel()}>Fit level</button><button title="Center the view near the player's starting position" onClick={() => setView(homeView(level, size.height))}>Find start</button></div>
    </div>
    <aside className="builder-tools" aria-label="Building tools">
        {['Terrain', 'Movement', 'Objects', 'Mechanisms', 'Markers', 'Collectibles', 'Back wall'].map(group => {
          const items = TOOLS.filter(item => item.group === group && (item.id !== 'checkpoint' || !isPuzzleLevel(level)))
          return items.length ? <div className="builder-tool-group" key={group}><h2>{group}</h2>
            <div className={`builder-tool-grid${group === 'Terrain' ? ' builder-terrain-tools' : ''}`}>{items.map(item => <button key={item.id} aria-pressed={tool === item.id} title={item.help} onClick={() => { setTool(tool === item.id ? 'select' : item.id); setMessage('') }}><BuilderIcon kind={item.id} /><span>{item.label}</span></button>)}</div>
          </div> : null
        })}
    </aside>
    <div className="builder-stage">
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Level canvas" aria-busy={preparingRopes || !lightingGeometry.ready} style={{ cursor: drag.current?.mode === 'pan' || drag.current?.mode === 'point' ? 'grabbing' : hoveredNode ? 'grab' : tool === 'select' ? adjustingTravel ? mechanism?.orientation === 'horizontal' ? 'ew-resize' : 'ns-resize' : resizeCorner ? resizeCursor : 'default' : 'crosshair' }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setPreview(null); latestPreview.current = null }} onContextMenu={e => e.preventDefault()}
        onPointerLeave={() => { if (!drag.current) setPointer(null) }} />
      <button className="builder-minimap" aria-label="Fit level overview" title="Click to fit the whole level" onClick={() => fitLevel()}><LevelThumbnail level={level} preview /><span>Overview</span></button>
    </div>
    <aside className="builder-inspector" aria-label="Object properties">
      <div className="builder-inspector-heading">
      <h2>Inspector</h2>
      <label>Selected object<select aria-label="Selected object" value={selection ? `${selection.kind}:${selection.index}` : ''} onChange={e => { const [kind, index] = e.target.value.split(':'); chooseSelection(kind ? { kind: kind as Selection['kind'], index: Number(index) } : null); if (tool !== 'node' || kind && kind !== 'platform') setTool('select') }}>
        <option value="">Nothing selected</option>{allSelections(level).map(s => <option key={`${s.kind}:${s.index}`} value={`${s.kind}:${s.index}`}>{selectionLabel(s, level)}</option>)}
      </select></label>
      </div>
      {selection && bounds ? <div className="builder-property-card">
        <label>Name<ObjectNameField key={`${selection.kind}:${selection.index}`} value={itemDefinition(level, selection)?.name ?? ''}
          placeholder={defaultSelectionLabel(selection, level)} onCommit={value => commit(renameItem(history.present, selection, value))} /></label>
        <div className="builder-dimensions" key={`${selection.kind}:${selection.index}`}>
          {(['x', 'y', 'w', 'h'] as const).filter(axis => axis === 'x' || axis === 'y'
            || axis === 'w' && !verticalCoinSwitch && ['platform', 'prop', 'mechanism', 'text', 'trigger'].includes(selection.kind)
            || axis === 'h' && (verticalCoinSwitch || ['platform', 'mechanism', 'text', 'rope', 'ladder'].includes(selection.kind))).map(axis => {
            const fixed = !!mechanism && (mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? axis === 'w' : axis === 'h')
            const label = axis === 'w' && selection.kind === 'prop' ? 'Size' : fixed ? 'Thickness' : axis === 'h' && selection.kind === 'rope' ? 'Length'
              : ({ x: light ? 'X' : bounds.w ? 'Left' : 'X', y: light ? 'Y' : bounds.h ? 'Top' : 'Y', w: 'Width', h: 'Height' })[axis]
            return <label key={axis}>{label}<NumberField label={`Object ${axis}`} disabled={fixed} step={snap ? LEVEL_GRID_SIZE : 1}
              value={axis === 'y' ? roomHeight - (light?.y ?? bounds.y) : axis === 'x' ? light?.x ?? bounds.x : bounds[axis]} onCommit={value => setDimension(axis, value)} /></label>
          })}
        </div>
        {chosen && <TerrainMaterialPicker label="Terrain material" value={chosen.material} onChange={material => {
          const next = copyLevel(history.present); next.platforms[selection.index].material = material; commit(next)
        }} />}
        {canPlaceOnSurface(selection, level) && <div className="builder-surface-placement">
          <button disabled={!support || Math.abs(support.delta) < .1} title="Place on the next surface below · End" onClick={() => commit(placeOnSurface(history.present, selection))}>Place on surface <span aria-hidden="true">↓</span></button>
          <span className={support && Math.abs(support.delta) < .1 ? 'is-supported' : ''}>{support ? Math.abs(support.delta) < .1 ? 'On surface' : support.delta > 0 ? `${Math.round(support.delta)} above surface` : 'Overlaps surface' : 'No clear surface below'}</span>
        </div>}
        {selection.kind === 'goal' && level.goal && <button className="builder-property-action" title="Move the goal light to the other side of the plate" aria-pressed={!!level.goal.flipX} onClick={() => {
          const next = copyLevel(history.present)
          if (next.goal) { if (next.goal.flipX) delete next.goal.flipX; else next.goal.flipX = true }
          commit(next)
        }}>Flip horizontally</button>}
        {chosen && <div className="builder-action-row"><button title="Activate Node to add or move terrain points (N)" aria-pressed={tool === 'node'} onClick={() => { setTool('node'); setMessage('') }}>Add node</button><button title="Remove the selected terrain node; at least three must remain" disabled={selectedNode === null || polygonPoints(chosen).length <= 3} onClick={removeNode}>Delete node</button></div>}
        {light && <>
          <div className="builder-dimensions">
            <label>Direction (°)<NumberField label="Light direction" value={light.direction} min={-180} max={180} step={5} onCommit={value => changeObject('direction', value)} /></label>
            <label>Spread (°)<NumberField label="Light spread" value={light.spread} min={20} max={160} step={5} onCommit={value => changeObject('spread', value)} /></label>
          </div>
          <label>Power<select aria-label="Light power" value={light.power} onChange={e => changeObject('power', e.target.value)}><option value="always">Always on</option><option value="switched">Switched</option></select></label>
          <label>Mount<select aria-label="Light mount" value={light.mount ?? ''} onChange={e => changeObject('mount', e.target.value)}><option value="">Back wall</option>{level.mechanisms?.map((m, i) => <option key={m.id} value={m.id}>{selectionLabel({ kind: 'mechanism', index: i }, level)}</option>)}</select></label>
          {light.power === 'switched' && <>
            <fieldset className="builder-connections"><legend>Powered by</legend>
              {level.triggers?.map((t, i) => <label key={i}><input type="checkbox" checked={triggerTargets(t).includes(light.id)} onChange={e => {
                const ids = triggerTargets(t); commit(setTriggerTargets(history.present, i, e.target.checked ? [...ids, light.id] : ids.filter(id => id !== light.id)))
              }} />{selectionLabel({ kind: 'trigger', index: i }, level)}</label>)}
              {!level.triggers?.length && <span>No switches</span>}
            </fieldset>
            <button title="Hold to preview this light without changing its power connections" aria-pressed={previewLight === light.id}
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPreviewLight(light.id) }} onPointerUp={() => setPreviewLight(null)} onPointerCancel={() => setPreviewLight(null)} onBlur={() => setPreviewLight(null)}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPreviewLight(light.id) } }} onKeyUp={() => setPreviewLight(null)}>Hold to preview</button>
          </>}
        </>}
        {wallText && <>
          <label>Text<textarea aria-label="Wall text content" rows={4} maxLength={1000} value={wallText.text} onChange={e => changeObject('text', e.target.value)} /></label>
          <div className="builder-dimensions">
            <label>Style<select aria-label="Text style" title="Official lettering or red marker graffiti" value={wallText.style ?? 'official'} onChange={e => changeObject('style', e.target.value)}><option value="official">Official</option><option value="graffiti">Graffiti</option></select></label>
            <label>Rotation (°)<NumberField label="Text rotation" min={-180} max={180} step={5} value={wallText.rotation ?? 0} onCommit={value => changeObject('rotation', value)} /></label>
            <label>Font size<NumberField label="Text font size" min={12} max={96} step={2} value={wallText.fontSize} onCommit={value => changeObject('fontSize', value)} /></label>
            <label>Alignment<select aria-label="Text alignment" value={wallText.align} onChange={e => changeObject('align', e.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
          </div>
        </>}
        {selection.kind === 'rope' && <div className="builder-anchor"><span>{level.climbables.ropes[selection.index].anchor ? 'Anchored to terrain' : 'Free anchor'}</span><button className="builder-property-action" title="Attach the rope anchor to nearby terrain, or detach it" onClick={() => {
          const next = copyLevel(history.present), r = next.climbables.ropes[selection.index]
          if (r.anchor) { delete r.anchor; commit(next) } else commit(anchorRope(next, selection.index))
        }}>{level.climbables.ropes[selection.index].anchor ? 'Detach anchor' : 'Anchor to nearby terrain'}</button></div>}
        {(pickup?.kind === 'time-bonus' || pickup?.kind === 'time-penalty') && <label>{pickup.kind === 'time-bonus' ? 'Seconds off' : 'Seconds added'}<NumberField label={pickup.kind === 'time-bonus' ? 'Seconds off' : 'Seconds added'} min={1} max={9} step={1} value={pickup.seconds} onCommit={value => commit(setPickupSeconds(history.present, selection.index, value))} /></label>}
        {mechanism?.kind === 'lift' && <label>{mechanism.orientation === 'horizontal' ? 'Travel distance' : 'Travel height'}<NumberField label={mechanism.orientation === 'horizontal' ? 'Travel distance' : 'Travel height'} min={60} max={1200} step={snap ? LEVEL_GRID_SIZE : 1} value={mechanism.travel} onCommit={value => changeObject('travel', value)} /></label>}
        {mechanism?.orientation === 'horizontal' && <button className="builder-property-action" title={mechanism.kind === 'lift' ? 'Reverse the platform’s travel direction' : 'Reverse the gate’s opening direction'} aria-pressed={!!mechanism.flipX} onClick={() => {
          const next = copyLevel(level), m = next.mechanisms![selection.index]
          if (m.flipX) delete m.flipX; else m.flipX = true
          commit(next)
        }}>Flip horizontally</button>}
        {trigger?.mode === 'coins' && <>
          <label>Orientation<select aria-label="Coin switch orientation" value={trigger.orientation ?? 'horizontal'} onChange={e => commit(setCoinSwitchOrientation(history.present, selection.index, e.target.value === 'vertical' ? 'vertical' : 'horizontal'))}>
            <option value="horizontal">Horizontal</option><option value="vertical">Vertical</option>
          </select></label>
          <label>Coins required<NumberField label="Coins required" min={1} max={80} step={1} value={trigger.threshold} onCommit={value => commit(setCoinThreshold(history.present, selection.index, value))} /></label>
          <p className="builder-hint">All coins in the level count toward this switch. Once full, it stays active until restart.</p>
        </>}
        {trigger && <fieldset className="builder-connections"><legend>Activates</legend>
          {level.mechanisms?.length ? level.mechanisms.map((m, i) => <label key={m.id}><input type="checkbox" checked={triggerTargets(trigger).includes(m.id)} onChange={e => {
            const targets = triggerTargets(trigger)
            commit(setTriggerTargets(history.present, selection.index, e.target.checked ? [...targets, m.id] : targets.filter(id => id !== m.id)))
          }} />{selectionLabel({ kind: 'mechanism', index: i }, level)}</label>) : null}
          {level.lighting?.lights.filter(l => l.power === 'switched').map(l => <label key={l.id}><input type="checkbox" checked={triggerTargets(trigger).includes(l.id)} onChange={e => {
            const ids = triggerTargets(trigger); commit(setTriggerTargets(history.present, selection.index, e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id)))
          }} />{l.name || 'Spotlight'}</label>)}
          {!level.mechanisms?.length && !level.lighting?.lights.some(l => l.power === 'switched') && <span>No mechanisms or switched lights</span>}
        </fieldset>}
        {robot && <div className="builder-dimensions"><label>Left limit<NumberField label="Shovebot left limit" step={snap ? LEVEL_GRID_SIZE : 1} value={robot.left} onCommit={value => changeObject('left', value)} /></label><label>Right limit<NumberField label="Shovebot right limit" step={snap ? LEVEL_GRID_SIZE : 1} value={robot.right} onCommit={value => changeObject('right', value)} /></label></div>}
        <div className="builder-object-actions"><button title="Duplicate this object (Ctrl/⌘ + D)" disabled={['spawn', 'goal'].includes(selection.kind)} onClick={duplicate}>Duplicate</button><button className="builder-delete" aria-label="Delete object" title="Delete this object" disabled={['spawn', 'goal'].includes(selection.kind)} onClick={remove}>Delete</button></div>
      </div> : null}
      <details className="builder-level-settings" open={!selection}>
        <summary>Level settings</summary>
        <label>Level name<input aria-label="Level name" title="The name shown in the level picker" maxLength={80} value={level.name} onChange={e => { if (suggestFileName.current) setFileName(levelFileName(e.target.value)); commit({ ...history.present, name: e.target.value }) }} /></label>
        <label>File name<input aria-label="Level file name" placeholder={levelFileName(level.name)} title="Created on first save. Changing a saved filename renames that file on the next save." spellCheck={false} value={fileName} onChange={e => { suggestFileName.current = !e.target.value; setFileName(e.target.value) }} /></label>
        <div className="builder-save-field"><span id="builder-save-label">Save location</span><button className="builder-save-location" aria-labelledby="builder-save-label builder-save-value" aria-haspopup="dialog" title={local.canWrite ? local.name : 'Choose a save folder in Library'} onClick={() => { setMessage(''); setLibraryOpen(true) }}><span id="builder-save-value">{local.name || 'Choose level folder'}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter"><path d="M3 7V4h7l2 3h9v13H3ZM3 9h18" /></svg></button></div>
        <div className="builder-dimensions"><label>Level width<NumberField label="Level width" step={100} value={level.width} min={800} max={20000} onCommit={value => {
          const extent = Math.max(800, level.spawn.x + 40, ...allSelections(level).map(s => { const b = s.kind === 'light' ? lightTravelBounds(level, level.lighting!.lights[s.index]) : itemBounds(level, s)!; return b.x + b.w + (level.floor === undefined ? 0 : 24) }))
          commit({ ...history.present, width: clamp(value, extent, 20000) })
        }} /></label>
        <label>Level height<NumberField label="Level height" step={100} value={levelHeight(level)} min={400} max={6000} onCommit={value => {
          const next = resizeLevelHeight(history.present, value)
          keepFloorInView(next); commit(next)
        }} /></label></div>
        <div className="builder-lighting-settings" role="group" aria-label="Level lighting">
          <div className="builder-lighting-heading"><span>Ambient light</span><label className="builder-night-mode" title="Use spotlights and adjustable ambient lighting for this level"><input type="checkbox" checked={nightModeEnabled(level.lighting)} onChange={e => commit(setLevelNightMode(history.present, e.target.checked))} />Night mode</label></div>
          <NumberField disabled={!nightModeEnabled(level.lighting)} label="Ambient light" value={level.lighting?.ambient ?? 100} min={0} max={100} step={1} onCommit={value => commit(setLevelAmbient(history.present, value))} />
          <input type="range" aria-label="Ambient light slider" disabled={!nightModeEnabled(level.lighting)} title="Night brightness: 0 is 35%; 100 is 57%" min={0} max={100} value={level.lighting?.ambient ?? 100}
            onChange={e => { const next = setLevelAmbient(history.present, Number(e.target.value)); latestPreview.current = next; setPreview(next) }}
            onPointerUp={() => { if (latestPreview.current) commit(latestPreview.current) }} onKeyUp={() => { if (latestPreview.current) commit(latestPreview.current) }} onBlur={() => { if (latestPreview.current) commit(latestPreview.current) }} />
        </div>
        <TerrainMaterialPicker label="Floor material" value={level.floorMaterial} onChange={floorMaterial => commit({ ...history.present, floorMaterial })} />
        {isPuzzleLevel(level) && <fieldset className="builder-medals"><legend>Medal times (seconds)</legend><div className="builder-medal-inputs">{(['gold', 'silver', 'bronze'] as const).map(medal => <label key={medal}>{medal[0].toUpperCase() + medal.slice(1)}<NumberField label={`${medal} time`} min={.1} max={3600} step={.5} value={level.times[medal]} onCommit={value => commit({ ...history.present, times: { ...level.times, [medal]: value } })} /></label>)}</div></fieldset>}
      </details>
      {problems.length > 0 && <div className="builder-validation"><strong>Before you play</strong>{problems.map(issue => <p key={issue} role="alert">{issue}</p>)}</div>}
    </aside>
    <footer className="builder-status"><span role="status" aria-label="Builder status">{lightingGeometry.error || message || (dirty ? 'Unsaved changes' : fileSource.text ? 'Saved' : 'New level')}</span><span><output aria-label="Cursor coordinates">{pointer ? `${Math.round(pointer.x)}, ${Math.round(roomHeight - pointer.y)}` : '—'}</output></span></footer>
    {active && helpOpen && <BuilderHelp tools={TOOLS} onClose={() => setHelpOpen(false)} />}
    {active && libraryOpen && <BuilderLibrary local={local} collections={collections} templates={templates} level={level} dirty={dirty} saving={saving}
      message={message} onSave={() => save(false, false)} onChoose={chooseLibraryItem} onClose={() => setLibraryOpen(false)} />}
    {active && saveFailure && <SaveFailureDialog {...saveFailure} onClose={() => setSaveFailure(null)} />}
  </section>
}
