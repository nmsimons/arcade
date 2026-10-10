import { LightingRenderer, lightingPixelRatio } from './jumping/lightingRender'
import { lightingForLevel } from './jumping/lightingDefinition'
import { LevelSaveStatus } from '../accounts/LevelSaveStatus'
import { AccountSurface } from '../accounts/AccountSurface'
import { useCloudDownloads } from '../accounts/useCloudDownloads'
import { playgroundLightingWorld } from './jumping/lightingModel'
import { GameCamera } from './jumping/camera'
import { levelTerrain } from './jumping/level'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { createJumpTouch } from './jumping/touchInput'
import { JumpingTouchControls } from './jumping/JumpingTouchControls'
import { cancelJumpInput, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { actionFeedbackText, playerActionFeedback } from './jumping/actionFeedback'
import type { ActionFeedback } from './jumping/actionFeedback'
import { blankTrial, copyLevel, levelProblems, isPuzzleLevel, levelRules } from './jumping/level'
import type { JumpLevel, PuzzleLevel } from './jumping/level'
import { LevelBuilder } from './jumping/LevelBuilder'
import { createRun, formatTime, readBest, saveBest, setWaterEffectsEnabled, stepRun } from './jumping/challenge'
import type { Run } from './jumping/challenge'
import { loadLevelCatalog } from './jumping/levelAssets'
import type { LevelCatalog, LevelFile, LocalLevelEntry } from './jumping/levelAssets'
import { levelFileName, missingManifestPrompt, useLocalLevels } from './jumping/localLevels'
import { LocalFolderActions } from './jumping/LocalFolderPanel'
import { LevelThumbnail } from './jumping/LevelThumbnail'
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
import type { LevelSource } from './jumping/routes'
import { useWallTextFont } from './jumping/useWallTextFont'
import { currentProfile, gameStorage } from '../accounts/profileStorage'
import { accountLevelRepository } from '../accounts/levelLibrary'
import './jumping/jumping.css'
import './jumping/dialogs.css'
import './jumping/interface.css'

type Screen = 'menu' | 'playing' | 'paused' | 'building' | 'complete'
const COLLECTION_KEY = 'arcade.jumping.collection.v1'
const PLAY_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyX', 'Space', 'ShiftLeft', 'ShiftRight', 'Escape'])

export function UntitledJumpingGame({ onExit }: { onExit: () => void }) {
  useWallTextFont()
  const [accountLevels, setAccountLevels] = useState(() => !!currentProfile())
  const [catalog, setCatalog] = useState<LevelCatalog | null>(null)
  useEffect(() => {
    let active = true
    loadLevelCatalog(import.meta.env.BASE_URL).then(result => { if (active) setCatalog(result) }, error => {
      if (active) setCatalog({ files: [], errors: [error.message] })
    })
    return () => { active = false }
  }, [])
  return catalog ? <JumpingGameSession key={String(accountLevels)} accountLevels={accountLevels} onAccountLevels={setAccountLevels} initialCatalog={catalog} onExit={onExit} /> : <div className="jumping-game jumping-loading"><p role="status">Loading levels…</p><button onClick={onExit}>Back to arcade</button></div>
}

function JumpingGameSession({ initialCatalog, onExit, accountLevels, onAccountLevels }: { initialCatalog: LevelCatalog; onExit: () => void; accountLevels: boolean; onAccountLevels: (value: boolean) => void }) {
  const location = useLocation(), navigate = useNavigate()
  const handledRoute = useRef(''), activePlayKey = useRef(''), builderPath = useRef(JUMPING_BUILDER)
  const editorPath = useRef(JUMPING_BUILDER), playtests = useRef(new Map<number, { level: JumpLevel; path: string; builderPath: string }>())
  const editorRevision = useRef(0)
  const [routeNotice, setRouteNotice] = useState('')
  const [playerStorage] = useState(() => gameStorage())
  const [accountRepository] = useState(() => accountLevels ? accountLevelRepository(playerStorage) : undefined)
  const local = useLocalLevels(accountRepository, 'Account levels', 'account')
  const { picker: folderPicker } = local
  const [repository] = useState(() => createDevLevelRepository())
  const builtIn = useLocalLevels(repository ?? null), devEditing = !!repository
  const catalog = devEditing && !builtIn.restoring ? builtIn : initialCatalog
  const [editorSource, setEditorSource] = useState<LevelSource>('local')
  const [chosenCollection, setChosenCollection] = useState<LevelSource | null>(() => {
    try {
      const saved = localStorage.getItem(COLLECTION_KEY)
      return saved === 'built-in' || saved === 'local' ? saved : null
    } catch { return null }
  })
  const hasBuiltIns = devEditing || catalog.files.length > 0 || catalog.errors.length > 0
  const collection = hasBuiltIns ? chosenCollection ?? 'built-in' : 'local'
  function setCollection(source: LevelSource) {
    setChosenCollection(source)
    try { localStorage.setItem(COLLECTION_KEY, source) } catch { /* Keep the choice for this visit when storage is unavailable. */ }
  }
  const [selectedName, setSelectedName] = useState(initialCatalog.files[0]?.fileName ?? '')
  const menuStore = collection === 'built-in' && devEditing ? builtIn : local
  const canEditCollection = collection === 'local' || devEditing
  const files = collection === 'built-in' ? devEditing && !builtIn.restoring ? builtIn.entries : catalog.files : local.entries
  const selectedEntry = files.find(file => file.fileName === selectedName) ?? files[0]
  const selected = selectedEntry && 'level' in selectedEntry ? selectedEntry : undefined
  const deleting = useRef(false)
  const [deleteError, setDeleteError] = useState('')
  async function deleteFile(file: LocalLevelEntry) {
    if (deleting.current || menuStore.busy) return
    deleting.current = true; setDeleteError('')
    try { await menuStore.remove(file); setRouteNotice('') }
    catch (error) { setDeleteError((error as Error).message) }
    finally { deleting.current = false }
  }
  const selectedProblems = selected ? levelProblems(selected.level) : []
  const [playingFile, setPlayingFile] = useState({ collection: 'built-in', fileName: initialCatalog.files[0]?.fileName ?? '' })
  const playingFiles = playingFile.collection === 'built-in' ? catalog.files : local.files
  const campaignIndex = playingFiles.findIndex(file => file.fileName === playingFile.fileName)
  const nextFile = playingFiles.slice(campaignIndex + 1).find(file => levelProblems(file.level).length === 0)
  const [editorFile, setEditorFile] = useState<{ file: LevelFile; key: number } | null>(null)
  const [recordKey, setRecordKey] = useState(initialCatalog.files[0]?.level.id ?? '')
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const [initialRun] = useState(() => createRun(blankTrial()))
  const run = useRef<Run | null>(initialRun)
  const player = useRef(initialRun.player), keys = useRef(new Set<string>())
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
  const [result, setResult] = useState({ elapsed: 0, medal: 'No medal' })
  const [challenge, setChallenge] = useState(true)
  const [trial, setTrial] = useState<PuzzleLevel>(initialRun.level)
  const [bestTimes, setBestTimes] = useState<Record<string, number | null>>({})
  function bestTime(id: string) { try { return bestTimes[id] ?? readBest(playerStorage, id) } catch { return null } }
  const best = bestTime(recordKey)
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
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [metrics, setMetrics] = useState<{state:string;elapsed:number;actions:ActionFeedback|null}>({ state: 'Ready', elapsed: 0, actions:null })

  function changeScreen(next: Screen, reason?: string) {
    if (next !== screenRef.current) { performanceMonitor?.reset(); adaptiveLighting?.suspend() }
    if (next === 'menu' || next === 'building') {
      setPerformanceSnapshot(null); adaptiveLighting?.reset(); setLightingReduced(false)
      if (run.current) setWaterEffectsEnabled(run.current, true)
    }
    audio.current?.silence()
    if (next === 'paused' && screenRef.current === 'playing' && !reason) audio.current?.pauseCue()
    audioState.reset(player.current, run.current)
    keys.current.clear(); controller.reset(); touch.reset(); cancelJumpInput(player.current)
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
    if (screen === 'playing') canvasRef.current?.focus({ preventScroll: true })
  }, [screen])
  function resetPosition() {
    performanceMonitor?.reset(); setPerformanceSnapshot(null)
    adaptiveLighting?.reset(); setLightingReduced(false)
    if (preparedStart.current?.run) {
      const world = clonePreparedLevel(preparedStart.current)
      run.current = world.run; player.current = world.player!
      lightingRenderer.state.reset()
      if (world.lighting) lightingRenderer.prepare(world.run?.level ?? world.level, world.lighting)
    }
    else respawn(player.current)
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
  function startFile(file: LevelFile, source = collection) {
    setSelectedName(file.fileName)
    if (levelProblems(file.level).length) return
    setPlayingFile({ collection: source, fileName: file.fileName })
    void beginPlay(file.level, false, source === 'local' ? `local:${file.level.id}` : file.level.id)
  }
  function visit(path: string, state = {}) {
    navigate(path, { state: { from: location.pathname, ...state } })
  }
  function returnTo(path: string) {
    if (location.state?.from === path) navigate(-1)
    else visit(path)
  }
  function showMenu() { returnTo(JUMPING_MENU) }
  function playFile(file: LevelFile, source = collection) {
    setSelectedName(file.fileName)
    if (!levelProblems(file.level).length) visit(levelPath(source, file.fileName))
  }
  function editFile(file: LevelFile) { visit(levelPath(collection, file.fileName, true)) }
  function openBuilder() { returnTo(!builderStarted && devEditing && collection === 'built-in' ? JUMPING_BUILTIN_BUILDER : builderPath.current) }
  function builderFileChanged(fileName?: string, source: LevelSource = editorSource) {
    setEditorSource(source)
    const path = fileName ? levelPath(source, fileName, true) : source === 'built-in' ? JUMPING_BUILTIN_BUILDER : JUMPING_BUILDER
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
    const targetSource = route.screen === 'level' ? route.source : route.screen === 'builder' ? route.file?.source ?? route.source : route.screen === 'playtest' ? route.file?.source : undefined
    if (targetSource === 'built-in' && devEditing && builtIn.restoring) return
    if (route.screen === 'builder' || route.screen === 'playtest' && route.file) setEditorSource(devEditing && targetSource === 'built-in' ? 'built-in' : 'local')
    if (route.screen === 'playtest') {
      const draft = playtests.current.get(location.state?.testId)
      if (draft?.path === location.pathname) {
        const draftRoute = jumpingRoute(draft.builderPath)
        setEditorSource(devEditing && draftRoute.screen === 'builder' && (draftRoute.file?.source ?? draftRoute.source) === 'built-in' ? 'built-in' : 'local')
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
      // Legacy draft playtest links return to the builder; folder playtests reload their saved level.
      if (!route.file) { navigate(JUMPING_BUILDER, { replace: true }); return }
    }
    if (route.screen === 'menu' || route.screen === 'missing') {
      setTesting(false); changeScreen('menu')
      if (route.screen === 'missing') setRouteNotice('That link does not point to a level or builder. Choose a level below.')
    } else {
      if (route.screen === 'builder' && builderStarted && editorPath.current === location.pathname) {
        builderPath.current = location.pathname; changeScreen('building')
        handledRoute.current = location.key
        return
      }
      const target = route.screen === 'level' ? route : route.file
      const file = target && (target.source === 'local' ? local.files : catalog.files).find(file => file.fileName === target.fileName)
      if (target) {
        setCollection(target.source); setSelectedName(target.fileName)
        if (!file) {
          changeScreen('menu'); setTesting(false)
          setRouteNotice(target.source === 'local' && local.status !== 'ready'
            ? `Open the local folder containing ${target.fileName} to continue.`
            : `Could not find ${target.fileName}. Refresh the levels or choose another file.`)
          // Keep the destination pending while folder access or files are restored.
          return
        }
      }
      if (route.screen === 'level' && file) {
        if (levelProblems(file.level).length) { changeScreen('menu'); setRouteNotice('This level needs repair before it can be played.'); return }
        if (activePlayKey.current === location.key) { setTesting(false); changeScreen('playing') }
        else startFile(file, route.source)
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { followRoute() }, [location.key, location.pathname, catalog.files, local.files, local.status, local.busy, builtIn.restoring, builtIn.status, builtIn.busy])
  const finishRun = useEffectEvent(() => {
    if (!run.current?.finished || screenRef.current !== 'playing') return
    setResult({ elapsed: run.current.elapsed, medal: run.current.medal ?? 'No medal' })
    if (!testing) {
      const { elapsed } = run.current
      try { const time = saveBest(playerStorage, elapsed, recordKey); setBestTimes(previous => ({ ...previous, [recordKey]: time })); setSaveError(false) }
      catch { setBestTimes(previous => ({ ...previous, [recordKey]: Math.min(previous[recordKey] ?? Infinity, elapsed) })); setSaveError(true) }
    }
    changeScreen('complete')
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
    if (screenRef.current === 'menu' && event.code === 'KeyY' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (!event.repeat && canEditCollection && selected) { event.preventDefault(); editFile(selected) }
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
      keys.current.add(event.code)
    }
  })
  const suspend = useEffectEvent(() => {
    keys.current.clear(); controller.reset(); touch.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    if (screenRef.current === 'playing') changeScreen('paused', 'Paused while the game was out of focus.')
  })
  const reorient = useEffectEvent(() => {
    touch.reset()
    if (screenRef.current === 'playing') changeScreen('paused', 'Paused after the screen orientation changed.')
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
    if (pad.disconnected && screenRef.current === 'playing') {
      changeScreen('paused', `Controller disconnected. Reconnect, or continue with ${touchAvailable ? 'touch controls' : 'the keyboard'}.`)
      return null
    }
    if (screenRef.current !== 'playing') {
      if (screenRef.current === 'building') return null
      const dialog = controllerDialog(rootRef.current)
      if (dialog) {
        if (pad.pause && screenRef.current === 'paused') changeScreen('playing')
        else if (screenRef.current === 'menu' && pad.pressed.includes(3) && canEditCollection && selected) editFile(selected)
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
    const motion = import.meta.env.DEV || new URLSearchParams(window.location.search).get('motionDebug') === '1'
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
      const nextRatio = lightingPixelRatio(width, height, window.devicePixelRatio || 1, adaptiveLighting.reduced)
      if (ratio !== nextRatio) { ratio = nextRatio; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio) }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      // Fractional render scales round the backing dimensions to whole pixels.
      // Frame against the drawable area so rounding cannot shift the view.
      const camera = gameCamera.view(canvas.width / ratio, canvas.height / ratio, player.current, level, !!run.current, dt)
      lightingStats = lightingRenderer.render(ctx, run.current ?? playgroundLightingWorld(level, player.current), lightingForLevel(level),
        { ...camera, width: canvas.width, height: canvas.height, zoom: camera.zoom * ratio }, dt)
    }
    paintFrame.current = paint
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
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
            swimVertical: input.swimVertical || Number(gesture.descend) - Number(gesture.climb),
            climb: input.climb || gesture.climb, descend: input.descend || gesture.descend,
            drop: input.drop || gesture.drop, detach: input.detach || gesture.detach, crouch: input.crouch || gesture.crouch,
            jump: input.jump || keyboardJump.current || gesture.jump,
            jumpStrength: gesture.jump ? gesture.jumpStrength : undefined }
          if (run.current) stepRun(run.current, controls)
          else stepPlayer(player.current, controls, STEP, terrain.current, activeLevel.current.climbables, rules.current)
          const report = motion?.step(player.current, controls, STEP, (run.current?.level ?? activeLevel.current).id)
          if (report) console.warn('[Jumping motion] Repeated oscillation detected', report)
          audioState.step(player.current, run.current, STEP)
          accumulator -= STEP
          if (run.current?.finished) { finishRun(); accumulator = 0; break }
        }
        sound.update(audioState.drain())
      } else { accumulator = 0; motion?.reset() }
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
        setMetrics({ state: run.current?.exit ? 'Entering the exit' : playerState(p),
          elapsed: run.current?.elapsed ?? 0, actions:run.current?.exit ? null : playerActionFeedback(p,activeLevel.current.climbables) })
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

  const manifestPrompt = missingManifestPrompt(local)
  return <div className={`jumping-game${screen === 'playing' && !devOpen ? ' jumping-playing' : ''}`} ref={rootRef} onPointerDownCapture={() => audio.current?.unlock()} onKeyDownCapture={() => audio.current?.unlock()}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={challenge ? `${trial.name}: reach the exit` : 'Untitled Jumping Game movement playground'} />
    {screen === 'playing' && <>
      {!devOpen && <JumpingTouchControls canvasRef={canvasRef} reader={touch} active available={touchAvailable}
        onTouch={() => setTouchAvailable(true)} onPause={() => changeScreen('paused')} />}
      {import.meta.env.DEV && showPerformance && !devOpen && <PerformancePanel snapshot={performanceSnapshot} />}
      {testing && <button className="jumping-builder-return" title="Return to the level editor" onClick={openBuilder}>Return to builder</button>}
      {!devOpen && metrics.actions && <p className="jumping-action-hint" aria-label="Available actions">
        {actionFeedbackText(metrics.actions,connected?'controller':touchAvailable?'touch':'keyboard')}
      </p>}
      <aside className="jumping-visually-hidden" aria-label="Player status">
        <span className="jumping-state">{metrics.state}</span>
        {challenge && <span role="timer" aria-label="Elapsed level time" data-testid="level-time">{formatTime(metrics.elapsed)}</span>}
      </aside>
    </>}
    {preparing && <KeyboardDialog label="Preparing level" focusKey="jumping-preparing" onClose={cancelPreparation} className="jumping-overlay jumping-dialog-overlay jumping-ui">
      <div className="jumping-notice-panel">
        <header className="jumping-ui-heading"><p className="jumping-eyebrow">UNTITLED JUMPING GAME</p><h2>Preparing level.</h2></header>
        <div className="jumping-notice-copy"><p role="status">{preparing}</p></div>
        <div className="jumping-notice-actions"><button onClick={cancelPreparation}>Cancel</button></div>
      </div>
    </KeyboardDialog>}
    {screen === 'complete' && <JumpingResultDialog level={trial} elapsed={result.elapsed} medal={result.medal} best={best}
      testing={testing} saveError={saveError} onNext={!testing && campaignIndex >= 0 && nextFile ? () => playFile(nextFile, playingFile.collection as 'built-in' | 'local') : undefined}
      onRetry={startChallenge} onBuilder={openBuilder} onLevels={showMenu} onExit={onExit} />}
    {!preparing && screen === 'paused' && <JumpingPauseDialog name={challenge ? trial.name : activeLevelName} reason={pauseReason}
      connected={connected} touchControls={touchAvailable} testing={testing} challenge={challenge} onResume={() => changeScreen('playing')}
      onRestart={() => { resetPosition(); changeScreen('playing') }} onBuilder={openBuilder} onLevels={showMenu} onExit={onExit} />}
    {!preparing && screen === 'menu' && <KeyboardDialog label="Untitled Jumping Game" focusKey="jumping-menu"
      onClose={onExit} className="jumping-overlay jumping-level-screen jumping-ui">
      <div className="jumping-menu jumping-level-menu">
        <div className="jumping-menu-header">
          <div className="jumping-menu-heading">
            <p className="jumping-eyebrow">UNTITLED JUMPING GAME</p><h2>Levels.</h2>
          </div>
          <div className="jumping-menu-navigation"><button onClick={onExit}>Back to arcade</button><button disabled={local.refreshing} onClick={openBuilder}>{testing ? 'Return to builder' : 'Level studio'}</button></div>
          <AccountSurface />
        </div>
          <div className="jumping-library-bar">
            <div className="jumping-collection-tabs" role="group" aria-label="Level source">
              {hasBuiltIns && <button aria-label="Built-in levels" aria-pressed={collection === 'built-in'} onClick={() => setCollection('built-in')}>Built-in<span className="jumping-source-label-extra"> levels</span></button>}
              <button aria-label={accountLevels ? 'Account levels' : 'Local folder'} aria-pressed={collection === 'local'} onClick={() => setCollection('local')}>{accountLevels ? 'Account levels' : <>Local<span className="jumping-source-label-extra"> folder</span></>}</button>
            </div>
            {collection === 'local' && local.name && <span className="jumping-library-folder" title={local.name}>{accountLevels ? 'Saved locally · Cloud sync is automatic' : local.name}</span>}
            {canEditCollection && <LocalFolderActions local={menuStore} />}
            {!!currentProfile() && <button onClick={() => onAccountLevels(!accountLevels)}>{accountLevels ? 'Use local folder' : 'Use account levels'}</button>}
          </div>
          <div className="jumping-library-status">
            {collection === 'local' && manifestPrompt && <p className="jumping-folder-note" role="status">{manifestPrompt}</p>}
            {(collection === 'local' ? local.errors : catalog.errors).map(error => <p className="jumping-load-error" role="alert" key={error}>{error}</p>)}
            {canEditCollection && deleteError && <p className="jumping-load-error" role="alert">{deleteError}</p>}
            {collection === 'local' && local.status === 'reconnect' && local.notice && <p className="jumping-load-error" role="status">{local.notice}</p>}
          </div>
          {routeNotice && <p className="jumping-route-notice" role="status">{routeNotice}</p>}
          <div className="jumping-level-browser">
          <div key={collection} className="jumping-level-cards" data-menu-grid data-controller-scroll onPointerMove={event => {
            if (event.pointerType === 'mouse') {
              const dialog = event.currentTarget.closest<HTMLElement>('.game-dialog')
              if (dialog) dialog.dataset.inputMethod = 'pointer'
            }
          }}>{files.map((file, index) => {
            if ('missing' in file) return <div key={file.fileName} className="jumping-level-tile jumping-missing-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)}>
              <div className="jumping-level-card"><MissingLevelNotice fileName={file.fileName} compact /></div>
              <div className="jumping-level-tile-actions"><DeleteLevelButton fileName={file.fileName} primary disabled={menuStore.busy || !menuStore.canWrite} onClick={() => void deleteFile(file)} /></div>
            </div>
            const level = file.level
            const needsRepair = levelProblems(level).length > 0
            return <div key={file.fileName} className="jumping-level-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)}>
            <button className="jumping-level-card" data-menu-primary data-initial-focus={selected?.fileName === file.fileName || undefined}
              onPointerEnter={event => {
                if (event.pointerType === 'mouse') {
                  const dialog = event.currentTarget.closest<HTMLElement>('.game-dialog')
                  if (dialog) dialog.dataset.inputMethod = 'pointer'
                  event.currentTarget.focus({ preventScroll: true })
                }
              }}
              disabled={local.refreshing} aria-pressed={selected?.fileName === file.fileName} onClick={() => playFile(file)} aria-label={`Level ${index + 1}: ${level.name}`}>
              <LevelThumbnail level={level} /><strong>{level.name}</strong>
              {collection === 'local' && accountLevels && <LevelSaveStatus kind="account" fileName={file.fileName} text={file.sourceText} />}
            </button>
            <div className="jumping-level-tile-actions">
              <button className="jumping-level-play" data-menu-secondary aria-label={`Play ${level.name}`} disabled={needsRepair || local.refreshing} onClick={() => playFile(file)}>Play{connected && <kbd aria-hidden="true">A</kbd>}</button>
              {canEditCollection && <button className="jumping-level-edit" data-menu-secondary aria-label={`Edit ${level.name}`} disabled={local.refreshing} onClick={() => editFile(file)}>Edit<kbd aria-hidden="true">Y</kbd></button>}
              {canEditCollection && <DeleteLevelButton fileName={file.fileName} disabled={menuStore.busy || !menuStore.canWrite} onClick={() => void deleteFile(file)} />}
            </div>
            </div>
          })}</div>
          <div className="jumping-level-detail">
            <div className="jumping-level-detail-heading">
              <h3 title={selected?.level.name}>{selected?.level.name}</h3>
              <div className="jumping-medal-times">{selected && isPuzzleLevel(selected.level) && <><span className="gold">Gold {selected.level.times.gold}s</span><span>Silver {selected.level.times.silver}s</span><span className="bronze">Bronze {selected.level.times.bronze}s</span></>}</div>
            </div>
            {selectedProblems.length > 0 && <div key={`${collection}:${selected?.fileName}`} className="jumping-level-problems" role="region" aria-label="Level issues" data-controller-scroll>
              {selectedProblems.map(problem => <p className="jumping-load-error" role="alert" key={problem}>{problem}</p>)}
            </div>}
          </div>
          </div>
      </div>
    </KeyboardDialog>}
    <input ref={folderPicker} aria-label="Open local level folder" type="file" {...{ webkitdirectory: '', directory: '' }} multiple hidden onChange={e => void local.importFolder(e.target.files)} />
    {builderStarted && <LevelBuilder key={editorFile?.key ?? 'draft'} active={screen === 'building' && !devOpen} onPlay={testLevel} onClose={showMenu}
      templates={devEditing ? [] : catalog.files} local={editorSource === 'built-in' && devEditing ? builtIn : local} collections={devEditing ? { local, builtIn } : undefined} initialFile={editorFile?.file} onFileChange={builderFileChanged} /> }
    {import.meta.env.DEV && devOpen && <JumpingDevelopmentPanel onClose={() => changeDevOpen(false)}
      showPerformance={showPerformance} onPerformanceChange={changePerformance} snapshot={performanceSnapshot}
      performanceMode={performanceMode} onPerformanceModeChange={changePerformanceMode} reducedResolution={lightingReduced} />}
  </div>
}
