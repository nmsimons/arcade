import { createContext, useContext } from 'react'
import { controllerButtonLabel, DEFAULT_CONTROLLER_LAYOUT } from './controllerLayouts.ts'
import type { ControllerAction, ControllerLayout } from './controllerLayouts'

export type HintAction = ControllerAction | 'turnLeft' | 'turnRight'
export const ControlHintsContext = createContext({ connected: false, layout: DEFAULT_CONTROLLER_LAYOUT })

export function controlHint(connected: boolean, action: HintAction, keyboard: string, layout: ControllerLayout = DEFAULT_CONTROLLER_LAYOUT) {
  if (!connected) return keyboard
  if (action === 'turnLeft' || action === 'turnRight') {
    const stick = layout.axes.turn === 0 ? 'LS' : layout.axes.turn === 2 ? 'RS' : `Axis ${layout.axes.turn}`
    return `${stick} ${action === 'turnLeft' ? '←' : '→'}`
  }
  return controllerButtonLabel(layout.buttons[action])
}

/** Adapt authored tutorial/interaction copy at the presentation boundary only.
 * Do not modify campaign data, recordings, saves, or unrelated prose letters. */
export function controlText(text: string, connected: boolean, layout: ControllerLayout = DEFAULT_CONTROLLER_LAYOUT) {
  if (!connected) return text
  const label = (action: ControllerAction) => controllerButtonLabel(layout.buttons[action])
  return text.replace(/\bF\b(?= to | releases)/g, label('tether'))
    .replace(/\bS brakes/g, `${label('reverse')} brakes`)
    .replace(/ · E$/, ` · ${label('interact')}`)
    .replace(/^B · /, `${label('blaster')} · `)
    .replace(/^T · /, `${label('teleport')} · `)
}

export function useControlHints() {
  const { connected, layout } = useContext(ControlHintsContext)
  return {
    connected, layout,
    hint: (action: HintAction, keyboard: string) => controlHint(connected, action, keyboard, layout),
    text: (value: string) => controlText(value, connected, layout),
  }
}
