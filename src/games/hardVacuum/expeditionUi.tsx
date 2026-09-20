import { useRef, useState } from 'react'
import { SHIP_UPGRADES, upgradeOffer } from './upgrades'
import type { ShipUpgrade } from './upgrades'
import type { Expedition } from './expedition'
import { CACHES } from './expedition'
import { currentBerth, departureBlocker, RECORDS, serviceRoute } from './campaign'
import { BERTHS, REGIONS } from './campaignWorld'
import type { BerthId } from './campaignWorld'
import type { HardVacuumGameState } from './ui'
import { KeyboardDialog } from './KeyboardDialog'
import { FlightInstruments } from './FlightInstruments'
import { TetherInfo } from './TetherInfo'
import type { SaveLoadResult } from './expeditionSave'
import { ControllerHelp } from './ControllerHelp'
import { CONTROLLER_FLIGHT_HELP, controllerButtonLabel, controllerMenuHelp, controllerTurnLabel, DEFAULT_CONTROLLER_LAYOUT } from './controllerLayouts'
import type { ControllerLayout } from './controllerLayouts'
import { useControlHints } from './controlHints'

const button = 'menu-button'

export function StationSurveyControls({ overview, zoom, onZoom, onPan, onOverview, onClose, controllerLayout = DEFAULT_CONTROLLER_LAYOUT }: {
  overview: boolean; zoom: number; onZoom: () => void; onPan: (dx:number,dy:number) => void; onOverview: () => void; onClose: () => void
  controllerLayout?: ControllerLayout
}) {
  const dragging = useRef<{x:number;y:number} | undefined>(undefined)
  const { connected, hint } = useControlHints()
  return <div className="absolute inset-0 touch-none select-none" onKeyDownCapture={event=>{
    const direction: Record<string,[number,number]> = {a:[-64,0],d:[64,0],w:[0,-64],s:[0,64]}
    const delta = direction[event.key.toLowerCase()]
    if (zoom>1 && delta && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault();event.stopPropagation();onPan(...delta) }
  }} onPointerDown={event=>{
    if (zoom===1 || (event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId);dragging.current={x:event.clientX,y:event.clientY}
  }} onPointerMove={event=>{
    if (!dragging.current) return
    onPan(dragging.current.x-event.clientX,dragging.current.y-event.clientY);dragging.current={x:event.clientX,y:event.clientY}
  }} onPointerUp={()=>{dragging.current=undefined}} onPointerCancel={()=>{dragging.current=undefined}}>
    <KeyboardDialog label="Station survey" focusKey="map" controllerMode="map" onClose={onClose} className="absolute inset-0 pointer-events-none flex items-end justify-center pb-5">
      <div className="menu-map-bar flex flex-col items-center gap-2">
        {zoom>1 && <span className="text-[10px] text-[#99c9bd]">Pan · {connected ? 'Left stick' : 'WASD / drag'}</span>}
        <div className="flex flex-wrap justify-center gap-2 pointer-events-auto"><button data-menu-id="overview" className={button} onClick={onOverview} aria-keyshortcuts="O">{overview ? 'Local survey' : 'Station overview'} · {hint('mapOverview', 'O')}</button><button data-menu-id="zoom" className={button} onClick={onZoom} aria-keyshortcuts="Z">{connected ? 'Zoom' : <><span className="underline underline-offset-2">Z</span>oom</>} · {zoom===1 ? '2×' : 'Fit'}{connected && ` · ${hint('mapZoom', 'Z')}`}</button><button data-menu-id="close-map" className={button} onClick={onClose} aria-keyshortcuts="M Escape">Close · {hint('back', 'M / Esc')}</button></div>
        <ControllerHelp layout={controllerLayout} map />
      </div>
    </KeyboardDialog>
  </div>
}

export function ExpeditionHud({ state, gameState, shields, hud, mapOpen, saveIssue, onJournal, onMap, onBlaster, onTeleport, onPause }: {
  state: Expedition; gameState: HardVacuumGameState; shields: number; saveIssue?: string
  hud: { room: string; prompt: string; message: string; towing: string; radio: string; grappleHint: string }; mapOpen: boolean
  onJournal: () => void
  onMap: () => void; onBlaster: () => void; onTeleport: () => void; onPause: () => void
}) {
  if (gameState !== 'playing') return null
  const radio = RECORDS.find(r => r.id === hud.radio)
  return <>
    <FlightInstruments state={state} shields={shields} room={hud.room} mapOpen={mapOpen} saveIssue={saveIssue} onMap={onMap} onJournal={onJournal} onPause={onPause} onBlaster={onBlaster} onTeleport={onTeleport} />
    {!mapOpen && radio && !state.campaign.journey?.riding && <TetherInfo record={radio} onOpen={onJournal} />}
  </>
}

export function ExpeditionOverlay({ gameState, state, hasSave, saveIssue, controllerStatus, controllerLayout = DEFAULT_CONTROLLER_LAYOUT, loadStatus, loadBlocked, hasBackup, onRecover, exitSaveFailed, onCancelExit, onExitWithoutSaving, lostCredits, onStart, onNew, onBuy, onRelocate, onLaunch, launchBusy, journalOpen, onJournal, onCloseJournal, onResume, onMenu, onExit, onTraining }: {
  gameState: HardVacuumGameState; state: Expedition; hasSave: boolean; saveIssue: string
  controllerStatus: string
  controllerLayout?: ControllerLayout
  loadStatus: SaveLoadResult['status']; loadBlocked: boolean; hasBackup: boolean; onRecover: () => void
  exitSaveFailed: boolean; onCancelExit: () => void; onExitWithoutSaving: () => void
  lostCredits: number
  onStart: () => void; onNew: () => void; onBuy: (id: ShipUpgrade) => void; onResume: () => void; onMenu: () => void; onExit: () => void
  onRelocate: (id: BerthId) => void; onLaunch: () => void; launchBusy: boolean
  journalOpen: boolean; onJournal: () => void; onCloseJournal: () => void
  onTraining: () => void
}) {
  const [confirmNew, setConfirmNew] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState('')
  const [outfitterPage, setOutfitterPage] = useState<'upgrades' | 'berths'>('upgrades')
  const { connected, hint, text } = useControlHints()
  if (gameState === 'playing' || gameState === 'dying' || gameState === 'docking') return null
  const checkpoint = `Haven / ${currentBerth(state).name}`
  const launchBlocked = departureBlocker(state) ?? (launchBusy ? 'Securing cargo.' : undefined)
  if (exitSaveFailed) return <KeyboardDialog label="Progress not saved" focusKey="save-failed" confirmation onClose={onCancelExit}>
    <div className="menu-surface max-w-2xl">
      <p className="menu-eyebrow">SAVE INTERRUPTED</p>
      <h2 className="text-2xl mt-3 text-[#f1c69d]">Your progress is still in this tab.</h2>
      <p role="alert" className="text-sm text-white/65 leading-relaxed mt-4">{saveIssue}</p>
      <p className="text-sm text-white/65 leading-relaxed mt-3">Try saving again, or go back and keep playing. Exiting without saving will lose your latest progress.</p>
      <div className="flex flex-wrap gap-3 mt-6">
        <button className={button} data-menu-id="cancel-exit" data-initial-focus onClick={onCancelExit}>Go back · {hint('back', 'Esc')}</button>
        <button className={button} onClick={onExit}>Retry save & exit</button>
        <button className={`${button} menu-danger`} onClick={onExitWithoutSaving}>Exit without saving</button>
      </div>
      <ControllerHelp layout={controllerLayout} />
    </div>
  </KeyboardDialog>
  if (journalOpen && (gameState === 'paused' || gameState === 'docked')) {
    const records = state.campaign.records.map(id => RECORDS.find(r => r.id === id)!).filter(Boolean)
    const selected = records.find(r => r.id === selectedRecord) ?? records[records.length-1]
    return <KeyboardDialog label="Flight recorder" focusKey="recorder" onClose={onCloseJournal}>
      <div className="menu-surface max-w-3xl">
        <p className="text-[10px] text-[#00ff88] tracking-widest">ORISON / FLIGHT RECORDER</p>
        <h2 className="text-xl mt-3">Downloaded recordings</h2>
        {!records.length && <p className="text-sm text-white/60 mt-3">No recordings downloaded.</p>}
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 mt-6">
          <div className="max-h-44 sm:max-h-80 overflow-y-auto space-y-2 p-1">{records.map(record => <button key={record.id} data-menu-id={record.id} aria-pressed={selected?.id === record.id} onClick={() => setSelectedRecord(record.id)} className="menu-item w-full">{record.title}</button>)}</div>
          {selected && <article data-controller-scroll className="max-h-80 overflow-y-auto border-t sm:border-t-0 sm:border-l border-white/15 pt-4 sm:pt-0 sm:pl-5"><p className="text-[10px] text-[#8aa99b] tracking-wider">{selected.speaker}</p><h3 className="text-xl mt-3">{selected.title}</h3><p className="text-sm text-white/70 leading-relaxed mt-4">{text(selected.text)}</p></article>}
        </div>
        <button className={`${button} mt-6`} data-menu-id="close-recorder" data-initial-focus onClick={onCloseJournal} aria-keyshortcuts="Escape">Back · {hint('back', 'Esc')}</button>
        <ControllerHelp layout={controllerLayout} />
      </div>
    </KeyboardDialog>
  }
  const close = () => {
    if (confirmNew) setConfirmNew(false)
    else if (showControls && (gameState === 'menu' || gameState === 'paused')) setShowControls(false)
    else if (gameState === 'menu') onExit()
    else if (gameState === 'gameOver') onMenu()
    else onResume()
  }
  return <KeyboardDialog label={confirmNew ? 'Replace saved expedition' : gameState === 'docked' ? 'Checkpoint upgrades' : gameState === 'gameOver' ? state.campaign.havenActivated ? 'Ship recovery' : 'Expedition lost' : gameState === 'complete' ? 'Expedition complete' : gameState === 'paused' ? 'Expedition paused' : 'Hard Vacuum'} focusKey={`${gameState}-${confirmNew}`} onClose={close} confirmation={confirmNew}>
    <div className={`menu-surface max-w-2xl ${gameState === 'docked' ? 'menu-outfitter' : ''}`}>
      {gameState === 'menu' && !confirmNew && <>
        <p className="text-[10px] tracking-[0.35em] text-[#ffcf85] mb-4 uppercase">The Last Shift</p>
        <h1 className="text-4xl sm:text-6xl tracking-tight text-[#d3ecde] uppercase">Hard Vacuum</h1>
        {loadBlocked && <p role="alert" className="mt-5 text-sm text-[#ffbd69]">{loadStatus === 'unsupported'
          ? 'This expedition was saved by a newer version of the game. Your save has been preserved.'
          : loadStatus === 'missing'
            ? 'The saved expedition is missing, but a working backup is available.'
            : loadStatus === 'storage-unavailable'
              ? 'Browser storage could not be read. Any existing save has been left untouched.'
              : 'The saved expedition could not be read. Your original save has been preserved.'} {hasBackup ? 'You can restore the last working backup or deliberately start a new expedition.' : 'Reload to try again, or deliberately start a new expedition.'}</p>}
        <div className="flex flex-wrap gap-3 mt-7">
          {!loadBlocked && <button className={button} data-initial-focus onClick={onStart}>{hasSave ? 'Continue expedition' : 'Launch expedition'}</button>}
          <button className={button} data-menu-id="training" onClick={onTraining}>Flight training</button>
          {!hasSave && hasBackup && <button className={button} data-initial-focus={loadBlocked || undefined} onClick={onRecover}>Restore backup</button>}
          <button className={button} data-menu-id="exit-menu" onClick={onExit} aria-keyshortcuts="Escape">Back · {hint('back', 'Esc')}</button>
        </div>
        {(hasSave || loadBlocked) && <button className={`${button} mt-4 text-xs`} onClick={() => setConfirmNew(true)}>Start a new expedition…</button>}
      </>}
      {gameState === 'menu' && confirmNew && <>
        <h2 className="text-2xl text-[#ffcf85]">Start a new expedition?</h2>
        <p className="mt-4 text-sm text-white/65">This replaces your saved upgrades, banked credits, and station progress.</p>
        <div className="flex flex-wrap gap-3 mt-6">
          <button className={button} data-menu-id="cancel-new" data-initial-focus onClick={() => setConfirmNew(false)} aria-keyshortcuts="Escape">Cancel · {hint('back', 'Esc')}</button>
          <button className={`${button} menu-danger`} onClick={() => { setConfirmNew(false); onNew() }}>Start fresh</button>
        </div>
      </>}
      {gameState === 'docked' && <>
        <p className="text-[10px] tracking-[0.3em] text-[#00ff88] uppercase">{checkpoint}</p>
        <h2 className="text-3xl mt-3">Haven outfitter</h2>
        <div className="my-4 flex justify-between items-baseline border-y border-white/10 py-2"><span className="text-xs uppercase text-white/50">Banked credits</span><span className="text-2xl text-[#a5cfb7]">{state.banked.toLocaleString()}</span></div>
        <nav aria-label="Haven services" className="flex flex-wrap gap-2 mb-4">{(['upgrades','berths'] as const).map(page => <button key={page} aria-pressed={outfitterPage===page} onClick={() => setOutfitterPage(page)} className={`px-3 py-2 text-xs border ${outfitterPage===page ? 'border-[#8ee5e8] text-[#bce0d3]' : 'border-white/15 text-white/50'}`}>{page==='upgrades' ? 'Ship upgrades' : 'Service berths'}</button>)}</nav>
        {outfitterPage === 'upgrades' && <div className="space-y-2 mt-3">{SHIP_UPGRADES.map(id => {
          const item = upgradeOffer(state, id), staged = item.maxLevel > 1
          const stageLabel = !item.maxed && staged ? `Stage ${item.stage}/${item.maxLevel} · ` : ''
          return <button key={item.id} data-menu-id={`upgrade-${item.id}`} aria-label={`${item.name}, ${item.maxed ? 'installed' : `${stageLabel}${item.cost} credits`}, ${item.detail}`} onClick={() => onBuy(item.id)} disabled={item.maxed || item.locked || state.banked < item.cost} className="menu-item w-full flex justify-between gap-4">
            <span><span className="block text-sm text-[#b8ddcf]">{item.name}</span><span className="block text-xs text-white/50 mt-1">{stageLabel}{item.detail}</span></span>
            <span className="text-xs text-[#a5cfb7] whitespace-nowrap text-right">{item.maxed ? staged ? 'MAXED' : 'INSTALLED' : item.locked ? 'NOT INSTALLED' : <>{item.cost.toLocaleString()} CR{state.banked < item.cost && <span className="block text-[9px] text-white/50 mt-1">INSUFFICIENT</span>}</>}</span>
          </button>
        })}</div>}
        {outfitterPage === 'berths' && <div className="border-t border-white/15 pt-5 mt-5"><h3 className="text-xs tracking-widest text-[#8ee5e8]">HAVEN / SERVICE ROUTE</h3>
          <p className="text-xs text-white/45 mt-2">Loose cargo stays behind.</p>
          <div data-menu-grid className="grid sm:grid-cols-2 gap-2 mt-3">{BERTHS.filter(b => state.campaign.berths.includes(b.id)).map(berth => {
            const here = berth.id === state.campaign.berth, ready = !!serviceRoute(state,berth.id)
            return <button key={berth.id} disabled={here || !ready} onClick={() => onRelocate(berth.id)} className="text-left border border-[#8ee5e8]/30 p-3 text-xs text-[#b8ddcf] disabled:opacity-40">{berth.name}<span className="block text-[10px] text-white/50 mt-1">{here ? 'DOCKED' : ready ? 'RELOCATE HAVEN' : 'SERVICE ROUTE OBSTRUCTED'}</span></button>
          })}</div>
        </div>}
        {(state.core || state.visited.includes('refuge-entry') || state.campaign.records.includes('refuge-arrival')) && !state.complete && <section aria-label="Haven departure" className="border-t border-white/15 mt-5 pt-4">
          <p id="departure-status" className="text-xs text-[#a5cfb7] leading-relaxed">{launchBlocked ?? 'Departure cleared.'}</p>
          <button className={`${button} mt-3`} data-menu-id="launch-haven" disabled={!!launchBlocked} aria-describedby="departure-status" onClick={onLaunch}>Launch Haven</button>
        </section>}
        <div className="flex flex-wrap gap-2 mt-5"><button className={button} data-menu-id="undock" data-initial-focus onClick={onResume} aria-keyshortcuts="Escape">Undock · {hint('back', 'Esc')}</button><button className={button} onClick={onJournal} aria-label="Flight recorder" aria-keyshortcuts="G">{connected ? 'Log' : <>Lo<span className="underline underline-offset-2">g</span></>}</button></div>
      </>}
      {gameState === 'paused' && <>
        <p className="text-xs text-[#00ff88] tracking-widest uppercase">Expedition paused</p>
        <h2 className="text-3xl mt-3">Hard Vacuum</h2>
        <p className="mt-4 text-xs text-[#ffcf85]">{state.campaign.havenActivated ? <>Recovery link: {checkpoint} · {state.credits} credits at risk · {state.banked} banked</> : 'Recovery link offline'}</p>
        <div className="flex flex-wrap gap-3 mt-7"><button className={button} data-menu-id="resume" onClick={onResume} aria-keyshortcuts="P Escape">Resume · {hint('back', 'P / Esc')}</button><button className={button} onClick={onJournal} aria-label="Flight recorder" aria-keyshortcuts="G">{connected ? 'Log' : <>Lo<span className="underline underline-offset-2">g</span></>}</button><button className={button} onClick={onExit}>Save & exit</button></div>
      </>}
      {gameState === 'gameOver' && <>
        <p className="text-xs text-[#ff7962] tracking-widest uppercase">{state.campaign.havenActivated ? 'Much later / reconstruction complete' : 'Ship lost / no recovery link'}</p>
        <h2 className="text-3xl mt-3">{state.campaign.havenActivated ? `Return to ${checkpoint}` : 'Expedition lost'}</h2>
        <p className="mt-5 text-[#ffbd69]">{lostCredits} carried credits lost.</p>
        <p className="mt-3 text-sm text-white/60 leading-relaxed">{state.campaign.havenActivated ? `${state.banked} credits banked. Recovery complete.` : 'Expedition ended.'}</p>
        <div className="flex flex-wrap gap-3 mt-7"><button className={button} data-initial-focus onClick={onStart}>{state.campaign.havenActivated ? 'Respawn' : 'Start again'}</button><button className={button} data-menu-id="main-menu" onClick={onMenu} aria-keyshortcuts="Escape">Main menu · {hint('back', 'Esc')}</button><button className={button} onClick={onExit}>Exit</button></div>
      </>}
      {gameState === 'complete' && <>
        <p className="text-xs text-[#ffcf85] tracking-[0.3em] uppercase">Expedition complete</p>
        <h2 className="text-4xl text-[#00ff88] mt-4">Everyone is coming home.</h2>
        <div className="flex flex-wrap gap-4 mt-6 text-xs text-[#ffcf85]"><span>{REGIONS.filter(r => r.rooms.some(id => state.visited.includes(id))).length}/6 regions explored</span><span>{state.caches.length}/{CACHES.length} cargo recovered</span><span>{RECORDS.filter(r=>state.campaign.records.includes(r.id)).length}/{RECORDS.length} recordings</span><span>{Math.floor(state.campaign.playedSeconds/60)} minutes in flight</span></div>
        <p className="mt-4 text-xs text-white/45">Optional free exploration returns to the moment before departure. Your rescue is complete.</p>
        <div className="flex gap-3 mt-7"><button className={button} data-menu-id="explore" onClick={onResume} aria-keyshortcuts="Escape">Keep exploring · {hint('back', 'Esc')}</button><button className={button} onClick={onExit}>Save & exit</button></div>
      </>}
      {(gameState === 'menu' || gameState === 'paused') && !confirmNew && <>
        <p className="mt-4 text-xs text-white/50" aria-live="polite">{controllerStatus}</p>
        <button className={`${button} mt-4`} data-menu-id="controls" aria-expanded={showControls} aria-controls="flight-controls" onClick={() => setShowControls(!showControls)}>Controls</button>
        {showControls && <section id="flight-controls" className="menu-controls mt-4" aria-label="Flight controls">
        {!connected && <><h3 className="text-xs text-[#c0decd]">Keyboard</h3>
        <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-white/60">
          <span>A / D or K / ; · Rotate</span><span>W / S or O / L · Rear / nose thruster</span><span>Space · Laser</span><span>B · Blaster</span>
          <span>F · Grapple / release · Connect to terminals</span><span>E · Dock / call Haven</span><span>T · Teleport</span><span>M · Map</span><span>G · Log</span><span>P / Esc · Pause</span>
        </div></>}
        {connected && <><h3 className="text-xs text-[#8ee5e8]">Controller · {controllerLayout.name} · Xbox / PlayStation</h3>
        <div className="grid grid-cols-2 gap-3 mt-3 text-xs text-white/60">
          <span>{controllerTurnLabel(controllerLayout)}</span>
          {CONTROLLER_FLIGHT_HELP.map(({action,label}) => <span key={action}>{controllerButtonLabel(controllerLayout.buttons[action])} · {label}</span>)}
        </div>
        <p className="mt-3 text-xs text-white/50">Menus: {controllerMenuHelp(controllerLayout)}. Map: {controllerMenuHelp(controllerLayout, true)}.</p></>}
        <p className="mt-2 text-xs text-white/50">Standard-layout controllers supported. Connect by USB or Bluetooth and press a button. If audio is silent, click the game or press a keyboard key once.</p>
        </section>}
      </>}
      {saveIssue && <p role="alert" className="mt-4 text-xs text-[#ffbd69]">{saveIssue}</p>}
      <ControllerHelp layout={controllerLayout} />
    </div>
  </KeyboardDialog>
}
