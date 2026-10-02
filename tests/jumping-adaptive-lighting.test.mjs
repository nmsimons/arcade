import test from 'node:test'
import assert from 'node:assert/strict'
import { AdaptiveLighting } from '../src/games/jumping/adaptiveLighting.ts'
import { dynamicCasters } from '../src/games/jumping/lightingModel.ts'
import { createRun } from '../src/games/jumping/challenge.ts'
import { JSON_LAB } from './helpers/jumping-fixtures.mjs'

function frames(adaptive, hz, seconds, start = 0) {
  for (let i = 0; i <= hz * seconds; i++) adaptive.observe(start + i * 1000 / hz)
}

test('normal resolution survives normal and high-refresh play without assuming device capability', () => {
  for (const hz of [35, 36, 40, 45, 60, 90, 120, 144]) {
    const adaptive = new AdaptiveLighting()
    frames(adaptive, hz, 20)
    assert.equal(adaptive.reduced, false)
  }
})

test('two sustained slow windows reduce resolution and latch until explicit reset', () => {
  const adaptive = new AdaptiveLighting()
  frames(adaptive, 30, 1)
  assert.equal(adaptive.reduced, false)
  frames(adaptive, 30, 2, 1000)
  assert.equal(adaptive.reduced, true)
  frames(adaptive, 120, 20, 3000)
  assert.equal(adaptive.reduced, true, 'no quality oscillation when reduced work restores FPS')
  adaptive.suspend(); adaptive.observe(60000)
  assert.equal(adaptive.reduced, true, 'pause retains quality')
  adaptive.reset(); frames(adaptive, 60, 5, 70000)
  assert.equal(adaptive.reduced, false)
})

test('isolated hitches and time out of focus cannot trigger a downgrade', () => {
  const adaptive = new AdaptiveLighting()
  adaptive.observe(0); adaptive.observe(1500)
  frames(adaptive, 60, 5, 1500)
  assert.equal(adaptive.reduced, false)
  frames(adaptive, 30, 1, 6500)
  adaptive.suspend()
  frames(adaptive, 60, 5, 60000)
  assert.equal(adaptive.reduced, false)
})

test('structural mode retains every mechanism caster and leaves world state untouched', () => {
  const run = createRun(structuredClone(JSON_LAB)), before = structuredClone(run)
  const full = dynamicCasters(run), structural = dynamicCasters(run, false)
  assert.ok(full.some(group => group.player))
  assert.ok(full.some(group => !group.player && !group.mechanism))
  assert.ok(structural.length > 0)
  assert.deepEqual(structural, full.filter(group => group.mechanism))
  assert.deepEqual(run, before)
})
