// Visual review of rope traversal. Runs in the browser against the live game
// modules: each case simulates real game steps from a set position and input
// script, then renders an enlarged filmstrip, an onion-skin overlay of the
// motion and per-frame measurements. Import from a page served by Vite.
import { createRun, stepRun } from '/src/games/jumping/challenge.ts'
import { entranceDuration } from '/src/games/jumping/goal.ts'
import { NEUTRAL_INPUT, STEP } from '/src/games/jumping/model.ts'
import { blankTrial, levelTerrain, parseLevel, prepareLevelRopes } from '/src/games/jumping/level.ts'
import { ropePath, ropeSegmentCount } from '/src/games/jumping/climbables.ts'
import { bodyIntersects, polygonPoints } from '/src/games/jumping/geometry.ts'
import { athletePose, drawAthlete } from '/src/games/jumping/athlete.ts'
import { mechanismShape } from '/src/games/jumping/mechanisms.ts'
import { UPPER_ARM, FOREARM, HEAD_RADIUS } from '/src/games/jumping/athleteRig.ts'

const room = (extra = {}) => ({ ...blankTrial(), width: 2400, height: 1400, floor: 1400, entrance: { x: 100, y: 1400 }, goal: { x: 2300, y: 1400 }, ...extra })
const ropes = list => ({ ladders: [], ropes: list })
const pillars = (left, right, top) => [{ x: left - 200, y: top, w: 200, h: 1400 - top }, { x: right, y: top, w: 200, h: 1400 - top }]
const tied = (x, y, ex, ey, length, extra = {}) => ({ x, y, length, segments: ropeSegmentCount(length), end: { x: ex, y: ey }, ...extra })
const hang = (x, y, length) => ({ x, y, length, segments: ropeSegmentCount(length) })
const at = (x, y, facing = 1, extra = {}) => run => Object.assign(run.player, { x, y, facing, grounded: false, vx: 0, vy: 0, ...extra })
const lowest = rope => rope.rest.points.reduce((a, b) => b[1] > a[1] ? b : a)
/** Hold Up for a moment in the air beside a rope to catch it, then settle into the hang. */
const catchAndSettle = [[{ climb: true }, 20], [{}, 60]]

/**
 * Each case: what the robot should do, a level, a starting position, an input
 * script of [input, frames] steps, and which stretch of frames to review.
 */
export const CASES = [
  { id: 'hang-catch', title: 'Catch a hanging rope in flight and come to rest',
    expect: 'Flying sideways into a hanging rope with Up held, the robot grabs it with both hands and swings to rest hanging below its hands by its arms alone, legs relaxed.',
    level: () => room({ climbables: ropes([hang(600, 300, 600)]) }), setup: at(530, 700, 1, { vx: 220, vy: -120 }),
    script: [[{ climb: true }, 30], [{}, 90]], review: [0, 120] },
  { id: 'hang-climb-up', title: 'Climb up a hanging rope',
    expect: 'Holding Up, the robot climbs a vertical rope hand over hand with its arms only (no feet on the rope), body hanging below its hands, seen side-on, rising at a steady pace while the hands alternate.',
    level: () => room({ climbables: ropes([hang(600, 200, 800)]) }), setup: at(590, 860),
    script: [...catchAndSettle, [{ climb: true }, 150]], review: [100, 230] },
  { id: 'hang-climb-down', title: 'Climb down a hanging rope',
    expect: 'Holding Down, the robot lowers itself hand under hand, arms only, body hanging, at a steady pace.',
    level: () => room({ climbables: ropes([hang(600, 200, 800)]) }), setup: at(590, 560),
    script: [...catchAndSettle, [{ descend: true }, 120]], review: [100, 200] },
  { id: 'hang-up-down', title: 'Climb up, then straight back down',
    expect: 'Climbing up a hanging rope, then reversing to climb down. On the reversal the top hand should let go and re-grip below the other (hand under hand), never playing the climb backwards. The climb may turn the robot partly or fully away from the camera at times.',
    level: () => room({ climbables: ropes([hang(600, 200, 800)]) }), setup: at(590, 860),
    script: [...catchAndSettle, [{ climb: true }, 120], [{ descend: true }, 140]], review: [140, 340] },
  { id: 'tied-start-both-ways', title: 'Set off along a tied rope from rest, left then right',
    expect: 'From a still hang in the middle of a slack tied rope: shimmy left, stop, then shimmy right. Each start should lead with the hand in the direction of travel; each reversal should turn the body (through a front view) to face the new way. Nothing should look like moving backwards.',
    level: () => room({ platforms: pillars(800, 1400, 700), climbables: ropes([tied(800, 700, 1400, 700, 680)]) }), setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0], low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: -1 }, 80], [{}, 40], [{ move: 1 }, 120]], review: [70, 320] },
  { id: 'hang-stop-start', title: 'Stop and start while climbing',
    expect: 'Climbing up, pausing (hands come together on one grip, a calm hang), then climbing again. Transitions should be smooth with no pops.',
    level: () => room({ climbables: ropes([hang(600, 200, 800)]) }), setup: at(590, 900),
    script: [...catchAndSettle, [{ climb: true }, 60], [{}, 45], [{ climb: true }, 60]], review: [100, 245] },
  { id: 'hang-swing', title: 'Pump a swing on a hanging rope',
    expect: 'Hanging by the arms, the robot pumps Left and Right in time to build a swing. The body should lead and trail naturally with the arc; hands stay on the rope.',
    level: () => room({ climbables: ropes([hang(600, 200, 500)]) }), setup: at(590, 700),
    script: [...catchAndSettle, ...Array.from({ length: 6 }, (_, i) => [{ move: i % 2 ? -1 : 1 }, 40])], review: [120, 320] },
  { id: 'hang-swing-jump', title: 'Jump off a swinging rope',
    expect: 'After building a swing, the robot lets go with a jump at the forward end of the arc and flies on in a natural launch pose.',
    level: () => room({ climbables: ropes([hang(600, 200, 500)]) }), setup: at(590, 700),
    script: [...catchAndSettle, ...Array.from({ length: 5 }, (_, i) => [{ move: i % 2 ? -1 : 1 }, 40]), [{ move: 1, jump: true }, 8], [{ move: 1 }, 40]], review: [250, 330] },
  { id: 'ledge-pull-up', title: 'Climb a rope to a ledge and pull up onto it',
    expect: 'A rope hangs from the corner of a high ledge. Holding Up, the robot climbs by its arms and then pulls itself up and over onto the ledge in one continuous motion.',
    level: () => room({ platforms: [{ x: 600, y: 600, w: 500, h: 40 }], climbables: ropes([hang(600, 600, 260)]) }), setup: at(590, 870, 1),
    script: [...catchAndSettle, [{ climb: true }, 460]], review: [80, 540] },
  { id: 'wall-climb', title: 'Climb a rope hanging down a wall face',
    expect: 'A rope hangs from the top of a cliff down its face. The robot climbs it by its arms, hanging just clear of the wall (or bracing its feet on the wall), without passing into the rock, and steps up onto the top.',
    level: () => room({ platforms: [{ x: 700, y: 500, w: 800, h: 900 }], climbables: ropes([{ ...hang(700, 500, 350), anchor: { platform: 0, x: 0, y: 0 } }]) }), setup: at(670, 820, 1),
    script: [...catchAndSettle, [{ climb: true }, 520]], review: [80, 600] },
  { id: 'wall-rappel', title: 'Lower down a rope against a wall',
    expect: 'Holding Down on a rope against a cliff face, the robot lowers itself, feet bracing on the wall (a rappel) or hanging clear, steadily and without jitter.',
    level: () => room({ platforms: [{ x: 700, y: 500, w: 800, h: 900 }], climbables: ropes([{ ...hang(700, 500, 700), anchor: { platform: 0, x: 0, y: 0 } }]) }), setup: at(670, 700, 1),
    script: [...catchAndSettle, [{ descend: true }, 180]], review: [80, 260] },
  { id: 'overhang-around', title: 'Swing around a thick overhang and climb onto it',
    expect: 'The rope hangs from the outer corner of a thick overhang. The robot is blocked climbing straight up into its underside, swings outward and climbs around the edge onto the top, never passing through the rock.',
    level: () => room({ platforms: [{ x: 800, y: 600, w: 600, h: 80 }], climbables: ropes([hang(800, 600, 300)]) }), setup: at(790, 830, 1),
    script: [...catchAndSettle, [{ climb: true }, 100], [{ move: -1 }, 60], [run => ({ climb: true, move: run.player.climbing ? -1 : 0 }), 300]], review: [80, 540] },
  { id: 'tied-slack-shimmy', title: 'Shimmy along a slack rope tied between two pillars',
    expect: 'Hanging from the sagging middle, holding Right, the robot moves hand over hand along the rope, seen side-on, body hanging and gliding smoothly while the hands alternate; legs swing slightly.',
    level: () => room({ platforms: pillars(800, 1400, 700), climbables: ropes([tied(800, 700, 1400, 700, 680)]) }), setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0] - 120, low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 150]], review: [80, 230] },
  { id: 'tied-reverse', title: 'Reverse direction mid-shimmy',
    expect: 'Shimmying right, then left. The turn should be quick but not jarring: the robot turns to face its new direction and the hands change lead naturally.',
    level: () => room({ platforms: pillars(800, 1400, 700), climbables: ropes([tied(800, 700, 1400, 700, 680)]) }), setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0], low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 60], [{ move: -1 }, 80]], review: [110, 220] },
  { id: 'tied-taut', title: 'Shimmy along a taut horizontal rope',
    expect: 'The rope is tied tight between two pillars, barely sagging under the robot. It shimmies hand over hand along it, side-on, smoothly, to near the far anchor.',
    level: () => room({ platforms: pillars(800, 1400, 700), climbables: ropes([tied(800, 700, 1400, 700, 600)]) }), setup: at(1130, 770),
    script: [...catchAndSettle, [{ move: 1 }, 380]], review: [80, 460] },
  { id: 'tied-u-climb', title: 'Follow a deep U-shaped rope up one side',
    expect: 'A long rope tied between two close anchors hangs in a deep U. From the bottom, Right carries the robot along and up the gentler part, then Up climbs the steep side to the anchor, arms only throughout, with no sudden change of pose between the two.',
    level: () => room({ platforms: pillars(900, 1060, 500), climbables: ropes([tied(900, 500, 1060, 500, 520)]) }), setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0] - 10, low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 90], [{ climb: true }, 420]], review: [80, 590] },
  { id: 'tied-onto-pillar', title: 'Shimmy to an anchor and climb onto the pillar',
    expect: 'Shimmying right to the anchor at the top of a pillar, then Up: the robot pulls itself up onto the pillar top in one continuous motion.',
    level: () => room({ platforms: pillars(800, 1400, 700), climbables: ropes([tied(800, 700, 1400, 700, 680)]) }), setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0] + 100, low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 260], [{ climb: true }, 240]], review: [250, 580] },
  { id: 'tied-sloped', title: 'Shimmy up a rope tied between a low and a high anchor',
    expect: 'A rope tied from a low ledge up to a higher one at about 25 degrees. Holding Right, the robot moves hand over hand up the slope, side-on, at an even pace.',
    level: () => room({ platforms: [{ x: 500, y: 900, w: 300, h: 500 }, { x: 1300, y: 600, w: 300, h: 800 }], climbables: ropes([tied(800, 900, 1300, 600, 640)]) }),
    setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0], low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 200]], review: [80, 280] },
  { id: 'tied-run', title: 'Hold Right along a long rope: build from a careful shimmy into a swinging run, then stop',
    expect: 'Holding Right, the robot sets off with the careful hand over hand, then after about half a second builds into a swinging run like an orangutan: long reaches, the body swinging like a pendulum beneath each hand, fastest as it passes under the hand, legs trailing and swinging. It should read as graceful, natural and fun. Letting go, it slows into the careful gait and settles.',
    level: () => room({ platforms: pillars(500, 1900, 600), climbables: ropes([tied(500, 620, 1900, 620, 1440)]) }), setup: run => { const near = run.level.climbables.ropes[0].rest.points.reduce((a, b) => Math.abs(b[0] - 760) < Math.abs(a[0] - 760) ? b : a); at(near[0], near[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 480], [{}, 150]], review: [70, 700] },
  { id: 'tied-wall-anchor', title: 'Shimmy up a sloped rope to its anchor on a wall face, press on, then rest',
    expect: 'The robot shimmies up the rope to where it is tied partway up a wall. Arriving, its feet plant flat on the wall and stay planted, without jitter, whether it keeps pressing toward the wall or rests; the legs never shake.',
    level: () => room({ platforms: pillars(700, 1300, 400), climbables: ropes([tied(700, 820, 1300, 640, 640)]) }), setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0], low[1] + 50)(run) },
    script: [...catchAndSettle, [{ move: 1 }, 900], [{}, 150], [{ move: 1 }, 90]], review: [700, 1220] },
  { id: 'tied-release', title: 'Hold on as one anchor of a tied rope lets go',
    expect: 'The robot hangs on a slack tied rope. A switch releases the left anchor: the rope swings down from the right anchor with the robot still holding on, swinging naturally, then settles hanging.',
    level: () => room({ platforms: pillars(800, 1400, 500), climbables: ropes([tied(800, 500, 1400, 500, 680, { release: { id: 'drop', anchor: 'start' } })]),
      triggers: [{ x: 2100, y: 1400, w: 80, mode: 'weight', behavior: 'toggle', targets: ['drop'] }] }),
    setup: run => { const low = lowest(run.level.climbables.ropes[0]); at(low[0] - 10, low[1] + 50)(run) },
    script: [...catchAndSettle, [{}, 10], ['release', 1], [{}, 200]], review: [85, 290] },
  { id: 'gate-climb', title: 'Climb a rope from inside a window beside an open gate',
    expect: 'Crouched in a window of a tower, the robot takes the rope that runs down the tower face and climbs up it by its arms, rising steadily and staying outside the walls.',
    level: async () => parseLevel(await (await fetch('/tests/fixtures/jumping/rope-window-gate.json')).json()), setup: () => {},
    script: [[{ move: -.6, crouch: true, descend: true }, 160], [{ climb: true }, 360]], review: [150, 520] },
]

function landmarks(p) {
  const pose = athletePose(p), w = point => [p.x + point[0] * p.facing, p.y + point[1]]
  const limbs = [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]
  return { pose, points: [pose.head, pose.shoulder, pose.hip, ...limbs.flatMap(l => [l.root, l.joint, l.end])].map(w), mode: p.climbing ? 'rope' : p.hang ? 'hang' : p.mantle ? 'mantle' : 'free', hands: [w(pose.frontArm.end), w(pose.backArm.end)],
    arms: [pose.frontArm, pose.backArm].map(arm => Math.hypot(arm.end[0] - arm.root[0], arm.end[1] - arm.root[1])) }
}
// A turn swaps which arm and leg are in front; judge each pair either way round.
const PART_NAMES = ['head', 'shoulder', 'hip', 'front arm', 'front elbow', 'front hand', 'back arm', 'back elbow', 'back hand', 'front hip', 'front knee', 'front foot', 'back hip', 'back knee', 'back foot']
function pairJumps(a, b) {
  const d = (i, j) => Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1])
  const out = [d(0, 0), d(1, 1), d(2, 2)]
  for (const start of [3, 9]) {
    const same = [0, 1, 2].map(k => Math.max(d(start + k, start + k), d(start + 3 + k, start + 3 + k)))
    const swap = [0, 1, 2].map(k => Math.max(d(start + k, start + 3 + k), d(start + 3 + k, start + k)))
    const use = Math.max(...same) <= Math.max(...swap) ? 'same' : 'swap'
    for (const k of [0, 1, 2]) out.push(use === 'same' ? d(start + k, start + k) : d(start + k, start + 3 + k))
    for (const k of [0, 1, 2]) out.push(use === 'same' ? d(start + 3 + k, start + 3 + k) : d(start + 3 + k, start + k))
  }
  return out
}
const jointJump = (a, b) => Math.max(...pairJumps(a, b))
const jumpPart = (a, b) => { const j = pairJumps(a, b); return PART_NAMES[j.indexOf(Math.max(...j))] }
function gapToPath(path, [x, y]) {
  let best = Infinity
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i], dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
  }
  return best
}
const percentile = (values, q) => { if (!values.length) return null; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }

async function simulate(spec) {
  const level = prepareLevelRopes(parseLevel(await spec.level()))
  const run = createRun(level)
  stepRun(run, NEUTRAL_INPUT, entranceDuration(run.entrance))
  run.started = true
  spec.setup(run)
  const frames = [], terrain = levelTerrain(level)
  let frame = 0, previous = null
  const record = () => {
    const p = run.player, inReview = frame >= spec.review[0] && frame <= spec.review[1]
    if (!inReview) { frame++; return }
    // Hands are measured against the rope once a catch has carried them onto it.
    const marks = landmarks(p), rope = p.climbing && p.climbing.time >= .16 ? p.climbing.rope : null
    const path = rope ? ropePath(rope.definition, rope) : null
    frames.push({ frame, player: structuredClone(p), ropes: (p.ropes ?? []).map(r => ropePath(r.definition, r)),
      mechanisms: run.mechanisms.map(m => mechanismShape(m)),
      metrics: { climbing: !!p.climbing, mode: p.climbing ? 'rope' : p.hang ? 'ledge hang' : p.mantle ? 'pull-up' : p.grounded ? 'ground' : 'air',
        handGaps: path ? marks.hands.map(h => gapToPath(path, h)) : null, arms: marks.arms,
        jump: previous ? jointJump(previous, marks.points) : 0, jumpAt: previous ? jumpPart(previous, marks.points) : null,
        root: [p.x, p.y], inside: terrain.some(b => bodyIntersects(p.x, p.y + 1e-4, b)) && !p.mantle && !p.grounded,
        sideView: marks.pose.sideView, hang: p.climbing?.hangBlend ?? null, travel: p.climbing?.shimmyBlend ?? null,
        // How far the rope reaches into the head: positive where it overlaps.
        headOverlap: path ? HEAD_RADIUS - gapToPath(path, [p.x + marks.pose.head[0] * p.facing, p.y + marks.pose.head[1]]) : null,
        // The way the robot faces on screen: a swing turns it toward its lean.
        facing: p.climbing && Math.abs(p.climbing.lean) > .05 ? Math.sign(p.climbing.lean) : p.facing } })
    previous = marks.points; frame++
  }
  for (const [input, count] of spec.script) {
    for (let i = 0; i < count; i++) {
      if (input === 'release') run.triggers[0].active = true
      stepRun(run, { ...NEUTRAL_INPUT, ...(input === 'release' ? {} : typeof input === 'function' ? input(run) : input) })
      record()
    }
  }
  return { level, terrain, frames }
}

function drawScene(ctx, terrain, shot, mechanisms) {
  ctx.fillStyle = '#5f6b66'
  for (const b of [...terrain, ...mechanisms]) {
    const points = b.polygon || b.profile ? polygonPoints(b) : [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
    ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill()
  }
  ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  for (const path of shot.ropes) { ctx.beginPath(); path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke() }
}

function summarize(frames) {
  const m = frames.map(f => f.metrics), rope = m.filter(x => x.handGaps)
  const roots = frames.map(f => f.metrics.root), speeds = roots.slice(1).map((r, i) => Math.hypot(r[0] - roots[i][0], r[1] - roots[i][1]) / STEP)
  const moving = speeds.filter(s => s > 15), mean = moving.reduce((a, b) => a + b, 0) / (moving.length || 1)
  return {
    frames: frames.length, modes: [...new Set(m.map(x => x.mode))],
    largestJointJumpPerFrame: +Math.max(...m.map(x => x.jump)).toFixed(2),
    largestJumpAt: (() => { const i = m.reduce((best, x, k) => x.jump > m[best].jump ? k : best, 0); return `${m[i].jumpAt} at ${((frames[i].frame - frames[0].frame) * STEP * 1000).toFixed(0)} ms (${m[i].mode})` })(),
    jointJump95th: +percentile(m.map(x => x.jump), .95).toFixed(2),
    nearestHandGapMax: rope.length ? +Math.max(...rope.map(x => Math.min(...x.handGaps))).toFixed(2) : null,
    fartherHandGap95th: rope.length ? +percentile(rope.map(x => Math.max(...x.handGaps)), .95).toFixed(2) : null,
    armOverreachFrames: m.filter(x => x.arms.some(a => a > UPPER_ARM + FOREARM + .5)).length,
    bodyInsideTerrainFrames: m.filter(x => x.inside).length,
    movingSpeedMean: +mean.toFixed(1),
    movingSpeedVariation: moving.length > 4 ? +(Math.sqrt(moving.reduce((a, b) => a + (b - mean) ** 2, 0) / moving.length) / mean).toFixed(2) : null,
    sideViewWhileTraveling: rope.some(x => x.travel > .9) ? +Math.min(...rope.filter(x => x.travel > .9).map(x => x.sideView)).toFixed(2) : null,
    // Seen side-on the rope must pass clear of the head; from behind, it hangs in front of the body.
    headRopeOverlapFrames: rope.filter(x => x.sideView > .5 && x.headOverlap > 0).length,
    headRopeOverlapMax: rope.length ? +Math.max(0, ...rope.filter(x => x.sideView > .5).map(x => x.headOverlap)).toFixed(1) : null,
    // Frames seen side-on on a rope while the body moves the opposite way to the one it faces.
    backwardFrames: m.filter((x, i) => i && x.handGaps && x.sideView > .5 && Math.abs(roots[i][0] - roots[i - 1][0]) / STEP > 15 && Math.sign(roots[i][0] - roots[i - 1][0]) === -x.facing).length,
    netMovement: frames.length ? [+(roots.at(-1)[0] - roots[0][0]).toFixed(1), +(roots.at(-1)[1] - roots[0][1]).toFixed(1)] : null,
  }
}

/** Render one case: a 5x2 filmstrip and an onion-skin overlay, as PNG data URLs. */
function render(spec, { terrain, frames }) {
  const picks = Array.from({ length: Math.min(10, frames.length) }, (_, i) => frames[Math.round(i * (frames.length - 1) / Math.max(1, Math.min(10, frames.length) - 1))])
  const strip = document.createElement('canvas'); strip.width = 1500; strip.height = 760
  const ctx = strip.getContext('2d'); ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, strip.width, strip.height)
  ctx.fillStyle = '#30423a'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(spec.title, 14, 24)
  for (const [i, shot] of picks.entries()) {
    const x = i % 5 * 300, y = 36 + Math.floor(i / 5) * 362, p = shot.player
    ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y, 296, 358); ctx.clip()
    ctx.fillStyle = '#e4e7e1'; ctx.fillRect(x + 2, y, 296, 358)
    ctx.translate(x + 150, y + 200); ctx.scale(2.4, 2.4); ctx.translate(-p.x, -(p.y - 40))
    drawScene(ctx, terrain, shot, shot.mechanisms); drawAthlete(ctx, p); ctx.restore()
    ctx.fillStyle = '#30423a'; ctx.font = '13px sans-serif'
    ctx.fillText(`${((shot.frame - frames[0].frame) * STEP * 1000).toFixed(0)} ms · ${shot.metrics.mode}`, x + 10, y + 350)
  }
  const onion = document.createElement('canvas'); onion.width = 900; onion.height = 700
  const o = onion.getContext('2d'); o.fillStyle = '#f1f2ef'; o.fillRect(0, 0, onion.width, onion.height)
  const xs = frames.map(f => f.player.x), ys = frames.map(f => f.player.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2 - 35
  const span = Math.max(Math.max(...xs) - Math.min(...xs) + 120, (Math.max(...ys) - Math.min(...ys) + 160) * 900 / 700)
  const zoom = Math.min(3, 880 / span)
  o.save(); o.translate(450, 360); o.scale(zoom, zoom); o.translate(-cx, -cy)
  drawScene(o, terrain, frames.at(-1), frames.at(-1).mechanisms)
  const trail = Array.from({ length: 12 }, (_, i) => frames[Math.round(i * (frames.length - 1) / 11)])
  for (const [i, shot] of trail.entries()) { o.globalAlpha = .12 + .88 * (i / 11) ** 2; drawAthlete(o, shot.player) }
  o.globalAlpha = 1; o.restore()
  o.fillStyle = '#30423a'; o.font = 'bold 16px sans-serif'; o.fillText(`${spec.title} · motion overlay (faint = earlier)`, 12, 22)
  return { filmstrip: strip.toDataURL('image/png'), onion: onion.toDataURL('image/png') }
}

export async function renderRopeReview(ids) {
  const results = []
  for (const spec of CASES.filter(c => !ids || ids.includes(c.id))) {
    try {
      const simulated = await simulate(spec)
      results.push({ id: spec.id, title: spec.title, expect: spec.expect, metrics: summarize(simulated.frames), ...render(spec, simulated) })
    } catch (error) { results.push({ id: spec.id, title: spec.title, expect: spec.expect, error: String(error?.stack ?? error) }) }
  }
  return results
}
