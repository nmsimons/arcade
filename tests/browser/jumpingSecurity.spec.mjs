import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, installTestFolder, readTestLevel } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'

const slow = blankTrial()
slow.id = 'slow-security-fixture'; slow.name = 'Complex rope'
slow.width = 4000; slow.goal.x = 3800
slow.climbables.ropes = [{ x: 1200, y: 100, length: 2000, segments: 250 }]
slow.platforms = Array.from({ length: 12 }, (_, i) => ({ x: 900 + i % 2 * 40, y: 200 + i * 5, w: 600, h: 20 }))

async function trackWorkers(page) {
  await page.addInitScript(() => {
    const NativeWorker = Worker
    window.levelWorkers = []
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args)
        const entry = { terminated: false }; window.levelWorkers.push(entry)
        const terminate = this.terminate.bind(this)
        this.terminate = () => { entry.terminated = true; terminate() }
      }
    }
  })
}

test('complex imported geometry cannot block the picker and preparation can be cancelled', async ({ page }) => {
  await useLevelFixtures(page, [slow, FIRST_LEVEL]); await trackWorkers(page)
  await page.goto('/untitled-jumping-game')
  const card = page.getByRole('button', { name: 'Level 1: Complex rope', exact: true })
  await expect(card).toBeVisible()
  await expect.poll(() => card.locator('canvas').evaluate(canvas => canvas.width)).toBeGreaterThan(1)
  expect(await page.evaluate(() => window.levelWorkers)).toEqual([])
  await card.click()
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(card).toBeVisible()
  expect(await page.evaluate(() => window.levelWorkers.every(worker => worker.terminated))).toBe(true)
  await page.getByRole('button', { name: 'Level 2: First Leap', exact: true }).click()
  await expect(page.getByRole('img', { name: 'First Leap: activate the goal' })).toBeFocused()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Restart level', exact: true }).click()
  await expect(page.getByRole('img', { name: 'First Leap: activate the goal' })).toBeFocused()
})

test('a stalled level times out cleanly and leaves other levels playable', async ({ page }) => {
  await useLevelFixtures(page, [slow, FIRST_LEVEL]); await trackWorkers(page)
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level 1: Complex rope', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toBeVisible()
  await expect(page.locator('.jumping-route-notice')).toContainText('took too long', { timeout: 10_000 })
  expect(await page.evaluate(() => window.levelWorkers.every(worker => worker.terminated))).toBe(true)
  await page.getByRole('button', { name: 'Level 2: First Leap', exact: true }).click()
  await expect(page.getByRole('img', { name: 'First Leap: activate the goal' })).toBeFocused()
})

test('offscreen thumbnails allocate pixels only when scrolled into view', async ({ page }) => {
  await useLevelFixtures(page, Array.from({ length: 40 }, (_, i) => ({ ...FIRST_LEVEL, id: `level-${i}`, name: `Level ${i}` })))
  await page.goto('/untitled-jumping-game')
  const first = page.locator('.jumping-level-card .level-thumbnail').first(), last = page.locator('.jumping-level-card .level-thumbnail').last()
  await expect.poll(() => first.evaluate(canvas => canvas.width)).toBeGreaterThan(1)
  await expect.poll(() => last.evaluate(canvas => canvas.width)).toBe(1)
  await last.scrollIntoViewIfNeeded()
  await expect.poll(() => last.evaluate(canvas => canvas.width)).toBeGreaterThan(1)
  await expect.poll(() => first.evaluate(canvas => canvas.width)).toBe(1)
})

test('failed preparation preserves the editor draft and the original local file', async ({ page }) => {
  await installTestFolder(page, { 'complex.json': slow }); await trackWorkers(page)
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Edit Complex rope', exact: true }).click()
  const name = page.getByRole('textbox', { name: 'Level name', exact: true })
  await name.fill('Unsaved complex rope')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  const failure = page.getByRole('alertdialog', { name: 'Save failed', exact: true })
  await expect(failure).toContainText('took too long', { timeout: 10_000 })
  await failure.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(name).toHaveValue('Unsaved complex rope')
  expect((await readTestLevel(page, 'complex.json')).name).toBe('Complex rope')
  await expect.poll(() => page.evaluate(() => window.levelWorkers.every(worker => worker.terminated))).toBe(true)
  await expect(page.getByRole('application', { name: 'Level canvas', exact: true })).toHaveAttribute('aria-busy', 'false')
  await name.fill('Still editable')
  await expect(name).toHaveValue('Still editable')
})

test('Back during preparation cancels it and Forward prepares the requested level again', async ({ page }) => {
  await useLevelFixtures(page, [slow]); await trackWorkers(page)
  await page.goto('/untitled-jumping-game')
  const card = page.getByRole('button', { name: 'Level 1: Complex rope', exact: true })
  await card.click()
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toBeVisible()
  await page.goBack()
  await expect(card).toBeVisible()
  expect(await page.evaluate(() => window.levelWorkers.every(worker => worker.terminated))).toBe(true)
  await page.goForward()
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toBeVisible()
  expect(await page.evaluate(() => window.levelWorkers.length)).toBe(2)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(card).toBeVisible()
  expect(await page.evaluate(() => window.levelWorkers.every(worker => worker.terminated))).toBe(true)
})
