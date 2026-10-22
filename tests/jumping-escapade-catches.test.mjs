import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { escapadeTowerCatches, escapadeTowerFixture, escapadeTowerLevel } from './helpers/jumpingEscapadeScenarios.mjs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

const authored = JSON.parse(readFileSync(escapadeTowerFixture, 'utf8'))
for (const config of escapadeTowerCatches) {
  test(`Escapade ${config.name} catches a walking departure without changing the visible rig's bone lengths`, () => {
    const level = parseLevel(escapadeTowerLevel(authored, config))
    assert.deepEqual(levelProblems(level), [])
    const run = createRun(level), p = run.player
    let phase = 'off', airborne = false, caught = false
    for (let tick = 0; tick < 160; tick++) {
      if (phase === 'off' && (p.x - config.edgeX) * config.away >= 10) phase = 'back'
      stepRun(run, { ...NEUTRAL_INPUT, move: phase === 'off' ? config.away * 125 / 410 : phase === 'back' ? -config.away : 0 })
      airborne ||= !p.grounded
      if (p.hang) { caught = true; phase = 'wait' }
      const pose = athletePose(p)
      for (const name of ['frontArm', 'backArm', 'frontLeg', 'backLeg']) {
        const limb = pose[name], leg = name.includes('Leg')
        const upper = Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0)
        const lower = Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0))
        assert.ok(Math.abs(upper - (leg ? 15 : 10)) < .001, `${name} upper bone stays fixed at tick ${tick}`)
        assert.ok(Math.abs(lower - (leg ? 14.5 : 9)) < .001, `${name} lower bone stays fixed at tick ${tick}`)
      }
      if (p.hang?.time > .25) break
    }
    assert.ok(airborne && caught)
    assert.equal(p.hang?.edgeX, config.edgeX); assert.equal(p.hang?.edgeY, config.edgeY)
    assert.ok(p.hang.time > .25)
    assert.ok(Math.abs(p.x - config.edgeX - config.away * 14) < .001)
  })
}
