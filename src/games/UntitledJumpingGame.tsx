import { LightingRenderer, lightingPixelRatio } from './jumping/lightingRender'
import { LabLogo } from '../branding/LabLogo'
import { LAB_NAME } from '../branding/lab'
import { lightingForLevel } from './jumping/lightingDefinition'
import { usesRegionLighting } from './jumping/environment'
import { AccountSurface } from '../accounts/AccountSurface'
import { useCloudDownloads } from '../accounts/useCloudDownloads'
import { cloudCheckPending, waitForCloudCheck } from '../accounts/runtime'
import { playgroundLightingWorld } from './jumping/lightingModel'
import { awakeningCamera, GameCamera } from './jumping/camera'
import { advanceBusEnding, busEndingFrame, BUS_ENDING_SECONDS, createBusDeparture, createBusEnding } from './jumping/busEnding'
import type { BusEnding, EndingCamera } from './jumping/busEnding'
import { drawBusEnding } from './jumping/busEndingRender'
import { levelTerrain } from './jumping/level'
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { createJumpTouch } from './jumping/touchInput'
import { cancelGadgetInput } from './jumping/gadgets'
import { JumpingTouchControls } from './jumping/JumpingTouchControls'
import { cancelJumpInput, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { settleRun } from './jumping/challenge'
import { setAnimationCadence } from './jumping/characterAnimation'
import { blankTrial, copyLevel, levelProblems, isHubLevel, isPuzzleLevel, levelRules } from './jumping/level'
import type { JumpLevel, RunLevel } from './jumping/level'
import { loadCampaign } from './jumping/campaign'
import type { Campaign, CampaignFile } from './jumping/campaign'
import { arrivalLevel, dispatchPlace, resolveCampaign, facilityDoorName, facilityRecords, hubCompleteAreas, studioPresentation, facilityStart, GAME_KEYS, hubGrades, hubPresentation, linkOpen, linkedPlace, nextPlace, progressRecords, readFacilitySave, savedGameExists, savedPlace, savedProgress, saveFacilityPlace } from './jumping/facility'
import type { FacilityPlace, FacilitySave, SavedPlace } from './jumping/facility'
import type { HubDoor } from './jumping/hub'
import { AREA_STATE_KEY, captureAreaState, keepsState, levelFingerprint, readAreaState, restoreAreaState, trackAreaProps, writeAreaState } from './jumping/areaState'
import { BEST_TIME_KEY, createRun, formatTime, readBest, saveBest, setWaterEffectsEnabled, stepRun } from './jumping/challenge'
import type { Run } from './jumping/challenge'
import { advanceEntranceAnimation, createEntranceAnimation, entranceDuration } from './jumping/goal'
import { COMPLETION_KEY, readCompleted, saveCompleted } from './jumping/completion'
import { gradeClock } from './jumping/grading'
import type { EntranceAnimation } from './jumping/goal'
import { loadLevelCatalog } from './jumping/levelAssets'
import type { LevelCatalog, LevelFile, LocalLevelEntry } from './jumping/levelAssets'
import { levelFileName } from './jumping/levelFiles'
import { useBuiltInLevels } from './jumping/builtInLevels'
import { LevelThumbnail } from './jumping/LevelThumbnail'
import { LevelProgress } from './jumping/LevelProgress'
import { JumpingDoorDialog, JumpingPauseDialog, JumpingResultDialog, JumpingStartDialog } from './jumping/JumpingDialogs'
import type { StartProgress } from './jumping/JumpingDialogs'
import { DeleteLevelButton, MissingLevelNotice } from './jumping/LevelFileActions'
import { JUMPING_BUILDER, JUMPING_BUILTIN_BUILDER, JUMPING_FACILITY, JUMPING_LIBRARY, JUMPING_START, jumpingRoute, levelPath, playtestPath } from './jumping/routes'
import { JumpingAudioState } from './jumping/audioState'
import { JumpingMotionDiagnostics } from './jumping/motionDiagnostics'
import { PerformanceMonitor } from './jumping/performanceMonitor'
import type { PerformanceSnapshot } from './jumping/performanceMonitor'
import { PerformancePanel } from './jumping/PerformancePanel'
import { JumpingDevelopmentPanel } from './jumping/JumpingDevelopmentPanel'
import { AdaptiveLighting } from './jumping/adaptiveLighting'
import { JumpingSoundSession } from './jumping/sound'
import { clonePreparedLevel, prepareLevelInWorker } from './jumping/levelPreparation'
import type { PreparedLevel } from './jumping/levelPreparation'
import { createDevLevelRepository } from './jumping/devLevelRepository'
import { useWallTextFont } from './jumping/useWallTextFont'
import { gameStorage, subscribeGameStorage } from '../accounts/profileStorage'
import './jumping/jumping.css'
import './jumping/dialogs.css'
import './jumping/interface.css'

const DevLevelBuilder = import.meta.env.DEV ? lazy(() => import('./jumping/LevelBuilder').then(module => ({ default: module.LevelBuilder }))) : null

type Screen = 'menu' | 'playing' | 'ending' | 'paused' | 'building' | 'complete'
/** How long the facility waits for an account's first cloud check before using this device's saves. */
const CLOUD_CHECK_WAIT = 8000
/** A level that takes longer than this to prepare says so; anything quicker holds what is on screen. */
const PREPARING_DIALOG_DELAY = 1000
/** How near an open door or bulkhead the robot comes before the place behind it is prepared. */
const PREPARE_AHEAD_RANGE = 300
/** Facility places kept prepared at once; the oldest is dropped first. */
const PREPARED_PLACES = 8
/** While playing, a place that keeps its state saves it this often; pausing, leaving and hiding the page save it too. */
const AREA_AUTOSAVE_MS = 5000
const PLAY_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyX', 'KeyE', 'KeyF', 'Space', 'ShiftLeft', 'ShiftRight', 'Escape'])

export function UntitledJumpingGame({ onExit }: { onExit: () => void }) {
  useEffect(() => {
    const title = document.title
    document.title = `${LAB_NAME} | Dream Large Arcade`
    return () => { document.title = title }
  }, [])
  useWallTextFont()
  const [catalog, setCatalog] = useState<LevelCatalog | null>(null)
  const [stressCatalog, setStressCatalog] = useState<LevelCatalog>({ files: [], errors: [] })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    let active = true
    loadLevelCatalog(import.meta.env.BASE_URL, fetch, '__arcade/jumping-stress-levels/').then(result => {
      if (active) setStressCatalog(result)
    }, error => { if (active) setStressCatalog({ files: [], errors: [error.message] }) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    let active = true
    loadLevelCatalog(import.meta.env.BASE_URL).then(result => { if (active) setCatalog(result) }, error => {
      if (active) setCatalog({ files: [], errors: [error.message] })
    })
    return () => { active = false }
  }, [])
  return catalog ? <JumpingGameSession initialCatalog={catalog} stressCatalog={stressCatalog} onExit={onExit} /> : <div className="jumping-game jumping-loading"><p role="status">Loading levels…</p><button onClick={onExit}>Back to arcade</button></div>
}

function JumpingGameSession({ initialCatalog, stressCatalog, onExit }: { initialCatalog: LevelCatalog; stressCatalog: LevelCatalog; onExit: () => void }) {
  const location = useLocation(), navigate = useNavigate()
  // The level grid shows only at the development library route.
  const libraryRoute = jumpingRoute(location.pathname).screen === 'menu'
  const handledRoute = useRef(''), activePlayKey = useRef(''), builderPath = useRef(JUMPING_BUILTIN_BUILDER)
  const editorPath = useRef(JUMPING_BUILTIN_BUILDER), playtests = useRef(new Map<number, { level: JumpLevel; path: string; builderPath: string }>())
  const editorRevision = useRef(0)
  const [routeNotice, setRouteNotice] = useState('')
  const [playerStorage] = useState(() => gameStorage())
  const [repository] = useState(() => createDevLevelRepository())
  const builtIn = useBuiltInLevels(repository), devEditing = import.meta.env.DEV && !!repository
  const catalog = devEditing && !builtIn.restoring ? builtIn : initialCatalog
  const [selectedName, setSelectedName] = useState(initialCatalog.files[0]?.fileName ?? '')
  const files = devEditing && !builtIn.restoring ? builtIn.entries : catalog.files
  const selectedEntry = files.find(file => file.fileName === selectedName) ?? files[0]
  const selected = selectedEntry && 'level' in selectedEntry ? selectedEntry : undefined
  const deleting = useRef(false)
  const [deleteError, setDeleteError] = useState('')
  async function deleteFile(file: LocalLevelEntry) {
    if (deleting.current || builtIn.busy) return
    deleting.current = true; setDeleteError('')
    try { await builtIn.remove(file); setRouteNotice('') }
    catch (error) { setDeleteError((error as Error).message) }
    finally { deleting.current = false }
  }
  const [playingFile, setPlayingFile] = useState({ collection: 'built-in', fileName: initialCatalog.files[0]?.fileName ?? '' })
  const playingFiles = playingFile.collection === 'built-in' ? catalog.files : []
  const campaignIndex = playingFiles.findIndex(file => file.fileName === playingFile.fileName)
  const nextFile = playingFiles.slice(campaignIndex + 1).find(file => levelProblems(file.level).length === 0)
  const [editorFile, setEditorFile] = useState<{ file: LevelFile; key: number } | null>(null)
  const [recordKey, setRecordKey] = useState(initialCatalog.files[0]?.level.id ?? '')
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const [initialRun] = useState(() => createRun(blankTrial()))
  const run = useRef<Run | null>(initialRun)
  const player = useRef(initialRun.player), keys = useRef(new Set<string>())
  const playgroundEntrance = useRef<EntranceAnimation | null>(null)
  const audio = useRef<JumpingSoundSession | null>(null)
  const paintFrame = useRef<() => void>(() => {})
  const [lightingRenderer] = useState(() => new LightingRenderer({ backend: 'auto' }))
  const [performanceMonitor] = useState(() => import.meta.env.DEV ? new PerformanceMonitor() : null)
  const [devOpen, setDevOpen] = useState(false)
  const devOpenRef = useRef(false), devReturnFocus = useRef<HTMLElement | null>(null)
  const [showPerformance, setShowPerformance] = useState(() => {
    if (!import.meta.env.DEV) return false
    try { return localStorage.getItem('jumping:performance-monitor') === 'true' } catch { return false }
  })
  const performanceEnabled = useRef(showPerformance)
  const [adaptiveLighting] = useState(() => new AdaptiveLighting())
  const [performanceMode, setPerformanceMode] = useState(() => {
    try { return localStorage.getItem('jumping:lighting-performance-mode') !== 'false' } catch { return true }
  })
  const adaptiveEnabled = useRef(performanceMode)
  const [lightingReduced, setLightingReduced] = useState(false)
  function changePerformanceMode(value: boolean) {
    if (!import.meta.env.DEV) return
    adaptiveEnabled.current = value; setPerformanceMode(value)
    adaptiveLighting?.reset(); setLightingReduced(false)
    if (run.current) setWaterEffectsEnabled(run.current, true)
    performanceMonitor?.reset(); setPerformanceSnapshot(null)
    try { localStorage.setItem('jumping:lighting-performance-mode', String(value)) } catch { /* Keep the choice for this visit. */ }
  }
  const [performanceSnapshot, setPerformanceSnapshot] = useState<PerformanceSnapshot | null>(null)
  function changePerformance(value: boolean) {
    if (!import.meta.env.DEV) return
    performanceEnabled.current = value; setShowPerformance(value)
    performanceMonitor?.reset(); setPerformanceSnapshot(null)
    try { localStorage.setItem('jumping:performance-monitor', String(value)) } catch { /* Keep the choice for this visit. */ }
  }
  const [audioState] = useState(() => new JumpingAudioState())
  const [result, setResult] = useState({ elapsed: 0, grade: 'A' })
  const [doorTaken, setDoorTaken] = useState('')
  const [challenge, setChallenge] = useState(true)
  const [trial, setTrial] = useState<RunLevel>(initialRun.level)
  const savedTimes = useSyncExternalStore(subscribeGameStorage, () => {
    try { return playerStorage.getItem(BEST_TIME_KEY) } catch { return null }
  })
  const savedCompletions = useSyncExternalStore(subscribeGameStorage, () => {
    try { return playerStorage.getItem(COMPLETION_KEY) } catch { return null }
  })
  const [completedLevels, setCompletedLevels] = useState<Record<string, boolean>>({})
  function completed(id: string) { return !!completedLevels[id] || readCompleted({ getItem: key => key === COMPLETION_KEY ? savedCompletions : savedTimes }, id) }
  const [bestTimes, setBestTimes] = useState<Record<string, number | null>>({})
  function bestTime(id: string) { return bestTimes[id] ?? readBest({ getItem: () => savedTimes }, id) }
  const best = bestTime(recordKey)
  // The facility: the place the robot is in and the campaign it follows.
  const facility = useRef<FacilityPlace | null>(null), campaignFileRef = useRef<CampaignFile | null>(null)
  const [facilityWhere, setFacilityWhere] = useState<FacilityPlace['kind'] | null>(null)
  const [facilityNotice, setFacilityNotice] = useState('')
  const [facilityError, setFacilityError] = useState(''), [checkingCloud, setCheckingCloud] = useState(false)
  // Counts addresses followed, so a facility start that waited can tell it was overtaken.
  const routeVisits = useRef(0)
  const [campaignFile, setCampaignFile] = useState<CampaignFile | null>(null), [campaignError, setCampaignError] = useState('')
  useEffect(() => {
    let active = true
    loadCampaign(import.meta.env.BASE_URL).then(value => { if (active) { campaignFileRef.current = value; setCampaignFile(value) } },
      error => { if (active) setCampaignError((error as Error).message) })
    return () => { active = false }
  }, [])
  // A run started from the development library keeps the grid's result dialog and Next level.
  const [libraryRun, setLibraryRun] = useState(false)
  // A notice for the facility to show, paused, once its next place is ready.
  const pendingNotice = useRef('')
  // /lab shows the start screen over the robot's place once it is ready; /lab/facility plays it.
  // `facilityReady` is set while a facility place is loaded, so moving between the two keeps it.
  const startPending = useRef(false), startFresh = useRef(false), facilityReady = useRef(false)
  const [startScreen, setStartScreen] = useState<'fresh' | 'saved' | null>(null)
  const levelsById = useMemo(() => new Map(catalog.files.map(file => [file.level.id, file.level])), [catalog.files])
  // The campaign file names the opening, the concourse and the escape route; the levels lay out the rest.
  const campaign = useMemo(() => campaignFile && resolveCampaign(campaignFile, levelsById), [campaignFile, levelsById])
  const campaignNow = () => campaignFileRef.current && resolveCampaign(campaignFileRef.current, levelsById)
  /** Doors read saved records directly, so a course just finished counts at once. */
  const bestNow = (id: string) => bestTimes[id] ?? readBest(playerStorage, id), completedNow = (id: string) => !!completedLevels[id] || readCompleted(playerStorage, id)
  /** Passes, and each wing door's wiring from grades and its area's switches as last left. */
  const progressNow = (campaign: Campaign) => savedProgress(campaign, levelsById, bestNow, completedNow, playerStorage)
  const savedAreas = useSyncExternalStore(subscribeGameStorage, () => {
    try { return playerStorage.getItem(AREA_STATE_KEY) } catch { return null }
  })
  // A course is playable from a link or the library once its door would be open in the facility. The
  // campaign orders only a collection that holds it: in one without its opening, as with test fixtures,
  // every level stands outside the campaign and is open.
  const campaignFits = !!campaign && levelsById.has(campaign.opening)
  // Links, the library and the start screen read the same progress, from the saved records' snapshots.
  const progress = useMemo(() => !campaign || !levelsById.has(campaign.opening) ? null : savedProgress(campaign, levelsById,
    id => bestTimes[id] ?? readBest({ getItem: () => savedTimes }, id),
    id => !!completedLevels[id] || readCompleted({ getItem: key => key === COMPLETION_KEY ? savedCompletions : savedTimes }, id),
    { getItem: () => savedAreas }), [campaign, levelsById, bestTimes, completedLevels, savedTimes, savedCompletions, savedAreas])
  const startProgress: StartProgress | null = startScreen && progress
    ? { passed: progress.passed, required: progress.required, complete: progress.complete, wings: progressRecords(campaign!, progress, levelsById, bestTime) } : null
  const unlocked = new Set(campaign || campaignError ? catalog.files
    .filter(file => !progress || linkOpen(campaign!, progress, levelsById, file.level.id)).map(file => file.fileName) : [])
  // The library highlights the chosen level, or else the first open one, so a new save never starts on a locked tile.
  const highlighted = selected && unlocked.has(selected.fileName) ? selected.fileName : catalog.files.find(file => unlocked.has(file.fileName) && !isHubLevel(file.level))?.fileName
  function presentHub(target: Run | null, playtest: boolean) {
    if (!target?.hub || !isHubLevel(target.level)) return
    // Door and bulkhead switches and grade averages read the player's records, in playtests too.
    const records = facilityRecords(levelsById, bestNow, completedNow)
    target.hub.grades = hubGrades(target.level, records.grade); target.hub.complete = hubCompleteAreas(target.level, records)
    const campaign = campaignNow(), place = facility.current
    // A studio playtest opens every door; its placards and boards read as they do in the facility.
    if (playtest) {
      target.hub.open = new Set([...target.level.courseDoors, ...target.level.bulkheads].map(door => door.id))
      const shown = studioPresentation(target.level, levelsById, campaign && campaignFits ? campaign : null, campaign && campaignFits ? progressNow(campaign) : undefined, bestNow, completedNow)
      target.hub.placards = shown.placards; target.hub.signs = shown.signs
    } else if (campaign && place?.kind === 'hub') {
      const { open, placards, signs, switched } = hubPresentation(campaign, progressNow(campaign), target.level, levelsById, bestNow, completedNow)
      target.hub.open = open; target.hub.placards = placards; target.hub.signs = signs; target.hub.switched = switched
    }
    // Switches, and the doors and mechanisms they drive, start from the grades.
    settleRun(target)
  }
  // A place that could not be saved, as when storage is blocked, is kept for this visit, so the facility still resumes there.
  const unsavedPlace = useRef<SavedPlace | null>(null)
  function keepPlace(place: FacilityPlace) {
    try { saveFacilityPlace(playerStorage, place); unsavedPlace.current = null } catch { unsavedPlace.current = savedPlace(place) }
  }
  const facilitySave = (): FacilitySave => unsavedPlace.current ? { place: unsavedPlace.current } : readFacilitySave(playerStorage)
  const gameExists = () => !!unsavedPlace.current || savedGameExists(playerStorage)
  /**
   * Facility places prepared ahead, so walking through a door opens the place behind it at once. Each is
   * prepared once, as authored; entering it copies that, as Restart does.
   */
  const placePreparations = useRef(new Map<string, { promise: Promise<PreparedLevel>; controller: AbortController }>())
  useEffect(() => {
    const cache = placePreparations.current
    return () => { for (const entry of cache.values()) entry.controller.abort(); cache.clear() }
  }, [catalog.files])
  const placeKey = (place: FacilityPlace) => place.kind === 'hub' ? `hub:${place.level}:${place.arrival.kind === 'door' ? place.arrival.id : ''}` : `${place.kind}:${place.level}`
  function preparePlace(place: FacilityPlace): Promise<PreparedLevel> | null {
    const key = placeKey(place), cache = placePreparations.current, known = cache.get(key)
    if (known) { cache.delete(key); cache.set(key, known); return known.promise }
    const level = levelsById.get(place.level)
    if (!level) return null
    const controller = new AbortController()
    const promise = prepareLevelInWorker(place.kind === 'hub' && isHubLevel(level) ? arrivalLevel(level, place.arrival) : level, { signal: controller.signal, play: true })
    // A failed preparation is tried afresh next time.
    promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key) })
    cache.set(key, { promise, controller })
    for (const [oldest, entry] of cache) {
      if (cache.size <= PREPARED_PLACES) break
      entry.controller.abort(); cache.delete(oldest)
    }
    return promise
  }
  /** A course or escape level prepares where it leads, passed or not, while it is played. */
  function prepareExits(place: FacilityPlace) {
    const campaign = campaignNow()
    if (!campaign || place.kind === 'hub') return
    for (const passed of [true, false]) { const next = nextPlace(campaign, place, null, levelsById, passed); if (next) preparePlace(next) }
  }
  const lastPrepareCheck = useRef(0)
  /** In a facility area, prepare what lies behind each open door and bulkhead the robot is near. */
  const prepareNearby = useEffectEvent((now: number) => {
    if (now - lastPrepareCheck.current < 250 || screenRef.current !== 'playing') return
    lastPrepareCheck.current = now
    const place = facility.current, current = run.current, campaign = place?.kind === 'hub' ? campaignNow() : null
    if (place?.kind !== 'hub' || !current?.hub || !isHubLevel(current.level) || current.level.id !== place.level || !campaign) return
    const { x, y } = player.current, hub = current.hub
    const near = (door: { id: string; x: number; y: number }) => (hub.open.has(door.id) || hub.switched.has(door.id))
      && Math.abs(door.x - x) < PREPARE_AHEAD_RANGE && Math.abs(door.y - y) < PREPARE_AHEAD_RANGE
    const departures: HubDoor[] = [...current.level.courseDoors.filter(near).map(door => ({ kind: 'course' as const, door })),
      ...current.level.bulkheads.filter(near).map(door => ({ kind: 'bulkhead' as const, door }))]
    for (const departure of departures) { const next = nextPlace(campaign, place, departure, levelsById); if (next) preparePlace(next) }
  })
  function enterPlace(place: FacilityPlace) {
    const level = levelsById.get(place.level)
    if (!level) { leaveFacility('That part of the facility is unavailable.'); return }
    facility.current = place
    setFacilityWhere(place.kind)
    // Autosave where the robot is; course records save when a course finishes.
    keepPlace(place)
    const play = place.kind === 'hub' && isHubLevel(level) ? arrivalLevel(level, place.arrival) : level
    void beginPlay(play, false, place.kind === 'hub' ? `hub:${level.id}` : level.id, true, preparePlace(place))
  }
  async function startFacility() {
    setFacilityError('')
    const visit = routeVisits.current
    let file: CampaignFile
    try { file = campaignFileRef.current ??= await loadCampaign(import.meta.env.BASE_URL) }
    catch (error) { leaveFacility(`Could not open the facility: ${(error as Error).message}`); return }
    // Saves from another device, including where the robot was, load before it is placed here.
    if (cloudCheckPending()) {
      setCheckingCloud(true)
      await waitForCloudCheck(CLOUD_CHECK_WAIT)
      setCheckingCloud(false)
    }
    // Another address was followed meanwhile.
    if (visit !== routeVisits.current) return
    const campaign = resolveCampaign(file, levelsById)
    // Read before the robot is placed, which autosaves its place.
    startFresh.current = !gameExists()
    enterPlace(facilityStart(campaign, progressNow(campaign), facilitySave(), levelsById))
  }
  /** Leave the start screen for the facility's own address, keeping the robot where it is. Back returns. */
  function continueFromStart() { navigate({ pathname: JUMPING_FACILITY, search: location.search }) }
  /** Erase the save, then wake again in the opening, at the facility's own address. */
  function restartGame() {
    let notice = ''
    unsavedPlace.current = null
    try { for (const key of GAME_KEYS) playerStorage.removeItem(key) }
    catch { notice = 'Saved progress could not be erased on this device.' }
    setBestTimes({}); setCompletedLevels({})
    navigate({ pathname: JUMPING_FACILITY, search: location.search }, { state: { restart: true, ...notice ? { notice } : {} } })
  }
  /** The facility cannot go on; say why, with a way to try again or leave. */
  function leaveFacility(notice = 'The facility is unavailable.') {
    facility.current = null; facilityReady.current = false; setFacilityWhere(null)
    // A notice that sent the robot here, such as a refused link, still says why.
    const pending = pendingNotice.current; pendingNotice.current = ''
    setFacilityError(pending ? `${pending} ${notice}` : notice); changeScreen('menu')
  }
  /**
   * Move into a facility place. A course opened from a link saves the place and
   * returns to the facility's own address, which resumes there.
   */
  function goToPlace(place: FacilityPlace) {
    if (location.pathname.replace(/\/$/, '') === JUMPING_FACILITY) { enterPlace(place); return }
    keepPlace(place)
    navigate({ pathname: JUMPING_FACILITY, search: location.search }, { replace: true })
  }
  function leaveCourse() {
    const place = facility.current
    if (place?.kind === 'course') goToPlace({ kind: 'hub', level: place.hub, arrival: { kind: 'door', id: place.door } })
    else if (place?.kind === 'escape') returnToFacility()
  }
  function returnToFacility() {
    const campaign = campaignNow(), place = campaign && dispatchPlace(campaign, levelsById)
    if (place) goToPlace(place); else leaveFacility()
  }
  // Untimed places keep their state between visits (`areaState.ts`); the facility resets its timed courses.
  const lastAreaSave = useRef(''), lastAreaAutosave = useRef(0)
  /** The level of the facility place now playing, when it keeps its state. */
  function statefulLevel(): JumpLevel | null {
    const place = facility.current, current = run.current
    if (!place || !current || current.level.id !== place.level) return null
    const level = levelsById.get(place.level)
    return level && keepsState(level) ? level : null
  }
  /** Save the state of the place now playing. An unchanged state is not written again. */
  function saveArea() {
    const level = statefulLevel(), current = run.current
    // A course that keeps its state is cleared when finished, not saved; a facility area finishes only at a door.
    if (!level || !current || current.finished && !current.hub) return
    const state = captureAreaState(current, levelFingerprint(level)), text = `${level.id}\n${JSON.stringify(state)}`
    if (text === lastAreaSave.current) return
    try { writeAreaState(playerStorage, level.id, state); lastAreaSave.current = text } catch { /* Saved at the next chance. */ }
  }
  /** Forget a place's saved state, as when it restarts as authored or is finished. */
  function clearArea(id: string) {
    lastAreaSave.current = ''
    try { writeAreaState(playerStorage, id, null) } catch { /* The next save replaces it. */ }
  }
  const [saveError, setSaveError] = useState(false)
  const terrain = useRef(levelTerrain(initialRun.level))
  const activeLevel = useRef<JumpLevel>(initialRun.level), rules = useRef(levelRules(initialRun.level))
  const [activeLevelName, setActiveLevelName] = useState(initialRun.level.name)
  const [builderStarted, setBuilderStarted] = useState(false), [testing, setTesting] = useState(false)
  const jumpQueue = useRef<boolean[]>([]), keyboardJump = useRef(false)
  const [controller] = useState(createJumpController)
  const [touch] = useState(createJumpTouch)
  const [touchAvailable, setTouchAvailable] = useState(() => matchMedia('(pointer: coarse)').matches)
  const [screen, setScreen] = useState<Screen>('menu')
  // Incoming cloud saves apply at a safe point: the library, or a facility area between courses.
  useCloudDownloads(screen === 'menu' || facilityWhere === 'hub' && (screen === 'playing' || screen === 'paused'))
  // `preparing` names the level in the Preparing level dialog, shown only once preparation is slow.
  // `busy` covers the whole preparation (`aria-busy`); `holding` keeps a facility frame on screen meanwhile.
  const [preparing, setPreparing] = useState<string | null>(null), [busy, setBusy] = useState(false), [holding, setHolding] = useState(false)
  function endPreparation() { setPreparing(null); setBusy(false); setHolding(false) }
  const playPreparation = useRef<AbortController | null>(null), preparedStart = useRef<PreparedLevel | null>(null)
  useEffect(() => () => { playPreparation.current?.abort(); playPreparation.current = null }, [location.key])
  const screenRef = useRef<Screen>('menu')
  const endingScene = useRef<BusEnding | null>(null), lastCamera = useRef<EndingCamera>({ x: 0, y: 0, zoom: 1 })
  const pauseReturn = useRef<'playing' | 'ending'>('playing')
  const [endingPhase, setEndingPhase] = useState('')
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [metrics, setMetrics] = useState({ state: 'Ready', elapsed: 0, grade: 'A', remaining: 0 })

  /** `quiet` opens the paused screen without the pause sound, as the start screen does. */
  function changeScreen(next: Screen, reason?: string, quiet = false) {
    if (next === 'paused' && screenRef.current === 'playing') saveArea()
    if (next === 'paused' && (screenRef.current === 'playing' || screenRef.current === 'ending')) pauseReturn.current = screenRef.current
    if (next === 'menu' || next === 'building' || next === 'playing' && screenRef.current !== 'paused') endingScene.current = null
    if (next !== screenRef.current) { performanceMonitor?.reset(); adaptiveLighting?.suspend() }
    if (next === 'menu' || next === 'building') {
      setPerformanceSnapshot(null); adaptiveLighting?.reset(); setLightingReduced(false)
      if (run.current) setWaterEffectsEnabled(run.current, true)
    }
    audio.current?.silence()
    if (next === 'paused' && screenRef.current === 'playing' && !reason && !quiet) audio.current?.pauseCue()
    audioState.reset(player.current, run.current)
    keys.current.clear(); controller.reset(); touch.reset(); cancelJumpInput(player.current)
    if (run.current) cancelGadgetInput(run.current)
    jumpQueue.current = []; keyboardJump.current = false
    screenRef.current = next; setScreen(next)
    if (next === 'building' || next === 'menu') lightingRenderer.release()
    if (next === 'paused') setPauseReason(reason ?? '')
    else setStartScreen(null)
  }
  function changeDevOpen(open: boolean) {
    if (!import.meta.env.DEV) return
    if (open) devReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    devOpenRef.current = open; setDevOpen(open)
    // Clear held inputs and audio without changing the screen behind the panel.
    changeScreen(screenRef.current)
    performanceMonitor?.reset(); adaptiveLighting?.suspend()
  }
  useLayoutEffect(() => {
    if (!devOpen && devReturnFocus.current) {
      devReturnFocus.current.focus({ preventScroll: true }); devReturnFocus.current = null
    }
  }, [devOpen])
  useLayoutEffect(() => {
    if (screen === 'playing' || screen === 'ending') canvasRef.current?.focus({ preventScroll: true })
  }, [screen])
  function resetPosition() {
    endingScene.current = null; pauseReturn.current = 'playing'
    performanceMonitor?.reset(); setPerformanceSnapshot(null)
    adaptiveLighting?.reset(); setLightingReduced(false)
    if (preparedStart.current?.run) {
      const world = clonePreparedLevel(preparedStart.current)
      run.current = world.run; player.current = world.player!
      // A place that keeps its state restarts as authored, and forgets what was saved.
      const stateful = statefulLevel()
      if (stateful && world.run) { trackAreaProps(world.run); clearArea(stateful.id) }
      presentHub(world.run, testing)
      lightingRenderer.state.reset()
      if (world.lighting) lightingRenderer.prepare(world.run?.level ?? world.level, world.lighting)
    }
    else respawn(player.current)
    playgroundEntrance.current = run.current ? null : createEntranceAnimation(player.current, levelTerrain(activeLevel.current), activeLevel.current.entrance)
    keys.current.clear(); controller.reset(); touch.reset()
    jumpQueue.current = []; keyboardJump.current = false
    canvasRef.current?.focus({ preventScroll: true })
  }
  /**
   * `facilityArea` marks a facility place, which the start screen and the facility's address share once loaded.
   * `ahead` is that place's preparation, often already finished (`preparePlace`).
   */
  async function beginPlay(level: JumpLevel, fromBuilder: boolean, key: string, facilityArea = false, ahead: Promise<PreparedLevel> | null = null) {
    playPreparation.current?.abort(); facilityReady.current = false
    const controller = new AbortController(); playPreparation.current = controller
    // Moving between facility places, what is on screen holds, as a door closing behind the robot would,
    // while the opening screen covers the facility's first place. Elsewhere the current screen stays.
    const hold = facilityArea && screenRef.current !== 'menu' && screenRef.current !== 'building'
    changeScreen(fromBuilder ? 'building' : 'menu'); setBusy(true); setHolding(hold)
    // Only a slow preparation shows the Preparing level dialog, with its Cancel.
    const slow = facilityArea && !hold ? undefined
      : setTimeout(() => { if (playPreparation.current === controller) setPreparing(level.name) }, PREPARING_DIALOG_DELAY)
    try {
      // A preparation made ahead that failed, perhaps timed out in the background, is tried again here.
      const prepared = await (ahead?.catch(() => prepareLevelInWorker(level, { signal: controller.signal, play: true }))
        ?? prepareLevelInWorker(level, { signal: controller.signal, play: true }))
      if (controller.signal.aborted) return
      preparedStart.current = prepared
      const world = clonePreparedLevel(prepared)
      // An untimed facility place picks up where it was left. The prepared start stays as authored, for Restart.
      const stateful = !fromBuilder && facility.current?.level === level.id ? levelsById.get(level.id) : undefined
      if (world.run && stateful && keepsState(stateful)) {
        trackAreaProps(world.run)
        const saved = readAreaState(playerStorage, stateful)
        if (saved) restoreAreaState(world.run, saved)
      }
      lastAreaSave.current = ''
      run.current = world.run; player.current = world.player!
      presentHub(world.run, fromBuilder)
      lightingRenderer.state.reset()
      if (world.lighting) lightingRenderer.prepare(world.run?.level ?? world.level, world.lighting)
      activePlayKey.current = location.key
      if (world.run) { setTrial(world.run.level); setRecordKey(key) }
      else { activeLevel.current = world.level; setActiveLevelName(world.level.name); terrain.current = levelTerrain(world.level); rules.current = levelRules(world.level) }
      playgroundEntrance.current = world.run ? null : createEntranceAnimation(player.current, terrain.current, activeLevel.current.entrance)
      setChallenge(!!world.run); setTesting(fromBuilder); setSaveError(false); changeScreen('playing'); paintFrame.current()
      facilityReady.current = facilityArea
      if (facilityArea && facility.current && !fromBuilder) prepareExits(facility.current)
      const notice = pendingNotice.current; pendingNotice.current = ''
      // Opening the facility stops at the start screen, which also shows why a refused link landed here.
      if (startPending.current && facility.current && !fromBuilder) {
        startPending.current = false; setStartScreen(startFresh.current ? 'fresh' : 'saved'); changeScreen('paused', notice, true)
      }
      // A refused link lands here: pause on arrival so its reason is read before play.
      else if (notice) changeScreen('paused', notice)
    } catch (error) {
      if (controller.signal.aborted) return
      activePlayKey.current = ''
      if (facility.current) { leaveFacility(`Could not open “${level.name}”: ${(error as Error).message}`); return }
      setTesting(false); reportProblem(`Could not open “${level.name}”: ${(error as Error).message}`)
    } finally {
      clearTimeout(slow)
      if (playPreparation.current === controller) { playPreparation.current = null; endPreparation() }
    }
  }
  function startChallenge() { resetPosition(); changeScreen('playing') }
  function startFile(file: LevelFile) {
    setSelectedName(file.fileName)
    if (levelProblems(file.level).length) return
    setPlayingFile({ collection: 'built-in', fileName: file.fileName })
    void beginPlay(file.level, false, file.level.id)
  }
  function startStressFile(file: LevelFile) {
    setPlayingFile({ collection: 'development', fileName: file.fileName }); setLibraryRun(true)
    void beginPlay(file.level, false, `stress:${file.level.id}`)
  }
  function visit(path: string, state = {}) {
    navigate(path, { state: { from: location.pathname, ...state } })
  }
  function returnTo(path: string) {
    if (location.state?.from === path) navigate(-1)
    else visit(path)
  }
  // Only a run started from the development library goes back to its grid. The studio, its
  // playtests and everything else are part of the game, and return to the facility.
  const backToLibrary = import.meta.env.DEV && libraryRun && !testing
  /** Leave a run or the studio. */
  function showMenu() {
    const library = backToLibrary && screenRef.current !== 'building'
    // A stress level plays in place, on the library's own address.
    if (library && location.pathname === JUMPING_LIBRARY) {
      setTesting(false); changeScreen('menu')
    } else returnTo(library ? JUMPING_LIBRARY : JUMPING_FACILITY)
  }
  const levelsLabel = backToLibrary ? 'Level menu' : 'Return to the facility'
  function playFile(file: LevelFile) {
    if (!unlocked.has(file.fileName)) return
    setSelectedName(file.fileName)
    if (!levelProblems(file.level).length) visit(levelPath('built-in', file.fileName))
  }
  function editFile(file: LevelFile) { if (devEditing) visit(levelPath('built-in', file.fileName, true)) }
  function openBuilder() { if (devEditing) returnTo(builderPath.current) }
  function builderFileChanged(fileName?: string) {
    const path = fileName ? levelPath('built-in', fileName, true) : JUMPING_BUILTIN_BUILDER
    editorPath.current = path; builderPath.current = path
    if (path !== location.pathname) navigate(path, { replace: true, state: location.state })
  }
  function testLevel(level: JumpLevel) {
    const testId = playtests.current.size + 1, path = playtestPath(builderPath.current, level.id)
    playtests.current.set(testId, { level: copyLevel(level), path, builderPath: builderPath.current })
    navigate(path, { state: { from: builderPath.current, testId } })
  }
  function startTest(level: JumpLevel) { void beginPlay(level, true, level.id) }
  /** A problem opening a level: the library shows it in place, and anywhere else the facility shows it, paused. */
  function reportProblem(notice: string) {
    if (import.meta.env.DEV && libraryRoute) { changeScreen('menu'); setRouteNotice(notice); return }
    const fromLibrary = import.meta.env.DEV && location.state?.from === JUMPING_LIBRARY
    navigate(fromLibrary ? JUMPING_LIBRARY : JUMPING_START, { replace: true, state: { notice } })
  }
  function cancelPreparation() {
    playPreparation.current?.abort(); playPreparation.current = null; endPreparation()
    if (facility.current && screen !== 'building') { leaveFacility('Stopped before the next area opened.'); return }
    const fromLibrary = import.meta.env.DEV && location.state?.from === JUMPING_LIBRARY
    navigate(screen === 'building' ? builderPath.current : fromLibrary ? JUMPING_LIBRARY : JUMPING_START, { replace: true })
  }
  const followRoute = useEffectEvent(() => {
    if (handledRoute.current === location.key) return
    routeVisits.current++
    const route = jumpingRoute(location.pathname)
    startPending.current = route.screen === 'start'
    setRouteNotice(''); endPreparation()
    // Leave for the facility, which shows why, paused, when it arrives.
    const toFacility = (notice: string) => navigate(JUMPING_START, { replace: true, state: { notice } })
    if (!devEditing && location.pathname.startsWith(JUMPING_BUILDER)) {
      navigate(JUMPING_START, { replace: true }); return
    }
    if (devEditing && builtIn.restoring) return
    const inFacility = route.screen === 'start' || route.screen === 'facility'
    if (!inFacility && facility.current) { saveArea(); facility.current = null; facilityReady.current = false; setFacilityWhere(null) }
    if (inFacility) {
      const notice = typeof location.state?.notice === 'string' ? location.state.notice : ''
      setTesting(false); setLibraryRun(false)
      handledRoute.current = location.key
      // Continue, Back and Forward move between the start screen and the facility without reloading the robot's place.
      if (facilityReady.current && !location.state?.restart && (screenRef.current === 'playing' || screenRef.current === 'paused')) {
        startPending.current = false
        if (route.screen === 'start') { setStartScreen(gameExists() ? 'saved' : 'fresh'); changeScreen('paused', notice, true) }
        else changeScreen(notice ? 'paused' : 'playing', notice)
        return
      }
      pendingNotice.current = notice; void startFacility()
      return
    }
    // The level library is a development tool; everyone else plays the facility.
    if (route.screen === 'menu' && !import.meta.env.DEV) { navigate(JUMPING_START, { replace: true }); return }
    if (route.screen === 'missing') { toFacility('That link is unavailable.'); return }
    if (route.screen === 'playtest') {
      const draft = playtests.current.get(location.state?.testId)
      if (draft?.path === location.pathname) {
        builderPath.current = draft.builderPath
        if (editorPath.current !== draft.builderPath) {
          editorPath.current = draft.builderPath
          setEditorFile({ file: { fileName: route.file?.fileName ?? levelFileName(draft.level.name), level: copyLevel(draft.level) }, key: ++editorRevision.current })
          setBuilderStarted(true)
        }
        if (activePlayKey.current === location.key) changeScreen('playing')
        else startTest(draft.level)
        handledRoute.current = location.key
        return
      }
      // Draft links require a session snapshot; saved playtests can reload from the repository.
      if (!route.file) { navigate(JUMPING_BUILDER, { replace: true }); return }
    }
    if (route.screen === 'menu') {
      setTesting(false); setLibraryRun(false); changeScreen('menu')
      if (typeof location.state?.notice === 'string') setRouteNotice(location.state.notice)
    } else {
      if (route.screen === 'builder' && builderStarted && editorPath.current === location.pathname) {
        builderPath.current = location.pathname; changeScreen('building')
        handledRoute.current = location.key
        return
      }
      const target = route.screen === 'level' ? route : route.file
      const file = target && catalog.files.find(file => file.fileName === target.fileName)
      if (target) {
        setSelectedName(target.fileName)
        if (!file) {
          if (route.screen === 'level') { toFacility(`Could not find ${target.fileName}.`); return }
          setTesting(false); reportProblem(`Could not find ${target.fileName}. Choose another level.`)
          return
        }
      }
      if (route.screen === 'level' && file) {
        // A link waits for the campaign, which decides whether the course is open yet.
        if (!campaign && !campaignError) return
        if (!unlocked.has(file.fileName)) {
          setSelectedName(catalog.files[0]?.fileName ?? '')
          toFacility(isHubLevel(file.level) ? `${file.level.name} is part of the facility. Walk there through its doors.`
            : `${file.level.name} is locked. Pass the courses before it in its wing to open its door.`); return
        }
        if (levelProblems(file.level).length) { toFacility(`${file.level.name} needs repair before it can be played.`); return }
        // From the library, a course keeps the level grid's result dialog. A link into a course with a
        // door belongs to the facility: finishing or leaving returns the robot to that door.
        const fromLibrary = import.meta.env.DEV && location.state?.from === JUMPING_LIBRARY
        setLibraryRun(fromLibrary)
        const place = fromLibrary || !campaignFits ? null : linkedPlace(campaign!, levelsById, file.level.id)
        if (place) {
          facility.current = place; setFacilityWhere(place.kind)
          keepPlace(place)
        }
        if (activePlayKey.current === location.key) { setTesting(false); changeScreen('playing') }
        else startFile(file)
      } else if (route.screen === 'playtest' && file) {
        if (levelProblems(file.level).length) { reportProblem('This level needs repair before it can be played.'); return }
        const path = levelPath(route.file!.source, file.fileName, true)
        if (!builderStarted || editorPath.current !== path) {
          setEditorFile({ file: { ...file, level: copyLevel(file.level) }, key: ++editorRevision.current })
          editorPath.current = path
        }
        builderPath.current = path; setBuilderStarted(true)
        if (activePlayKey.current === location.key) { setTesting(true); changeScreen('playing') }
        else startTest(file.level)
      } else if (route.screen === 'builder') {
        if (editorPath.current !== location.pathname) {
          setEditorFile(file ? { file: { ...file, level: copyLevel(file.level) }, key: ++editorRevision.current } : null)
          editorPath.current = location.pathname
        }
        builderPath.current = location.pathname
        setBuilderStarted(true); changeScreen('building')
      }
    }
    handledRoute.current = location.key
  })
  // Router/catalog changes transition the running game and retained editor together.
  // This synchronizes imperative input, audio and preparation work after commit.
  useEffect(() => { followRoute() }, [location.key, location.pathname, catalog.files, builtIn.restoring, builtIn.busy, campaign, campaignError])
  const finishRun = useEffectEvent(() => {
    if (!run.current?.finished || screenRef.current !== 'playing') return
    // In the facility, a hub run ends at the door the robot took, without a record.
    const place = facility.current, campaign = campaignNow()
    if (place?.kind === 'hub') {
      saveArea()
      const next = campaign && nextPlace(campaign, place, run.current.hub?.departure ?? null, levelsById)
      if (next) enterPlace(next)
      else { pendingNotice.current = 'That door leads nowhere yet.'; enterPlace(place) }
      return
    }
    // Elsewhere, as in a studio playtest, a facility area ends at its door with no record.
    const departure = run.current.hub?.departure
    if (run.current.hub) {
      // Named as the facility names it: by where it leads.
      const to = departure && facilityDoorName(levelsById, campaignFits ? campaign : null)(departure.door)
      setDoorTaken(`Left through ${departure?.kind === 'bulkhead' ? 'the bulkhead' : 'the level door'}${to ? ` to ${to}` : ''}.`)
      changeScreen('complete'); return
    }
    const previousBest = bestTime(recordKey)
    setResult({ elapsed: run.current.elapsed, grade: run.current.grade ?? 'A' })
    setSaveError(false)
    if (!testing) {
      const { elapsed } = run.current
      if (!run.current.failed) setCompletedLevels(previous => ({ ...previous, [recordKey]: true }))
      try {
        if (!run.current.failed) saveCompleted(playerStorage, recordKey)
        if (run.current.level.timing !== 'untimed') {
          saveBest(playerStorage, elapsed, recordKey); setBestTimes(previous => ({ ...previous, [recordKey]: null }))
        }
        setSaveError(false)
      } catch {
        if (run.current.level.timing !== 'untimed') {
          const time = Math.min(bestTime(recordKey) ?? Infinity, elapsed); setBestTimes(previous => ({ ...previous, [recordKey]: time }))
        }
        setSaveError(true)
      }
    }
    // Finishing an untimed course, such as the escape route's last level, starts it afresh next time.
    const stateful = !testing && statefulLevel()
    if (stateful && !run.current.failed) clearArea(stateful.id)
    // A facility course returns the robot to its door, where the placard shows
    // the record; the live region announces it instead of a result dialog.
    if (place && campaign && !testing) {
      const level = run.current.level, { elapsed, failed, grade } = run.current
      if (level.timing !== 'untimed') setFacilityNotice(failed ? `${level.name} not passed. ${formatTime(elapsed)}.`
        : `${level.name} passed. Grade ${grade}, ${formatTime(elapsed)}${previousBest === null || elapsed < previousBest ? ', personal best' : ''}.`)
      const next = nextPlace(campaign, place, null, levelsById, !failed)
      if (next) { goToPlace(next); return }
    }
    const goal = run.current.level.goal
    if (!run.current.failed && goal && (goal.kind === 'bus' || goal.ending === 'bus')) {
      endingScene.current = goal.kind === 'bus'
        ? createBusDeparture(goal, player.current, lastCamera.current)
        : createBusEnding(run.current.level.width, goal.y, player.current, lastCamera.current)
      if (goal.kind === 'bus') run.current.busDeparture = endingScene.current
      setEndingPhase(busEndingFrame(endingScene.current).phase)
      changeScreen('ending')
    } else changeScreen('complete')
  })
  function skipEnding() {
    if (screenRef.current !== 'ending' || !endingScene.current) return
    advanceBusEnding(endingScene.current, BUS_ENDING_SECONDS)
    changeScreen('complete')
  }
  const advanceEnding = useEffectEvent((dt: number) => {
    if (screenRef.current !== 'ending' || !endingScene.current || devOpenRef.current || document.hidden) return
    const finished = advanceBusEnding(endingScene.current, dt)
    setEndingPhase(busEndingFrame(endingScene.current).phase)
    if (finished) changeScreen('complete')
  })
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (import.meta.env.DEV && (event.code === 'Backquote' || event.key === '`') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
      && !event.isComposing && !preparing
      && !(event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) {
      event.preventDefault()
      if (!event.repeat) changeDevOpen(!devOpenRef.current)
      return
    }
    if (devOpenRef.current) return
    if (screenRef.current === 'ending' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.target instanceof HTMLButtonElement) return
      if (event.code === 'Escape' || event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault()
        if (!event.repeat) { if (event.code === 'Escape') changeScreen('paused'); else skipEnding() }
      }
      return
    }
    if (screenRef.current === 'menu' && event.code === 'KeyY' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (!event.repeat && devEditing && selected && unlocked.has(selected.fileName)) { event.preventDefault(); editFile(selected) }
      return
    }
    if (screenRef.current !== 'playing' || event.altKey || event.ctrlKey || event.metaKey || !PLAY_KEYS.has(event.code)) return
    // Preserve keyboard activation of the playtest's Return to builder button.
    if (event.target instanceof HTMLButtonElement && event.code === 'Space') return
    event.preventDefault()
    if (event.repeat) return
    if (event.code === 'Escape') changeScreen('paused')
    else {
      if (event.code === 'Space' && !keys.current.has(event.code)) jumpQueue.current.push(true)
      if (event.code === 'KeyE') touch.gadgetAction('interact')
      if (event.code === 'KeyF') touch.gadgetAction('use')
      keys.current.add(event.code)
    }
  })
  const autosaveArea = useEffectEvent((now: number, force = false) => {
    if (!force && (now - lastAreaAutosave.current < AREA_AUTOSAVE_MS || screenRef.current !== 'playing')) return
    lastAreaAutosave.current = now; saveArea()
  })
  const suspend = useEffectEvent(() => {
    keys.current.clear(); controller.reset(); touch.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    if (screenRef.current === 'playing' || screenRef.current === 'ending') changeScreen('paused', 'Paused while the game was out of focus.')
  })
  const reorient = useEffectEvent(() => {
    touch.reset()
    if (screenRef.current === 'playing' || screenRef.current === 'ending') changeScreen('paused', 'Paused after the screen orientation changed.')
  })
  const frameInput = useEffectEvent((now: number) => {
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard stays available. */ }
    const pad = controller.sample(pads, screenRef.current, now, document.hasFocus() && !document.hidden)
    if (pad.pressed.length || Math.abs(pad.move) > .1) audio.current?.unlock()
    if (pad.connected !== connected) setConnected(pad.connected)
    if (devOpenRef.current) {
      const dialog = controllerDialog(rootRef.current)
      if (pad.pause || pad.pressed.includes(1)) changeDevOpen(false)
      else if (dialog && pad.pressed.includes(0)) controlDialog(dialog, 'confirm')
      else if (dialog && pad.navigation) controlDialog(dialog, pad.navigation)
      return null
    }
    if (pad.disconnected && (screenRef.current === 'playing' || screenRef.current === 'ending')) {
      changeScreen('paused', `Controller disconnected. Reconnect, or continue with ${touchAvailable ? 'touch controls' : 'the keyboard'}.`)
      return null
    }
    if (screenRef.current === 'ending') {
      if (pad.pause) changeScreen('paused')
      else if (pad.pressed.includes(0)) skipEnding()
      return null
    }
    if (screenRef.current !== 'playing') {
      if (screenRef.current === 'building') return null
      const dialog = controllerDialog(rootRef.current)
      if (dialog) {
        if (pad.pause && screenRef.current === 'paused') { if (startScreen) continueFromStart(); else changeScreen(pauseReturn.current) }
        else if (screenRef.current === 'menu' && pad.pressed.includes(3) && devEditing && selected) editFile(selected)
        else if (pad.pressed.includes(1)) controlDialog(dialog, 'back')
        else if (pad.pressed.includes(0)) {
          if (screenRef.current === 'menu' && selected && document.activeElement?.closest('[data-menu-item]') && !document.activeElement.classList.contains('level-file-delete')) playFile(selected)
          else controlDialog(dialog, 'confirm')
        }
        else if (pad.navigation) controlDialog(dialog, pad.navigation)
      }
      return null
    }
    if (pad.pause) { changeScreen('paused'); return null }
    const k = keys.current, keyboard = keyboardMovement(k)
    return { move: keyboard || pad.move, jump: pad.jump,
      interact: k.has('KeyE') || pad.interact, use: k.has('KeyF') || pad.use,
      aimX: Math.sign(keyboard) || pad.aimX,
      aimY: Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp')) || pad.aimY,
      swimVertical: Number(k.has('KeyS') || k.has('ArrowDown')) - Number(k.has('KeyW') || k.has('ArrowUp')) || pad.swimVertical,
      climb: k.has('KeyW') || k.has('ArrowUp') || pad.climb,
      drop: k.has('KeyS') || k.has('ArrowDown') || k.has('KeyX') || pad.drop,
      descend: k.has('KeyS') || k.has('ArrowDown') || pad.descend, detach: k.has('KeyX') || pad.detach,
      crouch: k.has('KeyS') || k.has('ArrowDown') || pad.crouch, reach: pad.reach }
  })

  useEffect(() => {
    const canvas = canvasRef.current!, ctx = lightingRenderer.drawingContext(canvas)
    // The context itself is deferred until a pointer, keyboard or controller action.
    const sound = new JumpingSoundSession()
    // Sampling the complete rig every physics tick is expensive near cave lips.
    const motion = new URLSearchParams(window.location.search).get('motionDebug') === '1'
      ? new JumpingMotionDiagnostics() : null
    const debugWindow = window as Window & { jumpingMotion?: { read: () => ReturnType<JumpingMotionDiagnostics['read']> }; jumpingRendering?: { pause: () => boolean; resume: () => void } }
    const motionView = motion ? { read: () => motion.read() } : undefined
    if (motionView) debugWindow.jumpingMotion = motionView
    // Software-rendered browser checks can pause world drawing while they advance
    // gameplay. Physics, camera and light timing continue. Pauses nest; the
    // outermost resume draws the current frame at once.
    let renderPauses = 0, skippedDt = 0
    const renderView = new URLSearchParams(window.location.search).get('renderControl') === '1'
      ? { pause: () => { renderPauses++; return true }, resume: () => { if (renderPauses && !--renderPauses) paint(0) } } : undefined
    if (renderView) debugWindow.jumpingRendering = renderView
    audio.current = sound
    audioState.reset(player.current, run.current)
    let width = 0, height = 0, ratio = 1, frame = 0, previous = 0, accumulator = 0, published = 0
    let lightingStats: PerformanceSnapshot['lighting'] = null
    const gameCamera = new GameCamera()
    const paint = (dt = 0) => {
      if (!width || !height || screenRef.current === 'building' || screenRef.current === 'menu') return
      const level = run.current?.level ?? activeLevel.current
      const nextRatio = lightingPixelRatio(width, height, window.devicePixelRatio || 1, adaptiveLighting.reduced, usesRegionLighting(level))
      if (ratio !== nextRatio) { ratio = nextRatio; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio) }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      // Fractional render scales round the backing dimensions to whole pixels.
      // Frame against the drawable area so rounding cannot shift the view.
      const viewWidth = canvas.width / ratio, viewHeight = canvas.height / ratio
      if (endingScene.current && run.current) {
        const world = run.current
        if (level.goal?.kind === 'bus') {
          const camera = endingScene.current.camera
          lightingStats = lightingRenderer.render(ctx, world, lightingForLevel(level),
            { ...camera, width: canvas.width, height: canvas.height, zoom: camera.zoom * ratio }, 0)
          return
        }
        drawBusEnding(ctx, endingScene.current, level, viewWidth, viewHeight, camera => {
          lightingRenderer.render(ctx, world, lightingForLevel(level),
            { ...camera, width: canvas.width, height: canvas.height, zoom: camera.zoom * ratio }, 0)
        })
        return
      }
      const camera = awakeningCamera(gameCamera.view(viewWidth, viewHeight, player.current, level, !!run.current, dt),
        viewWidth, viewHeight, run.current?.entrance ?? playgroundEntrance.current)
      lastCamera.current = camera
      if (renderPauses) { skippedDt += dt; return }
      lightingStats = lightingRenderer.render(ctx, run.current ?? playgroundLightingWorld(level, player.current, playgroundEntrance.current), lightingForLevel(level),
        { ...camera, width: canvas.width, height: canvas.height, zoom: camera.zoom * ratio }, dt + skippedDt)
      skippedDt = 0
    }
    paintFrame.current = paint
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      if (endingScene.current?.cameraLocked) endingScene.current.camera = gameCamera.view(width, height, player.current, run.current?.level ?? activeLevel.current, !!run.current, 0)
      paint()
      const focused = document.activeElement
      if (focused instanceof HTMLElement && focused.closest('.jumping-overlay')) focused.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space' && keys.current.has('Space')) jumpQueue.current.push(false)
      keys.current.delete(event.code)
    }
    const visibility = () => { if (document.hidden) suspend() }
    // A reload or closing tab keeps the place as it stands.
    const hide = () => autosaveArea(performance.now(), true)
    window.addEventListener('keydown', handleKey); window.addEventListener('keyup', keyup)
    window.addEventListener('blur', suspend); document.addEventListener('visibilitychange', visibility)
    window.addEventListener('orientationchange', reorient); window.addEventListener('pagehide', hide)
    // The player and robots near the view animate every physics step. Robots
    // more than this far outside the view skip animation, which cannot change
    // their motion; one that returns resumes from rest before it can be seen.
    // (Animating once per drawn frame instead saved 3 to 5% of frame time and
    // lost continuity checked by the browser tests; see docs/jumping-animation.md.)
    const ANIMATION_MARGIN = 160
    const updateRobotAnimation = () => {
      if (!run.current) return
      const camera = lastCamera.current, right = camera.x + width / camera.zoom, bottom = camera.y + height / camera.zoom
      for (const robot of run.current.robots) {
        const actor = robot.actor
        if (!actor) continue
        const visible = actor.x > camera.x - ANIMATION_MARGIN && actor.x < right + ANIMATION_MARGIN
          && actor.y > camera.y - ANIMATION_MARGIN && actor.y - 60 < bottom + ANIMATION_MARGIN
        setAnimationCadence(actor, visible ? 'tick' : 'off')
      }
    }
    const tick = (now: number) => {
      const measuring = import.meta.env.DEV && performanceEnabled.current && !devOpenRef.current && screenRef.current === 'playing' && !document.hidden
      const started = measuring ? performance.now() : 0
      let steps = 0
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now
      const input = frameInput(now)
      if (input) {
        accumulator += dt
        updateRobotAnimation()
        while (accumulator >= STEP) {
          steps++
          // Preserve even a complete keyboard tap between two rendered frames.
          if (jumpQueue.current.length) {
            keyboardJump.current = jumpQueue.current.shift()!
          }
          const gesture = touch.sample(now)
          const controls = { ...input, move: input.move || gesture.move,
            interact: input.interact || gesture.interact, use: input.use || gesture.use,
            aimX: input.aimX || Math.sign(gesture.move), aimY: input.aimY || Number(gesture.descend) - Number(gesture.climb),
            swimVertical: input.swimVertical || Number(gesture.descend) - Number(gesture.climb),
            climb: input.climb || gesture.climb, descend: input.descend || gesture.descend,
            drop: input.drop || gesture.drop, detach: input.detach || gesture.detach, crouch: input.crouch || gesture.crouch,
            jump: input.jump || keyboardJump.current || gesture.jump,
            jumpStrength: gesture.jump ? gesture.jumpStrength : undefined }
          if (run.current) stepRun(run.current, controls)
          else {
            let activeDt = STEP
            if (playgroundEntrance.current) {
              activeDt = advanceEntranceAnimation(playgroundEntrance.current, STEP)
              if (playgroundEntrance.current.elapsed + 1e-9 >= entranceDuration(playgroundEntrance.current)) playgroundEntrance.current = null
              else activeDt = 0
            }
            if (activeDt > 1e-9) stepPlayer(player.current, controls, activeDt, terrain.current, activeLevel.current.climbables, rules.current)
          }
          const report = motion?.step(player.current, controls, STEP, (run.current?.level ?? activeLevel.current).id)
          if (report) console.warn('[Jumping motion] Repeated oscillation detected', report)
          audioState.step(player.current, run.current, STEP)
          accumulator -= STEP
          if (run.current?.finished) { finishRun(); accumulator = 0; break }
        }
        sound.update(audioState.drain())
      } else { accumulator = 0; motion?.reset() }
      advanceEnding(dt)
      autosaveArea(now)
      prepareNearby(now)
      if (adaptiveLighting && adaptiveEnabled.current && input && !document.hidden) {
        const before = adaptiveLighting.reduced, after = adaptiveLighting.observe(now)
        if (after !== before) {
          setLightingReduced(after); performanceMonitor?.reset()
          if (run.current) setWaterEffectsEnabled(run.current, !after)
        }
      } else adaptiveLighting?.suspend()
      const updated = measuring ? performance.now() : 0
      paint(input ? dt : 0)
      if (measuring && input && screenRef.current === 'playing') {
        const summary = performanceMonitor?.record(now, updated - started, performance.now() - updated, steps)
        if (summary) setPerformanceSnapshot({ ...summary, width: canvas.width, height: canvas.height, scale: ratio,
          dpr: window.devicePixelRatio || 1, shadows: 'structural',
          lighting: lightingStats && { lights: lightingStats.lights, edges: lightingStats.edges, bufferBytes: lightingStats.bufferBytes, backend: lightingStats.backend } })
      } else performanceMonitor?.reset()
      if (now - published > 80) {
        const p = player.current
        const entering = run.current?.entrance || playgroundEntrance.current
        const next = { state: entering ? entering.kind === 'charging-bay' ? 'Waking up' : 'Entering the level' : run.current?.exit ? 'Entering the exit' : playerState(p),
          elapsed: run.current?.elapsed ?? 0,
          ...(run.current?.level.times ? gradeClock({ times: run.current.level.times }, run.current.elapsed, run.current.failed) : { grade: 'A', remaining: 0 }) }
        // Unchanged metrics, as while paused, must not re-render: on a slow frame those renders
        // would starve the router's transition, and a link followed from the pause screen would never open.
        setMetrics(current => current.state === next.state && current.elapsed === next.elapsed && current.grade === next.grade
          && current.remaining === next.remaining ? current : next)
        published = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      sound.dispose(); audio.current = null; lightingRenderer.dispose(); paintFrame.current = () => {}
      if (motionView && debugWindow.jumpingMotion === motionView) delete debugWindow.jumpingMotion
      if (renderView && debugWindow.jumpingRendering === renderView) delete debugWindow.jumpingRendering
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('orientationchange', reorient); window.removeEventListener('pagehide', hide)
      autosaveArea(performance.now(), true)
    }
  }, [audioState, lightingRenderer, performanceMonitor, adaptiveLighting, touch])

  return <div className={`jumping-game${screen === 'playing' && !devOpen ? ' jumping-playing' : ''}`} ref={rootRef} aria-busy={busy || undefined} onPointerDownCapture={() => audio.current?.unlock()} onKeyDownCapture={() => audio.current?.unlock()}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={challenge ? isHubLevel(trial) ? trial.name : `${trial.name}: reach the exit` : `${LAB_NAME} movement playground`}
      onPointerDown={event => { if (event.pointerType === 'mouse' && event.button === 0 && screenRef.current === 'playing') { touch.gadgetAction('use'); canvasRef.current?.focus() } }} />
    {screen === 'playing' && <>
      {!devOpen && <JumpingTouchControls canvasRef={canvasRef} reader={touch} active available={touchAvailable}
        gadgets={!!trial.props?.some(prop => prop.gadget)}
        onTouch={() => setTouchAvailable(true)} onPause={() => changeScreen('paused')} />}
      {import.meta.env.DEV && showPerformance && !devOpen && <PerformancePanel snapshot={performanceSnapshot} />}
      {testing && <button className="jumping-builder-return" title="Return to the level editor" onClick={openBuilder}>Return to builder</button>}
      <aside className="jumping-visually-hidden" aria-label="Player status">
        {facilityWhere && <span role="status" aria-live="polite" data-testid="facility-notice">{facilityNotice}</span>}
        <span className="jumping-state">{metrics.state}</span>
        {challenge && trial.timing !== 'untimed' && <span className="jumping-grade-status">Grade {metrics.grade}{metrics.grade === 'F' ? ' · Exploration run; restart to progress.' : ` · ${Math.ceil(metrics.remaining)} seconds remaining`}</span>}
        {challenge && trial.timing !== 'untimed' && <span role="timer" aria-label="Elapsed level time" data-testid="level-time">{formatTime(metrics.elapsed)}</span>}
      </aside>
    </>}
    {screen === 'ending' && <>
      <p className="jumping-visually-hidden" role="status" aria-live="polite" aria-label={trial.goal?.kind === 'bus' ? 'Bus departure' : 'Ending scene'}>{endingPhase}</p>
    </>}
    {preparing && <KeyboardDialog label="Preparing level" focusKey="jumping-preparing" onClose={cancelPreparation} className="jumping-overlay jumping-dialog-overlay jumping-ui">
      <div className="jumping-notice-panel">
        <header className="jumping-ui-heading jumping-brand-heading"><LabLogo /><h2>Preparing level.</h2></header>
        <div className="jumping-notice-copy"><p role="status">{preparing}</p></div>
        <div className="jumping-notice-actions"><button onClick={cancelPreparation}>Cancel</button></div>
      </div>
    </KeyboardDialog>}
    {screen === 'complete' && isHubLevel(trial) && <JumpingDoorDialog name={trial.name} door={doorTaken} testing={testing} canEdit={devEditing}
      onRetry={startChallenge} onBuilder={openBuilder} onLevels={showMenu} levelsLabel={levelsLabel} onExit={onExit} />}
    {screen === 'complete' && isPuzzleLevel(trial) && <JumpingResultDialog level={trial} elapsed={result.elapsed} grade={result.grade} best={best}
      testing={testing} saveError={saveError} onNext={libraryRun && !testing && result.grade !== 'F' && campaignIndex >= 0 && nextFile && unlocked.has(nextFile.fileName) ? () => playFile(nextFile) : undefined}
      onRetry={startChallenge} onBuilder={openBuilder} canEdit={devEditing} onExit={onExit}
      {...facilityWhere === 'escape' ? { onLevels: returnToFacility, levelsLabel: 'Return to the facility' } : { onLevels: showMenu, levelsLabel }} />}
    {!preparing && screen === 'paused' && startScreen && <JumpingStartDialog name={challenge ? trial.name : activeLevelName} reason={pauseReason}
      fresh={startScreen === 'fresh'} opening={levelsById.get(campaign?.opening ?? '')?.name ?? 'the facility'} progress={startProgress}
      connected={connected} touchControls={touchAvailable} canEdit={devEditing} onContinue={continueFromStart}
      onRestart={restartGame} onBuilder={openBuilder} onExit={onExit} />}
    {!preparing && screen === 'paused' && !startScreen && <JumpingPauseDialog name={challenge ? trial.name : activeLevelName} reason={pauseReason}
      connected={connected} touchControls={touchAvailable} testing={testing} challenge={challenge} onResume={() => changeScreen(pauseReturn.current)}
      facility={facilityWhere ? { where: facilityWhere, onLeave: leaveCourse } : undefined}
      onRestart={() => { resetPosition(); changeScreen('playing') }} onBuilder={openBuilder} canEdit={devEditing} onLevels={showMenu} levelsLabel={levelsLabel} onExit={onExit} />}
    {/* Outside the library, the menu screen is the facility opening, or why it could not. */}
    {!preparing && !holding && screen === 'menu' && !libraryRoute && <KeyboardDialog label={facilityError ? 'Facility unavailable' : 'Opening the facility'} focusKey="jumping-facility-status"
      onClose={onExit} className="jumping-overlay jumping-dialog-overlay jumping-ui">
      <div className="jumping-notice-panel">
        <header className="jumping-ui-heading jumping-brand-heading"><LabLogo /><h2>{facilityError ? 'The facility could not open.' : 'Opening the facility.'}</h2></header>
        <div className="jumping-notice-copy"><p role={facilityError ? 'alert' : 'status'}>{facilityError || (checkingCloud ? 'Checking your cloud saves…' : 'Loading…')}</p>
          {facilityError && catalog.errors.map(error => <p className="jumping-load-error" role="alert" key={error}>{error}</p>)}</div>
        <div className="jumping-notice-actions">
          {facilityError && <button onClick={() => { setFacilityError(''); void startFacility() }}>Try again</button>}
          {import.meta.env.DEV && <button onClick={() => visit(JUMPING_LIBRARY)}>Level library</button>}
          <button onClick={onExit}>Back to arcade</button>
        </div>
      </div>
    </KeyboardDialog>}
    {!preparing && screen === 'menu' && libraryRoute && <KeyboardDialog label={LAB_NAME} focusKey="jumping-menu"
      onClose={onExit} className="jumping-overlay jumping-level-screen jumping-ui">
      <div className="jumping-menu jumping-level-menu">
        <div className="jumping-menu-header">
          <div className="jumping-menu-heading jumping-brand-heading">
            <LabLogo />
          </div>
          <div className="jumping-menu-navigation"><button onClick={onExit}>Back to arcade</button>{devEditing && <button disabled={builtIn.refreshing} onClick={openBuilder}>{testing ? 'Return to builder' : 'Level studio'}</button>}
            <button onClick={() => visit(JUMPING_FACILITY)}>Facility</button></div>
          <AccountSurface />
        </div>
          {devEditing && <div className="jumping-library-bar">
            <button disabled={builtIn.busy} onClick={() => void builtIn.refresh()}>Refresh built-in levels</button>
          </div>}
          <div className="jumping-library-status">
            {catalog.errors.map(error => <p className="jumping-load-error" role="alert" key={error}>{error}</p>)}
            {devEditing && deleteError && <p className="jumping-load-error" role="alert">{deleteError}</p>}
          </div>
          {routeNotice && <p className="jumping-route-notice" role="status">{routeNotice}</p>}
          {import.meta.env.DEV && <details className="jumping-stress-levels">
            <summary>Stress tests · Development</summary>
            {stressCatalog.errors.map(error => <p className="jumping-load-error" role="alert" key={error}>{error}</p>)}
            <div className="jumping-level-cards">{stressCatalog.files.map(file => <div key={file.fileName} className="jumping-level-tile">
              <button className="jumping-level-card" onClick={() => startStressFile(file)} aria-label={`Play ${file.level.name}`}>
                <LevelThumbnail level={file.level} /><strong>{file.level.name}</strong>
              </button>
            </div>)}</div>
          </details>}
          {!files.length && !catalog.errors.length && !builtIn.restoring && <p role="status">No levels are available.</p>}
          <div className="jumping-level-browser">
          <div className="jumping-level-cards" data-menu-grid data-controller-scroll onPointerMove={event => {
            if (event.pointerType === 'mouse') {
              const dialog = event.currentTarget.closest<HTMLElement>('.game-dialog')
              if (dialog) dialog.dataset.inputMethod = 'pointer'
            }
          }}>{files.filter(file => !('level' in file) || !isHubLevel(file.level)).map((file, index) => {
            if ('missing' in file) return <div key={file.fileName} className="jumping-level-tile jumping-missing-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)}>
              <div className="jumping-level-card"><MissingLevelNotice fileName={file.fileName} compact /></div>
              {devEditing && <div className="jumping-level-tile-actions"><DeleteLevelButton fileName={file.fileName} primary disabled={builtIn.busy || !builtIn.canWrite} onClick={() => void deleteFile(file)} /></div>}
            </div>
            const level = file.level
            if (!unlocked.has(file.fileName)) return <div key={file.fileName} className="jumping-level-tile jumping-locked-tile">
              <div className="jumping-level-card" role="img" aria-label={`Level ${index + 1}: Locked`}>
                <div className="jumping-locked-preview" aria-hidden="true"><svg viewBox="0 0 32 40" fill="none" stroke="currentColor" strokeWidth="3"><path d="M8 17v-6a8 8 0 0 1 16 0v6" /><rect x="3" y="17" width="26" height="20" rx="2" /><path d="M16 24v6" /></svg></div>
                <strong>Level {index + 1}</strong><span className="jumping-level-progress">Locked</span>
              </div>
            </div>
            const problems = levelProblems(level), needsRepair = problems.length > 0
            const progressId = `jumping-level-progress-${index}`
            const issuesId = `jumping-level-issues-${index}`
            return <div key={file.fileName} className="jumping-level-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)}>
            <button className="jumping-level-card" data-menu-primary data-initial-focus={highlighted === file.fileName || undefined}
              onPointerEnter={event => {
                if (event.pointerType === 'mouse') {
                  const dialog = event.currentTarget.closest<HTMLElement>('.game-dialog')
                  if (dialog) dialog.dataset.inputMethod = 'pointer'
                  event.currentTarget.focus({ preventScroll: true })
                }
              }}
              disabled={builtIn.refreshing} aria-pressed={highlighted === file.fileName} onClick={() => playFile(file)} aria-label={`Level ${index + 1}: ${level.name}`}
              aria-describedby={[isPuzzleLevel(level) ? progressId : '', needsRepair ? issuesId : ''].filter(Boolean).join(' ') || undefined}>
              <LevelThumbnail level={level} /><strong>{level.name}</strong>
              {isPuzzleLevel(level) && <LevelProgress id={progressId} level={level} best={bestTime(level.id)} completed={completed(level.id)} />}
            </button>
            {needsRepair && <div id={issuesId} className="jumping-level-problems" role="region" aria-label={`Level issues for ${level.name}`} data-controller-scroll>
              {problems.map(problem => <p className="jumping-load-error" role="alert" key={problem}>{problem}</p>)}
            </div>}
            <div className="jumping-level-tile-actions">
              <button className="jumping-level-play" data-menu-secondary aria-label={`Play ${level.name}`} disabled={needsRepair || builtIn.refreshing} onClick={() => playFile(file)}>Play{connected && <kbd aria-hidden="true">A</kbd>}</button>
              {devEditing && <button className="jumping-level-edit" data-menu-secondary aria-label={`Edit ${level.name}`} disabled={builtIn.refreshing} onClick={() => editFile(file)}>Edit<kbd aria-hidden="true">Y</kbd></button>}
              {devEditing && <DeleteLevelButton fileName={file.fileName} disabled={builtIn.busy || !builtIn.canWrite} onClick={() => void deleteFile(file)} />}
            </div>
            </div>
          })}</div>
          </div>
      </div>
    </KeyboardDialog>}
    {import.meta.env.DEV && devEditing && builderStarted && DevLevelBuilder && <Suspense fallback={<p role="status">Loading level studio…</p>}><DevLevelBuilder key={editorFile?.key ?? 'draft'} active={screen === 'building' && !devOpen} onPlay={testLevel} onClose={showMenu}
      levels={builtIn} initialFile={editorFile?.file} onFileChange={builderFileChanged} /></Suspense>}
    {import.meta.env.DEV && devOpen && <JumpingDevelopmentPanel onClose={() => changeDevOpen(false)}
      showPerformance={showPerformance} onPerformanceChange={changePerformance} snapshot={performanceSnapshot}
      performanceMode={performanceMode} onPerformanceModeChange={changePerformanceMode} reducedResolution={lightingReduced} />}
  </div>
}
