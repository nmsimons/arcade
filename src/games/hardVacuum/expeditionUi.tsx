import { useRef, useState } from 'react'
import { SHIP_UPGRADES, upgradeOffer } from './upgrades'
import type { ShipUpgrade } from './upgrades'
import type { Expedition } from './expedition'
import { CACHES } from './expedition'
import { campaignObjective, currentBerth, RECORDS, serviceRoute } from './campaign'
import { BERTHS, REGIONS } from './campaignWorld'
import type { BerthId } from './campaignWorld'
import type { HardVacuumGameState } from './ui'
import { KeyboardDialog } from './KeyboardDialog'
import { FlightInstruments } from './FlightInstruments'
import { supplyOffers } from './supplies'
import type { SupplyPurchase } from './supplies'
import type { SaveLoadResult } from './expeditionSave'

const button = 'border border-[#00ff88]/60 px-5 py-3 text-sm uppercase tracking-widest text-[#00ff88] hover:bg-[#00ff88]/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00ff88] transition-colors'

export function StationSurveyControls({ overview, zoom, onZoom, onPan, onOverview, onClose }: {
  overview: boolean; zoom: number; onZoom: () => void; onPan: (dx:number,dy:number) => void; onOverview: () => void; onClose: () => void
}) {
  const dragging = useRef<{x:number;y:number} | undefined>(undefined)
  return <div className="absolute inset-0 touch-none select-none" onKeyDownCapture={event=>{
    const direction: Record<string,[number,number]> = {ArrowLeft:[-64,0],ArrowRight:[64,0],ArrowUp:[0,-64],ArrowDown:[0,64],a:[-64,0],d:[64,0],w:[0,-64],s:[0,64]}
    const delta = direction[event.key]
    if (zoom>1 && delta && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault();event.stopPropagation();onPan(...delta) }
  }} onPointerDown={event=>{
    if (zoom===1 || (event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId);dragging.current={x:event.clientX,y:event.clientY}
  }} onPointerMove={event=>{
    if (!dragging.current) return
    onPan(dragging.current.x-event.clientX,dragging.current.y-event.clientY);dragging.current={x:event.clientX,y:event.clientY}
  }} onPointerUp={()=>{dragging.current=undefined}} onPointerCancel={()=>{dragging.current=undefined}}>
    <KeyboardDialog label="Station survey" focusKey="map" onClose={onClose} className="absolute inset-0 pointer-events-none flex items-end justify-center pb-5">
      <div className="flex flex-col items-center gap-2">
        {zoom>1 && <span className="text-[10px] text-[#99c9bd] bg-black/90 px-2">Pan · arrows / WASD / drag</span>}
        <div className="flex flex-wrap justify-center gap-2 pointer-events-auto"><button className={`${button} bg-black/95`} onClick={onOverview} aria-keyshortcuts="O">{overview ? 'Local survey' : 'Station overview'} · O</button><button className={`${button} bg-black/95`} onClick={onZoom} aria-keyshortcuts="Z"><span className="underline underline-offset-2">Z</span>oom · {zoom===1 ? '2×' : 'Fit'}</button><button className={`${button} bg-black/95`} onClick={onClose} aria-keyshortcuts="M Escape">Close · M / Esc</button></div>
      </div>
    </KeyboardDialog>
  </div>
}

export function ExpeditionHud({ state, gameState, shields, hud, mapOpen, onJournal, onMap, onInteract, onBlaster, onRecharge, onTeleport, onPause }: {
  state: Expedition; gameState: HardVacuumGameState; shields: number
  hud: { room: string; prompt: string; message: string; towing: string; radio: string; grappleHint: string }; mapOpen: boolean
  onJournal: () => void
  onMap: () => void; onInteract: () => void; onBlaster: () => void; onRecharge: () => void; onTeleport: () => void; onPause: () => void
}) {
  if (gameState !== 'playing') return null
  const radio = RECORDS.find(r => r.id === hud.radio)
  return <>
    <FlightInstruments state={state} shields={shields} room={hud.room} mapOpen={mapOpen} onMap={onMap} onJournal={onJournal} onPause={onPause} onBlaster={onBlaster} onRecharge={onRecharge} onTeleport={onTeleport} />
    {!mapOpen && <>
      {hud.grappleHint && <div role="status" className="absolute bottom-48 lg:bottom-24 left-4 max-w-[min(32rem,calc(100%-2rem))] border-l border-[#8bd2d6]/60 bg-[#050d0d]/95 px-3 py-3 text-xs text-[#c2e2df] pointer-events-none"><span className="block text-[9px] tracking-widest text-[#83afa1] mb-2">HAVEN · TETHER LINK</span><span className="leading-relaxed">{hud.grappleHint}</span></div>}
      {radio && !hud.grappleHint && !state.campaign.journey?.riding && <button onClick={onJournal} aria-label={`Read recording: ${radio.title}`} aria-keyshortcuts="G" className="absolute bottom-48 lg:bottom-24 left-4 max-w-[min(32rem,calc(100%-2rem))] text-left border-l border-[#93b7a9]/50 bg-[#050d0d]/90 px-3 py-3 text-xs text-[#c2d1c8]">
        <span className="flex justify-between gap-4 text-[9px] tracking-widest text-[#83afa1] mb-2"><span>{radio.speaker}</span><span>Lo<span className="underline underline-offset-2">g</span></span></span><span className="leading-relaxed">{radio.text}</span>
      </button>}
      {hud.message && <div role="status" className="absolute bottom-44 lg:bottom-5 left-4 max-w-[85%] bg-black/75 px-3 py-2 text-[10px] text-[#ffdfa9] pointer-events-none">{hud.message}</div>}
      {hud.prompt && <button onClick={onInteract} aria-keyshortcuts="E" className="absolute bottom-36 lg:bottom-14 left-1/2 -translate-x-1/2 max-w-[90%] border border-[#00ff88]/60 bg-black/90 px-4 py-2 text-xs text-[#00ff88]">{hud.prompt}</button>}
    </>}
  </>
}

export function ExpeditionOverlay({ gameState, state, hasSave, saveIssue, loadStatus, loadBlocked, hasBackup, onRecover, exitSaveFailed, onExitWithoutSaving, lostCredits, onStart, onNew, onBuy, onBuySupply, onRelocate, journalOpen, onJournal, onCloseJournal, onResume, onMenu, onExit }: {
  gameState: HardVacuumGameState; state: Expedition; hasSave: boolean; saveIssue: string
  loadStatus: SaveLoadResult['status']; loadBlocked: boolean; hasBackup: boolean; onRecover: () => void
  exitSaveFailed: boolean; onExitWithoutSaving: () => void
  lostCredits: number
  onStart: () => void; onNew: () => void; onBuy: (id: ShipUpgrade) => void; onResume: () => void; onMenu: () => void; onExit: () => void
  onBuySupply: (id: SupplyPurchase) => void
  onRelocate: (id: BerthId) => void
  journalOpen: boolean; onJournal: () => void; onCloseJournal: () => void
}) {
  const [confirmNew, setConfirmNew] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState('')
  const [outfitterPage, setOutfitterPage] = useState<'supplies' | 'upgrades' | 'berths'>('supplies')
  if (gameState === 'playing' || gameState === 'dying') return null
  if (gameState === 'docking') return <div role="status" className="absolute bottom-16 inset-x-0 text-center text-xs tracking-widest text-[#00ff88] pointer-events-none">DOCKING CLAMPS</div>
  const checkpoint = `Haven / ${currentBerth(state).name}`
  const goal = campaignObjective(state)
  if (journalOpen && (gameState === 'paused' || gameState === 'docked')) {
    const records = state.campaign.records.map(id => RECORDS.find(r => r.id === id)!).filter(Boolean)
    const selected = records.find(r => r.id === selectedRecord) ?? records[records.length-1]
    return <KeyboardDialog label="Flight recorder" focusKey="recorder" onClose={onCloseJournal} className="absolute inset-0 bg-black/95 overflow-y-auto p-4 flex items-center justify-center">
      <div className="w-full max-w-3xl my-auto border border-[#00ff88]/30 p-5 sm:p-8 text-white">
        <p className="text-[10px] text-[#00ff88] tracking-widest">ORISON / FLIGHT RECORDER</p>
        <h2 className="text-xl mt-3">{goal.title}</h2><p className="text-sm text-white/60 mt-2 leading-relaxed">{goal.detail}</p>
        <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 mt-6">
          <div className="max-h-44 sm:max-h-80 overflow-y-auto space-y-1">{records.map(record => <button key={record.id} aria-pressed={selected?.id === record.id} onClick={() => setSelectedRecord(record.id)} className={`w-full text-left p-2 text-xs border ${selected?.id === record.id ? 'border-[#82b6a1] text-[#c1e9d9]' : 'border-transparent text-white/50'}`}>{record.title}</button>)}</div>
          {selected && <article className="border-t sm:border-t-0 sm:border-l border-white/15 pt-4 sm:pt-0 sm:pl-5"><p className="text-[10px] text-[#8aa99b] tracking-wider">{selected.speaker}</p><h3 className="text-xl mt-3">{selected.title}</h3><p className="text-sm text-white/70 leading-relaxed mt-4">{selected.text}</p></article>}
        </div>
        <button className={`${button} mt-6`} data-initial-focus onClick={onCloseJournal} aria-keyshortcuts="Escape">Back · Esc</button>
      </div>
    </KeyboardDialog>
  }
  const close = () => {
    if (confirmNew) setConfirmNew(false)
    else if (gameState === 'menu') onExit()
    else if (gameState === 'gameOver') onMenu()
    else onResume()
  }
  return <KeyboardDialog label={confirmNew ? 'Replace saved expedition' : gameState === 'docked' ? 'Checkpoint upgrades' : gameState === 'gameOver' ? 'Ship recovery' : gameState === 'complete' ? 'Expedition complete' : gameState === 'paused' ? 'Expedition paused' : 'Hard Vacuum'} focusKey={`${gameState}-${confirmNew}`} onClose={close} confirmation={confirmNew} className="absolute inset-0 bg-black/85 flex items-center justify-center p-4 overflow-y-auto">
    <div className="w-full max-w-2xl my-auto border border-[#00ff88]/30 bg-[#050d0d]/95 p-5 sm:p-9 text-white shadow-2xl">
      {gameState === 'menu' && !confirmNew && <>
        <p className="text-[10px] tracking-[0.35em] text-[#ffcf85] mb-4 uppercase">The Last Shift</p>
        <h1 className="text-4xl sm:text-6xl tracking-wider text-[#00ff88] uppercase">Hard Vacuum</h1>
        <p className="text-white/70 text-sm leading-relaxed mt-5 max-w-lg">Orison went silent nine years ago. Your contract says it was evacuated. Find the stranded maintenance tender Haven, restore a route through the station, and recover its ignition core.</p>
        {loadBlocked && <p role="alert" className="mt-5 text-sm text-[#ffbd69]">{loadStatus === 'unsupported'
          ? 'This expedition was saved by a newer version of the game. Your save has been preserved.'
          : loadStatus === 'storage-unavailable'
            ? 'Browser storage could not be read. Any existing save has been left untouched.'
            : 'The saved expedition could not be read. Your original save has been preserved.'} {hasBackup ? 'You can restore the last working backup or deliberately start a new expedition.' : 'Reload to try again, or deliberately start a new expedition.'}</p>}
        <div className="flex flex-wrap gap-3 mt-7">
          {!loadBlocked && <button className={button} data-initial-focus onClick={onStart}>{hasSave ? 'Continue expedition' : 'Launch expedition'}</button>}
          {!hasSave && hasBackup && <button className={button} data-initial-focus={loadBlocked || undefined} onClick={onRecover}>Restore backup</button>}
          <button className={button} onClick={onExit} aria-keyshortcuts="Escape">Back · Esc</button>
        </div>
        {(hasSave || loadBlocked) && <button className={`${button} mt-4 text-xs`} onClick={() => setConfirmNew(true)}>Start a new expedition…</button>}
      </>}
      {gameState === 'menu' && confirmNew && <>
        <h2 className="text-2xl text-[#ffcf85]">Start a new expedition?</h2>
        <p className="mt-4 text-sm text-white/65">This replaces your saved upgrades, banked credits, and station progress.</p>
        <div className="flex flex-wrap gap-3 mt-6">
          <button className={button} data-initial-focus onClick={() => setConfirmNew(false)} aria-keyshortcuts="Escape">Cancel · Esc</button>
          <button className={button} onClick={() => { setConfirmNew(false); onNew() }}>Start fresh</button>
        </div>
      </>}
      {gameState === 'docked' && <>
        <p className="text-[10px] tracking-[0.3em] text-[#00ff88] uppercase">{checkpoint}</p>
        <h2 className="text-3xl mt-3">Haven outfitter</h2>
        <div className="my-5 flex justify-between items-baseline border-y border-white/10 py-3"><span className="text-xs uppercase text-white/50">Banked credits</span><span className="text-2xl text-[#00ff88]">{state.banked}</span></div>
        <nav aria-label="Haven services" className="flex flex-wrap gap-2 mb-4">{(['supplies','upgrades','berths'] as const).map(page => <button key={page} aria-pressed={outfitterPage===page} onClick={() => setOutfitterPage(page)} className={`px-3 py-2 text-xs border ${outfitterPage===page ? 'border-[#8ee5e8] text-[#bce0d3]' : 'border-white/15 text-white/50'}`}>{page==='supplies' ? 'Supplies' : page==='upgrades' ? 'Ship upgrades' : 'Service berths'}</button>)}</nav>
        {outfitterPage === 'supplies' && <div className="space-y-3">{supplyOffers(state).map(item => <button key={item.slot} aria-label={`${item.name}, ${item.full && item.id === 'teleporter' ? 'installed' : `${item.cost} credits`}, ${item.detail}`} onClick={() => onBuySupply(item.id)} disabled={item.full || state.banked < item.cost} className="w-full text-left border border-[#8ee5e8]/25 p-3 enabled:hover:bg-[#8ee5e8]/10 disabled:opacity-45 flex justify-between gap-4">
          <span><span className="block text-sm text-[#b8ddcf]">{item.name}</span><span className="block text-xs text-white/50 mt-1">{item.detail}</span></span>
          <span className="text-xs text-[#8ee5e8] whitespace-nowrap">{item.full ? item.id === 'teleporter' ? 'INSTALLED' : 'FULL' : `${item.cost.toLocaleString()} CR`}</span>
        </button>)}</div>}
        {outfitterPage === 'upgrades' && <div className="space-y-3 mt-3">{SHIP_UPGRADES.map(id => {
          const item = upgradeOffer(state, id), staged = item.maxLevel > 1
          const stageLabel = !item.maxed && staged ? `Stage ${item.stage}/${item.maxLevel} · ` : ''
          return <button key={item.id} aria-label={`${item.name}, ${item.maxed ? 'installed' : `${stageLabel}${item.cost} credits`}, ${item.detail}`} onClick={() => onBuy(item.id)} disabled={item.maxed || item.locked || state.banked < item.cost} className="w-full text-left border border-[#00ff88]/25 p-3 enabled:hover:bg-[#00ff88]/10 disabled:opacity-45 flex justify-between gap-4">
            <span><span className="block text-sm text-[#b8ddcf]">{item.name}</span><span className="block text-xs text-white/50 mt-1">{stageLabel}{item.detail}</span></span>
            <span className="text-xs text-[#00ff88] whitespace-nowrap">{item.maxed ? staged ? 'MAXED' : 'INSTALLED' : `${item.cost.toLocaleString()} CR`}</span>
          </button>
        })}</div>}
        {outfitterPage === 'berths' && <div className="border-t border-white/15 pt-5 mt-5"><h3 className="text-xs tracking-widest text-[#8ee5e8]">HAVEN / SERVICE ROUTE</h3>
          <p className="text-xs text-white/45 mt-2">Travel aboard Haven to an energized berth. Cargo stays behind.</p>
          <div className="grid sm:grid-cols-2 gap-2 mt-3">{BERTHS.filter(b => state.campaign.berths.includes(b.id)).map(berth => {
            const here = berth.id === state.campaign.berth, ready = !!serviceRoute(state,berth.id)
            return <button key={berth.id} disabled={here || !ready} onClick={() => onRelocate(berth.id)} className="text-left border border-[#8ee5e8]/30 p-3 text-xs text-[#b8ddcf] disabled:opacity-40">{berth.name}<span className="block text-[10px] text-white/50 mt-1">{here ? 'DOCKED' : ready ? 'RELOCATE HAVEN' : 'SERVICE ROUTE OBSTRUCTED'}</span></button>
          })}</div>
        </div>}
        <div className="flex flex-wrap gap-2 mt-5"><button className={button} data-initial-focus onClick={onResume} aria-keyshortcuts="Escape">Undock · Esc</button><button className={button} onClick={onJournal} aria-label="Flight recorder" aria-keyshortcuts="G">Lo<span className="underline underline-offset-2">g</span></button></div>
      </>}
      {gameState === 'paused' && <>
        <p className="text-xs text-[#00ff88] tracking-widest uppercase">Expedition paused</p>
        <h2 className="text-3xl mt-3">Hard Vacuum</h2>
        <p className="mt-5 text-[#b8ddcf]">{goal.title}</p><p className="mt-2 text-sm text-white/60 leading-relaxed">{goal.detail}</p>
        <p className="mt-4 text-xs text-[#ffcf85]">Respawn: {checkpoint} · {state.credits} credits at risk · {state.banked} banked</p>
        <div className="flex flex-wrap gap-3 mt-7"><button className={button} onClick={onResume} aria-keyshortcuts="P Escape">Resume · P / Esc</button><button className={button} onClick={onJournal} aria-label="Flight recorder" aria-keyshortcuts="G">Lo<span className="underline underline-offset-2">g</span></button><button className={button} onClick={onExit}>Save & exit</button></div>
      </>}
      {gameState === 'gameOver' && <>
        <p className="text-xs text-[#ff7962] tracking-widest uppercase">Ship lost / recovery beacon active</p>
        <h2 className="text-3xl mt-3">Return to {checkpoint}</h2>
        <p className="mt-5 text-[#ffbd69]">{lostCredits} carried credits lost.</p>
        <p className="mt-3 text-sm text-white/60 leading-relaxed">{state.banked} credits banked.</p>
        <div className="flex flex-wrap gap-3 mt-7"><button className={button} data-initial-focus onClick={onStart}>Respawn</button><button className={button} onClick={onMenu} aria-keyshortcuts="Escape">Main menu · Esc</button><button className={button} onClick={onExit}>Exit</button></div>
      </>}
      {gameState === 'complete' && <>
        <p className="text-xs text-[#ffcf85] tracking-[0.3em] uppercase">Expedition complete</p>
        <h2 className="text-4xl text-[#00ff88] mt-4">The route is clear.</h2>
        <p className="mt-5 text-sm text-white/65 leading-relaxed">The Ignition Cradle comes alive. Its isolated bus starts Orison without interrupting the wards. Three hundred and twelve suspension units begin their return cycle. For the first time in nine years, the open channel carries a living voice.</p>
        <blockquote className="border-l border-[#00ff88]/50 pl-4 mt-6 text-[#c0e7d6]">“Haven? We’ve got your lights. Is the route clear?”</blockquote>
        <div className="flex flex-wrap gap-4 mt-6 text-xs text-[#ffcf85]"><span>{REGIONS.filter(r => r.rooms.some(id => state.visited.includes(id))).length}/6 regions explored</span><span>{state.caches.length}/{CACHES.length} cargo recovered</span><span>{state.campaign.records.length}/{RECORDS.length} recordings</span><span>{Math.floor(state.campaign.playedSeconds/60)} minutes in flight</span></div>
        <div className="flex gap-3 mt-7"><button className={button} onClick={onResume} aria-keyshortcuts="Escape">Keep exploring · Esc</button><button className={button} onClick={onExit}>Save & exit</button></div>
      </>}
      {(gameState === 'menu' || gameState === 'paused') && <>
        <button className="mt-5 text-xs text-white/50 hover:text-white" aria-expanded={showControls} onClick={() => setShowControls(!showControls)}>Controls</button>
        {showControls && <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-white/60">
          <span>A / D or K / ; · Rotate</span><span>W / S or O / L · Rear / nose thruster</span><span>Space · Laser</span><span>B · Blaster</span>
          <span>F · Grapple / release · Connect to terminals</span><span>E · Dock / call Haven</span><span>R · Remote recharge</span><span>T · Teleport</span><span>M · Map</span><span>G · Log</span><span>P / Esc · Pause</span>
        </div>}
      </>}
      {saveIssue && <p role="alert" className="mt-4 text-xs text-[#ffbd69]">{saveIssue}</p>}
      {exitSaveFailed && <div className="mt-4 border-t border-[#ffbd69]/40 pt-4">
        <p className="text-xs text-[#ffbd69]">Your latest progress is still only in this tab.</p>
        <div className="flex flex-wrap gap-3 mt-3"><button className={button} onClick={onExit}>Retry save & exit</button><button className={button} onClick={onExitWithoutSaving}>Exit without saving</button></div>
      </div>}
    </div>
  </KeyboardDialog>
}
