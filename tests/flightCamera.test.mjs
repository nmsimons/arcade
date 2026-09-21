import test from 'node:test'
import assert from 'node:assert/strict'
import { flightCameraZoom } from '../src/games/hardVacuum/flightCamera.ts'

test('flight camera keeps its small-screen framing and zooms in on large displays',()=>{
  for(const [width,height,zoom] of [
    [360,640,.58], [620,360,360/620], [620,700,620/900], [900,620,1],
    [1280,800,1.116129], [1920,1080,1.296774], [2560,1600,1.632258],
    [3840,2160,1.993548], [3440,1440,1.529032], [800,1280,800/900],
    [7680,4320,2],
  ]) assert.ok(Math.abs(flightCameraZoom(width,height)-zoom)<.000001,`${width}×${height}`)
})

test('large screens zoom gently while gaining visibility, with a firm 2× ceiling',()=>{
  let previousCoverage=0
  for(const [factor,expected] of [[.75,.75],[1,1],[1.5,1.2],[2,1.4],[3,1.8],[4,2],[8,2]]) {
    const width=900*factor,height=620*factor,zoom=flightCameraZoom(width,height)
    assert.equal(zoom,expected)
    assert.ok(height/zoom>=previousCoverage)
    previousCoverage=height/zoom
  }
})

test('ultrawide and tall viewports use their limiting dimension without stretching',()=>{
  assert.equal(flightCameraZoom(3440,1440),flightCameraZoom(2560,1440))
  assert.equal(flightCameraZoom(800,1280),flightCameraZoom(800,2400))
  assert.equal(flightCameraZoom(0,0),.58)
})
