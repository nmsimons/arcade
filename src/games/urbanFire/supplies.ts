import { JEEP_MAX_HEALTH, JEEP_TUNING } from './types.ts'
import type { Airdrop, ArmorUpgrade, Jeep, RepairKit, Wall } from './types'
import { clear, distance, openPoint } from './navigation.ts'
import { CITY } from './cityPlan.ts'

export const SUPPLY_DROP={height:120,descent:1.6,settle:.65} as const
export const createSupplyArrival=(delay:number):Airdrop=>({elapsed:-delay,height:SUPPLY_DROP.height,landed:false})
export function stepSupplyArrivals(supplies:ArmorUpgrade[],dt:number){
  if(dt<=0)return
  for(const item of supplies){
    const arrival=item.arrival
    if(!arrival)continue
    arrival.elapsed+=dt
    arrival.height=SUPPLY_DROP.height*Math.max(0,Math.min(1,1-arrival.elapsed/SUPPLY_DROP.descent))
    if(arrival.elapsed>=SUPPLY_DROP.descent)arrival.landed=true
    if(arrival.elapsed>=SUPPLY_DROP.descent+SUPPLY_DROP.settle)item.arrival=undefined
  }
}

// Cycle through reachable caches, with clear street sites as alternatives if
// traffic or another pickup occupies the preferred spot. Only one is spawned.
export function createArmorUpgrade(wave:number,player:Jeep['pos'],walls:Wall[],kits:RepairKit[]):ArmorUpgrade|null{
  const sites=[{x:800,y:806},{x:368,y:550},{x:1216,y:198},...CITY.patrol,
    ...CITY.entries.map(({pos,angle})=>({x:pos.x+Math.cos(angle)*80,y:pos.y+Math.sin(angle)*80}))]
  const start=(wave-1)%3
  for(let i=0;i<sites.length;i++){
    const pos=sites[(start+i)%sites.length]
    if(openPoint(pos,walls,14)&&distance(pos,player)>70&&kits.every(kit=>distance(pos,kit.pos)>50))return {pos:{...pos},arrival:createSupplyArrival(.75)}
  }
  return null
}

/** Armor first repairs the base hull and then adds one point. Medical cases
 * only repair up to three; they never replace spent armor or consume at three. */
export function collectSupplies(jeep:Jeep,kits:RepairKit[],armor:ArmorUpgrade[],walls:Wall[]){
  const result={armor:0,repaired:false}
  if(jeep.state!=='active')return result
  const withinReach=(item:ArmorUpgrade)=>(!item.arrival||item.arrival.landed)&&distance(jeep.pos,item.pos)<JEEP_TUNING.repairPickupRadius&&clear(jeep.pos,item.pos,walls)
  for(let i=armor.length-1;i>=0;i--){
    if(!withinReach(armor[i]))continue
    jeep.health=Math.max(JEEP_MAX_HEALTH,jeep.health)+1
    armor.splice(i,1);result.armor++
  }
  for(let i=kits.length-1;i>=0;i--){
    if(jeep.health>=JEEP_MAX_HEALTH||!withinReach(kits[i]))continue
    jeep.health=JEEP_MAX_HEALTH;kits.splice(i,1);result.repaired=true
  }
  return result
}
