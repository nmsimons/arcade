import { levelTerrain } from './jumping/level'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { cancelJumpInput, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { drawPlayground } from './jumping/render'
import { blankTrial, copyLevel, levelProblems, isPuzzleLevel, levelRules } from './jumping/level'
import type { JumpLevel, PuzzleLevel } from './jumping/level'
import { LevelBuilder } from './jumping/LevelBuilder'
import { createRun, formatTime, readBest, saveBest, stepRun } from './jumping/challenge'
import type { Run } from './jumping/challenge'
import { loadLevelCatalog } from './jumping/levelAssets'
import type { LevelCatalog, LevelFile, MissingLevelFile } from './jumping/levelAssets'
import { levelFileName, missingManifestPrompt, useLocalLevels } from './jumping/localLevels'
import { LocalFolderActions } from './jumping/LocalFolderPanel'
import { LevelThumbnail } from './jumping/LevelThumbnail'
import { DeleteLevelButton, DeleteLevelDialog, MissingLevelNotice } from './jumping/LevelFileActions'
import { drawChallenge } from './jumping/challengeRender'
import { JUMPING_BUILDER, JUMPING_BUILTIN_BUILDER, JUMPING_MENU, jumpingRoute, levelPath, playtestPath } from './jumping/routes'
import { JumpingAudioState } from './jumping/audioState'
import { JumpingSoundSession } from './jumping/sound'
import { clonePreparedLevel, prepareLevelInWorker } from './jumping/levelPreparation'
import type { PreparedLevel } from './jumping/levelPreparation'
import { createDevLevelRepository } from './jumping/devLevelRepository'
import type { LevelSource } from './jumping/routes'
import './jumping/jumping.css'

type Screen = 'menu' | 'playing' | 'paused' | 'building' | 'complete'
const PLAY_KEYS = new Set(['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyX', 'Space', 'ShiftLeft', 'ShiftRight', 'Escape'])

export function UntitledJumpingGame({ onExit }: { onExit: () => void }) {
  const [catalog, setCatalog] = useState<LevelCatalog | null>(null)
  useEffect(() => {
    let active = true
    loadLevelCatalog(import.meta.env.BASE_URL).then(result => { if (active) setCatalog(result) }, error => {
      if (active) setCatalog({ files: [], errors: [error.message] })
    })
    return () => { active = false }
  }, [])
  return catalog ? <JumpingGameSession initialCatalog={catalog} onExit={onExit} /> : <div className="jumping-game jumping-loading"><p role="status">Loading levels…</p><button onClick={onExit}>Back to arcade</button></div>
}

function JumpingGameSession({ initialCatalog, onExit }: { initialCatalog: LevelCatalog; onExit: () => void }) {
  const location = useLocation(), navigate = useNavigate()
  const handledRoute = useRef(''), activePlayKey = useRef(''), builderPath = useRef(JUMPING_BUILDER)
  const editorPath = useRef(JUMPING_BUILDER), playtests = useRef(new Map<number, { level: JumpLevel; path: string; builderPath: string }>())
  const editorRevision = useRef(0)
  const [routeNotice, setRouteNotice] = useState('')
  const local = useLocalLevels()
  const [repository] = useState(() => createDevLevelRepository())
  const builtIn = useLocalLevels(repository ?? null), devEditing = !!repository
  const catalog = devEditing && !builtIn.restoring ? builtIn : initialCatalog
  const [editorSource, setEditorSource] = useState<LevelSource>('local')
  const [chosenCollection, setCollection] = useState<'built-in' | 'local' | null>(null)
  const hasBuiltIns = devEditing || catalog.files.length > 0 || catalog.errors.length > 0
  const collection = chosenCollection ?? (local.name || !hasBuiltIns ? 'local' : 'built-in')
  const [selectedName, setSelectedName] = useState(initialCatalog.files[0]?.fileName ?? '')
  const menuStore = collection === 'built-in' && devEditing ? builtIn : local
  const canEditCollection = collection === 'local' || devEditing
  const files = collection === 'built-in' ? devEditing && !builtIn.restoring ? builtIn.entries : catalog.files : local.entries
  const selectedEntry = files.find(file => file.fileName === selectedName) ?? files[0]
  const selected = selectedEntry && 'level' in selectedEntry ? selectedEntry : undefined
  const [deleteTarget, setDeleteTarget] = useState<MissingLevelFile | null>(null)
  const deleting = useRef(false)
  const [deleteError, setDeleteError] = useState('')
  async function deleteFile(file: LevelFile) {
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
  const [audioState] = useState(() => new JumpingAudioState())
  const [result, setResult] = useState({ elapsed: 0, medal: 'No medal' })
  const [challenge, setChallenge] = useState(true)
  const [trial, setTrial] = useState<PuzzleLevel>(initialRun.level)
  const [bestTimes, setBestTimes] = useState<Record<string, number | null>>({})
  function bestTime(id: string) { try { return bestTimes[id] ?? readBest(localStorage, id) } catch { return null } }
  const best = bestTime(recordKey)
  const [saveError, setSaveError] = useState(false)
  const terrain = useRef(levelTerrain(initialRun.level))
  const activeLevel = useRef<JumpLevel>(initialRun.level), rules = useRef(levelRules(initialRun.level))
  const [builderStarted, setBuilderStarted] = useState(false), [testing, setTesting] = useState(false)
  const jumpQueue = useRef<boolean[]>([]), keyboardJump = useRef(false)
  const [controller] = useState(createJumpController)
  const [screen, setScreen] = useState<Screen>('menu')
  const [preparing, setPreparing] = useState<string | null>(null)
  const playPreparation = useRef<AbortController | null>(null), preparedStart = useRef<PreparedLevel | null>(null)
  useEffect(() => () => { playPreparation.current?.abort(); playPreparation.current = null }, [location.key])
  const screenRef = useRef<Screen>('menu')
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('Take a breath. Pick up where you left off.')
  const [metrics, setMetrics] = useState({ state: 'Ready', elapsed: 0 })

  function changeScreen(next: Screen, reason?: string) {
    audio.current?.silence()
    if (next === 'paused' && screenRef.current === 'playing' && !reason) audio.current?.pauseCue()
    audioState.reset(player.current, run.current)
    keys.current.clear(); controller.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    screenRef.current = next; setScreen(next)
    if (next === 'paused') setPauseReason(reason ?? 'Take a breath. Pick up where you left off.')
  }
  useLayoutEffect(() => {
    if (screen === 'playing') canvasRef.current?.focus({ preventScroll: true })
  }, [screen])
  function resetPosition() {
    if (preparedStart.current?.run) {
      const world = clonePreparedLevel(preparedStart.current)
      run.current = world.run; player.current = world.player!
    }
    else respawn(player.current)
    keys.current.clear(); controller.reset()
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
      activePlayKey.current = location.key
      if (world.run) { setTrial(world.run.level); setRecordKey(key) }
      else { activeLevel.current = world.level; terrain.current = levelTerrain(world.level); rules.current = levelRules(world.level) }
      setChallenge(!!world.run); setTesting(fromBuilder); setSaveError(false); changeScreen('playing')
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
  useEffect(() => { followRoute() }, [location.key, location.pathname, catalog.files, local.files, local.status, local.busy, builtIn.restoring, builtIn.status, builtIn.busy])
  const finishRun = useEffectEvent(() => {
    if (!run.current?.finished || screenRef.current !== 'playing') return
    setResult({ elapsed: run.current.elapsed, medal: run.current.medal ?? 'No medal' })
    if (!testing) {
      const { elapsed } = run.current
      try { const time = saveBest(localStorage, elapsed, recordKey); setBestTimes(previous => ({ ...previous, [recordKey]: time })); setSaveError(false) }
      catch { setBestTimes(previous => ({ ...previous, [recordKey]: Math.min(previous[recordKey] ?? Infinity, elapsed) })); setSaveError(true) }
    }
    changeScreen('complete')
  })
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (screenRef.current === 'menu' && event.code === 'KeyY' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (!deleteTarget && !event.repeat && canEditCollection && selected) { event.preventDefault(); editFile(selected) }
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
    keys.current.clear(); controller.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    if (screenRef.current === 'playing') changeScreen('paused', 'Paused while the game was out of focus.')
  })
  const frameInput = useEffectEvent((now: number) => {
    let pads: (Gamepad | null)[] = []
    try { pads = [...navigator.getGamepads?.() ?? []] } catch { /* Keyboard stays available. */ }
    const pad = controller.sample(pads, screenRef.current, now, document.hasFocus() && !document.hidden)
    if (pad.pressed.length || Math.abs(pad.move) > .1) audio.current?.unlock()
    if (pad.connected !== connected) setConnected(pad.connected)
    if (pad.disconnected && screenRef.current === 'playing') {
      changeScreen('paused', 'Controller disconnected. Reconnect, or continue with the keyboard.')
      return null
    }
    if (screenRef.current !== 'playing') {
      if (screenRef.current === 'building') return null
      const dialog = controllerDialog(rootRef.current)
      if (dialog) {
        if (pad.pause && screenRef.current === 'paused') changeScreen('playing')
        else if (!deleteTarget && screenRef.current === 'menu' && pad.pressed.includes(3) && canEditCollection && selected) editFile(selected)
        else if (pad.pressed.includes(1)) controlDialog(dialog, 'back')
        else if (pad.pressed.includes(0)) {
          if (!deleteTarget && screenRef.current === 'menu' && selected && document.activeElement?.closest('[data-menu-item]') && !document.activeElement.classList.contains('level-file-delete')) playFile(selected)
          else controlDialog(dialog, 'confirm')
        }
        else if (pad.navigation) controlDialog(dialog, pad.navigation)
      }
      return null
    }
    if (pad.pause) { changeScreen('paused'); return null }
    const k = keys.current, keyboard = keyboardMovement(k)
    return { move: keyboard || pad.move, jump: pad.jump,
      climb: k.has('KeyW') || k.has('ArrowUp') || pad.climb,
      drop: k.has('KeyS') || k.has('ArrowDown') || k.has('KeyX') || pad.drop,
      descend: k.has('KeyS') || k.has('ArrowDown') || pad.descend, detach: k.has('KeyX') || pad.detach,
      crouch: pad.crouch, reach: pad.reach }
  })

  useEffect(() => {
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!
    // The context itself is deferred until a pointer, keyboard or controller action.
    const sound = new JumpingSoundSession()
    audio.current = sound
    audioState.reset(player.current, run.current)
    let width = 0, height = 0, ratio = 1, frame = 0, previous = 0, accumulator = 0, published = 0
    const paint = () => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (run.current) drawChallenge(ctx, width, height, run.current)
      else drawPlayground(ctx, width, height, player.current, activeLevel.current)
    }
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
    const tick = (now: number) => {
      const dt = previous ? Math.min(.05, (now - previous) / 1000) : 0; previous = now
      const input = frameInput(now)
      if (input) {
        accumulator += dt
        while (accumulator >= STEP) {
          // Preserve even a complete keyboard tap between two rendered frames.
          if (jumpQueue.current.length) keyboardJump.current = jumpQueue.current.shift()!
          const controls = { ...input, jump: input.jump || keyboardJump.current }
          if (run.current) stepRun(run.current, controls)
          else stepPlayer(player.current, controls, STEP, terrain.current, activeLevel.current.climbables, rules.current)
          audioState.step(player.current, run.current, STEP)
          accumulator -= STEP
          if (run.current?.finished) { finishRun(); accumulator = 0; break }
        }
        sound.update(audioState.drain())
      } else accumulator = 0
      paint()
      if (now - published > 80) {
        const p = player.current
        setMetrics({ state: run.current?.exit ? 'Entering the exit' : run.current?.goalLit ? 'Exit open' : playerState(p),
          elapsed: run.current?.elapsed ?? 0 })
        published = now
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      sound.dispose(); audio.current = null
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', visibility)
    }
  }, [audioState])

  const manifestPrompt = missingManifestPrompt(local)
  return <div className="jumping-game" ref={rootRef} onPointerDownCapture={() => audio.current?.unlock()} onKeyDownCapture={() => audio.current?.unlock()}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={challenge ? `${trial.name}: activate the goal` : 'Untitled Jumping Game movement playground'} />
    {screen === 'playing' && <>
      {testing && <button className="jumping-builder-return" onClick={openBuilder}>Return to builder</button>}
      <aside className="jumping-visually-hidden" aria-label="Player status">
        <span className="jumping-state">{metrics.state}</span>
        {challenge && <span role="timer" aria-label="Elapsed level time" data-testid="level-time">{formatTime(metrics.elapsed)}</span>}
      </aside>
    </>}
    {preparing && <KeyboardDialog label="Preparing level" focusKey="jumping-preparing" onClose={cancelPreparation} className="jumping-overlay">
      <div className="jumping-menu jumping-result"><h2>Preparing level…</h2><p>{preparing}</p><button onClick={cancelPreparation}>Cancel</button></div>
    </KeyboardDialog>}
    {screen === 'complete' && <KeyboardDialog label="Level complete" focusKey="jumping-complete" onClose={startChallenge} className="jumping-overlay">
      <div className="jumping-menu jumping-result">
        <p className="jumping-eyebrow">{trial.name.toUpperCase()} / {testing ? 'TEST COMPLETE' : 'COMPLETE'}</p><h2>Level complete.</h2>
        <div className={`jumping-medal ${result.medal.toLowerCase().replace(' ', '-')}`} aria-hidden="true">{result.medal === 'No medal' ? '⚑' : '★'}</div>
        <p className="jumping-result-time">{formatTime(result.elapsed)}</p>
        <p>{result.medal === 'No medal' ? 'Level complete. Another run, another route.' : `${result.medal} medal`}</p>
        <div className="jumping-medal-times"><span className="gold">Gold ≤ {trial.times.gold}s</span><span>Silver ≤ {trial.times.silver}s</span><span className="bronze">Bronze ≤ {trial.times.bronze}s</span></div>
        {!testing && best !== null && <p>Personal best {formatTime(best)}</p>}
        {saveError && <p role="status">Your time is kept for this visit. Browser storage is unavailable.</p>}
        <div className="jumping-actions">{!testing && campaignIndex >= 0 && nextFile && <button className="jumping-primary" onClick={() => playFile(nextFile, playingFile.collection as 'built-in' | 'local')}>Next level <span aria-hidden="true">→</span></button>}{testing && <button className="jumping-primary" onClick={openBuilder}>Return to builder</button>}<button onClick={startChallenge}>Try again <span aria-hidden="true">↗</span></button><button onClick={showMenu}>Level menu</button><button onClick={onExit}>Back to arcade</button></div>
      </div>
    </KeyboardDialog>}
    {!preparing && (screen === 'menu' || screen === 'paused') && <KeyboardDialog label={screen === 'menu' ? 'Untitled Jumping Game' : 'Game paused'} focusKey={`jumping-${screen}`}
      onClose={() => screen === 'menu' ? onExit() : changeScreen('playing')} className={`jumping-overlay ${screen === 'menu' ? 'jumping-level-screen' : ''}`}>
      <div className={`jumping-menu ${screen === 'menu' ? 'jumping-level-menu' : ''}`}>
        <div className="jumping-menu-header">
          <div className="jumping-menu-heading">
            {screen === 'menu' ? <h2>Untitled Jumping Game</h2> : <>
              <p className="jumping-eyebrow">PAUSED</p><h2>Find your footing.</h2><p>{pauseReason}</p>
            </>}
          </div>
          {screen === 'menu' && <div className="jumping-menu-navigation"><button onClick={onExit}>Back to arcade</button><button onClick={openBuilder}>{testing ? 'Return to builder' : 'Level builder'}</button></div>}
        </div>
        {screen === 'menu' && <>
          <div className="jumping-library-bar">
            <div className="jumping-collection-tabs" role="group" aria-label="Level source">
              {hasBuiltIns && <button aria-label="Built-in levels" aria-pressed={collection === 'built-in'} onClick={() => setCollection('built-in')}>Built-in<span className="jumping-source-label-extra"> levels</span></button>}
              <button aria-label="Local folder" aria-pressed={collection === 'local'} onClick={() => setCollection('local')}>Local<span className="jumping-source-label-extra"> folder</span></button>
            </div>
            {collection === 'local' && local.name && <span className="jumping-library-folder" title={local.name}>{local.name}</span>}
            {canEditCollection && <LocalFolderActions local={menuStore} />}
          </div>
          <div className="jumping-library-status">
            {collection === 'local' && manifestPrompt && <p className="jumping-folder-note" role="status">{manifestPrompt}</p>}
            {(collection === 'local' ? local.errors : catalog.errors).map(error => <p className="jumping-load-error" role="alert" key={error}>{error}</p>)}
            {canEditCollection && deleteError && <p className="jumping-load-error" role="alert">{deleteError}</p>}
            {collection === 'local' && local.status === 'reconnect' && local.notice && <p className="jumping-load-error" role="status">{local.notice}</p>}
          </div>
          {routeNotice && <p className="jumping-route-notice" role="status">{routeNotice}</p>}
          <div className="jumping-level-browser">
          <div key={collection} className="jumping-level-cards" data-menu-grid data-controller-scroll>{files.map((file, index) => {
            if ('missing' in file) return <div key={file.fileName} className="jumping-level-tile jumping-missing-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)}>
              <div className="jumping-level-card"><MissingLevelNotice fileName={file.fileName} compact /></div>
              <div className="jumping-level-tile-actions"><DeleteLevelButton fileName={file.fileName} primary disabled={menuStore.busy || !menuStore.canWrite} onClick={() => setDeleteTarget(file)} /></div>
            </div>
            const level = file.level
            const needsRepair = levelProblems(level).length > 0
            return <div key={file.fileName} className="jumping-level-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)} onPointerEnter={event => {
              if (event.pointerType === 'mouse') event.currentTarget.querySelector<HTMLButtonElement>('[data-menu-primary]')?.focus({ preventScroll: true })
            }}>
            <button className="jumping-level-card" data-menu-primary data-initial-focus={selected?.fileName === file.fileName || undefined}
              aria-pressed={selected?.fileName === file.fileName} onClick={() => playFile(file)} aria-label={`Level ${index + 1}: ${level.name}`}>
              <LevelThumbnail level={level} /><strong>{level.name}</strong>
            </button>
            <div className="jumping-level-tile-actions">
              <button className="jumping-level-play" data-menu-secondary aria-label={`Play ${level.name}`} disabled={needsRepair} onClick={() => playFile(file)}>Play{connected && <kbd aria-hidden="true">A</kbd>}</button>
              {canEditCollection && <button className="jumping-level-edit" data-menu-secondary aria-label={`Edit ${level.name}`} onClick={() => editFile(file)}>Edit<kbd aria-hidden="true">Y</kbd></button>}
              {canEditCollection && <DeleteLevelButton fileName={file.fileName} disabled={menuStore.busy || !menuStore.canWrite} onClick={() => void deleteFile(file)} />}
            </div>
            </div>
          })}</div>
          <div className="jumping-level-detail">
            <div className="jumping-level-preview">{selected && <LevelThumbnail level={selected.level} />}</div>
            <h3 title={selected?.level.name}>{selected?.level.name}</h3>
            <div key={`${collection}:${selected?.fileName}`} className="jumping-level-description" role="region" aria-label="Level description" data-controller-scroll>
              <p>{selected?.level.description}</p>
              {selectedProblems.map(problem => <p className="jumping-load-error" role="alert" key={problem}>{problem}</p>)}
            </div>
            <div className="jumping-medal-times">{selected && isPuzzleLevel(selected.level) && <><span className="gold">Gold {selected.level.times.gold}s</span><span>Silver {selected.level.times.silver}s</span><span>Bronze {selected.level.times.bronze}s</span></>}</div>
          </div>
          </div>
        </>}
        {screen === 'paused' && <section className="jumping-controls" aria-label="How to play">
          <dl>
            <div><dt>Move / swing</dt><dd><kbd>{connected ? 'L stick / D-pad' : 'A D / ← →'}</kbd></dd></div>
            <div><dt>Hold, release to jump</dt><dd><kbd>{connected ? 'A / ×' : 'Space'}</kbd></dd></div>
            <div><dt>Climb / descend</dt><dd><kbd>{connected ? '↑ ↓' : 'W S / ↑ ↓'}</kbd></dd></div>
            <div><dt>Drop</dt><dd><kbd>{connected ? 'B / ○' : 'X'}</kbd></dd></div>
            {!connected && <div><dt>Walk</dt><dd><kbd>Shift</kbd></dd></div>}
          </dl>
          <p>Ledges and ropes catch automatically. Press Up to pull up from a ledge. Hold Jump to charge; release to jump, including from ledges, ropes, ladders, walls, and slopes.</p>
        </section>}
        {screen === 'paused' && <div className="jumping-actions">
            <button data-initial-focus className="jumping-primary" onClick={() => changeScreen('playing')}>Resume <kbd aria-hidden="true">{connected ? 'Menu' : 'Esc'}</kbd></button>
            <button onClick={() => { resetPosition(); changeScreen('playing') }}>{challenge ? 'Restart level' : 'Reset position'}</button>
            <button onClick={openBuilder}>{testing ? 'Return to builder' : 'Level builder'}</button>
            <button onClick={showMenu}>Level menu</button>
            <button onClick={onExit}>Back to arcade</button>
        </div>}
      </div>
    </KeyboardDialog>}
    {screen === 'menu' && deleteTarget && <DeleteLevelDialog entry={deleteTarget} local={menuStore} onClose={() => setDeleteTarget(null)} onDeleted={() => setRouteNotice('')} />}
    <input ref={local.picker} aria-label="Open local level folder" type="file" {...{ webkitdirectory: '', directory: '' }} multiple hidden onChange={e => void local.importFolder(e.target.files)} />
    {builderStarted && <LevelBuilder key={editorFile?.key ?? 'draft'} active={screen === 'building'} onPlay={testLevel} onClose={showMenu}
      templates={devEditing ? [] : catalog.files} local={editorSource === 'built-in' && devEditing ? builtIn : local} collections={devEditing ? { local, builtIn } : undefined} initialFile={editorFile?.file} onFileChange={builderFileChanged} /> }
  </div>
}
