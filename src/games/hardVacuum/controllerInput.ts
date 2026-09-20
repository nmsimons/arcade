import { neutralController } from './flightInput.ts'
import { DEFAULT_CONTROLLER_LAYOUT } from './controllerLayouts.ts'
import type { ControllerLayout } from './controllerLayouts'
export { CONTROLLER } from './controllerLayouts.ts'

export type ControllerNavigation = 'up' | 'down' | 'left' | 'right'
export const STICK_DEAD_ZONE = .18
export const TRIGGER_DEAD_ZONE = .05
export interface ControllerPad {
  index: number; id: string; connected: boolean; mapping: string
  axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[]
}
export function stickAxis(value = 0) {
  if (!Number.isFinite(value) || Math.abs(value) <= STICK_DEAD_ZONE) return 0
  return Math.sign(value) * Math.min(1, (Math.abs(value) - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE))
}
export function triggerPressure(value = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, (value - TRIGGER_DEAD_ZONE) / (1 - TRIGGER_DEAD_ZONE))) : 0
}

/** A shared Haven button performs exactly one action. A nearby interaction
 * wins even while unavailable, so a blocked call never teleports the pilot. */
export function controllerHavenAction(pressed: readonly number[], hasInteraction: boolean, layout: ControllerLayout = DEFAULT_CONTROLLER_LAYOUT): 'interact' | 'teleport' | undefined {
  const {interact,teleport}=layout.buttons
  if (pressed.includes(interact) && (hasInteraction || interact!==teleport)) return 'interact'
  if (pressed.includes(teleport)) return 'teleport'
}

/** Pure frame sampler: no browser, storage, game-state or audio dependencies. */
export function createControllerReader(layout: ControllerLayout = DEFAULT_CONTROLLER_LAYOUT) {
  const CONTROLLER = layout.buttons
  let active: string | undefined, context: string | undefined
  let previous = new Set<number>(), blocked = new Set<number>(), axisBlocked = false, scrollBlocked = false
  let menuDirection: ControllerNavigation | null = null, repeatAt = 0
  return {
    layout,
    reset() { context = undefined },
    sample(pads: readonly (ControllerPad | null)[], screen: string, now: number, focused = true) {
      const supported = pads.filter((p): p is ControllerPad => !!p?.connected && p.mapping === 'standard')
      const identity = (p: ControllerPad) => `${p.index}:${p.id}`
      const pad = supported.find(p => identity(p) === active) ?? supported[0]
      const next = pad && identity(pad), disconnected = active !== undefined && next !== active
      const changed = next !== active
      if (changed) { active = next; context = undefined; previous = new Set() }
      const down = new Set<number>()
      const thrust = triggerPressure(pad?.buttons[CONTROLLER.thrust]?.value)
      const reverse = triggerPressure(pad?.buttons[CONTROLLER.reverse]?.value)
      pad?.buttons.forEach((button, index) => {
        // Both flight triggers are analog. Block even a partial pull across
        // screens until released, without a digital activation threshold.
        const pressed = index === CONTROLLER.thrust ? thrust > 0
          : index === CONTROLLER.reverse ? reverse > 0
          : button.pressed || button.value >= .55
        if (pressed) down.add(index)
      })
      const x = stickAxis(pad?.axes[screen === 'flight' ? layout.axes.turn : layout.axes.menuX]), y = stickAxis(pad?.axes[layout.axes.menuY])
      const scrollAxis = stickAxis(pad?.axes[layout.axes.scroll])
      const isMap = screen === 'map' || screen.startsWith('map:')
      const token = focused ? screen : 'unfocused'
      if (context !== token) {
        context = token; blocked = new Set(down)
        axisBlocked = x !== 0 || (screen !== 'flight' && y !== 0)
        scrollBlocked = scrollAxis !== 0
        menuDirection = null; repeatAt = 0
      }
      for (const button of blocked) if (!down.has(button)) blocked.delete(button)
      if (x === 0 && (screen === 'flight' || y === 0)) axisBlocked = false
      if (scrollAxis === 0) scrollBlocked = false
      const held = (button: number) => focused && down.has(button) && !blocked.has(button)
      const pressed = [...down].filter(button => held(button) && !previous.has(button))
      previous = down
      const direction = {
        x: focused && !axisBlocked ? x : 0,
        y: focused && !axisBlocked ? y : 0,
      }
      let navigation: ControllerNavigation | null = null
      if (screen.startsWith('menu:') || isMap) {
        const navX = Number(held(15)) - Number(held(14)) || (isMap ? 0 : direction.x)
        const navY = Number(held(13)) - Number(held(12)) || (isMap ? 0 : direction.y)
        const vertical = Math.abs(navY) >= Math.abs(navX), axis = vertical ? navY : navX
        const desired = Math.abs(axis) > .5 ? vertical ? axis < 0 ? 'up' : 'down' : axis < 0 ? 'left' : 'right' : null
        if (desired && (desired !== menuDirection || now >= repeatAt)) {
          navigation = desired; repeatAt = now + (desired !== menuDirection ? 350 : 120)
        }
        menuDirection = desired
      } else menuDirection = null
      return {
        connected: !!pad, disconnected,
        unsupported: !pad && pads.some(p => p?.connected),
        pressed, navigation, direction,
        scroll: focused && !scrollBlocked && screen.startsWith('menu:') ? scrollAxis : 0,
        flight: screen === 'flight' && focused && !disconnected
          ? { turn: axisBlocked ? 0 : x, thrust: held(CONTROLLER.thrust) ? thrust : 0, reverse: held(CONTROLLER.reverse) ? reverse : 0,
            strafe: Number(held(CONTROLLER.strafeRight))-Number(held(CONTROLLER.strafeLeft)), laser: held(CONTROLLER.laser) }
          : neutralController(),
      }
    },
  }
}
