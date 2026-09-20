export type ControllerAction = 'confirm' | 'back' | 'mapOverview' | 'mapZoom' | 'laser' | 'tether' | 'blaster' | 'interact' | 'journal' | 'reverse' | 'teleport' | 'thrust' | 'map' | 'pause'
export interface ControllerLayout {
  readonly id: string
  readonly name: string
  readonly buttons: Readonly<Record<ControllerAction, number>>
  readonly axes: Readonly<{ turn: number; menuX: number; menuY: number; scroll: number }>
}

// One shipped layout for now. Add future presets here; the sampler, actions and
// displayed flight bindings all use the selected layout, not hard-coded indices.
export const CONTROLLER_LAYOUTS: readonly ControllerLayout[] = [{
  id: 'trigger-flight', name: 'Trigger flight',
  buttons: { confirm: 0, back: 1, mapOverview: 3, mapZoom: 2, laser: 0, tether: 2, blaster: 1, interact: 3, journal: 4, reverse: 6, teleport: 3, thrust: 7, map: 8, pause: 9 },
  axes: { turn: 0, menuX: 0, menuY: 1, scroll: 3 },
}]
export const DEFAULT_CONTROLLER_LAYOUT = CONTROLLER_LAYOUTS[0]
export const CONTROLLER = DEFAULT_CONTROLLER_LAYOUT.buttons

const BUTTON_LABELS = ['A / ×', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'View / Share', 'Menu / Options']
export const controllerButtonLabel = (index: number) => BUTTON_LABELS[index] ?? `Button ${index + 1}`
export const controllerTurnLabel = (layout: ControllerLayout) => `${layout.axes.turn === 0 ? 'Left stick' : layout.axes.turn === 2 ? 'Right stick' : `Axis ${layout.axes.turn + 1}`} ← / → · Rotate only`
export function controllerMenuHelp(layout: ControllerLayout, map = false) {
  const label = (action: ControllerAction) => controllerButtonLabel(layout.buttons[action])
  return `${map ? 'D-pad' : 'Stick / D-pad'} · Move   ${label('confirm')} · Select   ${label('back')} · Back   ${map ? `${label('mapZoom')} · Zoom   ${label('mapOverview')} · Overview   Left stick · Pan when zoomed` : 'Right stick · Scroll'}`
}
export const CONTROLLER_FLIGHT_HELP: readonly { action: ControllerAction; label: string }[] = [
  { action: 'thrust', label: 'Thrust (proportional)' }, { action: 'reverse', label: 'Brake / reverse (proportional)' },
  { action: 'laser', label: 'Hold laser' }, { action: 'tether', label: 'Grapple / release' },
  { action: 'blaster', label: 'Blaster (one shot per press)' }, { action: 'interact', label: 'Dock / call Haven' },
  { action: 'teleport', label: 'Teleport' }, { action: 'journal', label: 'Log' },
  { action: 'map', label: 'Map' }, { action: 'pause', label: 'Pause' },
]

export function controllerFlightHelp(layout: ControllerLayout) {
  if (layout.buttons.interact !== layout.buttons.teleport) return CONTROLLER_FLIGHT_HELP
  return CONTROLLER_FLIGHT_HELP.filter(({action})=>action!=='teleport').map(entry=>
    entry.action==='interact' ? {...entry,label:'Dock / call Haven nearby; teleport elsewhere'} : entry)
}
