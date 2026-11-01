// Locomotion gait blend shared by the movement step and the poses.
import { TUNING } from './movementTuning.ts'

export interface GaitPose { speed: number; moving: number; run: number; air: number; jog?: number }
export function gaitPose(vx: number, airborne = false): GaitPose {
  const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
  const speed = Math.min(1, Math.abs(vx) / TUNING.runSpeed)
  // Keep precision walking below the selected walk speed, then introduce a
  // jog promptly instead of retaining a walking stride through most of the
  // analog range. The motor speed itself is unchanged.
  return { speed, moving: smooth(speed * 6), run: smooth((speed - TUNING.walkSpeed / TUNING.runSpeed) / .4), air: Number(airborne) }
}
