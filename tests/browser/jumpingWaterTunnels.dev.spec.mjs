import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/narrow-water-tunnel.json', import.meta.url), 'utf8'))

test('normal controls enter a narrow flooded tunnel, rest inside and swim back out', async ({ page }, info) => {
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(150)
  const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const hold = async (keys, ms) => {
    for (const key of keys) await page.keyboard.down(key)
    await page.clock.runFor(ms)
    for (const key of keys) await page.keyboard.up(key)
  }
  await hold(['ArrowUp'], 8000)
  await hold(['ArrowDown'], 3125)
  await hold([], 1500)
  const start = await state()
  expect(start.waterCenter).toBeGreaterThan(625)
  expect(start.waterCenter).toBeLessThan(642)
  await hold(['a'], 4000)
  const inside = await state()
  expect(start.x - inside.x).toBeGreaterThan(395)
  expect(Math.abs(inside.waterCenter - start.waterCenter)).toBeLessThan(.2)
  await page.screenshot({ path: info.outputPath('narrow-tunnel-swimming.png') })
  await hold([], 3000)
  const rest = await state()
  await hold([], 2000)
  const still = await state()
  expect(still.blends.fall).toBeGreaterThan(.4)
  expect(Math.abs(still.waterCenter - rest.waterCenter)).toBeLessThan(.05)
  expect(Math.abs(still.x - rest.x)).toBeLessThan(.05)
  expect(still.signals.grounded).toBe(false)
  await page.screenshot({ path: info.outputPath('narrow-tunnel-resting.png') })
  await hold(['d'], 5000)
  const outside = await state()
  expect(outside.x).toBeGreaterThan(1400)
  await hold([], 3000)
  const floating = await state()
  expect(floating.blends.fall).toBe(0)
  expect(floating.points[2][1]).toBeLessThan(floating.points[0][1] - 20)
  await info.attach('narrow-tunnel-route', { body: JSON.stringify({ start, inside, rest, still, outside, floating }), contentType: 'application/json' })
})

test('the tunnel silhouette stays clear while gathering and turning', async ({ page }, info) => {
  await page.goto('/')
  await page.evaluate(async source => {
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { drawAthlete } = await import('/src/games/jumping/athlete.ts')
    const { platformOutline } = await import('/src/games/jumping/geometry.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'tunnel-review'; canvas.width = 1500; canvas.height = 560
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d')
    for (const [row, direction] of [-1, 1].entries()) {
      const level = structuredClone(source); level.spawn.y = 670
      if (direction > 0) {
        level.spawn.x = 1800 - level.spawn.x
        for (const b of level.platforms) {
          b.x = 1800 - b.x - b.w
          b.polygon = b.polygon.map(([x, y]) => [b.w - x, y]).reverse()
        }
      }
      const run = createRun(level), p = run.player
      run.started = true; p.grounded = false; p.coyote = 0; p.facing = direction
      const advance = (seconds, intent = {}) => {
        for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(run, { ...NEUTRAL_INPUT, ...intent }, STEP)
      }
      const capture = (col, label) => {
        const x = col * 300, y = row * 280
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, 300, 280); ctx.clip()
        ctx.fillStyle = '#d2e8ef'; ctx.fillRect(x, y, 300, 280)
        ctx.save(); ctx.translate(x + 150 - p.x * 4, y + 145 - 633 * 4); ctx.scale(4, 4)
        ctx.fillStyle = '#858a8d'
        for (const b of run.level.platforms) {
          const points = platformOutline(b); ctx.beginPath(); ctx.moveTo(...points[0])
          for (const point of points.slice(1)) ctx.lineTo(...point)
          ctx.closePath(); ctx.fill()
        }
        drawAthlete(ctx, p); ctx.restore()
        ctx.fillStyle = '#f1f1ed'; ctx.fillRect(x, y, 300, 32); ctx.fillStyle = '#43494b'; ctx.font = '14px sans-serif'
        ctx.fillText(label, x + 10, y + 22); ctx.strokeStyle = '#ccc'; ctx.strokeRect(x, y, 300, 280); ctx.restore()
      }
      advance(4, { move: direction }); capture(0, 'Swim through opening')
      advance(.3); capture(1, 'Slow and gather')
      advance(3); capture(2, 'Rest in limited clearance')
      advance(.25, { move: -direction }); capture(3, 'Turn to leave')
      advance(.8, { move: -direction }); capture(4, 'Extend into return stroke')
    }
  }, level)
  await page.locator('#tunnel-review').screenshot({ path: info.outputPath('water-tunnel-poses.png') })
})
