import assert from 'node:assert/strict'
import test from 'node:test'
import { collectSupplies, createArmorUpgrade, createSupplyArrival, stepSupplyArrivals, SUPPLY_DROP } from '../src/games/urbanFire/supplies.ts'
import { vehicleDamage } from '../src/games/urbanFire/appearance.ts'
import { JEEP_MAX_HEALTH } from '../src/games/urbanFire/types.ts'
import { CITY } from '../src/games/urbanFire/cityPlan.ts'
import { createCityWalls } from '../src/games/urbanFire/battlefield.ts'

const jeep=()=>({pos:{x:800,y:806},vel:{x:0,y:0},angle:0,health:JEEP_MAX_HEALTH,state:'active'})
const kit=()=>({pos:{x:800,y:806},spawnedAtMs:0})

test('medical cases repair only to three and are not consumed at three or above',()=>{
  for(const health of [1,2]){
    const car={...jeep(),health},kits=[kit()]
    assert.equal(collectSupplies(car,kits,[],[]).repaired,true)
    assert.equal(car.health,3);assert.equal(kits.length,0)
    assert.equal(vehicleDamage(car,'jeep'),0)
  }
  for(const health of [3,4,6,10]){
    const car={...jeep(),health},kits=[kit()]
    assert.equal(collectSupplies(car,kits,[],[]).repaired,false)
    assert.equal(car.health,health);assert.equal(kits.length,1)
  }
})

test('armor repairs to at least three then adds one, with no fixed stacking limit',()=>{
  for(const [health,expected] of [[1,4],[2,4],[3,4],[4,5],[6,7],[12,13]]){
    const car={...jeep(),health},armor=[kit()]
    assert.equal(collectSupplies(car,[],armor,[]).armor,1)
    assert.equal(car.health,expected);assert.equal(armor.length,0)
    assert.equal(vehicleDamage(car,'jeep'),0)
  }
  const car=jeep()
  collectSupplies(car,[],[kit()],[]);assert.equal(car.health,4)
  car.health-=2
  collectSupplies(car,[kit()],[],[])
  assert.equal(car.health,3,'medical repairs cannot replace lost extra armor')
})

test('collecting armor beside a medical case leaves the now-unneeded medical case',()=>{
  const car={...jeep(),health:1},kits=[kit()],armor=[kit()]
  assert.deepEqual(collectSupplies(car,kits,armor,[]),{armor:1,repaired:false})
  assert.equal(car.health,4);assert.equal(kits.length,1)
})

test('supplies cannot be collected across cover, out of reach or after destruction',()=>{
  const car={...jeep(),health:1},kits=[kit()],armor=[kit()]
  car.pos.x-=20
  const wall={x:790,y:790,width:3,height:30}
  assert.deepEqual(collectSupplies(car,kits,armor,[wall]),{armor:0,repaired:false})
  car.pos.x-=10
  assert.deepEqual(collectSupplies(car,kits,armor,[]),{armor:0,repaired:false})
  car.pos={...kit().pos};car.state='exploding'
  assert.deepEqual(collectSupplies(car,kits,armor,[]),{armor:0,repaired:false})
  assert.equal(kits.length,1);assert.equal(armor.length,1)
})

test('each wave offers a single independent cache and avoids occupied supply sites',()=>{
  const walls=createCityWalls(),positions=[]
  for(let wave=1;wave<=6;wave++){
    const upgrade=createArmorUpgrade(wave,CITY.playerSpawn,walls,[])
    assert.ok(upgrade);assert.equal(Array.isArray(upgrade),false)
    positions.push(upgrade.pos)
  }
  assert.deepEqual(positions[0],positions[3]);assert.notEqual(positions[0],positions[3])
  const alternate=createArmorUpgrade(1,CITY.playerSpawn,walls,[kit()])
  assert.ok(Math.hypot(alternate.pos.x-800,alternate.pos.y-806)>50)
  assert.equal(jeep().health,3)
})

test('medical and armor drops freeze on pause and cannot be collected before touchdown',()=>{
  for(const kind of ['health','armor'])for(const rate of [30,60,120]){
    const car={...jeep(),health:1},item={...kit(),arrival:createSupplyArrival(.4)}
    const items=[item],kits=kind==='health'?items:[],armor=kind==='armor'?items:[]
    const frozen=structuredClone(item)
    stepSupplyArrivals(items,0);assert.deepEqual(item,frozen)
    let previousHeight=SUPPLY_DROP.height,time=0
    while(!item.arrival.landed){
      assert.deepEqual(collectSupplies(car,kits,armor,[]),{armor:0,repaired:false})
      assert.equal(car.health,1)
      stepSupplyArrivals(items,1/rate);time+=1/rate
      assert.ok(item.arrival.height<=previousHeight&&item.arrival.height>=0)
      previousHeight=item.arrival.height
    }
    assert.ok(Math.abs(time-(.4+SUPPLY_DROP.descent))<1/rate+1e-8)
    const state=structuredClone(item)
    stepSupplyArrivals(items,0);assert.deepEqual(item,state)
    collectSupplies(car,kits,armor,[])
    assert.equal(car.health,kind==='health'?3:4);assert.equal(items.length,0)
  }
  const uncollected=[{...kit(),arrival:createSupplyArrival(0)}]
  stepSupplyArrivals(uncollected,3)
  assert.equal(uncollected.length,1);assert.equal(uncollected[0].arrival,undefined,'landed supplies remain after their chute disperses')
})
