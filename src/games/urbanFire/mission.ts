import type { Helicopter, Jeep, Tank } from './types'

export const MISSION_WAVES=5
export const RESUPPLY_SECONDS=8
export type Mission = { wave:number; phase:'combat'|'resupply'|'victory'; remaining:number; elapsed:number }
export const createMission=():Mission=>({wave:1,phase:'combat',remaining:0,elapsed:0})

/** Incoming enemies still belong to the wave. Resolve all damage before this
 * step: a fatal final exchange is a defeat, and surviving shells must clear. */
export function stepMission(mission:Mission,jeep:Jeep,tanks:readonly Tank[],helicopters:readonly Helicopter[],enemyBullets:number,dt:number):'secured'|'deploy'|'victory'|null{
  if(dt<=0||mission.phase==='victory'||jeep.state!=='active')return null
  mission.elapsed+=dt
  if(mission.phase==='resupply'){
    mission.remaining=Math.max(0,mission.remaining-dt)
    if(mission.remaining>1e-8)return null
    mission.wave++;mission.phase='combat'
    return 'deploy'
  }
  if(enemyBullets||tanks.some(t=>t.state!=='exploding')||helicopters.some(h=>h.state!=='exploding'))return null
  if(mission.wave===MISSION_WAVES){mission.phase='victory';return 'victory'}
  mission.phase='resupply';mission.remaining=RESUPPLY_SECONDS
  return 'secured'
}

export const missionTime=(seconds:number)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`
