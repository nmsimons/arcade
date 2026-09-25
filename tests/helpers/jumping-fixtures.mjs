import { readFileSync } from 'node:fs'
import { createPlayer as makePlayer, stepPlayer as step, STEP } from '../../src/games/jumping/model.ts'
import { NO_CLIMBABLES } from '../../src/games/jumping/climbables.ts'
import { parseLevel } from '../../src/games/jumping/level.ts'
export const readLevelAsset = path => parseLevel(JSON.parse(readFileSync(new URL(`../fixtures/jumping/${path}`, import.meta.url), 'utf8')))
export const DEFAULT_LEVEL = readLevelAsset('playground.json')
export const PLATFORMS = DEFAULT_LEVEL.platforms
export const CLIMBABLES = DEFAULT_LEVEL.climbables
export const CAMPAIGN = ['00-first-leap.json', '01-one-rope.json', '02-two-ropes.json'].map(name => readLevelAsset(`campaign/${name}`))
export const FIRST_LEVEL = CAMPAIGN[0]
export const YARD_LEVEL = readLevelAsset('examples/01-counterweight-yard.json')
export const JSON_LAB = readLevelAsset('00-json-test-lab.json')
// Legacy movement regression tests use the playground fixture explicitly. The engine has no default map.
export const createPlayer = () => makePlayer(DEFAULT_LEVEL.spawn)
export function stepPlayer(p, input, dt = STEP, platforms = PLATFORMS,
  climbables = platforms === PLATFORMS ? CLIMBABLES : NO_CLIMBABLES,
  rules = { checkpoints: platforms === PLATFORMS ? DEFAULT_LEVEL.checkpoints : [], fallY: 1020 }) {
  return step(p, input, dt, platforms, climbables, rules)
}
