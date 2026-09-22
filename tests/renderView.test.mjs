import test from 'node:test'
import assert from 'node:assert/strict'
import { inRenderView, segmentInRenderView } from '../src/games/hardVacuum/renderView.ts'

test('render culling keeps glows, edge contacts and crossing cables with both endpoints off screen',()=>{
  const view={x:100,y:200,w:300,h:150}
  assert.ok(inRenderView({x:95,y:250},5,view))
  assert.ok(inRenderView({x:410,y:360},10,view))
  assert.equal(inRenderView({x:95,y:250},4,view),false)
  assert.ok(segmentInRenderView({x:-900,y:270},{x:1400,y:270},2,view))
  assert.ok(segmentInRenderView({x:250,y:-800},{x:250,y:1200},2,view))
  assert.ok(segmentInRenderView({x:0,y:198},{x:500,y:198},2,view))
  assert.equal(segmentInRenderView({x:0,y:197},{x:500,y:197},2,view),false)
  assert.ok(inRenderView({x:1e6,y:1e6},0),'unbounded callers still render everything')
})
