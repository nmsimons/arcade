import test from 'node:test'
import assert from 'node:assert/strict'
import { androidMaterials, androidDaylightMaterials } from '../src/games/jumping/androidArtwork.ts'
import { EnvironmentLighting } from '../src/games/jumping/environmentLighting.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPreviewRun } from '../src/games/jumping/challenge.ts'

const channels = materials => Object.values(materials).flatMap(color => [1,3,5].map(start => parseInt(color.slice(start,start+2),16)))
const level = () => ({ ...blankTrial(), version: 2, width: 1800, height: 900, floor: 900,
  entrance: { x: 100, y: 900 }, goal: { x: 1700, y: 900 },
  environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [{ kind: 'facility', x: 800, y: 0, w: 1000, h: 900 }] },
  lighting: { nightMode: true, ambient: 0, lights: [] } })

test('regional player colors keep the established endpoints, separate materials and diagnostic masks', () => {
  assert.equal(androidDaylightMaterials(0), androidMaterials('#e5e7e6'))
  assert.equal(androidDaylightMaterials(1), androidMaterials('#303c36'))
  const middle = androidDaylightMaterials(.5)
  assert.equal(androidMaterials(middle), middle)
  assert.equal(androidDaylightMaterials(.5), middle)
  assert.ok(new Set(Object.values(middle)).size >= 5)
  assert.deepEqual(new Set(Object.values(androidMaterials('#ffffff'))), new Set(['#ffffff']))
})

test('all player materials blend continuously, including across the former brightness threshold', () => {
  let previous = channels(androidDaylightMaterials(0))
  const appearances = new Set()
  for (let step=1;step<=1000;step++) {
    const palette = androidDaylightMaterials(step/1000), next = channels(palette)
    assert.ok(next.every((value,i) => Math.abs(value-previous[i])<=1))
    appearances.add(JSON.stringify(palette)); previous=next
  }
  assert.ok(appearances.size > 50)
  const a = channels(androidDaylightMaterials((.699-.35)/.6)), b = channels(androidDaylightMaterials((.701-.35)/.6))
  assert.ok(a.every((value,i) => Math.abs(value-b[i])<=1))
})

test('walking between regions blends the whole palette without mutating the player or level', () => {
  const run = createPreviewRun(level()), light = new EnvironmentLighting(), original = JSON.stringify(run.level)
  let previous
  for (let x=800;x<=1400;x++) {
    run.player.x=x
    const before=JSON.stringify(run.player), palette=light.playerMaterials(run), next=channels(palette)
    assert.equal(light.playerMaterials(run),palette,'all composition passes reuse one appearance')
    assert.equal(JSON.stringify(run.player),before)
    if (previous) assert.ok(next.every((value,i)=>Math.abs(value-previous[i])<=1), `palette jump at ${x}`)
    previous=next
  }
  assert.equal(JSON.stringify(run.level),original)
  assert.equal(light.playerMaterials(run),androidMaterials('#e5e7e6'))
  run.player.x=800
  assert.equal(light.playerMaterials(run),androidMaterials('#303c36'))
})

test('regional material blending is background-independent and samples the inverted body correctly', () => {
  const run=createPreviewRun(level()), light=new EnvironmentLighting()
  run.player.x=980;run.player.y=700
  const normal=light.playerMaterials(run)
  run.player.inverted=true;run.player.y=638
  assert.equal(light.playerMaterials(run),normal)
  const sky={...run,level:{...run.level,environment:{...run.level.environment,kind:'landscape',horizon:300}}}
  assert.deepEqual(new EnvironmentLighting().playerMaterials(sky),normal)
})
