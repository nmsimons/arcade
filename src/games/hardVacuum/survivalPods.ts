import type { Expedition } from './expedition'
import type { RoomId } from './stationIds'
import type { Vector2 } from './types'

export const SURVIVOR_COUNT = 12
export const POD_RESCUE_CREDITS = 1000
export const POD_RESCUE_CREDITS_LABEL = POD_RESCUE_CREDITS.toLocaleString('en-US')

// Two rows face the clear central towing/service lane. Empty cradles keep the
// same serial as the four pods dispatched before the station lost power.
export const WARD_POD_BERTHS = Array.from({ length: SURVIVOR_COUNT }, (_, i) => ({
  id: `survival-${String(i + 1).padStart(2, '0')}`,
  x: [2320,2396,2472,2628,2704,2780][i % 6], y: i < 6 ? 3380 : 3750,
  w: 64, h: 68, facing: i < 6 ? 1 : -1,
}))
const dispatched: Record<number, { pos: Vector2; sector: RoomId }> = {
  0: { pos: { x: 1270, y: 2750 }, sector: 'refuge-entry' },
  3: { pos: { x: 8790, y: 610 }, sector: 'manifest' },
  6: { pos: { x: 5110, y: 1090 }, sector: 'works' },
  9: { pos: { x: 1570, y: 470 }, sector: 'archive' },
}
export const SURVIVAL_PODS = WARD_POD_BERTHS.map((berth, i) => ({
  id: berth.id, label: `Survival pod ${String(i + 1).padStart(2, '0')}`,
  pos: dispatched[i]?.pos ?? { x: berth.x, y: berth.y },
  sector: dispatched[i]?.sector ?? 'transfer' as RoomId,
  locked: !dispatched[i], value: POD_RESCUE_CREDITS,
}))
export const survivalPod = (id?: string) => SURVIVAL_PODS.find(pod => pod.id === id)
export const podReleased = (s: Expedition, id: string) => {
  const pod = survivalPod(id)
  return !!pod && (!pod.locked || !!s.power['ward-power'])
}
export const allSurvivorsAboard = (s: Expedition) => SURVIVAL_PODS.every(pod => s.rescuedPods.includes(pod.id))

/** Rescue custody, money and berth occupancy commit together at shutter seal. */
export function rescuePod(s: Expedition, id: string): boolean {
  if (!podReleased(s, id) || s.rescuedPods.includes(id)) return false
  s.rescuedPods.push(id)
  s.banked += POD_RESCUE_CREDITS
  if (s.cargo) delete s.cargo[id]
  return true
}
export function completeEvacuation(s: Expedition): boolean {
  const journey = s.campaign.journey
  if (s.complete || !s.core || !allSurvivorsAboard(s) || !journey?.departure || journey.index !== journey.points.length) return false
  s.complete = true
  return true
}

const rect = (x: number, y: number, w: number, h: number): Vector2[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]
// Open mouths, not solid rectangles underneath the pods: every released pod
// can be towed straight out without teleporting through its own cradle.
export const WARD_POD_HOUSINGS = WARD_POD_BERTHS.flatMap(b => [
  rect(b.x - 34, b.y - 29, 5, 58), rect(b.x + 29, b.y - 29, 5, 58),
  rect(b.x - 34, b.y - b.facing * 32 - 2, 68, 4),
])
