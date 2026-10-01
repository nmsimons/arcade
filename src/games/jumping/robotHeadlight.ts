import type { RobotState } from './challenge.ts'
import { robotTop } from './robotPhysics.ts'

export const ROBOT_HEADLIGHT_X = 27, ROBOT_HEADLIGHT_SPREAD = 40, ROBOT_HEADLIGHT_TILT = 15
export const robotHeadlightY = (robot: Pick<RobotState, 'phase'>) => robotTop(robot) + 19

/** Mount just outside the front face, keeping the bot out of its own beam. */
export function robotHeadlightPose(robot: Pick<RobotState, 'x' | 'y' | 'angle' | 'facing' | 'phase'>) {
  const x = ROBOT_HEADLIGHT_X * robot.facing, y = robotHeadlightY(robot) + 9
  const c = Math.cos(robot.angle), s = Math.sin(robot.angle)
  return { x: robot.x + x * c - y * s, y: robot.y - 9 + x * s + y * c,
    direction: ((robot.angle * 180 / Math.PI + (robot.facing < 0 ? 180 - ROBOT_HEADLIGHT_TILT : ROBOT_HEADLIGHT_TILT) + 540) % 360) - 180 }
}
