import { ROBOT_HALF_WIDTH } from './robotPhysics.ts'
import { MAX_LEVEL_WIDTH } from './levelLimits'
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
import { anchorRope, moveRopeAnchor, setRopeBreakaway, setRopeRelease, setRopeTied, renameItem, addItem, allSelections, clamp, hitItems, itemBounds, itemOutline, itemHandle, moveItem, resizeItem, resizeLevelHeight, setElevatorTravel, editFloatSwitch, editLevelGauge, setCoinThreshold, setCoinSwitchOrientation, setCoinSwitchDisplay, reorderTerrain } from './editor'
import type { ResizeHandle, Selection, Tool, TerrainTransform } from './editor'
import { isTwoMarkGauge, levelGaugeAnchor } from './levelGauge'
import { setLoosePanel, setPipe, setWallStripes } from './editor'
import { PANEL_CONTENTS, PANEL_HANGS, loosePanelRect } from './wallLoosePanels'
import type { PanelContents, PanelHang } from './wallLoosePanels'
import { moveTerrainHandle, setTerrainNodeMode, setFinish, setHubDoorDestination, setExitDestination, setDoorReturn, setDoorDispatch, setBulkheadArrival, setLevelType, setWallDoor, hubDoorAt, editGradeGate } from './editor'
import { GRADE_LETTERS, drawGradeGate } from './hub'
import type { GradeLetter } from './hub'
import { WALL_DOOR_CONDITIONS, WALL_DOOR_LABELS } from './wallDoor'
import type { WallDoorCondition } from './wallDoor'
import { copyLevel, isHubLevel, isPuzzleLevel, isRunLevel, levelPlayer, levelProblems, levelHeight, parseLevel, prepareLevelRopes, LEVEL_GRID_SIZE } from './level'
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
import { defaultObjectLabel, itemName, objectLabel } from './objectLabels'
import type { DoorName } from './objectLabels'
import { facilityDoorName, resolveCampaign, studioPresentation } from './facility'
import { loadCampaign } from './campaign'
import type { CampaignFile } from './campaign'
import { TerrainMaterialPicker } from './TerrainMaterialPicker'
import { BuilderIcon } from './BuilderIcon'
import { LevelThumbnail } from './LevelThumbnail'
import { EnvironmentFields } from './EnvironmentFields'
import { drawBackWallOutline, reorderBackWall, setBackWallKind } from './backWallEditing'
import { usesRegionLighting } from './environment'
import { setLightingLayout } from './environmentEditor'
import { shapePoints, shapeNodeTarget, shapeVertexTarget, insertShapeNode, moveShapeVertex, deleteShapeNode } from './editorShape'
import { pointInside } from './geometry'
import { BuilderLibrary } from './BuilderLibrary'
import { SaveFailureDialog } from './LevelFileActions'
import { BuilderHelp } from './BuilderHelp'
import type { LibraryChoice } from './BuilderLibrary'
import { isHorizontalGate, mechanismAnchor, mechanismOpenPosition, mechanismRopeEnd } from './mechanisms'
import { LightingRenderer, lightingPixelRatio } from './lightingRender'
import { playgroundLightingWorld } from './lightingModel'
import { editLight, lightHandles, setLevelNightMode } from './lightingEditor'
import { GROUND_COVERS, terrainGroundCover } from './terrainGroundCover'
import { TERRAIN_TRIMS } from './hazardStripes'
import type { TerrainTrim } from './hazardStripes'
import { PIPE_SIZES } from './wallPipes'
import type { PipeSize } from './wallPipes'
import type { GroundCover } from './terrainGroundCover'
import { switchedItems, switchSources, switchTargets, switchItemLabel, wallWiringItems } from './switchPower'
import { waterControlId } from './waterLevel'
import { drawLogicRelay } from './logicRelay'
import { setObjectPower, setObjectSwitchLogic, setObjectSwitchReversed, setObjectRelay, setSwitchTargets, setPlateBehavior, setPressurePlateMount, flipWallPlate, setGravityPlateFacing, setPlateCeiling, setGravityPlateEffect, setWaterControl } from './editor'
import { useLightingGeometry } from './useLightingGeometry'
import { useBuilderController } from './useBuilderController'
import { BuilderTextEntry } from './BuilderTextEntry'
import { drawPlacementPreview, placementPreview } from './builderPlacement'
import { BUILDER_GRID_SIZE } from './builderSnap'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ClipboardPasteIcon, CopyIcon, HelpCircleIcon, LibraryIcon, MinusIcon, PlayIcon, PlusIcon, Redo2Icon, ScissorsIcon, Undo2Icon } from 'lucide-react'
import { CheckField, Field, InspectorButton } from './StudioFields'
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
  const terrain = selection.kind === 'platform' ? level.platforms[selection.index] : selection.kind === 'back-wall' ? level.environment?.walls[selection.index] : null
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
    // A tied rope has a handle on each anchor; a hanging rope's tip sets its length.
    const tied = level.climbables.ropes[selection.index]
    if (tied?.end) return [{ x: tied.x, y: tied.y, corner: 'top' }, { x: tied.end.x, y: tied.end.y, corner: 'bottom' }]
    const point = itemHandle(level, selection)
    return point ? [{ ...point, y: point.y + 8 / zoom, corner: 'bottom' }] : []
  }
  const corners: ResizeHandle[] = selection.kind === 'ladder' ? ['top', 'bottom']
    : field ? field.orientation === 'vertical' ? ['top', 'bottom'] : ['left', 'right']
    : mechanism ? mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? ['top', 'bottom'] : ['left', 'right']
    : trigger?.mode === 'coins' && trigger.display === 'digital' ? []
    : trigger ? trigger.mode === 'coins' ? trigger.orientation === 'vertical' ? ['top', 'bottom'] : ['left', 'right'] : trigger.facing ? ['top', 'bottom'] : ['left', 'right']
    : selection.kind === 'gravity-plate' ? ['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right']
    : ['prop', 'text', 'evaluation-board', 'wall-stripes'].includes(selection.kind) ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []
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
  { id: 'back-wall', group: 'Scenery', label: 'Back wall', help: 'Draw a background region, then choose Day or Night in Object settings. It has no collision. Pointer moves and resizes it; Node reshapes it. Indoor walls and blue sky support the same lighting regions.' },
  { id: 'steps-narrow', group: 'Terrain', label: 'Steps narrow', help: 'Click to place five steps with a stepped underside and a two-square top landing. Each rise and tread is one grid square. Resize, reshape, rotate, or flip after placing.' },
  { id: 'steps-wide', group: 'Terrain', label: 'Steps wide', help: 'Click to place five one-square-thick steps, each three squares wide and offset two squares across and one square up. They form one terrain shape with a stepped underside. Resize, reshape, rotate, or flip after placing.' },
  { id: 'rope', group: 'Movement', label: 'Rope', help: 'Drag down from the anchor. Start near a terrain edge to attach the anchor to it.' },
  { id: 'tied-rope', group: 'Movement', label: 'Tied rope', help: 'Drag from one anchor to the other. An end near a terrain edge attaches to it. The rope sags by its extra Length; drag either anchor to move it alone.' },
  { id: 'ladder', group: 'Movement', label: 'Ladder', help: 'Drag down anywhere to place a ladder. Move it or change its height in the inspector.' },
  { id: 'ball', group: 'Objects', label: 'Ball', help: 'Click for a standard ball, or drag to choose its size. Corner handles resize it.' },
  { id: 'box', group: 'Objects', label: 'Box', help: 'Click for a standard box, or drag to choose its size. Corner handles resize it.' },
  { id: 'branded-box', group: 'Objects', label: 'L.A.B. crate', help: 'Place a crate with the L.A.B. Experiments stencil. It behaves like an ordinary box. Toggle L.A.B. branding in the inspector for either crate style.' },
  { id: 'carried-emp', group: 'Gadgets', label: 'Carried EMP', help: 'E / X picks up or drops. F / RT fires an electric bolt: hit devices stop for five seconds; one-second cooldown. Movement also aims. Red fields drop the tool.' },
  { id: 'repulsor', group: 'Gadgets', label: 'Repulsor rifle', help: 'Pick up with E / X. F / RT fires. Movement also aims in eight directions. Red fields drop carried tools and block pulses.' },
  { id: 'tractor', group: 'Gadgets', label: 'Tractor gun', help: 'Pick up with E / X. F / RT pulls the first loose box, ball, tool or bot back along the beam toward you, at full speed: what you pull hits you. Movement also aims. Red fields drop carried tools and block the beam.' },
  { id: 'pusher', group: 'Objects', label: 'Shovebot', help: 'Click to place a shovebot at the cursor. Snap catches nearby surfaces. Drag either end of its patrol range, or set the limits in the inspector.' },
  { id: 'repulsorbot', group: 'Objects', label: 'Repulsorbot', help: 'Enters through a portal on a flat sill with 40 × 80 clear space. Hunts across the level once it spots you. Runs, jumps, and climbs with the player rig. Cover blocks shots; EMP disables it.' },
  { id: 'lift', group: 'Mechanisms', label: 'Elevator', help: 'Click to place the platform, or drag vertically to set its travel. Select it and drag the upper stop to change travel height. Connect a pressure plate or coin switch to move it.' },
  { id: 'moving-platform', group: 'Mechanisms', label: 'Moving platform', help: 'Click to place, or drag horizontally from the starting position to set travel and direction. Drag the far stop to change travel distance. Flip horizontally reverses direction. Connect a pressure plate or coin switch to move it.' },
  { id: 'gate', group: 'Mechanisms', label: 'Gate', help: 'Click for a standard gate, or drag vertically to choose its height. Drag its top or bottom handle to resize.' },
  { id: 'horizontal-gate', group: 'Mechanisms', label: 'Horizontal gate', help: 'Click or drag horizontally to place a gate. It retracts by its own width. Flip it in the inspector to reverse its direction.' },
  { id: 'force-field', group: 'Mechanisms', label: 'Vertical force field', help: 'Click or drag vertically to place a barrier. Choose Blue to block only the player, or Red to let the player through and block objects. End handles change its length. Always on and Switched both obey EMP.' },
  { id: 'horizontal-force-field', group: 'Mechanisms', label: 'Horizontal force field', help: 'Click or drag horizontally to place a barrier. Blue supports the player; Red supports objects and lets the player through. End handles change its length. Always on and Switched both obey EMP.' },
  { id: 'gravity-plate', group: 'Mechanisms', label: 'Gravity plate', help: 'Click to place a field above a floor plate or below a ceiling plate, or drag its rectangle. Flip vertically changes the emitter edge without changing Gravity: −1 reverses gravity, 0 removes it, 1 is normal. Choose Always on or connect switches to power it. Partially covered bodies blend gravity by area; overlapping fields average their settings. EMP disables the field.' },
  { id: 'vertical-gravity-plate', group: 'Mechanisms', label: 'Vertical gravity plate', help: 'Click beside a wall to stand the emitter on it: the field fills from the click down to the floor and across to the far side. Or drag its rectangle. Like other gravity plates it starts Switched; choose Always on or connect a switch. The field pulls sideways: positive Gravity toward the emitter, negative away. Bodies fall onto the wall and the player walks on it. Flip horizontally moves the emitter to the other edge.' },
  { id: 'water', group: 'Mechanisms', label: 'Water', help: 'Drag a semi-transparent blue rectangle, or click to fill down to the floor. Water is always present. Fixed buoyancy lets bodies settle partly submerged. Up and Down swim; Jump at the surface helps you get out.' },
  { id: 'plate', group: 'Mechanisms', label: 'Pressure plate', help: 'Click to place a pressure plate at the cursor. Snap catches nearby surfaces. Choose Pressure, Switch, or Toggle mode and the items it activates. The player, boxes, and balls can press it.' },
  { id: 'vertical-plate', group: 'Mechanisms', label: 'Vertical pressure plate', help: 'Click beside a wall to put a plate on its face. Contact presses it: a body leaning or braced on it, palms pushing it, or a box or ball held against it. Moving it snaps to the nearest face; Flip horizontally moves it to the other side of its wall.' },
  { id: 'coin-switch', group: 'Mechanisms', label: 'Coin switch', help: 'Mount a numeric coin switch on the back wall. It shows collected coins / coins required. The inspector also supports horizontal or vertical progress bars; reaching Coins required activates its connected mechanisms and spotlights until restart.' },
  { id: 'float-switch', group: 'Mechanisms', label: 'Float switch', help: 'A buoyant ball on a hinged arm. Water or a gravity lift raises it. Choose Raised or Lowered activation and connect its outputs.' },
  { id: 'level-gauge', group: 'Mechanisms', label: 'Level gauge', help: 'Click inside a pool to mount a depth board with its mark at the cursor. It switches exactly when the waterline reaches the mark. Choose At or above, or At or below, and connect its outputs.' },
  { id: 'logic-relay', group: 'Mechanisms', label: 'Logic relay', help: 'Place a studio-only logic node. Combine switches with OR, AND or XOR, optionally reverse the result, then connect its Activates outputs. Invisible during play, with no physical behavior.' },
  { id: 'checkpoint', group: 'Markers', label: 'Checkpoint', help: 'Reset marker for movement playgrounds. Time trials always restart at the beginning.' },
  { id: 'course-door', group: 'Facility', label: 'Level door', help: 'Click to set a door into the back wall on a flat sill, like the entrance. Choose the level it leads to in the inspector. In the facility, Up in the open doorway enters the level, and finishing it returns the robot here. The placard shows the level, its D deadline, then the best time and grade. The door is also a switch, on once its level is passed.' },
  { id: 'bulkhead', group: 'Facility', label: 'Bulkhead', help: 'Click to place a heavy door to another facility area, such as the concourse or a wing. Choose where it leads in the inspector: any facility area in the collection. Arriving through it, the robot steps out of the bulkhead on the far side that leads back here.' },
  { id: 'grade-gate', group: 'Facility', label: 'Grade average', help: 'Place a studio-only node that averages the best grades of level doors in this area. A scores 4, B 3, C 2, D 1, and an F or unplayed level 0. Choose the doors and the grade the average must reach, then connect Activates, such as a switched door. Invisible during play.' },
  { id: 'evaluation-board', group: 'Facility', label: 'Evaluation board', help: 'Click or drag to mount a wall display of the evaluation: total passes, then each wing’s passes or SEALED. Corner handles resize it. It never blocks movement.' },
  { id: 'timer', group: 'Back wall', label: 'Wall timer', help: 'Click to mount a timer on the back wall. Place as many as you need; all show the same run time and never block movement.' },
  { id: 'light', group: 'Back wall', label: 'Spotlight', help: 'Click to place a spotlight on the back wall, or drag to aim it. Drag its center handle to aim and its outer handles to widen the beam. Lights have no range limit. EMP cuts their power.' },
  { id: 'wall-light', group: 'Back wall', label: 'Wall light', help: 'Place the goal-style indicator on the wall, with a circular rim. Connect switches to turn it green. Supports Logic, Reversed and the optional Relay setting.' },
  { id: 'text', group: 'Back wall', label: 'Wall text', help: 'Click or drag a text area onto the back wall. Choose Official or red Graffiti, and edit the text, size, alignment, and rotation in the inspector. Text never blocks movement.' },
  { id: 'message-screen', group: 'Back wall', label: 'Message screen', help: 'Click or drag to mount a small terminal. Edit its message, size, alignment and rotation. Green phosphor lettering stays readable in the dark.' },
  { id: 'wall-door', group: 'Back wall', label: 'Blocked door', help: 'Click to paint a door that never opens onto the back wall, on a flat sill like a real door: sealed, jammed, boarded up or caved in, in a door or bulkhead frame. Choose its look in the inspector. Wall art only, with no collision.' },
  { id: 'pipe', group: 'Back wall', label: 'Pipe', help: 'Drag along the back wall to run a pipe; drag on the slant for one that turns a corner. Drag its round points to reroute it, or use Node to add a bend. Choose Small, Medium or Large in the inspector. Wall art only, with no collision.' },
  { id: 'wall-stripes', group: 'Back wall', label: 'Hazard stripes', help: 'Click or drag to paint a band of worn yellow and black stripes onto the back wall. Corner handles resize it; choose which way the stripes lean in the inspector. Wall art only, with no collision.' },
  { id: 'loose-panel', group: 'Back wall', label: 'Loose panel', help: 'Click a panel of the back wall to work it loose: it hangs from one bolt, showing the pipes and wiring behind it. Drag it, or use the arrow keys, to move it a panel at a time. Choose the bolt it hangs from, what is behind it, and a leak in the inspector. Wall art only, with no collision.' },
  { id: 'lab-stamp', group: 'Back wall', label: 'L.A.B. wall stamp', help: 'Click or drag to stamp the L.A.B. Experiments mark onto the back wall. Resize or rotate it in the inspector. It stays behind terrain and never blocks movement.' },
  { id: 'coin', group: 'Collectibles', label: 'Coin', help: 'Place a slowly spinning gold coin. Touch it to collect it and fill every coin switch in the level. Restarting restores all coins.' },
  { id: 'stopwatch', group: 'Collectibles', label: 'Stopwatch', help: 'Place a stopwatch to collect. Touching it stops the level timer for 10 seconds while gameplay continues. Extra watches extend the pause.' },
  { id: 'time-bonus', group: 'Collectibles', label: 'Time bonus', help: 'Touch to remove time from the clock, down to zero. Set Seconds off from 1 to 9 in the inspector; the number appears inside the arrow.' },
  { id: 'time-penalty', group: 'Collectibles', label: 'Time penalty', help: 'A dark-red clockwise arrow. Touching it adds its number to the clock. Set Seconds added from 1 to 9 in the inspector.' },
  { id: 'fast-stopwatch', group: 'Collectibles', label: 'Fast stopwatch', help: 'A dark-red stopwatch. Touching it makes the clock run twice as fast for 5 seconds. Extra watches extend the effect.' },
  { id: 'emp', group: 'Collectibles', label: 'EMP', help: 'A gold lightning bolt. Cuts power to mechanisms, switches, shovebots, and spotlights for 5 seconds. Ambient light remains. Always-on exits stay open; switched exits follow their inputs.' },
]
/* Title band actions invert on focus, as elsewhere in the game's chrome. */
const chromeButton = 'text-chrome-foreground hover:bg-secondary hover:text-secondary-foreground focus-visible:bg-chrome-foreground focus-visible:text-chrome focus-visible:ring-0'
/* The active tool is the one strong fill in the toolbar and tool rail. */
const toolbarPressed = 'aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground'
/** Level doors and bulkheads go by what the facility shows on them, so the studio reads `doorName`. */
const selectionLabel = (s: Selection, level: JumpLevel, doorName?: DoorName) => objectLabel(level, s, doorName)
const COURSE_EQUIPMENT: readonly Tool[] = ['coin', 'coin-switch', 'timer', 'stopwatch', 'fast-stopwatch', 'time-bonus', 'time-penalty']

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
  // Facility areas name each door by where it leads, and show placards and boards as a new save sees them.
  const levelsById = useMemo(() => new Map(levels.files.map(file => [file.level.id, file.level])), [levels.files])
  const [campaignFile, setCampaignFile] = useState<CampaignFile | null>(null)
  useEffect(() => {
    let active = true
    loadCampaign(import.meta.env.BASE_URL).then(value => { if (active) setCampaignFile(value) }, () => { /* Doors are lettered with where they lead. */ })
    return () => { active = false }
  }, [])
  const doorName = useMemo(() => facilityDoorName(levelsById), [levelsById])
  // The library can sort the collection into the order the facility plays it, when the campaign's start is in it.
  const libraryCampaign = useMemo(() => campaignFile && levelsById.has(campaignFile.start) ? resolveCampaign(campaignFile, levelsById) : null, [campaignFile, levelsById])
  const previewRun = useMemo(() => {
    const run = isRunLevel(level) ? createPreviewRun(level) : null
    // The level being edited stands in for its saved copy, so its own doors, wiring and name count.
    if (run?.hub && isHubLevel(level)) {
      const levels = new Map(levelsById).set(level.id, level)
      Object.assign(run.hub, studioPresentation(level, levels, campaignFile && resolveCampaign(campaignFile, levels)))
    }
    return run
  }, [level, levelsById, campaignFile])
  const previewPlayer = useMemo(() => previewRun?.player ?? levelPlayer(level, true), [level, previewRun])
  const previewTime = useRef(0)
  useEffect(() => { previewTime.current = 0 }, [previewRun])
  const [lightingRenderer] = useState(() => new LightingRenderer())
  useEffect(() => () => lightingRenderer.dispose(), [lightingRenderer])
  useEffect(() => { if (!active) lightingRenderer.release() }, [active, lightingRenderer])
  const [lightingPreview, setLightingPreview] = useState(true)
  const [environmentGrid, setEnvironmentGrid] = useState(true)
  const [previewLight, setPreviewLight] = useState<string | null>(null)
  const roomHeight = levelHeight(level)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false), savePending = useRef(false)
  const [saveFailure, setSaveFailure] = useState<{ fileName: string; reason: string; returnFocus: HTMLElement | null } | null>(null)
  const savePreparation = useRef<AbortController | null>(null)
  useEffect(() => () => savePreparation.current?.abort(), [])
  const [tool, setTool] = useState<Tool>('select'), [selectedItems, setSelectedItems] = useState<Selection[]>([])
  const selection = selectedItems.length === 1 ? selectedItems[0] : null
  const editingWall = selection?.kind === 'back-wall' ? level.environment?.walls[selection.index] : undefined
  const lastClick = useRef<{ point: Point; level: JumpLevel; selection: Selection; additive?: boolean } | null>(null)
  const allTerrain = selectedItems.length > 0 && selectedItems.every(s => s.kind === 'platform' || s.kind === 'back-wall')
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
  const terrainDrag = !!drag && (drag.mode === 'draw' && ['platform', 'back-wall', 'steps-narrow', 'steps-wide'].includes(tool)
    || ['bezier', 'point', 'resize', 'move'].includes(drag.mode)
    && (['platform', 'back-wall'].includes(drag.selection?.kind ?? '') || drag.selections?.some(s => ['platform', 'back-wall'].includes(s.kind))))
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
  // A tied rope's handles move its anchors rather than resizing anything.
  const resizeCursor = selection?.kind === 'rope' && level.climbables.ropes[selection.index]?.end ? 'move' : resizeCorner === 'top' || resizeCorner === 'bottom' ? 'ns-resize' : resizeCorner === 'left' || resizeCorner === 'right' ? 'ew-resize' : resizeCorner === 'top-left' || resizeCorner === 'bottom-right' ? 'nwse-resize' : 'nesw-resize'
  const problems = useMemo(() => levelProblems(level), [level]), problem = problems[0]
  const mechanism = selection?.kind === 'mechanism' ? level.mechanisms?.[selection.index] : null
  const prop = selection?.kind === 'prop' ? level.props?.[selection.index] : null
  const travelHandle = mechanism?.kind === 'lift' ? mechanismAnchor(mechanism) : null
  const travelHandleAt = (p: Point) => travelHandle && Math.hypot(p.x - travelHandle.x, p.y - travelHandle.y) < 10 / view.zoom
  const adjustingTravel = drag?.mode === 'travel' || pointer && travelHandleAt(pointer)
  const trigger = selection?.kind === 'trigger' ? level.triggers?.[selection.index] : null
  const digitalCoinSwitch = trigger?.mode === 'coins' && trigger.display === 'digital'
  const verticalCoinSwitch = trigger?.mode === 'coins' && trigger.orientation === 'vertical'
  // A wall plate's length runs down its face: it is sized by height, like a vertical coin switch.
  const verticalTrigger = verticalCoinSwitch || trigger?.mode !== 'coins' && !!trigger?.facing
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
  const levelGauge = selection?.kind === 'level-gauge' ? level.levelGauges?.[selection.index] : null
  const twoMarkGauge = levelGauge && isTwoMarkGauge(levelGauge) ? levelGauge : null
  const gaugeAnchor = levelGauge ? levelGaugeAnchor(levelGauge) : null
  const logicRelay = selection?.kind === 'logic-relay' ? level.logicRelays?.[selection.index] : null
  const gradeGate = selection?.kind === 'grade-gate' ? level.gradeGates?.[selection.index] : null
  const switchable = (goal && !goal.kind ? goal : null) ?? (mechanism?.kind === 'lift' ? mechanism : null) ?? light ?? (gravityPlate?.effect === 'water' ? null : gravityPlate) ?? forceField
  const objectPower = switchable ? switchable.power ?? (goal || forceField ? 'always' : 'switched') : null
  const targets = switchedItems(level)
  const switchedObject = targets.find(item => !('waterAction' in item) && item.kind === selection?.kind && item.index === selection.index)
  const objectSwitchLogic = switchedObject?.definition.switchLogic ?? 'or'
  const objectSwitchReversed = !!switchedObject?.definition.switchReversed
  const sources = switchSources(level)
  const selectedSource = sources.find(item => item.kind === selection?.kind && item.index === selection.index)
  const shutSource = mechanism?.kind === 'gate' ? sources.find(item => item.kind === 'gate-shut' && item.index === selection?.index) : undefined
  // A gate shows its shut contact's wires with its own wall-wiring settings.
  // Each mark of a two-mark gauge is its own source; both show wires with the gauge's settings.
  const markSources = twoMarkGauge ? sources.filter(item => (item.kind === 'level-gauge-low' || item.kind === 'level-gauge-high') && item.index === selection?.index) : []
  const wiringSource = selectedSource ?? (shutSource?.definition.targets?.length ? shutSource : undefined) ?? markSources[0]
  // Every gate has a shut contact, but it joins other items' Switched by lists only once it is in
  // use, wired from the gate's own Shut contact list; otherwise each gate would clutter every list.
  const incomingSources = sources.filter(item => (item.kind !== selection?.kind || item.index !== selection.index)
    && (item.kind !== 'gate-shut' || !!item.definition.targets?.length))
  // A level door switches on once its level is passed; other physical items send their state as relays.
  const sourceLabel = (source: typeof sources[number]) => source.kind === 'gate-shut' ? `${selectionLabel({ kind: 'mechanism', index: source.index }, level, doorName)} · Shut`
    : source.kind === 'level-gauge-low' || source.kind === 'level-gauge-high' ? `${selectionLabel({ kind: 'level-gauge', index: source.index }, level, doorName)} · ${source.kind === 'level-gauge-low' ? 'Low' : 'High'} mark`
    : `${selectionLabel(source, level, doorName)}${source.kind === 'course-door' ? ' · Passed' : source.kind === 'bulkhead' ? ' · Complete'
    : ['trigger', 'float-switch', 'level-gauge', 'logic-relay', 'grade-gate'].includes(source.kind) ? '' : ' · Relay'}`
  const sourceKey = (source: typeof sources[number]) => `${source.kind}:${source.index}`
  const outgoingTargets = targets.filter(item => item.kind !== selection?.kind || item.index !== selection.index)
  const terminals = useMemo(() => wallTerminals(level), [level])
  const selectedTerminals = useMemo(() => terminals.filter(point => selection && sameSelection(point.owner, selection)), [terminals, selection])
  const customTerminal = selection ? wallWiringItems(level).find(item => sameSelection(item, selection))?.definition.wireTerminal : undefined
  const terminalPosition = customTerminal ?? terminalFocus ?? selectedTerminals[0]
  const hoveredTerminal = tool === 'select' && pointer && terminals.find(point => Math.hypot(pointer.x - point.x, pointer.y - point.y) < 10 / view.zoom)
  const aimHandles = useMemo(() => light ? lightHandles(light, view.zoom) : [], [light, view.zoom])
  const wallText = selection?.kind === 'text' ? level.texts?.[selection.index] : null
  const pickup = selection?.kind === 'pickup' ? level.pickups?.[selection.index] : null
  const hubDoor = selection ? hubDoorAt(level, selection) : undefined
  const wallDoor = selection?.kind === 'wall-door' ? level.wallDoors?.[selection.index] : null
  const pipe = selection?.kind === 'pipe' ? level.pipes?.[selection.index] : null
  const wallBand = selection?.kind === 'wall-stripes' ? level.stripes?.[selection.index] : null
  const loose = selection?.kind === 'loose-panel' ? level.loosePanels?.[selection.index] : null
  // A level door may lead to any course or playground; a bulkhead to any other facility area.
  const doorDestination = hubDoor ? 'course' in hubDoor ? hubDoor.course : hubDoor.to : ''
  const destinationOptions = !hubDoor ? [] : 'course' in hubDoor
    ? [{ value: '', label: 'Choose a level' }, ...levels.files.filter(file => !isHubLevel(file.level) && file.level.id !== level.id).map(file => ({ value: file.level.id, label: file.level.name }))]
    : [{ value: '', label: 'Choose a facility area' }, ...levels.files.filter(file => isHubLevel(file.level) && file.level.id !== level.id).map(file => ({ value: file.level.id, label: file.level.name }))]
  if (hubDoor && !destinationOptions.some(option => option.value === doorDestination)) destinationOptions.push({ value: doorDestination, label: `${doorDestination} (not found)` })
  // A plain exit can lead on when its run passes, into a course at its start or a facility area at
  // one of its doors. A level door can return the robot through another door, and a bulkhead can
  // bring it out of a chosen door in the area beyond. Doors go by where they lead.
  const exitDoor = selection?.kind === 'goal' && level.goal && !level.goal.kind && !isHubLevel(level) ? level.goal : null
  const doorsIn = (area: JumpLevel | undefined, except?: string) => area && isHubLevel(area) ? [...area.courseDoors, ...area.bulkheads].filter(door => door.id !== except)
    .map(door => ({ value: door.id, label: `${doorName(door) ?? 'Unconnected'} ${'course' in door ? 'level door' : 'bulkhead'}` })) : []
  const withMissing = (options: { value: string; label: string }[], value: string) => options.some(option => option.value === value) ? options : [...options, { value, label: `${value} (not found)` }]
  const exitTarget = exitDoor?.leadsTo ? levelsById.get(exitDoor.leadsTo.level) : undefined
  const exitOptions = exitDoor ? withMissing([{ value: '', label: 'Back where the robot came from' },
    ...levels.files.filter(file => file.level.id !== level.id).map(file => ({ value: file.level.id, label: isHubLevel(file.level) ? `${file.level.name} (facility area)` : file.level.name }))], exitDoor.leadsTo?.level ?? '') : []
  const returnDoor = hubDoor && 'course' in hubDoor ? hubDoor : null
  const arrivalBulkhead = hubDoor && !('course' in hubDoor) && hubDoor.to ? hubDoor : null
  const quantize = useCallback((v: number, grid: number) => snap ? Math.round(v / grid) * grid : Math.round(v), [snap])
  const quantizeY = useCallback((y: number, grid: number) => roomHeight - quantize(roomHeight - y, grid), [roomHeight, quantize])
  const hoveredNode = useMemo(() => tool === 'node' && pointer && !drag ? shapeVertexTarget(level, pointer.x, pointer.y, 10 / view.zoom, selection) : null,
    [tool, pointer, drag, level, view.zoom, selection])
  const curveHandles = useMemo(() => {
    if (!chosen || selectedNode === null) return []
    const node = terrainNodes(chosen)[selectedNode], handle = chosen.bezier?.[selectedNode]
    return node ? (['in', 'out'] as const).flatMap(side => {
      const vector = handle?.[side]
      return vector ? [{ side, x: node[0] + vector[0], y: node[1] + vector[1], node }] : []
    }) : []
  }, [chosen, selectedNode])
  const hoveredCurveHandle = pointer && curveHandles.find(h => Math.hypot(pointer.x - h.x, pointer.y - h.y) < 8 / view.zoom)
  const nodeTarget = useMemo(() => tool === 'node' && pointer && !drag && !hoveredNode ? shapeNodeTarget(level, pointer.x, pointer.y, 12 / view.zoom, snap ? gridSize : 0, selection) : null,
    [tool, pointer, drag, hoveredNode, level, view.zoom, snap, gridSize, selection])
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
    if (!selection || selectedNode === null || !shapePoints(level, selection)) return
    try {
      const next = deleteShapeNode(history.present, selection, selectedNode)
      commit(next); setSelectedNode(Math.min(selectedNode, shapePoints(next, selection)!.length - 1))
    } catch (error) { setMessage((error as Error).message) }
  }
  function editBackWall(index: number) {
    chooseSelection({ kind: 'back-wall', index }); setTool('select')
    const wall = level.environment!.walls[index]
    const zoom = clamp(Math.min(size.width / (wall.w + 120), size.height / (wall.h + 120)), .08, 2.5)
    setView({ x: wall.x + wall.w / 2 - size.width / zoom / 2, y: wall.y + wall.h / 2 - size.height / zoom / 2, zoom })
    canvasRef.current?.focus({ preventScroll: true })
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
    const testWithoutSaving = testAfter && !dirty && fileSource.text !== undefined
    if (!levels.canWrite && !testWithoutSaving) {
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
      if (testWithoutSaving) {
        onPlay(copyLevel(next))
        return { fileName, level: next, sourceText: fileSource.text! }
      }
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
      if (level.environment && environmentGrid) {
        const step = LEVEL_GRID_SIZE * 2 ** Math.max(0, Math.ceil(Math.log2(8 / (LEVEL_GRID_SIZE * view.zoom))))
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, level.width, levelHeight(level)); ctx.clip()
        ctx.strokeStyle = '#353f4820'; ctx.lineWidth = 1 / view.zoom; ctx.beginPath()
        for (let x = Math.max(0, Math.floor(view.x / step) * step); x <= Math.min(level.width, view.x + size.width / view.zoom); x += step) { ctx.moveTo(x, view.y); ctx.lineTo(x, view.y + size.height / view.zoom) }
        for (let y = Math.max(0, Math.floor(view.y / step) * step); y <= Math.min(levelHeight(level), view.y + size.height / view.zoom); y += step) { ctx.moveTo(view.x, y); ctx.lineTo(view.x + size.width / view.zoom, y) }
        ctx.stroke(); ctx.restore()
      }
      for (const relay of level.logicRelays ?? []) drawLogicRelay(ctx, relay, !!previewRun?.switchStates.get(relay.id))
      for (const gate of level.gradeGates ?? []) drawGradeGate(ctx, gate, false)
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
      if (editingWall) drawBackWallOutline(ctx, editingWall, selectedNode, view.zoom)
      if (pipe) {
        ctx.strokeStyle = '#c65231'; ctx.lineWidth = 1.5 / view.zoom
        for (const [i, [wx, wy]] of pipe.points.entries()) {
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
  }, [active, level, previewRun, previewPlayer, view, size, outline, selectedItems, selectedTerminals, resizeHandles, chosen, selectedNode, pipe, curveHandles, mechanism, robot, terrainDrag, support, wallText, wallTextFontReady, light, aimHandles, lightingPreview, environmentGrid, previewLight, helpOpen, libraryOpen, lightingGeometry.ready, lightingGeometry.groups, lightingRenderer, editingWall])
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
    if (drag?.mode === 'draw' && tool === 'back-wall' && preview?.environment?.walls.at(-1)) drawBackWallOutline(ctx, preview.environment.walls.at(-1)!, null, view.zoom)
    ctx.setLineDash([])
    if (snap && !pointer?.free && !marquee && tool === 'select') drawLevelCenterGuides(ctx, level, selectedItems, view.zoom)
    if (hoveredNode) {
      ctx.beginPath(); ctx.arc(hoveredNode.x, hoveredNode.y, 6 / view.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#c65231'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
    }
    if (nodeTarget) {
      const points = nodeTarget.kind === 'back-wall' ? shapePoints(level, { kind: 'back-wall', index: nodeTarget.index })! : null
      const [a, b, c, d] = points ? [points[nodeTarget.edge], points[nodeTarget.edge], points[(nodeTarget.edge + 1) % points.length], points[(nodeTarget.edge + 1) % points.length]] : terrainCubic(level.platforms[nodeTarget.index], nodeTarget.edge)
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.bezierCurveTo(b[0], b[1], c[0], c[1], d[0], d[1]); ctx.stroke()
      ctx.beginPath(); ctx.arc(nodeTarget.x, nodeTarget.y, 6 / view.zoom, 0, Math.PI * 2)
      ctx.fillStyle = '#c65231'; ctx.fill(); ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.5 / view.zoom; ctx.stroke()
      const cross = 3 / view.zoom
      ctx.beginPath(); ctx.moveTo(nodeTarget.x - cross, nodeTarget.y); ctx.lineTo(nodeTarget.x + cross, nodeTarget.y)
      ctx.moveTo(nodeTarget.x, nodeTarget.y - cross); ctx.lineTo(nodeTarget.x, nodeTarget.y + cross); ctx.stroke()
    }

  }, [active, size, view, placement, marquee, wallTextFontReady, hoveredNode, nodeTarget, level, selectedItems, snap, pointer?.free, tool, drag?.mode, preview])

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
      const node = shapeVertexTarget(base, p.x, p.y, 10 / view.zoom, selection)
      if (node) {
        const selected = { kind: node.kind, index: node.index }
        chooseSelection(selected); setSelectedNode(node.vertex); setMessage('')
        setDrag({ mode: 'point', start: p, screen, base, view, selection: selected, point: node.vertex })
        return
      }
      const target = shapeNodeTarget(base, p.x, p.y, 12 / view.zoom, snap ? gridSize : 0, selection)
      if (!target) { setMessage('Click a shape edge to add a node, or drag an existing node.'); return }
      try {
        const next = insertShapeNode(base, target), selected = { kind: target.kind, index: target.index }
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
    if (selection && (chosen || editingWall || pipe)) {
      const point = shapePoints(level, selection)!.findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 10 / view.zoom)
      if (point >= 0) { chooseInspectorTab('object'); setSelectedNode(point); setDrag({ mode: 'point', start: p, screen, base, view, selection, point }); return }
    }
    if (selection && editingWall && pointInside(editingWall, p.x, p.y)) {
      const foreground = [...hitItems(level, p.x, p.y, 9 / view.zoom)].find(s => s.kind !== 'back-wall')
      chooseInspectorTab('object'); setDrag({ mode: 'move', start: p, screen, base, view, selection, selections: [selection], cycle: foreground, overlap: !!foreground }); return
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
        : d.selection.kind === 'level-gauge' ? { ...rawBounds, ...levelGaugeAnchor(d.base.levelGauges![d.selection.index]) }
        : d.selection.kind === 'logic-relay' ? { ...rawBounds, ...d.base.logicRelays![d.selection.index] }
        : d.selection.kind === 'grade-gate' ? { ...rawBounds, ...d.base.gradeGates![d.selection.index] } : rawBounds
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
      const tiedRope = d.mode === 'resize' && d.selection.kind === 'rope' ? d.base.climbables.ropes[d.selection.index] : undefined
      if (tiedRope?.end) {
        // Each handle moves its own anchor; the other stays put.
        const which = d.corner === 'top' ? 'start' : 'end', anchor = which === 'start' ? tiedRope : tiedRope.end
        next = moveRopeAnchor(d.base, d.selection.index, which, qx(anchor.x + dx), qy(anchor.y + dy), snap && !event.altKey ? 16 : 0)
      } else if (d.mode === 'resize') {
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
        const point = shapePoints(d.base, d.selection)![d.point!]
        next = d.inserted && Math.hypot(dx, dy) * view.zoom < 3 ? d.base
          : moveShapeVertex(d.base, d.selection, d.point!, qx(point[0] + dx) - point[0], qy(point[1] + dy) - point[1])
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
      : selection.kind === 'float-switch' ? base.floatSwitches?.[selection.index] : selection.kind === 'level-gauge' && base.levelGauges?.[selection.index] ? levelGaugeAnchor(base.levelGauges[selection.index])
      : selection.kind === 'logic-relay' ? base.logicRelays?.[selection.index]
      : selection.kind === 'grade-gate' ? base.gradeGates?.[selection.index] : null
    return axis === 'x' || axis === 'y' ? moveItem(base, selection, axis === 'x' ? value - (light?.x ?? bounds.x) : 0, axis === 'y' ? levelHeight(base) - value - (light?.y ?? bounds.y) : 0)
      : resizeItem(base, selection, axis === 'w' ? value : bounds.w, axis === 'h' ? value : bounds.h)
  }

  function duplicate() {
    try {
      const result = pasteSelections(history.present, copySelections(history.present, selectedItems), 40, 0)
      if (!result.selections.length) { setMessage('Select an object to duplicate. Entrance and exit doors cannot be duplicated.'); return }
      commit(result.level); setSelectedItems(result.selections); setSelectedNode(null); setTerminalFocus(null); chooseInspectorTab('object')
      setMessage(result.selections.length === 1 ? `Created ${selectionLabel(result.selections[0], result.level, doorName)}.` : `Duplicated ${result.selections.length} objects.`)
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
    if (selection.kind === 'level-gauge' && field === 'activeWhen') return editLevelGauge(base, selection.index, { activeWhen: value === 'below' ? 'below' : 'above' })
    if (selection.kind === 'level-gauge' && field === 'marks') return editLevelGauge(base, selection.index, { marks: value === 'two' ? 'two' : 'one' })
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

  return <section ref={builderRef} className="jumping-builder studio-ui" hidden={!active} aria-label="Level builder"
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
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); if (selectedNode !== null && (chosen || editingWall || pipe)) removeNode(); else remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const grid = gridSize, step = event.shiftKey ? 1 : grid
        // A loose panel moves a whole panel at a time.
        if (loose) {
          const p = loosePanelRect(level.wallFinish, loose)
          commit(moveItem(history.present, selection, event.key === 'ArrowLeft' ? -p.w : event.key === 'ArrowRight' ? p.w : 0, event.key === 'ArrowUp' ? -p.h : event.key === 'ArrowDown' ? p.h : 0))
          return
        }
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const node = (chosen || editingWall || pipe) && selectedNode !== null ? shapePoints(level, selection)?.[selectedNode] : null
        const origin = node ? { x: node[0], y: node[1] } : light ?? wallLight ?? logicRelay ?? gradeGate ?? bounds
        const shiftX = snap && !event.shiftKey && origin && dx ? quantize(origin.x + dx, grid) - origin.x : dx
        const shiftY = snap && !event.shiftKey && origin && dy ? quantizeY(origin.y + dy, grid) - origin.y : dy
        commit(node ? moveShapeVertex(history.present, selection, selectedNode!, shiftX, shiftY)
          : moveItem(history.present, selection, shiftX, shiftY))
      }
    }
  }} onKeyUp={event => { if (event.code === 'Space') panHeld.current = false; if (event.key === 'Alt') setPointer(previous => previous && { ...previous, free: false }) }} onBlur={() => { panHeld.current = false }}>
    <header className="builder-header flex min-w-0 items-center gap-4 bg-chrome px-4 py-2 text-chrome-foreground">
      <div className="builder-brand min-w-0"><h1 className="m-0 truncate text-lg leading-tight font-semibold tracking-tight">Level studio</h1></div>
      <div className="builder-main-actions ml-auto flex flex-wrap items-center justify-end gap-1">
        <Button size="sm" className="builder-play bg-chrome-foreground text-chrome hover:bg-accent focus-visible:ring-chrome-foreground/60" title="Test this level; saves any changes first" disabled={!!problem || levels.busy || saving} aria-busy={saving} onClick={() => void save(true)}><PlayIcon aria-hidden="true" className="fill-current" /> Save and Test</Button>
        <Button size="sm" variant="ghost" className={chromeButton} title="Save this level (Ctrl/⌘ + S)" disabled={levels.busy || saving} onClick={() => void save()}>Save level</Button>
        <Button size="sm" variant="ghost" className={chromeButton} aria-haspopup="dialog" title="Level builder help (F1)" onClick={() => setHelpOpen(true)}><HelpCircleIcon aria-hidden="true" />Help</Button>
        <Button size="sm" variant="ghost" className={chromeButton} aria-haspopup="dialog" title="Open the library to create or choose a level" disabled={saving} onClick={() => { setMessage(''); setLibraryOpen(true) }}><LibraryIcon aria-hidden="true" />Library</Button>
        <Button size="sm" variant="ghost" className={cn('builder-back', chromeButton)} title="Return to the game" disabled={saving} onClick={onClose}>Back to game</Button>
      </div>
    </header>
    <div className="builder-view-controls flex min-w-0 items-center gap-3 overflow-x-auto bg-accent px-3 py-1.5" role="group" aria-label="Canvas controls">
      <ButtonGroup className="builder-control-group builder-mode-controls" aria-label="Editing tools">
        {TOOLS.filter(item => item.group === 'Editing').map(item => <Button key={item.id} variant="outline" size="icon-sm" className={toolbarPressed} aria-label={item.label} aria-pressed={tool === item.id} aria-keyshortcuts={item.id === 'select' ? 'V' : 'N'} title={item.id === 'select' ? 'Pointer (V): select, move, and resize objects' : 'Node (N): move terrain nodes or add them along an edge'} onClick={() => { setTool(item.id); setMessage('') }}><BuilderIcon kind={item.id} /></Button>)}
      </ButtonGroup>
      <ButtonGroup className="builder-control-group" aria-label="Terrain transforms">
        {([
          ['rotate-left', 'Rotate left', 'Rotate selected terrain 90° counterclockwise'],
          ['rotate-right', 'Rotate right', 'Rotate selected terrain 90° clockwise'],
          ['flip-horizontal', 'Flip horizontal', 'Mirror selected terrain left to right'],
          ['flip-vertical', 'Flip vertical', 'Mirror selected terrain top to bottom'],
        ] as const).map(([kind, label, title]) => <Button key={kind} variant="outline" size="icon-sm" aria-label={label} title={title} disabled={!allTerrain} onClick={() => transformSelectedTerrain(kind)}><BuilderIcon kind={kind} /></Button>)}
      </ButtonGroup>
      <div className="builder-control-group builder-placement-options flex flex-none items-center gap-3" role="group" aria-label="Placement options">
        <CheckField title={`Snap positions, sizes and nodes to ${gridSize} units, catch nearby surfaces, and align selection centers and bounds to the level center. Hold Alt to bypass.`} className="whitespace-nowrap" checked={snap} onCheckedChange={checked => setSnap(checked)}>Snap</CheckField>
        <BuilderSelect inline label="Grid" accessibleLabel="Snap grid" title="Choose the spacing for snapping and nudges. Hold Alt to bypass snapping."
          value={String(gridSize)} options={[{ value: String(BUILDER_GRID_SIZE), label: '5 units' }, { value: String(LEVEL_GRID_SIZE), label: '20 units' }]}
          onChange={value => setGridSize(Number(value))} />
        <CheckField title="Keep the object tool active after placing an object. Pointer and Node stay active until you switch tools." className="whitespace-nowrap" checked={keepTool} onCheckedChange={checked => setKeepTool(checked)}>Keep placing</CheckField>
      </div>
      <ButtonGroup className="builder-control-group" aria-label="Edit history">
        <Button variant="outline" size="icon-sm" aria-label="Undo" title="Undo the last edit (Ctrl/⌘ + Z)" disabled={!history.past.length} onClick={undo}><Undo2Icon aria-hidden="true" /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Redo" title="Redo the last undone edit (Ctrl/⌘ + Shift + Z)" disabled={!history.future.length} onClick={redo}><Redo2Icon aria-hidden="true" /></Button>
      </ButtonGroup>
      <ButtonGroup className="builder-control-group" aria-label="Clipboard">
        <Button variant="outline" size="icon-sm" aria-label="Cut" title="Cut selected objects (Ctrl/⌘ + X)" disabled={!selectedItems.some(copyableSelection)} onClick={() => { void copyToClipboard(true) }}><ScissorsIcon aria-hidden="true" /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Copy" title="Copy selected objects (Ctrl/⌘ + C)" disabled={!selectedItems.some(copyableSelection)} onClick={() => { void copyToClipboard() }}><CopyIcon aria-hidden="true" /></Button>
        <Button variant="outline" size="icon-sm" aria-label="Paste" title="Paste copied objects (Ctrl/⌘ + V)" onClick={() => { void paste() }}><ClipboardPasteIcon aria-hidden="true" /></Button>
      </ButtonGroup>
      <ButtonGroup className="builder-control-group" aria-label="Object grouping">
        <Button variant="outline" size="sm" title="Group selected objects (Ctrl/⌘ + G)" disabled={selectedItems.length < 2 || !!selectedGroup} onClick={() => group()}>Group</Button>
        <Button variant="outline" size="sm" title="Ungroup selected objects (Ctrl/⌘ + Shift + G)" disabled={!canUngroup} onClick={() => group(true)}>Ungroup</Button>
      </ButtonGroup>
      <ButtonGroup className="builder-control-group builder-zoom-controls ml-auto" aria-label="Canvas zoom">
        <Button variant="outline" size="icon-sm" aria-label="Zoom out" title="Zoom out to see more of the level" onClick={() => zoom(.8)}><MinusIcon aria-hidden="true" /></Button>
        <output aria-label="Zoom" title="Current canvas zoom" className="flex h-7 min-w-14 items-center justify-center border-y border-border bg-background px-1.5 text-xs font-medium tabular-nums">{Math.round(view.zoom * 100)}%</output>
        <Button variant="outline" size="icon-sm" aria-label="Zoom in" title="Zoom in for more precise editing" onClick={() => zoom(1.25)}><PlusIcon aria-hidden="true" /></Button>
      </ButtonGroup>
      <div className="builder-control-group flex flex-none items-center gap-2" role="group" aria-label="Canvas view">
        <CheckField title="Show daylight or night lighting in this view. This does not change the saved level." className="whitespace-nowrap" checked={lightingPreview} onCheckedChange={checked => setLightingPreview(checked)}>Lighting</CheckField>
        <ButtonGroup>
          <Button variant="outline" size="sm" title="Fit the entire level in the canvas" onClick={() => fitLevel()}>Fit level</Button>
          <Button variant="outline" size="sm" title="Center the view near the player's starting position" onClick={() => setView(homeView(level, size.height))}>Find start</Button>
        </ButtonGroup>
      </div>
    </div>
    <aside className="builder-tools" aria-label="Building tools">
        {['Facility', 'Terrain', 'Scenery', 'Movement', 'Objects', 'Gadgets', 'Mechanisms', 'Markers', 'Collectibles', 'Back wall'].map(group => {
          // Facility areas get their doors; timing equipment and checkpoints belong elsewhere.
          const hub = isHubLevel(level)
          const items = TOOLS.filter(item => item.group === group && (item.id !== 'checkpoint' || !isRunLevel(level))
            && (item.group !== 'Facility' || hub) && (!hub || !COURSE_EQUIPMENT.includes(item.id)))
          return items.length ? <div className="builder-tool-group px-3 pt-3 pb-1" key={group}><h2 className="m-0 mb-1.5 text-xs font-semibold text-muted-foreground">{group}</h2>
            <div className="builder-tool-grid grid grid-cols-3 gap-1">{items.map(item => <Button key={item.id} variant="outline" aria-pressed={tool === item.id} title={item.help}
              className={cn('builder-tool h-auto min-h-14 min-w-0 flex-col gap-1 px-0.5 py-1.5 text-[11px] leading-tight font-medium whitespace-normal', toolbarPressed)}
              onClick={() => { setTool(tool === item.id ? 'select' : item.id); setMessage('') }}><BuilderIcon kind={item.id} className="size-5" /><span className="max-w-full hyphens-auto [overflow-wrap:anywhere]">{item.label}</span></Button>)}</div>
          </div> : null
        })}
    </aside>
    <div className="builder-stage" data-placement-at-cursor={placementAtCursor || undefined}>
      <div ref={controllerCursorElement} className="builder-controller-cursor" hidden aria-hidden="true" />
      <canvas ref={placementCanvasRef} className="builder-placement-preview" aria-hidden="true" />
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Level canvas" aria-busy={preparingRopes || !lightingGeometry.ready} style={{ cursor: placementAtCursor ? 'none' : drag?.mode === 'pan' || drag?.mode === 'point' || drag?.mode === 'bezier' || drag?.mode === 'wire-terminal' ? 'grabbing' : hoveredNode || hoveredCurveHandle || hoveredTerminal ? 'grab' : tool === 'select' ? adjustingPatrol ? 'ew-resize' : adjustingTravel ? mechanism?.orientation === 'horizontal' ? 'ew-resize' : 'ns-resize' : resizeCorner ? resizeCursor : 'default' : 'crosshair' }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { setMarquee(null); setDrag(null); setPreview(null); setPointer(null); latestPreview.current = null }} onContextMenu={e => e.preventDefault()}
        onPointerLeave={() => { if (!drag) setPointer(null) }} />
      <Button variant="outline" className="builder-minimap h-auto flex-col items-stretch gap-1 p-1.5 text-xs font-normal shadow-md" aria-label="Fit level overview" title="Click to fit the whole level" onClick={() => fitLevel()}><LevelThumbnail level={terrainDrag ? history.present : level} preview /><span>Overview</span></Button>
    </div>
    <aside className="builder-inspector" aria-label="Inspector" ref={inspectorRef}>
      <div className="builder-inspector-tabs sticky top-0 z-10 bg-background px-4 pt-3 pb-2">
      <div className="grid h-8 grid-cols-2 rounded-lg bg-muted p-[3px]" role="tablist" aria-label="Inspector" onKeyDown={event => {
        const next = event.key === 'Home' ? 'level' : event.key === 'End' ? 'object'
          : null
        if (!next) return
        event.preventDefault(); event.stopPropagation(); chooseInspectorTab(next)
        event.currentTarget.querySelector<HTMLButtonElement>(`#builder-inspector-tab-${next}`)?.focus()
      }}>
        {(['level', 'object'] as const).map(tab => <button key={tab} role="tab" id={`builder-inspector-tab-${tab}`} data-slot="tabs-trigger"
          className="inline-flex items-center justify-center rounded-md border border-transparent px-2 text-sm font-medium text-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-selected:bg-background aria-selected:text-foreground aria-selected:shadow-sm"
          aria-controls={`builder-inspector-panel-${tab}`} aria-selected={inspectorTab === tab} tabIndex={inspectorTab === tab ? 0 : -1}
          title={tab === 'level' ? 'Edit level settings' : 'Inspect the selected object'} onClick={() => chooseInspectorTab(tab)}>{tab === 'level' ? 'Level' : 'Object'}</button>)}
      </div>
      </div>
      <div id="builder-inspector-panel-object" role="tabpanel" aria-labelledby="builder-inspector-tab-object" hidden={inspectorTab !== 'object'}>
      <div className="builder-inspector-heading px-4 pt-1 pb-1">
      <BuilderSelect className="[&>span:first-child]:sr-only" label="Selected object" value={selectedItems.length > 1 ? 'group' : selection ? `${selection.kind}:${selection.index}` : ''}
        options={[{ value: '', label: 'Nothing selected' }, ...(selectedItems.length > 1 ? [{ value: 'group', label: `${selectedItems.length} objects selected` }] : []), ...allSelections(level).map(s => ({ value: `${s.kind}:${s.index}`, label: selectionLabel(s, level, doorName) }))]}
        onChange={value => { if (value === 'group') return; const [kind, index] = value.split(':'); chooseSelection(kind ? { kind: kind as Selection['kind'], index: Number(index) } : null); if (tool !== 'node' || kind && kind !== 'platform' && kind !== 'back-wall') setTool('select') }} />
      </div>
      {selectedItems.length > 1 ? <div className="builder-property-card">
        <h3 className="builder-object-heading">{selectedItems.length} objects selected</h3>
        <p className="builder-hint">{selectedGroup ? 'Saved group. Click a member to select just that object; drag a member to move the group.' : 'Drag any selected object to move the selection. Group keeps these objects together.'} Shift-click adds or removes objects. {allTerrain ? 'Rotate and flip transform the shape group around its center.' : 'Rotate and flip are available when all selected objects are terrain or back walls.'}</p>
        <div className="builder-object-actions">
          <InspectorButton title="Duplicate selected objects (Ctrl/⌘ + D)" disabled={!selectedItems.some(copyableSelection)} onClick={duplicate}>Duplicate</InspectorButton>
          <InspectorButton variant="destructive" className="builder-delete" aria-label="Delete selected objects" disabled={!selectedItems.some(copyableSelection)} onClick={remove}>Delete</InspectorButton>
        </div>
        <ul className="builder-selection-list">{selectedItems.map(s => <li key={`${s.kind}:${s.index}`}>{selectionLabel(s, level, doorName)}</li>)}</ul>
      </div> : selection && bounds ? <div className="builder-property-card">
        <h3 className="builder-object-heading">{selectionLabel(selection, level, doorName)}</h3>
        {/* The facility names a level door or bulkhead by where it leads, so it has no name of its own. */}
        {hubDoor ? <p className="builder-hint">Named in the facility by where it leads.</p>
          : <Field>Name<ObjectNameField key={`${selection.kind}:${selection.index}`} value={itemName(level, selection) ?? ''}
            placeholder={defaultObjectLabel(level, selection)} onCommit={value => commit(renameItem(history.present, selection, value))} /></Field>}
        {Boolean(editingWall || trigger || floatSwitch || levelGauge || prop || forceField || gravityPlate || switchable && objectPower || mechanism?.kind === 'lift' || pickup?.kind === 'time-bonus' || pickup?.kind === 'time-penalty' || selection.kind === 'entrance' || robot || switchedObject || hubDoor || gradeGate || exitDoor) && <BuilderInspectorSection title="Behavior">
          {hubDoor && <BuilderSelect label="Leads to" accessibleLabel={selection.kind === 'bulkhead' ? 'Bulkhead destination' : 'Level door destination'}
            title={selection.kind === 'bulkhead' ? 'The part of the facility this bulkhead opens onto' : 'The level this door opens onto'}
            value={doorDestination} options={destinationOptions} onChange={value => commit(setHubDoorDestination(history.present, selection, value))} />}
          {exitDoor && <BuilderSelect label="Leads to" accessibleLabel="Exit destination"
            title="Where the exit leads when the run passes. An F, or leaving, goes back where the robot came from."
            value={exitDoor.leadsTo?.level ?? ''} options={exitOptions} onChange={value => commit(setExitDestination(history.present, value ? { level: value } : undefined))} />}
          {exitDoor?.leadsTo && exitTarget && isHubLevel(exitTarget) && <BuilderSelect label="Arrives at" accessibleLabel="Exit arrival"
            title="The door or bulkhead the robot steps out of in that facility area" value={exitDoor.leadsTo.arrival ?? ''}
            options={withMissing([{ value: '', label: 'Its entrance' }, ...doorsIn(exitTarget)], exitDoor.leadsTo.arrival ?? '')}
            onChange={value => commit(setExitDestination(history.present, { level: exitDoor.leadsTo!.level, ...(value ? { arrival: value } : {}) }))} />}
          {returnDoor && <BuilderSelect label="Returns through" accessibleLabel="Level door return"
            title="The door or bulkhead in this area the robot comes back out of after the level" value={returnDoor.returnsTo ?? ''}
            options={withMissing([{ value: '', label: 'This door' }, ...doorsIn(level, returnDoor.id)], returnDoor.returnsTo ?? '')}
            onChange={value => commit(setDoorReturn(history.present, selection, value || undefined))} />}
          {arrivalBulkhead && <BuilderSelect label="Arrives at" accessibleLabel="Bulkhead arrival"
            title="The door or bulkhead the robot steps out of in the area beyond" value={arrivalBulkhead.arrivesAt ?? ''}
            options={withMissing([{ value: '', label: 'The bulkhead back here' }, ...doorsIn(levelsById.get(arrivalBulkhead.to))], arrivalBulkhead.arrivesAt ?? '')}
            onChange={value => commit(setBulkheadArrival(history.present, selection, value || undefined))} />}
          {hubDoor && <BuilderSelect label="Power" accessibleLabel={selection.kind === 'bulkhead' ? 'Bulkhead power' : 'Level door power'}
            title="Switched opens the door only while its connected switches are on, as a switched exit does"
            value={hubDoor.power ?? 'always'} options={[{ value: 'always', label: 'Always open' }, { value: 'switched', label: 'Switched' }]}
            onChange={value => commit(setObjectPower(history.present, selection, value === 'switched' ? 'switched' : 'always'))} />}
          {returnDoor && <InspectorButton aria-pressed={!!returnDoor.dispatch}
            title="The facility's way out, to the final course: a blast gate lettered EXIT, released once the evaluation is complete, and not itself part of the evaluation"
            onClick={() => commit(setDoorDispatch(history.present, selection, !returnDoor.dispatch))}>Exit door</InspectorButton>}
          {gradeGate && <>
            <BuilderSelect label="Average" accessibleLabel="Grade average reaches" value={gradeGate.grade}
              options={GRADE_LETTERS.map(letter => ({ value: letter, label: letter === 'a' ? 'A' : `${letter.toUpperCase()} or better` }))}
              onChange={value => commit(editGradeGate(history.present, selection.index, { grade: value as GradeLetter }))} />
            <CheckField checked={!!gradeGate.switchReversed} onCheckedChange={checked => commit(editGradeGate(history.present, selection.index, { switchReversed: checked }))}>Reversed</CheckField>
            <fieldset className="builder-connections"><legend>Averages</legend>
              <BuilderConnectionList key={gradeGate.id} label="Averaged doors" empty="No level doors in this area" items={(level.courseDoors ?? []).map((door, index) => ({
                id: door.id, label: selectionLabel({ kind: 'course-door', index }, level, doorName), checked: gradeGate.doors.includes(door.id),
                onChange: checked => commit(editGradeGate(history.present, selection.index, { doors: checked ? [...gradeGate.doors, door.id] : gradeGate.doors.filter(id => id !== door.id) })),
              }))} />
            </fieldset>
            <p className="builder-hint">{gradeGate.switchReversed ? 'Off' : 'On'} while the average best grade of its doors reaches {gradeGate.grade === 'a' ? 'A' : `${gradeGate.grade.toUpperCase()} or better`}. A scores 4, B 3, C 2, D 1, and an F or unplayed level 0. {gradeGate.switchReversed ? 'On' : 'Off'} otherwise.</p>
          </>}
          {editingWall && <>
            <BuilderSelect label="Region lighting" value={editingWall.lighting ?? 'night'} options={[{ value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }]}
              onChange={lighting => { const next = copyLevel(history.present); next.environment!.walls[selection.index].lighting = lighting as 'day' | 'night'; commit(next) }} />
            {!usesRegionLighting(level) && <><p className="builder-hint">This level currently uses uniform lighting. Enable regions to use this wall’s Day or Night setting.</p>
              <InspectorButton onClick={() => commit(setLightingLayout(history.present, 'regions'))}>Enable regional lighting</InspectorButton></>}
            <p className="builder-hint">Background only: no collision, grip, or cover. The frontmost back wall sets lighting where regions overlap.</p>
          </>}
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
            <Field>Coins required<NumberField label="Coins required" min={1} max={80} step={1} value={trigger.threshold} {...numberEdit((base, value) => setCoinThreshold(base, selection.index, value))} /></Field>
          </>}
          {floatSwitch && <>
            <div className="builder-dimensions">
              <Field>Arm length<NumberField label="Float arm length" min={40} max={400} step={5} value={floatSwitch.armLength} {...numberEdit((base, value) => changedObject(base, 'armLength', value))} /></Field>
              <Field>Ball size<NumberField label="Float ball size" min={20} max={100} step={5} value={floatSwitch.size} {...numberEdit((base, value) => changedObject(base, 'size', value))} /></Field>
            </div>
            <Field>Travel angle (°)<NumberField label="Float travel angle" min={10} max={80} step={5} value={floatSwitch.travelAngle ?? 45} {...numberEdit((base, value) => changedObject(base, 'travelAngle', value))} /></Field>
            <BuilderSelect label="Active when" accessibleLabel="Float activation" value={floatSwitch.activeWhen ?? 'raised'} options={[{ value: 'raised', label: 'Raised' }, { value: 'lowered', label: 'Lowered' }]} onChange={value => changeObject('activeWhen', value)} />
            <BuilderSelect label="Starts" accessibleLabel="Float starting position" value={floatSwitch.startsRaised ? 'raised' : 'lowered'} options={[{ value: 'lowered', label: 'Lowered' }, { value: 'raised', label: 'Raised' }]} onChange={value => changeObject('startsRaised', value === 'raised')} />
            <InspectorButton onClick={() => changeObject('flipX', !floatSwitch.flipX)}>Flip horizontally</InspectorButton>
          </>}
          {levelGauge && <BuilderSelect label="Marks" accessibleLabel="Level gauge marks" value={twoMarkGauge ? 'two' : 'one'}
            title="One mark, read at or above it or at or below it; or a low mark and a high mark, each its own contact"
            options={[{ value: 'one', label: 'One' }, { value: 'two', label: 'Low and high' }]} onChange={value => changeObject('marks', value)} />}
          {levelGauge && !twoMarkGauge && <BuilderSelect label="Active when" accessibleLabel="Level gauge activation" value={levelGauge.activeWhen ?? 'above'}
            options={[{ value: 'above', label: 'At or above mark' }, { value: 'below', label: 'At or below mark' }]} onChange={value => changeObject('activeWhen', value)} />}
          {twoMarkGauge && <div className="builder-dimensions">
            <Field>High mark Y<NumberField label="High mark Y" step={snap ? gridSize : 1} value={roomHeight - twoMarkGauge.high.y}
              {...numberEdit((base, value) => editLevelGauge(base, selection.index, { highY: levelHeight(base) - value }))} /></Field>
            <Field>Low mark Y<NumberField label="Low mark Y" step={snap ? gridSize : 1} value={roomHeight - twoMarkGauge.low.y}
              {...numberEdit((base, value) => editLevelGauge(base, selection.index, { lowY: levelHeight(base) - value }))} /></Field>
          </div>}
          {prop && <>
            <BuilderSelect label="Weight" accessibleLabel="Object weight" value={prop.weight === 'heavy' ? 'heavy' : 'normal'}
              options={[{ value: 'normal', label: 'Normal' }, { value: 'heavy', label: 'Heavy' }]}
              onChange={value => {
                const next = copyLevel(history.present), object = next.props![selection.index]
                if (value === 'heavy') object.weight = value; else delete object.weight
                commit(next)
              }} />
            {prop.kind === 'box' && !prop.gadget && <CheckField checked={!!prop.branded} onCheckedChange={checked => commit(setCrateBranding(history.present, selection.index, checked))}>L.A.B. branding</CheckField>}
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
            {gravityPlate.effect !== 'water' && <Field>Gravity (× normal)<NumberField label="Gravity strength" min={-3} max={3} step={.1} precision={2} value={gravityPlate.gravity}
              {...numberEdit((base, value) => {
                if (!Number.isFinite(value)) return base
                const next = copyLevel(base); next.gravityPlates![selection.index].gravity = clamp(value, -3, 3); return next
              })} /></Field>}
            {gravityPlate.effect === 'water' && <>
              <Field>Initial level (%)<NumberField label="Initial water level" min={gravityPlate.waterMinLevel ?? 0} max={100} step={5} value={gravityPlate.waterLevel ?? 100}
                {...numberEdit((base, value) => {
                  if (!Number.isFinite(value)) return base
                  const next = copyLevel(base), plate = next.gravityPlates![selection.index]
                  plate.waterLevel = clamp(value, plate.waterMinLevel ?? 0, 100); return next
                })} /></Field>
              <Field>Low water mark (%)<NumberField label="Low water mark" min={0} max={100} step={5} value={gravityPlate.waterMinLevel ?? 0}
                {...numberEdit((base, value) => {
                  if (!Number.isFinite(value)) return base
                  const next = copyLevel(base), plate = next.gravityPlates![selection.index]
                  plate.waterMinLevel = clamp(value, 0, 100)
                  if ((plate.waterLevel ?? 100) < plate.waterMinLevel) plate.waterLevel = plate.waterMinLevel
                  return next
                })} /></Field>
              <Field>Fill / drain speed (% per second)<NumberField label="Water level speed" min={.1} max={100} step={1} value={gravityPlate.waterRate ?? 10}
                {...numberEdit((base, value) => {
                  if (!Number.isFinite(value)) return base
                  const next = copyLevel(base); next.gravityPlates![selection.index].waterRate = clamp(value, .1, 100); return next
                })} /></Field>
            </>}
          </>}
          {mechanism?.kind === 'lift' && <Field>{mechanism.orientation === 'horizontal' ? 'Travel distance' : 'Travel height'}<NumberField label={mechanism.orientation === 'horizontal' ? 'Travel distance' : 'Travel height'} min={60} max={1200} step={snap ? gridSize : 1} value={mechanism.travel} {...numberEdit((base, value) => changedObject(base, 'travel', value))} /></Field>}
          {(pickup?.kind === 'time-bonus' || pickup?.kind === 'time-penalty') && <Field>{pickup.kind === 'time-bonus' ? 'Seconds off' : 'Seconds added'}<NumberField label={pickup.kind === 'time-bonus' ? 'Seconds off' : 'Seconds added'} min={1} max={9} step={1} value={pickup.seconds} {...numberEdit((base, value) => setPickupSeconds(base, selection.index, value))} /></Field>}
          {selection.kind === 'entrance' && <BuilderSelect label="Entrance" accessibleLabel="Entrance style" value={level.entrance.kind ?? 'door'}
            options={[{ value: 'door', label: 'Door' }, { value: 'charging-bay', label: 'Charging bay' }]} onChange={value => {
              const next = copyLevel(history.present)
              if (value === 'charging-bay') next.entrance.kind = 'charging-bay'; else delete next.entrance.kind
              commit(next)
            }} />}
          {robot && robot.kind !== 'repulsor' && <BuilderSelect label="Mode" accessibleLabel="Shovebot mode" value={robot.mode ?? 'shove'} options={[{ value: 'shove', label: 'Shove' }, { value: 'emp', label: 'EMP + shove' }]} onChange={value => commit(setShovebotMode(history.present, selection.index, value as 'shove' | 'emp'))} />}
          {robot && robot.kind !== 'repulsor' && <div className="builder-dimensions"><Field>Left limit<NumberField label="Shovebot left limit" min={ROBOT_HALF_WIDTH} max={Math.floor(Math.min(robot.x, robot.right - 50))} step={snap ? gridSize : 1} value={robot.left} {...numberEdit((base, value) => setShovebotLimit(base, selection.index, 'left', value))} /></Field><Field>Right limit<NumberField label="Shovebot right limit" min={Math.ceil(Math.max(robot.x, robot.left + 50))} max={Math.floor(level.width - ROBOT_HALF_WIDTH)} step={snap ? gridSize : 1} value={robot.right} {...numberEdit((base, value) => setShovebotLimit(base, selection.index, 'right', value))} /></Field></div>}
          {robot?.kind === 'repulsor' && <CheckField title="Starts asleep in an installed pod. Sight, sound or contact wakes it before the hunt begins." checked={!!robot.chargingBay} onCheckedChange={checked => {
            const next = copyLevel(history.present)
            if (checked) next.robots![selection.index].chargingBay = true
            else delete next.robots![selection.index].chargingBay
            commit(next)
          }}>Charging bay</CheckField>}
          {robot && <CheckField title="Lights ahead of this bot in night mode" checked={!!robot.headlight} onCheckedChange={checked => commit(setShovebotHeadlight(history.present, selection.index, checked))}>Headlight</CheckField>}
          {switchedObject && <><fieldset className="builder-connections builder-switch-rule"><legend>Switch behavior</legend>
            <BuilderSelect label="Logic" accessibleLabel="Switch logic" value={objectSwitchLogic}
              options={[{ value: 'or', label: 'OR' }, { value: 'and', label: 'AND' }, { value: 'xor', label: 'XOR' }]}
              onChange={value => commit(setObjectSwitchLogic(history.present, selection, value === 'and' ? 'and' : value === 'xor' ? 'xor' : 'or'))} />
            <div className="builder-action-row"><CheckField checked={objectSwitchReversed} onCheckedChange={checked => commit(setObjectSwitchReversed(history.present, selection, checked))}>Reversed</CheckField>
            {!logicRelay && !hubDoor && selection.kind !== 'rope' && <CheckField title="Use this item's resulting on/off state to switch other items" checked={!!switchedObject.definition.relay} onCheckedChange={checked => commit(setObjectRelay(history.present, selection, checked))}>Relay</CheckField>}
            </div>
            <p className="builder-hint">{objectSwitchReversed ? 'Off' : 'On'} when {objectSwitchLogic === 'and' ? 'every connected switch is active'
              : objectSwitchLogic === 'xor' ? 'exactly one connected switch is active' : 'any connected switch is active'}. {objectSwitchReversed ? 'On' : 'Off'} otherwise.</p>
          </fieldset></>}
        </BuilderInspectorSection>}
        {Boolean(switchedObject || selectedSource || gravityPlate?.effect === 'water') && <BuilderInspectorSection title="Connections">
          {switchedObject && <fieldset className="builder-connections"><legend>Switched by</legend>
            <BuilderConnectionList key={switchedObject.id} label="Switched by" empty="No switches" items={incomingSources.map(source => ({
              id: sourceKey(source), label: sourceLabel(source),
              checked: switchTargets(source.definition).includes(switchedObject.id), onChange: checked => {
                const ids = switchTargets(source.definition)
                commit(setSwitchTargets(history.present, source, checked ? [...ids, switchedObject.id] : ids.filter(id => id !== switchedObject.id)))
              },
            }))} />
          </fieldset>}
          {selection.kind === 'course-door' && hubDoor && !!level.gradeGates?.length && <fieldset className="builder-connections"><legend>Grade averages</legend>
            <BuilderConnectionList label="Grade averages" empty="No grade averages" items={level.gradeGates.map((gate, index) => ({
              id: gate.id, label: selectionLabel({ kind: 'grade-gate', index }, level, doorName), checked: gate.doors.includes(hubDoor.id),
              onChange: checked => commit(editGradeGate(history.present, index, { doors: checked ? [...gate.doors, hubDoor.id] : gate.doors.filter(id => id !== hubDoor.id) })),
            }))} />
          </fieldset>}
          {selectedSource && <fieldset className="builder-connections"><legend>Activates</legend>
            <BuilderConnectionList key={`${selection.kind}:${selection.index}`} label="Activates" empty="No switched items" items={outgoingTargets.map(item => ({
              id: item.id, label: switchItemLabel(level, item, doorName), checked: switchTargets(selectedSource.definition).includes(item.id), onChange: checked => {
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
                  <CheckField checked={!!control?.switchReversed} onCheckedChange={checked => commit(setWaterControl(history.present, selection.index, action, { switchReversed: checked }))}>Reversed</CheckField>
                  <BuilderConnectionList key={id} label={`${title} water`} empty="No switches" items={incomingSources.map(source => ({
                    id: sourceKey(source), label: sourceLabel(source),
                    checked: switchTargets(source.definition).includes(id), onChange: checked => {
                      const ids = switchTargets(source.definition)
                      commit(setSwitchTargets(history.present, source, checked ? [...ids, id] : ids.filter(target => target !== id)))
                    },
                  }))} />
                </fieldset>
              })}
          </>}
        </BuilderInspectorSection>}
        {markSources.length > 0 && <BuilderInspectorSection title="Mark connections">
          {markSources.map(source => {
            const name = source.kind === 'level-gauge-low' ? 'Low mark' : 'High mark'
            return <fieldset className="builder-connections" key={source.kind}><legend>{name} activates</legend>
              <BuilderConnectionList key={`${source.kind}:${source.index}`} label={`${name} activates`} empty="No switched items" items={targets.map(item => ({
                id: item.id, label: switchItemLabel(level, item, doorName), checked: switchTargets(source.definition).includes(item.id), onChange: checked => {
                  const ids = switchTargets(source.definition)
                  commit(setSwitchTargets(history.present, source, checked ? [...ids, item.id] : ids.filter(id => id !== item.id)))
                },
              }))} />
            </fieldset>
          })}
        </BuilderInspectorSection>}
        {shutSource && <BuilderInspectorSection title="Shut contact">
          <p className="builder-hint">On while the gate sits fully closed and powered. Closing, a safety hold or an obstruction keeps it off; EMP turns it off. It may feed logic that commands this gate.</p>
          <fieldset className="builder-connections"><legend>Shut contact activates</legend>
            <BuilderConnectionList key={`gate-shut:${shutSource.index}`} label="Shut contact activates" empty="No switched items" items={targets.map(item => ({
              id: item.id, label: switchItemLabel(level, item, doorName), checked: switchTargets(shutSource.definition).includes(item.id), onChange: checked => {
                const ids = switchTargets(shutSource.definition)
                commit(setSwitchTargets(history.present, shutSource, checked ? [...ids, item.id] : ids.filter(id => id !== item.id)))
              },
            }))} />
          </fieldset>
        </BuilderInspectorSection>}
        <BuilderInspectorSection title="Transform">
          <div className="builder-dimensions" key={`${selection.kind}:${selection.index}`}>
            {(['x', 'y', 'w', 'h'] as const).filter(axis => axis === 'x' || axis === 'y' && !twoMarkGauge
              || axis === 'w' && !digitalCoinSwitch && !verticalTrigger && ['back-wall', 'platform', 'prop', 'mechanism', 'text', 'trigger', 'gravity-plate', 'force-field', 'evaluation-board'].includes(selection.kind)
              || axis === 'h' && (verticalTrigger || ['back-wall', 'platform', 'mechanism', 'text', 'rope', 'ladder', 'gravity-plate', 'force-field', 'evaluation-board'].includes(selection.kind))).map(axis => {
              const fixed = !!mechanism && (mechanism.kind === 'gate' && !isHorizontalGate(mechanism) ? axis === 'w' : axis === 'h') || !!forceField && (forceField.orientation === 'vertical' ? axis === 'w' : axis === 'h')
              const label = axis === 'w' && selection.kind === 'prop' ? 'Size' : fixed ? 'Thickness' : axis === 'h' && selection.kind === 'rope' ? 'Length'
                : levelGauge ? twoMarkGauge ? 'X' : axis === 'x' ? 'Mark X' : 'Mark Y'
                : ({ x: light || wallLight || logicRelay || gradeGate || floatSwitch ? 'X' : bounds.w ? 'Left' : 'X', y: light || wallLight || logicRelay || gradeGate || floatSwitch ? 'Y' : bounds.h ? 'Top' : 'Y', w: 'Width', h: 'Height' })[axis]
              return <Field key={axis}>{label}<NumberField label={`Object ${axis}`} disabled={fixed} step={snap ? gridSize : 1}
                value={axis === 'y' ? roomHeight - (light?.y ?? wallLight?.y ?? logicRelay?.y ?? gradeGate?.y ?? floatSwitch?.y ?? gaugeAnchor?.y ?? bounds.y) : axis === 'x' ? light?.x ?? wallLight?.x ?? logicRelay?.x ?? gradeGate?.x ?? floatSwitch?.x ?? gaugeAnchor?.x ?? bounds.x : bounds[axis]} {...numberEdit((base, value) => setDimension(base, axis, value))} /></Field>
            })}
          </div>
          {trigger && trigger.mode !== 'coins' && !trigger.facing && <>
            <BuilderSelect label="Mount" accessibleLabel="Pressure plate mount" value={trigger.mount?.mechanism ?? 'none'}
              options={[{ value: 'none', label: 'None' }, ...(level.mechanisms ?? []).flatMap((m, index) => m.kind === 'lift' && m.w >= trigger.w
                ? [{ value: m.id, label: selectionLabel({ kind: 'mechanism', index }, level, doorName) }] : [])]}
              onChange={value => commit(setPressurePlateMount(history.present, selection.index, value === 'none' ? null : value))} />
          </>}
          {facingPlate?.facing && <InspectorButton title={gravityPlate ? 'Move the emitter to the other side edge; the field and its strength stay unchanged' : 'Move the plate to the other side of its wall'} aria-pressed={facingPlate.facing === 'left'}
            onClick={() => commit(gravityPlate ? setGravityPlateFacing(history.present, selection.index, gravityPlate.facing === 'left' ? 'right' : 'left') : flipWallPlate(history.present, selection.index))}>Flip horizontally</InspectorButton>}
          {facingPlate && !facingPlate.facing && <InspectorButton title={gravityPlate ? 'Mirror the plate for a ceiling; gravity strength stays unchanged' : 'Mirror the pressure plate for a ceiling'} aria-pressed={!!facingPlate.ceiling}
            onClick={() => commit(setPlateCeiling(history.present, selection, !facingPlate.ceiling))}>Flip vertically</InspectorButton>}
          {selection.kind === 'goal' && level.goal && !level.goal.kind && <InspectorButton title="Mirror the exit and indicator around its saved origin" aria-pressed={!!level.goal.flipX} onClick={() => {
            const next = copyLevel(history.present)
            if (next.goal) { if (next.goal.flipX) delete next.goal.flipX; else next.goal.flipX = true }
            commit(next)
          }}>Flip horizontally</InspectorButton>}
          {mechanism?.orientation === 'horizontal' && <InspectorButton title={mechanism.kind === 'lift' ? 'Reverse the platform’s travel direction' : 'Reverse the gate’s opening direction'} aria-pressed={!!mechanism.flipX} onClick={() => {
            const next = copyLevel(level), m = next.mechanisms![selection.index]
            if (m.flipX) delete m.flipX; else m.flipX = true
            commit(next)
          }}>Flip horizontally</InspectorButton>}
          {selection.kind === 'rope' && (['start', 'end'] as const).filter(which => which === 'start' || level.climbables.ropes[selection.index].end).map(which => {
            // A tied rope numbers its anchors; a hanging rope has just the one.
            const rope = level.climbables.ropes[selection.index], point = which === 'end' ? rope.end! : rope
            const name = rope.end ? which === 'start' ? 'anchor 1' : 'anchor 2' : 'anchor'
            const host = point.anchor && selectionLabel({ kind: 'platform', index: point.anchor.platform }, level, doorName)
            return <div className="builder-anchor" key={which}><span>{rope.end ? `${name === 'anchor 1' ? 'Anchor 1' : 'Anchor 2'}: ${host ?? 'free'}` : host ? `Anchored to ${host}` : 'Free anchor'}</span><InspectorButton title="Attach this anchor to nearby terrain, or detach it" onClick={() => {
              const next = copyLevel(history.present), r = next.climbables.ropes[selection.index], target = which === 'end' ? r.end! : r
              if (target.anchor) { delete target.anchor; commit(next) } else commit(anchorRope(next, selection.index, 40, which))
            }}>{point.anchor ? `Detach ${name}` : `Attach ${name} to nearby terrain`}</InspectorButton></div>
          })}
          {selection.kind === 'rope' && <InspectorButton title={level.climbables.ropes[selection.index].end ? 'Free the second anchor so the rope hangs from the first' : 'Tie the free end where it rests'}
            onClick={() => commit(setRopeTied(history.present, selection.index, !level.climbables.ropes[selection.index].end))}>{level.climbables.ropes[selection.index].end ? 'Untie anchor 2' : 'Tie the free end'}</InspectorButton>}
          {selection.kind === 'rope' && level.climbables.ropes[selection.index].end && <>
            <BuilderSelect label="Release" accessibleLabel="Rope release" title="Let switches drop one anchor for the rest of the run"
              value={level.climbables.ropes[selection.index].release?.anchor ?? 'none'}
              options={[{ value: 'none', label: 'Always tied' }, { value: 'start', label: 'Switches release anchor 1' }, { value: 'end', label: 'Switches release anchor 2' }]}
              onChange={value => commit(setRopeRelease(history.present, selection.index, value === 'start' || value === 'end' ? value : null))} />
            {level.climbables.ropes[selection.index].release && <>
              <InspectorButton title="Also let the anchor give way once someone has hung on the rope for a moment" aria-pressed={!!level.climbables.ropes[selection.index].release!.weight}
                onClick={() => commit(setRopeBreakaway(history.present, selection.index, !level.climbables.ropes[selection.index].release!.weight))}>Breaks under weight</InspectorButton>
              <p className="builder-hint">{level.climbables.ropes[selection.index].release!.weight
                ? 'The anchor strains when anyone hangs on the rope and lets go a moment later, or when its switch rule turns on. It stays released until restart; the rope then hangs from the other anchor.'
                : 'When its switch rule turns on, the anchor lets go and stays released until restart. The rope then hangs from the other anchor.'}</p>
            </>}
          </>}
          {canPlaceOnSurface(selection, level) && <div className="builder-surface-placement">
            <InspectorButton disabled={!support || Math.abs(support.delta) < .1} title={facingPlate?.ceiling ? 'Place on the next ceiling surface · End' : 'Place on the next surface below · End'} onClick={() => commit(placeOnSurface(history.present, selection))}>Place on surface <span aria-hidden="true">{facingPlate?.ceiling ? '↑' : '↓'}</span></InspectorButton>
            <span className={support && Math.abs(support.delta) < .1 ? 'is-supported' : ''}>{support ? Math.abs(support.delta) < .1 ? 'On surface'
              : facingPlate?.ceiling ? support.delta < 0 ? `${Math.round(-support.delta)} below ceiling` : 'Overlaps ceiling'
                : support.delta > 0 ? `${Math.round(support.delta)} above surface` : 'Overlaps surface'
              : facingPlate?.ceiling ? 'No clear ceiling above' : 'No clear surface below'}</span>
          </div>}
          {(chosen || editingWall || pipe) && <div className="builder-action-row"><InspectorButton title="Activate Node to add or move outline points (N)" aria-pressed={tool === 'node'} onClick={() => { setTool('node'); setMessage('') }}>Add node</InspectorButton><InspectorButton title="Remove the selected node; at least three must remain" disabled={selectedNode === null || shapePoints(level, selection)!.length <= 3} onClick={removeNode}>Delete node</InspectorButton></div>}
          {(chosen || editingWall || pipe) && selectedNode !== null && shapePoints(level, selection)?.[selectedNode] && <fieldset>
            <legend>Node {selectedNode + 1} of {shapePoints(level, selection)!.length}</legend>
            <div className="builder-dimensions">{(['x', 'y'] as const).map(axis => {
              const p = shapePoints(level, selection)![selectedNode]
              return <Field key={axis}>Node {axis.toUpperCase()}<NumberField label={`Node ${axis.toUpperCase()}`} min={0} max={axis === 'x' ? level.width : roomHeight} step={snap ? gridSize : 1}
                value={axis === 'x' ? p[0] : roomHeight - p[1]} {...numberEdit((base, value) => {
                  const point = shapePoints(base, selection)![selectedNode]
                  return moveShapeVertex(base, selection, selectedNode, axis === 'x' ? value - point[0] : 0, axis === 'y' ? levelHeight(base) - value - point[1] : 0)
                })} /></Field>
            })}</div>
          </fieldset>}
          {editingWall && <p className="builder-hint">Drag inside the selected wall to move it. Square handles resize. Drag round nodes to reshape; Node adds points along edges. Snap, Alt, and arrow keys work as for terrain.</p>}
          {chosen && selectedNode !== null && <>
            <BuilderSelect label="Bézier handles" accessibleLabel="Bézier handles" value={chosen.bezier?.[selectedNode] ? chosen.bezier[selectedNode]?.mode ?? 'corner' : 'straight'}
              options={[{ value: 'straight', label: 'Straight · no handles' }, { value: 'corner', label: 'Corner · independent handles' }, { value: 'smooth', label: 'Smooth · aligned handles' }, { value: 'symmetric', label: 'Symmetric · equal handles' }]}
              onChange={value => {
                try { commit(setTerrainNodeMode(history.present, selection.index, selectedNode, value as 'straight' | 'corner' | 'smooth' | 'symmetric')) }
                catch (error) { setMessage((error as Error).message) }
              }} />
          </>}
        </BuilderInspectorSection>
        {Boolean(editingWall || chosen || light || wallText || wallDoor || pipe || wallBand || loose) && <BuilderInspectorSection title="Appearance">
          {pipe && <>
            <BuilderSelect label="Size" accessibleLabel="Pipe size" value={pipe.size ?? 'medium'} options={PIPE_SIZES.map(size => ({ value: size.id, label: size.label }))}
              onChange={value => commit(setPipe(history.present, selection.index, { size: value as PipeSize }))} />
            <p className="builder-hint">Drag a round point to reroute the pipe; Node adds a bend. Run pipes where the room would plumb something. Wall art only, with no collision.</p>
          </>}
          {loose && <>
            <div className="builder-dimensions">
              <BuilderSelect label="Hangs from" accessibleLabel="Loose panel bolt" value={loose.hang ?? 'either'} options={PANEL_HANGS.map(h => ({ value: h.id, label: h.label }))}
                onChange={value => commit(setLoosePanel(history.present, selection.index, { hang: value === 'either' ? undefined : value as PanelHang }))} />
              <BuilderSelect label="Behind it" accessibleLabel="Loose panel contents" value={loose.contents ?? 'services'} options={PANEL_CONTENTS.map(c => ({ value: c.id, label: c.label }))}
                onChange={value => commit(setLoosePanel(history.present, selection.index, { contents: value === 'services' ? undefined : value as Exclude<PanelContents, 'services'> }))} />
            </div>
            <CheckField checked={!!loose.leak} onCheckedChange={checked => commit(setLoosePanel(history.present, selection.index, { leak: checked || undefined }))}>Leak</CheckField>
            <p className="builder-hint">Loosen a panel where something gave way or someone reached the services: beside a pump, a tank or a powered door. Two or three in a room is plenty. Wall art only, with no collision.</p>
          </>}
          {wallBand && <>
            <BuilderSelect label="Lean" accessibleLabel="Hazard stripe lean" value={wallBand.lean ?? 'right'} options={[{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }]}
              onChange={value => commit(setWallStripes(history.present, selection.index, { lean: value === 'left' ? 'left' : undefined }))} />
            <p className="builder-hint">Paint warns of something: an edge, a drop, a machine. Wall art only, with no collision.</p>
          </>}
          {wallDoor && <>
            <div className="builder-dimensions">
              <BuilderSelect label="Condition" accessibleLabel="Blocked door condition" value={wallDoor.condition} options={WALL_DOOR_CONDITIONS.map(value => ({ value, label: WALL_DOOR_LABELS[value] }))}
                onChange={value => commit(setWallDoor(history.present, selection.index, { condition: value as WallDoorCondition }))} />
              <BuilderSelect label="Frame" accessibleLabel="Blocked door frame" value={wallDoor.frame ?? 'door'} options={[{ value: 'door', label: 'Door' }, { value: 'bulkhead', label: 'Bulkhead' }]}
                onChange={value => commit(setWallDoor(history.present, selection.index, { frame: value === 'bulkhead' ? 'bulkhead' : undefined }))} />
            </div>
            <InspectorButton aria-pressed={!!wallDoor.flipX} onClick={() => commit(setWallDoor(history.present, selection.index, { flipX: !wallDoor.flipX }))}>Flip horizontally</InspectorButton>
            <p className="builder-hint">Wall art only: it never opens and has no collision.</p>
          </>}
          {editingWall && <>
            {level.environment!.kind === 'landscape' && <>
              <BuilderSelect label="Surface" accessibleLabel="Back wall surface" value={editingWall.kind}
                options={[{ value: 'cave', label: 'Rock' }, { value: 'facility', label: 'Building' }]}
                onChange={value => commit(setBackWallKind(history.present, selection.index, value === 'facility' ? 'facility' : 'cave'))} />
              <p className="builder-hint">{editingWall.kind === 'facility'
                ? 'Painted off-white render, worn and water-stained by the level’s Stains setting.'
                : 'Pale rock. Choose Building for a structure standing outside.'}</p>
            </>}
            <p className="builder-hint">Back wall layer {selection.index + 1} of {level.environment!.walls.length}. Later layers take precedence.</p>
            <div className="builder-action-row">{[false, true].map(front => <InspectorButton key={String(front)} disabled={selection.index === (front ? level.environment!.walls.length - 1 : 0)}
              onClick={() => { const result = reorderBackWall(history.present, selection.index, front); commit(result.level); chooseSelection({ kind: 'back-wall', index: result.index }) }}>{front ? 'Bring to front' : 'Send to back'}</InspectorButton>)}</div>
          </>}
          {chosen && <TerrainMaterialPicker label="Terrain material" value={chosen.material} onChange={material => {
            const next = copyLevel(history.present); next.platforms[selection.index].material = material; commit(next)
          }} />}
          {chosen && <>
            <BuilderSelect label="Ground cover" value={terrainGroundCover(level, selection.index)} options={GROUND_COVERS.map(cover => ({ value: cover.id, label: cover.label }))}
              onChange={groundCover => { const next = copyLevel(history.present); next.platforms[selection.index].groundCover = groundCover as GroundCover; commit(next) }} />
            <p className="builder-hint">Follows exposed top edges. Decorative only.</p>
            <BuilderSelect label="Edge marking" value={chosen.trim ?? 'none'} options={TERRAIN_TRIMS.map(trim => ({ value: trim.id, label: trim.label }))}
              onChange={trim => { const next = copyLevel(history.present), piece = next.platforms[selection.index]; if (trim === 'none') delete piece.trim; else piece.trim = trim as TerrainTrim; commit(next) }} />
            <p className="builder-hint">A worn band just under its exposed tops, for a dock edge or a drop. Decorative only.</p>
            <BuilderSelect label="Surface" value={chosen.frictionless ? 'frictionless' : 'normal'} options={[{ value: 'normal', label: 'Normal grip' }, { value: 'frictionless', label: 'Frictionless' }]}
              onChange={surface => { const next = copyLevel(history.present), piece = next.platforms[selection.index]; if (surface === 'frictionless') piece.frictionless = true; else delete piece.frictionless; commit(next) }} />
            <p className="builder-hint">Frictionless: feet cannot walk, brake, step up or push on it, any slope slides, and props glide. Jumps, ledges, ropes and ladders still work.</p>
          </>}
          {chosen && <fieldset className="builder-terrain-order">
            <legend>Draw order ({terrainPosition + 1} of {level.platforms.length})</legend>
            <div className="builder-action-row">
              <InspectorButton disabled={terrainPosition === 0} title="Draw behind all other terrain" onClick={() => commit(reorderTerrain(history.present, selection.index, 'back'))}>Send to back</InspectorButton>
              <InspectorButton disabled={terrainPosition === 0} title="Move back one terrain layer" onClick={() => commit(reorderTerrain(history.present, selection.index, 'backward'))}>Backward</InspectorButton>
              <InspectorButton disabled={terrainPosition === level.platforms.length - 1} title="Move forward one terrain layer" onClick={() => commit(reorderTerrain(history.present, selection.index, 'forward'))}>Forward</InspectorButton>
              <InspectorButton disabled={terrainPosition === level.platforms.length - 1} title="Draw above all other terrain" onClick={() => commit(reorderTerrain(history.present, selection.index, 'front'))}>Bring to front</InspectorButton>
            </div>
          </fieldset>}
          {light && <>
            <div className="builder-dimensions">
              <Field>Direction (°)<NumberField label="Light direction" value={light.direction} min={-180} max={180} step={5} {...numberEdit((base, value) => changedObject(base, 'direction', value))} /></Field>
              <Field>Spread (°)<NumberField label="Light spread" value={light.spread} min={20} max={160} step={5} {...numberEdit((base, value) => changedObject(base, 'spread', value))} /></Field>
            </div>
            <CheckField title="Irregular dimming and brief dropouts, like a malfunctioning lamp" checked={!!light.flicker} onCheckedChange={checked => commit(editLight(history.present, selection.index, { flicker: checked }))}>Flicker</CheckField>
          </>}
          {light?.power === 'switched' &&
            <InspectorButton title="Hold to preview this light without changing its power connections" aria-pressed={previewLight === light.id}
              onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setPreviewLight(light.id) }} onPointerUp={() => setPreviewLight(null)} onPointerCancel={() => setPreviewLight(null)} onBlur={() => setPreviewLight(null)}
              onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setPreviewLight(light.id) } }} onKeyUp={() => setPreviewLight(null)}>Hold to preview</InspectorButton>}
          {wallText && <>
            {wallText.style !== 'lab-stamp' && <Field>Text<Textarea aria-label="Wall text content" rows={4} maxLength={1000} value={wallText.text} onChange={e => changeObject('text', e.target.value)} /></Field>}
            <div className="builder-dimensions">
              <BuilderSelect label="Style" accessibleLabel="Text style" title="Official lettering, graffiti, a message screen, or the L.A.B. wall stamp" value={wallText.style ?? 'official'} options={[{ value: 'official', label: 'Official' }, { value: 'graffiti', label: 'Graffiti' }, { value: 'terminal', label: 'Message screen' }, { value: 'lab-stamp', label: 'L.A.B. stamp' }]} onChange={value => changeObject('style', value)} />
              <Field>Rotation (°)<NumberField label="Text rotation" min={-180} max={180} step={5} value={wallText.rotation ?? 0} {...numberEdit((base, value) => changedObject(base, 'rotation', value))} /></Field>
              {wallText.style !== 'lab-stamp' && <><Field>Font size<NumberField label="Text font size" min={12} max={96} step={2} value={wallText.fontSize} {...numberEdit((base, value) => changedObject(base, 'fontSize', value))} /></Field>
              <BuilderSelect label="Alignment" accessibleLabel="Text alignment" value={wallText.align} options={['left', 'center', 'right'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} onChange={value => changeObject('align', value)} /></>}
            </div>
          </>}
        </BuilderInspectorSection>}
        {/* A grade average is invisible during play, so it has no wall wiring. */}
        {Boolean(wiringSource && !['grade-gate', 'course-door', 'bulkhead'].includes(wiringSource.kind) || terminalPosition) && <BuilderInspectorSection title="Wall wiring" open={false} reveal={terminalFocus !== null}>
          {wiringSource && wiringSource.kind !== 'grade-gate' && wiringSource.kind !== 'course-door' && wiringSource.kind !== 'bulkhead' && <fieldset className="builder-connections"><legend>Back-wall wiring</legend>
            <CheckField checked={!!wiringSource.definition.showWires} onCheckedChange={checked => commit(setWallWiring(history.present, selection, checked))}>Show wall wiring</CheckField>
            {wiringSource.definition.showWires && <Field>Wire height<NumberField label="Wire height" min={0} max={levelHeight(level)} step={snap ? gridSize : 1}
              value={wiringSource.definition.wireHeight ?? DEFAULT_WIRE_HEIGHT} {...numberEdit((base, value) => setWallWiring(base, selection, true, value))} /></Field>}
          </fieldset>}
          {terminalPosition && <fieldset className="builder-connections"><legend>Wall terminal</legend>
            <div className="builder-dimensions">
              <Field>X<NumberField label="Wire terminal X" min={4} max={level.width - 4} step={snap ? gridSize : 1} value={terminalPosition.x}
                {...numberEdit((base, value) => setWallTerminal(base, selection, { x: value, y: terminalPosition.y }))} /></Field>
              <Field>Y<NumberField label="Wire terminal Y" min={4} max={roomHeight - 4} step={snap ? gridSize : 1} value={roomHeight - terminalPosition.y}
                {...numberEdit((base, value) => setWallTerminal(base, selection, { x: terminalPosition.x, y: levelHeight(base) - value }))} /></Field>
            </div>
            <InspectorButton disabled={!customTerminal} onClick={() => { commit(setWallTerminal(history.present, selection, null)); setTerminalFocus(null) }}>Reset terminal position</InspectorButton>
          </fieldset>}
        </BuilderInspectorSection>}
        {Boolean(floatSwitch || levelGauge || prop || chosen && selectedNode !== null || forceField || gravityPlate || wallText?.style === 'terminal' || wallText?.style === 'lab-stamp' || trigger || selectedSource || terminalPosition || robot?.kind === 'repulsor' || logicRelay || hubDoor || selection.kind === 'evaluation-board') && <BuilderInspectorSection title="Object help" open={false}>
          {selection.kind === 'course-door' && <p className="builder-hint">Needs a flat sill and a clear 40 × 80 doorway. Always open opens it whenever the robot is here; Switched opens it while its connected switches are on, such as the door before it. The door is also a switch: Activates turns on once its level is passed at D or better. Up in the open doorway enters; finishing the level returns the robot here.</p>}
          {selection.kind === 'bulkhead' && <p className="builder-hint">Needs a flat sill and a clear 40 × 80 doorway. Up in the open doorway leads through. The robot steps out of the bulkhead on the far side that leads back here, so give each connected place a matching bulkhead. Always open opens it whenever the robot is here; Switched opens it while its connected switches are on, such as other bulkheads whose areas are complete. The bulkhead is also a switch: Activates turns on once every level door in the area beyond is passed.</p>}
          {gradeGate && <p className="builder-hint">Visible only in the studio. Averages its doors' best grades during play and sends the result to connected items.</p>}
          {selection.kind === 'evaluation-board' && <p className="builder-hint">Shows the evaluation's total, then each wing's passes or SEALED. The text is filled in during play.</p>}
          {levelGauge && <p className="builder-hint">{twoMarkGauge
            ? 'Reads the waterline of the pool its low mark is in, exactly. The low mark is on while the water is at or below it (the foot lamp), the high mark while it is at or above it (the head lamp). Keep both marks in the same pool, at least 20 apart. EMP switches both off.'
            : 'Reads the waterline of the pool its mark is in, exactly: no lag and no gap between on and off, so a gate wired to gauges on both sides opens only with the water level. Mark X and Y place the red mark. EMP switches it off.'}</p>}
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
            {selectedSource.kind === 'course-door' && <p className="builder-hint">Activates turns on once the level behind this door is passed, at D or better.</p>}
            {selectedSource.kind === 'bulkhead' && <p className="builder-hint">Activates turns on once the area beyond is complete: every level door in it passed.</p>}
            {!['trigger', 'float-switch', 'level-gauge', 'grade-gate', 'course-door', 'bulkhead'].includes(selectedSource.kind) && <p className="builder-hint">Sends this item's resulting on/off state, including Logic and Reversed.{selectedSource.kind !== 'logic-relay' && ' Turning Relay off clears these outputs.'}</p>}
          </>}
          {robot?.kind === 'repulsor' && <p className="builder-hint">{robot.chargingBay ? 'Wakes in its charging bay when it sees, hears or touches a rival.' : 'Enters through the shown portal. Give its full 40 × 80 opening a flat sill and clear space. Unsupported starts remain static until you fix their placement.'} Hunts across the level once alerted. Large forearms charge and fire from the palms. Sight and cover govern its shots.</p>}
          {logicRelay && <p className="builder-hint">Visible only in the studio. Sends its result to connected items, with no physical behavior during play.</p>}
        </BuilderInspectorSection>}
        <div className="builder-object-actions"><InspectorButton title="Duplicate this object (Ctrl/⌘ + D)" disabled={['entrance', 'goal'].includes(selection.kind)} onClick={duplicate}>Duplicate</InspectorButton><InspectorButton variant="destructive" className="builder-delete" aria-label="Delete object" title="Delete this object" disabled={['entrance', 'goal'].includes(selection.kind)} onClick={remove}>Delete</InspectorButton></div>
      </div> : <p className="builder-inspector-empty">Select an object on the canvas to edit it.</p>}
      </div>
      <div id="builder-inspector-panel-level" role="tabpanel" aria-labelledby="builder-inspector-tab-level" hidden={inspectorTab !== 'level'}>
      <div className="builder-level-settings">
        <Field>Level name<Input aria-label="Level name" title="The name shown in the level picker" maxLength={80} value={level.name} onChange={e => { if (suggestFileName.current) setFileName(levelFileName(e.target.value, levels.entries.map(file => file.fileName))); commit({ ...history.present, name: e.target.value }) }} /></Field>
        <Field>File name<Input aria-label="Level file name" placeholder={levelFileName(level.name)} title="Created on first save. Changing a saved filename renames that file on the next save." spellCheck={false} value={fileName} onChange={e => { suggestFileName.current = !e.target.value; setFileName(e.target.value) }} /></Field>
        <p className="builder-save-location">Built-in levels · Saved in this checkout</p>
        <BuilderSelect label="Type" accessibleLabel="Level type" title="A course ends at its exit. A facility area has no exit or clock: the robot leaves through its level doors and bulkheads."
          value={isHubLevel(level) ? 'hub' : isPuzzleLevel(level) ? 'course' : 'playground'}
          options={[{ value: 'course', label: 'Course · reach the exit' }, { value: 'hub', label: 'Facility area · doors and bulkheads' }, ...(isRunLevel(level) ? [] : [{ value: 'playground', label: 'Movement playground' }])]}
          onChange={value => { if (value === 'playground') return; chooseSelection(null); commit(setLevelType(history.present, value === 'hub' ? 'hub' : 'course')) }} />
        {isHubLevel(level) && <p className="builder-hint">Part of the facility, untimed and with no exit. The robot leaves through level doors and bulkheads: Up in an open doorway. Coins, clocks and time pickups stay in courses.</p>}
        {isHubLevel(level) && <CheckField title="An optional wing's courses are extra challenges: they never count toward the evaluation, the dispatch door or the release certificate."
          checked={!!level.optional} onCheckedChange={checked => {
            const next = copyLevel(history.present)
            if (checked) next.optional = true; else delete next.optional
            commit(next)
          }}>Optional wing</CheckField>}
        <BuilderInspectorSection title="World">
          <EnvironmentFields level={level} onChange={commit} selectedWall={selection?.kind === 'back-wall' ? selection.index : null} onSelectWall={editBackWall}
            onCreateWall={() => { chooseSelection(null); setTool('back-wall'); canvasRef.current?.focus() }} />
          {level.environment && <CheckField checked={environmentGrid} onCheckedChange={checked => setEnvironmentGrid(checked)}>Editor grid</CheckField>}
          <div className="builder-dimensions"><Field>Level width<NumberField label="Level width" step={100} value={level.width} min={800} max={MAX_LEVEL_WIDTH} {...numberEdit((base, value) => {
            const extent = Math.ceil(Math.max(800, base.entrance.x + 40, ...(base.environment?.walls ?? []).map(w => w.x + w.w), ...(base.environment?.groundCover ?? []).map(c => c.x + c.w), ...(base.robots ?? []).map(robot => robot.right + ROBOT_HALF_WIDTH), ...wallWiringItems(base).flatMap(item => item.definition.wireTerminal ? [item.definition.wireTerminal.x + 4] : []), ...allSelections(base).filter(s => s.kind !== 'goal' || base.goal?.kind !== 'walk-off').map(s => { const b = itemBounds(base, s)!; return b.x + b.w })))
            const width = clamp(value, extent, MAX_LEVEL_WIDTH)
            return { ...base, width, ...(base.goal?.kind === 'walk-off' ? { goal: { ...base.goal, x: width } } : {}) }
          })} /></Field>
          <Field>Level height<NumberField label="Level height" step={100} value={levelHeight(level)} min={400} max={6000} {...numberEdit(resizeLevelHeight, true)} /></Field></div>
          {!usesRegionLighting(level) && <div className="builder-lighting-settings" role="group" aria-label="Level lighting">
            <div className="builder-lighting-heading"><span>Lighting</span><CheckField title="Use spotlights against the game's dark background" checked={nightModeEnabled(level.lighting)} onCheckedChange={checked => commit(setLevelNightMode(setLightingLayout(history.present, 'uniform'), checked))}>Night mode</CheckField></div>
          </div>}
          <TerrainMaterialPicker label="Floor material" value={level.floorMaterial} onChange={floorMaterial => commit({ ...history.present, floorMaterial })} />
        </BuilderInspectorSection>
        {isPuzzleLevel(level) && <BuilderInspectorSection title="Timing">
          {level.goal && <BuilderSelect label="Finish" value={level.goal.kind ?? 'doorway'} options={[{ value: 'doorway', label: 'Doorway' }, { value: 'overlook', label: 'Outdoor overlook (untimed)' }, { value: 'walk-off', label: 'Run off right edge (untimed)' }, { value: 'bus', label: 'Bus stop (untimed)' }]}
            onChange={kind => commit(setFinish(history.present, kind as 'doorway' | 'overlook' | 'walk-off' | 'bus'))} />}
          {level.goal.kind === 'bus' && <p className="builder-hint">Place the bus on flat ground. Walk into its left side to board and finish; it is solid, so the robot can stand on its roof. The bus then drives away in the same view.</p>}
          {level.goal.kind === 'walk-off' && <p className="builder-hint">Continue flat ground to the right edge. Running or jumping completely off that edge finishes the level. The guide is visible only in the studio.</p>}
          {isPuzzleLevel(level) && <CheckField checked={level.timing === 'untimed'} onCheckedChange={checked => {
            const next = checked ? copyLevel(history.present) : setFinish(history.present, 'doorway')
            if (checked) next.timing = 'untimed'; else delete next.timing
            commit(next)
          }}>Untimed level</CheckField>}
          {isPuzzleLevel(level) && level.timing !== 'untimed' && <fieldset className="builder-grades"><legend>Grade times (seconds)</legend><div className="builder-grade-inputs">{GRADE_TARGETS.map((grade, index) => {
            const times = gradeTimes(level)
            const min = index === 0 ? 1 : Math.floor(times[GRADE_TARGETS[index - 1]]) + 1
            const max = index === 3 ? 7200 : Math.min(3600, Math.ceil(times[GRADE_TARGETS[index + 1]]) - 1)
            return <Field key={grade}>{grade.toUpperCase()}<NumberField label={`${grade.toUpperCase()} time`} min={min} max={max} step={1} value={times[grade]} {...numberEdit((base, value) => ({ ...base, times: { ...gradeTimes({ times: base.times! }), [grade]: value } }))} /></Field>
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
    {active && libraryOpen && <BuilderLibrary levels={levels} level={level} dirty={dirty} saving={saving} campaign={libraryCampaign}
      message={message} onSave={() => save(false, false)} onChoose={chooseLibraryItem} onClose={() => setLibraryOpen(false)} />}
    {active && saveFailure && <SaveFailureDialog {...saveFailure} onClose={() => setSaveFailure(null)} />}
    {active && textEntry && <BuilderTextEntry input={textEntry} onClose={() => setTextEntry(null)} />}
  </section>
}
