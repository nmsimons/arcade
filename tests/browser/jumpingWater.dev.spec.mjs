import { test, expect } from './helpers/test.mjs'

test('water hands stay outside small balls while floating, pushing and releasing on either side', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { athletePose, drawAthlete, handOutline } = await import('/src/games/jumping/athlete.ts')
    const { drawProp } = await import('/src/games/jumping/challengeRender.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-hand-review'; canvas.width = 1440; canvas.height = 640
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = [], scale = 3
    for (const [row, side] of [1, -1].entries()) {
      const edge = side > 0 ? 640 : 1160
      const run = createRun({ ...blankTrial(), spawn: { x: edge - side * 52, y: 450.34 },
        props: [{ kind: 'ball', x: edge - side * 20, y: 420, size: 40 }],
        platforms: [{ x: side > 0 ? edge : 0, y: 380, w: 1160, h: 540 }],
        gravityPlates: [{ id: 'water', x: side > 0 ? 200 : edge, y: 400, w: 440, h: 520, effect: 'water', gravity: -1, power: 'always' }] })
      run.started = true; run.player.grounded = false; run.player.coyote = 0; run.player.facing = side
      const advance = (seconds, input = {}) => { for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }, STEP) }
      const capture = (col, label) => {
        const p = run.player, b = run.props[0], pose = athletePose(p), ox = col * 360, oy = row * 320, anchor = side > 0 ? 135 : 225
        ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, 360, 320); ctx.clip()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(ox, oy, 360, 320)
        ctx.save(); ctx.translate(ox + anchor - p.x * scale, oy + 95 - 400 * scale); ctx.scale(scale, scale)
        for (const bank of run.level.platforms) { ctx.fillStyle = '#858a8d'; ctx.fillRect(bank.x, bank.y, bank.w, bank.h) }
        drawProp(ctx, b); drawAthlete(ctx, p); ctx.restore()
        ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(ox, oy + 95, 360, 225); ctx.globalAlpha = 1
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(ox, oy, 360, 30); ctx.fillStyle = '#43494b'; ctx.font = '14px sans-serif'; ctx.fillText(label, ox + 12, oy + 21)
        ctx.strokeStyle = '#ddd'; ctx.strokeRect(ox, oy, 360, 320); ctx.restore()
        let clearance = Infinity
        for (const arm of [pose.frontArm, pose.backArm]) for (const point of handOutline(arm)) {
          clearance = Math.min(clearance, Math.hypot(p.x + point[0] * p.facing - b.x, p.y + point[1] - (b.y - b.size / 2)) - b.size / 2)
        }
        samples.push({ label, clearance, pushing: p.pushing?.amount ?? 0, backView: pose.backView ?? 0 })
      }
      advance(5); capture(0, 'Rest beside ball')
      advance(.95); capture(1, 'Rest / gentle scull')
      advance(1, { move: side }); capture(2, 'Swim and push')
      advance(.25); capture(3, 'Release contact')
    }
    return samples
  })
  for (const sample of samples) { expect(sample.clearance, sample.label).toBeGreaterThan(-.01); expect(sample.backView).toBe(0) }
  for (const sample of samples.filter(s => s.label === 'Swim and push')) expect(sample.pushing).toBeGreaterThan(.5)
  await page.locator('#water-hand-review').screenshot({ path: info.outputPath('water-ball-hands.png') })
})

test('water pose contact sheet keeps floating side-on and coordinates the breaststroke', async ({ page }, info) => {
  await page.goto('/')
  const poses = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-review'; canvas.width = 1250; canvas.height = 1080
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = []
    const field = createGravityField(), swimmer = createPlayer({ x: 500, y: 650 }); swimmer.grounded = false; swimmer.coyote = 0
    updateGravityField(field, [{ id: 'water', x: 0, y: 400, w: 5000, h: 520, effect: 'water', gravity: -1, power: 'always' }], new Map(), true)
    for (let i = 0; i < 600; i++) stepPlayer(swimmer, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, field)
    const transition = [{ label: 'Float right', amount: 0, row: 0, col: 0, phase: 0, rootY: swimmer.y, player: structuredClone(swimmer) }]
    for (let i = 0; i < 100; i++) {
      stepPlayer(swimmer, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
      if ([23, 47, 83].includes(i)) transition.push({ label: ['Start swimming', 'Lean into swim', 'Finish transition'][transition.length - 1],
        ...swimmer.waterMotion, row: 0, col: transition.length, rootY: swimmer.y, player: structuredClone(swimmer) })
    }
    for (let i = 0; i < 200; i++) stepPlayer(swimmer, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
    const turning = []
    for (let i = 0; i < 165; i++) {
      stepPlayer(swimmer, { ...NEUTRAL_INPUT, move: -1 }, STEP, [], undefined, undefined, undefined, field)
      if ([0, 29, 65, 95, 164].includes(i)) turning.push({ label: ['Reverse input', 'Gather / brake', 'Tucked turn', 'Extend left', 'Swim left'][turning.length],
        ...swimmer.waterMotion, row: 3, col: turning.length, rootY: swimmer.y, player: structuredClone(swimmer) })
    }
    const states = [
      ...transition, { label: 'Float left', amount: 0, facing: -1, row: 0, col: 4, phase: 0 },
      ...[0, .3, .5, .65, .9].map((cycle, i) => ({ label: ['Extension / glide', 'Arm outsweep', 'Insweep / leg recovery', 'Forward reach / kick', 'Glide'][i], amount: 1, row: 1, col: i, phase: cycle * Math.PI * 2 })),
      ...[0, .3, .5, .65, .9].map((cycle, i) => ({ label: ['Dive / glide', 'Dive / pull', 'Dive / recovery', 'Dive / kick', 'Dive / glide'][i], amount: 1, dive: 1, row: 2, col: i, phase: cycle * Math.PI * 2 })),
      ...turning,
    ]
    for (const state of states) {
      const p = state.player ?? createPlayer({ x: 0, y: 0 }); p.x = 0; p.y = 0; p.grounded = false
      if (!state.player) {
        p.facing = state.facing ?? 1; p.vx = state.dive ? 0 : state.amount * 110; p.vy = state.dive ? 100 : 0
        p.waterMotion = { amount: state.amount, dive: state.dive ?? 0, phase: state.phase }
      }
      const pose = athletePose(p), root = state.dive ? 235 : 65 + ((state.rootY ?? (400 + 50.34 * (1 - state.amount) + 8.36 * state.amount)) - 400) * 3
      ctx.save(); ctx.beginPath(); ctx.rect(state.col * 250, state.row * 270, 250, 270); ctx.clip()
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(state.col * 250, state.row * 270, 250, 270)
      ctx.save(); ctx.translate(state.col * 250 + 125, state.row * 270 + root); ctx.scale(3, 3); drawAthlete(ctx, p); ctx.restore()
      ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(state.col * 250, state.row * 270 + (state.dive ? 32 : 65), 250, 238); ctx.globalAlpha = 1
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(state.col * 250, state.row * 270, 250, 30)
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#43494b'; ctx.fillText(state.label, state.col * 250 + 12, state.row * 270 + 20)
      ctx.strokeStyle = '#ddd'; ctx.strokeRect(state.col * 250, state.row * 270, 250, 270); ctx.restore()
      samples.push({ label: state.label, head: pose.head, shoulder: pose.shoulder, frontArm: pose.frontArm, backArm: pose.backArm, backView: pose.backView ?? 0 })
    }
    return samples
  })
  for (const pose of poses) expect(pose.backView).toBe(0)
  expect(poses[0].frontArm.joint[1]).toBeGreaterThan(poses[0].shoulder[1])
  expect(poses[0].backArm.joint[1]).toBeGreaterThan(poses[0].shoulder[1])
  await page.locator('#water-review').screenshot({ path: info.outputPath('water-poses.png') })
})

test('water floor contact keeps planted legs while the arms work against buoyancy', async ({ page }, info) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const field = createGravityField(), p = createPlayer({ x: 500, y: 650 }), floor = [{ x: 0, y: 920, w: 1800, h: 80 }]
    updateGravityField(field, [{ id: 'water', x: 0, y: 400, w: 1800, h: 520, effect: 'water', gravity: -1, power: 'always' }], new Map(), true)
    p.grounded = false; p.coyote = 0
    const canvas = document.createElement('canvas'); canvas.id = 'water-floor'; canvas.width = 1250; canvas.height = 540
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; const ctx = canvas.getContext('2d')
    const draw = (label, col, row) => {
      const source = structuredClone(p); source.x = 0; source.y = 0; source.terrain = []
      if (source.footwork) {
        source.footwork.terrain = [{ x: -1000, y: 0, w: 2000, h: 80 }]
        for (const f of source.footwork.feet) { f.x -= p.x; f.anchorX -= p.x; f.y -= p.y; f.anchorY -= p.y; f.groundY -= p.y }
      }
      const root = 245 - (920 - p.y) * 3
      ctx.save(); ctx.beginPath(); ctx.rect(col * 250, row * 270, 250, 270); ctx.clip()
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(col * 250, row * 270, 250, 270)
      ctx.save(); ctx.translate(col * 250 + 125, row * 270 + root); ctx.scale(3, 3); drawAthlete(ctx, source); ctx.restore()
      ctx.globalAlpha = .35; ctx.fillStyle = '#58a9df'; ctx.fillRect(col * 250, row * 270, 250, 245); ctx.globalAlpha = 1
      ctx.fillStyle = '#858a8d'; ctx.fillRect(col * 250, row * 270 + 245, 250, 25)
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(col * 250, row * 270, 250, 30)
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#43494b'; ctx.fillText(label, col * 250 + 12, row * 270 + 20)
      ctx.strokeStyle = '#ddd'; ctx.strokeRect(col * 250, row * 270, 250, 270); ctx.restore()
    }
    const advance = (n, input) => { for (let i = 0; i < n; i++) stepPlayer(p, input, STEP, floor, undefined, undefined, undefined, field) }
    advance(600, { ...NEUTRAL_INPUT, descend: true })
    p.waterMotion.hold = 0
    for (let i = 0; i < 5; i++) { draw(['Stand / palms low', 'Stand / upward push', 'Stand / recovery', 'Stand / repeat', 'Stand / push'][i], i, 0); advance(30, { ...NEUTRAL_INPUT, descend: true }) }
    advance(60, { ...NEUTRAL_INPUT, descend: true, crouch: true })
    for (let i = 0; i < 4; i++) { draw(['Crouch / hold down', 'Crouch / push', 'Crouch / recovery', 'Crouch / repeat'][i], i, 1); advance(30, { ...NEUTRAL_INPUT, descend: true, crouch: true }) }
    advance(24, NEUTRAL_INPUT); draw('Release / float up', 4, 1)
  })
  await page.locator('#water-floor').screenshot({ path: info.outputPath('water-floor-poses.png') })
})

test('water approach lifts the head and leads into the pool lip with the hands', async ({ page }, info) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const run = createRun({ ...blankTrial(), spawn: { x: 650, y: 450.34 }, platforms: [{ x: 850, y: 400, w: 950, h: 520 }],
      gravityPlates: [{ id: 'water', x: 450, y: 400, w: 400, h: 520, effect: 'water', gravity: -1, power: 'always' }] })
    run.started = true; run.player.grounded = false; run.player.coyote = 0
    const canvas = document.createElement('canvas'); canvas.id = 'water-lip'; canvas.width = 1250; canvas.height = 300
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; const ctx = canvas.getContext('2d')
    let col = 0
    const draw = label => {
      const p = run.player, surface = col === 4 ? 225 : 100, edge = col === 0 ? 230 : col === 4 ? 130 : 190, originX = col * 250
      ctx.save(); ctx.beginPath(); ctx.rect(originX, 0, 250, 300); ctx.clip()
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, 0, 250, 300)
      ctx.fillStyle = '#858a8d'; ctx.fillRect(originX + edge, surface, 60, 200)
      ctx.save(); ctx.translate(originX + edge - 850 * 3, surface - 400 * 3); ctx.scale(3, 3); drawAthlete(ctx, p); ctx.restore()
      ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(originX, surface, edge, 200); ctx.globalAlpha = 1
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, 0, 250, 30)
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#43494b'; ctx.fillText(label, originX + 12, 20)
      ctx.strokeStyle = '#ddd'; ctx.strokeRect(originX, 0, 250, 300); ctx.restore(); col++
    }
    for (let i = 0; i < 360 && col < 4; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
      const gap = 850 - run.player.x
      if (col === 0 && gap < 55) draw('Gather before the edge')
      else if (col === 1 && gap < 43) draw('Head up / hands reach')
      else if (col === 2 && gap < 25 && !run.player.hang) draw('Hands lead the catch')
      else if (col === 3 && run.player.hang?.time > .15) draw('Grip / ready to pull')
    }
    for (let i = 0; i < 180; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    draw('Pull onto the bank')
  })
  await page.locator('#water-lip').screenshot({ path: info.outputPath('water-ledge-approach.png') })
})

test('water pushing keeps palms on floats and kicks through recovery extension and glide', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const { drawProp } = await import('/src/games/jumping/challengeRender.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-pushing'; canvas.width = 1800; canvas.height = 900
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; const ctx = canvas.getContext('2d'), samples = []
    const modes = [{ kind: 'box', direction: 1 }, { kind: 'ball', direction: -1 }, { kind: 'box', direction: 1, blocked: true }]
    for (const [row, mode] of modes.entries()) {
      const run = createRun({ ...blankTrial(), spawn: { x: 600 - mode.direction * 120, y: 450.34 },
        props: [{ kind: mode.kind, x: 600, y: 440, size: 80 }],
        platforms: mode.blocked ? [{ x: 640, y: 300, w: 100, h: 620 }] : [],
        gravityPlates: [{ id: 'water', x: 0, y: 400, w: 1800, h: 520, effect: 'water', gravity: -1, power: 'always' }] })
      run.started = true; run.player.grounded = false; run.player.coyote = 0
      const input = { ...NEUTRAL_INPUT, move: mode.direction }
      for (let i = 0; i < 600; i++) stepRun(run, input)
      let previous = run.player.waterMotion.phase, ready = false, col = 0
      const targets = [0, .3, .5, .65, .85]
      for (let i = 0; i < 600 && col < 5; i++) {
        stepRun(run, input)
        const p = run.player, phase = p.waterMotion.phase, cycle = phase / (Math.PI * 2)
        ready ||= phase < previous; previous = phase
        if (!ready || cycle < targets[col]) continue
        const pose = athletePose(p), originX = col * 360, originY = row * 300, rootX = mode.direction > 0 ? 160 : 200, scale = 2.2
        ctx.save(); ctx.beginPath(); ctx.rect(originX, originY, 360, 300); ctx.clip()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, originY, 360, 300)
        ctx.save(); ctx.translate(originX + rootX - p.x * scale, originY + 100 - 400 * scale); ctx.scale(scale, scale)
        drawProp(ctx, run.props[0]); drawAthlete(ctx, p); ctx.restore()
        ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(originX, originY + 100, 360, 200); ctx.globalAlpha = 1
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, originY, 360, 30)
        ctx.font = '14px sans-serif'; ctx.fillStyle = '#43494b'
        ctx.fillText(`${mode.blocked ? 'Blocked box' : mode.kind === 'box' ? 'Push right' : 'Push left'} / ${['glide', 'bend knees', 'recover feet', 'kick', 'extension'][col]}`, originX + 12, originY + 20)
        ctx.strokeStyle = '#ddd'; ctx.strokeRect(originX, originY, 360, 300); ctx.restore()
        samples.push({ row, col, pushing: p.pushing?.amount ?? 0, prone: pose.head[0] - pose.hip[0], backView: pose.backView ?? 0, foot: pose.frontLeg.end })
        col++
      }
    }
    return samples
  })
  expect(samples).toHaveLength(15)
  for (const sample of samples) {
    expect(sample.pushing).toBe(1); expect(sample.prone).toBeGreaterThan(18); expect(sample.backView).toBe(0)
  }
  await page.locator('#water-pushing').screenshot({ path: info.outputPath('water-pushing-poses.png') })
})

test('floating box drift bobbing and rocking retain the rider pose and planted feet', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { drawProp } = await import('/src/games/jumping/challengeRender.ts')
    const run = createRun({ ...blankTrial(), spawn: { x: 600, y: 330 }, props: [{ kind: 'box', x: 600, y: 460, size: 120 }],
      gravityPlates: [{ id: 'water', x: 0, y: 400, w: 1800, h: 520, effect: 'water', gravity: -1, power: 'always' }] })
    run.started = true; run.player.grounded = false; run.player.coyote = 0
    for (let i = 0; i < 480; i++) stepRun(run, NEUTRAL_INPUT)
    const canvas = document.createElement('canvas'); canvas.id = 'water-rider'; canvas.width = 1500; canvas.height = 380
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; const ctx = canvas.getContext('2d'), samples = []
    for (let col = 0; col < 5; col++) {
      if (col === 1) { run.props[0].vx = 90; run.props[0].vy = -60 }
      for (let i = 0; i < (col === 0 ? 0 : 120); i++) {
        if (col >= 3) run.props[0].angularVelocity = .15 * Math.cos((i + (col - 3) * 120) / 60)
        stepRun(run, NEUTRAL_INPUT)
      }
      const p = run.player, b = run.props[0], originX = col * 300
      ctx.save(); ctx.beginPath(); ctx.rect(originX, 0, 300, 380); ctx.clip()
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, 0, 300, 380)
      ctx.save(); ctx.translate(originX + 150 - p.x * 2, 260 - 400 * 2); ctx.scale(2, 2); drawProp(ctx, b); drawAthlete(ctx, p); ctx.restore()
      ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(originX, 260, 300, 120); ctx.globalAlpha = 1
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, 0, 300, 30); ctx.font = '14px sans-serif'; ctx.fillStyle = '#43494b'
      ctx.fillText(['Balanced rider', 'Drift / bob', 'Settling', 'Rock with planted feet', 'Rock back'][col], originX + 12, 20)
      ctx.strokeStyle = '#ddd'; ctx.strokeRect(originX, 0, 300, 380); ctx.restore()
      samples.push({ grounded: p.grounded, moving: p.gait.speed, planted: p.footwork?.feet.every(f => f.planted), angle: b.angle })
    }
    return samples
  })
  for (const sample of samples) { expect(sample.grounded).toBe(true); expect(sample.planted).toBe(true); expect(sample.moving).toBeLessThan(.001) }
  expect(Math.abs(samples[2].angle)).toBeLessThan(.001)
  await page.locator('#water-rider').screenshot({ path: info.outputPath('water-box-rider.png') })
})

test('slow standing-to-swimming transitions gather clear of floats banks and the floor', async ({ page }, info) => {
  await page.goto('/')
  const samples = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { drawProp } = await import('/src/games/jumping/challengeRender.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-transitions'; canvas.width = 1500; canvas.height = 900
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; const ctx = canvas.getContext('2d'), samples = []
    for (let row = 0; row < 3; row++) {
      const run = createRun({ ...blankTrial(), spawn: row === 0 ? { x: 548, y: 450.34 } : row === 1 ? { x: 435, y: 400 } : { x: 550, y: 920 },
        props: row === 0 ? [{ kind: 'box', x: 600, y: 440, size: 80 }] : [],
        platforms: row === 1 ? [{ x: 0, y: 400, w: 450, h: 520 }] : row === 2 ? [{ x: 600, y: 840, w: 80, h: 80 }] : [],
        gravityPlates: [{ id: 'water', x: row === 1 ? 450 : 200, y: 400, w: row === 1 ? 400 : 1000, h: 520, effect: 'water', gravity: -1, power: 'always' }] })
      run.started = true; run.player.grounded = false; run.player.coyote = 0
      for (let i = 0; i < 360; i++) stepRun(run, row === 2 ? { ...NEUTRAL_INPUT, descend: true, crouch: true } : NEUTRAL_INPUT)
      const input = { ...NEUTRAL_INPUT, move: row === 1 ? .2 : -.2 }, captures = [0, 18, 42, 66, 102, 150]
      let col = 0
      for (let i = 0; i <= 150; i++) {
        if (i) stepRun(run, input)
        if (!captures.includes(i)) continue
        const p = run.player, originX = col * 250, originY = row * 300, scale = 2
        const rootY = row === 2 ? 230 : row === 1 ? 180 + (p.y - 400) * scale : 80 + (p.y - 400) * scale
        ctx.save(); ctx.beginPath(); ctx.rect(originX, originY, 250, 300); ctx.clip()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, originY, 250, 300)
        ctx.save(); ctx.translate(originX + 125 - p.x * scale, originY + rootY - p.y * scale); ctx.scale(scale, scale)
        for (const platform of run.level.platforms) { ctx.fillStyle = '#858a8d'; ctx.fillRect(platform.x, platform.y, platform.w, platform.h) }
        if (row === 2) { ctx.fillStyle = '#858a8d'; ctx.fillRect(0, 920, 1800, 80) }
        for (const b of run.props) drawProp(ctx, b)
        drawAthlete(ctx, p); ctx.restore()
        const surface = row === 2 ? originY : originY + (row === 1 ? 180 : 80)
        ctx.fillStyle = '#58a9df'; ctx.globalAlpha = .35; ctx.fillRect(originX, surface, 250, originY + 300 - surface); ctx.globalAlpha = 1
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(originX, originY, 250, 30); ctx.font = '13px sans-serif'; ctx.fillStyle = '#43494b'
        ctx.fillText(`${['Leave float', 'Step from bank', 'Release floor crouch'][row]} / ${(i / 120).toFixed(2)}s`, originX + 10, originY + 20)
        ctx.strokeStyle = '#ddd'; ctx.strokeRect(originX, originY, 250, 300); ctx.restore()
        samples.push({ row, col, amount: p.waterMotion?.amount ?? 0 }); col++
      }
    }
    return samples
  })
  expect(samples).toHaveLength(18)
  for (const row of [0, 1, 2]) expect(samples.filter(s => s.row === row).some(s => s.amount > .8)).toBe(true)
  await page.locator('#water-transitions').screenshot({ path: info.outputPath('water-transitions.png') })
})
