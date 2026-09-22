import assert from 'node:assert/strict'
import test from 'node:test'
import { drawTerrainWalls } from '../src/games/hardVacuum/terrainRender.ts'
import { STATION_TERRAIN } from '../src/games/hardVacuum/stationLayout.ts'
import { getDemoCavernMap } from '../src/games/hardVacuum/worldGeometry.ts'
import { contourPath, terrainPath } from '../src/games/hardVacuum/renderPaths.ts'

class RecordedPath {
  constructor(other) { this.contours=structuredClone(other?.contours??[]) }
  moveTo(x,y) { this.contours.push({points:[{x,y}],closed:false}) }
  lineTo(x,y) { this.contours.at(-1).points.push({x,y}) }
  closePath() { this.contours.at(-1).closed=true }
  addPath(other) { this.contours.push(...structuredClone(other.contours)) }
}

function recordWalls(boundary, islands) {
  const initial = { lineJoin: 'miter', lineWidth: 3, strokeStyle: '#ffffff', shadowBlur: 25, shadowColor: '#ff0000' }
  const strokes = [], stack = []
  const ctx = {
    ...initial,
    save() { stack.push(Object.fromEntries(Object.keys(initial).map(key => [key, this[key]]))) },
    restore() { Object.assign(this, stack.pop()) },
    stroke(path) {
      strokes.push({ contours: structuredClone(path.contours), width: this.lineWidth, color: this.strokeStyle,
        glow: this.shadowBlur, glowColor: this.shadowColor, join: this.lineJoin })
    },
  }
  const original=globalThis.Path2D;globalThis.Path2D=RecordedPath
  try { drawTerrainWalls(ctx, boundary, islands) } finally { globalThis.Path2D=original }
  assert.deepEqual(Object.fromEntries(Object.keys(initial).map(key => [key, ctx[key]])), initial,
    'wall styling must not leak into doors, objects, or the HUD')
  assert.equal(stack.length, 0)
  return strokes
}

test('cached contours preserve closed geometry and fresh door snapshots invalidate the clip',()=>{
  const original=globalThis.Path2D;globalThis.Path2D=RecordedPath
  try {
    const boundary=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]
    const door=[{x:40,y:0},{x:60,y:0},{x:60,y:100},{x:40,y:100}],closed=[door]
    const path=terrainPath(boundary,closed)
    assert.equal(terrainPath(boundary,closed),path)
    assert.equal(contourPath(boundary),contourPath(boundary))
    const opened=[door.map(p=>({...p,y:p.y-100}))],openPath=terrainPath(boundary,opened)
    assert.notEqual(openPath,path)
    assert.deepEqual(path.contours.map(c=>c.points),[boundary,door])
    assert.deepEqual(openPath.contours.map(c=>c.points),[boundary,...opened])
    assert.ok(openPath.contours.every(c=>c.closed))
  }finally{globalThis.Path2D=original}
})

for (const [name, boundary, islands] of [
  ['station', STATION_TERRAIN.boundary, STATION_TERRAIN.islands],
  ['title screen', getDemoCavernMap(1).boundary, getDemoCavernMap(1).obstacles],
  ['demo with interior rock', getDemoCavernMap(2).boundary, getDemoCavernMap(2).obstacles],
]) {
  test(`${name} wall contours share one closed outline and subtle glow`, () => {
    if (name !== 'title screen') assert.ok(islands.length > 0, 'exercise both outer and inner walls')
    const strokes = recordWalls(boundary, islands)
    assert.equal(strokes.length, 2, 'one shared mineral edge and one fine highlight; no separate outer pass')
    for (const stroke of strokes) {
      assert.deepEqual(stroke.contours, [boundary, ...islands].map(points => ({ points, closed: true })))
      assert.equal(stroke.join, 'round')
    }
    assert.equal(strokes[0].width, 5)
    assert.equal(strokes[0].glow, 7)
    assert.equal(strokes[0].glowColor, 'rgba(0, 255, 136, 0.12)')
    assert.equal(strokes[1].width, 1.4)
    assert.equal(strokes[1].glow, 0, 'the fine highlight does not add a second glow')
  })
}
