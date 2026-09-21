import { SITUATIONS, runTrial, scrimmages, summarize } from '../benchmarks/bumperBall.mjs'

const situations = SITUATIONS.map(fixture => runTrial(fixture))
const matches = scrimmages().map(fixture => runTrial(fixture, { opponent: true }))
console.table(situations)
console.log('Fixed situations:', summarize(situations))
console.log('Seeded trials against ball-chasing opponent:', summarize(matches))
