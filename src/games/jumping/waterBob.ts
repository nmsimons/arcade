import { TUNING } from './movementTuning.ts'
import type { Player, JumpInput } from './model.ts'

export interface WaterBob { phase: number; amount: number }
export interface WaterCamera { y: number; amount: number; source: string }

/** Ambient water motion is a small force through the existing buoyancy solver,
 * never a drawing offset or a replacement for an interacting body's velocity. */
export function advanceWaterBob(previous: WaterBob | undefined, dt: number, resting: boolean, seed: number): WaterBob | undefined {
  if (!previous && !resting) return undefined
  const phase = ((previous?.phase ?? seed * .013) + dt * Math.PI * 2 / TUNING.waterBobPeriod) % (Math.PI * 2)
  const target = Number(resting), response = resting ? .9 : .22
  const amount = target + ((previous?.amount ?? 0) - target) * Math.exp(-dt / response)
  return !resting && amount < .0001 ? undefined : { phase, amount }
}

export function waterBobAcceleration(bob: WaterBob | undefined, floatDrag: number) {
  // Critical damping is 2*sqrt(stiffness). A small moving equilibrium gives
  // the same small bob to large and small bodies without a mass-dependent shove.
  return bob ? Math.min(100, floatDrag ** 2 / 4) * TUNING.waterBobHeight * bob.amount * Math.sin(bob.phase) : 0
}

/** Hold the framing steady while the real body bobs; ease back into ordinary
 * following before switching between floating and a carried support. */
export function advanceWaterCamera(p: Player, input: JumpInput, dt: number) {
  const support = p.grounded ? p.contacts?.support : null
  const bob = support ? support.collider.prop?.waterBob : p.waterBob
  const source = support?.collider.id ?? 'player'
  const quiet = !input.jump && !input.descend && !input.drop && Math.abs(input.move) < .01
    && !p.hang && !p.mantle && !p.climbing && !p.releaseTurn && !p.jumpLift && !p.waterJump
    && (p.waterMotion?.amount ?? 0) < .05 && Math.abs(p.vx) < 12
  let target = quiet ? bob?.amount ?? 0 : 0
  if (!p.waterCamera && target) p.waterCamera = { y: p.y, amount: 0, source }
  const state = p.waterCamera
  if (!state) return
  if (state.source !== source) {
    if (state.amount > .001) target = 0
    else { state.source = source; state.y = p.y }
  }
  state.y += (p.y - state.y) * (1 - Math.exp(-dt * (1 - target) * 12))
  state.amount += Math.max(-dt / .25, Math.min(dt / .25, target - state.amount))
  if (!state.amount && !target) delete p.waterCamera
}
