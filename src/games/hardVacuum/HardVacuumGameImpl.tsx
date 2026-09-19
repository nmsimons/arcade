import { useEffect, useRef, useState, useCallback } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import type { HardVacuumGameProps, Vector2 } from './types'
import type { BerthId } from './campaignWorld'
import type { ShipUpgrade } from './upgrades'
import type { SupplyPurchase } from './supplies'
import { sounds } from './sound'
import { ExpeditionHud, ExpeditionOverlay, StationSurveyControls } from './expeditionUi'
import { DevelopmentPanel } from './DevelopmentPanel'
import { regionForRoom } from './campaign'
import { freshExpedition, sectorAt } from './expedition'
import { createExpeditionSaveSession } from './expeditionSave'
import { createGameSession } from './gameSession'
import type { GameCommand } from './gameSession'
import { playSessionAudio } from './sessionAudio'
import { surveyView } from './surveyView'
import { RED_ROCK_DETONATION_DELAY } from './tuning'
import { FLIGHT_KEYS, flightInput } from './flightInput'
import { drawHardVacuumFrame } from './render'
import { stepShipAppearance, stepHullSparks } from './shipRender'

/** Browser adapter: focus, input, menus, snapshots, audio, storage and presentation only. */
export function HardVacuumGame({ onExit }: HardVacuumGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasSizeRef = useRef({ width: 800, height: 600 })
  const [saveSession] = useState(createExpeditionSaveSession)
  const [session] = useState(() => createGameSession(saveSession.load.status === 'valid' ? saveSession.load.expedition : freshExpedition(), { seed: Date.now() >>> 0 }))
  const [view, setView] = useState(() => session.snapshot())
  const { gameState, expedition, shields, hud, lostCredits } = view
  const [hasSave, setHasSave] = useState(saveSession.load.status === 'valid')
  const [saveIssue, setSaveIssue] = useState('')
  const [exitSaveFailed, setExitSaveFailed] = useState(false)
  const [loadBlocked, setLoadBlocked] = useState(!['valid', 'missing'].includes(saveSession.load.status) || (saveSession.load.status === 'missing' && saveSession.backup.status === 'valid'))
  const mapOpenRef = useRef(false)
  const [mapOpen, setMapOpen] = useState(false)
  const mapOverviewRef = useRef(false)
  const [mapOverview, setMapOverview] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const mapZoomRef = useRef(1)
  const mapFocusRef = useRef<Vector2 | undefined>(undefined)
  const [journalOpen, setJournalOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const devOpenRef = useRef(false)
  const [devMapRevealed, setDevMapRevealed] = useState(false)
  const persistExpedition = useCallback(() => {
    const result = saveSession.save(session.expedition)
    if (result.status === 'saved') {
      setSaveIssue(''); setExitSaveFailed(false); setHasSave(true)
    } else if ('message' in result) setSaveIssue(result.message)
    return result.status === 'saved' || result.status === 'inactive'
  }, [saveSession, session])
  const flushEvents = useCallback(() => {
    let publish = false, persist = false
    for (const event of session.drainEvents()) {
      if (event.type === 'audio') playSessionAudio(event)
      else if (event.type === 'persist') persist = true
      else publish = true
    }
    if (publish) setView(session.snapshot())
    if (persist) persistExpedition()
  }, [session, persistExpedition])
  const dispatch = useCallback((command: GameCommand) => {
    session.command(command)
    flushEvents()
  }, [session, flushEvents])
  const startGame = (fresh = false) => {
    if (fresh) saveSession.startNew()
    else if (!saveSession.activate()) return
    setLoadBlocked(false); setHasSave(true); setExitSaveFailed(false)
    mapOpenRef.current = false; setMapOpen(false)
    dispatch({ type: 'start', fresh })
  }
  const recoverSave = () => {
    const result = saveSession.recoverBackup()
    if (result.status === 'failed') { setSaveIssue(result.message); return }
    setLoadBlocked(false); setHasSave(true); setExitSaveFailed(false)
    dispatch({ type: 'load', expedition: result.expedition })
  }
  const resumeFlight = () => { setJournalOpen(false); dispatch({ type: 'resume' }) }
  const shootBlaster = () => dispatch({ type: 'blaster' })
  const rechargeRemotely = () => dispatch({ type: 'recharge' })
  const teleportHome = () => dispatch({ type: 'teleport' })
  const interact = () => dispatch({ type: 'interact' })
  const buyUpgrade = (id: ShipUpgrade) => dispatch({ type: 'upgrade', id })
  const buySupply = (id: SupplyPurchase) => dispatch({ type: 'supply', id })
  const relocateHaven = (berth: BerthId) => dispatch({ type: 'relocate', berth })
  const setDevelopmentOpen = useCallback((open: boolean) => {
    devOpenRef.current = open; setDevOpen(open)
    dispatch({ type: 'suspend', suspended: open || mapOpenRef.current })
  }, [dispatch])
  const jumpToDevelopmentLevel = (berth: BerthId) => {
    if (!import.meta.env.DEV || !saveSession.activate()) return
    setJournalOpen(false); mapOpenRef.current = false; setMapOpen(false)
    dispatch({ type: 'jump', berth }); setDevelopmentOpen(false)
  }
  const grantDevelopmentCredits = () => {
    if (import.meta.env.DEV) dispatch({ type: 'credits' })
  }
  const toggleOverview = useCallback(() => {
    mapFocusRef.current = undefined
    mapOverviewRef.current = !mapOverviewRef.current
    setMapOverview(mapOverviewRef.current)
  }, [])
  const setSurveyOpen = useCallback((open: boolean) => {
    mapOpenRef.current = open; setMapOpen(open)
    dispatch({ type: 'suspend', suspended: open || devOpenRef.current })
    if (open) {
      mapFocusRef.current = undefined
      if (import.meta.env.DEV && devMapRevealed) { mapOverviewRef.current = true; setMapOverview(true) }
      sounds.stopThrust(); sounds.stopPhaser(); sounds.stopRepairHum(); sounds.stopRadiation()
    }
  }, [dispatch, devMapRevealed])
  const toggleMapZoom = useCallback(() => {
    mapZoomRef.current = mapZoomRef.current === 1 ? 2 : 1
    mapFocusRef.current = undefined; setMapZoom(mapZoomRef.current)
  }, [])
  const panSurvey = (dx: number, dy: number) => {
    if (mapZoomRef.current === 1) return
    const pos = session.mode === 'menu' ? session.expedition.position : session.refs.shipRef.current.pos
    const { width, height } = canvasSizeRef.current
    const survey = surveyView(pos, width, height, mapOverviewRef.current, mapZoomRef.current, mapFocusRef.current)
    mapFocusRef.current = { x: survey.center.x + dx / survey.scale, y: survey.center.y + dy / survey.scale }
  }
  const toggleDevelopmentMap = () => {
    if (!import.meta.env.DEV) return
    const revealed = !devMapRevealed; setDevMapRevealed(revealed)
    if (revealed) {
      mapOverviewRef.current = true; setMapOverview(true)
      setSurveyOpen(true); setDevelopmentOpen(false)
    }
  }
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const toggle = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.code !== 'Backquote' && event.key !== String.fromCharCode(96) && event.key !== '~') return
      event.preventDefault(); event.stopImmediatePropagation()
      if (!event.repeat) setDevelopmentOpen(!devOpenRef.current)
    }
    window.addEventListener('keydown', toggle, true)
    return () => window.removeEventListener('keydown', toggle, true)
  }, [setDevelopmentOpen])
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (devOpenRef.current || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const key = e.code === 'Semicolon' ? ';' : e.key.toLowerCase()
      const mode = session.mode
      if (mapOpenRef.current) {
        if (['o', 'z', 'm', 'escape', 'p'].includes(key)) {
          e.preventDefault(); if (e.repeat) return
          if (key === 'o') toggleOverview()
          else if (key === 'z') toggleMapZoom()
          else { setSurveyOpen(false); if (key === 'p' && mode === 'playing') dispatch({ type: 'pause' }) }
        }
        return
      }
      if (key === 'escape' || key === 'p') {
        if (mode !== 'playing' && mode !== 'paused') return
        e.preventDefault(); if (!e.repeat) dispatch({ type: mode === 'playing' ? 'pause' : 'resume' }); return
      }
      if (key === 'g' && ['playing', 'paused', 'docked'].includes(mode)) {
        e.preventDefault(); if (e.repeat) return
        setJournalOpen(true); if (mode === 'playing') dispatch({ type: 'pause' }); return
      }
      if (key === 'm' && (mode === 'playing' || (import.meta.env.DEV && devMapRevealed))) {
        e.preventDefault(); if (!e.repeat) setSurveyOpen(true); return
      }
      if (mode !== 'playing' || session.expedition.campaign.journey?.riding) return
      if (e.target instanceof HTMLElement && e.target.closest('button, input, a') && ['enter',' ','tab','arrowup','arrowdown','arrowleft','arrowright','home','end'].includes(key)) return
      const actions = { e: 'interact', b: 'blaster', r: 'recharge', t: 'teleport', f: 'tether' } as const
      if (key in actions) {
        e.preventDefault(); if (!e.repeat) dispatch({ type: actions[key as keyof typeof actions] }); return
      }
      if ([...FLIGHT_KEYS, ' '].includes(key)) { e.preventDefault(); dispatch({ type: 'key', key, pressed: true }) }
    }
    const handleKeyUp = (e: KeyboardEvent) => dispatch({ type: 'key', key: e.code === 'Semicolon' ? ';' : e.key.toLowerCase(), pressed: false })
    const handleBlur = () => { if (session.mode === 'playing') dispatch({ type: 'pause' }) }
    window.addEventListener('blur', handleBlur)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('blur', handleBlur); window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp)
    }
  }, [session, dispatch, devMapRevealed, toggleOverview, toggleMapZoom, setSurveyOpen])
  useEffect(() => {
    if (gameState !== 'playing' || devOpen || mapOpen) { sounds.stopThrust(); sounds.stopRepairHum(); sounds.stopPhaser(); sounds.stopRadiation() }
    if (gameState === 'docked' && !devOpen && !mapOpen) sounds.startStoreMusic()
    else sounds.stopStoreMusic()
    return () => { sounds.stopThrust(); sounds.stopStoreMusic(); sounds.stopRepairHum(); sounds.stopPhaser(true); sounds.stopRadiation() }
  }, [gameState, devOpen, mapOpen])
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; canvasSizeRef.current = { width: canvas.width, height: canvas.height } }
    resize(); window.addEventListener('resize', resize)
    let rafId = 0, lastTime = 0
    const animate = (timestamp: number) => {
      const dt = Math.min(lastTime ? (timestamp - lastTime) / 1000 : 0, 1 / 30); lastTime = timestamp
      session.advance(timestamp); flushEvents()
      const refs = session.refs, appearance = refs.shipAppearanceRef.current
      if (!devOpenRef.current && !mapOpenRef.current && session.mode === 'playing' && !session.expedition.campaign.journey?.riding) {
        stepShipAppearance(appearance, refs.keysRef.current, dt, refs.shipRef.current.angularVelocity)
        const controls = flightInput(refs.keysRef.current)
        if (controls.forward || controls.reverse) sounds.startThrust()
        else if (appearance.turn !== 0) sounds.startThrust(.25)
        else sounds.stopThrust()
        refs.debrisRef.current.push(...stepHullSparks(appearance, refs.shipRef.current, session.expedition.shields, dt))
      } else { appearance.turn = 0; sounds.stopThrust(); stepShipAppearance(appearance, new Set(), dt); appearance.sparkDelay = 0 }
      drawHardVacuumFrame({
        ...refs, ctx, gameState: session.mode, nowMs: session.timeMs, 
        expedition: session.expedition, expeditionRuntime: refs.runtimeRef.current,
        mapOpen: mapOpenRef.current, mapOverview: mapOverviewRef.current, mapZoom: mapZoomRef.current, mapFocus: mapFocusRef.current,
        mapRevealed: import.meta.env.DEV && devMapRevealed, canvasSizeRef, RED_ROCK_DETONATION_DELAY,
        bots: refs.botsRef.current, shipAppearance: appearance, shields: session.expedition.shields,
        
      })
      rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('resize', resize); sounds.stopRepairHum(true); sounds.stopRadiation() }
  }, [session, flushEvents, devMapRevealed])
  useEffect(() => {
    if (gameState === 'playing' && !mapOpen && !devOpen) canvasRef.current?.focus({ preventScroll: true })
  }, [gameState, mapOpen, devOpen])

  const leaveGame = () => {
    sounds.stopThrust()
    sounds.stopStoreMusic()
    sounds.stopRadiation()
    onExit()
  }

  const exitToGameSelect = () => {
    if (!persistExpedition()) { setExitSaveFailed(true); return }
    leaveGame()
  }

  const setVirtualKey = (key: string, pressed: boolean) => dispatch({ type: 'key', key, pressed })

  const tapVirtualKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key }))
  }

  const holdControl = (key: string): ButtonHTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: event => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      setVirtualKey(key, true)
    },
    onPointerUp: () => setVirtualKey(key, false),
    onPointerCancel: () => setVirtualKey(key, false),
    onLostPointerCapture: () => setVirtualKey(key, false),
    onKeyDown: event => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      setVirtualKey(key, true)
    },
    onKeyUp: event => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      setVirtualKey(key, false)
    },
    onBlur: () => setVirtualKey(key, false),
  })

  const holdButtonClass =
    'touch-none select-none min-w-12 w-12 h-12 sm:min-w-16 sm:w-16 sm:h-16 rounded-full border-2 border-white/45 bg-black/65 text-white text-xl font-bold active:border-[#00ff88] active:bg-[#00ff88]/30'

  return (
    <div className="hard-vacuum relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} tabIndex={-1} aria-label="Hard Vacuum flight controls: WASD, O K L semicolon, or arrows to fly, Space for laser, B for blaster, F to tether, R to recharge, T to teleport, E to dock, M for map, G for log, P to pause" className="absolute inset-0 outline-none" />

      <div hidden={devOpen} inert={devOpen}>
      <ExpeditionHud state={expedition} gameState={gameState} shields={shields} hud={hud} mapOpen={mapOpen} onJournal={() => tapVirtualKey('g')} onMap={() => setSurveyOpen(!mapOpenRef.current)} onInteract={interact} onBlaster={shootBlaster} onRecharge={rechargeRemotely} onTeleport={teleportHome} onPause={() => tapVirtualKey('p')} />

      {gameState === 'playing' && !mapOpen && (
        <div className="absolute inset-x-0 bottom-4 z-30 flex items-end justify-between px-4 lg:hidden pointer-events-none">
          <div className="flex items-end gap-2 pointer-events-auto">
            <button
              type="button"
              aria-label="Rotate left"
              aria-keyshortcuts="A K ArrowLeft"
              className={holdButtonClass}
              {...holdControl('arrowleft')}
            >
              ↶<kbd className="block text-[9px] leading-3 font-normal">A</kbd>
            </button>
            <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-label="Thrust"
              aria-keyshortcuts="W O ArrowUp"
              className={holdButtonClass}
              {...holdControl('arrowup')}
            >
              ↑<kbd className="block text-[9px] leading-3 font-normal">W</kbd>
            </button>
            <button
              type="button"
              aria-label="Nose thruster / brake"
              aria-keyshortcuts="S L ArrowDown"
              className={`${holdButtonClass} text-xs`}
              {...holdControl('arrowdown')}
            >
              ↓<kbd className="block text-[9px] leading-3 font-normal">S</kbd>
            </button>
            </div>
            <button
              type="button"
              aria-label="Rotate right"
              aria-keyshortcuts="D ; ArrowRight"
              className={holdButtonClass}
              {...holdControl('arrowright')}
            >
              ↷<kbd className="block text-[9px] leading-3 font-normal">D</kbd>
            </button>
          </div>

          <div className="flex items-end gap-3 pointer-events-auto">
            {expedition.blasterInstalled && <button type="button" aria-label={`Fire blaster, ${expedition.blasterCharges} of 3 charges`} aria-keyshortcuts="B" className={`${holdButtonClass} text-[10px] text-[#ff665e] border-[#ff665e]/70`} onClick={shootBlaster}>
              <span className="underline underline-offset-2">B</span>LAST<br />{expedition.blasterCharges}/3
            </button>}
            <button
              type="button"
              aria-label="Fire harpoon"
              aria-keyshortcuts="F"
              className={`${holdButtonClass} text-xs text-[#00ff88]`}
              onClick={() => tapVirtualKey('f')}
            >
              HOOK<kbd className="block text-[9px] leading-3 font-normal">F</kbd>
            </button>
            <button
              type="button"
              aria-label="Fire laser"
              aria-keyshortcuts="Space"
              className={`${holdButtonClass} mb-12 text-xs text-[#44aaff]`}
              {...holdControl(' ')}
            >
              LASER<kbd className="block text-[9px] leading-3 font-normal">Space</kbd>
            </button>
          </div>
        </div>
      )}

      <div hidden={mapOpen} inert={mapOpen}>
      <ExpeditionOverlay
        gameState={gameState} state={expedition} hasSave={hasSave} saveIssue={saveIssue}
        loadStatus={saveSession.load.status} loadBlocked={loadBlocked} hasBackup={saveSession.backup.status === 'valid'} onRecover={recoverSave}
        exitSaveFailed={exitSaveFailed} onExitWithoutSaving={leaveGame}
        lostCredits={lostCredits}
        onStart={() => startGame(false)} onNew={() => startGame(true)} onBuy={buyUpgrade}
        onBuySupply={buySupply}
        onRelocate={relocateHaven}
        journalOpen={journalOpen} onJournal={() => setJournalOpen(true)} onCloseJournal={() => setJournalOpen(false)}
        onResume={resumeFlight}
        onMenu={() => dispatch({ type: 'menu' })} onExit={exitToGameSelect}
      />
      </div>
      {saveIssue && gameState === 'playing' && !mapOpen && <div role="alert" className="absolute top-24 inset-x-4 mx-auto max-w-xl border border-[#ffbd69]/60 bg-black/95 p-3 text-xs text-[#ffbd69]">{saveIssue}</div>}
      {mapOpen && <StationSurveyControls overview={mapOverview} zoom={mapZoom} onZoom={toggleMapZoom} onPan={panSurvey} onOverview={toggleOverview} onClose={() => setSurveyOpen(false)} />}
      </div>
      {import.meta.env.DEV && devOpen && <DevelopmentPanel current={regionForRoom(sectorAt(expedition.position)?.id)?.id} banked={expedition.banked} mapRevealed={devMapRevealed}
        onLevel={jumpToDevelopmentLevel} onCredits={grantDevelopmentCredits} onRevealMap={toggleDevelopmentMap} onClose={() => setDevelopmentOpen(false)} />}
    </div>
  )
}
