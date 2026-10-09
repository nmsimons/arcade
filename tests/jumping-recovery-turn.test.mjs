import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, playerState, stepPlayer, STEP, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { athleteSkin } from './helpers/jumpingSkin.mjs'

const physical = p => Object.fromEntries(['x', 'y', 'vx', 'vy', 'facing', 'grounded', 'coyote', 'buffer', 'jumpHeld', 'crouching'].map(key => [key, p[key]]))
const points = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb =>
    [[...limb.joint, limb.jointDepth ?? 0], [...limb.end, limb.endDepth ?? 0]])]
const world = (p, pose) => points(pose).map(point => [p.x + point[0] * p.facing, p.y + point[1] * (p.inverted ? -1 : 1), point[2] ?? 0])

function recovery(context, inverted, facing, stage) {
  const slope = context === 'uphill' ? .2 : context === 'downhill' ? -.2 : 0
  const floor = slope ? { x: -2000, y: slope > 0 ? 900 : 700, w: 6000, h: 1500,
    profile: slope > 0 ? [[0, 0], [6000, 1200]] : [[0, 1200], [6000, 0]] }
    : { x: -2000, y: 1400, w: 6000, h: 100 }
  const roof = context === 'crouched tunnel' ? { x: facing === 1 ? 280 : 560, y: 1320, w: 160, h: 40 } : null
  const base = [floor, ...(roof ? [roof] : [])], terrain = inverted ? base.map(mirrorPlatform) : base
  const gravity = inverted ? -TUNING.gravity : TUNING.gravity
  const p = createPlayer({ x: 500, y: inverted ? -100 : 100 })
  Object.assign(p, { grounded: false, coyote: 0, inverted, facing })
  const step = (player, input) => stepPlayer(player, input, STEP, terrain, undefined, undefined, undefined, undefined, gravity)
  for (let i = 0; i < 400 && !p.grounded; i++) step(p, NEUTRAL_INPUT)
  assert.ok(p.grounded && p.freeFall && p.freeFall.recovery !== null)
  // A sloped impact has real tangential travel and starts its moving spring.
  // Test that transfer directly; never erase its velocity to manufacture rest.
  if (!p.freeFall.moving) while (p.freeFall && p.freeFall.recovery < stage) step(p, NEUTRAL_INPUT)
  assert.ok(p.freeFall)
  return { p, step, terrain, slope, roof }
}

function fixedBones(pose) {
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
  }
}

test('first opposite recovery presses and repeated turns retain the outgoing rig, real shoes and complete clearance', () => {
  for (const context of ['flat', 'uphill', 'downhill', 'crouched tunnel']) for (const inverted of [false, true]) for (const facing of [-1, 1])
    for (const stage of (context === 'uphill' || context === 'downhill' ? [.05] : [.05, .3, .6, .8])) for (const repeat of [false, true]) {
      const { p, step, terrain, slope, roof } = recovery(context, inverted, facing, stage)
      const control = structuredClone(p), audio = new JumpingAudioState()
      audio.reset(p, null)
      let previous = world(p, athletePose(p)), settled = false, recovering = 0
      for (let tick = 0; tick < 90; tick++) {
        const move = repeat ? tick < 2 ? -facing : tick < 4 ? facing : tick < 6 ? -facing : tick < 8 ? facing : tick < 12 ? -facing : 0 : -facing
        const input = { ...NEUTRAL_INPUT, move, crouch: context === 'crouched tunnel' }
        const before = structuredClone(p), wasRecovering = !!p.freeFall
        step(p, input); control.freeFall = null; step(control, input)
        assert.deepEqual(physical(p), physical(control), 'presentation preserves movement, contacts and jump state')
        if (!tick) assert.equal(p.facing, -facing, 'steering changes on the first requested tick')
        const snapshot = structuredClone(p), pose = athletePose(p), current = world(p, pose)
        assert.deepEqual(p, snapshot, 'pose solving remains read-only')
        fixedBones(pose)
        audio.step(p, null, STEP)
        const cues = audio.drain().cues
        if (p.freeFall) {
          assert.equal(playerState(p), 'Recovering')
          assert.ok(!cues.some(cue => cue.kind === 'footstep'), 'step audio waits for visible locomotion support')
        }
        if (wasRecovering || p.freeFall) {
          recovering++
          for (let i = 0; i < current.length; i++) {
            const delta = current[i].map((v, j) => v - previous[i][j])
            assert.ok(Math.hypot(...delta) < 8, `${context}/${inverted}/${facing}/${stage}/${repeat}: world joint ${i} at tick ${tick}`)
            assert.ok(Math.hypot(delta[0] - p.x + before.x, delta[1] - p.y + before.y, delta[2]) < 6,
              'the actual final rig retains continuity through depth and terrain clearance')
          }
          for (const shape of athleteSkin(p)) for (const [x, worldY] of shape.points) {
            const y = worldY * (inverted ? -1 : 1), surface = 1400 + slope * (x - 500)
            assert.ok((y - surface) / Math.hypot(1, slope) < .02, `${shape.name} clears the real floor`)
            if (roof && x > roof.x && x < roof.x + roof.w && y > roof.y && y < roof.y + roof.h)
              assert.ok(Math.min(x - roof.x, roof.x + roof.w - x, y - roof.y, roof.y + roof.h - y) < .02, `${shape.name} clears the tunnel`)
          }
        }
        for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) if (leg.planted) {
          const foot = p.footwork.feet[i]
          assert.ok(foot.planted, 'visible support belongs to the motor')
          assert.ok(Math.hypot(p.x + leg.end[0] * p.facing - foot.x, p.y + leg.end[1] * (inverted ? -1 : 1) - foot.y) < 1e-6,
            'the final rig keeps its actual support ankle')
          if (!inverted) assert.ok(groundAt(terrain, foot.anchorX, foot.anchorY, .2), 'the anchor belongs to current geometry')
        }
        settled ||= !p.freeFall && !!p.footwork?.feet.some(foot => foot.planted)
        previous = current
      }
      assert.ok(recovering > 0 && settled && !p.freeFall, 'the spring completes into an ordinary supported gait')
      const jump = { ...NEUTRAL_INPUT, move: -facing, jump: true }
      step(p, jump); control.freeFall = null; step(control, jump)
      assert.deepEqual(physical(p), physical(control), 'a fresh departure preserves the actual motor')
      if (!roof) assert.ok(p.vy * (inverted ? -1 : 1) < 0 && !p.freeFall, 'a fresh jump immediately leaves support')
    }
})

test('fresh jumps interrupt the first opposite recovery transfer at early and later ticks', () => {
  for (const inverted of [false, true]) for (const facing of [-1, 1]) for (const stage of [.05, .3, .6, .8]) for (const ticks of [1, 8]) {
    const { p, step } = recovery('flat', inverted, facing, stage), control = structuredClone(p)
    for (let i = 0; i < ticks; i++) {
      const input = { ...NEUTRAL_INPUT, move: -facing }
      step(p, input); control.freeFall = null; step(control, input)
    }
    const input = { ...NEUTRAL_INPUT, move: -facing, jump: true }
    step(p, input); control.freeFall = null; step(control, input)
    assert.deepEqual(physical(p), physical(control))
    assert.ok(p.vy * (inverted ? -1 : 1) < 0 && !p.grounded && !p.freeFall)
    fixedBones(athletePose(p))
  }
})
