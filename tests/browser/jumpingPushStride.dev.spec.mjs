import { unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { pushScenario } from '../helpers/jumpingPushScenarios.mjs'

// These route regressions start from an already unlocked campaign.
test.beforeEach(async ({ page }) => { await unlockJumpingLevels(page) })

for (const kind of ['box', 'ball']) test(`keyboard ${kind} pushing takes steady steps without a rapid shuffle`, async ({ page }, info) => {
  const level = pushScenario({ kind, size: 80 }, 1).level
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab/levels/built-in/00-fixture.json?motionDebug=1')
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })
  await expect(canvas).toBeFocused({ timeout: 15000 })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await finishJumpingEntrance(page)
  await page.keyboard.down('d'); await page.clock.runFor(3100)
  const samples = await page.evaluate(() => window.jumpingMotion.read().recent)
  const steady = samples.filter(s => s.time > samples.at(-1).time - 1.8)
  expect(steady.length).toBeGreaterThan(150)
  expect(steady.every(s => s.signals.grounded && s.signals.push === 'prop:0')).toBe(true)
  let steps = 0, slip = 0
  for (let i = 1; i < steady.length; i++) for (let j = 0; j < 2; j++) {
    const a = steady[i - 1].contacts.feet[j], b = steady[i].contacts.feet[j]
    if (a.planted && !b.planted) steps++
    if (a.planted && b.planted) slip = Math.max(slip, Math.hypot(b.x - a.x, b.y - a.y))
  }
  const cadence = steps / (steady.at(-1).time - steady[0].time)
  expect(cadence).toBeGreaterThan(2)
  expect(cadence).toBeLessThan(kind === 'ball' ? 4.8 : 3.7)
  expect(slip).toBeLessThan(.02)
  await page.screenshot({ path: info.outputPath(`${kind}-push.png`) })
  await page.keyboard.up('d'); await page.clock.runFor(600)
  await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space')
  const released = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(released.signals.grounded).toBe(false); expect(released.vy).toBeLessThan(0)
  expect(errors).toEqual([])
  if (kind === 'ball') {
    // Review consecutive phases at readable scale, using the same live rig.
    await page.evaluate(async level => {
      const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
      const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
      const { entranceDuration } = await import('/src/games/jumping/goal.ts')
      const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
      const { drawProp } = await import('/src/games/jumping/challengeRender.ts')
      const review = document.createElement('canvas'); review.id = 'push-stride-review'; review.width = 1320; review.height = 480
      review.style.cssText = 'position:fixed;inset:0;z-index:9999'
      document.body.append(review)
      const ctx = review.getContext('2d')
      ctx.fillStyle = '#f1f1ed'; ctx.fillRect(0, 0, review.width, review.height)
      for (const [row, kind] of ['box', 'ball'].entries()) {
        const run = createRun({ ...level, props: [{ ...level.props[0], kind }] })
        stepRun(run, NEUTRAL_INPUT, entranceDuration(run.entrance))
        for (let tick = 0; tick <= 230; tick++) {
          stepRun(run, { ...NEUTRAL_INPUT, move: 1 }, STEP)
          if (tick < 150 || (tick - 150) % 16) continue
          const x = (tick - 150) / 16 * 220, y = row * 240, p = run.player
          ctx.save(); ctx.beginPath(); ctx.rect(x, y + 30, 220, 210); ctx.clip()
          ctx.translate(x + 65, y + 215); ctx.scale(2.5, 2.5); ctx.translate(-p.x, -p.y)
          ctx.fillStyle = '#39413d'; ctx.fillRect(p.x - 30, p.y, 150, 8)
          drawProp(ctx, run.props[0]); drawAthlete(ctx, p); ctx.restore()
          ctx.fillStyle = '#39413d'; ctx.font = '15px sans-serif'; ctx.fillText(`${kind} · ${Math.round((tick - 150) * STEP * 1000)} ms`, x + 12, y + 23)
        }
      }
    }, level)
    await page.locator('#push-stride-review').screenshot({ path: info.outputPath('box-ball-push-phases.png') })
  }
})
