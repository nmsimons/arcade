import { TUNING } from './movementTuning.ts'

// A modest horizontal advantage in dry air; ground speed, jump height and
// collision/catch rules remain those of the shared controller.
export const BOT_AIR_SPEED_SCALE = 1.2
export const BOT_AIR_SPEED = TUNING.runSpeed * BOT_AIR_SPEED_SCALE

// A larger bot keeps these speeds but accelerates `size` times as hard (botNavigation.ts, sizeFrame.ts).
export function botJumpReach(time: number, speed: number = TUNING.runSpeed, size = 1) {
  const air = TUNING.airAcceleration * size, accelerating = Math.min(time, Math.max(0, BOT_AIR_SPEED - speed) / air)
  return speed * accelerating + air * accelerating ** 2 / 2 + BOT_AIR_SPEED * (time - accelerating)
}

export function botJumpTakeoffSpeed(distance: number, time: number, size = 1) {
  if (time <= 0) return 0
  const air = TUNING.airAcceleration * size, accelerating = distance / time - air * time / 2
  return Math.max(0, accelerating + air * time <= BOT_AIR_SPEED ? accelerating
    : BOT_AIR_SPEED - Math.sqrt(Math.max(0, 2 * air * (BOT_AIR_SPEED * time - distance))))
}
