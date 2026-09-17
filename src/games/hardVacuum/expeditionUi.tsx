import { useState } from 'react'
import { SHOP, upgradeOffer } from './upgrades'
import type { ShopUpgrade } from './upgrades'
import type { Expedition } from './expedition'
import { CACHES, expeditionMap, maxShields } from './expedition'
import { campaignObjective, currentBerth, havenReady, RECORDS, serviceRoute } from './campaign'
import { BERTHS, REGIONS } from './campaignWorld'
import type { BerthId } from './campaignWorld'
import type { HardVacuumGameState } from './ui'
import { KeyboardDialog } from './KeyboardDialog'
import { radiationAt, RADIATION_DRAIN, RADIATION_HULL_LIMIT } from './radiation'
import { needsRecharge, supplyOffers } from './supplies'
import type { SupplyPurchase } from './supplies'

const button = 'border border-[#00ff88]/60 px-5 py-3 text-sm uppercase tracking-widest text-[#00ff88] hover:bg-[#00ff88]/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#00ff88] transition-colors'

export function ExpeditionHud({ state, gameState, shields, hud, mapOpen, mapOverview, onOverview, onJournal, onMap, onInteract, onBlaster, onRecharge, onTeleport, onPause }: {
  state: Expedition; gameState: HardVacuumGameState; shields: number
  hud: { room: string; prompt: string; message: string; towing: string; radio: string; grappleHint: string }; mapOpen: boolean
  mapOverview: boolean; onOverview: () => void; onJournal: () => void
  onMap: () => void; onInteract: () => void; onBlaster: () => void; onRecharge: () => void; onTeleport: () => void; onPause: () => void
}) {
  if (gameState !== 'playing') return null
  const radiation = radiationAt(state.position, expeditionMap(state))
  const exposed = radiation.intensity > 0
  const protectedFromRadiation = state.upgrades.includes('radiation') && state.radiationCharge > 0
  const radiationColor = exposed && (!protectedFromRadiation || state.radiationCharge < 30) ? '#ff927c' : '#c1adff'
  const radio = RECORDS.find(r => r.id === hud.radio)
  return <>
    <div className="absolute inset-x-0 top-0 p-3 sm:p-5 bg-gradient-to-b from-black/95 to-transparent pointer-events-none text-white">
      <div className="flex justify-between gap-3 text-[10px] sm:text-xs tracking-widest uppercase">
        <div><span className="text-[#00ff88]">{hud.room}</span><span className="hidden sm:inline text-white/30"> / HARD VACUUM</span></div>
        <div className="flex gap-3 sm:gap-6"><span className="text-[#ffcf85]">Carried {state.credits}</span><span className="text-[#00ff88]">Banked {state.banked}</span></div>
      </div>
      <div className="mt-3 flex justify-between items-start gap-4">
        <div className="flex flex-col items-start gap-2 pointer-events-auto text-[10px]">
          {(state.rechargePacks > 0 || state.remoteRechargeRemaining > 0) && <button onClick={onRecharge} disabled={mapOpen || state.rechargePacks === 0 || state.remoteRechargeRemaining > 0 || !needsRecharge(state)} aria-label={`Remote recharge, ${state.rechargePacks} of 3 packs`} aria-keyshortcuts="R" className="border border-[#00ff88]/35 bg-black/70 px-3 py-2 text-[#a8e7c4] disabled:opacity-45">{state.remoteRechargeRemaining > 0 ? 'RECHARGING' : `R · RECHARGE ${state.rechargePacks}/3`}</button>}
          {state.teleporterInstalled && <button onClick={onTeleport} disabled={mapOpen || state.teleportCharges === 0 || !havenReady(state)} aria-label={`Teleport to Haven, ${state.teleportCharges} of 1 charge`} aria-keyshortcuts="T" className="border border-[#8ee5e8]/35 bg-black/70 px-3 py-2 text-[#8ee5e8] disabled:opacity-45">T · TELEPORT {state.teleportCharges}/1</button>}
        </div>
        <div className="text-right text-[10px] sm:text-xs">
          <div className="text-[#00ff88] tracking-widest">{'▰'.repeat(shields)}<span className="text-white/20">{'▰'.repeat(Math.max(0, maxShields(state) - shields))}</span></div>
          <div className="text-white/45 mt-1">{shields === 0 ? 'HULL EXPOSED' : 'IMPACT SHIELD'}</div>
          {(state.upgrades.includes('radiation') || exposed) && <div className="mt-2" style={{ color: radiationColor }} aria-label={`Radiation shield: ${state.upgrades.includes('radiation') ? Math.ceil(state.radiationCharge) + ' percent' : 'not installed'}`}>
            <div className="text-[9px]">RADIATION {state.upgrades.includes('radiation') ? `${Math.ceil(state.radiationCharge)}%` : '—'}</div>
            <div role="progressbar" aria-label="Radiation reserve" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.radiationCharge ?? 0)} className="h-1.5 mt-1 w-full bg-white/10"><div className="h-full" style={{ width: `${state.radiationCharge ?? 0}%`, background: radiationColor, boxShadow: exposed ? `0 0 8px ${radiationColor}` : undefined }} /></div>
            {exposed && <div className="mt-1 text-[9px]">{protectedFromRadiation ? `DRAINING −${(RADIATION_DRAIN * radiation.intensity).toFixed(1)}/s` : 'UNPROTECTED'}</div>}
          </div>}
          {state.blasterInstalled && <button onClick={onBlaster} disabled={mapOpen} className="pointer-events-auto text-[#ff796e] mt-1" aria-label={`Fire blaster, ${state.blasterCharges} of 3 charges`} aria-keyshortcuts="G">G {'▰'.repeat(state.blasterCharges)}<span className="text-white/20">{'▰'.repeat(3 - state.blasterCharges)}</span></button>}
          {!mapOpen && <div className="flex gap-2 mt-2 pointer-events-auto">
            <button aria-label="Station map" title="Map · M" className="text-[#83afa1] hover:text-white" onClick={onMap}>◇</button>
            <button aria-label="Flight recorder" title="Flight recorder · J" className="text-[#83afa1] hover:text-white" onClick={onJournal}>≡</button>
            <button aria-label="Pause game" className="text-[#83afa1] hover:text-white" onClick={onPause}>Ⅱ</button>
          </div>}
        </div>
      </div>
    </div>
    {mapOpen && <KeyboardDialog label="Station survey" focusKey="map" onClose={onMap} className="absolute inset-0 pointer-events-none flex items-end justify-center pb-5">
      <div className="flex flex-wrap justify-center gap-2 pointer-events-auto"><button className={`${button} bg-black/95`} onClick={onOverview}>{mapOverview ? 'Local survey' : 'Station overview'} · O</button><button className={`${button} bg-black/95`} onClick={onMap}>Close · M / Esc</button></div>
    </KeyboardDialog>}
    {!mapOpen && <>
      {hud.grappleHint && <div role="status" className="absolute bottom-48 lg:bottom-24 left-4 max-w-[min(32rem,calc(100%-2rem))] border-l border-[#8bd2d6]/60 bg-[#050d0d]/95 px-3 py-3 text-xs text-[#c2e2df] pointer-events-none"><span className="block text-[9px] tracking-widest text-[#83afa1] mb-2">HAVEN · TOWING LINK</span><span className="leading-relaxed">{hud.grappleHint}</span></div>}
      {radio && !hud.grappleHint && !state.campaign.journey?.riding && <button onClick={onJournal} aria-label={`Read recording: ${radio.title}`} className="absolute bottom-48 lg:bottom-24 left-4 max-w-[min(32rem,calc(100%-2rem))] text-left border-l border-[#93b7a9]/50 bg-[#050d0d]/90 px-3 py-3 text-xs text-[#c2d1c8]">
        <span className="block text-[9px] tracking-widest text-[#83afa1] mb-2">{radio.speaker}</span><span className="leading-relaxed">{radio.text}</span>
      </button>}
      {exposed && <div role="alert" className="absolute top-40 left-4 max-w-[48%] border-l-2 bg-black/90 p-2 text-[10px] pointer-events-none" style={{ color: radiationColor, borderColor: radiationColor }}>
        <div>{protectedFromRadiation ? state.radiationCharge < 30 ? 'RADIATION · RESERVE LOW' : 'RADIATION · RESERVE DRAINING' : 'RADIATION · LEAVE NOW'}</div>
        <div className="mt-1 opacity-70">{protectedFromRadiation ? radiation.source?.name : `${(Math.max(0, RADIATION_HULL_LIMIT - state.radiationExposure) / radiation.intensity).toFixed(1)}s AT CURRENT DOSE`}</div>
      </div>}
      {hud.message && <div role="status" className="absolute bottom-44 lg:bottom-5 left-4 max-w-[85%] bg-black/75 px-3 py-2 text-[10px] text-[#ffdfa9] pointer-events-none">{hud.message}</div>}
      {hud.prompt && <button onClick={onInteract} className="absolute bottom-36 lg:bottom-14 left-1/2 -translate-x-1/2 max-w-[90%] border border-[#00ff88]/60 bg-black/90 px-4 py-2 text-xs text-[#00ff88]">{hud.prompt}</button>}
    </>}
  </>
}

export function ExpeditionOverlay({ gameState, state, hasSave, saveAvailable, lostCredits, onStart, onNew, onBuy, onBuySupply, onRelocate, journalOpen, onJournal, onCloseJournal, onResume, onMenu, onExit }: {
  gameState: HardVacuumGameState; state: Expedition; hasSave: boolean; saveAvailable: boolean
  lostCredits: number
  onStart: () => void; onNew: () => void; onBuy: (id: ShopUpgrade) => void; onResume: () => void; onMenu: () => void; onExit: () => void
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
        <button className={`${button} mt-6`} data-initial-focus onClick={onCloseJournal}>Back · Esc</button>
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
        <div className="flex flex-wrap gap-3 mt-7">
          <button className={button} data-initial-focus onClick={onStart}>{hasSave ? 'Continue expedition' : 'Launch expedition'}</button>
          <button className={button} onClick={onExit}>Back</button>
        </div>
        {hasSave && <button className={`${button} mt-4 text-xs`} onClick={() => setConfirmNew(true)}>Start a new expedition…</button>}
      </>}
      {gameState === 'menu' && confirmNew && <>
        <h2 className="text-2xl text-[#ffcf85]">Start a new expedition?</h2>
        <p className="mt-4 text-sm text-white/65">This replaces your saved upgrades, banked credits, and station progress.</p>
        <div className="flex flex-wrap gap-3 mt-6">
          <button className={button} data-initial-focus onClick={() => setConfirmNew(false)}>Cancel · Esc</button>
          <button className={button} onClick={() => { setConfirmNew(false); onNew() }}>Start fresh</button>
        </div>
      </>}
      {gameState === 'docked' && <>
        <p className="text-[10px] tracking-[0.3em] text-[#00ff88] uppercase">{checkpoint}</p>
        <h2 className="text-3xl mt-3">Haven outfitter</h2>
        <div className="my-5 flex justify-between items-baseline border-y border-white/10 py-3"><span className="text-xs uppercase text-white/50">Banked credits</span><span className="text-2xl text-[#00ff88]">{state.banked}</span></div>
        <nav aria-label="Haven services" className="flex flex-wrap gap-2 mb-4">{(['supplies','upgrades','berths'] as const).map(page => <button key={page} aria-pressed={outfitterPage===page} onClick={() => setOutfitterPage(page)} className={`px-3 py-2 text-xs border ${outfitterPage===page ? 'border-[#8ee5e8] text-[#bce0d3]' : 'border-white/15 text-white/50'}`}>{page==='supplies' ? 'Supplies' : page==='upgrades' ? 'Ship upgrades' : 'Service berths'}</button>)}</nav>
        {outfitterPage === 'supplies' && <div className="space-y-3">{supplyOffers(state).map(item => <button key={item.slot} aria-label={`${item.name}, ${item.full && item.id === 'blaster' ? 'installed' : `${item.cost} credits`}, ${item.detail}`} onClick={() => onBuySupply(item.id)} disabled={item.full || state.banked < item.cost} className="w-full text-left border border-[#8ee5e8]/25 p-3 enabled:hover:bg-[#8ee5e8]/10 disabled:opacity-45 flex justify-between gap-4">
          <span><span className="block text-sm text-[#b8ddcf]">{item.name}</span><span className="block text-xs text-white/50 mt-1">{item.detail}</span></span>
          <span className="text-xs text-[#8ee5e8] whitespace-nowrap">{item.full ? item.id === 'blaster' ? 'INSTALLED' : 'FULL' : `${item.cost.toLocaleString()} CR`}</span>
        </button>)}</div>}
        {outfitterPage === 'upgrades' && <div className="space-y-3 mt-3">{SHOP.map(track => {
          const item = upgradeOffer(state, track.id)
          return <button key={item.id} aria-label={`${item.name}, ${item.maxed ? 'maximum stage installed' : `stage ${item.stage} of ${item.maxLevel}, ${item.cost} credits, ${item.detail}`}`} onClick={() => onBuy(item.id)} disabled={item.maxed || state.banked < item.cost} className="w-full text-left border border-[#00ff88]/25 p-3 enabled:hover:bg-[#00ff88]/10 disabled:opacity-45 flex justify-between gap-4">
            <span><span className="block text-sm text-[#b8ddcf]">{item.name}</span><span className="block text-xs text-white/50 mt-1">{item.maxed ? '' : `Stage ${item.stage}/${item.maxLevel} · `}{item.detail}</span></span>
            <span className="text-xs text-[#00ff88] whitespace-nowrap">{item.maxed ? 'MAXED' : `${item.cost.toLocaleString()} CR`}</span>
          </button>
        })}</div>}
        {outfitterPage === 'berths' && <div className="border-t border-white/15 pt-5 mt-5"><h3 className="text-xs tracking-widest text-[#8ee5e8]">HAVEN / SERVICE ROUTE</h3>
          <p className="text-xs text-white/45 mt-2">Travel aboard Haven to an energized berth. Cargo stays behind.</p>
          <div className="grid sm:grid-cols-2 gap-2 mt-3">{BERTHS.filter(b => state.campaign.berths.includes(b.id)).map(berth => {
            const here = berth.id === state.campaign.berth, ready = !!serviceRoute(state,berth.id)
            return <button key={berth.id} disabled={here || !ready} onClick={() => onRelocate(berth.id)} className="text-left border border-[#8ee5e8]/30 p-3 text-xs text-[#b8ddcf] disabled:opacity-40">{berth.name}<span className="block text-[10px] text-white/50 mt-1">{here ? 'DOCKED' : ready ? 'RELOCATE HAVEN' : 'SERVICE ROUTE OBSTRUCTED'}</span></button>
          })}</div>
        </div>}
        <div className="flex flex-wrap gap-2 mt-5"><button className={button} data-initial-focus onClick={onResume}>Undock · Esc</button><button className={button} onClick={onJournal}>Flight recorder</button></div>
      </>}
      {gameState === 'paused' && <>
        <p className="text-xs text-[#00ff88] tracking-widest uppercase">Expedition paused</p>
        <h2 className="text-3xl mt-3">Hard Vacuum</h2>
        <p className="mt-5 text-[#b8ddcf]">{goal.title}</p><p className="mt-2 text-sm text-white/60 leading-relaxed">{goal.detail}</p>
        <p className="mt-4 text-xs text-[#ffcf85]">Respawn: {checkpoint} · {state.credits} credits at risk · {state.banked} banked</p>
        <div className="flex flex-wrap gap-3 mt-7"><button className={button} onClick={onResume}>Resume · P</button><button className={button} onClick={onJournal}>Flight recorder</button><button className={button} onClick={onExit}>Save & exit</button></div>
      </>}
      {gameState === 'gameOver' && <>
        <p className="text-xs text-[#ff7962] tracking-widest uppercase">Ship lost / recovery beacon active</p>
        <h2 className="text-3xl mt-3">Return to {checkpoint}</h2>
        <p className="mt-5 text-[#ffbd69]">{lostCredits} carried credits lost.</p>
        <p className="mt-3 text-sm text-white/60 leading-relaxed">{state.banked} credits banked.</p>
        <div className="flex flex-wrap gap-3 mt-7"><button className={button} data-initial-focus onClick={onStart}>Respawn</button><button className={button} onClick={onMenu}>Main menu</button><button className={button} onClick={onExit}>Exit</button></div>
      </>}
      {gameState === 'complete' && <>
        <p className="text-xs text-[#ffcf85] tracking-[0.3em] uppercase">Expedition complete</p>
        <h2 className="text-4xl text-[#00ff88] mt-4">The route is clear.</h2>
        <p className="mt-5 text-sm text-white/65 leading-relaxed">Haven bridges the awakening bus. Across Orison, three hundred and twelve suspension units begin their return cycle. For the first time in nine years, the open channel carries a living voice.</p>
        <blockquote className="border-l border-[#00ff88]/50 pl-4 mt-6 text-[#c0e7d6]">“Haven? We’ve got your lights. Is the route clear?”</blockquote>
        <div className="flex flex-wrap gap-4 mt-6 text-xs text-[#ffcf85]"><span>{REGIONS.filter(r => r.rooms.some(id => state.visited.includes(id))).length}/6 regions explored</span><span>{state.caches.length}/{CACHES.length} cargo recovered</span><span>{state.campaign.records.length}/{RECORDS.length} recordings</span><span>{Math.floor(state.campaign.playedSeconds/60)} minutes in flight</span></div>
        <div className="flex gap-3 mt-7"><button className={button} onClick={onResume}>Keep exploring</button><button className={button} onClick={onExit}>Save & exit</button></div>
      </>}
      {(gameState === 'menu' || gameState === 'paused') && <>
        <button className="mt-5 text-xs text-white/50 hover:text-white" aria-expanded={showControls} onClick={() => setShowControls(!showControls)}>Controls</button>
        {showControls && <div className="grid grid-cols-2 gap-3 mt-4 text-xs text-white/60">
          <span>A / D · Rotate</span><span>W / S · Rear / nose thruster</span><span>Space · Laser</span><span>G · Blaster</span>
          <span>F · Aim from the nose, grapple / release</span><span>E · Dock / call Haven</span><span>R · Remote recharge</span><span>T · Teleport</span><span>M · Map</span><span>J · Flight recorder</span><span>P / Esc · Pause</span>
        </div>}
      </>}
      {!saveAvailable && <p className="mt-4 text-xs text-[#ffbd69]">Browser storage is unavailable. Progress is kept for this session only.</p>}
    </div>
  </KeyboardDialog>
}
