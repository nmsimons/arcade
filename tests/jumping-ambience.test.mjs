import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { levelAmbience, listenerUnderwater, runningPumps } from '../src/games/jumping/ambience.ts'
import { advanceBusEnding, createBusDeparture } from '../src/games/jumping/busEnding.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { waterControlId } from '../src/games/jumping/waterLevel.ts'

// The level's standing sound (ambience.ts): one bed per kind of source, as loud as the sources within earshot.
const run$ = (change = () => {}, at = 400) => {
  const file = blankTrial(); change(file)
  const run = createRun(file)
  run.player = createPlayer({ x: at, y: 920 })
  return run
}
const hear = (run, x = run.player.x) => levelAmbience(run, createPlayer({ x, y: 920 }))
const pool = { id: 'pool', x: 900, y: 820, w: 600, h: 100, gravity: 1, effect: 'water', power: 'always' }

test('a facility always has its air handling, and nothing else without sources', () => {
  assert.deepEqual(levelAmbience(null, createPlayer({ x: 0, y: 0 })), { hvac: { volume: 1, pan: 0, power: 1 } })
  const run = run$(file => { file.goal.power = 'switched'; file.goal.id = 'exit' })
  assert.deepEqual(hear(run), { hvac: { volume: 1, pan: 0, power: 1 } })
})

test('outdoors the air replaces the air handling, and a facility wall brings it back', () => {
  const run = run$(file => {
    file.environment = { kind: 'landscape', horizon: 500, walls: [{ x: 0, y: 0, w: 700, h: 920, kind: 'facility' }, { x: 1300, y: 0, w: 400, h: 920, kind: 'cave' }] }
  })
  assert.deepEqual(Object.keys(hear(run, 400)), ['hvac'])
  assert.deepEqual(hear(run, 1000).air, { volume: 1, pan: 0, power: 1 })
  assert.equal(hear(run, 1000).hvac, undefined)
  assert.ok(hear(run, 1500).air.volume < .6 && !hear(run, 1500).hvac, 'a cave is still air, quieter')
})

test('a power cut takes power from every electrical bed but not from the water', () => {
  const run = run$(file => {
    file.mechanisms = [{ id: 'lift', kind: 'lift', x: 500, y: 900, w: 120, h: 20, travel: 200, power: 'always' }]
    file.gravityPlates = [pool]
  })
  const powered = hear(run, 700)
  assert.equal(powered.hvac.power, 1); assert.equal(powered.hum.power, 1); assert.equal(powered.water.power, 1)
  run.empRemaining = 5
  const cut = hear(run, 700)
  assert.equal(cut.hvac.power, 0); assert.equal(cut.hum.power, 0)
  assert.equal(cut.water.power, 1)
  assert.equal(cut.hum.volume, powered.hum.volume, 'the machine is still there to run down')
})

test('a force field crackles from its nearest point, louder close to, and not when off or disabled', () => {
  const run = run$(file => { file.forceFields = [{ id: 'field', x: 900, y: 600, w: 12, h: 320, orientation: 'vertical', power: 'always' }] })
  assert.ok(run.forceFields[0].active)
  const near = hear(run, 800).field, far = hear(run, 300).field, beyond = hear(run, 1300).field
  assert.ok(near.volume > .5 && near.volume > far.volume * 2, `${near.volume} near, ${far.volume} far`)
  assert.ok(near.pan > 0 && beyond.pan < 0, 'heard from its side')
  run.gadgets.disabled.set(run.forceFields[0], 5)
  assert.equal(hear(run, 800).field, undefined)
  run.gadgets.disabled.clear(); run.forceFields[0].active = false
  assert.equal(hear(run, 800).field, undefined)
})

test('a lamp buzzes only when lit and only close to; many lamps never exceed full volume', () => {
  const lamps = Array.from({ length: 40 }, (_, i) => ({ id: `lamp${i}`, x: 300 + i * 30, y: 800 }))
  const run = run$(file => { file.wallLights = lamps.slice(0, 1) })
  assert.equal(hear(run, 300).buzz, undefined, 'an unlit lamp is silent')
  run.switchStates = new Map([['lamp0', true]])
  assert.ok(hear(run, 300).buzz.volume > .3)
  assert.equal(hear(run, 1300).buzz, undefined, 'out of earshot at 1,000 units')
  const crowd = run$(file => { file.wallLights = lamps })
  crowd.switchStates = new Map(lamps.map(l => [l.id, true]))
  const bed = hear(crowd, 900).buzz
  assert.ok(bed.volume <= 1 && bed.volume > hear(run, 300).buzz.volume)
})

test('machines hum at rest, lifts more than gates, and robots whir until they slump', () => {
  const run = run$(file => {
    file.mechanisms = [{ id: 'gate', kind: 'gate', x: 600, y: 720, w: 20, h: 200, travel: 200 }]
    file.robots = [{ kind: 'repulsor', x: 1200, y: 920, left: 1000, right: 1700 }]
  })
  const hum = hear(run, 400).hum, whir = hear(run, 1200).whir
  assert.ok(hum.volume > 0 && whir.volume > .3)
  const robot = run.robots[0]
  robot.collapse = 1
  assert.equal(hear(run, 1200).whir, undefined, 'a slumped robot is silent')
  const lift = run$(file => { file.mechanisms = [{ id: 'lift', kind: 'lift', x: 600, y: 720, w: 20, h: 200, travel: 200, power: 'always' }] })
  assert.ok(hear(lift, 400).hum.volume > hum.volume)
})

test('pools lap at their surface, fullest in the water, and pumps run only while they can move it', () => {
  const run = run$(file => { file.gravityPlates = [{ ...pool, waterLevel: 50 }] })
  const beside = hear(run, 800).water, inside = levelAmbience(run, createPlayer({ x: 1200, y: 920 })).water, far = hear(run, 100).water
  assert.ok(inside.volume >= beside.volume && beside.volume > far.volume && far.volume > 0)
  assert.deepEqual(runningPumps(run), [])
  run.switchStates = new Map([[waterControlId('pool', 'fill'), true]])
  assert.equal(runningPumps(run).length, 1)
  run.empRemaining = 1
  assert.deepEqual(runningPumps(run), [], 'a power cut stops the pumps')
  run.empRemaining = 0; run.water.pools[0].level = 100
  assert.deepEqual(runningPumps(run), [], 'a full pool stops its fill pump')
})

test('drops fall into a pool now and then, the same way every time, and never into no pool', () => {
  const drips = change => {
    const run = run$(change, 1000), audio = new JumpingAudioState(), times = []
    audio.reset(run.player, run)
    for (let i = 0; i < 40 / STEP; i++) {
      stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP)
      for (const cue of audio.drain().cues) if (cue.kind === 'drip') times.push(Math.round(run.activeTime * 100))
    }
    return times
  }
  const first = drips(file => { file.gravityPlates = [pool] })
  assert.ok(first.length >= 4 && first.length <= 16, `${first.length} drops in 40 s`)
  assert.deepEqual(drips(file => { file.gravityPlates = [pool] }), first)
  assert.deepEqual(drips(), [])
})

test('a lamp switching on clicks its relay, and the frame carries the ambience', () => {
  const run = run$(file => {
    file.wallLights = [{ id: 'lamp', x: 500, y: 800 }]
    file.triggers = [{ x: 380, y: 920, w: 60, mode: 'touch', behavior: 'toggle', targets: ['lamp'] }]
  }, 410)
  const audio = new JumpingAudioState(), cues = []
  audio.reset(run.player, run)
  let frame
  for (let i = 0; i < 90; i++) { stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP); frame = audio.drain(); cues.push(...frame.cues) }
  assert.ok(run.switchStates.get('lamp'), 'the plate lit the lamp')
  assert.ok(cues.some(c => c.kind === 'relay'), JSON.stringify(cues.map(c => c.kind)))
  assert.ok(frame.ambience.hvac && frame.ambience.buzz)
})

test('a gravity plate drones while it pulls, fullest inside it, higher for a stronger pull, and runs down in a power cut', () => {
  const plate = { id: 'plate', x: 800, y: 500, w: 300, h: 420, gravity: -1, power: 'always' }
  const run = run$(file => {
    file.gravityPlates = [plate, { ...plate, id: 'strong', x: 1500, w: 200, gravity: 2.5 }]
    file.goal.power = 'switched'; file.goal.id = 'exit'
  })
  const inside = hear(run, 950).gravity, beside = hear(run, 700).gravity
  assert.ok(inside.volume > beside.volume && beside.volume > .3, `${inside.volume} inside, ${beside.volume} beside`)
  assert.equal(hear(run, 950).hum, undefined, 'its own bed, not the machines\'')
  assert.ok(hear(run, 1600).gravity.pace > inside.pace, 'the stronger plate works harder')
  run.empRemaining = 3
  assert.equal(hear(run, 950).gravity.power, 0)
  run.empRemaining = 0; run.gadgets.disabled.set(run.water.plates[0], 5)
  assert.ok(hear(run, 950).gravity.volume < inside.volume, 'a disabled plate drops out')
  const switched = run$(file => { file.gravityPlates = [{ ...plate, power: 'switched' }] })
  assert.equal(hear(switched, 950).gravity, undefined, 'a plate switched off is silent')
})

const listen = (run, seconds, input = NEUTRAL_INPUT) => {
  const audio = new JumpingAudioState(), cues = [], frames = []
  audio.reset(run.player, run)
  for (let i = 0; i < seconds / STEP; i++) {
    stepRun(run, input); audio.step(run.player, run, STEP)
    if (i % 2) { const frame = audio.drain(); frames.push(frame); cues.push(...frame.cues) }
  }
  return { audio, cues, frames }
}

test('with its head under water the robot hears the water round it, muffled air and bubbles, and none of it above', () => {
  const deep = { ...pool, y: 700, h: 220 }
  const run = run$(file => { file.gravityPlates = [deep] }, 1200)
  run.player.vy = 0
  assert.equal(listenerUnderwater(run, createPlayer({ x: 400, y: 920 })), 0, 'dry')
  assert.equal(listenerUnderwater(run, createPlayer({ x: 1200, y: 920 })), 1, 'on the bottom, the head is under')
  assert.equal(listenerUnderwater(run, createPlayer({ x: 1200, y: 740 })), 0, 'floating with the head out')
  const { cues, frames } = listen(run, 20, { ...NEUTRAL_INPUT, descend: true, swimVertical: 1 })
  const frame = frames.at(-1)
  assert.ok(frame.underwater > .9, `under ${frame.underwater}`)
  assert.ok(frame.ambience.underwater.volume > .9)
  assert.ok(!frame.ambience.water || frame.ambience.water.volume < .1, 'the lapping is at the surface, overhead')
  const bubbles = cues.filter(c => c.kind === 'bubble').length
  assert.ok(bubbles >= 5 && bubbles <= 25, `${bubbles} bubbles in 20 s`)
  const dry = listen(run$(file => { file.gravityPlates = [deep] }, 300), 5)
  assert.equal(dry.frames.at(-1).underwater, 0)
  assert.equal(dry.cues.filter(c => c.kind === 'bubble').length, 0)
})

test('birds sing now and then under open sky, never indoors, in a cave or under water', () => {
  const landscape = (walls = []) => file => { file.environment = { kind: 'landscape', horizon: 500, walls } }
  const birds = run => listen(run, 40).cues.filter(c => c.kind.startsWith('bird-'))
  const open = birds(run$(landscape()))
  assert.ok(open.length >= 4 && open.length <= 16, `${open.length} calls in 40 s`)
  assert.ok(open.every(c => c.volume <= 1 && c.pitch > .8 && c.pitch < 1.25))
  assert.deepEqual(birds(run$(landscape([{ x: 0, y: 0, w: 1800, h: 920, kind: 'cave' }]))), [])
  assert.deepEqual(birds(run$()), [], 'indoors')
})

test('the exit bus idles where it waits, then revs away through a gear change and fades, its brakes hissing once', () => {
  const run = run$(file => { file.goal = { x: 1500, y: 920, kind: 'bus' }; file.environment = { kind: 'landscape', horizon: 500, walls: [] } })
  const waiting = hear(run, 1300)
  assert.equal(waiting.engine.pace, 0); assert.ok(waiting.engine.volume > .5)
  assert.equal(waiting.hum, undefined, 'the bus is an engine, not a machine')
  run.empRemaining = 5
  assert.equal(hear(run, 1300).engine.power, 1, 'a power cut does not stop a bus')
  run.empRemaining = 0
  const audio = new JumpingAudioState(), ending = createBusDeparture(run.level.goal, run.player, { x: 0, y: 0, zoom: 1 }), timeline = []
  audio.reset(run.player, run)
  while (ending.elapsed < 16.3) {
    const frame = audio.ending(ending, run)
    timeline.push({ t: ending.elapsed, ...frame.ambience.engine, cues: frame.cues.map(c => c.kind) })
    advanceBusEnding(ending, 1 / 60)
  }
  const at = t => timeline.find(f => f.t >= t)
  assert.equal(at(7).pace, 0, 'idling as the robot settles in')
  assert.ok(at(9.2).pace > .7, 'revving as it pulls away')
  assert.ok(at(9.9).pace < at(9.2).pace - .2, 'down through a gear change')
  assert.ok(at(12.5).pace > at(9.9).pace, 'and up again')
  assert.ok(at(11).volume < at(8).volume && at(13.5).volume < at(11).volume, 'fading as it goes')
  assert.equal(at(14.5).volume, 0, 'gone over the horizon')
  assert.deepEqual(timeline.flatMap(f => f.cues).filter(kind => kind === 'air-brake'), ['air-brake'])
  assert.ok(timeline.every(f => f.volume <= 1 && f.pace <= 1))
  assert.ok(audio.ending(ending, run).ambience.air, 'under the open air')
})
