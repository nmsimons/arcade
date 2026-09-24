/** The saved point is the center of the plate at its supporting floor surface. */
export const GOAL_PLATE_WIDTH = 56
export const GOAL_POLE_OFFSET = 44
export const GOAL_LIGHT_HEIGHT = 96
export const GOAL_REVEAL_SECONDS = 1.5

export function goalBounds(goal: { x: number; y: number }) {
  return { x: goal.x - GOAL_PLATE_WIDTH / 2 - 3, y: goal.y - GOAL_LIGHT_HEIGHT - 14,
    w: GOAL_PLATE_WIDTH / 2 + GOAL_POLE_OFFSET + 17, h: GOAL_LIGHT_HEIGHT + 14 }
}
