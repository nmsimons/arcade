import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { reverseRopeWorkshop } from './helpers/jumpingRopeGravity.mjs'

test('a fresh keyboard climb settles into a relaxed hang and coasts with passive body motion', async ({ page }, info) => {
  test.setTimeout(60_000)
  const level = reverseRopeWorkshop('ceiling')
  level.gravityPlates = []
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await finishJumpingEntrance(page)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(900); await page.keyboard.up('ArrowUp')
  await page.clock.runFor(500)
  const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect((await sample()).signals.mode).toBe('rope')
  await page.screenshot({ path: info.outputPath('relaxed-hang.png') })
  await page.keyboard.down('d'); await page.clock.runFor(600); await page.keyboard.up('d')
  await page.clock.runFor(1100)
  const recent = await page.evaluate(() => window.jumpingMotion.read().recent.slice(-40))
  expect(recent.every(s => s.signals.mode === 'rope' && s.input.move === 0)).toBe(true)
  const bends = recent.map(s => Math.atan2(s.points[0][0] - s.points[1][0], s.points[0][1] - s.points[1][1]))
  expect(Math.max(...bends) - Math.min(...bends)).toBeGreaterThan(.03)
  await page.screenshot({ path: info.outputPath('passive-coast.png') })
  await page.keyboard.down('x'); await page.clock.runFor(32); await page.keyboard.up('x')
  expect((await sample()).signals.mode).toBe('free')
  expect(errors).toEqual([])
})

test('render enlarged resting, passive-swing and gravity-turn frames for visual review', async ({ page }, info) => {
  await page.goto('/lab')
  const gallery = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { ropeGripDistance, ropePoint, ropeImpulse, ropePath } = await import('/src/games/jumping/climbables.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 950
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), frames = []
    const p = createPlayer({ x: 490, y: 480 }), field = createGravityField()
    const world = { ladders: [], ropes: [{ x: 500, y: 100, length: 600, segments: 75 }] }
    p.grounded = false
    const tick = () => stepPlayer(p, NEUTRAL_INPUT, STEP, [], world, undefined, undefined, field)
    for (let i = 0; i < 120; i++) tick()
    const capture = label => frames.push({ label, p: structuredClone(p) })
    capture('Rest')
    ropeImpulse(p.climbing.rope, ropeGripDistance(p.climbing), 280, 0, STEP)
    for (let i = 0; i < 30; i++) tick()
    capture('Passive swing · 250 ms')
    for (let i = 0; i < 30; i++) tick()
    capture('Passive swing · 500 ms')
    for (let i = 0; i < 60; i++) tick()
    capture('Passive swing · 1000 ms')
    Object.assign(p, structuredClone(frames[0].p))
    updateGravityField(field, [{ id: 'g', x: -2000, y: -2000, w: 5000, h: 5000, gravity: -1, power: 'always' }], new Map(), true)
    for (const [count, label] of [[8, 'Gather'], [12, 'Turn'], [18, 'Unfold'], [22, 'Inverted hang']]) {
      for (let i = 0; i < count; i++) tick()
      capture(label)
    }
    ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const [i, { label, p: actor }] of frames.entries()) {
      const x = i % 4 * 350, y = Math.floor(i / 4) * 475
      ctx.fillStyle = '#30423a'; ctx.font = '17px sans-serif'; ctx.fillText(label, x + 20, y + 30)
      const grip = ropePoint(actor.climbing.rope, ropeGripDistance(actor.climbing))
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + 45, 350, 430); ctx.clip()
      ctx.translate(x + 175, y + 245); ctx.scale(2.6, 2.6); ctx.translate(-grip[0], -grip[1])
      ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath()
      const rope = actor.climbing.rope; ctx.moveTo(rope.definition.x, rope.definition.y)
      for (const point of ropePath(rope.definition, rope)) ctx.lineTo(...point)
      ctx.stroke(); drawAthlete(ctx, actor, '#30423a'); ctx.restore()
    }
    return frames.map(({ label, p }) => ({ label, inverted: p.inverted, angle: p.climbing.turn?.angle ?? 0 }))
  })
  expect(gallery.at(-1).inverted).toBe(true)
  await page.locator('canvas').screenshot({ path: info.outputPath('rope-body-motion-gallery.png') })
})

test('manual release and automatic support finish the reverse-gravity turn on a ceiling', async ({ page }, info) => {
  await page.goto('/lab')
  const outcomes = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { ropeGripDistance, ropePoint, ropePath } = await import('/src/games/jumping/climbables.ts')
    const { createGravityField, updateGravityField } = await import('/src/games/jumping/gravity.ts')
    const { playerTurnAngle } = await import('/src/games/jumping/ropeGravity.ts')
    const { GameCamera } = await import('/src/games/jumping/camera.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const terrain = [{ x: 1140, y: 945, w: 360, h: 20 }]
    const world = { ladders: [], ropes: [{ x: 1040, y: 800, length: 305, segments: 39 }] }
    const field = createGravityField(), frames = [], outcomes = []
    updateGravityField(field, [{ id: 'g', x: 1145, y: 965, w: 350, h: 120, gravity: -1, power: 'always' }], new Map(), true)
    for (const manual of [true, false]) {
      const p = createPlayer({ x: 1030, y: 1080 })
      Object.assign(p, { grounded: false, vx: 410, facing: -1 })
      const camera = new GameCamera(), room = { width: 2200, height: 2000, floor: 2000 }
      let previousView, cameraJump = 0
      const row = []; let released = false
      for (let i = 0; i < 960; i++) {
        if (p.climbing?.turn && p.x > 1170 && Math.abs(p.climbing.turn.angle) > .4 && !row.length) {
          row.push({ label: manual ? 'Before letting go' : 'Approaching support', p: structuredClone(p) })
          released = manual
        }
        let move = 0
        if (p.climbing && !released) {
          const c = p.climbing, d = ropeGripDistance(c)
          move = Math.sign(ropePoint(c.rope, d)[0] - ropePoint(c.rope, d, true)[0]) || 1
        } else if (!row.length) move = 1
        stepPlayer(p, { ...NEUTRAL_INPUT, move, detach: released }, STEP, terrain, world, undefined, undefined, field)
        const view = camera.view(1280, 800, p, room, true, STEP)
        if (previousView) cameraJump = Math.max(cameraJump, Math.hypot(view.x - previousView.x, view.y - previousView.y) * view.zoom)
        previousView = view
        if (p.releaseTurn?.time > .08 && row.length === 1) row.push({ label: 'Turning with contact clearance', p: structuredClone(p) })
        if (p.inverted && p.grounded) { row.push({ label: 'Standing on the ceiling', p: structuredClone(p) }); break }
      }
      frames.push(row)
      outcomes.push({ manual, frames: row.length, inverted: p.inverted, grounded: p.grounded, y: p.y, cameraJump })
    }
    const canvas = document.createElement('canvas'); canvas.width = 1140; canvas.height = 680
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const [row, shots] of frames.entries()) for (const [column, { label, p }] of shots.entries()) {
      const x = column * 380, y = row * 340, angle = playerTurnAngle(p), orientation = p.inverted ? -1 : 1
      const center = [p.x + Math.sin(angle) * 31 * orientation, p.y - Math.cos(angle) * 31 * orientation]
      ctx.fillStyle = '#30423a'; ctx.font = '16px sans-serif'; ctx.fillText(`${row ? 'Automatic' : 'Manual'} · ${label}`, x + 12, y + 26)
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + 40, 380, 300); ctx.clip()
      ctx.translate(x + 190, y + 185); ctx.scale(2.5, 2.5); ctx.translate(-center[0], -center[1])
      ctx.fillStyle = '#8f9392'; ctx.fillRect(1140, 945, 360, 20)
      ctx.fillStyle = '#ae88c5'; ctx.fillRect(1145, 965, 350, 2)
      const rope = p.ropes[0]; ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(rope.definition.x, rope.definition.y)
      for (const point of ropePath(rope.definition, rope)) ctx.lineTo(...point)
      ctx.stroke(); drawAthlete(ctx, p, '#30423a'); ctx.restore()
    }
    return outcomes
  })
  for (const result of outcomes) {
    expect(result.frames).toBe(3); expect(result.inverted).toBe(true); expect(result.grounded).toBe(true)
    expect(result.y).toBeCloseTo(965, 2)
    expect(result.cameraJump).toBeLessThan(8)
  }
  await page.locator('canvas').screenshot({ path: info.outputPath('rope-ceiling-landings.png') })
})
