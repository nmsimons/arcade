/** Stable authored identifiers. Renaming one requires an explicit save migration. */
export const ROOM_IDS = ['haven','salvage','foundry','archive','reactor','engine','vault','breach','rescue','baggage','freight','stores','dispatch','manifest','works','service','workshop','capacitors','refuge-entry','refuge','infirmary','transfer','heart-hub','heart-control','heart-coils','ignition','arrival'] as const
export type RoomId = typeof ROOM_IDS[number]
export const GATE_IDS = ['rubble','foundry','archive','shortcut','reactor','blast','drive','breach-link','baggage-door','freight-lift','freight-link','tool-door','works-bus','store-door','ring-link','refuge-link','refuge-air','ward-link','heart-link','field-door','coil-link','well-link','freight-return','medical-return','heart-return','breach-return'] as const
export type GateId = typeof GATE_IDS[number]
export const CIRCUIT_IDS = ['breach-power','freight-power','dispatch-power','works-power','ring-power','foundry','relay','heart','refuge-power','ward-power','heart-route','heart-power','coil-power','ignition-power'] as const
export type CircuitId = typeof CIRCUIT_IDS[number]
export const PROGRESSION_IDS = ['heart','ignition-ready','thermal'] as const
export type ProgressionId = typeof PROGRESSION_IDS[number]
export const CACHE_IDS = ['wreck-cache','archive-cache','vault-cache','engine-cache','rescue-cache','baggage-cache','manifest-cache','tools-cache','store-cache','triage-cache','ward-cache','field-cache','medical-cache'] as const
export type CacheId = typeof CACHE_IDS[number]
export const BOT_IDS = ['freight-tug','works-watch','foundry-tug','reactor-watch','heart-watch','field-watch','coil-tug'] as const
export type BotId = typeof BOT_IDS[number]
export const MODULE_IDS = ['impact', 'radiation', 'blaster', 'teleporter'] as const
export type ModuleId = typeof MODULE_IDS[number]
export type CargoId = CircuitId | CacheId | ModuleId | 'core'
export type EntityId = CargoId | BotId
