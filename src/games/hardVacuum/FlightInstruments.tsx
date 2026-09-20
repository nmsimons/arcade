import type { ReactNode } from 'react'
import type { Expedition } from './expedition'
import { expeditionMap, maxShields, near } from './expedition'
import { havenPosition, havenReady } from './campaign'
import { blasterCapacity } from './upgrades'
import { radiationAt, RADIATION_CAPACITY, radiationFraction, RADIATION_HULL_LIMIT } from './radiation'
import './flightHud.css'
import { ControlLabel } from './ControlPrompt'

function Meter({ label, value, max, color, segmented = false, valueText, shortcut, onClick, disabled }: {
  label: string; value: number; max: number; color: string; segmented?: boolean
  valueText?: string; shortcut?: string; onClick?: () => void; disabled?: boolean
}) {
  const reading = valueText ?? `${value}/${max}`
  const contents = <>
    <span className="hud-meter-label">{shortcut ? <ControlLabel label={label} keyboard={shortcut} action="blaster" /> : label}</span>
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

export function FlightInstruments({ state, shields, room, mapOpen, saveIssue, onMap, onJournal, onPause, onBlaster, onTeleport }: {
  state: Expedition; shields: number; room: string; mapOpen: boolean; saveIssue?: string
  onMap: () => void; onJournal: () => void; onPause: () => void
  onBlaster: () => void; onTeleport: () => void
}) {
  const radiation = radiationAt(state.position, expeditionMap(state)), exposed = radiation.intensity > 0
  const radiationInstalled = state.upgrades.includes('radiation')
  const protectedFromRadiation = radiationInstalled && state.radiationCharge > 0
  const radiationLow = radiationFraction(state) < .3
  const radiationColor = exposed && (!protectedFromRadiation || radiationLow) ? '#ff927c' : '#c1adff'
  const radiationWarning = !protectedFromRadiation ? 'Radiation · Leave now' : radiationLow ? 'Radiation reserve low' : 'Radiation exposure'
  const hullExposed = !state.impactShieldInstalled || shields === 0
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
        <button onClick={onMap} aria-label="Station map" aria-keyshortcuts="M"><ControlLabel label="Map" keyboard="M" action="map" /></button>
        <button onClick={onJournal} aria-label="Flight recorder" aria-keyshortcuts="G"><ControlLabel label="Log" keyboard="G" action="journal" /></button>
        <button onClick={onPause} aria-label="Pause game" aria-keyshortcuts="P Escape"><ControlLabel label="Pause" keyboard="P" action="pause" /></button>
      </nav>}
      {(state.impactShieldInstalled || radiationInstalled || exposed || state.blasterInstalled) && <div className="hud-meters">
        {state.impactShieldInstalled && <Meter label="Shields" value={shields} max={maxShields(state)} color={shields === 0 ? '#ff927c' : '#69dbab'} segmented />}
        {(radiationInstalled || exposed) && <Meter label="Radiation" value={radiationInstalled ? Math.round(state.radiationCharge) : 0} max={RADIATION_CAPACITY} valueText={radiationInstalled ? `${Math.ceil(radiationFraction(state)*100)}%` : '—'} color={radiationColor} />}
        {state.blasterInstalled && <Meter label="Blaster" value={state.blasterCharges} max={blasterCapacity(state)} color="#ff8278" segmented shortcut="B" onClick={onBlaster} disabled={mapOpen || state.blasterCharges === 0} />}
      </div>}
      {!mapOpen && (hullExposed || exposed || saveIssue) && <div className="hud-warnings">
        {saveIssue && <div role="alert" className="hud-save-warning">{saveIssue}</div>}
        {hullExposed && <div role="alert" className="hud-hull-warning">Hull exposed</div>}
        {exposed && <div role="alert" style={{ color: radiationColor }}>
          <div>{radiationWarning}</div>
          <div className="hud-warning-detail">{protectedFromRadiation ? radiation.source?.name : `${(Math.max(0, RADIATION_HULL_LIMIT - state.radiationExposure) / radiation.intensity).toFixed(1)}s at current dose`}</div>
        </div>}
      </div>}
      {state.teleporterInstalled && <div className="hud-equipment" aria-label="Ship equipment">
        {state.teleporterInstalled && <EquipmentButton label="Teleport to Haven" shortcut="T" onClick={onTeleport} disabled={mapOpen || !havenReady(state) || near(state.position, havenPosition(state), 130)}><span><ControlLabel label="Teleport" keyboard="T" action="teleport" /></span></EquipmentButton>}
      </div>}
    </section>
  </div>
}
