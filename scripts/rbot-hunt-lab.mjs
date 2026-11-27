// Rbot hunt lab: how relentlessly and cleverly Rbot hunts, measured headlessly in the real simulation.
// Evidence for reviewing the hunter against docs/jumping-rbot-hunting.md.
//
//   node scripts/rbot-hunt-lab.mjs                     every campaign level with an Rbot, a line per level
//   node scripts/rbot-hunt-lab.mjs --level 08.json     one level (a file in public/levels/jumping)
//   node scripts/rbot-hunt-lab.mjs --json <dir>        also write each level's measurements as JSON in <dir>
//   node scripts/rbot-hunt-lab.mjs --hiders 10 --seconds 60 --runner-seconds 90
//   node scripts/rbot-hunt-lab.mjs --trace 08.json 739 860 [seconds] [every]
//       the bot's state, plan and route while the player stands at x, y ('-' keeps the entrance)
//
// Two kinds of quarry. A hider stands still on a spot spread across the level, from the start, and makes no sound:
// it measures whether the hunter finds a player who does not come to it, and whether it ever stands about. The
// runner heads for the nearest remaining pickup, then the exit, through the planner's own routes (so it moves like a
// determined, not a clever, player): it measures pressure on a player going about the level. Idle means the bot is
// neither moving nor winding up, recovering, slumped or waking (holding an ambush in view of the player, or standing off one pinned, counts apart, as
// watching); a hit is a sudden change in the player's velocity, and shots and shoves are the bot's own counts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRun, stepRun } from '../tests/helpers/jumping-active-run.mjs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { botMovement, botNavigationGraph, botNavigationRoute } from '../src/games/jumping/botNavigation.ts'
import { botWaterPoint } from '../src/games/jumping/botWaterNavigation.ts'
import { botLastSighting, botLastTactic, botStandingOff } from '../src/games/jumping/repulsorBot.ts'

const root = new URL('../public/levels/jumping/', import.meta.url)
const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback }
const HIDERS = Number(opt('--hiders', 10)), SECONDS = Number(opt('--seconds', 60)), RUNNER_SECONDS = Number(opt('--runner-seconds', 90))
const readLevel = file => parseLevel(JSON.parse(readFileSync(new URL(file, root), 'utf8')))

function metrics(run) {
  return { rbots: run.robots.filter(r => r.definition.kind === 'repulsor'), lastHit: -9, firstSeen: null, seen: 0, idle: 0, watching: 0, longestStill: 0, anchor: null, idleStreak: 0,
    longestIdle: 0, hits: 0, time: 0, near: 0, distSum: 0 }
}
function observe(m, run, prevVx, prevVy) {
  m.time += STEP
  for (const r of m.rbots) {
    const a = r.actor
    if (!a) continue
    if (r.seesPlayer) { m.seen += STEP; m.firstSeen ??= m.time }
    const moving = Math.hypot(a.vx, a.vy) > 8 || (a.climbing && Math.abs(a.climbing.speed ?? 0) > 1)
    // Holding an ambush in view of the player, or standing off one pinned, is waiting on purpose, counted apart as watching.
    const watching = r.seesPlayer && (botLastTactic(r)?.kind === 'ambush' || botStandingOff(run, r))
    if (watching) m.watching += STEP
    const busy = r.phase === 'windup' || r.phase === 'recover' || r.collapse || r.awakening && r.awakening.elapsed < 1.5 || a.shove || watching
    if (!moving && !busy) {
      const plan = botLastTactic(r)
      if (!m.idleStreak) m.streakStart = { t: +m.time.toFixed(1), bot: [Math.round(a.x), Math.round(a.y)], sees: r.seesPlayer,
        player: [Math.round(run.player.x), Math.round(run.player.y)], plan: plan && { kind: plan.kind, x: Math.round(plan.x), y: Math.round(plan.y) } }
      m.idle += STEP; m.idleStreak += STEP
      if (m.idleStreak > m.longestIdle) { m.longestIdle = m.idleStreak; m.worst = m.streakStart }
    } else m.idleStreak = 0
    // Also by place: a body that bobs or shuffles without going a body length anywhere for long is standing about too.
    if (!m.anchor || Math.hypot(a.x - m.anchor.x, a.y - m.anchor.y) > 60 || busy) m.anchor = { x: a.x, y: a.y, time: m.time }
    m.longestStill = Math.max(m.longestStill, m.time - m.anchor.time)
    const d = Math.hypot(run.player.x - a.x, run.player.y - a.y)
    m.distSum += d * STEP; if (d < 250) m.near += STEP
  }
  const p = run.player
  if ((Math.abs(p.vx - prevVx) > 500 || Math.abs(p.vy - prevVy) > 900 && !p.grounded) && m.time - m.lastHit > .6) { m.hits++; m.lastHit = m.time }
}
const summary = m => ({ firstSeen: m.firstSeen === null ? null : +m.firstSeen.toFixed(2), seen: +(m.seen / m.time).toFixed(3),
  idle: +(m.idle / m.time).toFixed(3), watching: +(m.watching / m.time).toFixed(3), longestIdle: +m.longestIdle.toFixed(2), longestStill: +m.longestStill.toFixed(2), hits: m.hits, near: +(m.near / m.time).toFixed(3),
  worst: m.longestIdle > 5 ? m.worst : undefined, meanDist: Math.round(m.distSum / m.time), shots: m.rbots.reduce((s, r) => s + (r.shots ?? 0), 0),
  shoves: m.rbots.reduce((s, r) => s + (r.actor?.shoves ?? 0), 0) })

function surveyLevel(file) {
  const level = readLevel(file), probe = createRun(level), graph = botNavigationGraph(probe, 1)
  const spots = graph.nodes.filter(n => !n.climb && !n.swim && !botWaterPoint(probe, n, 1) && Math.hypot(n.x - level.entrance.x, n.y - level.entrance.y) > 150)
  const chosen = Array.from({ length: Math.min(HIDERS, spots.length) }, (_, i) => spots[Math.floor((i + .5) * spots.length / HIDERS)])
  const hiders = chosen.map(spot => {
    const run = createRun(level), m = metrics(run)
    Object.assign(run.player, { x: spot.x, y: spot.y - 2, vx: 0, vy: 0 })
    for (let t = 0; t < SECONDS && !run.finished; t += STEP) {
      const vx = run.player.vx, vy = run.player.vy
      stepRun(run, NEUTRAL_INPUT); observe(m, run, vx, vy)
    }
    return { spot: [Math.round(spot.x), Math.round(spot.y)], ...summary(m) }
  })
  const run = createRun(level), m = metrics(run)
  const pilot = { definition: { kind: 'repulsor' }, actor: run.player, x: run.player.x, y: run.player.y, seesPlayer: false, facing: 1 }
  let target = null, retarget = 0, stuckAt = null, stuckTime = 0
  const skipped = new Set()
  for (let t = 0; t < RUNNER_SECONDS && !run.finished; t += STEP) {
    if ((retarget -= STEP) <= 0) {
      retarget = 1
      const p = run.player
      if (stuckAt && Math.hypot(p.x - stuckAt[0], p.y - stuckAt[1]) < 30) stuckTime++; else { stuckTime = 0; stuckAt = [p.x, p.y] }
      if (stuckTime >= 6 && target) { skipped.add(target.key); stuckTime = 0 }
      const left = run.pickups.flatMap((q, i) => q.collectedAge === null && !skipped.has(i) ? [{ x: q.definition.x, y: q.definition.y + 20, key: i }] : [])
      left.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      target = left[0] ?? (level.goal ? { x: level.goal.x, y: level.goal.y, key: 'goal' } : null)
    }
    pilot.x = run.player.x; pilot.y = run.player.y
    const input = target ? botMovement(run, pilot, STEP, target) : NEUTRAL_INPUT, vx = run.player.vx, vy = run.player.vy
    stepRun(run, input); observe(m, run, vx, vy)
  }
  const runner = { coins: run.coinsCollected, finished: run.finished, ...summary(m) }
  const found = hiders.filter(h => h.firstSeen !== null)
  return { file, name: level.name, hiders, runner, hiderFound: `${found.length}/${hiders.length}`,
    hiderMeanFind: found.length ? +(found.reduce((s, h) => s + h.firstSeen, 0) / found.length).toFixed(1) : null,
    hiderHit: hiders.filter(h => h.hits).length, hiderIdle: +(hiders.reduce((s, h) => s + h.idle, 0) / Math.max(1, hiders.length)).toFixed(3),
    hiderWatching: +(hiders.reduce((s, h) => s + h.watching, 0) / Math.max(1, hiders.length)).toFixed(3),
    hiderLongestIdle: Math.max(0, ...hiders.map(h => h.longestIdle)), hiderLongestStill: Math.max(0, ...hiders.map(h => h.longestStill)) }
}
const line = r => `${r.name.padEnd(20)} hiders found ${r.hiderFound} mean ${r.hiderMeanFind}s hit ${r.hiderHit} idle ${r.hiderIdle} watching ${r.hiderWatching} longest idle ${r.hiderLongestIdle}s still ${r.hiderLongestStill}s`
  + ` | runner coins ${r.runner.coins} first seen ${r.runner.firstSeen} seen ${r.runner.seen} idle ${r.runner.idle} longest ${r.runner.longestIdle}s still ${r.runner.longestStill}s hits ${r.runner.hits} shots ${r.runner.shots} shoves ${r.runner.shoves} near ${r.runner.near}`

function trace([file, x, y, seconds = 30, every = .5]) {
  const run = createRun(readLevel(file)), r = run.robots.find(robot => robot.definition.kind === 'repulsor')
  if (x !== '-') Object.assign(run.player, { x: +x, y: +y - 2, vx: 0, vy: 0 })
  const f = v => v === undefined ? '-' : Math.round(v)
  let next = 0
  for (let t = 0; t < +seconds; t += STEP) {
    stepRun(run, NEUTRAL_INPUT)
    if (t < next) continue
    next += +every
    const a = r.actor, plan = botLastTactic(r), memory = botLastSighting(r), route = botNavigationRoute(run, r)
    const holds = `${a?.grounded ? 'G' : ' '}${a?.climbing ? 'C' : ' '}${a?.hang ? 'H' : ' '}${a?.mantle ? 'M' : ' '}${a?.waterMotion ? 'W' : ' '}`
    console.log(`t${t.toFixed(1).padStart(5)} bot ${f(a?.x)},${f(a?.y)} v${f(a?.vx)},${f(a?.vy)} ${r.phase.padEnd(7)} ${r.seesPlayer ? 'SEE' : '   '} ${holds}`
      + ` | player ${f(run.player.x)},${f(run.player.y)} | plan ${plan ? `${plan.kind} ${f(plan.x)},${f(plan.y)}${plan.objective ? ` (${plan.objective.key})` : ''}` : '-'}`
      + ` | seen ${memory ? `${f(memory.x)},${f(memory.y)} @${memory.time.toFixed(1)}` : '-'} | route ${route ? `${f(route.goal.x)},${f(route.goal.y)} via ${route.waypoints.length}` : '-'}`)
  }
}

if (args.includes('--trace')) trace(args.slice(args.indexOf('--trace') + 1))
else if (opt('--level')) {
  const result = surveyLevel(opt('--level')), out = opt('--json')
  if (out) { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, `${result.file.replace(/\W+/g, '_')}.json`), JSON.stringify(result, null, 1)) }
  console.log(line(result))
} else {
  // Every campaign level with an Rbot, each in its own process.
  const catalog = JSON.parse(readFileSync(new URL('index.json', root), 'utf8')).levels
  const files = catalog.filter(file => (JSON.parse(readFileSync(new URL(file, root), 'utf8')).robots ?? []).some(robot => robot.kind === 'repulsor'))
  const self = fileURLToPath(import.meta.url), passed = args.filter(arg => arg !== '--all')
  const lines = await Promise.all(files.map(file => new Promise(resolve => {
    const child = spawn(process.execPath, [self, ...passed, '--level', file], { stdio: ['ignore', 'pipe', 'inherit'] })
    let text = ''; child.stdout.on('data', chunk => { text += chunk }); child.on('close', () => resolve(text.trim()))
  })))
  for (const text of lines) console.log(text)
}
