import assert from 'node:assert/strict'
import test from 'node:test'
import {createMission,stepMission,MISSION_WAVES,RESUPPLY_SECONDS,missionTime} from '../src/games/urbanFire/mission.ts'
import {createTankReinforcements,createHelicopterReinforcements} from '../src/games/urbanFire/reinforcements.ts'
import {createStaticCityWalls} from '../src/games/urbanFire/battlefield.ts'
import {CITY} from '../src/games/urbanFire/cityPlan.ts'

const jeep={state:'active'}
test('the authored ramp has five distinct assaults and finishes after the final clear',()=>{
  const mission=createMission(),walls=createStaticCityWalls(),counts=[]
  for(let wave=1;wave<=MISSION_WAVES;wave++){
    assert.equal(mission.wave,wave)
    const tanks=createTankReinforcements(wave,CITY.playerSpawn,walls,()=>.4)
    const helicopters=createHelicopterReinforcements(wave,CITY.playerSpawn,{width:1280,height:800},()=>.4)
    counts.push([tanks.length,helicopters.length])
    assert.equal(stepMission(mission,jeep,tanks,helicopters,0,1/60),null,'inbound enemies prevent a premature clear')
    for(const enemy of [...tanks,...helicopters])enemy.state='exploding'
    assert.equal(stepMission(mission,jeep,tanks,helicopters,1,1/60),null,'a live shell still presents danger')
    assert.equal(stepMission(mission,jeep,tanks,helicopters,0,1/60),wave===MISSION_WAVES?'victory':'secured')
    if(wave<MISSION_WAVES){
      assert.equal(mission.remaining,RESUPPLY_SECONDS)
      assert.equal(stepMission(mission,jeep,[],[],0,RESUPPLY_SECONDS-.1),null)
      assert.equal(stepMission(mission,jeep,[],[],0,.1),'deploy')
    }
  }
  assert.deepEqual(counts,[[2,0],[3,1],[3,2],[4,2],[4,3]])
  assert.equal(mission.phase,'victory')
  const finished=structuredClone(mission)
  assert.equal(stepMission(mission,jeep,[],[],0,100),null)
  assert.deepEqual(mission,finished,'there is no sixth wave or running victory clock')
})

test('pause freezes resupply, fatal final exchanges lose, and redeploy resets the mission',()=>{
  const mission=createMission()
  stepMission(mission,jeep,[],[],0,1)
  const paused=structuredClone(mission)
  stepMission(mission,jeep,[],[],0,0)
  assert.deepEqual(mission,paused)
  mission.wave=MISSION_WAVES;mission.phase='combat'
  const before=structuredClone(mission)
  assert.equal(stepMission(mission,{state:'exploding'},[],[],0,.1),null)
  assert.deepEqual(mission,before)
  assert.deepEqual(createMission(),{wave:1,phase:'combat',remaining:0,elapsed:0})
  assert.equal(missionTime(125.9),'2:05')
})
