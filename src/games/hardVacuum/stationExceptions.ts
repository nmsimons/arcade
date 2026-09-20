import type { GateId, RoomId } from './stationIds'

/** Intentional difficulty/placement exceptions, not alternate geometry. */
export const TRANSFER_RULES = {
  safeIntroGate: 'breach-link' as GateId,
  earlyRooms: ['stores', 'works'] as readonly RoomId[],
  finalReturnGate: 'breach-return' as GateId,
  // The last conduit ends on the Heart side of this commissioning door.
  finalReturnQuietArea: { minX: 8000, maxY: 4080 },
  minimumTubeLength: 600,
  strength: { early: .24, late: .36, finalReturn: .12 },
} as const
export const ENCOUNTER_RULES = {
  roomCounts: { haven: 5, refuge: 4, infirmary: 4 } as Partial<Record<RoomId, number>>,
  safeTransitRoom: 'breach' as RoomId,
  finalDoorClearance: { x: 8180, y: 4015, radius: 150 },
} as const
