import type { Player } from './characterTypes.ts'

/** Where a body is weightless, as its last movement step found it: the terrain that step moved among (the body's
 * frame), and a test of a point in that frame. The step (model.ts) sets it only in the world's own frame; the float's
 * landing look-ahead (athleteAnimation.ts) reads it, so the drawing never expects a weightless landing the body will
 * only reach with weight. Physics state published for presentation; nothing in the step reads it. */
export const weightlessPlaces = new WeakMap<Player, { terrain: readonly unknown[]; at(x: number, y: number): boolean }>()
