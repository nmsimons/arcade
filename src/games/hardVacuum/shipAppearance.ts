export interface ShipAppearance { bank: number; turn: number; thrust: number; nose: number; strafe: number; sparkDelay: number }
export const freshShipAppearance = (): ShipAppearance => ({ bank:0,turn:0,thrust:0,nose:0,strafe:0,sparkDelay:0 })

/** Signed exhaust direction: turning fires opposite sides, strafing one side. */
export function lateralJetDemand(turn: number, strafe: number) {
  const limit=(value:number)=>Math.max(-1,Math.min(1,value))
  return {bow:limit(-turn-strafe),stern:limit(turn*.72-strafe)}
}
