export interface ShipAppearance { bank: number; turn: number; thrust: number; nose: number; sparkDelay: number }
export const freshShipAppearance = (): ShipAppearance => ({ bank:0,turn:0,thrust:0,nose:0,sparkDelay:0 })
