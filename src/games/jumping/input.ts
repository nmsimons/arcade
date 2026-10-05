import { createControllerReader } from '../hardVacuum/controllerInput.ts'
import type { ControllerPad } from '../hardVacuum/controllerInput.ts'
import { TUNING } from './model.ts'

export function keyboardMovement(keys: ReadonlySet<string>) {
  const direction = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  return direction * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? TUNING.walkSpeed / TUNING.runSpeed : 1)
}
export function createJumpController() {
  const reader = createControllerReader()
  return {
    reset: () => reader.reset(),
    sample(pads: readonly (ControllerPad | null)[], screen: string, now: number, focused = true) {
      const sample = reader.sample(pads, screen === 'playing' ? 'jumping' : `menu:jumping-${screen}`, now, focused)
      const held = (button: number) => sample.held.includes(button)
      const move = Number(held(15)) - Number(held(14)) || sample.direction.x
      return { ...sample, move,
        jump: held(0), climb: held(12) || sample.direction.y < -.5, drop: held(1) || held(13) || sample.direction.y > .65,
        descend: held(13) || sample.direction.y > .65, detach: held(1),
        crouch: held(13) || sample.direction.y > .65, reach: false,
        pause: sample.pressed.includes(9) }
    },
  }
}
