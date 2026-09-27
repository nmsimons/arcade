import type { NamedObject } from './objectNames.ts'
/** The saved point is the center of the plate at its supporting floor surface. */
export interface Goal extends NamedObject { x: number; y: number; flipX?: boolean }
export const GOAL_PLATE_WIDTH = 56
export const GOAL_POLE_OFFSET = 44
export const GOAL_LIGHT_HEIGHT = 96
export const GOAL_DOOR_WIDTH = 40
export const GOAL_DOOR_HEIGHT = 80
export const GOAL_DOOR_OFFSET = 100
export const GOAL_OPEN_SECONDS = .3
export const GOAL_EXIT_SECONDS = .85
export interface GoalExit { elapsed: number; fromX: number; toX: number }

export const goalPoleX = (goal: Goal) => goal.x + (goal.flipX ? -1 : 1) * GOAL_POLE_OFFSET
export function goalDoor(goal: Goal) {
  return { x: goal.x + (goal.flipX ? -1 : 1) * GOAL_DOOR_OFFSET - GOAL_DOOR_WIDTH / 2,
    y: goal.y - GOAL_DOOR_HEIGHT, w: GOAL_DOOR_WIDTH, h: GOAL_DOOR_HEIGHT }
}
export const goalEase = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
export function goalExitPosition(exit: GoalExit) {
  const t = 1 - (1 - Math.min(1, exit.elapsed / .3)) ** 3
  return exit.fromX + (exit.toX - exit.fromX) * t
}

export function goalBounds(goal: Goal) {
  const near = GOAL_PLATE_WIDTH / 2 + 3, far = GOAL_DOOR_OFFSET + GOAL_DOOR_WIDTH / 2 + 3
  return { x: goal.x - (goal.flipX ? far : near), y: goal.y - GOAL_LIGHT_HEIGHT - 14,
    w: near + far, h: GOAL_LIGHT_HEIGHT + 14 }
}
