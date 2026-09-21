import { createArena, stepPhysics } from '../src/games/bumperBall/physics.ts'
import { advanceComputerBoost, createAiMemory, driveComputer } from '../src/games/bumperBall/ai.ts'
import { boostLaneClear, createBoost, startBoost, updateBoost } from '../src/games/bumperBall/boost.ts'

// Fixed situations and a separately seeded opponent set make changes repeatable.
export const SITUATIONS = [
  { name: 'kickoff', car: [650, 500, 0], ball: [800, 500, 0, 0], opponent: [950, 500] },
  { name: 'opponent-near-stationary-ball', car: [900, 380, 0], ball: [1150, 380, 0, 0], opponent: [1200, 380] },
  { name: 'open-finish', car: [1130, 560, 0], ball: [1260, 560, 0, 0], opponent: [800, 800] },
  { name: 'behind-bumper', car: [350, 500, 0], ball: [710, 500, 0, 0], opponent: [950, 700] },
  { name: 'top-wall', car: [700, 170, -1], ball: [800, 31, 0, 0], opponent: [950, 700] },
  { name: 'bottom-wall', car: [700, 820, 1], ball: [800, 969, 0, 0], opponent: [950, 300] },
  { name: 'corner', car: [1300, 750, .5], ball: [1560, 960, 0, 0], opponent: [950, 500] },
  { name: 'defend-slow', car: [215, 470, 0], ball: [400, 500, -105, 0], opponent: [520, 500] },
  { name: 'defend-fast', car: [235, 470, 0], ball: [450, 500, -190, 0], opponent: [600, 550] },
  { name: 'moving-ball', car: [800, 700, -1], ball: [1000, 300, 90, 130], opponent: [1250, 750] },
  { name: 'wrong-side', car: [950, 450, Math.PI], ball: [800, 500, 0, 0], opponent: [600, 700] },
  { name: 'own-wall', car: [160, 650, Math.PI], ball: [31, 800, 0, 0], opponent: [950, 500] },
]

export function scrimmages() {
  let seed = 20260921
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  return Array.from({ length: 24 }, (_, i) => ({
    name: `seeded-${i + 1}`, car: [600, 150 + random() * 700, (random() - .5) * 2],
    ball: [750 + random() * 100, 150 + random() * 700, (random() - .5) * 90, (random() - .5) * 90],
    opponent: [1000, 150 + random() * 700],
  }))
}

const car = (x, y, angle, side) => ({ pos: { x, y }, vel: { x: 0, y: 0 }, angle, wheelAngle: 0, side })
export function createTrial(fixture) {
  return {
    ...createArena(), vehicle1: car(...fixture.car, 'left'), vehicle2: car(...fixture.opponent, Math.PI, 'right'),
    ball: { pos: { x: fixture.ball[0], y: fixture.ball[1] }, vel: { x: fixture.ball[2], y: fixture.ball[3] }, radius: 30 },
  }
}

// Deliberately simple independent opponent: steer at the ball and accelerate.
// It has the same steering and acceleration limits as a human player.
function chaseBall(world, dt, boost) {
  const { vehicle2: car, ball } = world
  const angle = Math.atan2(ball.pos.y - car.pos.y, ball.pos.x - car.pos.x) - car.angle
  const error = Math.atan2(Math.sin(angle), Math.cos(angle))
  car.angle += Math.max(-1, Math.min(1, error * 1.5)) * 4 * dt
  if (Math.abs(error) < 1) {
    const drive = 350 * dt
    car.vel.x += Math.cos(car.angle) * drive
    car.vel.y += Math.sin(car.angle) * drive
  }
  if (boost) {
    if (Math.abs(error) < 0.14 && Math.hypot(ball.pos.x - car.pos.x, ball.pos.y - car.pos.y) > 100 && boostLaneClear(world, car)) startBoost(boost, car)
    updateBoost(boost, car, dt)
  }
}

export function runTrial(fixture, { opponent = false, duration = 45, inspectDrive, boosts = true } = {}) {
  const world = createTrial(fixture), memory = createAiMemory(), dt = 1 / 60
  const opponentBoost = boosts ? createBoost() : undefined
  let firstTouch = null, touches = 0, seconds = 0, goal, boostCount = 0
  const sounds = { bump() {}, wallBounce() {}, kick(vehicle) {
    if (vehicle.side === 'left') { touches++; firstTouch ??= seconds }
  } }
  for (let tick = 0; tick < duration * 60; tick++) {
    seconds = (tick + 1) * dt
    const before = { angle: world.vehicle1.angle, vel: { ...world.vehicle1.vel } }
    driveComputer(world, memory, dt)
    inspectDrive?.(before, world, dt)
    if (boosts && advanceComputerBoost(world, memory, dt)) boostCount++
    if (opponent) chaseBall(world, dt, opponentBoost)
    goal = stepPhysics(world, dt, sounds)
    if (goal) break
  }
  return { name: fixture.name, outcome: goal ? goal.side === 'right' ? 'scored' : 'conceded' : 'unresolved',
    seconds: +seconds.toFixed(2), firstTouch: firstTouch === null ? null : +firstTouch.toFixed(2), touches, boosts: boostCount }
}

export function summarize(results) {
  return { scored: results.filter(x => x.outcome === 'scored').length, conceded: results.filter(x => x.outcome === 'conceded').length,
    unresolved: results.filter(x => x.outcome === 'unresolved').length }
}
