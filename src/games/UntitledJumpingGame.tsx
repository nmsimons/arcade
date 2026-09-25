import { levelTerrain } from './jumping/level'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { KeyboardDialog } from './hardVacuum/KeyboardDialog'
import { controlDialog, controllerDialog } from './hardVacuum/controllerUi'
import { createJumpController, keyboardMovement } from './jumping/input'
import { cancelJumpInput, playerState, respawn, STEP, stepPlayer } from './jumping/model'
import { drawPlayground } from './jumping/render'
import { blankTrial, copyLevel, levelProblems, isPuzzleLevel, levelPlayer, levelRules, prepareLevelRopes } from './jumping/level'
import type { JumpLevel, PuzzleLevel } from './jumping/level'
import { LevelBuilder } from './jumping/LevelBuilder'
import { createRun, formatTime, medalFor, readBest, saveBest, stepRun } from './jumping/challenge'
import type { Run } from './jumping/challenge'
import { loadLevelCatalog } from './jumping/levelAssets'
import type { LevelCatalog, LevelFile } from './jumping/levelAssets'
import { useLocalLevels } from './jumping/localLevels'
import { LocalFolderActions, LocalFolderPanel } from './jumping/LocalFolderPanel'
import { LevelThumbnail } from './jumping/LevelThumbnail'
import { drawChallenge } from './jumping/challengeRender'
import { JUMPING_BUILDER, JUMPING_MENU, JUMPING_PLAYTEST, jumpingRoute, levelPath } from './jumping/routes'
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
  const editorPath = useRef(JUMPING_BUILDER), playtests = useRef(new Map<number, JumpLevel>())
  const editorRevision = useRef(0)
  const [routeNotice, setRouteNotice] = useState('')
  const [catalog, setCatalog] = useState(initialCatalog), [refreshing, setRefreshing] = useState(false)
  const local = useLocalLevels()
  const [chosenCollection, setCollection] = useState<'built-in' | 'local' | null>(null)
  const collection = chosenCollection ?? (local.name ? 'local' : 'built-in')
  const [selectedName, setSelectedName] = useState(initialCatalog.files[0]?.fileName ?? '')
  const files = collection === 'built-in' ? catalog.files : local.files
  const selected = files.find(file => file.fileName === selectedName) ?? files[0]
  const selectedProblems = selected ? levelProblems(selected.level) : []
  const [playingFile, setPlayingFile] = useState({ collection: 'built-in', fileName: initialCatalog.files[0]?.fileName ?? '' })
  const playingFiles = playingFile.collection === 'built-in' ? catalog.files : local.files
  const campaignIndex = playingFiles.findIndex(file => file.fileName === playingFile.fileName)
  const nextFile = playingFiles.slice(campaignIndex + 1).find(file => levelProblems(file.level).length === 0)
  const [editorFile, setEditorFile] = useState<{ file: LevelFile; key: number } | null>(null)
  const [recordKey, setRecordKey] = useState(initialCatalog.files[0]?.level.id ?? '')
  async function refreshBuiltins() {
    setRefreshing(true)
    try { setCatalog(await loadLevelCatalog(import.meta.env.BASE_URL)) }
    catch (error) { setCatalog(previous => ({ ...previous, errors: [(error as Error).message] })) }
    finally { setRefreshing(false) }
  }
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const [initialRun] = useState(() => createRun(initialCatalog.files[0] && isPuzzleLevel(initialCatalog.files[0].level) ? initialCatalog.files[0].level : blankTrial()))
  const run = useRef<Run | null>(initialRun)
  const player = useRef(initialRun.player), keys = useRef(new Set<string>())
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
  const screenRef = useRef<Screen>('menu')
  const [connected, setConnected] = useState(false)
  const [pauseReason, setPauseReason] = useState('Take a breath. Pick up where you left off.')
  const [metrics, setMetrics] = useState({ state: 'Ready', elapsed: 0 })

  function changeScreen(next: Screen, reason?: string) {
    keys.current.clear(); controller.reset(); cancelJumpInput(player.current)
    jumpQueue.current = []; keyboardJump.current = false
    screenRef.current = next; setScreen(next)
    if (next === 'paused') setPauseReason(reason ?? 'Take a breath. Pick up where you left off.')
  }
  useLayoutEffect(() => {
    if (screen === 'playing') canvasRef.current?.focus({ preventScroll: true })
  }, [screen])
  function resetPosition() {
    if (run.current) { run.current = createRun(run.current.level); player.current = run.current.player }
    else respawn(player.current)
    keys.current.clear(); controller.reset()
    jumpQueue.current = []; keyboardJump.current = false
    canvasRef.current?.focus({ preventScroll: true })
  }
  function playChallenge(level: PuzzleLevel, fromBuilder = false, key = level.id) {
    run.current = createRun(level); player.current = run.current.player; setTrial(level); setRecordKey(key)
    setChallenge(true); setTesting(fromBuilder); setSaveError(false); changeScreen('playing')
  }
  function startChallenge() { playChallenge(trial, testing, recordKey) }
  function startFile(file: LevelFile, source = collection) {
    setSelectedName(file.fileName)
    if (levelProblems(file.level).length) return
    setPlayingFile({ collection: source, fileName: file.fileName })
    if (isPuzzleLevel(file.level)) playChallenge(file.level, false, source === 'local' ? `local:${file.level.id}` : file.level.id)
    else {
      run.current = null; setChallenge(false); setTesting(false)
      activeLevel.current = prepareLevelRopes(file.level); terrain.current = levelTerrain(file.level); rules.current = levelRules(file.level); player.current = levelPlayer(activeLevel.current)
      changeScreen('playing')
    }
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
  function editFile(file: LevelFile) { visit(levelPath('local', file.fileName, true)) }
  function openBuilder() { returnTo(builderPath.current) }
  function builderFileChanged(fileName?: string) {
    const path = fileName ? levelPath('local', fileName, true) : JUMPING_BUILDER
    editorPath.current = path; builderPath.current = path
    if (path !== location.pathname) navigate(path, { replace: true, state: location.state })
  }
  function testLevel(level: JumpLevel) {
    const testId = playtests.current.size + 1
    playtests.current.set(testId, copyLevel(level))
    visit(JUMPING_PLAYTEST, { testId })
  }
  function startTest(level: JumpLevel) {
    level = prepareLevelRopes(level)
    if (isPuzzleLevel(level)) { playChallenge(level, true); return }
    run.current = null; setChallenge(false)
    activeLevel.current = level; terrain.current = levelTerrain(level); rules.current = levelRules(level); player.current = levelPlayer(level)
    setTesting(true); changeScreen('playing')
  }
  const followRoute = useEffectEvent(() => {
    if (handledRoute.current === location.key) return
    const route = jumpingRoute(location.pathname)
    setRouteNotice('')
    if (route.screen === 'menu' || route.screen === 'missing') {
      setTesting(false); changeScreen('menu')
      if (route.screen === 'missing') setRouteNotice('That link does not point to a level or builder. Choose a level below.')
    } else if (route.screen === 'playtest') {
      const draft = playtests.current.get(location.state?.testId)
      // Drafts live only in this session. A reload cannot reconstruct a playtest.
      if (!draft) { navigate(JUMPING_BUILDER, { replace: true }); return }
      if (activePlayKey.current === location.key) changeScreen('playing')
      else { startTest(draft); activePlayKey.current = location.key }
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
        else { startFile(file, route.source); activePlayKey.current = location.key }
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
  useEffect(() => { followRoute() }, [location.key, location.pathname, catalog.files, local.files, local.status, local.busy])
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
      if (!event.repeat && collection === 'local' && selected) { event.preventDefault(); editFile(selected) }
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
        else if (screenRef.current === 'menu' && pad.pressed.includes(3) && collection === 'local' && selected) editFile(selected)
        else if (pad.pressed.includes(1)) controlDialog(dialog, 'back')
        else if (pad.pressed.includes(0)) {
          if (screenRef.current === 'menu' && selected && document.activeElement?.closest('[data-menu-item]')) playFile(selected)
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
          accumulator -= STEP
          if (run.current?.finished) { finishRun(); accumulator = 0; break }
        }
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
      cancelAnimationFrame(frame); observer.disconnect()
      window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', suspend); document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  return <div className="jumping-game" ref={rootRef}>
    <canvas ref={canvasRef} tabIndex={0} role="img" aria-label={challenge ? `${trial.name}: activate the goal` : 'Untitled Jumping Game movement playground'} />
    {screen === 'playing' && <>
      {testing && <button className="jumping-builder-return" onClick={openBuilder}>Return to builder</button>}
      <aside className="jumping-visually-hidden" aria-label="Player status">
        <span className="jumping-state">{metrics.state}</span>
        {challenge && <span role="timer" aria-label="Elapsed level time" data-testid="level-time">{formatTime(metrics.elapsed)}</span>}
      </aside>
    </>}
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
    {(screen === 'menu' || screen === 'paused') && <KeyboardDialog label={screen === 'menu' ? 'Untitled Jumping Game' : 'Game paused'} focusKey={`jumping-${screen}`}
      onClose={() => screen === 'menu' ? onExit() : changeScreen('playing')} className={`jumping-overlay ${screen === 'menu' ? 'jumping-level-screen' : ''}`}>
      <div className={`jumping-menu ${screen === 'menu' ? 'jumping-level-menu' : ''}`}>
        <div className="jumping-menu-header">
          <div className="jumping-menu-heading">
            <p className="jumping-eyebrow">{screen === 'menu' ? 'SMALL LEAPS / BETTER TIMES' : 'PAUSED'}</p>
            <h2>{screen === 'menu' ? 'Find your way across.' : 'Find your footing.'}</h2>
            <p>{screen === 'menu' ? 'One light. A few good jumps. As many tries as you need.' : pauseReason}</p>
          </div>
          {screen === 'menu' && <div className="jumping-menu-navigation"><button onClick={onExit}>Back to arcade</button><button onClick={openBuilder}>{testing ? 'Return to builder' : 'Level builder'}</button></div>}
        </div>
        {screen === 'menu' && <>
          <div className="jumping-library-bar">
            <div className="jumping-collection-tabs" role="group" aria-label="Level source">
              <button aria-label="Built-in levels" aria-pressed={collection === 'built-in'} onClick={() => setCollection('built-in')}>Built-in<span className="jumping-source-label-extra"> levels</span></button>
              <button aria-label="Local folder" aria-pressed={collection === 'local'} onClick={() => setCollection('local')}>Local<span className="jumping-source-label-extra"> folder</span></button>
            </div>
            {collection === 'local' ? <LocalFolderActions local={local} /> : <button className="jumping-library-refresh" disabled={refreshing} onClick={() => void refreshBuiltins()}>{refreshing ? 'Refreshing…' : 'Refresh levels'}</button>}
          </div>
          <div className="jumping-library-status">
            {collection === 'local' ? <LocalFolderPanel local={local} summary /> : <div className="jumping-builtin-summary">
              <strong>{files.length} built-in {files.length === 1 ? 'level' : 'levels'}</strong>
              {catalog.errors.length ? <p className="jumping-load-error" role="alert" title={catalog.errors.join('\n')}>{catalog.errors.join(' · ')}</p> : <span>Included with the game · Ordered by filename</span>}
            </div>}
          </div>
          {routeNotice && <p className="jumping-route-notice" role="status">{routeNotice}</p>}
          <div className="jumping-level-browser">
          <div key={collection} className="jumping-level-cards" data-menu-grid data-controller-scroll>{files.map((file, index) => {
            const level = file.level, record = bestTime(collection === 'local' ? `local:${level.id}` : level.id)
            const needsRepair = levelProblems(level).length > 0
            return <div key={file.fileName} className="jumping-level-tile" data-menu-item onFocusCapture={() => setSelectedName(file.fileName)} onPointerEnter={event => {
              if (event.pointerType === 'mouse') event.currentTarget.querySelector<HTMLButtonElement>('[data-menu-primary]')?.focus({ preventScroll: true })
            }}>
            <button className="jumping-level-card" data-menu-primary data-initial-focus={selected?.fileName === file.fileName || undefined}
              aria-pressed={selected?.fileName === file.fileName} onClick={() => playFile(file)} aria-label={`Level ${index + 1}: ${level.name}`}>
              <span className="level-card-number">{String(index + 1).padStart(2, '0')}</span><LevelThumbnail level={level} />
              <strong>{level.name}</strong><span>{file.fileName}</span>
              <small>{needsRepair ? 'Needs repair' : record !== null && isPuzzleLevel(level) ? `${medalFor(record, level)} · ${formatTime(record)}` : 'Ready to try'}</small>
            </button>
            <div className="jumping-level-tile-actions">
              <button className="jumping-level-play" data-menu-secondary aria-label={`Play ${level.name}`} disabled={needsRepair} onClick={() => playFile(file)}>Play{connected && <kbd aria-hidden="true">A</kbd>}</button>
              {collection === 'local' && <button className="jumping-level-edit" data-menu-secondary aria-label={`Edit ${level.name}`} onClick={() => editFile(file)}>Edit{connected && <kbd aria-hidden="true">Y</kbd>}</button>}
            </div>
            </div>
          })}{!files.length && <p className="jumping-empty-levels">{collection === 'built-in' ? 'No built-in levels available.' : local.status === 'ready' ? 'No levels in this folder yet.' : 'Open your folder to see its levels here.'}</p>}</div>
          <div className="jumping-level-detail">
            <div className="jumping-level-preview">{selected && <LevelThumbnail level={selected.level} />}</div>
            <h3 title={selected?.level.name}>{selected?.level.name ?? 'Select a level'}</h3>
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
          <p>Ledges and ropes catch automatically. Press jump to leave a rope or kick away from a wall.</p>
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
    <input ref={local.picker} aria-label="Open local level folder" type="file" {...{ webkitdirectory: '', directory: '' }} multiple hidden onChange={e => void local.importFolder(e.target.files)} />
    {builderStarted && <LevelBuilder key={editorFile?.key ?? 'draft'} active={screen === 'building'} onPlay={testLevel} onClose={showMenu}
      templates={catalog.files} local={local} initialFile={editorFile?.file} onFileChange={builderFileChanged} /> }
  </div>
}
