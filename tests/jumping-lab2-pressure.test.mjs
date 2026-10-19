import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { platformSurface } from '../src/games/jumping/terrain.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

test('LAB2 crate holds its floor plate until the player moves it, and restart restores the press', () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/LAB2.jump-level.json', import.meta.url), 'utf8')))
  const plate = level.triggers[0], run = createRun(level)
  assert.equal(plate.y, platformSurface(level.platforms[0], plate.x + plate.w / 2).y, 'seat the plate on its supporting floor')
  const step = (frames, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
  step(60)
  assert.equal(run.triggers[0].pressed, true)
  assert.equal(run.triggers[0].depression, 1)
  assert.equal(run.goalLit, true)
  // Ordinary movement, two held jumps and an Up recovery reach the crate.
  for (const [frames, input] of [[80, { move: 1 }], [24, { move: 1, jump: true }], [230, { move: 1 }],
    [24, { move: 1, jump: true }], [180, { move: 1 }], [90, { climb: true }], [171, { move: 1 }]]) step(frames, input)
  assert.ok(run.player.x > 2080, 'reach the crate from the authored entrance')
  assert.equal(run.triggers[0].active, true, 'the unattended crate keeps the exit powered')
  step(120, { move: 1 })
  assert.ok(run.props[0].x > level.props[0].x + 20, 'actually push the crate away')
  assert.equal(run.triggers[0].active, false)
  assert.equal(run.goalLit, false)
  const restarted = createRun(level)
  for (let i = 0; i < 60; i++) stepRun(restarted, NEUTRAL_INPUT)
  assert.equal(restarted.triggers[0].pressed, true)
  assert.equal(restarted.goalLit, true)
})
