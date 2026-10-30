import test from 'node:test'
import assert from 'node:assert/strict'
import { LIGHTING_BUFFER_BUDGET, lightingPixelRatio, gpuLightingBufferBytes } from '../src/games/jumping/lightingBudget.ts'

test('regional high-DPI backing sizes fit the GPU budget after rounding both dimensions', () => {
  for (const [width,height] of [[1280,800],[1920,1080],[390,844],[844,390],[2560,1440],[999,777]]) for (const dpr of [1,1.25,1.5,2,3]) for (const reduced of [false,true]) {
    const ratio=lightingPixelRatio(width,height,dpr,reduced,true)
    const view={x:0,y:0,zoom:1,width:Math.round(width*ratio),height:Math.round(height*ratio)}
    assert.ok(ratio<=dpr)
    assert.ok(gpuLightingBufferBytes(view,true)<=LIGHTING_BUFFER_BUDGET,`${width}x${height}, DPR ${dpr}`)
    assert.ok(view.width*view.height<=(reduced?1_000_000:2_000_000)+4000)
  }
})

test('normal DPR 1 and uniform-light resolution are preserved; regional mode retains more pixels than performance mode', () => {
  assert.equal(lightingPixelRatio(1280,800,1,false,true),1)
  for(const [width,height]of [[1280,800],[1920,1080],[390,844]])for(const dpr of [1,1.5,2]){
    assert.equal(lightingPixelRatio(width,height,dpr),Math.min(dpr,2,Math.sqrt(2_000_000/(width*height))))
  }
  const native=lightingPixelRatio(1280,800,1.5,false,true),reduced=lightingPixelRatio(1280,800,1.5,true,true)
  assert.ok(native>1.2&&native<1.5)
  assert.ok(native>reduced)
})
