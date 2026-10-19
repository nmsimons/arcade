import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures, installBuiltInFixtures, readTestLevel } from './helpers/jumpingLevels.mjs'
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
        // Thumbnails now prepare lighting too; track only playable-level work.
        if (!String(args[0]).includes('ropeLayout.worker')) return
        const entry = { terminated: false }; window.levelWorkers.push(entry)
        const terminate = this.terminate.bind(this)
        this.terminate = () => { entry.terminated = true; terminate() }
      }
    }
  })
}

test('failed preparation preserves the editor draft and the original built-in file', async ({ page }) => {
  await installBuiltInFixtures(page, { 'complex.json': slow }); await trackWorkers(page)
  await page.goto('/lab')
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
