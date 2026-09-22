import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceToCavernWall, raycastCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'

// Subdividing straight edges must not change the physical room. The compact
// contour uses the linear scan; the subdivided version exercises the index.
const corners=[{x:0,y:0},{x:800,y:0},{x:800,y:300},{x:500,y:300},{x:500,y:800},{x:0,y:800}]
const divide=points=>points.flatMap((a,i)=>{
  const b=points[(i+1)%points.length]
  return Array.from({length:8},(_,j)=>({x:a.x+(b.x-a.x)*j/8,y:a.y+(b.y-a.y)*j/8}))
})
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} versus ${b}`)

test('indexed concave walls preserve distances, grazing rays, corner normals and penetration recovery',()=>{
  const obstacle=[{x:170,y:130},{x:310,y:130},{x:310,y:520},{x:170,y:520}]
  const simple={id:1,name:'room',boundary:corners,obstacles:[obstacle]}
  const indexed={...simple,boundary:divide(corners),obstacles:[divide(obstacle)]}
  let seed=819
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  const points=[...indexed.boundary,...indexed.obstacles[0],
    ...Array.from({length:1000},()=>({x:random()*1000-100,y:random()*1000-100}))]
  for(const point of points){
    close(distanceToCavernWall(point,indexed),distanceToCavernWall(point,simple))
    for(const direction of [{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:.6,y:.8}])
      close(raycastCavern(point,direction,1200,indexed),raycastCavern(point,direction,1200,simple))
    const a={...point},b={...point},av={x:130,y:-70},bv={...av}
    const actual=resolveCircleInCavern(a,av,17,.55,indexed),expected=resolveCircleInCavern(b,bv,17,.55,simple)
    assert.equal(actual.collided,expected.collided);close(actual.maxImpactSpeed,expected.maxImpactSpeed)
    for(const key of ['x','y']){close(a[key],b[key]);close(av[key],bv[key])}
  }
  const moved={...indexed,obstacles:[divide(obstacle.map(p=>({x:p.x+250,y:p.y})))]}
  assert.notEqual(raycastCavern({x:60,y:200},{x:1,y:0},700,moved),raycastCavern({x:60,y:200},{x:1,y:0},700,indexed))
})
