import {NEUTRAL_INPUT} from '../../src/games/jumping/model.ts'

/** Keep the authored geometry and objects; isolate only the encounter's spawn. */
export function ledgeApproachLevel(authored,kind,direction=1) {
  const level=structuredClone(authored)
  const spire=level.name==='Spire II'
  level.spawn=kind==='wall jump' ? {x:direction>0?650:830,y:1400}
    : {x:spire?(direction>0?440:1020):(direction>0?720:920),y:spire?600:1760}
  return level
}

export function ledgeApproachInput(tick,kind,turn,direction=1) {
  return {...NEUTRAL_INPUT,move:(tick<turn?1:-1)*direction,
    jump:kind==='wall jump'&&(tick<18||tick>=turn&&tick<turn+18)}
}
