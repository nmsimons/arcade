import { ROBOT_HALF_WIDTH } from './robotPhysics.ts'
import { nightModeEnabled } from './ambientLight'
import { lightingForLevel } from './lightingDefinition'
import { terrainCubic, terrainNodes } from './terrainCurves'
import { terrainDrawOrder } from './terrainOrder'
import { copyableSelection, copySelections, deleteSelections, moveSelections, pasteSelections, sameSelection, selectionBounds, selectionsInRect, transformSelections, validSelections } from './editorSelection'
import { expandEditorGroups, groupSelections, selectedEditorGroup, ungroupSelections } from './editorGroups'
import { drawLevelCenterGuides, levelCenterSnap } from './builderSnap'
import { decodeEditorClipboard, encodeEditorClipboard, readEditorClipboard, rememberEditorClipboard } from './editorClipboard'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent as ReactClipboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { anchorRope, itemDefinition, renameItem, moveVertex, insertTerrainNode, deleteTerrainNode, terrainNodeTarget, terrainVertexTarget, addItem, allSelections, clamp, hitItems, itemBounds, itemOutline, itemHandle, moveItem, resizeItem, resizeLevelHeight, setElevatorTravel, editFloatSwitch, setCoinThreshold, setCoinSwitchOrientation, setCoinSwitchDisplay, reorderTerrain } from './editor'
import type { ResizeHandle, Selection, Tool, TerrainTransform } from './editor'
import { moveTerrainHandle, setTerrainNodeMode } from './editor'
import { copyLevel, isPuzzleLevel, levelPlayer, levelProblems, levelHeight, parseLevel, prepareLevelRopes, LEVEL_GRID_SIZE } from './level'
import type { JumpLevel } from './level'
import { blankTrial } from './level'
import { GRADE_TARGETS, gradeTimes } from './grading'
import type { LevelFile } from './levelAssets'
import { levelFileName } from './levelFiles'
import type { BuiltInLevels } from './builtInLevels'
import { copyForEditing } from './puzzleEditor'
import { createPreviewRun } from './challenge'
import { useRopePreview } from './useRopePreview'
import { prepareLevelInWorker } from './levelPreparation'
import { canPlaceOnSurface, placeOnSurface, surfacePlacement } from './editorPlacement'
import { NumberField } from './NumberField'
import { BuilderSelect } from './BuilderSelect'
import { setPickupSeconds, setWallTextRotation, setShovebotLimit, setShovebotHeadlight, setShovebotMode, setCrateBranding, setWallWiring, setWallTerminal } from './editor'
import { DEFAULT_WIRE_HEIGHT, wallTerminals } from './wallWiring'
import { wallTextLocalPoint, wallTextPoint } from './wallText'
import { useWallTextFont } from './useWallTextFont'
import { ObjectNameField } from './ObjectNameField'
import { ToggleGroupFields } from './ToggleGroupFields'
import { BuilderInspectorSection } from './BuilderInspectorSection'
import { BuilderConnectionList } from './BuilderConnectionList'
import { triggerStartsOn } from './toggleGroups'
import { defaultObjectLabel, objectLabel } from './objectLabels'
import { TerrainMaterialPicker } from './TerrainMaterialPicker'
import { BuilderIcon } from './BuilderIcon'
import { LevelThumbnail } from './LevelThumbnail'
import { BuilderLibrary } from './BuilderLibrary'
import { SaveFailureDialog } from './LevelFileActions'
import { BuilderHelp } from './BuilderHelp'
import type { LibraryChoice } from './BuilderLibrary'
import { isHorizontalGate, mechanismAnchor, mechanismOpenPosition, mechanismRopeEnd } from './mechanisms'
import { LightingRenderer, lightingPixelRatio } from './lightingRender'
import { playgroundLightingWorld } from './lightingModel'
import { editLight, lightHandles, setLevelNightMode } from './lightingEditor'
import { switchedItems, switchSources, switchTargets, switchItemLabel, wallWiringItems } from './switchPower'
import { waterControlId } from './waterLevel'
import { drawLogicRelay } from './logicRelay'
import { setObjectPower, setObjectSwitchLogic, setObjectSwitchReversed, setObjectRelay, setSwitchTargets, setPlateBehavior, setPressurePlateMount, setPlateCeiling, setGravityPlateEffect, setWaterControl } from './editor'
import { useLightingGeometry } from './useLightingGeometry'
import { useBuilderController } from './useBuilderController'
import { BuilderTextEntry } from './BuilderTextEntry'
import { drawPlacementPreview, placementPreview } from './builderPlacement'
import { BUILDER_GRID_SIZE } from './builderSnap'
import './builder.css'
import { protectUnsavedDraft } from '../../accounts/runtime'

// Rope rest shapes are derived asynchronously, not unsaved author edits.
function editSignature(level: JumpLevel) {
  const next = copyLevel(level)
  for (const rope of next.climbables.ropes) delete rope.rest
  return JSON.stringify(next)
}

type Point = { x: number; y: number }
type View = Point & { zoom: number }
const homeView = (level: JumpLevel, height: number): View => ({ x: Math.max(0, level.entrance.x - 200), y: Math.max(100, level.entrance.y - height / .8 * .72), zoom: .8 })
const textEntryTarget = (target: EventTarget) => target instanceof HTMLElement
  && !!target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')
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
  const field = selection.kind === 'force-field' ? level.forceFields?.[selection.index] : null
  const trigger = selection.kind === 'trigger' ? level.triggers?.[selection.index] : null
  if (selection.kind === 'rope') {
    const point = itemHandle(level, selection)
    return point ? [{ ...point, y: point.y + 8 / zoom, corner: 'bottom' }] : []
  }
  const corners: ResizeHandle[] = selection.kind === 'ladder' ? ['top', 'bottom']
    : field ? field.orientation === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
    : mechanism ? mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? ['top', 'bottom'] : ['left', 'right']
    : trigger?.mode === 'coins' && trigger.display === 'digital' ? []
    : trigger ? trigger.mode === 'coins' && trigger.orientation === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
    : selection.kind === 'gravity-plate' ? ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right']
    : ['prop', 'text'].includes(selection.kind) ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []
  const handles = corners.map(corner => ({ corner,
    x: bounds.x + (corner.endsWith('left') ? -8 / zoom : corner.endsWith('right') ? bounds.w + 8 / zoom : bounds.w / 2),
    y: bounds.y + (corner.startsWith('top') ? -8 / zoom : corner.startsWith('bottom') ? bounds.h + 8 / zoom : bounds.h / 2) }))
  return selection.kind === 'text' ? handles.map(p => ({ ...p, ...wallTextPoint(level.texts![selection.index], p.x - bounds.x, p.y - bounds.y) })) : handles
}
type Drag = { mode: 'move' | 'resize' | 'travel' | 'patrol' | 'point' | 'bezier' | 'wire-terminal' | 'draw' | 'pan' | 'marquee' | 'aim' | 'spread'; start: Point; screen: Point; base: JumpLevel; view: View; selection: Selection | null; point?: number; tangent?: 'in' | 'out'; terminal?: Point; corner?: ResizeHandle; side?: 'left' | 'right'; inserted?: boolean; selections?: Selection[]; additive?: boolean; drill?: boolean; cycle?: Selection; overlap?: boolean }
const TOOLS: { id: Tool; group: string; label: string; help: string }[] = [
  { id: 'select', group: 'Editing', label: 'Pointer', help: 'Drag to move; handles resize. Snap catches nearby surfaces. Alt bypasses snapping. Space + drag pans.' },
  { id: 'node', group: 'Editing', label: 'Node', help: 'Drag a node to reshape terrain, or click an edge to add one. Select a node and choose Bézier handles in the inspector to curve its edges. N activates this tool.' },
  { id: 'platform', group: 'Terrain', label: 'Terrain', help: 'Drag to create terrain, then reshape it with the white nodes. Use the Node tool to add points along an edge.' },
  { id: 'steps-narrow', group: 'Terrain', label: 'Steps narrow', help: 'Click to place five steps with a stepped underside and a two-square top landing. Each rise and tread is one grid square. Resize, reshape, rotate, or flip after placing.' },
  { id: 'steps-wide', group: 'Terrain', label: 'Steps wide', help: 'Click to place five one-square-thick steps, each three squares wide and offset two squares across and one square up. They form one terrain shape with a stepped underside. Resize, reshape, rotate, or flip after placing.' },
  { id: 'rope', group: 'Movement', label: 'Rope', help: 'Drag down from the anchor. Start near a terrain edge to attach the anchor to it.' },
  { id: 'ladder', group: 'Movement', label: 'Ladder', help: 'Drag down anywhere to place a ladder. Move it or change its height in the inspector.' },
  { id: 'ball', group: 'Objects', label: 'Ball', help: 'Click for a standard ball, or drag to choose its size. Corner handles resize it.' },
  { id: 'box', group: 'Objects', label: 'Box', help: 'Click for a standard box, or drag to choose its size. Corner handles resize it.' },
  { id: 'branded-box', group: 'Objects', label: 'L.A.B. crate', help: 'Place a crate with the L.A.B. Experiments stencil. It behaves like an ordinary box. Toggle L.A.B. branding in the inspector for either crate style.' },
  { id: 'carried-emp', group: 'Gadgets', label: 'Carried EMP', help: 'E / X picks up or drops. F / RT fires an electric bolt: hit devices stop for five seconds; one-second cooldown. Movement also aims. Red fields drop the tool.' },
  { id: 'repulsor', group: 'Gadgets', label: 'Repulsor rifle', help: 'Pick up with E / X. F / RT fires. Movement also aims in eight directions. Red fields drop carried tools and block pulses.' },
  { id: 'pusher', group: 'Objects', label: 'Shovebot', help: 'Click to place a shovebot at the cursor. Snap catches nearby surfaces. Drag either end of its patrol range, or set the limits in the inspector.' },
  { id: 'repulsorbot', group: 'Objects', label: 'Repulsorbot', help: 'Enters through a portal on a flat sill with 40 × 80 clear space. Hunts across the level once it spots you. Runs, jumps, and climbs with the player rig. Cover blocks shots; EMP disables it.' },
  { id: 'lift', group: 'Mechanisms', label: 'Elevator', help: 'Click to place the platform, or drag vertically to set its travel. Select it and drag the upper stop to change travel height. Connect a pressure plate or coin switch to move it.' },
  { id: 'moving-platform', group: 'Mechanisms', label: 'Moving platform', help: 'Click to place, or drag horizontally from the starting position to set travel and direction. Drag the far stop to change travel distance. Flip horizontally reverses direction. Connect a pressure plate or coin switch to move it.' },
  { id: 'gate', group: 'Mechanisms', label: 'Gate', help: 'Click for a standard gate, or drag vertically to choose its height. Drag its top or bottom handle to resize.' },
  { id: 'horizontal-gate', group: 'Mechanisms', label: 'Horizontal gate', help: 'Click or drag horizontally to place a gate. It retracts by its own width. Flip it in the inspector to reverse its direction.' },
  { id: 'force-field', group: 'Mechanisms', label: 'Vertical force field', help: 'Click or drag vertically to place a barrier. Choose Blue to block only the player, or Red to let the player through and block objects. End handles change its length. Always on and Switched both obey EMP.' },
  { id: 'horizontal-force-field', group: 'Mechanisms', label: 'Horizontal force field', help: 'Click or drag horizontally to place a barrier. Blue supports the player; Red supports objects and lets the player through. End handles change its length. Always on and Switched both obey EMP.' },
  { id: 'gravity-plate', group: 'Mechanisms', label: 'Gravity plate', help: 'Click to place a field above a floor plate or below a ceiling plate, or drag its rectangle. Flip vertically changes the emitter edge without changing Gravity: −1 reverses gravity, 0 removes it, 1 is normal. Choose Always on or connect switches to power it. Partially covered bodies blend gravity by area; overlapping fields average their settings. EMP disables the field.' },
  { id: 'water', group: 'Mechanisms', label: 'Water', help: 'Drag a semi-transparent blue rectangle, or click to fill down to the floor. Water is always present. Fixed buoyancy lets bodies settle partly submerged. Up and Down swim; Jump at the surface helps you get out.' },
  { id: 'plate', group: 'Mechanisms', label: 'Pressure plate', help: 'Click to place a pressure plate at the cursor. Snap catches nearby surfaces. Choose Pressure, Switch, or Toggle mode and the items it activates. The player, boxes, and balls can press it.' },
  { id: 'coin-switch', group: 'Mechanisms', label: 'Coin switch', help: 'Mount a numeric coin switch on the back wall. It shows collected coins / coins required. The inspector also supports horizontal or vertical progress bars; reaching Coins required activates its connected mechanisms and spotlights until restart.' },
  { id: 'float-switch', group: 'Mechanisms', label: 'Float switch', help: 'A buoyant ball on a hinged arm. Water or a gravity lift raises it. Choose Raised or Lowered activation and connect its outputs.' },
  { id: 'logic-relay', group: 'Mechanisms', label: 'Logic relay', help: 'Place a studio-only logic node. Combine switches with OR, AND or XOR, optionally reverse the result, then connect its Activates outputs. Invisible during play, with no physical behavior.' },
  { id: 'checkpoint', group: 'Markers', label: 'Checkpoint', help: 'Reset marker for movement playgrounds. Time trials always restart at the beginning.' },
  { id: 'timer', group: 'Back wall', label: 'Wall timer', help: 'Click to mount a timer on the back wall. Place as many as you need; all show the same run time and never block movement.' },
  { id: 'light', group: 'Back wall', label: 'Spotlight', help: 'Click to place a spotlight on the back wall, or drag to aim it. Drag its center handle to aim and its outer handles to widen the beam. Lights have no range limit. EMP cuts their power.' },
  { id: 'wall-light', group: 'Back wall', label: 'Wall light', help: 'Place the goal-style indicator on the wall, with a circular rim. Connect switches to turn it green. Supports Logic, Reversed and the optional Relay setting.' },
  { id: 'text', group: 'Back wall', label: 'Wall text', help: 'Click or drag a text area onto the back wall. Choose Official or red Graffiti, and edit the text, size, alignment, and rotation in the inspector. Text never blocks movement.' },
  { id: 'message-screen', group: 'Back wall', label: 'Message screen', help: 'Click or drag to mount a small terminal. Edit its message, size, alignment and rotation. Green phosphor lettering stays readable in the dark.' },
  { id: 'lab-stamp', group: 'Back wall', label: 'L.A.B. wall stamp', help: 'Click or drag to stamp the L.A.B. Experiments mark onto the back wall. Resize or rotate it in the inspector. It stays behind terrain and never blocks movement.' },
  { id: 'coin', group: 'Collectibles', label: 'Coin', help: 'Place a slowly spinning gold coin. Touch it to collect it and fill every coin switch in the level. Restarting restores all coins.' },
  { id: 'stopwatch', group: 'Collectibles', label: 'Stopwatch', help: 'Place a stopwatch to collect. Touching it stops the level timer for 10 seconds while gameplay continues. Extra watches extend the pause.' },
  { id: 'time-bonus', group: 'Collectibles', label: 'Time bonus', help: 'Touch to remove time from the clock, down to zero. Set Seconds off from 1 to 9 in the inspector; the number appears inside the arrow.' },
  { id: 'time-penalty', group: 'Collectibles', label: 'Time penalty', help: 'A dark-red clockwise arrow. Touching it adds its number to the clock. Set Seconds added from 1 to 9 in the inspector.' },
  { id: 'fast-stopwatch', group: 'Collectibles', label: 'Fast stopwatch', help: 'A dark-red stopwatch. Touching it makes the clock run twice as fast for 5 seconds. Extra watches extend the effect.' },
  { id: 'emp', group: 'Collectibles', label: 'EMP', help: 'A gold lightning bolt. Cuts power to mechanisms, switches, shovebots, and spotlights for 5 seconds. Ambient light remains. Always-on exits stay open; switched exits follow their inputs.' },
]
const selectionLabel = (s: Selection, level: JumpLevel) => objectLabel(level, s)

export function LevelBuilder({ active, onPlay, onClose, levels, initialFile, onFileChange }: {
  active: boolean; onPlay: (level: JumpLevel) => void; onClose: () => void
  levels: BuiltInLevels; initialFile?: LevelFile
  onFileChange: (fileName?: string) => void
}) {
  const wallTextFontReady = useWallTextFont()
  const [initial] = useState(() => ({ level: prepareLevelRopes(initialFile ? copyLevel(initialFile.level) : blankTrial(), true) }))
  const [fileName, setFileName] = useState(initialFile?.fileName ?? levelFileName(initial.level.name, levels.entries.map(file => file.fileName)))
  const suggestFileName = useRef(!initialFile)
  const [fileSource, setFileSource] = useState({ text: initialFile?.sourceText, fileName: initialFile?.fileName })
  const [saved, setSaved] = useState<{ level: string | null; fileName: string }>({ level: editSignature(initial.level), fileName })
  const [history, setHistory] = useState({ past: [] as JumpLevel[], present: initial.level, future: [] as JumpLevel[] })
  const [preview, setPreview] = useState<JumpLevel | null>(null)
  const { level, busy: preparingRopes } = useRopePreview(preview ?? history.present, preview !== null)
  const previewRun = useMemo(() => isPuzzleLevel(level) ? createPreviewRun(level) : null, [level])
  const previewPlayer = useMemo(() => previewRun?.player ?? levelPlayer(level, true), [level, previewRun])
  const previewTime = useRef(0)
  useEffect(() => { previewTime.current = 0 }, [previewRun])
  const [lightingRenderer] = useState(() => new LightingRenderer())
  useEffect(() => () => lightingRenderer.dispose(), [lightingRenderer])
  useEffect(() => { if (!active) lightingRenderer.release() }, [active, lightingRenderer])
  const [lightingPreview, setLightingPreview] = useState(true)
  const [previewLight, setPreviewLight] = useState<string | null>(null)
  const roomHeight = levelHeight(level)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false), savePending = useRef(false)
  const [saveFailure, setSaveFailure] = useState<{ fileName: string; reason: string; returnFocus: HTMLElement | null } | null>(null)
  const savePreparation = useRef<AbortController | null>(null)
  useEffect(() => () => savePreparation.current?.abort(), [])
  const [tool, setTool] = useState<Tool>('select'), [selectedItems, setSelectedItems] = useState<Selection[]>([])
  const selection = selectedItems.length === 1 ? selectedItems[0] : null
  const lastClick = useRef<{ point: Point; level: JumpLevel; selection: Selection; additive?: boolean } | null>(null)
  const allTerrain = selectedItems.length > 0 && selectedItems.every(s => s.kind === 'platform')
  const selectedGroup = selectedEditorGroup(level, selectedItems)
  const canUngroup = (level.editorGroups ?? []).some(g => g.members.some(s => selectedItems.some(item => sameSelection(item, s))))
  const [clipboard, setClipboard] = useState(readEditorClipboard)
  const pasteCount = useRef({ text: '', count: 0 }), clipboardRequest = useRef({ version: 0 })
  useEffect(() => {
    const request = clipboardRequest.current
    if (!active) request.version++
    return () => { request.version++ }
  }, [active])
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [terminalFocus, setTerminalFocus] = useState<Point | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const observedRemoval = useRef(levels.lastRemoved)
  const signature = useMemo(() => editSignature(history.present), [history.present])
  const dirty = saved.level !== signature || saved.fileName !== fileName
  useEffect(() => { if (dirty || !fileSource.text) return protectUnsavedDraft() }, [dirty, fileSource.text])
  const detachDeletedFile = useEffectEvent(() => {
    if (levels.lastRemoved?.fileName !== fileSource.fileName) return
    setFileSource({ text: undefined, fileName: undefined })
    setSaved({ level: null, fileName }); onFileChange(undefined)
    setMessage('')
  })
  useEffect(() => {
    if (observedRemoval.current === levels.lastRemoved) return
    observedRemoval.current = levels.lastRemoved
    // A library deletion detaches the saved file and updates the parent route while
    // retaining this mounted editor's draft; it cannot be applied during render.
    if (levels.lastRemoved) detachDeletedFile()
  }, [levels.lastRemoved])
  const [keepTool, setKeepTool] = useState(false)
  const panHeld = useRef(false)
  const [pointer, setPointer] = useState<(Point & { free?: boolean }) | null>(null)
  useEffect(() => {
    const clear = () => { setPreviewLight(null); setPointer(null) }
    window.addEventListener('blur', clear)
    return () => window.removeEventListener('blur', clear)
  }, [])
  const [gridSize, setGridSize] = useState(BUILDER_GRID_SIZE)
  const [snap, setSnap] = useState(true), [view, setView] = useState<View>({ x: 0, y: 100, zoom: .8 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const placementCanvasRef = useRef<HTMLCanvasElement>(null)
  const builderRef = useRef<HTMLElement>(null)
  const [textEntry, setTextEntry] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const terrainDrag = !!drag && ['bezier', 'point', 'resize', 'move'].includes(drag.mode)
    && (drag.selection?.kind === 'platform' || drag.selections?.some(s => s.kind === 'platform'))
  // Do not restart workers or shade a whole scene for every handle movement.
  // Draw the live solid immediately; prepare lighting once the edit is released.
  const lightingGeometry = useLightingGeometry(terrainDrag ? history.present : level, active && lightingPreview && !terrainDrag)
  const inspectorRef = useRef<HTMLElement>(null)
  const [inspectorTab, setInspectorTab] = useState<'level' | 'object'>('level')
  const latestPreview = useRef<JumpLevel | null>(null)
  const framed = useRef(false)
  const bounds = useMemo(() => selection ? itemBounds(level, selection) : null, [level, selection])
  const outline = useMemo(() => selectedItems.length > 1 ? selectionBounds(level, selectedItems) : selection ? itemOutline(level, selection) : null, [level, selection, selectedItems])
  const support = useMemo(() => selection ? surfacePlacement(level, selection) : null, [level, selection])
  const chosen = selection?.kind === 'platform' ? level.platforms[selection.index] : null
  const terrainPosition = chosen && selection ? terrainDrawOrder(level.platforms).indexOf(selection.index) : -1
  const resizeHandles = useMemo(() => selectionHandles(level, selection, view.zoom), [level, selection, view.zoom])
  const resizeHandleAt = (p: Point) => resizeHandles.find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) < 10 / view.zoom)
  const hoverHandle = pointer && resizeHandleAt(pointer)
  const resizeCorner = drag?.mode === 'resize' ? drag.corner : hoverHandle?.corner
  const resizeCursor = resizeCorner === 'top' || resizeCorner === 'bottom' ? 'ns-resize' : resizeCorner === 'left' || resizeCorner === 'right' ? 'ew-resize' : resizeCorner === 'top-left' || resizeCorner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
  const problems = useMemo(() => levelProblems(level), [level]), problem = problems[0]
  const mechanism = selection?.kind === 'mechanism' ? level.mechanisms?.[selection.index] : null
  const prop = selection?.kind === 'prop' ? level.props?.[selection.index] : null
  const travelHandle = mechanism?.kind === 'lift' ? mechanismAnchor(mechanism) : null
  const travelHandleAt = (p: Point) => travelHandle && Math.hypot(p.x - travelHandle.x, p.y - travelHandle.y) < 10 / view.zoom
  const adjustingTravel = drag?.mode === 'travel' || pointer && travelHandleAt(pointer)
  const trigger = selection?.kind === 'trigger' ? level.triggers?.[selection.index] : null
  const digitalCoinSwitch = trigger?.mode === 'coins' && trigger.display === 'digital'
  const verticalCoinSwitch = trigger?.mode === 'coins' && trigger.orientation === 'vertical'
  const robot = selection?.kind === 'robot' ? level.robots?.[selection.index] : null
  const patrolHandles = robot && robot.kind !== 'repulsor' ? (['left', 'right'] as const).map(side => ({ side, x: robot[side], y: robot.y - 65 })) : []
  const patrolHandleAt = (p: Point) => patrolHandles.find(handle => Math.hypot(p.x - handle.x, p.y - handle.y) < 10 / view.zoom)
  const adjustingPatrol = drag?.mode === 'patrol' || pointer && patrolHandleAt(pointer)
  const light = selection?.kind === 'light' ? level.lighting?.lights[selection.index] : null
  const goal = selection?.kind === 'goal' ? level.goal : null
  const gravityPlate = selection?.kind === 'gravity-plate' ? level.gravityPlates?.[selection.index] : null
  const forceField = selection?.kind === 'force-field' ? level.forceFields?.[selection.index] : null
  const facingPlate = (gravityPlate?.effect === 'water' ? null : gravityPlate) ?? (trigger?.mode !== 'coins' ? trigger : null)
  const wallLight = selection?.kind === 'wall-light' ? level.wallLights?.[selection.index] : null
  const floatSwitch = selection?.kind === 'float-switch' ? level.floatSwitches?.[selection.index] : null
  const logicRelay = selection?.kind === 'logic-relay' ? level.logicRelays?.[selection.index] : null
  const switchable = goal ?? (mechanism?.kind === 'lift' ? mechanism : null) ?? light ?? (gravityPlate?.effect === 'water' ? null : gravityPlate) ?? forceField
  const objectPower = switchable ? switchable.power ?? (goal || forceField ? 'always' : 'switched') : null
  const targets = switchedItems(level)
  const switchedObject = targets.find(item => !('waterAction' in item) && item.kind === selection?.kind && item.index === selection.index)
  const objectSwitchLogic = switchedObject?.definition.switchLogic ?? 'or'
  const objectSwitchReversed = !!switchedObject?.definition.switchReversed
  const sources = switchSources(level)
  const selectedSource = sources.find(item => item.kind === selection?.kind && item.index === selection.index)
  const incomingSources = sources.filter(item => item.kind !== selection?.kind || item.index !== selection.index)
  const outgoingTargets = targets.filter(item => item.kind !== selection?.kind || item.index !== selection.index)
  const terminals = useMemo(() => wallTerminals(level), [level])
  const selectedTerminals = useMemo(() => terminals.filter(point => selection && sameSelection(point.owner, selection)), [terminals, selection])
  const customTerminal = selection ? wallWiringItems(level).find(item => sameSelection(item, selection))?.definition.wireTerminal : undefined
  const terminalPosition = customTerminal ?? terminalFocus ?? selectedTerminals[0]
  const hoveredTerminal = tool === 'select' && pointer && terminals.find(point => Math.hypot(pointer.x - point.x, pointer.y - point.y) < 10 / view.zoom)
  const aimHandles = useMemo(() => light ? lightHandles(light, view.zoom) : [], [light, view.zoom])
  const wallText = selection?.kind === 'text' ? level.texts?.[selection.index] : null
  const pickup = selection?.kind === 'pickup' ? level.pickups?.[selection.index] : null
  const quantize = useCallback((v: number, grid: number) => snap ? Math.round(v / grid) * grid : Math.round(v), [snap])
  const quantizeY = useCallback((y: number, grid: number) => roomHeight - quantize(roomHeight - y, grid), [roomHeight, quantize])
  const hoveredNode = useMemo(() => tool === 'node' && pointer && !drag ? terrainVertexTarget(level, pointer.x, pointer.y, 10 / view.zoom) : null,
    [tool, pointer, drag, level, view.zoom])
  const curveHandles = useMemo(() => {
    if (!chosen || selectedNode === null) return []
    const node = terrainNodes(chosen)[selectedNode], handle = chosen.bezier?.[selectedNode]
    return node ? (['in', 'out'] as const).flatMap(side => {
      const vector = handle?.[side]
      return vector ? [{ side, x: node[0] + vector[0], y: node[1] + vector[1], node }] : []
    }) : []
  }, [chosen, selectedNode])
  const hoveredCurveHandle = pointer && curveHandles.find(h => Math.hypot(pointer.x - h.x, pointer.y - h.y) < 8 / view.zoom)
  const nodeTarget = useMemo(() => tool === 'node' && pointer && !drag && !hoveredNode ? terrainNodeTarget(level, pointer.x, pointer.y, 12 / view.zoom, snap ? gridSize : 0) : null,
    [tool, pointer, drag, hoveredNode, level, view.zoom, snap, gridSize])
  const placement = useMemo(() => pointer && !drag && !preview && !helpOpen && !libraryOpen && !saveFailure && !textEntry
    ? placementPreview(level, tool, pointer, snap, view.zoom, gridSize) : null,
    [pointer, drag, preview, helpOpen, libraryOpen, saveFailure, textEntry, level, tool, snap, view.zoom, gridSize])
  const placementBounds = placement && itemBounds(placement.level, placement.selection)
  const placementAtCursor = placementBounds && pointer && pointer.x >= placementBounds.x - 12 / view.zoom
    && pointer.x <= placementBounds.x + placementBounds.w + 12 / view.zoom
    && pointer.y >= placementBounds.y - 12 / view.zoom && pointer.y <= placementBounds.y + placementBounds.h + 12 / view.zoom

  function chooseInspectorTab(tab: 'level' | 'object') {
    setInspectorTab(tab); setPreviewLight(null)
    inspectorRef.current?.scrollTo({ top: 0 })
  }
  function chooseSelection(next: Selection | null) {
    lastClick.current = null
    if (next && inspectorTab !== 'object') chooseInspectorTab('object')
    if (next?.kind !== selection?.kind || next?.index !== selection?.index) inspectorRef.current?.scrollTo({ top: 0 })
    setSelectedItems(next ? [next] : []); setSelectedNode(null); setTerminalFocus(null); setPreviewLight(null)
  }
  function chooseSelections(items: Selection[]) {
    lastClick.current = null
    const next = validSelections(level, items)
    if (next.length) chooseInspectorTab('object')
    setSelectedItems(next); setSelectedNode(null); setTerminalFocus(null); setPreviewLight(null)
  }
  function group(ungroup = false) {
    if (drag) return
    const items = ungroup ? selectedItems : expandEditorGroups(history.present, selectedItems)
    commit(ungroup ? ungroupSelections(history.present, items) : groupSelections(history.present, items))
    chooseSelections(items); canvasRef.current?.focus()
  }
  function copy() {
    try {
      const next = copySelections(history.present, selectedItems)
      if (!next.selections.length) return null
      const text = encodeEditorClipboard(next)
      rememberEditorClipboard(text); setClipboard(text); pasteCount.current = { text, count: 0 }
      setMessage(`Copied ${next.selections.length} ${next.selections.length === 1 ? 'object' : 'objects'}.`)
      return text
    } catch (error) { setMessage((error as Error).message); return null }
  }
  async function copyToClipboard(cut = false) {
    const text = copy()
    if (!text) return
    if (cut) { remove(); setMessage('Cut selected objects. Undo restores them.') }
    try { await navigator.clipboard.writeText(text) }
    catch { setMessage(cut ? 'Cut objects are available within Level studio. Undo restores them.'
      : 'Copied within Level studio. Use Ctrl/⌘ + C to copy to the system clipboard.') }
  }
  function copyEvent(event: ReactClipboardEvent, cut = false) {
    if (!active || libraryOpen || helpOpen || saveFailure || drag || textEntryTarget(event.target)) return
    if (event.target !== canvasRef.current && !window.getSelection()?.isCollapsed) return
    const text = copy()
    if (!text) return
    event.clipboardData.setData('text/plain', text); event.preventDefault()
    if (cut) { remove(); setMessage('Cut selected objects. Undo restores them.') }
  }
  function pasteText(text: string) {
    try {
      const copied = decodeEditorClipboard(text)
      if (!copied) { setMessage('The clipboard does not contain Level studio objects.'); return }
      const count = pasteCount.current.text === text ? pasteCount.current.count : 0
      const bounds = selectionBounds(copied.level, copied.selections)!
      const foreign = copied.level.id !== history.present.id
      const dx = foreign ? view.x + size.width / view.zoom / 2 - bounds.x - bounds.w / 2 + count * 40 : (count + 1) * 40
      const dy = foreign ? view.y + size.height / view.zoom / 2 - bounds.y - bounds.h / 2 + count * 40 : (count + 1) * 40
      const result = pasteSelections(history.present, copied, dx, dy)
      if (!result.selections.length) return
      rememberEditorClipboard(text); setClipboard(text)
      commit(result.level); setSelectedItems(result.selections); setSelectedNode(null); setTerminalFocus(null); chooseInspectorTab('object'); setTool('select')
      pasteCount.current = { text, count: count + 1 }; canvasRef.current?.focus()
      setMessage(`Pasted ${result.selections.length} ${result.selections.length === 1 ? 'object' : 'objects'}.`)
    } catch (error) { setMessage((error as Error).message) }
  }
  async function paste() {
    const request = ++clipboardRequest.current.version
    let text: string
    try { text = await navigator.clipboard.readText() }
    catch { text = clipboard }
    if (request !== clipboardRequest.current.version) return
    if (!text) { setMessage('Use Ctrl/⌘ + V to paste objects from the clipboard.'); return }
    pasteText(text)
  }
  function pasteEvent(event: ReactClipboardEvent) {
    if (!active || libraryOpen || helpOpen || saveFailure || drag || textEntryTarget(event.target)) return
    event.preventDefault(); clipboardRequest.current.version++
    pasteText(event.clipboardData.getData('text/plain'))
  }
  function commit(next: JumpLevel) {
    clipboardRequest.current.version++
    next = prepareLevelRopes(next, true)
    setHistory(h => JSON.stringify(next) === JSON.stringify(h.present) ? h : { past: [...h.past, h.present].slice(-60), present: next, future: [] })
    setPreview(null); latestPreview.current = null; setMessage('')
  }
  function undo() {
    clipboardRequest.current.version++
    if (history.past.length) keepFloorInView(history.past.at(-1)!)
    setHistory(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h)
    chooseSelection(null); setPreview(null); latestPreview.current = null; setDrag(null); setMarquee(null)
  }
  function redo() {
    clipboardRequest.current.version++
    if (history.future.length) keepFloorInView(history.future[0])
    setHistory(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)
    chooseSelection(null); setPreview(null); latestPreview.current = null; setDrag(null); setMarquee(null)
  }
  function keepFloorInView(next: JumpLevel, previous = history.present) {
    const dy = levelHeight(next) - levelHeight(previous)
    if (!dy) return
    setView(v => ({ ...v, y: v.y + dy }))
    setPointer(p => p && { ...p, y: p.y + dy })
  }
  function numberEdit(update: (base: JumpLevel, value: number) => JumpLevel, followFloor = false) {
    // Always derive from the committed level, so intermediate/clamped typing
    // cannot shift an object's fixed edge or permanently crop its geometry.
    return {
      onPreview: (value: number | null) => {
        const next = value === null ? null : update(history.present, value)
        // Returned callbacks run only from NumberField events, never during render.
        if (followFloor) keepFloorInView(next ?? history.present, latestPreview.current ?? history.present)
        latestPreview.current = next; setPreview(next)
      },
      onCommit: (value: number) => {
        const next = update(history.present, value)
        if (followFloor) keepFloorInView(next, latestPreview.current ?? history.present)
        commit(next)
      },
    }
  }
  function load(next: JumpLevel, file?: LevelFile) {
    clipboardRequest.current.version++; pasteCount.current = { text: '', count: 0 }
    next = prepareLevelRopes(copyLevel(next), true)
    suggestFileName.current = !file
    const name = file?.fileName ?? levelFileName(next.name, levels.entries.map(file => file.fileName))
    setFileName(name); setFileSource({ text: file?.sourceText, fileName: file?.fileName })
    setHistory({ past: [], present: next, future: [] })
    setSaved({ level: editSignature(next), fileName: name })
    setPreview(null); latestPreview.current = null; setDrag(null); setMarquee(null)
    chooseSelection(null); chooseInspectorTab('level'); setTool('select'); setView(homeView(next, size.height)); setMessage('')
    onFileChange(file?.fileName)
  }
  function chooseLibraryItem(choice: LibraryChoice) {
    if (choice.kind === 'template') chooseTemplate(choice.file.level)
    else {
      const next = choice.kind === 'open' ? choice.file.level : blankTrial()
      load(next, choice.kind === 'open' ? choice.file : undefined)
      if (choice.kind === 'open') fitLevel(next)
    }
    setLibraryOpen(false)
    requestAnimationFrame(() => canvasRef.current?.focus())
  }
  function remove() {
    if (selectedItems.length) { commit(deleteSelections(history.present, selectedItems)); chooseSelection(null) }
  }
  function removeNode() {
    if (selection?.kind !== 'platform' || selectedNode === null) return
    try {
      const next = deleteTerrainNode(history.present, selection.index, selectedNode)
      commit(next); setSelectedNode(Math.min(selectedNode, terrainNodes(next.platforms[selection.index]).length - 1))
    } catch (error) { setMessage((error as Error).message) }
  }
  function transformSelectedTerrain(transform: TerrainTransform) {
    if (!allTerrain) return
    try {
      commit(transformSelections(history.present, selectedItems, transform)); setSelectedNode(null)
    } catch (error) { setMessage((error as Error).message) }
  }
  function add(tool: Tool, start: Point, end: Point, free = false) {
    try {
      const added = addItem(history.present, tool, start, end)
      if (added) { commit(snap && !free ? placeOnSurface(added.level, added.selection, 12 / view.zoom) : added.level); chooseSelection(added.selection); if (!keepTool) setTool('select') }
    } catch (error) { setMessage((error as Error).message) }
  }
  async function save(testAfter = false, updateRoute = true): Promise<LevelFile | undefined> {
    if (savePending.current || levels.busy || saveFailure) return undefined
    if (!levels.canWrite) {
      setMessage('Built-in editing requires the local development server.')
      setLibraryOpen(true)
      return undefined
    }
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const name = suggestFileName.current ? levelFileName(level.name, levels.entries.map(file => file.fileName)) : fileName
    savePending.current = true; setSaving(true); setMessage('')
    try {
      const controller = new AbortController(); savePreparation.current = controller
      const next = parseLevel((await prepareLevelInWorker(level, { signal: controller.signal })).level)
      const ownsFile = fileSource.text !== undefined
      const previousName = ownsFile ? fileSource.fileName! : name
      if (levels.files.some(file => file.fileName !== previousName && file.fileName !== name && file.level.id === next.id)) {
        throw new Error('Another built-in file uses this level’s ID. Use a template to create an independent level.')
      }
      const source = await levels.save(name, next, ownsFile ? fileSource.text : undefined, previousName)
      suggestFileName.current = false
      setFileName(name); setFileSource({ text: source, fileName: name })
      setSaved({ level: editSignature(history.present), fileName: name })
      const savedMessage = previousName !== name ? `Renamed “${previousName}” to “${name}” and saved.` : `Saved “${name}” to built-in levels.`
      setMessage(savedMessage)
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
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!, ratio = lightingPixelRatio(size.width, size.height, devicePixelRatio || 1)
    canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio)
    lightingRenderer.state.reset()
    const draw = (dt: number) => {
      previewTime.current += dt
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#eeeee6'; ctx.fillRect(0, 0, size.width, size.height)
      {
        if (lightingGeometry.groups) lightingRenderer.prepare(level, lightingGeometry.groups)
        const lighting = lightingForLevel(level)
        const definition = { ...lighting, nightMode: lightingPreview && nightModeEnabled(lighting),
          lights: lighting.lights.map(l => l.id === previewLight && !helpOpen && !libraryOpen ? { ...l, power: 'always' as const } : l) }
        lightingRenderer.render(ctx, previewRun ? { ...previewRun, activeTime: previewTime.current } : playgroundLightingWorld(level, previewPlayer), definition,
          { ...view, width: canvas.width, height: canvas.height, zoom: view.zoom * ratio }, dt, undefined, true, 'structural', !lightingPreview || terrainDrag)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.save(); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x, -view.y)
      for (const relay of level.logicRelays ?? []) drawLogicRelay(ctx, relay, !!previewRun?.switchStates.get(relay.id))
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
      if (robot && robot.kind !== 'repulsor') {
        ctx.strokeStyle = '#cc6a49'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 3 / view.zoom]); ctx.beginPath(); ctx.moveTo(robot.left, robot.y - 65); ctx.lineTo(robot.right, robot.y - 65); ctx.stroke(); ctx.setLineDash([])
        const handle = 9 / view.zoom; ctx.fillStyle = '#c65231'
        for (const x of [robot.left, robot.right]) ctx.fillRect(x - handle / 2, robot.y - 65 - handle / 2, handle, handle)
      }
      if (support && Math.abs(support.delta) < .1) {
        ctx.strokeStyle = '#60826a'; ctx.lineWidth = 3 / view.zoom
        ctx.beginPath(); ctx.moveTo(support.left, support.y); ctx.lineTo(support.right, support.y); ctx.stroke()
      }
      if (selectedItems.length > 1) {
        ctx.strokeStyle = '#c65231'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
        for (const selected of selectedItems) {
          const b = selectionBounds(level, [selected])
          if (b) ctx.strokeRect(b.x - 4 / view.zoom, b.y - 4 / view.zoom, b.w + 8 / view.zoom, b.h + 8 / view.zoom)
        }
        ctx.setLineDash([])
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
        for (const handle of curveHandles) {
          ctx.strokeStyle = '#287c9b'; ctx.lineWidth = 1.5 / view.zoom
          ctx.beginPath(); ctx.moveTo(handle.node[0], handle.node[1]); ctx.lineTo(handle.x, handle.y); ctx.stroke()
          ctx.beginPath(); ctx.arc(handle.x, handle.y, 4.5 / view.zoom, 0, Math.PI * 2)
          ctx.fillStyle = '#287c9b'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.stroke()
        }
        ctx.strokeStyle = '#c65231'
        if (chosen) for (const [i, [wx, wy]] of terrainNodes(chosen).entries()) {
          ctx.beginPath(); ctx.arc(wx, wy, (i === selectedNode ? 6 : 4.5) / view.zoom, 0, Math.PI * 2)
          ctx.fillStyle = i === selectedNode ? '#c65231' : '#fffdf5'; ctx.fill(); ctx.stroke()
        }
      }
      for (const point of selectedTerminals) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 7 / view.zoom, 0, Math.PI * 2)
        ctx.strokeStyle = '#c65231'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
      }
      ctx.restore()
    }
    draw(0)
    const flickering = !terrainDrag && lightingPreview && level.lighting?.lights.some(l => l.flicker && (l.power === 'always' || l.id === previewLight))
    const animatingFields = !terrainDrag && previewRun?.forceFields.some(f => f.active && f.definition.x < view.x + size.width / view.zoom
      && f.definition.x + f.definition.w > view.x && f.definition.y < view.y + size.height / view.zoom && f.definition.y + f.definition.h > view.y)
    if (helpOpen || libraryOpen || !flickering && !animatingFields) return
    let frame = 0, previous = 0
    const tick = (now: number) => {
      if (document.hidden) previous = 0
      else if (!previous || flickering || now - previous >= 1000 / 30) {
        draw(previous ? Math.min(.05, (now - previous) / 1000) : 0)
        previous = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, level, previewRun, previewPlayer, view, size, outline, selectedItems, selectedTerminals, resizeHandles, chosen, selectedNode, curveHandles, mechanism, robot, terrainDrag, support, wallText, wallTextFontReady, light, aimHandles, lightingPreview, previewLight, helpOpen, libraryOpen, lightingGeometry.ready, lightingGeometry.groups, lightingRenderer])
  useEffect(() => {
    if (!active || size.width <= 0 || size.height <= 0) return
    // Cursor movement must not restart lighting or redraw the authored world.
    const canvas = placementCanvasRef.current!, ctx = canvas.getContext('2d')!, ratio = Math.min(devicePixelRatio || 1, 2)
    const width = Math.round(size.width * ratio), height = Math.round(size.height * ratio)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.scale(ratio * view.zoom, ratio * view.zoom); ctx.translate(-view.x, -view.y)
    if (marquee) {
      ctx.fillStyle = '#c6523120'; ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h)
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 1.5 / view.zoom; ctx.setLineDash([5 / view.zoom, 3 / view.zoom])
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h)
    }
    if (placement) drawPlacementPreview(ctx, placement, view.zoom)
    ctx.setLineDash([])
    if (snap && !pointer?.free && !marquee && tool === 'select') drawLevelCenterGuides(ctx, level, selectedItems, view.zoom)
    if (hoveredNode) {
      ctx.beginPath(); ctx.arc(hoveredNode.x, hoveredNode.y, 6 / view.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#c65231'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
    }
    if (nodeTarget) {
      const [a, b, c, d] = terrainCubic(level.platforms[nodeTarget.index], nodeTarget.edge)
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]); ctx.stroke()
      ctx.beginPath(); ctx.arc(nodeTarget.x, nodeTarget.y, 6 / view.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#c65231'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
      const cross = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(nodeTarget.x - cross, nodeTarget.y); ctx.lineTo(nodeTarget.x + cross, nodeTarget.y)
      ctx.moveTo(nodeTarget.x, nodeTarget.y - cross); ctx.lineTo(nodeTarget.x, nodeTarget.y + cross); ctx.stroke()
    }
  }, [active, size, view, placement, marquee, wallTextFontReady, hoveredNode, nodeTarget, level, selectedItems, snap, pointer?.free, tool])

  function position(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: view.x + (event.clientX - rect.left) / view.zoom, y: view.y + (event.clientY - rect.top) / view.zoom }
  }
  function hover(point: Point, free: boolean) {
    setPointer(previous => previous?.x === point.x && previous.y === point.y && !!previous.free === free ? previous : { ...point, free })
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true })
    // Controller drags use the same editor events without a physical pointer ID.
    if (event.nativeEvent.isTrusted) event.currentTarget.setPointerCapture(event.pointerId)
    const p = position(event), screen = { x: event.clientX, y: event.clientY }, base = preview ?? history.present
    const previousClick = lastClick.current; lastClick.current = null
    hover(p, event.altKey)
    latestPreview.current = null
    if (panHeld.current || event.button === 1) { setDrag({ mode: 'pan', start: p, screen, base, view, selection: null }); return }
    if ((tool === 'node' || tool === 'select') && selection && selectedNode !== null) {
      const handle = curveHandles.find(h => Math.hypot(p.x - h.x, p.y - h.y) < 8 / view.zoom)
      if (handle) {
        setDrag({ mode: 'bezier', start: p, screen, base, view, selection, point: selectedNode, tangent: handle.side }); return
      }
    }
    if (tool === 'node') {
      const node = terrainVertexTarget(base, p.x, p.y, 10 / view.zoom)
      if (node) {
        const selected = { kind: 'platform' as const, index: node.index }
        chooseSelection(selected); setSelectedNode(node.vertex); setMessage('')
        setDrag({ mode: 'point', start: p, screen, base, view, selection: selected, point: node.vertex })
        return
      }
      const target = terrainNodeTarget(base, p.x, p.y, 12 / view.zoom, snap ? gridSize : 0)
      if (!target) { setMessage('Click a terrain edge to add a node, or drag an existing node.'); return }
      try {
        const next = insertTerrainNode(base, target), selected = { kind: 'platform' as const, index: target.index }
        chooseSelection(selected); setSelectedNode(target.edge + 1); setMessage(''); setPreview(next); latestPreview.current = next
        setDrag({ mode: 'point', start: p, screen, base: next, view, selection: selected, point: target.edge + 1, inserted: true })
      } catch (error) { setMessage((error as Error).message) }
      return
    }
    if (tool !== 'select') {
      const grid = gridSize
      setDrag({ mode: 'draw', start: event.altKey ? p : { x: quantize(p.x, grid), y: quantizeY(p.y, grid) }, screen, base, view, selection: null }); return
    }
    const repeated = previousClick?.level === base
      && Math.hypot(p.x - previousClick.point.x, p.y - previousClick.point.y) * view.zoom < 3
    if (event.shiftKey) {
      const hits = [...hitItems(level, p.x, p.y, 9 / view.zoom)]
      const current = repeated ? hits.findIndex(s => sameSelection(s, previousClick.selection)) : -1
      const hit = hits[current >= 0 ? (current + 1) % hits.length : 0]
      if (hit) {
        const members = expandEditorGroups(level, [hit])
        chooseSelections(members.every(m => selectedItems.some(s => sameSelection(s, m)))
          ? selectedItems.filter(s => !members.some(m => sameSelection(s, m))) : [...selectedItems, ...members])
        lastClick.current = { point: p, level: base, selection: hit, additive: true }
        return
      }
      setMarquee({ ...p, w: 0, h: 0 })
      setDrag({ mode: 'marquee', start: p, screen, base, view, selection: null, selections: selectedItems, additive: true }); return
    }
    const terminal = wallTerminals(base).find(point => Math.hypot(p.x - point.x, p.y - point.y) < 10 / view.zoom)
    if (terminal) {
      chooseSelection(terminal.owner); setTerminalFocus({ x: terminal.x, y: terminal.y })
      setDrag({ mode: 'wire-terminal', start: p, screen, base, view, selection: terminal.owner, terminal }); return
    }
    setTerminalFocus(null)
    const aimHandle = aimHandles.find(h => Math.hypot(p.x - h.x, p.y - h.y) < 10 / view.zoom)
    if (selection?.kind === 'light' && aimHandle) { chooseInspectorTab('object'); setDrag({ mode: aimHandle.kind, start: p, screen, base, view, selection }); return }
    if (selection && travelHandleAt(p)) {
      chooseInspectorTab('object')
      setDrag({ mode: 'travel', start: p, screen, base, view, selection }); return
    }
    const patrolHandle = patrolHandleAt(p)
    if (selection?.kind === 'robot' && patrolHandle) {
      chooseInspectorTab('object')
      setDrag({ mode: 'patrol', start: p, screen, base, view, selection, side: patrolHandle.side }); return
    }
    const handle = resizeHandleAt(p)
    if (selection && handle) {
      chooseInspectorTab('object')
      setSelectedNode(null)
      setDrag({ mode: 'resize', start: p, screen, base, view, selection, corner: handle.corner }); return
    }
    if (selection && chosen) {
      const point = terrainNodes(chosen).findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 10 / view.zoom)
      if (point >= 0) { chooseInspectorTab('object'); setSelectedNode(point); setDrag({ mode: 'point', start: p, screen, base, view, selection, point }); return }
    }
    const hits = [...hitItems(level, p.x, p.y, 9 / view.zoom)]
    const current = repeated && !previousClick.additive && (selection || selectedGroup)
      && selectedItems.some(s => sameSelection(s, previousClick.selection))
      ? hits.findIndex(s => sameSelection(s, previousClick.selection)) : -1
    const hit = hits[current >= 0 ? current : 0]
    if (!hit) {
      chooseSelection(null); setMarquee({ ...p, w: 0, h: 0 })
      setDrag({ mode: 'marquee', start: p, screen, base, view, selection: null }); return
    }
    const retained = selectedItems.some(s => sameSelection(s, hit))
    const items = retained ? selectedItems : expandEditorGroups(level, [hit])
    const drill = retained && !!selectedGroup
    const cycle = !drill && current >= 0 && hits.length > 1 ? hits[(current + 1) % hits.length] : undefined
    chooseSelections(items); setDrag({ mode: 'move', start: p, screen, base, view, selection: hit, selections: items, drill, cycle, overlap: hits.length > 1 })
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag
    if (!d) { hover(position(event), event.altKey); return }
    if (d.mode === 'pan') { setView({ ...d.view, x: d.view.x - (event.clientX - d.screen.x) / d.view.zoom, y: d.view.y - (event.clientY - d.screen.y) / d.view.zoom }); return }
    const p = position(event), dx = p.x - d.start.x, dy = p.y - d.start.y
    hover(p, event.altKey)
    if (d.mode === 'marquee') { setMarquee({ x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) }); return }
    const grid = gridSize
    const qx = (v: number) => event.altKey ? v : quantize(v, grid), qy = (v: number) => event.altKey ? v : quantizeY(v, grid)
    let next: JumpLevel | null = null
    if (d.mode === 'draw') {
      try {
        const added = addItem(d.base, tool, d.start, { x: qx(p.x), y: qy(p.y) })
        next = added ? snap && !event.altKey ? placeOnSurface(added.level, added.selection, 12 / view.zoom) : added.level : null
      } catch { /* Explain invalid placement when released. */ }
    } else if (d.selection) {
      const rawBounds = itemBounds(d.base, d.selection)!
      const b = d.selection.kind === 'light' ? { ...rawBounds, ...d.base.lighting!.lights[d.selection.index] }
        : d.selection.kind === 'wall-light' ? { ...rawBounds, ...d.base.wallLights![d.selection.index] }
        : d.selection.kind === 'float-switch' ? { ...rawBounds, ...d.base.floatSwitches![d.selection.index] }
        : d.selection.kind === 'logic-relay' ? { ...rawBounds, ...d.base.logicRelays![d.selection.index] } : rawBounds
      if (d.mode === 'wire-terminal' && d.terminal && Math.hypot(dx, dy) * view.zoom >= 3) {
        next = setWallTerminal(d.base, d.selection, { x: qx(d.terminal.x + dx), y: qy(d.terminal.y + dy) })
      }
      if (d.mode === 'move') {
        // Resolve group drill-down and overlap cycling on release; drags keep
        // moving the current selection. Overlaps also ignore initial click
        // jitter; Alt and unobscured objects still accept tiny drags.
        if ((d.drill || d.cycle || (d.overlap && !event.altKey)) && Math.hypot(dx, dy) * view.zoom < 3) return
        const items = d.selections ?? [d.selection]
        const aligned = snap && !event.altKey ? levelCenterSnap(d.base, items, dx, dy, 8 / view.zoom) : { dx: null, dy: null }
        next = moveSelections(d.base, items, aligned.dx ?? qx(b.x + dx) - b.x, aligned.dy ?? qy(b.y + dy) - b.y)
        if (snap && !event.altKey && items.length === 1 && aligned.dy === null) next = placeOnSurface(next, d.selection, 12 / view.zoom)
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
      if (d.mode === 'patrol' && d.side) {
        const robot = d.base.robots![d.selection.index]
        next = setShovebotLimit(d.base, d.selection.index, d.side, qx(robot[d.side] + dx))
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
        next = resizeItem(d.base, d.selection, Math.max(snap && !event.altKey ? grid : 1, width), Math.max(snap && !event.altKey ? grid : 1, height), d.corner)
      }
      if (d.mode === 'point') {
        const point = terrainNodes(d.base.platforms[d.selection.index])[d.point!]
        next = d.inserted && Math.hypot(dx, dy) * view.zoom < 3 ? d.base
          : moveVertex(d.base, d.selection.index, d.point!, qx(point[0] + dx) - point[0], qy(point[1] + dy) - point[1])
      }
      if (d.mode === 'bezier') {
        const terrain = d.base.platforms[d.selection.index], point = terrainNodes(terrain)[d.point!], vector = terrain.bezier![d.point!]![d.tangent!]!
        try {
          next = moveTerrainHandle(d.base, d.selection.index, d.point!, d.tangent!, qx(point[0] + vector[0] + dx), qy(point[1] + vector[1] + dy))
          setMessage('')
        } catch (error) { setMessage((error as Error).message) }
      }
    }
    if (next) { latestPreview.current = next; setPreview(next) }
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag; setDrag(null); setMarquee(null)
    hover(position(event), event.altKey)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!d) return
    if (d.mode === 'marquee') {
      const p = position(event), rect = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) }
      if (Math.hypot(rect.w, rect.h) * view.zoom >= 3) chooseSelections(expandEditorGroups(d.base, [...(d.additive ? d.selections ?? [] : []), ...selectionsInRect(d.base, rect)]))
      return
    }
    if (d.mode === 'move' && d.selection && !latestPreview.current) {
      const picked = d.cycle ?? d.selection
      if (d.drill) chooseSelection(picked)
      else if (d.cycle) {
        const members = expandEditorGroups(d.base, [picked]), previous = d.selection
        // Enter a new group together; once drilled in, cycle its members individually.
        if (members.some(s => sameSelection(s, previous))) chooseSelection(picked)
        else chooseSelections(members)
      }
      lastClick.current = { point: d.start, level: d.base, selection: picked }
    }
    if (d.mode === 'draw') {
      const p = position(event), grid = gridSize
      add(tool, d.start, event.altKey ? p : { x: quantize(p.x, grid), y: quantizeY(p.y, grid) }, event.altKey)
    }
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
  function setDimension(base: JumpLevel, axis: 'x' | 'y' | 'w' | 'h', value: number) {
    const bounds = selection && itemBounds(base, selection)
    if (!selection || !bounds || !Number.isFinite(value)) return base
    const light = selection.kind === 'light' ? base.lighting?.lights[selection.index] : selection.kind === 'wall-light' ? base.wallLights?.[selection.index]
      : selection.kind === 'float-switch' ? base.floatSwitches?.[selection.index] : selection.kind === 'logic-relay' ? base.logicRelays?.[selection.index] : null
    return axis === 'x' || axis === 'y' ? moveItem(base, selection, axis === 'x' ? value - (light?.x ?? bounds.x) : 0, axis === 'y' ? levelHeight(base) - value - (light?.y ?? bounds.y) : 0)
      : resizeItem(base, selection, axis === 'w' ? value : bounds.w, axis === 'h' ? value : bounds.h)
  }

  function duplicate() {
    try {
      const result = pasteSelections(history.present, copySelections(history.present, selectedItems), 40, 0)
      if (!result.selections.length) { setMessage('Select an object to duplicate. Entrance and exit doors cannot be duplicated.'); return }
      commit(result.level); setSelectedItems(result.selections); setSelectedNode(null); setTerminalFocus(null); chooseInspectorTab('object')
      setMessage(result.selections.length === 1 ? `Created ${selectionLabel(result.selections[0], result.level)}.` : `Duplicated ${result.selections.length} objects.`)
      canvasRef.current?.focus()
    } catch (error) { setMessage((error as Error).message) }
  }
  function fitLevel(next = level) {
    const z = Math.min(size.width / (next.width + 120), size.height / (levelHeight(next) + 120))
    setView({ x: -60, y: -60, zoom: clamp(z, .08, 2.5) })
  }
  function chooseTemplate(template: JumpLevel) {
    const next = copyForEditing(template)
    load(next); fitLevel(next); setSaved({ level: null, fileName: levelFileName(next.name) })
    setMessage(`Created a new level from “${template.name}”. Its file will be created when you save.`)
    requestAnimationFrame(() => canvasRef.current?.focus())
  }
  function changedObject(base: JumpLevel, field: string, value: number | string | boolean) {
    if (!selection) return base
    if (selection.kind === 'float-switch') return editFloatSwitch(base, selection.index, { [field]: value })
    if (selection.kind === 'light') return editLight(base, selection.index, { [field]: value })
    if (selection.kind === 'mechanism' && field === 'travel') {
      return setElevatorTravel(base, selection.index, Number(value))
    }
    if (selection.kind === 'text' && field === 'rotation') {
      return setWallTextRotation(base, selection.index, Number(value))
    }
    if (selection.kind === 'robot' && (field === 'left' || field === 'right')) return setShovebotLimit(base, selection.index, field, Number(value))
    const next = copyLevel(base)
    if (selection.kind === 'text') {
      const text = next.texts![selection.index]
      if (field === 'text') text.text = String(value).slice(0, 1000)
      if (field === 'fontSize' && Number.isFinite(Number(value))) text.fontSize = clamp(Number(value), 12, 96)
      if (field === 'align' && (value === 'left' || value === 'center' || value === 'right')) text.align = value
      if (field === 'style' && (value === 'official' || value === 'graffiti' || value === 'lab-stamp' || value === 'terminal')) text.style = value
    }
    return next
  }
  function changeObject(field: string, value: number | string | boolean) {
    commit(changedObject(history.present, field, value))
  }

  const { connected: controllerConnected, cursorElement: controllerCursorElement } = useBuilderController({ active, root: builderRef, canvas: canvasRef,
    onPan: (x, y) => setView(previous => ({ ...previous, x: previous.x + x / previous.zoom, y: previous.y + y / previous.zoom })),
    onZoom: zoom, onUndo: undo, onRedo: redo, onDuplicate: duplicate,
    onLibrary: () => { if (!saving && !levels.busy) setLibraryOpen(true) },
    onTest: () => { if (!drag && !problem && !saving && !levels.busy) void save(true) }, onEditText: setTextEntry })

  return <section ref={builderRef} className="jumping-builder" hidden={!active} aria-label="Level builder"
    onCopy={event => copyEvent(event)} onCut={event => copyEvent(event, true)} onPaste={pasteEvent}
    onKeyDownCapture={event => { if (event.nativeEvent.isTrusted) event.currentTarget.dataset.inputMethod = 'keyboard' }} onKeyDown={event => {
    if (libraryOpen || helpOpen || saveFailure) return
    if (event.key === 'Alt') setPointer(previous => previous && { ...previous, free: true })
    if (event.key === 'F1') { event.preventDefault(); setHelpOpen(true); return }
    if (textEntryTarget(event.target)) return
    if (event.code === 'Space' && event.target === canvasRef.current) { event.preventDefault(); panHeld.current = true }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') { event.preventDefault(); group(event.shiftKey) }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && event.target === canvasRef.current) { event.preventDefault(); chooseSelections(allSelections(level)) }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
    else if (event.key === 'Escape') { setTool('select'); chooseSelection(null); setDrag(null); setMarquee(null); setPreview(null); latestPreview.current = null }
    else if (!event.ctrlKey && !event.metaKey && ({ v: 'select', n: 'node', p: 'platform', r: 'rope', l: 'ladder' } as Record<string, Tool>)[event.key.toLowerCase()]) { event.preventDefault(); setTool(({ v: 'select', n: 'node', p: 'platform', r: 'rope', l: 'ladder' } as Record<string, Tool>)[event.key.toLowerCase()]) }
    else if (event.target === canvasRef.current && selection && terminalFocus && terminalPosition) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); commit(setWallTerminal(history.present, selection, null)); setTerminalFocus(null)
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 1 : gridSize
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        commit(setWallTerminal(history.present, selection, {
          x: snap && !event.shiftKey && dx ? quantize(terminalPosition.x + dx, gridSize) : terminalPosition.x + dx,
          y: snap && !event.shiftKey && dy ? quantizeY(terminalPosition.y + dy, gridSize) : terminalPosition.y + dy,
        }))
      }
    }
    else if (event.target === canvasRef.current && selectedItems.length > 1) {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 1 : gridSize
        commit(moveSelections(history.present, selectedItems, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))
      }
    }
    else if (event.target === canvasRef.current && selection) {
      if (event.key === 'End') { event.preventDefault(); commit(placeOnSurface(history.present, selection)) }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selectedNode !== null && chosen) removeNode(); else remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const grid = gridSize, step = event.shiftKey ? 1 : grid
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const node = chosen && selectedNode !== null ? terrainNodes(chosen)[selectedNode] : null
        const origin = node ? { x: node[0], y: node[1] } : light ?? wallLight ?? logicRelay ?? bounds
        const shiftX = snap && !event.shiftKey && origin && dx ? quantize(origin.x + dx, grid) - origin.x : dx
        const shiftY = snap && !event.shiftKey && origin && dy ? quantizeY(origin.y + dy, grid) - origin.y : dy
        commit(node ? moveVertex(history.present, selection.index, selectedNode!, shiftX, shiftY)
          : moveItem(history.present, selection, shiftX, shiftY))
      }
    }
  }} onKeyUp={event => { if (event.code === 'Space') panHeld.current = false; if (event.key === 'Alt') setPointer(previous => previous && { ...previous, free: false }) }} onBlur={() => { panHeld.current = false }}>
    <header className="builder-header">
      <div className="builder-brand"><h1>Level studio</h1></div>
      <div className="builder-main-actions">
        <button className="builder-play" title="Save this level and playtest it" disabled={!!problem || levels.busy || saving} aria-busy={saving} onClick={() => void save(true)}><span aria-hidden="true">▶</span> Save and Test</button>
        <button title="Save this level (Ctrl/⌘ + S)" disabled={levels.busy || saving} onClick={() => void save()}>Save level</button>
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
        ] as const).map(([kind, label, title]) => <button key={kind} aria-label={label} title={title} disabled={!allTerrain} onClick={() => transformSelectedTerrain(kind)}><BuilderIcon kind={kind} /></button>)}
      </div>
      <div className="builder-control-group builder-placement-options" role="group" aria-label="Placement options">
        <label className="builder-inline-check" title={`Snap positions, sizes and nodes to ${gridSize} units, catch nearby surfaces, and align selection centers and bounds to the level center. Hold Alt to bypass.`}><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap</label>
        <BuilderSelect label="Grid" accessibleLabel="Snap grid" title="Choose the spacing for snapping and nudges. Hold Alt to bypass snapping."
          value={String(gridSize)} options={[{ value: String(BUILDER_GRID_SIZE), label: '5 units' }, { value: String(LEVEL_GRID_SIZE), label: '20 units' }]}
          onChange={value => setGridSize(Number(value))} />
        <label className="builder-inline-check" title="Keep the object tool active after placing an object. Pointer and Node stay active until you switch tools."><input type="checkbox" checked={keepTool} onChange={e => setKeepTool(e.target.checked)} />Keep placing</label>
      </div>
      <div className="builder-control-group" role="group" aria-label="Edit history"><button title="Undo the last edit (Ctrl/⌘ + Z)" disabled={!history.past.length} onClick={undo}>Undo</button><button title="Redo the last undone edit (Ctrl/⌘ + Shift + Z)" disabled={!history.future.length} onClick={redo}>Redo</button></div>
      <div className="builder-control-group" role="group" aria-label="Clipboard">
        <button title="Cut selected objects (Ctrl/⌘ + X)" disabled={!selectedItems.some(copyableSelection)} onClick={() => { void copyToClipboard(true) }}>Cut</button>
        <button title="Copy selected objects (Ctrl/⌘ + C)" disabled={!selectedItems.some(copyableSelection)} onClick={() => { void copyToClipboard() }}>Copy</button>
        <button title="Paste copied objects (Ctrl/⌘ + V)" onClick={() => { void paste() }}>Paste</button>
      </div>
      <div className="builder-control-group" role="group" aria-label="Object grouping">
        <button title="Group selected objects (Ctrl/⌘ + G)" disabled={selectedItems.length < 2 || !!selectedGroup} onClick={() => group()}>Group</button>
        <button title="Ungroup selected objects (Ctrl/⌘ + Shift + G)" disabled={!canUngroup} onClick={() => group(true)}>Ungroup</button>
      </div>
      <div className="builder-control-group builder-zoom-controls" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" title="Zoom out to see more of the level" onClick={() => zoom(.8)}>−</button><output aria-label="Zoom" title="Current canvas zoom">{Math.round(view.zoom * 100)}%</output><button aria-label="Zoom in" title="Zoom in for more precise editing" onClick={() => zoom(1.25)}>+</button></div>
      <div className="builder-control-group" role="group" aria-label="Canvas view"><label className="builder-inline-check" title="Show daylight or night lighting in this view. This does not change the saved level."><input type="checkbox" checked={lightingPreview} onChange={e => setLightingPreview(e.target.checked)} />Lighting</label><button title="Fit the entire level in the canvas" onClick={() => fitLevel()}>Fit level</button><button title="Center the view near the player's starting position" onClick={() => setView(homeView(level, size.height))}>Find start</button></div>
    </div>
    <aside className="builder-tools" aria-label="Building tools">
        {['Terrain', 'Movement', 'Objects', 'Gadgets', 'Mechanisms', 'Markers', 'Collectibles', 'Back wall'].map(group => {
          const items = TOOLS.filter(item => item.group === group && (item.id !== 'checkpoint' || !isPuzzleLevel(level)))
          return items.length ? <div className="builder-tool-group" key={group}><h2>{group}</h2>
            <div className="builder-tool-grid">{items.map(item => <button key={item.id} aria-pressed={tool === item.id} title={item.help} onClick={() => { setTool(tool === item.id ? 'select' : item.id); setMessage('') }}><BuilderIcon kind={item.id} /><span>{item.label}</span></button>)}</div>
          </div> : null
        })}
    </aside>
    <div className="builder-stage" data-placement-at-cursor={placementAtCursor || undefined}>
      <div ref={controllerCursorElement} className="builder-controller-cursor" hidden aria-hidden="true" />
      <canvas ref={placementCanvasRef} className="builder-placement-preview" aria-hidden="true" />
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Level canvas" aria-busy={preparingRopes || !lightingGeometry.ready} style={{ cursor: placementAtCursor ? 'none' : drag?.mode === 'pan' || drag?.mode === 'point' || drag?.mode === 'bezier' || drag?.mode === 'wire-terminal' ? 'grabbing' : hoveredNode || hoveredCurveHandle || hoveredTerminal ? 'grab' : tool === 'select' ? adjustingPatrol ? 'ew-resize' : adjustingTravel ? mechanism?.orientation === 'horizontal' ? 'ew-resize' : 'ns-resize' : resizeCorner ? resizeCursor : 'default' : 'crosshair' }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { setMarquee(null); setDrag(null); setPreview(null); setPointer(null); latestPreview.current = null }} onContextMenu={e => e.preventDefault()}
        onPointerLeave={() => { if (!drag) setPointer(null) }} />
      <button className="builder-minimap" aria-label="Fit level overview" title="Click to fit the whole level" onClick={() => fitLevel()}><LevelThumbnail level={terrainDrag ? history.present : level} preview /><span>Overview</span></button>
    </div>
    <aside className="builder-inspector" aria-label="Inspector" ref={inspectorRef}>
      <div className="builder-inspector-tabs" role="tablist" aria-label="Inspector" onKeyDown={event => {
        const next = event.key === 'Home' ? 'level' : event.key === 'End' ? 'object'
          : null
        if (!next) return
        event.preventDefault(); event.stopPropagation(); chooseInspectorTab(next)
        event.currentTarget.querySelector<HTMLButtonElement>(`#builder-inspector-tab-${next}`)?.focus()
      }}>
        {(['level', 'object'] as const).map(tab => <button key={tab} role="tab" id={`builder-inspector-tab-${tab}`}
          aria-controls={`builder-inspector-panel-${tab}`} aria-selected={inspectorTab === tab} tabIndex={inspectorTab === tab ? 0 : -1}
          title={tab === 'level' ? 'Edit level settings' : 'Inspect the selected object'} onClick={() => chooseInspectorTab(tab)}>{tab === 'level' ? 'Level' : 'Object'}</button>)}
      </div>
      <div id="builder-inspector-panel-object" role="tabpanel" aria-labelledby="builder-inspector-tab-object" hidden={inspectorTab !== 'object'}>
      <div className="builder-inspector-heading">
      <BuilderSelect label="Selected object" value={selectedItems.length > 1 ? 'group' : selection ? `${selection.kind}:${selection.index}` : ''}
        options={[{ value: '', label: 'Nothing selected' }, ...(selectedItems.length > 1 ? [{ value: 'group', label: `${selectedItems.length} objects selected` }] : []), ...allSelections(level).map(s => ({ value: `${s.kind}:${s.index}`, label: selectionLabel(s, level) }))]}
        onChange={value => { if (value === 'group') return; const [kind, index] = value.split(':'); chooseSelection(kind ? { kind: kind as Selection['kind'], index: Number(index) } : null); if (tool !== 'node' || kind && kind !== 'platform') setTool('select') }} />
      </div>
      {selectedItems.length > 1 ? <div className="builder-property-card">
        <h3 className="builder-object-heading">{selectedItems.length} objects selected</h3>
        <p className="builder-hint">{selectedGroup ? 'Saved group. Click a member to select just that object; drag a member to move the group.' : 'Drag any selected object to move the selection. Group keeps these objects together.'} Shift-click adds or removes objects. {allTerrain ? 'Rotate and flip transform the terrain group around its center.' : 'Rotate and flip are available when every selected object is terrain.'}</p>
        <div className="builder-object-actions">
          <button title="Duplicate selected objects (Ctrl/⌘ + D)" disabled={!selectedItems.some(copyableSelection)} onClick={duplicate}>Duplicate</button>
          <button className="builder-delete" aria-label="Delete selected objects" disabled={!selectedItems.some(copyableSelection)} onClick={remove}>Delete</button>
        </div>
        <ul className="builder-selection-list">{selectedItems.map(s => <li key={`${s.kind}:${s.index}`}>{selectionLabel(s, level)}</li>)}</ul>
      </div> : selection && bounds ? <div className="builder-property-card">
        <h3 className="builder-object-heading">{selectionLabel(selection, level)}</h3>
        <label>Name<ObjectNameField key={`${selection.kind}:${selection.index}`} value={itemDefinition(level, selection)?.name ?? ''}
          placeholder={defaultObjectLabel(level, selection)} onCommit={value => commit(renameItem(history.present, selection, value))} /></label>
        {Boolean(trigger || floatSwitch || prop || forceField || gravityPlate || switchable && objectPower || mechanism?.kind === 'lift' || pickup?.kind === 'time-bonus' || pickup?.kind === 'time-penalty' || selection.kind === 'entrance' || robot || switchedObject) && <BuilderInspectorSection title="Behavior">
          {switchable && objectPower && <BuilderSelect label="Power" accessibleLabel={goal ? 'Exit power' : light ? 'Light power' : gravityPlate ? 'Gravity plate power' : forceField ? 'Force field power' : 'Mechanism power'} value={objectPower}
            options={[{ value: 'always', label: 'Always on' }, { value: 'switched', label: 'Switched' }]}
            onChange={value => commit(setObjectPower(history.present, selection, value === 'always' ? 'always' : 'switched'))} />}
          {trigger && trigger.mode !== 'coins' && <>
            <BuilderSelect label="Mode" accessibleLabel="Pressure plate mode" value={trigger.behavior ?? 'pressure'}
              options={[{ value: 'pressure', label: 'Pressure' }, { value: 'switch', label: 'Switch' }, { value: 'toggle', label: 'Toggle' }]}
              onChange={value => commit(setPlateBehavior(history.present, selection.index, value === 'switch' ? 'switch' : value === 'toggle' ? 'toggle' : 'pressure'))} />
            <ToggleGroupFields level={level} index={selection.index} onChange={commit} />
            {trigger.behavior === 'switch' && <BuilderSelect label="Starts" accessibleLabel="Pressure plate initial state" value={triggerStartsOn(level, trigger) ? 'on' : 'off'}
              options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]}
              onChange={value => commit(setPlateBehavior(history.present, selection.index, 'switch', value === 'on'))} />}
          </>}
          {trigger?.mode === 'coins' && <>
            <BuilderSelect label="Display" accessibleLabel="Coin switch display" value={trigger.display ?? 'bar'}
              options={[{ value: 'digital', label: 'Numeric' }, { value: 'bar', label: 'Progress bar' }]}
              onChange={value => commit(setCoinSwitchDisplay(history.present, selection.index, value === 'digital' ? 'digital' : 'bar'))} />
            {!digitalCoinSwitch && <BuilderSelect label="Orientation" accessibleLabel="Coin switch orientation" value={trigger.orientation ?? 'horizontal'}
              options={[{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }]}
              onChange={value => commit(setCoinSwitchOrientation(history.present, selection.index, value === 'vertical' ? 'vertical' : 'horizontal'))} />}
            <label>Coins required<NumberField label="Coins required" min={1} max={80} step={1} value={trigger.threshold} {...numberEdit((base, value) => setCoinThreshold(base, selection.index, value))} /></label>
          </>}
          {floatSwitch && <>
            <div className="builder-dimensions">
              <label>Arm length<NumberField label="Float arm length" min={40} max={400} step={5} value={floatSwitch.armLength} {...numberEdit((base, value) => changedObject(base, 'armLength', value))} /></label>
              <label>Ball size<NumberField label="Float ball size" min={20} max={100} step={5} value={floatSwitch.size} {...numberEdit((base, value) => changedObject(base, 'size', value))} /></label>
            </div>
            <label>Travel angle (°)<NumberField label="Float travel angle" min={10} max={80} step={5} value={floatSwitch.travelAngle ?? 45} {...numberEdit((base, value) => changedObject(base, 'travelAngle', value))} /></label>
            <BuilderSelect label="Active when" accessibleLabel="Float activation" value={floatSwitch.activeWhen ?? 'raised'} options={[{ value: 'raised', label: 'Raised' }, { value: 'lowered', label: 'Lowered' }]} onChange={value => changeObject('activeWhen', value)} />
            <BuilderSelect label="Starts" accessibleLabel="Float starting position" value={floatSwitch.startsRaised ? 'raised' : 'lowered'} options={[{ value: 'lowered', label: 'Lowered' }, { value: 'raised', label: 'Raised' }]} onChange={value => changeObject('startsRaised', value === 'raised')} />
            <button className="builder-property-action" onClick={() => changeObject('flipX', !floatSwitch.flipX)}>Flip horizontally</button>
          </>}
          {prop && <>
            <BuilderSelect label="Weight" accessibleLabel="Object weight" value={prop.weight === 'heavy' ? 'heavy' : 'normal'}
              options={[{ value: 'normal', label: 'Normal' }, { value: 'heavy', label: 'Heavy' }]}
              onChange={value => {
                const next = copyLevel(history.present), object = next.props![selection.index]
                if (value === 'heavy') object.weight = value; else delete object.weight
                commit(next)
              }} />
            {prop.kind === 'box' && !prop.gadget && <label className="builder-headlight"><input type="checkbox" checked={!!prop.branded}
              onChange={event => commit(setCrateBranding(history.present, selection.index, event.target.checked))} />L.A.B. branding</label>}
          </>}
          {forceField && <>
            <BuilderSelect label="Mode" accessibleLabel="Force field mode" value={forceField.mode ?? 'player'}
              options={[{ value: 'player', label: 'Blue · blocks player' }, { value: 'objects', label: 'Red · lets player through' }]}
              onChange={value => {
                const next = copyLevel(history.present), field = next.forceFields![selection.index]
                if (value === 'objects') field.mode = 'objects'; else delete field.mode
                commit(next)
              }} />
          </>}
          {gravityPlate && <>
            <BuilderSelect label="Appearance" accessibleLabel="Field appearance" value={gravityPlate.effect ?? 'gravity'}
              options={[{ value: 'gravity', label: 'Gravity plate' }, { value: 'water', label: 'Water' }]}
              onChange={value => commit(setGravityPlateEffect(level, selection.index, value === 'water' ? 'water' : 'gravity'))} />
            {gravityPlate.effect !== 'water' && <label>Gravity (× normal)<NumberField label="Gravity strength" min={-3} max={3} step={.1} precision={2} value={gravityPlate.gravity}
              {...numberEdit((base, value) => {
                if (!Number.isFinite(value)) return base
                const next = copyLevel(base); next.gravityPlates![selection.index].gravity = clamp(value, -3, 3); return next
              })} /></label>}
            {gravityPlate.effect === 'water' && <>
              <label>Initial level (%)<NumberField label="Initial water level" min={gravityPlate.waterMinLevel ?? 0} max={100} step={5} value={gravityPlate.waterLevel ?? 100}
                {...numberEdit((base, value) => {
                  if (!Number.isFinite(value)) return base
                  const next = copyLevel(base), plate = next.gravityPlates![selection.index]
                  plate.waterLevel = clamp(value, plate.waterMinLevel ?? 0, 100); return next
                })} /></label>
              <label>Low water mark (%)<NumberField label="Low water mark" min={0} max={100} step={5} value={gravityPlate.waterMinLevel ?? 0}
                {...numberEdit((base, value) => {
                  if (!Number.isFinite(value)) return base
                  const next = copyLevel(base), plate = next.gravityPlates![selection.index]
                  plate.waterMinLevel = clamp(value, 0, 100)
                  if ((plate.waterLevel ?? 100) < plate.waterMinLevel) plate.waterLevel = plate.waterMinLevel
                  return next
                })} /></label>
              <label>Fill / drain speed (% per second)<NumberField label="Water level speed" min={.1} max={100} step={1} value={gravityPlate.waterRate ?? 10}
                {...numberEdit((base, value) => {
                  if (!Number.isFinite(value)) return base
                  const next = copyLevel(base); next.gravityPlates![selection.index].waterRate = clamp(value, .1, 100); return next
                })} /></label>
            </>}
          </>}
          {mechanism?.kind === 'lift' && <label>{mechanism.orientation === 'horizontal' ? 'Travel distance' : 'Travel height'}<NumberField label={mechanism.orientation === 'horizontal' ? 'Travel distance' : 'Travel height'} min={60} max={1200} step={snap ? gridSize : 1} value={mechanism.travel} {...numberEdit((base, value) => changedObject(base, 'travel', value))} /></label>}
          {(pickup?.kind === 'time-bonus' || pickup?.kind === 'time-penalty') && <label>{pickup.kind === 'time-bonus' ? 'Seconds off' : 'Seconds added'}<NumberField label={pickup.kind === 'time-bonus' ? 'Seconds off' : 'Seconds added'} min={1} max={9} step={1} value={pickup.seconds} {...numberEdit((base, value) => setPickupSeconds(base, selection.index, value))} /></label>}
          {selection.kind === 'entrance' && <BuilderSelect label="Entrance" accessibleLabel="Entrance style" value={level.entrance.kind ?? 'door'}
            options={[{ value: 'door', label: 'Door' }, { value: 'charging-bay', label: 'Charging bay' }]} onChange={value => {
              const next = copyLevel(history.present)
              if (value === 'charging-bay') next.entrance.kind = 'charging-bay'; else delete next.entrance.kind
              commit(next)
            }} />}
          {robot && robot.kind !== 'repulsor' && <BuilderSelect label="Mode" accessibleLabel="Shovebot mode" value={robot.mode ?? 'shove'} options={[{ value: 'shove', label: 'Shove' }, { value: 'emp', label: 'EMP + shove' }]} onChange={value => commit(setShovebotMode(history.present, selection.index, value as 'shove' | 'emp'))} />}
          {robot && robot.kind !== 'repulsor' && <div className="builder-dimensions"><label>Left limit<NumberField label="Shovebot left limit" min={ROBOT_HALF_WIDTH} max={Math.floor(Math.min(robot.x, robot.right - 50))} step={snap ? gridSize : 1} value={robot.left} {...numberEdit((base, value) => setShovebotLimit(base, selection.index, 'left', value))} /></label><label>Right limit<NumberField label="Shovebot right limit" min={Math.ceil(Math.max(robot.x, robot.left + 50))} max={Math.floor(level.width - ROBOT_HALF_WIDTH)} step={snap ? gridSize : 1} value={robot.right} {...numberEdit((base, value) => setShovebotLimit(base, selection.index, 'right', value))} /></label></div>}
          {robot?.kind === 'repulsor' && <label className="builder-headlight" title="Starts asleep in an installed pod. Sight, sound or contact wakes it before the hunt begins."><input type="checkbox" checked={!!robot.chargingBay} onChange={event => {
            const next = copyLevel(history.present)
            if (event.target.checked) next.robots![selection.index].chargingBay = true
            else delete next.robots![selection.index].chargingBay
            commit(next)
          }} />Charging bay</label>}
          {robot && <label className="builder-headlight" title="Lights ahead of this bot in night mode"><input type="checkbox" checked={!!robot.headlight} onChange={event => commit(setShovebotHeadlight(history.present, selection.index, event.target.checked))} />Headlight</label>}
          {switchedObject && <><fieldset className="builder-connections builder-switch-rule"><legend>Switch behavior</legend>
            <BuilderSelect label="Logic" accessibleLabel="Switch logic" value={objectSwitchLogic}
              options={[{ value: 'or', label: 'OR' }, { value: 'and', label: 'AND' }, { value: 'xor', label: 'XOR' }]}
              onChange={value => commit(setObjectSwitchLogic(history.present, selection, value === 'and' ? 'and' : value === 'xor' ? 'xor' : 'or'))} />
            <div className="builder-action-row"><label><input type="checkbox" checked={objectSwitchReversed} onChange={e => commit(setObjectSwitchReversed(history.present, selection, e.target.checked))} />Reversed</label>
            {!logicRelay && <label title="Use this item's resulting on/off state to switch other items"><input type="checkbox" checked={!!switchedObject.definition.relay} onChange={e => commit(setObjectRelay(history.present, selection, e.target.checked))} />Relay</label>}
            </div>
            <p className="builder-hint">{objectSwitchReversed ? 'Off' : 'On'} when {objectSwitchLogic === 'and' ? 'every connected switch is active'
              : objectSwitchLogic === 'xor' ? 'exactly one connected switch is active' : 'any connected switch is active'}. {objectSwitchReversed ? 'On' : 'Off'} otherwise.</p>
          </fieldset></>}
        </BuilderInspectorSection>}
        {Boolean(switchedObject || selectedSource || gravityPlate?.effect === 'water') && <BuilderInspectorSection title="Connections">
          {switchedObject && <fieldset className="builder-connections"><legend>Switched by</legend>
            <BuilderConnectionList key={switchedObject.id} label="Switched by" empty="No switches" items={incomingSources.map(source => ({
              id: `${source.kind}:${source.index}`, label: `${selectionLabel(source, level)}${source.kind !== 'trigger' && source.kind !== 'float-switch' && source.kind !== 'logic-relay' ? ' · Relay' : ''}`,
              checked: switchTargets(source.definition).includes(switchedObject.id), onChange: checked => {
                const ids = switchTargets(source.definition)
                commit(setSwitchTargets(history.present, source, checked ? [...ids, switchedObject.id] : ids.filter(id => id !== switchedObject.id)))
              },
            }))} />
          </fieldset>}
          {selectedSource && <fieldset className="builder-connections"><legend>Activates</legend>
            <BuilderConnectionList key={`${selection.kind}:${selection.index}`} label="Activates" empty="No switched items" items={outgoingTargets.map(item => ({
              id: item.id, label: switchItemLabel(level, item), checked: switchTargets(selectedSource.definition).includes(item.id), onChange: checked => {
                const ids = switchTargets(selectedSource.definition)
                commit(setSwitchTargets(history.present, selection, checked ? [...ids, item.id] : ids.filter(id => id !== item.id)))
              },
            }))} />
          </fieldset>}
          {gravityPlate?.effect === 'water' && <>
              {(['fill', 'drain'] as const).map(action => {
                const title = action === 'fill' ? 'Fill' : 'Drain', control = gravityPlate[action], id = waterControlId(gravityPlate.id, action)
                return <fieldset className="builder-connections" key={action}><legend>{title} water</legend>
                  <BuilderSelect label="Logic" accessibleLabel={`${title} switch logic`} value={control?.switchLogic ?? 'or'}
                    options={[{ value: 'or', label: 'OR' }, { value: 'and', label: 'AND' }, { value: 'xor', label: 'XOR' }]}
                    onChange={value => commit(setWaterControl(history.present, selection.index, action, { switchLogic: value === 'and' ? 'and' : value === 'xor' ? 'xor' : 'or' }))} />
                  <label><input type="checkbox" checked={!!control?.switchReversed} onChange={e => commit(setWaterControl(history.present, selection.index, action, { switchReversed: e.target.checked }))} />Reversed</label>
                  <BuilderConnectionList key={id} label={`${title} water`} empty="No switches" items={incomingSources.map(source => ({
                    id: `${source.kind}:${source.index}`, label: `${selectionLabel(source, level)}${source.kind !== 'trigger' && source.kind !== 'float-switch' && source.kind !== 'logic-relay' ? ' · Relay' : ''}`,
                    checked: switchTargets(source.definition).includes(id), onChange: checked => {
                      const ids = switchTargets(source.definition)
                      commit(setSwitchTargets(history.present, source, checked ? [...ids, id] : ids.filter(target => target !== id)))
                    },
                  }))} />
                </fieldset>
              })}
          </>}
        </BuilderInspectorSection>}
        <BuilderInspectorSection title="Transform">
          <div className="builder-dimensions" key={`${selection.kind}:${selection.index}`}>
            {(['x', 'y', 'w', 'h'] as const).filter(axis => axis === 'x' || axis === 'y'
              || axis === 'w' && !digitalCoinSwitch && !verticalCoinSwitch && ['platform', 'prop', 'mechanism', 'text', 'trigger', 'gravity-plate', 'force-field'].includes(selection.kind)
              || axis === 'h' && (verticalCoinSwitch || ['platform', 'mechanism', 'text', 'rope', 'ladder', 'gravity-plate', 'force-field'].includes(selection.kind))).map(axis => {
              const fixed = !!mechanism && (mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? axis === 'w' : axis === 'h') || !!forceField && (forceField.orientation === 'vertical' ? axis === 'w' : axis === 'h')
              const label = axis === 'w' && selection.kind === 'prop' ? 'Size' : fixed ? 'Thickness' : axis === 'h' && selection.kind === 'rope' ? 'Length'
                : ({ x: light || wallLight || logicRelay || floatSwitch ? 'X' : bounds.w ? 'Left' : 'X', y: light || wallLight || logicRelay || floatSwitch ? 'Y' : bounds.h ? 'Top' : 'Y', w: 'Width', h: 'Height' })[axis]
              return <label key={axis}>{label}<NumberField label={`Object ${axis}`} disabled={fixed} step={snap ? gridSize : 1}
                value={axis === 'y' ? roomHeight - (light?.y ?? wallLight?.y ?? logicRelay?.y ?? floatSwitch?.y ?? bounds.y) : axis === 'x' ? light?.x ?? wallLight?.x ?? logicRelay?.x ?? floatSwitch?.x ?? bounds.x : bounds[axis]} {...numberEdit((base, value) => setDimension(base, axis, value))} /></label>
            })}
          </div>
          {trigger && trigger.mode !== 'coins' && <>
            <BuilderSelect label="Mount" accessibleLabel="Pressure plate mount" value={trigger.mount?.mechanism ?? 'none'}
              options={[{ value: 'none', label: 'None' }, ...(level.mechanisms ?? []).flatMap((m, index) => m.kind === 'lift' && m.w >= trigger.w
                ? [{ value: m.id, label: selectionLabel({ kind: 'mechanism', index }, level) }] : [])]}
              onChange={value => commit(setPressurePlateMount(history.present, selection.index, value === 'none' ? null : value))} />
          </>}
          {facingPlate && <button className="builder-property-action" title={gravityPlate ? 'Mirror the plate for a ceiling; gravity strength stays unchanged' : 'Mirror the pressure plate for a ceiling'} aria-pressed={!!facingPlate.ceiling}
            onClick={() => commit(setPlateCeiling(history.present, selection, !facingPlate.ceiling))}>Flip vertically</button>}
          {selection.kind === 'goal' && level.goal && <button className="builder-property-action" title="Mirror the exit and indicator around its saved origin" aria-pressed={!!level.goal.flipX} onClick={() => {
            const next = copyLevel(history.present)
            if (next.goal) { if (next.goal.flipX) delete next.goal.flipX; else next.goal.flipX = true }
            commit(next)
          }}>Flip horizontally</button>}
          {mechanism?.orientation === 'horizontal' && <button className="builder-property-action" title={mechanism.kind === 'lift' ? 'Reverse the platform’s travel direction' : 'Reverse the gate’s opening direction'} aria-pressed={!!mechanism.flipX} onClick={() => {
            const next = copyLevel(level), m = next.mechanisms![selection.index]
            if (m.flipX) delete m.flipX; else m.flipX = true
            commit(next)
          }}>Flip horizontally</button>}
          {selection.kind === 'rope' && <div className="builder-anchor"><span>{level.climbables.ropes[selection.index].anchor ? `Anchored to ${selectionLabel({ kind: 'platform', index: level.climbables.ropes[selection.index].anchor!.platform }, level)}` : 'Free anchor'}</span><button className="builder-property-action" title="Attach the rope anchor to nearby terrain, or detach it" onClick={() => {
            const next = copyLevel(history.present), r = next.climbables.ropes[selection.index]
            if (r.anchor) { delete r.anchor; commit(next) } else commit(anchorRope(next, selection.index))
          }}>{level.climbables.ropes[selection.index].anchor ? 'Detach anchor' : 'Anchor to nearby terrain'}</button></div>}
          {canPlaceOnSurface(selection, level) && <div className="builder-surface-placement">
            <button disabled={!support || Math.abs(support.delta) < .1} title={facingPlate?.ceiling ? 'Place on the next ceiling surface · End' : 'Place on the next surface below · End'} onClick={() => commit(placeOnSurface(history.present, selection))}>Place on surface <span aria-hidden="true">{facingPlate?.ceiling ? '↑' : '↓'}</span></button>
            <span className={support && Math.abs(support.delta) < .1 ? 'is-supported' : ''}>{support ? Math.abs(support.delta) < .1 ? 'On surface'
              : facingPlate?.ceiling ? support.delta < 0 ? `${Math.round(-support.delta)} below ceiling` : 'Overlaps ceiling'
                : support.delta > 0 ? `${Math.round(support.delta)} above surface` : 'Overlaps surface'
              : facingPlate?.ceiling ? 'No clear ceiling above' : 'No clear surface below'}</span>
          </div>}
          {chosen && <div className="builder-action-row"><button title="Activate Node to add or move terrain points (N)" aria-pressed={tool === 'node'} onClick={() => { setTool('node'); setMessage('') }}>Add node</button><button title="Remove the selected terrain node; at least three must remain" disabled={selectedNode === null || terrainNodes(chosen).length <= 3} onClick={removeNode}>Delete node</button></div>}
          {chosen && selectedNode !== null && <>
            <BuilderSelect label="Bézier handles" accessibleLabel="Bézier handles" value={chosen.bezier?.[selectedNode] ? chosen.bezier[selectedNode]?.mode ?? 'corner' : 'straight'}
              options={[{ value: 'straight', label: 'Straight · no handles' }, { value: 'corner', label: 'Corner · independent handles' }, { value: 'smooth', label: 'Smooth · aligned handles' }, { value: 'symmetric', label: 'Symmetric · equal handles' }]}
              onChange={value => {
                try { commit(setTerrainNodeMode(history.present, selection.index, selectedNode, value as 'straight' | 'corner' | 'smooth' | 'symmetric')) }
                catch (error) { setMessage((error as Error).message) }
              }} />
          </>}
        </BuilderInspectorSection>
        {Boolean(chosen || light || wallText) && <BuilderInspectorSection title="Appearance">
          {chosen && <TerrainMaterialPicker label="Terrain material" value={chosen.material} onChange={material => {
            const next = copyLevel(history.present); next.platforms[selection.index].material = material; commit(next)
          }} />}
          {chosen && <fieldset className="builder-terrain-order">
            <legend>Draw order ({terrainPosition + 1} of {level.platforms.length})</legend>
            <div className="builder-action-row">
              <button disabled={terrainPosition === 0} title="Draw behind all other terrain" onClick={() => commit(reorderTerrain(history.present, selection.index, 'back'))}>Send to back</button>
              <button disabled={terrainPosition === 0} title="Move back one terrain layer" onClick={() => commit(reorderTerrain(history.present, selection.index, 'backward'))}>Backward</button>
              <button disabled={terrainPosition === level.platforms.length - 1} title="Move forward one terrain layer" onClick={() => commit(reorderTerrain(history.present, selection.index, 'forward'))}>Forward</button>
              <button disabled={terrainPosition === level.platforms.length - 1} title="Draw above all other terrain" onClick={() => commit(reorderTerrain(history.present, selection.index, 'front'))}>Bring to front</button>
            </div>
          </fieldset>}
          {light && <>
            <div className="builder-dimensions">
              <label>Direction (°)<NumberField label="Light direction" value={light.direction} min={-180} max={180} step={5} {...numberEdit((base, value) => changedObject(base, 'direction', value))} /></label>
              <label>Spread (°)<NumberField label="Light spread" value={light.spread} min={20} max={160} step={5} {...numberEdit((base, value) => changedObject(base, 'spread', value))} /></label>
            </div>
            <label className="builder-headlight" title="Irregular dimming and brief dropouts, like a malfunctioning lamp"><input type="checkbox" checked={!!light.flicker} onChange={event => commit(editLight(history.present, selection.index, { flicker: event.target.checked }))} />Flicker</label>
          </>}
          {light?.power === 'switched' &&
            <button title="Hold to preview this light without changing its power connections" aria-pressed={previewLight === light.id}
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPreviewLight(light.id) }} onPointerUp={() => setPreviewLight(null)} onPointerCancel={() => setPreviewLight(null)} onBlur={() => setPreviewLight(null)}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPreviewLight(light.id) } }} onKeyUp={() => setPreviewLight(null)}>Hold to preview</button>}
          {wallText && <>
            {wallText.style !== 'lab-stamp' && <label>Text<textarea aria-label="Wall text content" rows={4} maxLength={1000} value={wallText.text} onChange={e => changeObject('text', e.target.value)} /></label>}
            <div className="builder-dimensions">
              <BuilderSelect label="Style" accessibleLabel="Text style" title="Official lettering, graffiti, a message screen, or the L.A.B. wall stamp" value={wallText.style ?? 'official'} options={[{ value: 'official', label: 'Official' }, { value: 'graffiti', label: 'Graffiti' }, { value: 'terminal', label: 'Message screen' }, { value: 'lab-stamp', label: 'L.A.B. stamp' }]} onChange={value => changeObject('style', value)} />
              <label>Rotation (°)<NumberField label="Text rotation" min={-180} max={180} step={5} value={wallText.rotation ?? 0} {...numberEdit((base, value) => changedObject(base, 'rotation', value))} /></label>
              {wallText.style !== 'lab-stamp' && <><label>Font size<NumberField label="Text font size" min={12} max={96} step={2} value={wallText.fontSize} {...numberEdit((base, value) => changedObject(base, 'fontSize', value))} /></label>
              <BuilderSelect label="Alignment" accessibleLabel="Text alignment" value={wallText.align} options={['left', 'center', 'right'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={value => changeObject('align', value)} /></>}
            </div>
          </>}
        </BuilderInspectorSection>}
        {Boolean(selectedSource || terminalPosition) && <BuilderInspectorSection title="Wall wiring" open={false} reveal={terminalFocus !== null}>
          {selectedSource && <fieldset className="builder-connections"><legend>Back-wall wiring</legend>
            <label><input type="checkbox" checked={!!selectedSource.definition.showWires} onChange={e => commit(setWallWiring(history.present, selection, e.target.checked))} />Show wall wiring</label>
            {selectedSource.definition.showWires && <label>Wire height<NumberField label="Wire height" min={0} max={levelHeight(level)} step={snap ? gridSize : 1}
              value={selectedSource.definition.wireHeight ?? DEFAULT_WIRE_HEIGHT} {...numberEdit((base, value) => setWallWiring(base, selection, true, value))} /></label>}
          </fieldset>}
          {terminalPosition && <fieldset className="builder-connections"><legend>Wall terminal</legend>
            <div className="builder-dimensions">
              <label>X<NumberField label="Wire terminal X" min={4} max={level.width - 4} step={snap ? gridSize : 1} value={terminalPosition.x}
                {...numberEdit((base, value) => setWallTerminal(base, selection, { x: value, y: terminalPosition.y }))} /></label>
              <label>Y<NumberField label="Wire terminal Y" min={4} max={roomHeight - 4} step={snap ? gridSize : 1} value={roomHeight - terminalPosition.y}
                {...numberEdit((base, value) => setWallTerminal(base, selection, { x: terminalPosition.x, y: levelHeight(base) - value }))} /></label>
            </div>
            <button disabled={!customTerminal} onClick={() => { commit(setWallTerminal(history.present, selection, null)); setTerminalFocus(null) }}>Reset terminal position</button>
          </fieldset>}
        </BuilderInspectorSection>}
        {Boolean(floatSwitch || prop || chosen && selectedNode !== null || forceField || gravityPlate || wallText?.style === 'terminal' || wallText?.style === 'lab-stamp' || trigger || selectedSource || terminalPosition || robot?.kind === 'repulsor' || logicRelay) && <BuilderInspectorSection title="Object help" open={false}>
          {floatSwitch && <>
            <p className="builder-hint">Water and gravity lifts raise the ball. Gravity and physical loads lower it. The switch changes near the arm's horizontal position.</p>
          </>}
          {prop && <>
            <p className="builder-hint">Normal floats half submerged. Heavy is harder to push and sinks.</p>
          </>}
          {chosen && selectedNode !== null && <>
            <p className="builder-hint">Drag the blue handles to curve adjoining edges. Alt bypasses Snap. Adding a node on a curve preserves its shape.</p>
          </>}
          {forceField && <>
            <p className="builder-hint">{forceField.mode === 'objects'
              ? 'Blocks boxes, balls, shovebots, ropes and moving mechanisms. The player and light pass through. Activation waits for overlapping objects to clear.'
              : 'Blocks the player from either side. Objects and ropes pass through. Activation waits for the player to clear.'}</p>
          </>}
          {gravityPlate && <>
            {gravityPlate.effect === 'water' && <p className="builder-hint">The rectangle is the reservoir at 100%. Terrain stays solid inside it. Fill raises the waterline; Drain lowers it to the low water mark. Initial level stays at or above that mark. Both on holds the level. Pumps pause during EMP.</p>}
            <p className="builder-hint">{gravityPlate.effect === 'water'
              ? 'Objects float or sink according to their weight. Up and Down swim; Jump at the surface helps you get out.'
              : `Negative lifts; zero removes gravity; positive pulls down. The rectangle ${gravityPlate.ceiling ? 'below' : 'above'} the plate is the field. Flipping leaves gravity strength unchanged.`}</p>
          </>}
          {gravityPlate?.effect === 'water' && <>
              <p className="builder-hint">For one toggle: connect it to Fill and Drain, and reverse Drain. On fills, off drains. With two switches, connect each to its own action.</p>
          </>}
          {wallText && <>
            {wallText.style === 'terminal' && <p className="builder-hint">A static message in green phosphor lettering. The screen stays readable in the dark.</p>}
            {wallText.style === 'lab-stamp' && <p className="builder-hint">Resize the stamp with Width and Height. The logo keeps its proportions and has no collision.</p>}
          </>}
          {trigger?.mode === 'coins' && <>
            <p className="builder-hint">All coins in the level count toward this switch. Once full, it stays active until restart.</p>
          </>}
          {trigger && trigger.mode !== 'coins' && <>
            <p className="builder-hint">{trigger.behavior === 'switch' ? `The first press switches ${trigger.startsOn ? 'off' : 'on'} until restart.`
              : trigger.behavior === 'toggle' ? 'Each press reverses the state. Release before pressing again.' : 'On while held down; off when released.'}</p>
          </>}
          {trigger && trigger.mode !== 'coins' && <>
            {trigger.mount && <p className="builder-hint">Travels with its platform. Slide it along the {trigger.ceiling ? 'underside' : 'top'} to reposition, or move it away to detach.</p>}
          </>}
          {selectedSource && <>
            <p className="builder-hint">Draws quiet conduit to this switch's connected items. Height is above the floor. Appearance only.</p>
          </>}
          {terminalPosition && <>
            <p className="builder-hint">{customTerminal ? 'Custom position, shared by this item’s wires.' : 'Automatic position.'} Drag a wall jack to move it. Hold Alt to ignore the grid.</p>
          </>}
          {selectedSource && <>
            {selectedSource.kind !== 'trigger' && selectedSource.kind !== 'float-switch' && <p className="builder-hint">Sends this item's resulting on/off state, including Logic and Reversed.{selectedSource.kind !== 'logic-relay' && ' Turning Relay off clears these outputs.'}</p>}
          </>}
          {robot?.kind === 'repulsor' && <p className="builder-hint">{robot.chargingBay ? 'Wakes in its charging bay when it sees, hears or touches a rival.' : 'Enters through the shown portal. Give its full 40 × 80 opening a flat sill and clear space. Unsupported starts remain static until you fix their placement.'} Hunts across the level once alerted. Large forearms charge and fire from the palms. Sight and cover govern its shots.</p>}
          {logicRelay && <p className="builder-hint">Visible only in the studio. Sends its result to connected items, with no physical behavior during play.</p>}
        </BuilderInspectorSection>}
        <div className="builder-object-actions"><button title="Duplicate this object (Ctrl/⌘ + D)" disabled={['entrance', 'goal'].includes(selection.kind)} onClick={duplicate}>Duplicate</button><button className="builder-delete" aria-label="Delete object" title="Delete this object" disabled={['entrance', 'goal'].includes(selection.kind)} onClick={remove}>Delete</button></div>
      </div> : <p className="builder-inspector-empty">Select an object on the canvas to edit it.</p>}
      </div>
      <div id="builder-inspector-panel-level" role="tabpanel" aria-labelledby="builder-inspector-tab-level" hidden={inspectorTab !== 'level'}>
      <div className="builder-level-settings">
        <label>Level name<input aria-label="Level name" title="The name shown in the level picker" maxLength={80} value={level.name} onChange={e => { if (suggestFileName.current) setFileName(levelFileName(e.target.value, levels.entries.map(file => file.fileName))); commit({ ...history.present, name: e.target.value }) }} /></label>
        <label>File name<input aria-label="Level file name" placeholder={levelFileName(level.name)} title="Created on first save. Changing a saved filename renames that file on the next save." spellCheck={false} value={fileName} onChange={e => { suggestFileName.current = !e.target.value; setFileName(e.target.value) }} /></label>
        <p className="builder-save-location">Built-in levels · Saved in this checkout</p>
        <BuilderInspectorSection title="World">
          <div className="builder-dimensions"><label>Level width<NumberField label="Level width" step={100} value={level.width} min={800} max={20000} {...numberEdit((base, value) => {
            const extent = Math.ceil(Math.max(800, base.entrance.x + 40, ...(base.robots ?? []).map(robot => robot.right + ROBOT_HALF_WIDTH), ...wallWiringItems(base).flatMap(item => item.definition.wireTerminal ? [item.definition.wireTerminal.x + 4] : []), ...allSelections(base).map(s => { const b = itemBounds(base, s)!; return b.x + b.w })))
            return { ...base, width: clamp(value, extent, 20000) }
          })} /></label>
          <label>Level height<NumberField label="Level height" step={100} value={levelHeight(level)} min={400} max={6000} {...numberEdit(resizeLevelHeight, true)} /></label></div>
          <div className="builder-lighting-settings" role="group" aria-label="Level lighting">
            <div className="builder-lighting-heading"><span>Lighting</span><label className="builder-night-mode" title="Use spotlights against the game's dark background"><input type="checkbox" checked={nightModeEnabled(level.lighting)} onChange={e => commit(setLevelNightMode(history.present, e.target.checked))} />Night mode</label></div>
          </div>
          <TerrainMaterialPicker label="Floor material" value={level.floorMaterial} onChange={floorMaterial => commit({ ...history.present, floorMaterial })} />
        </BuilderInspectorSection>
        {isPuzzleLevel(level) && <BuilderInspectorSection title="Timing">
          {isPuzzleLevel(level) && <label><input type="checkbox" checked={level.timing === 'untimed'} onChange={e => {
            const next = copyLevel(history.present)
            if (e.target.checked) next.timing = 'untimed'; else delete next.timing
            commit(next)
          }} />Untimed level</label>}
          {isPuzzleLevel(level) && level.timing !== 'untimed' && <fieldset className="builder-grades"><legend>Grade times (seconds)</legend><div className="builder-grade-inputs">{GRADE_TARGETS.map((grade, index) => {
            const times = gradeTimes(level)
            const min = index === 0 ? 1 : Math.floor(times[GRADE_TARGETS[index - 1]]) + 1
            const max = index === 3 ? 7200 : Math.min(3600, Math.ceil(times[GRADE_TARGETS[index + 1]]) - 1)
            return <label key={grade}>{grade.toUpperCase()}<NumberField label={`${grade.toUpperCase()} time`} min={min} max={max} step={1} value={times[grade]} {...numberEdit((base, value) => ({ ...base, times: { ...gradeTimes({ times: base.times! }), [grade]: value } }))} /></label>
          })}</div></fieldset>}
        </BuilderInspectorSection>}
      </div>
      </div>
      {problems.length > 0 && <div className="builder-validation"><strong>Before you play</strong>{problems.map(issue => <p key={issue} role="alert">{issue}</p>)}</div>}
    </aside>
    <footer className="builder-status"><span className="builder-status-copy" role="status" aria-label="Builder status">
      <span>{saving ? 'Saving…' : dirty || !fileSource.text ? 'Unsaved changes' : 'Built-in level'}</span>
      {(lightingGeometry.error || message) && <span className="builder-status-message">{lightingGeometry.error || message}</span>}
    </span>{controllerConnected && <span className="builder-controller-hint">Y / △: Canvas ↔ controls · A / ×: Select / edit / drag · B / ○: Cancel · Help: Controller</span>}<span><output aria-label="Cursor coordinates">{pointer ? `${Math.round(pointer.x)}, ${Math.round(roomHeight - pointer.y)}` : '—'}</output></span></footer>
    {active && helpOpen && <BuilderHelp tools={TOOLS} onClose={() => setHelpOpen(false)} />}
    {active && libraryOpen && <BuilderLibrary levels={levels} level={level} dirty={dirty} saving={saving}
      message={message} onSave={() => save(false, false)} onChoose={chooseLibraryItem} onClose={() => setLibraryOpen(false)} />}
    {active && saveFailure && <SaveFailureDialog {...saveFailure} onClose={() => setSaveFailure(null)} />}
    {active && textEntry && <BuilderTextEntry input={textEntry} onClose={() => setTextEntry(null)} />}
  </section>
}
