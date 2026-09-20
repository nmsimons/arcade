export const FLIGHT_KEYS = ['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','o','k','l',';'] as const

export interface ControllerFlightInput { turn: number; thrust: number; reverse: number; strafe: number; laser: boolean }
export const neutralController = (): ControllerFlightInput => ({ turn: 0, thrust: 0, reverse: 0, strafe: 0, laser: false })
const throttle = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
export function sanitizeController(input: ControllerFlightInput): ControllerFlightInput {
  return { turn: Number.isFinite(input.turn) ? Math.max(-1, Math.min(1, input.turn)) : 0,
    thrust: throttle(input.thrust), reverse: throttle(input.reverse),
    strafe: Number.isFinite(input.strafe) ? Math.max(-1, Math.min(1, input.strafe)) : 0, laser: input.laser === true }
}

/** Physics, hull banking, thruster visuals and audio share the same controls. */
export function flightInput(keys: ReadonlySet<string>, controller?: ControllerFlightInput) {
  const left = keys.has('a') || keys.has('k') || keys.has('arrowleft')
  const right = keys.has('d') || keys.has(';') || keys.has('arrowright')
  return {
    left, right,
    turn: left || right ? Number(right) - Number(left) : controller?.turn ?? 0,
    strafe: controller?.strafe ?? 0,
    forward: Math.max(Number(keys.has('w') || keys.has('o') || keys.has('arrowup')), controller?.thrust ?? 0),
    reverse: Math.max(Number(keys.has('s') || keys.has('l') || keys.has('arrowdown')), controller?.reverse ?? 0),
  }
}
