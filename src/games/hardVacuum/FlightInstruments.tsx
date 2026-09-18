import type { ReactNode } from 'react'
import type { Expedition } from './expedition'
import { expeditionMap, maxShields, near } from './expedition'
import { havenPosition, havenReady } from './campaign'
import { BLASTER_CAPACITY } from './blaster'
import { radiationAt, RADIATION_HULL_LIMIT } from './radiation'
import { needsRecharge, RECHARGE_PACK_LIMIT } from './supplies'
import { SHIELD_REPAIR_TIME } from './tuning'
import './flightHud.css'

function Meter({ label, value, max, color, segmented = false, valueText, shortcut, onClick, disabled }: {
  label: string; value: number; max: number; color: string; segmented?: boolean
  valueText?: string; shortcut?: string; onClick?: () => void; disabled?: boolean
}) {
  const reading = valueText ?? `${value}/${max}`
  const keyIndex = shortcut ? label.toLowerCase().indexOf(shortcut.toLowerCase()) : -1
  const contents = <>
    <span className="hud-meter-label">{keyIndex < 0 ? label : <>{label.slice(0, keyIndex)}<span className="underline underline-offset-2">{label[keyIndex]}</span>{label.slice(keyIndex + 1)}</>}</span>
    <span className="hud-meter-track" aria-hidden="true">
      {segmented ? Array.from({ length: max }, (_, index) => <span key={index} className={`hud-meter-segment ${index < value ? 'is-filled' : ''}`} />)
        : <span className="hud-meter-continuous"><span style={{ width: `${Math.max(0, Math.min(100, value / max * 100))}%` }} /></span>}
    </span>
    <span className="hud-meter-value">{reading}</span>
  </>
  return onClick
    ? <button className="hud-instrument" style={{ color }} onClick={onClick} disabled={disabled} aria-label={`Fire ${label.toLowerCase()}, ${value} of ${max} charges`} aria-keyshortcuts={shortcut}>{contents}</button>
    : <div className="hud-instrument" style={{ color }} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={reading}>{contents}</div>
}

function EquipmentButton({ label, shortcut, onClick, disabled, children }: {
  label: string; shortcut: string; onClick: () => void; disabled: boolean; children?: ReactNode
}) {
  return <button className="hud-equipment-button" onClick={onClick} disabled={disabled} aria-label={label} aria-keyshortcuts={shortcut}>
    {children}
  </button>
}

export function FlightInstruments({ state, shields, room, mapOpen, onMap, onJournal, onPause, onBlaster, onRecharge, onTeleport }: {
  state: Expedition; shields: number; room: string; mapOpen: boolean
  onMap: () => void; onJournal: () => void; onPause: () => void
  onBlaster: () => void; onRecharge: () => void; onTeleport: () => void
}) {
  const radiation = radiationAt(state.position, expeditionMap(state)), exposed = radiation.intensity > 0
  const radiationInstalled = state.upgrades.includes('radiation')
  const protectedFromRadiation = radiationInstalled && state.radiationCharge > 0
  const radiationColor = exposed && (!protectedFromRadiation || state.radiationCharge < 30) ? '#ff927c' : '#c1adff'
  const recharging = state.remoteRechargeRemaining > 0
  const hasRecharge = state.rechargePacks > 0 || recharging
  const radiationWarning = !protectedFromRadiation ? 'Radiation · Leave now' : state.radiationCharge < 30 ? 'Radiation reserve low' : 'Radiation exposure'
  return <div className="flight-hud">
    <div className="hud-location">
      <div className="hud-room">{room}</div>
      <dl className="hud-credits" aria-label="Credits">
        <div><dt>Carried</dt><dd>{state.credits.toLocaleString()}</dd></div>
        <div><dt>Banked</dt><dd>{state.banked.toLocaleString()}</dd></div>
      </dl>
    </div>
    <section className="hud-console" aria-label="Ship systems">
      {!mapOpen && <nav className="hud-console-nav" aria-label="Flight tools">
        <button onClick={onMap} aria-label="Station map" aria-keyshortcuts="M" title="Station map · M"><span className="underline underline-offset-2">M</span>ap</button>
        <button onClick={onJournal} aria-label="Flight recorder" aria-keyshortcuts="L" title="Log · L"><span className="underline underline-offset-2">L</span>og</button>
        <button onClick={onPause} aria-label="Pause game" aria-keyshortcuts="P Escape" title="Pause · P / Esc"><span className="underline underline-offset-2">P</span>ause</button>
      </nav>}
      <div className="hud-meters">
        <Meter label="Shields" value={shields} max={maxShields(state)} color={shields === 0 ? '#ff927c' : '#69dbab'} segmented />
        {(radiationInstalled || exposed) && <Meter label="Radiation" value={radiationInstalled ? Math.round(state.radiationCharge) : 0} max={100} valueText={radiationInstalled ? `${Math.ceil(state.radiationCharge)}%` : '—'} color={radiationColor} />}
        {state.blasterInstalled && <Meter label="Blaster" value={state.blasterCharges} max={BLASTER_CAPACITY} color="#ff8278" segmented shortcut="B" onClick={onBlaster} disabled={mapOpen || state.blasterCharges === 0} />}
      </div>
      {!mapOpen && (shields === 0 || exposed) && <div className="hud-warnings">
        {shields === 0 && <div role="alert" className="hud-hull-warning">Hull exposed</div>}
        {exposed && <div role="alert" style={{ color: radiationColor }}>
          <div>{radiationWarning}</div>
          <div className="hud-warning-detail">{protectedFromRadiation ? radiation.source?.name : `${(Math.max(0, RADIATION_HULL_LIMIT - state.radiationExposure) / radiation.intensity).toFixed(1)}s at current dose`}</div>
        </div>}
      </div>}
      {(hasRecharge || state.teleporterInstalled) && <div className="hud-equipment" aria-label="Ship equipment">
        {hasRecharge && <EquipmentButton label={recharging ? 'Remote recharge in progress' : `Remote recharge, ${state.rechargePacks} of ${RECHARGE_PACK_LIMIT} packs`} shortcut="R" onClick={onRecharge} disabled={mapOpen || state.rechargePacks === 0 || recharging || !needsRecharge(state)}>
          <span>{recharging ? 'Charging' : <><span className="underline underline-offset-2">R</span>echarge</>}</span><span className="hud-equipment-count">{state.rechargePacks}</span>
          {recharging && <span className="hud-recharge-progress" role="progressbar" aria-label="Remote recharge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((1 - state.remoteRechargeRemaining / SHIELD_REPAIR_TIME) * 100)} style={{ width: `${(1 - state.remoteRechargeRemaining / SHIELD_REPAIR_TIME) * 100}%` }} />}
        </EquipmentButton>}
        {state.teleporterInstalled && <EquipmentButton label="Teleport to Haven" shortcut="T" onClick={onTeleport} disabled={mapOpen || !havenReady(state) || near(state.position, havenPosition(state), 130)}><span><span className="underline underline-offset-2">T</span>eleport</span></EquipmentButton>}
      </div>}
    </section>
  </div>
}
