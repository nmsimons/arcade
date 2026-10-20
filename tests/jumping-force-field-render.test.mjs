import test from 'node:test'
import assert from 'node:assert/strict'
import { drawForceField } from '../src/games/jumping/forceFieldRender.ts'

function recorder() {
  const draws=[], stack=[]
  const ctx={canvas:{width:22000,height:7000},globalAlpha:1,fillStyle:'',strokeStyle:'',lineWidth:1,
    getTransform:()=>({a:1,b:0,c:0,d:1,e:0,f:0}),
    save(){stack.push([this.globalAlpha,this.fillStyle,this.strokeStyle])},restore(){[this.globalAlpha,this.fillStyle,this.strokeStyle]=stack.pop()},
    translate(){},rotate(){},beginPath(){},setLineDash(){},
    fillRect(...args){draws.push({kind:'rect',ink:this.fillStyle,alpha:this.globalAlpha,args})},
    moveTo(...args){draws.push({kind:'move',args})},lineTo(...args){draws.push({kind:'line',args})},stroke(){draws.push({kind:'stroke',ink:this.strokeStyle,alpha:this.globalAlpha})}}
  return {ctx,draws}
}
const field={id:'visual-barrier',x:100,y:100,w:300,h:12,orientation:'horizontal'}
test('a force field has a soft glow, moving ripples and sparse fading sparks without integrating particles',()=>{
  const a=recorder(),b=recorder(),paused=recorder()
  drawForceField(a.ctx,field,true,1);drawForceField(b.ctx,field,true,1.25);drawForceField(paused.ctx,field,true,1)
  assert.deepEqual(a.draws,paused.draws);assert.notDeepEqual(a.draws,b.draws)
  assert.equal(a.draws.filter(d=>d.ink==='#63c8ed'&&d.args[1]<0).length,6)
  assert.equal(a.draws.filter(d=>d.ink==='#d3f4ff').length,4)
  assert.ok(a.draws.filter(d=>d.ink==='#d3f4ff').every(d=>d.alpha>0&&d.alpha<=.55))
  assert.equal(a.draws.filter(d=>d.kind==='stroke').length,2)
  assert.equal(a.ctx.globalAlpha,1)
})
test('room-wide beams keep bounded artwork and disabled beams suppress every active effect',()=>{
  const a=recorder(),off=recorder(),pending=recorder()
  drawForceField(a.ctx,{...field,w:20000},true,3)
  assert.equal(a.draws.filter(d=>d.kind==='line').length,48)
  assert.equal(a.draws.filter(d=>d.ink==='#d3f4ff').length,8)
  drawForceField(off.ctx,field,false,3)
  assert.ok(off.draws.every(d=>!['#63c8ed','#267da7','#c1efff','#d3f4ff'].includes(d.ink)))
  drawForceField(pending.ctx,field,false,3,false,true)
  assert.equal(pending.draws.filter(d=>d.kind==='stroke').length,1)
  assert.equal(pending.draws.filter(d=>d.ink==='#d3f4ff').length,0)
})

test('offscreen fields submit no artwork, including their particles and glow',()=>{
  const a=recorder();drawForceField(a.ctx,{...field,x:-40000},true,3)
  assert.deepEqual(a.draws,[])
})

test('red fields use red artwork in both orientations with the same bounded drawing cost',()=>{
  for (const orientation of ['horizontal','vertical']) {
    const shape=orientation==='horizontal'?field:{...field,w:12,h:300,orientation}
    const blue=recorder(),red=recorder(),pending=recorder()
    drawForceField(blue.ctx,shape,true,1)
    drawForceField(red.ctx,{...shape,mode:'objects'},true,1)
    assert.equal(red.draws.length,blue.draws.length)
    assert.equal(red.draws.filter(d=>d.ink==='#ed777d'&&d.args[1]<0).length,6)
    assert.ok(red.draws.some(d=>d.ink==='#b63f48'))
    assert.ok(red.draws.every(d=>!['#63c8ed','#267da7','#d3f4ff'].includes(d.ink)))
    drawForceField(pending.ctx,{...shape,mode:'objects'},false,1,false,true)
    assert.ok(pending.draws.some(d=>d.kind==='stroke'&&d.ink==='#b63f48'))
  }
})
