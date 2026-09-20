import assert from 'node:assert/strict'
import test from 'node:test'
import { drawCargo } from '../src/games/hardVacuum/cargoRender.ts'
import { drawHavenRecovery } from '../src/games/hardVacuum/havenRecoveryRender.ts'
import { CACHES, cargoBodies, freshExpedition, freshRuntime, parseExpedition, PICKUPS } from '../src/games/hardVacuum/expedition.ts'
import { havenPose } from '../src/games/hardVacuum/campaign.ts'
import { RECOVERY_GRIP } from '../src/games/hardVacuum/havenRecovery.ts'

// Capture the projected cargo faces separately from Haven's wrists and cradle.
function cargoFaces(draw,position) {
  let recording=false,path=[]
  const stack=[],faces=[]
  const ctx={
    save(){stack.push(recording)},restore(){recording=stack.pop()},
    translate(x,y){if(x===position.x&&y===position.y)recording=true},rotate(){},
    beginPath(){path=[]},closePath(){},rect(){},clip(){},arc(){},fillRect(){},strokeRect(){},
    moveTo(x,y){if(recording)path.push([x,y])},lineTo(x,y){if(recording)path.push([x,y])},
    fill(){if(recording)faces.push({points:path,fill:ctx.fillStyle})},stroke(){},
  }
  draw(ctx)
  assert.ok(faces.length>0)
  return faces
}

test('every cargo model keeps its silhouette, facets and colors throughout the retrieval handoff',()=>{
  const state=freshExpedition(),pose=havenPose(state),pos={x:pose.pos.x-132,y:pose.pos.y}
  for(const id of [...CACHES.map(c=>c.id),...PICKUPS.map(p=>p.id),'core']) {
    for(const time of [.01,.4,.8,1.3]) {
      const recovery={id,bay:Math.PI,time,path:[pos,pose.pos],cargoTime:4.75,secured:false}
      const displayTime=time<RECOVERY_GRIP ? 5.25 : recovery.cargoTime
      const incoming=cargoFaces(ctx=>drawCargo(ctx,id,pos,{time:displayTime,active:true}),pos)
      const retrieved=cargoFaces(ctx=>drawHavenRecovery(ctx,pose,recovery,{pos,radius:23,vel:{x:0,y:0}},5.25),pos)
      assert.deepEqual(retrieved,incoming,`${id}, retrieval ${time}s`)
    }
  }
  const medical=cargoFaces(ctx=>drawCargo(ctx,'manifest-cache',pos,{time:0}),pos)
  const crate=cargoFaces(ctx=>drawCargo(ctx,'wreck-cache',pos,{time:0}),pos)
  assert.ok(medical.length>crate.length*2,'the oxygen canisters retain their individual cylinders')
})

test('legacy archive shields migrate to Freight without moving towed cargo or current runtime bodies',()=>{
  const module=PICKUPS.find(p=>p.id==='radiation')
  for(const pos of [{x:1650,y:350},{x:1430,y:540}]) {
    for(const tethered of [false,true]) {
      const state=freshExpedition(),old={pos:{...pos},vel:{x:2,y:1},tethered}
      state.version=1;state.cargo={radiation:structuredClone(old)}
      const loaded=parseExpedition(JSON.stringify(state)),runtime=freshRuntime()
      const restored=cargoBodies(loaded,runtime).find(b=>b.cargoId==='radiation')
      assert.deepEqual(restored.pos,tethered ? pos : module.pos)
      const live=freshRuntime();live.objects.radiation={...structuredClone(old),radius:23,cargoId:'radiation',capture:0}
      const hotReloaded=cargoBodies(freshExpedition(),live).find(b=>b.cargoId==='radiation')
      assert.deepEqual(hotReloaded.pos,pos)
    }
  }
  const installed=freshExpedition();installed.upgrades.push('radiation')
  assert.equal(cargoBodies(installed,freshRuntime()).some(b=>b.cargoId==='radiation'),false)
})

test('laser contact lights every cargo model without altering its shape or pose',()=>{
  const pos={x:7800,y:3560}
  for(const id of [...PICKUPS.map(item=>item.id),...CACHES.map(item=>item.id),'core']) {
    const draw=laserGlow=>cargoFaces(ctx=>drawCargo(ctx,id,pos,{time:3,active:true,laserGlow}),pos)
    const resting=draw(0),lit=draw(1)
    assert.deepEqual(lit.map(face=>face.points),resting.map(face=>face.points),id)
    assert.notDeepEqual(lit.map(face=>face.fill),resting.map(face=>face.fill),id)
  }
})
