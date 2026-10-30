import { installAthleteHeadObserver } from './helpers/athleteHead.mjs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, restartFromPause } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { readFile } from 'node:fs/promises'

test('the silhouette emerges through a closing entrance; idle play, pause and restart use the same sequence', async ({ page }, info) => {
  const level = { ...blankTrial(), width: 1000, height: 600, floor: 500,
    entrance: { x: 100, y: 500 }, goal: { x: 850, y: 500, id: 'exit', power: 'switched' },
    mechanisms: [{ id: 'lift', kind: 'lift', x: 400, y: 480, w: 120, h: 20, travel: 100, power: 'always' }] }
  await useLevelFixtures(page, [level])
  await installAthleteHeadObserver(page)
  await page.addInitScript(() => {
    window.entranceFrames = []
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect
    proto.fillRect = function (...args) {
      if (this.canvas instanceof HTMLCanvasElement && this.canvas.matches('canvas[tabindex]') && this.fillStyle === '#000000' && args[3] === 80)
        window.entranceFrames.push({ kind: 'door', width: args[2] })
      return rect.apply(this, args)
    }
    window.addEventListener('jumping-athlete-head', ({ detail: { canvas, body, alpha } }) => {
      if (canvas instanceof HTMLCanvasElement && canvas.matches('canvas[tabindex]'))
        window.entranceFrames.push({ kind: 'head', x: body.e, alpha: alpha })
    })
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab')
  const card = page.locator('.jumping-level-card[aria-pressed=true]')
  await expect(card).toBeVisible()
  await expect.poll(() => card.locator('canvas').evaluate(c => c.width)).toBeGreaterThan(1)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await card.click(); await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  await page.clock.runFor(200)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.screenshot({ path: info.outputPath('entrance-reveal.png') })
  const beforePause = await page.evaluate(() => window.entranceFrames.filter(f => f.kind === 'head').at(-1))
  await page.keyboard.press('Escape'); await page.clock.runFor(1000)
  expect(await page.evaluate(() => window.entranceFrames.filter(f => f.kind === 'head').at(-1))).toEqual(beforePause)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.clock.runFor(500)
  const heads = await page.evaluate(() => window.entranceFrames.filter(frame => frame.kind === 'head'))
  expect(Math.max(...heads.map(h => h.x)) - Math.min(...heads.map(h => h.x))).toBeGreaterThan(3)
  expect(heads.some(h => h.alpha > 0 && h.alpha < 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('entrance-step.png') })
  await page.clock.runFor(500)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  expect(await page.evaluate(() => window.entranceFrames.filter(f => f.kind === 'door').at(-1).width)).toBeLessThan(40)
  await page.clock.runFor(300)
  await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
  await restartFromPause(page, false)
  await page.clock.runFor(200)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.clock.runFor(1300)
  await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
})

for (const file of ['spire1.jump-level.json', '04.json', '05.json', 'spelunk.jump-level.json', 'rampingup.jump-level.json', 'buoyancy.jump-level.json']) {
  test(`the revised ${file} entrance activates from a fresh start`, async ({ page }, info) => {
    const level = JSON.parse(await readFile(new URL(`../../public/levels/jumping/${file}`, import.meta.url), 'utf8'))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.goto('/lab')
    const card = page.locator('.jumping-level-card[aria-pressed=true]')
    await expect(card).toBeVisible()
    await expect.poll(() => card.locator('canvas').evaluate(c => c.width)).toBeGreaterThan(1)
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await card.click()
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    await page.clock.runFor(700)
    await expect(page.locator('.jumping-state')).toHaveText('Entering the level')
    await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
    await page.screenshot({ path: info.outputPath('revised-entrance.png') })
    await page.clock.runFor(800)
    await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
    await expect(page.locator('.jumping-state')).toHaveText('Ready')
  })
}
