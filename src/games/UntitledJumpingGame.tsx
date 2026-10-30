import { LightingRenderer, lightingPixelRatio } from './jumping/lightingRender'
import { LabLogo } from '../branding/LabLogo'
import { LAB_NAME } from '../branding/lab'
import { lightingForLevel } from './jumping/lightingDefinition'
import { usesRegionLighting } from './jumping/environment'
import { AccountSurface } from '../accounts/AccountSurface'
import { useCloudDownloads } from '../accounts/useCloudDownloads'
import { playgroundLightingWorld } from './jumping/lightingModel'
import { awakeningCamera, GameCamera } from './jumping/camera'
import { advanceBusEnding, busEndingFrame, BUS_ENDING_SECONDS, createBusDeparture, createBusEnding } from './jumping/busEnding'
import type { BusEnding, EndingCamera } from './jumping/busEnding'
import { drawBusEnding } from './jumping/busEndingRender'
import { levelTerrain } from './jumping/level'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, lazy, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { createJumpTouch } from './jumping/touchInput'
import { cancelGadgetInput } from './jumping/gadgets'
import { JumpingTouchControls } from './jumping/JumpingTouchControls'
import { cancelJumpInput, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { blankTrial, copyLevel, levelProblems, isPuzzleLevel, levelRules } from './jumping/level'
import type { JumpLevel, PuzzleLevel } from './jumping/level'
import { BEST_TIME_KEY, createRun, formatTime, readBest, saveBest, setWaterEffectsEnabled, stepRun } from './jumping/challenge'
import type { Run } from './jumping/challenge'
import { advanceEntranceAnimation, createEntranceAnimation, entranceDuration } from './jumping/goal'
import { COMPLETION_KEY, readCompleted, saveCompleted } from './jumping/completion'
import { gradeClock } from './jumping/grading'
import { passedLevel, unlockedLevels } from './jumping/progression'
import type { EntranceAnimation } from './jumping/goal'
import { loadLevelCatalog } from './jumping/levelAssets'
import type { LevelCatalog, LevelFile, LocalLevelEntry } from './jumping/levelAssets'
import { levelFileName } from './jumping/levelFiles'
import { useBuiltInLevels } from './jumping/builtInLevels'
import { LevelThumbnail } from './jumping/LevelThumbnail'
import { LevelProgress } from './jumping/LevelProgress'
import { JumpingPauseDialog, JumpingResultDialog } from './jumping/JumpingDialogs'
import { DeleteLevelButton, MissingLevelNotice } from './jumping/LevelFileActions'
import { JUMPING_BUILDER, JUMPING_BUILTIN_BUILDER, JUMPING_MENU, jumpingRoute, levelPath, playtestPath } from './jumping/routes'
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
  const [challenge, setChallenge] = useState(true)
  const [trial, setTrial] = useState<PuzzleLevel>(initialRun.level)
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
  const unlocked = unlockedLevels(catalog.files, file => passedLevel(file.level, bestTime(file.level.id), completed(file.level.id)))
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
  useCloudDownloads(screen === 'menu')
  const [preparing, setPreparing] = useState<string | null>(null)
  const playPreparation = useRef<AbortController | null>(null), preparedStart = useRef<PreparedLevel | null>(null)
  useEffect(() => () => { playPreparation.current?.abort(); playPreparation.current = null }, [location.key])
  const screenRef = useRef<Screen>('menu')
  const endingScene = useRef<BusEnding | null>(null), lastCamera = useRef<EndingCamera>({ x: 0, y: 0, zoom: 1 })
  const pauseReturn = useRef<'playing' | 'ending'>('playing')
  const [endingPhase, setEndingPhase] = useState('')
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [metrics, setMetrics] = useState({ state: 'Ready', elapsed: 0, grade: 'A', remaining: 0 })

  function changeScreen(next: Screen, reason?: string) {
    if (next === 'paused' && (screenRef.current === 'playing' || screenRef.current === 'ending')) pauseReturn.current = screenRef.current
    if (next === 'menu' || next === 'building' || next === 'playing' && screenRef.current !== 'paused') endingScene.current = null
    if (next !== screenRef.current) { performanceMonitor?.reset(); adaptiveLighting?.suspend() }
    if (next === 'menu' || next === 'building') {
      setPerformanceSnapshot(null); adaptiveLighting?.reset(); setLightingReduced(false)
      if (run.current) setWaterEffectsEnabled(run.current, true)
    }
    audio.current?.silence()
    if (next === 'paused' && screenRef.current === 'playing' && !reason) audio.current?.pauseCue()
    audioState.reset(player.current, run.current)
    keys.current.clear(); controller.reset(); touch.reset(); cancelJumpInput(player.current)
    if (run.current) cancelGadgetInput(run.current)
    jumpQueue.current = []; keyboardJump.current = false
    screenRef.current = next; setScreen(next)
    if (next === 'building' || next === 'menu') lightingRenderer.release()
    if (next === 'paused') setPauseReason(reason ?? '')
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
      lightingRenderer.state.reset()
      if (world.lighting) lightingRenderer.prepare(world.run?.level ?? world.level, world.lighting)
    }
    else respawn(player.current)
    playgroundEntrance.current = run.current ? null : createEntranceAnimation(player.current, levelTerrain(activeLevel.current), activeLevel.current.entrance)
    keys.current.clear(); controller.reset(); touch.reset()
    jumpQueue.current = []; keyboardJump.current = false
    canvasRef.current?.focus({ preventScroll: true })
  }
  async function beginPlay(level: JumpLevel, fromBuilder: boolean, key: string) {
    playPreparation.current?.abort()
    const controller = new AbortController(); playPreparation.current = controller
    changeScreen(fromBuilder ? 'building' : 'menu'); setPreparing(level.name)
    try {
      const prepared = await prepareLevelInWorker(level, { signal: controller.signal, play: true })
      if (controller.signal.aborted) return
      preparedStart.current = prepared
      const world = clonePreparedLevel(prepared)
      run.current = world.run; player.current = world.player!
      lightingRenderer.state.reset()
      if (world.lighting) lightingRenderer.prepare(world.run?.level ?? world.level, world.lighting)
      activePlayKey.current = location.key
      if (world.run) { setTrial(world.run.level); setRecordKey(key) }
      else { activeLevel.current = world.level; setActiveLevelName(world.level.name); terrain.current = levelTerrain(world.level); rules.current = levelRules(world.level) }
      playgroundEntrance.current = world.run ? null : createEntranceAnimation(player.current, terrain.current, activeLevel.current.entrance)
      setChallenge(!!world.run); setTesting(fromBuilder); setSaveError(false); changeScreen('playing'); paintFrame.current()
    } catch (error) {
      if (controller.signal.aborted) return
      activePlayKey.current = ''; changeScreen('menu'); setTesting(false)
      setRouteNotice(`Could not open “${level.name}”: ${(error as Error).message}`)
    } finally {
      if (playPreparation.current === controller) { playPreparation.current = null; setPreparing(null) }
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
    setPlayingFile({ collection: 'development', fileName: file.fileName })
    void beginPlay(file.level, false, `stress:${file.level.id}`)
  }
  function visit(path: string, state = {}) {
    navigate(path, { state: { from: location.pathname, ...state } })
  }
  function returnTo(path: string) {
    if (location.state?.from === path) navigate(-1)
    else visit(path)
  }
  function showMenu() {
    if (import.meta.env.DEV && playingFile.collection === 'development' && location.pathname === JUMPING_MENU) {
      setTesting(false); changeScreen('menu')
    } else returnTo(JUMPING_MENU)
  }
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
  function cancelPreparation() {
    playPreparation.current?.abort(); playPreparation.current = null; setPreparing(null)
    navigate(screen === 'building' ? builderPath.current : JUMPING_MENU, { replace: true })
  }
  const followRoute = useEffectEvent(() => {
    if (handledRoute.current === location.key) return
    const route = jumpingRoute(location.pathname)
    setRouteNotice(''); setPreparing(null)
    if (!devEditing && location.pathname.startsWith(JUMPING_BUILDER)) {
      navigate(JUMPING_MENU, { replace: true }); return
    }
    if (devEditing && builtIn.restoring) return
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
    if (route.screen === 'menu' || route.screen === 'missing') {
      setTesting(false); changeScreen('menu')
      if (route.screen === 'missing') setRouteNotice('That level link is unavailable. Choose a level below.')
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
          changeScreen('menu'); setTesting(false)
          setRouteNotice(`Could not find ${target.fileName}. Choose another level.`)
          return
        }
      }
      if (route.screen === 'level' && file) {
        if (!unlocked.has(file.fileName)) {
          changeScreen('menu'); setTesting(false); setSelectedName(catalog.files[0]?.fileName ?? '')
          setRouteNotice('That level is locked. Finish the preceding levels with a D or better.'); return
        }
        if (levelProblems(file.level).length) { changeScreen('menu'); setRouteNotice('This level needs repair before it can be played.'); return }
        if (activePlayKey.current === location.key) { setTesting(false); changeScreen('playing') }
        else startFile(file)
      } else if (route.screen === 'playtest' && file) {
        if (levelProblems(file.level).length) { changeScreen('menu'); setRouteNotice('This level needs repair before it can be played.'); return }
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
  useEffect(() => { followRoute() }, [location.key, location.pathname, catalog.files, builtIn.restoring, builtIn.busy])
  const finishRun = useEffectEvent(() => {
    if (!run.current?.finished || screenRef.current !== 'playing') return
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
    if (!run.current.failed && (run.current.level.goal.kind === 'bus' || run.current.level.goal.ending === 'bus')) {
      endingScene.current = run.current.level.goal.kind === 'bus'
        ? createBusDeparture(run.current.level.goal, player.current, lastCamera.current)
        : createBusEnding(run.current.level.width, run.current.level.goal.y, player.current, lastCamera.current)
      if (run.current.level.goal.kind === 'bus') run.current.busDeparture = endingScene.current
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
        if (pad.pause && screenRef.current === 'paused') changeScreen(pauseReturn.current)
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
    const debugWindow = window as Window & { jumpingMotion?: { read: () => ReturnType<JumpingMotionDiagnostics['read']> } }
    const motionView = motion ? { read: () => motion.read() } : undefined
    if (motionView) debugWindow.jumpingMotion = motionView
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
      lightingStats = lightingRenderer.render(ctx, run.current ?? playgroundLightingWorld(level, player.current, playgroundEntrance.current), lightingForLevel(level),
        { ...camera, width: canvas.width, height: canvas.height, zoom: camera.zoom * ratio }, dt)
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
    window.addEventListener('keydown', handleKey); window.addEventListener('keyup', keyup)
    window.addEventListener('blur', suspend); document.addEventListener('visibilitychange', visibility)
    window.addEventListener('orientationchange', reorient)
    const tick = (now: number) => {
      const measuring = import.meta.env.DEV && performanceEnabled.current && !devOpenRef.current && screenRef.current === 'playing' && !document.hidden
      const started = measuring ? performance.now() : 0
      let steps = 0
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now
      const input = frameInput(now)
      if (input) {
        accumulator += dt
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
        setMetrics({ state: entering ? entering.kind === 'charging-bay' ? 'Waking up' : 'Entering the level' : run.current?.exit ? 'Entering the exit' : playerState(p),
          elapsed: run.current?.elapsed ?? 0,
          ...(run.current ? gradeClock(run.current.level, run.current.elapsed, run.current.failed) : { grade: 'A', remaining: 0 }) })
        published = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      sound.dispose(); audio.current = null; lightingRenderer.dispose(); paintFrame.current = () => {}
      if (motionView && debugWindow.jumpingMotion === motionView) delete debugWindow.jumpingMotion
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('orientationchange', reorient)
    }
  }, [audioState, lightingRenderer, performanceMonitor, adaptiveLighting, touch])

  return <div className={`jumping-game${screen === 'playing' && !devOpen ? ' jumping-playing' : ''}`} ref={rootRef} onPointerDownCapture={() => audio.current?.unlock()} onKeyDownCapture={() => audio.current?.unlock()}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={challenge ? `${trial.name}: reach the exit` : `${LAB_NAME} movement playground`}
      onPointerDown={event => { if (event.pointerType === 'mouse' && event.button === 0 && screenRef.current === 'playing') { touch.gadgetAction('use'); canvasRef.current?.focus() } }} />
    {screen === 'playing' && <>
      {!devOpen && <JumpingTouchControls canvasRef={canvasRef} reader={touch} active available={touchAvailable}
        gadgets={!!trial.props?.some(prop => prop.gadget)}
        onTouch={() => setTouchAvailable(true)} onPause={() => changeScreen('paused')} />}
      {import.meta.env.DEV && showPerformance && !devOpen && <PerformancePanel snapshot={performanceSnapshot} />}
      {testing && <button className="jumping-builder-return" title="Return to the level editor" onClick={openBuilder}>Return to builder</button>}
      <aside className="jumping-visually-hidden" aria-label="Player status">
        <span className="jumping-state">{metrics.state}</span>
        {challenge && trial.timing !== 'untimed' && <span className="jumping-grade-status">Grade {metrics.grade}{metrics.grade === 'F' ? ' · Exploration run; restart to progress.' : ` · ${Math.ceil(metrics.remaining)} seconds remaining`}</span>}
        {challenge && trial.timing !== 'untimed' && <span role="timer" aria-label="Elapsed level time" data-testid="level-time">{formatTime(metrics.elapsed)}</span>}
      </aside>
    </>}
    {screen === 'ending' && <>
      <p className="jumping-visually-hidden" role="status" aria-live="polite" aria-label={trial.goal.kind === 'bus' ? 'Bus departure' : 'Ending scene'}>{endingPhase}</p>
    </>}
    {preparing && <KeyboardDialog label="Preparing level" focusKey="jumping-preparing" onClose={cancelPreparation} className="jumping-overlay jumping-dialog-overlay jumping-ui">
      <div className="jumping-notice-panel">
        <header className="jumping-ui-heading jumping-brand-heading"><LabLogo /><h2>Preparing level.</h2></header>
        <div className="jumping-notice-copy"><p role="status">{preparing}</p></div>
        <div className="jumping-notice-actions"><button onClick={cancelPreparation}>Cancel</button></div>
      </div>
    </KeyboardDialog>}
    {screen === 'complete' && <JumpingResultDialog level={trial} elapsed={result.elapsed} grade={result.grade} best={best}
      testing={testing} saveError={saveError} onNext={!testing && result.grade !== 'F' && campaignIndex >= 0 && nextFile && unlocked.has(nextFile.fileName) ? () => playFile(nextFile) : undefined}
      onRetry={startChallenge} onBuilder={openBuilder} canEdit={devEditing} onLevels={showMenu} onExit={onExit} />}
    {!preparing && screen === 'paused' && <JumpingPauseDialog name={challenge ? trial.name : activeLevelName} reason={pauseReason}
      connected={connected} touchControls={touchAvailable} testing={testing} challenge={challenge} onResume={() => changeScreen(pauseReturn.current)}
      onRestart={() => { resetPosition(); changeScreen('playing') }} onBuilder={openBuilder} canEdit={devEditing} onLevels={showMenu} onExit={onExit} />}
    {!preparing && screen === 'menu' && <KeyboardDialog label={LAB_NAME} focusKey="jumping-menu"
      onClose={onExit} className="jumping-overlay jumping-level-screen jumping-ui">
      <div className="jumping-menu jumping-level-menu">
        <div className="jumping-menu-header">
          <div className="jumping-menu-heading jumping-brand-heading">
            <LabLogo />
          </div>
          <div className="jumping-menu-navigation"><button onClick={onExit}>Back to arcade</button>{devEditing && <button disabled={builtIn.refreshing} onClick={openBuilder}>{testing ? 'Return to builder' : 'Level studio'}</button>}</div>
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
          }}>{files.map((file, index) => {
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
            <button className="jumping-level-card" data-menu-primary data-initial-focus={selected?.fileName === file.fileName || undefined}
              onPointerEnter={event => {
                if (event.pointerType === 'mouse') {
                  const dialog = event.currentTarget.closest<HTMLElement>('.game-dialog')
                  if (dialog) dialog.dataset.inputMethod = 'pointer'
                  event.currentTarget.focus({ preventScroll: true })
                }
              }}
              disabled={builtIn.refreshing} aria-pressed={selected?.fileName === file.fileName} onClick={() => playFile(file)} aria-label={`Level ${index + 1}: ${level.name}`}
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
