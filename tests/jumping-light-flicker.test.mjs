import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { editLight } from '../src/games/jumping/lightingEditor.ts'
import { duplicateItem } from '../src/games/jumping/editor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { createPreviewRun } from '../src/games/jumping/challenge.ts'
import { LightingState } from '../src/games/jumping/lightingModel.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/lighting-prototype.json', import.meta.url)))
const level = () => parseLevel({ ...structuredClone(fixture.level), version: 2, lighting: fixture.lighting })

test('flicker is optional, strictly boolean, and survives save, duplication and templates', () => {
  const original = level(), before = JSON.stringify(original)
  assert.equal(original.lighting.lights[0].flicker, undefined)
  const edited = editLight(original, 0, { flicker: true })
  assert.equal(JSON.stringify(original), before)
  assert.equal(parseLevel(JSON.parse(JSON.stringify(edited))).lighting.lights[0].flicker, true)
  const duplicated = duplicateItem(edited, { kind: 'light', index: 0 }).level
  assert.equal(duplicated.lighting.lights.at(-1).flicker, true)
  assert.notEqual(duplicated.lighting.lights.at(-1).id, edited.lighting.lights[0].id)
  assert.equal(copyForEditing(edited).lighting.lights[0].flicker, true)
  const steady = editLight(edited, 0, { flicker: false })
  assert.equal(steady.lighting.lights[0].flicker, undefined)
  assert.deepEqual(steady, original)
  for (const value of [false, true, null, 0, 1, 'true', {}, []]) {
    const file = level(); file.lighting.lights[0].flicker = value
    if (typeof value === 'boolean') assert.equal(!!parseLevel(file).lighting.lights[0].flicker, value)
    else assert.throws(() => parseLevel(file), /Invalid lighting/)
  }
})

test('malfunctioning lamps stutter independently on visual time and repeat after reset', () => {
  const definition = { nightMode: true, ambient: 0, lights: [
    { ...fixture.lighting.lights[0], id: 'lamp-a', flicker: true },
    { ...fixture.lighting.lights[0], id: 'lamp-b', flicker: true },
    { ...fixture.lighting.lights[0], id: 'steady' },
  ] }
  const run = createPreviewRun(level()), before = JSON.stringify(run)
  const state = new LightingState(), faster = new LightingState(), samples = []
  assert.deepEqual(state.sources(definition, run, 0).map(s => s.fade), [1, 1, 1], 'static previews start lit')
  for (let i = 0; i < 1024; i++) {
    const sources = state.sources(definition, run, 1 / 64)
    faster.sources(definition, run, 1 / 128)
    assert.deepEqual(faster.sources(definition, run, 1 / 128), sources, 'frame rate does not change the pattern')
    assert.deepEqual(state.sources(definition, run, 0), sources, 'pausing freezes flicker')
    assert.equal(sources[2].fade, 1, 'steady lamps keep their old behavior')
    assert.ok(sources.every(s => s.fade >= 0 && s.fade <= 1))
    samples.push(sources.map(s => s.fade))
  }
  for (let index = 0; index < 2; index++) {
    assert.ok(samples.some(s => s[index] === 0), 'brief dropouts')
    assert.ok(samples.some(s => s[index] > 0 && s[index] < .5), 'dim stutters')
    assert.ok(samples.filter(s => s[index] === 1).length > samples.length * .7, 'quiet stretches between faults')
  }
  assert.ok(samples.some(s => s[0] !== s[1]), 'separate lamps have separate patterns')
  assert.equal(JSON.stringify(run), before, 'lighting does not change simulation or scoring')
  state.reset()
  assert.deepEqual(state.sources(definition, run, 0).map(s => s.fade), [1, 1, 1])
  for (const expected of samples) assert.deepEqual(state.sources(definition, run, 1 / 64).map(s => s.fade), expected)
})

test('flicker never bypasses switched power or EMP and does not feed back into the power fade', () => {
  const run = createPreviewRun(level()), lamp = { ...fixture.lighting.lights[0], id: run.level.mechanisms[0].id, power: 'switched', flicker: true }
  const definition = { ambient: 0, lights: [lamp] }, state = new LightingState(), steady = new LightingState()
  const control = { ambient: 0, lights: [{ ...lamp, flicker: false }] }
  const check = dt => {
    const source = state.sources(definition, run, dt)[0], power = steady.sources(control, run, dt)[0].fade
    assert.ok(source.fade <= power)
    return source.fade
  }
  for (let i = 0; i < 1024; i++) assert.equal(check(1 / 64), 0)
  run.triggers[0].active = true
  for (let i = 0; i < 1024; i++) {
    const fade = check(1 / 64)
    if (i > 13 && fade === 1) assert.equal(steady.sources(control, run, 0)[0].fade, 1)
  }
  run.empRemaining = 5
  for (let i = 0; i < 1024; i++) {
    const fade = check(1 / 64)
    if (i >= 13) assert.equal(fade, 0)
  }
  run.empRemaining = 0
  let relit = false
  for (let i = 0; i < 1024; i++) if (check(1 / 64) === 1) relit = true
  assert.equal(relit, true)
})
