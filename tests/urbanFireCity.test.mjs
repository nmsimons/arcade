import assert from 'node:assert/strict'
import test from 'node:test'
import { CITY, ROADS, buildingEntrance, roadFootprints } from '../src/games/urbanFire/cityPlan.ts'
import { createCityWalls } from '../src/games/urbanFire/battlefield.ts'
import { clear, createNavigator, openPoint } from '../src/games/urbanFire/navigation.ts'
import { FIELD } from '../src/games/urbanFire/types.ts'
import { coverContours } from '../src/games/urbanFire/sceneryGeometry.ts'
import { isSolidProp } from '../src/games/urbanFire/cityLifePlan.ts'
import { createArmorUpgrade } from '../src/games/urbanFire/supplies.ts'

const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y
const contains=(r,p)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height
const same=(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height

test('intact buildings and damaged sites occupy real parcels clear of all streets',()=>{
  const roads=roadFootprints(),sites=[...CITY.buildings,...CITY.ruins.map(r=>r.site)]
  assert.equal(CITY.blocks.length,20)
  for(const building of sites){
    const site=building.streetFootprint??building
    const block=CITY.blocks.find(b=>b.id===building.blockId),gap=ROADS.sidewalk+4
    assert.ok(block)
    assert.ok(site.x>=block.x+gap&&site.y>=block.y+gap)
    assert.ok(site.x+site.width<=block.x+block.width-gap)
    assert.ok(site.y+site.height<=block.y+block.height-gap)
    assert.ok(roads.every(road=>!overlap(building,road)))
  }
  for(const [i,a] of sites.entries())for(const b of sites.slice(i+1)){
    if(overlap(a,b))assert.ok(a.civicWing&&b.civicWing&&a.blockId===b.blockId,'only civic wings share a footprint')
  }
  assert.equal(new Set(CITY.buildings.map(b=>b.kind)).size,6)
  assert.deepEqual(new Set(CITY.lots.map(l=>l.kind)),new Set(['yard','vacant','parking','plaza','grass']))
})

test('front doors, loading courts and public lots have unobstructed approaches',()=>{
  const walls=createCityWalls(),accessSurfaces=[...roadFootprints(),...CITY.driveways,...CITY.alleys]
  for(const building of CITY.buildings){
    const door=buildingEntrance(building),target=building.access
    assert.ok(accessSurfaces.some(surface=>contains(surface,target)),`${building.blockId} entrance connects to public access`)
    assert.ok(clear(door,target,walls.filter(other=>!same(other,building)),5),`${building.blockId} has a clear entrance`)
    if(building.frontage==='north')assert.ok(target.y<door.y&&target.x===door.x)
    if(building.frontage==='south')assert.ok(target.y>door.y&&target.x===door.x)
    if(building.frontage==='east')assert.ok(target.x>door.x&&target.y===door.y)
    if(building.frontage==='west')assert.ok(target.x<door.x&&target.y===door.y)
  }
  for(const surface of [...CITY.lots,...CITY.driveways,...CITY.alleys]){
    const fixed=walls.filter(wall=>!CITY.props.some(prop=>same(prop,wall)))
    assert.ok(fixed.every(wall=>!overlap(surface,wall)),`usable ground at ${surface.x},${surface.y} stays free of structural cover`)
    if(!CITY.lots.includes(surface))assert.ok(walls.every(wall=>!overlap(surface,wall)),'service drives and alleys remain entirely clear')
  }
})

test('civilian vehicles and aid-post cover leave every public lot reachable by the jeep',()=>{
  const walls=createCityWalls(),fixed=walls.filter(wall=>!CITY.props.some(prop=>same(prop,wall)))
  for(const [i,prop] of CITY.props.entries()){
    assert.equal(walls.some(wall=>same(wall,prop)),isSolidProp(prop),'upright scenery blocks; flattened wrecks are rough terrain')
    assert.ok(fixed.every(wall=>!overlap(prop,wall)),'scenery cannot overlap structural cover')
    assert.ok(CITY.props.slice(i+1).every(other=>!overlap(prop,other)),'authored props have separate footprints')
  }
  // Flood actual swept jeep hulls, rather than assuming a nominal empty lot is usable.
  const step=8,start={x:800,y:904},queue=[start],seen=new Set([`${start.x},${start.y}`])
  assert.ok(clear(CITY.playerSpawn,start,walls,12))
  for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[step,0],[-step,0],[0,step],[0,-step]]){
    const next={x:queue[i].x+dx,y:queue[i].y+dy},key=`${next.x},${next.y}`
    if(seen.has(key)||!openPoint(next,walls,12)||!clear(queue[i],next,walls,12))continue
    seen.add(key);queue.push(next)
  }
  for(let wave=1;wave<=3;wave++){
    const {pos}=createArmorUpgrade(wave,CITY.playerSpawn,walls,[])
    assert.ok(openPoint(pos,walls,14),'the entire armor cache fits clear of buildings and parked cars')
    assert.ok(queue.some(node=>Math.hypot(node.x-pos.x,node.y-pos.y)<=step*2&&clear(node,pos,walls,12)),
      `armor at ${pos.x},${pos.y} is reachable by the jeep`)
  }
  for(const lot of CITY.lots){
    const candidates=[12,lot.width/2,lot.width-12].flatMap(dx=>[12,lot.height/2,lot.height-12].map(dy=>({x:lot.x+dx,y:lot.y+dy})))
    assert.ok(candidates.some(p=>openPoint(p,walls,12)&&queue.some(node=>Math.hypot(node.x-p.x,node.y-p.y)<=step*2&&clear(node,p,walls,12))),
      `${lot.blockId} ${lot.kind} retains reachable room for the jeep`)
    const occupied=CITY.props.reduce((sum,p)=>sum+Math.max(0,Math.min(p.x+p.width,lot.x+lot.width)-Math.max(p.x,lot.x))*
      Math.max(0,Math.min(p.y+p.height,lot.y+lot.height)-Math.max(p.y,lot.y)),0)
    assert.ok(occupied<lot.width*lot.height*.25,'at least three quarters of each open parcel stays open')
  }
})

test('every road ends in physical cover while its interior and junctions fit tanks',()=>{
  const walls=createCityWalls()
  assert.equal(CITY.closures.length,14)
  assert.ok(CITY.closures.every(c=>c.kind==='barrier'||c.kind==='bridge'),'all exits use Jersey barriers and razor wire')
  for(const x of ROADS.avenues){
    assert.ok(clear({x,y:80},{x,y:FIELD.height-80},walls,30))
    for(const [a,b] of [[80,0],[FIELD.height-80,FIELD.height]]){
      assert.equal(clear({x,y:a},{x,y:b},walls,12),false,'jeep cannot drive through the cordon')
      assert.equal(clear({x,y:a},{x,y:b},walls),false,'cordon stops weapon fire')
    }
  }
  for(const y of ROADS.streets){
    assert.ok(clear({x:80,y},{x:FIELD.width-80,y},walls,30))
    for(const [a,b] of [[80,0],[FIELD.width-80,FIELD.width]])assert.equal(clear({x:a,y},{x:b,y},walls,12),false)
  }
  for(const x of ROADS.avenues)for(const y of ROADS.streets){
    for(const [dx,dy] of [[-32,-24],[-32,24],[32,-24],[32,24]])assert.ok(openPoint({x:x+dx,y:y+dy},walls,30))
  }
})

test('existing extended buildings and gap debris stop the jeep before the map clamp everywhere',()=>{
  const perimeter=createCityWalls()
  const touchesCover=({x,y})=>perimeter.some(w=>Math.hypot(x-Math.max(w.x,Math.min(x,w.x+w.width)),
    y-Math.max(w.y,Math.min(y,w.y+w.height)))<12)
  // Sample the complete fallback clamp, including rear lots and corner joins.
  // Reaching any of these points would mean an unexplained invisible boundary.
  for(let x=20;x<=FIELD.width-20;x+=2)for(const y of [20,FIELD.height-20]){
    assert.ok(touchesCover({x,y}),`physical boundary at ${x},${y}`)
  }
  for(let y=20;y<=FIELD.height-20;y+=2)for(const x of [20,FIELD.width-20]){
    assert.ok(touchesCover({x,y}),`physical boundary at ${x},${y}`)
  }
  for(const building of CITY.edgeBuildings){
    assert.ok(building.width>60&&building.height>60,'the boundary uses full buildings, not thin disguised walls')
    assert.ok(createCityWalls().some(other=>same(building,other)),'neighboring buildings participate in collision')
  }
  assert.ok(CITY.edgeBuildings.length<8,'annexes are limited to gaps instead of adding an outer building ring')
  assert.ok(CITY.buildings.filter(b=>b.streetFootprint).length>15,'existing outer buildings form the boundary')
})

test('every tank staging point connects to the player and faces into an open road',()=>{
  const walls=createCityWalls(),route=createNavigator(walls)
  assert.ok(openPoint(CITY.playerSpawn,walls,30))
  for(const entry of CITY.entries){
    const forward={x:entry.pos.x+Math.cos(entry.angle)*120,y:entry.pos.y+Math.sin(entry.angle)*120}
    assert.ok(clear(entry.pos,forward,walls,30))
    const path=route(entry.pos,CITY.playerSpawn)
    assert.ok(path.length>0,`entry ${entry.pos.x},${entry.pos.y} reaches the player`)
    let previous=entry.pos
    for(const point of path){assert.ok(clear(previous,point,walls,30));previous=point}
  }
  for(const point of CITY.patrol)assert.ok(openPoint(point,walls,30))
})

test('jeep alleys connect streets end to end, while tanks have a route around them',()=>{
  const walls=createCityWalls(),route=createNavigator(walls)
  assert.ok(CITY.alleys.length>=3)
  for(const {start,end} of CITY.alleys){
    assert.ok(clear(start,end,walls,12),'a jeep fits through the entire alley')
    assert.equal(clear(start,end,walls,28),false,'a tank must use the avenues')
    const path=route(start,end)
    assert.ok(path.length>1,'both ends remain connected by a wider route')
    let previous=start
    for(const point of path){assert.ok(clear(previous,point,walls,30));previous=point}
  }
})

test('ruins have accessible interiors, and their surviving walls remain solid cover',()=>{
  const walls=createCityWalls()
  assert.ok(CITY.ruins.length>=4)
  for(const ruin of CITY.ruins){
    assert.ok(clear(ruin.entrance,ruin.interior,walls,12),`ruin ${ruin.site.blockId} admits a jeep`)
    assert.ok(openPoint(ruin.interior,walls,12))
    for(const wall of [...ruin.walls,...ruin.roofRemnants])assert.ok(walls.some(other=>same(wall,other)))
    assert.equal(clear(ruin.interior,{x:ruin.site.x,y:ruin.interior.y},walls),false,'surviving wall stops a bullet')
  }
})

test('joined scenery silhouettes preserve concavities, separate piles, and open holes',()=>{
  const area=points=>points.reduce((sum,[x,y],i)=>{
    const [nx,ny]=points[(i+1)%points.length]
    return sum+x*ny-y*nx
  },0)/2
  const fixtures=[
    {pieces:[{x:0,y:0,width:20,height:8},{x:0,y:8,width:8,height:16},{x:8,y:8,width:12,height:12}],loops:1,area:432},
    {pieces:[{x:0,y:0,width:10,height:10},{x:20,y:0,width:10,height:10}],loops:2,area:200},
    {pieces:[{x:0,y:0,width:30,height:5},{x:0,y:25,width:30,height:5},
      {x:0,y:5,width:5,height:20},{x:25,y:5,width:5,height:20}],loops:2,area:500},
    {pieces:[{x:0,y:0,width:20,height:20},{x:10,y:10,width:20,height:20}],loops:1,area:700},
  ]
  for(const {pieces,loops,area:expected} of fixtures){
    const original=structuredClone(pieces),contours=coverContours(pieces)
    assert.equal(contours.length,loops)
    assert.equal(contours.reduce((sum,points)=>sum+area(points),0),expected)
    assert.deepEqual(pieces,original,'rendering cannot alter gameplay cover')
  }
})
