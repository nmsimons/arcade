import assert from 'node:assert/strict'
import test from 'node:test'
import { CITY } from '../src/games/urbanFire/cityPlan.ts'
import { CITY_IMPACTS, isSolidProp } from '../src/games/urbanFire/cityLifePlan.ts'
import { TERRAIN, terrainAt, vehicleTerrain, applyTerrainResistance } from '../src/games/urbanFire/terrain.ts'
import { createCityWalls } from '../src/games/urbanFire/battlefield.ts'
import { clear, openPoint } from '../src/games/urbanFire/navigation.ts'
import { driveJeep } from '../src/games/urbanFire/driving.ts'
import { createContact, driveTank } from '../src/games/urbanFire/ai.ts'
import { createVehicleVisuals, stepVehicleVisuals, vehiclePose } from '../src/games/urbanFire/appearance.ts'

const jeep=(x,y)=>({pos:{x,y},vel:{x:0,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0})
const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height

test('wrecks and loose rubble are traversable, while trees and road closures stay solid',()=>{
  const walls=createCityWalls()
  for(const prop of CITY.props){
    assert.equal(walls.some(w=>same(w,prop)),isSolidProp(prop))
    if(!isSolidProp(prop))assert.ok(terrainAt({x:prop.x+prop.width/2,y:prop.y+prop.height/2}).roughness>.5)
    if(prop.kind==='tree'){
      const center={x:prop.x+prop.width/2,y:prop.y+prop.height/2}
      assert.equal(openPoint(center,walls,12),false)
      assert.equal(clear({x:prop.x-15,y:center.y},{x:prop.x+prop.width+15,y:center.y},walls,12),false)
      assert.ok(isSolidProp({...prop,condition:'burned'}),'even a burned tree remains a full obstacle')
    }
  }
  for(const ruin of CITY.ruins)for(const slab of ruin.rubble){
    assert.equal(walls.some(w=>same(w,slab)),false)
    assert.ok(terrainAt({x:slab.x+slab.width/2,y:slab.y+slab.height/2}).roughness>.5)
  }
  for(const barrier of [...CITY.closures,...CITY.edgeRubble])assert.ok(walls.some(w=>same(w,barrier)))
})

test('the shared surface has crater depressions, raised wreckage, and smooth asphalt transitions',()=>{
  for(const impact of CITY_IMPACTS)assert.ok(terrainAt(impact).height< -2)
  const wreck=TERRAIN.find(p=>p.kind==='wreck')
  assert.ok(terrainAt({x:wreck.x+wreck.width/2,y:wreck.y+wreck.height/2},[wreck]).height>3)
  for(const patch of TERRAIN){
    const edge={x:patch.x+patch.width,y:patch.y+patch.height/2}
    assert.deepEqual(terrainAt(edge,[patch]),{roughness:0,height:0})
    const inside=terrainAt({x:edge.x-.001,y:edge.y},[patch])
    assert.ok(Math.abs(inside.height)<.001&&inside.roughness<.001)
  }
  assert.deepEqual(terrainAt({x:800,y:902}),{roughness:0,height:0})
})

test('rolling resistance preserves direction and is independent of the frame rate',()=>{
  const a={x:90,y:-30},b={...a},road={...a},paused={...a}
  for(let i=0;i<30;i++)applyTerrainResistance(a,.7,1/30)
  for(let i=0;i<120;i++)applyTerrainResistance(b,.7,1/120)
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-10)
  assert.ok(a.x>0&&a.y<0&&a.x<90*.2)
  applyTerrainResistance(road,0,1);applyTerrainResistance(paused,1,0)
  assert.deepEqual(road,{x:90,y:-30});assert.deepEqual(paused,road)
})

test('the actual jeep drive step slows across a crater, crosses it under throttle, and recovers',()=>{
  const crossing=y=>{
    const vehicle=jeep(1100,y);vehicle.vel.x=105
    let time=0,exit=0,slowest=Infinity
    while(vehicle.pos.x<1300&&time<8){
      driveJeep(vehicle,{turn:0,forward:1,reverse:0},1/120);time+=1/120
      if(Math.abs(vehicle.pos.x-1170)<20)slowest=Math.min(slowest,vehicle.vel.x)
      if(!exit&&vehicle.pos.x>=1240)exit=time
    }
    return {vehicle,exit,slowest}
  }
  const asphalt=crossing(550),crater=crossing(889)
  assert.ok(crater.vehicle.pos.x>=1300,'throttle carries the jeep fully through the terrain')
  assert.ok(crater.exit>asphalt.exit*1.15,'crossing has a meaningful traversal cost')
  assert.ok(crater.slowest<asphalt.slowest*.8,'speed visibly drops in the damaged road')
  assert.ok(crater.vehicle.vel.x>asphalt.vehicle.vel.x*.95,'normal speed returns on asphalt')
})

test('wheel contacts pitch and roll the body, settle while stopped, and freeze during pause',()=>{
  const {x,y,r}=CITY_IMPACTS[1],vehicle=jeep(x-r-24,y+5),visuals=createVehicleVisuals()
  const pose=vehiclePose(visuals,vehicle),pitches=[],rolls=[],lifts=[],travel=[]
  vehicle.vel.x=60
  for(let i=0;i<220;i++){
    vehicle.pos.x+=.5
    const before=structuredClone(vehicle)
    stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/120)
    assert.deepEqual(vehicle,before,'suspension never changes gameplay position or aim')
    pitches.push(pose.pitch);rolls.push(pose.roll);lifts.push(pose.lift);travel.push(...pose.suspension)
  }
  assert.ok(Math.min(...pitches)<-.08&&Math.max(...pitches)>.08)
  assert.ok(Math.max(...rolls.map(Math.abs))>.04)
  assert.ok(Math.min(...lifts)<-.8&&Math.max(...travel.map(Math.abs))>.4)
  const wreck=TERRAIN.find(p=>p.kind==='wreck')
  vehicle.pos={x:wreck.x+wreck.width/2,y:wreck.y+wreck.height/2};vehicle.vel={x:0,y:0}
  for(let i=0;i<600;i++)stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/120)
  assert.ok(pose.lift>2);assert.ok(Math.abs(pose.liftVelocity)<1e-5)
  const parked=structuredClone(pose)
  stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/60)
  assert.ok(Math.abs(parked.lift-pose.lift)<1e-7,'parked vehicles do not vibrate forever')
  const frozen=structuredClone({pose,time:visuals.time})
  stepVehicleVisuals(visuals,[[vehicle,'jeep']],0)
  assert.deepEqual({pose,time:visuals.time},frozen)
})

test('tanks slow on the same ground while aircraft have no ground suspension',()=>{
  const tank=(x,y)=>({...jeep(x,y),turretAngle:0,trackOffset:0,role:0,recoil:0,
    brain:{goal:{x:x+80,y},path:[{x:x+80,y}],replan:10}})
  const road=tank(1100,550),rough=tank(1170,889)
  for(const t of [road,rough])driveTank(t,[t],createContact(),[],()=>[],1/60)
  assert.ok(rough.vel.x<road.vel.x*.9&&rough.vel.x>road.vel.x*.5)
  assert.ok(vehicleTerrain(rough.pos,rough.angle,'tank').roughness>0)
  const heli=jeep(1170,889),visuals=createVehicleVisuals()
  for(let i=0;i<120;i++)stepVehicleVisuals(visuals,[[heli,'helicopter']],1/60)
  assert.equal(vehiclePose(visuals,heli).lift,0)
  assert.equal(vehiclePose(visuals,heli).roughness,0)
})
