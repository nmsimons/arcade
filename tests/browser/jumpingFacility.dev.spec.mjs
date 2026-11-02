import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation, withoutIntermediateFrames } from './helpers/simulation.mjs'

const WAKE = '1986ae30-4b97-4815-a35a-cfe3852bca9e'

/** Opens the development facility from the level menu with a paused clock and the given saved passes. */
async function openFacility(page, completed = {}) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1&renderControl=1')
  await page.evaluate(value => localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(value)), completed)
  const facility = page.getByRole('button', { name: 'Facility', exact: true })
  await expect(facility).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await facility.click()
  await expect(page).toHaveURL(/\/lab\/facility$/)
}

test('a new save starts the facility in Wake', async ({ page }) => {
  await openFacility(page)
  await expect(page.getByRole('img', { name: 'Wake: reach the exit' })).toBeVisible()
})

test('Up enters an open course door, Leave course returns to it, and locked doors stay shut', async ({ page }, info) => {
  test.setTimeout(240000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await openFacility(page, { [WAKE]: true })
  const wing = page.getByRole('img', { name: 'Orientation wing', exact: true })
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  const motion = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const until = (predicate, seconds = 15) => withoutIntermediateFrames(page, async () => {
    const start = (await motion()).time
    for (let p = await motion(); !predicate(p); p = await motion()) {
      expect(p.time - start, `condition not met within ${seconds}s of gameplay: ${JSON.stringify({ x: p.x, y: p.y })}`).toBeLessThan(seconds)
      await advanceJumpingSimulation(page, 48)
    }
  })
  const walkTo = async x => {
    const key = (await motion()).x < x ? 'ArrowRight' : 'ArrowLeft'
    await page.keyboard.down('Shift'); await page.keyboard.down(key)
    await until(p => key === 'ArrowRight' ? p.x >= x - 6 : p.x <= x + 6)
    await page.keyboard.up(key); await page.keyboard.up('Shift')
    await advanceJumpingSimulation(page, 600)
    expect(Math.abs((await motion()).x - x), 'stopped in the doorway').toBeLessThan(16)
  }
  const pressUp = async () => { await page.keyboard.down('ArrowUp'); await advanceJumpingSimulation(page, 150); await page.keyboard.up('ArrowUp') }

  // Walking past the bay records it; walking past an open door never enters it.
  await walkTo(700)
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('arcade.jumping.facility.v1')))).toEqual({ bay: { level: 'facility-orientation', id: 'orientation-bay' } })
  await expect(wing).toBeVisible()
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('orientation-doors.png') })

  await pressUp(); await advanceJumpingSimulation(page, 1200)
  await expect(page.getByRole('img', { name: 'Leaps and Bounds I: reach the exit' })).toBeVisible()
  await finishJumpingEntrance(page)
  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Game paused' })
  await expect(pause.getByRole('button', { name: 'Level menu' })).toHaveCount(0)
  await pause.getByRole('button', { name: 'Leave course' }).click()
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion()).x - 700), 'stepped out of the course door').toBeLessThan(16)

  // First Gap waits for a pass on Leaps and Bounds I.
  await walkTo(1050); await pressUp(); await advanceJumpingSimulation(page, 1200)
  await expect(wing).toBeVisible()
  expect(Math.abs((await motion()).x - 1050)).toBeLessThan(16)

  await page.keyboard.press('Escape')
  await pause.getByRole('button', { name: 'Return to charging bay' }).click()
  // The wing reloads under the same name; its status shows the bay waking.
  await expect.poll(async () => { await page.clock.runFor(16); return page.locator('.jumping-state').innerText() }).toBe('Waking up')
  await finishJumpingEntrance(page)
  expect(Math.abs((await motion()).x - 400), 'woke in the recorded bay').toBeLessThan(16)
  expect(errors).toEqual([])
})
