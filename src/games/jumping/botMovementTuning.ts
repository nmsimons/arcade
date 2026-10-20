import { TUNING } from './movementTuning.ts'

// A modest horizontal advantage in dry air; ground speed, jump height and
// collision/catch rules remain those of the shared controller.
export const BOT_AIR_SPEED_SCALE = 1.2
export const BOT_AIR_SPEED = TUNING.runSpeed * BOT_AIR_SPEED_SCALE

export function botJumpReach(time: number, speed: number = TUNING.runSpeed) {
  const accelerating = Math.min(time, Math.max(0, BOT_AIR_SPEED - speed) / TUNING.airAcceleration)
  return speed * accelerating + TUNING.airAcceleration * accelerating ** 2 / 2 + BOT_AIR_SPEED * (time - accelerating)
}

export function botJumpTakeoffSpeed(distance: number, time: number) {
  if (time <= 0) return 0
  const accelerating = distance / time - TUNING.airAcceleration * time / 2
  return Math.max(0, accelerating + TUNING.airAcceleration * time <= BOT_AIR_SPEED ? accelerating
    : BOT_AIR_SPEED - Math.sqrt(Math.max(0, 2 * TUNING.airAcceleration * (BOT_AIR_SPEED * time - distance))))
}
