import type { Vector2 } from './types'
import type { Upgrade } from './expedition'
import type { RoomId, GateId, CircuitId, ProgressionId, CacheId } from './stationIds'
import { CAMPAIGN_CACHES, CAMPAIGN_GATES, CAMPAIGN_SECTORS, CAMPAIGN_SOCKETS, IGNITION_POSITION } from './campaignWorld.ts'

export interface Sector {
  id: RoomId
  name: string
  subtitle: string
  color: string
  x: number
  y: number
  w: number
  h: number
  dock?: Vector2
}
export const SECTORS: readonly Sector[] = [
  { id: 'haven', name: 'Ring service hub', subtitle: 'DISTRIBUTION / BERTH', color: '#00ff88', x: 1200, y: 800, w: 600, h: 600 },
  { id: 'salvage', name: 'Wreckwater', subtitle: '02 / SALVAGE GALLERY', color: '#65baff', x: 200, y: 800, w: 600, h: 600 },
  { id: 'foundry', name: 'The Foundry', subtitle: '03 / ABANDONED WORKSHOP', color: '#ffbd69', x: 200, y: 200, w: 600, h: 400 },
  { id: 'archive', name: 'Cold Archive', subtitle: '04 / RESEARCH VAULT', color: '#b8a0ff', x: 1200, y: 200, w: 600, h: 400 },
  { id: 'reactor', name: 'Ember Lung', subtitle: '05 / REACTOR APPROACH', color: '#ff7962', x: 2200, y: 800, w: 600, h: 600 },
  { id: 'engine', name: 'Reserve engine', subtitle: 'REFUGE FEED', color: '#ffc977', x: 2200, y: 1600, w: 600, h: 400 },
  { id: 'vault', name: 'Smuggler’s Rest', subtitle: '07 / HIDDEN SALVAGE', color: '#79e2d0', x: 1200, y: 1600, w: 600, h: 400 },
  ...CAMPAIGN_SECTORS,
]
export const GATES = [
  { id: 'rubble', kind: 'rubble', label: 'ROCK BARRIER', x: 990, y: 1000, w: 30, h: 200, color: '#ff665e' },
  { id: 'foundry', kind: 'socket', label: 'POWER CELL REQUIRED', x: 400, y: 690, w: 200, h: 30, color: '#65baff' },
  { id: 'archive', kind: 'socket', label: 'POWER OFF · HAVEN RELAY', x: 990, y: 300, w: 30, h: 200, color: '#ffbd69' },
  { id: 'shortcut', kind: 'socket', label: 'POWER OFF · HAVEN RELAY', x: 1400, y: 690, w: 200, h: 30, color: '#b8a0ff' },
  { id: 'reactor', kind: 'socket', label: 'POWER OFF · HAVEN RELAY', x: 1990, y: 1000, w: 30, h: 200, color: '#ffbd69' },
  { id: 'blast', kind: 'blast', label: 'BLAST DOOR', x: 1400, y: 1490, w: 200, h: 30, color: '#ff665e' },
  { id: 'drive', kind: 'socket', label: 'ENGINE RETURN / NO POWER', x: 1990, y: 1700, w: 30, h: 200, color: '#65baff' },
  ...CAMPAIGN_GATES,
] as const
export const gateCenter = (g: typeof GATES[number]): Vector2 => ({ x: g.x + g.w / 2, y: g.y + g.h / 2 })
export interface CircuitDefinition { id: CircuitId; pos: Vector2; source: Vector2; label: string; gates: readonly GateId[]; flags?: readonly ProgressionId[] }
export const SOCKETS: readonly CircuitDefinition[] = [
  { id: 'foundry', pos: { x: 460, y: 920 }, source: { x: 1660, y: 920 }, label: 'FOUNDRY DOOR', gates: ['foundry'] },
  { id: 'heart', pos: { x: 2480, y: 1780 }, source: { x: 2735, y: 1110 }, label: 'CONTAINMENT / ENGINE RETURN', gates: ['refuge-link', 'drive'], flags: ['heart'] },
  { id: 'relay', pos: { x: 1660, y: 1280 }, source: { x: 340, y: 340 }, label: 'ARCHIVE / REACTOR / SHORTCUT', gates: ['archive', 'reactor', 'shortcut'] },
  ...CAMPAIGN_SOCKETS,
] as const
export const PICKUPS: { id: Upgrade; pos: Vector2; label: string; detail: string; sector: RoomId }[] = [
  { id: 'radiation', pos: { x: 7130, y: 1290 }, label: 'Radiation shield', detail: 'Adds a separate radiation reserve. Eight seconds at peak exposure; distance and rock cover reduce the dose. Recharges automatically outside radiation.', sector: 'stores' },
]
export const CACHES: readonly { id: CacheId; pos: Vector2; value: number; sector: RoomId }[] = [
  { id: 'wreck-cache', pos: { x: 290, y: 1260 }, value: 100, sector: 'salvage' },
  { id: 'archive-cache', pos: { x: 1310, y: 300 }, value: 100, sector: 'archive' },
  { id: 'vault-cache', pos: { x: 1400, y: 1830 }, value: 220, sector: 'vault' },
  { id: 'engine-cache', pos: { x: 2710, y: 1910 }, value: 100, sector: 'engine' },
  ...CAMPAIGN_CACHES,
]
export const CORE_POSITION = IGNITION_POSITION
export const BASE_POSITION = { x: 1500, y: 1100 }
export const SAVE_KEY = 'hard-vacuum-expedition-v1'
