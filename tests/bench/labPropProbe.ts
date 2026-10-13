import type { Run } from '../../src/games/jumping/challenge.ts'
import type { PlayerContacts } from '../../src/games/jumping/playerContacts.ts'
import type { RopeState } from '../../src/games/jumping/climbables.ts'

type Probe = (run: Run, contacts: PlayerContacts, dt: number, powered: boolean) => boolean
let probe: Probe | undefined
let ropeProbe: ((rope: RopeState, dt: number, loaded: unknown) => boolean) | undefined
export function setPropProbe(value?: Probe) { probe = value }
export function setRopeProbe(value?: typeof ropeProbe) { ropeProbe = value }
export function stepRopeProbe(rope: RopeState, dt: number, loaded: unknown) { return ropeProbe?.(rope, dt, loaded) ?? false }
export function stepPropProbe(run: Run, contacts: PlayerContacts, dt: number, powered: boolean) {
  return probe?.(run, contacts, dt, powered) ?? false
}
