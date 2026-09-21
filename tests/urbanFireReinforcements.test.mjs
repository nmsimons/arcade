import assert from 'node:assert/strict'
import test from 'node:test'
import { createTankReinforcements, stepTankArrival, tankGrounded, tanksRemaining, TANK_DROP,
  createHelicopterReinforcements, stepHelicopterArrival } from '../src/games/urbanFire/reinforcements.ts'
import { createCityWalls, createStaticCityWalls } from '../src/games/urbanFire/battlefield.ts'
import { CITY } from '../src/games/urbanFire/cityPlan.ts'
import { aimTank, createContact, driveTank, flyHelicopter } from '../src/games/urbanFire/ai.ts'
import { distance, openPoint } from '../src/games/urbanFire/navigation.ts'
import { FIELD, viewportScale } from '../src/games/urbanFire/types.ts'

test('every wave queues distinct clear landing sites away from the player, with staggered arrivals',()=>{
  const walls=createCityWalls()
  for(const player of [CITY.playerSpawn,{x:288,y:104},{x:1496,y:550}])for(const wave of [1,2,4,12]){
    const tanks=createTankReinforcements(wave,player,walls,()=>.4)
    assert.equal(tanks.length,Math.min(2+Math.floor(wave/2),4))
    assert.equal(new Set(tanks.map(t=>`${t.pos.x},${t.pos.y}`)).size,tanks.length)
    assert.ok(tanksRemaining(tanks),'an airborne wave is still in progress')
    tanks.forEach((tank,i)=>{
      assert.equal(tank.state,'incoming');assert.equal(tankGrounded(tank),false)
      assert.ok(openPoint(tank.pos,walls,32)&&distance(tank.pos,player)>450)
      assert.equal(tank.arrival.elapsed,-TANK_DROP.warning-i*TANK_DROP.stagger)
    })
  }
})

test('tank drops descend continuously, land once and settle before AI or weapons can engage',()=>{
  for(const rate of [30,60,120]){
    const tank=createTankReinforcements(1,CITY.playerSpawn,[],()=>.4)[0]
    const before=structuredClone(tank),jeep={pos:{...tank.pos},vel:{x:0,y:0},state:'active'}
    stepTankArrival(tank,0,[],[]);assert.deepEqual(tank,before)
    let landings=0,previousHeight=TANK_DROP.height,time=0
    while(tank.state==='incoming'&&time<8){
      const frozen=structuredClone(tank)
      driveTank(tank,[tank],createContact(),[],()=>[],1/rate)
      assert.equal(aimTank(tank,jeep,[tank],[],1/rate),null)
      assert.deepEqual(tank,frozen,'airborne and settling tanks neither navigate nor charge weapons')
      landings+=Number(stepTankArrival(tank,1/rate,[],[]));time+=1/rate
      if(tank.arrival){
        assert.ok(tank.arrival.height>=0&&tank.arrival.height<=previousHeight)
        previousHeight=tank.arrival.height
        assert.equal(tankGrounded(tank),tank.arrival.landed)
      }
    }
    assert.equal(tank.state,'active');assert.equal(landings,1)
    assert.ok(Math.abs(time-(TANK_DROP.warning+TANK_DROP.descent+TANK_DROP.settle))<2/rate)
    assert.deepEqual(tank.pos,before.pos)
    tank.state='exploding';assert.equal(tankGrounded(tank),false);assert.equal(tanksRemaining([tank]),false)
  }
})

test('a late jeep or parked car below the chute makes it glide to clear pavement without snapping or crushing',()=>{
  const walls=createStaticCityWalls()
  for(const radius of [12,28]){
    const tank=createTankReinforcements(1,CITY.playerSpawn,walls,()=>.4)[0]
    while(tank.arrival.elapsed<2.4)stepTankArrival(tank,1/60,walls,[])
    const actor={pos:{...tank.pos},radius},before=structuredClone(actor)
    let height=tank.arrival.height,landed=false
    for(let i=0;i<300&&tank.state==='incoming';i++){
      const pos={...tank.pos}
      const touchdown=stepTankArrival(tank,1/60,walls,[actor]);landed ||= touchdown
      assert.ok(distance(pos,tank.pos)<=65/60+1e-8)
      if(tank.arrival){assert.ok(tank.arrival.height<=height+1e-8);height=tank.arrival.height}
      if(tankGrounded(tank))assert.ok(distance(tank.pos,actor.pos)>radius+36)
    }
    assert.equal(tank.state,'active');assert.ok(landed);assert.deepEqual(actor,before)
  }
})

test('helicopters begin completely outside every viewport and fly into the district without a boundary jump',()=>{
  const viewports=[{width:640,height:480},{width:1280,height:800},{width:3440,height:1440}]
  const players=[CITY.playerSpawn,{x:40,y:40},{x:1560,y:1060}]
  assert.equal(createHelicopterReinforcements(1,CITY.playerSpawn,viewports[0]).length,0)
  for(const viewport of viewports)for(const player of players)for(const sample of [.01,.99]){
    const scale=viewportScale(viewport.width,viewport.height)
    const fleet=createHelicopterReinforcements(6,player,viewport,()=>sample)
    assert.equal(fleet.length,3)
    for(const heli of fleet){
      const sx=(heli.pos.x-player.x)*scale+viewport.width/2,sy=(heli.pos.y-player.y)*scale+viewport.height/2
      assert.ok(sx< -60*scale||sx>viewport.width+60*scale||sy< -60*scale||sy>viewport.height+60*scale)
      const frozen=structuredClone(heli)
      stepHelicopterArrival(heli,0)
      assert.equal(flyHelicopter(heli,{pos:player,vel:{x:0,y:0}},createContact(),[],1/60),false)
      assert.deepEqual(heli,frozen)
      for(let i=0;i<2400&&heli.state==='incoming';i++){
        const pos={...heli.pos};stepHelicopterArrival(heli,1/60)
        assert.ok(distance(pos,heli.pos)<=130/60+1e-8,'no clamping teleport at the city edge')
      }
      assert.equal(heli.state,'active');assert.equal(heli.entry,undefined)
      assert.ok(heli.pos.x>=20&&heli.pos.x<=FIELD.width-20&&heli.pos.y>=20&&heli.pos.y<=FIELD.height-20)
      assert.ok(heli.rotorAngle>0)
    }
  }
})
