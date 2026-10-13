import { createRun, stepRun } from '../../src/games/jumping/challenge.ts'
import { parseLevel, levelProblems } from '../../src/games/jumping/level.ts'
import { ENTRANCE_SECONDS } from '../../src/games/jumping/goal.ts'
import { NEUTRAL_INPUT, STEP } from '../../src/games/jumping/model.ts'
import { createRope, ropeImpulse } from '../../src/games/jumping/climbables.ts'
import { setRopeWasmEnabled } from '../../src/games/jumping/ropeWasm.ts'

/** All layout coordinates/prototypes are JSON data. Counts scale a numerical
 * workload within current file limits; these are not authored game challenges.
 */
export function stressLevel(fixture, scenario) {
  const level = structuredClone(fixture.level), layout = fixture.layout
  level.id += `-${scenario.id}`; level.name += ` ${scenario.id}`
  const grid = (item, i) => ({ x: item.x + i % item.columns * item.dx, y: item.y + Math.floor(i / item.columns) * item.dy })
  level.climbables.ropes = Array.from({ length: scenario.ropes ?? 0 }, (_, i) => ({
    ...grid(layout.rope, i), length: layout.rope.length, segments: layout.rope.segments,
  }))
  if (scenario.ropeContacts) for (let i = 0; i < Math.min(scenario.ropes, layout.rope.columns); i++) {
    level.platforms.push({ x: grid(layout.rope, i).x + layout.ropeWall.offsetX,
      y: layout.ropeWall.y, w: layout.ropeWall.w, h: layout.ropeWall.h, material: 'steel' })
  }
  for (let i = 0; i < (scenario.terrain ?? 0); i++) level.platforms.push({ ...grid(layout.terrain, i), w: layout.terrain.w, h: layout.terrain.h })
  level.props = Array.from({ length: scenario.props ?? 0 }, (_, i) => ({
    kind: i % 2 ? 'ball' : 'box', ...grid(layout.prop, i), size: layout.prop.size,
  }))
  if (level.props.length) level.gravityPlates = [structuredClone(layout.propGravity)]
  level.lighting.nightMode = !!scenario.lights
  level.lighting.lights = Array.from({ length: scenario.lights ?? 0 }, (_, i) => ({
    id: `stress-light-${i}`, ...grid(layout.light, i), intensity: layout.light.intensity,
    direction: layout.light.direction, spread: layout.light.spread, power: layout.light.power,
  }))
  level.mechanisms = Array.from({ length: scenario.lifts ?? 0 }, (_, i) => ({
    id: `stress-lift-${i}`, kind: 'lift', x: layout.lift.x + i * layout.lift.dx,
    y: layout.lift.y, w: layout.lift.w, h: layout.lift.h, travel: layout.lift.travel, power: layout.lift.power,
  }))
  const parsed = parseLevel(level), problems = levelProblems(parsed)
  if (problems.length) throw new Error(`${scenario.id}: ${problems.join('; ')}`)
  return parsed
}
export function stressRun(fixture, scenario) {
  // Initial authoring/settling is identical in both arms and outside timing.
  setRopeWasmEnabled(false)
  const run = createRun(stressLevel(fixture, scenario))
  stepRun(run, NEUTRAL_INPUT, ENTRANCE_SECONDS)
  run.player.ropes ??= run.level.climbables.ropes.map(createRope)
  const impulse = fixture.layout.ropeImpulse
  for (const rope of run.player.ropes ?? []) ropeImpulse(rope, rope.definition.length * impulse.distanceFraction, impulse.vx, impulse.vy, STEP)
  for (const [i, prop] of run.props.entries()) {
    prop.vx = fixture.layout.prop.vx * (i % 2 ? -1 : 1); prop.vy = fixture.layout.prop.vy
  }
  for (const [i, mechanism] of run.mechanisms.entries()) mechanism.wait = i * fixture.layout.lift.stagger
  return run
}
export function stressSnapshot(run) {
  return [run.player.x, run.player.y, run.player.vx, run.player.vy, run.elapsed,
    ...run.props.flatMap(p => [p.x, p.y, p.vx, p.vy, p.angle, p.angularVelocity]),
    ...(run.player.ropes ?? []).flatMap(r => [r.pumpInput, ...r.nodes.flatMap(n => [n.x, n.y, n.oldX, n.oldY]),
      ...r.bends.flatMap(b => b ? [1, ...b] : [0, 0, 0])]),
    ...run.mechanisms.flatMap(m => [m.x, m.y, Number(m.active), m.direction, m.wait]),
  ]
}
