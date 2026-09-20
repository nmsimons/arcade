import { BERTHS, REGIONS } from './campaignWorld.ts'
import type { BerthId } from './campaignWorld'
import { discoverCampaign } from './campaign.ts'
import { openGate, powerReceiver, SOCKETS } from './expedition.ts'
import type { Expedition } from './expedition'
import { restoreShipSystems } from './supplies.ts'
import { CIRCUIT_STEPS } from './stationProgression.ts'

export const DEV_CREDITS = 100_000
export const DEV_LEVELS = REGIONS.map((region, index) => ({
  id: region.id, name: region.name, number: index + 1,
  entry: region.id === 'refuge' ? { x: 1500, y: 2740 } : { ...BERTHS[index].pos },
}))

/** Advance prerequisites, preserving completed puzzles, equipment and cargo. */
export function advanceDevelopmentLevel(state: Expedition, id: BerthId): boolean {
  const index = DEV_LEVELS.findIndex(level => level.id === id)
  if (index < 0) return false
  state.campaign.havenActivated = true
  delete state.campaign.havenLinkPending
  const prerequisites = CIRCUIT_STEPS.filter(step => REGIONS.findIndex(region => region.id === step.region) < index)
  for (const { id: circuit } of prerequisites) {
    if (state.power[circuit]) continue
    const used = new Set(Object.values(state.power))
    // Any cell can have been used in any receiver during actual play.
    const source = !used.has(circuit) ? circuit : SOCKETS.find(socket => !used.has(socket.id))!.id
    powerReceiver(state, circuit, source)
    if (state.cargo) delete state.cargo[source]
  }
  for (const gate of prerequisites.flatMap(step => step.barriers)) openGate(state, gate)
  for (const gate of Object.keys(state.doors)) state.doors[gate] = 1
  for (const region of REGIONS.slice(0, index)) for (const room of region.rooms) {
    if (!state.visited.includes(room)) state.visited.push(room)
    discoverCampaign(state, room)
  }
  if (index >= 3) state.blasterInstalled = true
  if (index >= 1) state.impactShieldInstalled = true
  if (index >= 2 && !state.upgrades.includes('radiation')) state.upgrades.push('radiation')
  // Keep Haven at a powered berth, so arriving in a new region leaves its
  // first receiver puzzle intact (especially Refuge Approach's airlock).
  const berth = [...BERTHS.slice(0, index + 1)].reverse().find(b => !b.power || state.power[b.power])!
  state.campaign.berth = berth.id
  state.campaign.haven = { ...berth.pos }
  state.campaign.havenAngle = 0
  delete state.campaign.journey
  if (!state.campaign.berths.includes(berth.id)) state.campaign.berths.push(berth.id)
  state.checkpoint = 'haven'
  state.position = { ...DEV_LEVELS[index].entry }
  restoreShipSystems(state)
  return true
}

export function addDevelopmentCredits(state: Expedition) {
  state.banked = Math.min(Number.MAX_SAFE_INTEGER, state.banked + DEV_CREDITS)
}
