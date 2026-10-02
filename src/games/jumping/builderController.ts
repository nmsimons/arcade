import { createControllerReader, stickAxis, triggerPressure } from '../hardVacuum/controllerInput.ts'
import type { ControllerPad } from '../hardVacuum/controllerInput.ts'

/** Each editor surface arms independently, including the second stick. */
export function createBuilderControllerReader() {
  const reader = createControllerReader()
  let identity: string | undefined, scope: string | undefined, rightBlocked = false
  return {
    reset() { reader.reset(); scope = undefined },
    sample(pads: readonly (ControllerPad | null)[], context: string, now: number, focused = true) {
      const supported = pads.filter((pad): pad is ControllerPad => !!pad?.connected && pad.mapping === 'standard')
      const key = (pad: ControllerPad) => `${pad.index}:${pad.id}`
      const selected = supported.find(pad => key(pad) === identity) ?? supported[0]
      const next = selected && key(selected), token = focused ? context : 'unfocused'
      const right = { x: stickAxis(selected?.axes[2]), y: stickAxis(selected?.axes[3]) }
      if (scope !== token || identity !== next) {
        rightBlocked = right.x !== 0 || right.y !== 0
        scope = token; identity = next
      }
      if (!right.x && !right.y) rightBlocked = false
      const sample = reader.sample(selected ? [selected] : [], `menu:builder-${context}`, now, focused)
      const held = (button: number) => sample.held.includes(button)
      return { ...sample, right: focused && !rightBlocked ? right : { x: 0, y: 0 },
        fine: held(10), zoom: (held(7) ? triggerPressure(selected?.buttons[7]?.value) : 0)
          - (held(6) ? triggerPressure(selected?.buttons[6]?.value) : 0) }
    },
  }
}

export function moveBuilderCursor(cursor: { x: number; y: number }, direction: { x: number; y: number }, dt: number,
  size: { width: number; height: number }, fine = false) {
  const distance = Math.min(.05, Math.max(0, dt)) * (fine ? 80 : 320) / Math.max(1, Math.hypot(direction.x, direction.y))
  return { x: Math.max(0, Math.min(size.width - 1, cursor.x + direction.x * distance)),
    y: Math.max(0, Math.min(size.height - 1, cursor.y + direction.y * distance)) }
}
