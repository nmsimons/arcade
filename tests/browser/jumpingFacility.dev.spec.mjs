import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation, withoutIntermediateFrames } from './helpers/simulation.mjs'

const WAKE = '1986ae30-4b97-4815-a35a-cfe3852bca9e'
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.facility.v1')))

/** Opens the development facility from the level menu with a paused clock, saved passes and an autosaved place. */
async function openFacility(page, completed = {}, place) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1&renderControl=1')
  await page.evaluate(([completed, place]) => {
    localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(completed))
    if (place) localStorage.setItem('arcade.jumping.facility.v1', JSON.stringify({ place }))
  }, [completed, place])
  const facility = page.getByRole('button', { name: 'Facility', exact: true })
  await expect(facility).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await facility.click()
  await expect(page).toHaveURL(/\/lab\/facility$/)
}
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

test('a new save starts in Wake and exits through its door into the Orientation wing', async ({ page }) => {
  test.setTimeout(120000)
  await openFacility(page)
  await expect(page.getByRole('img', { name: 'Wake: reach the exit' })).toBeVisible()
  // The robot wakes in Wake's pod; wait until its status says so before playing out the awakening.
  await expect.poll(async () => { await page.clock.runFor(16); return page.locator('.jumping-state').innerText() }).toBe('Waking up')
  await finishJumpingEntrance(page)
  expect(await saved(page), 'the opening is never autosaved').toBeNull()
  // Crossing the power plate opens the training route.
  await page.keyboard.down('ArrowRight')
  await expect.poll(async () => { await advanceJumpingSimulation(page, 480); return page.locator('.jumping-game > canvas').getAttribute('aria-label') },
    { timeout: 60000 }).toBe('Orientation wing')
  await page.keyboard.up('ArrowRight')
  expect(await saved(page), 'stepped out of Wake\'s door').toEqual({ place: { kind: 'hub', level: 'facility-orientation', arrival: { kind: 'door', id: 'door-wake' } } })
})

test('a returning save resumes at its autosaved door', async ({ page }) => {
  await openFacility(page, { [WAKE]: true }, { kind: 'hub', level: 'facility-orientation', arrival: { kind: 'door', id: 'door-first-gap' } })
  await expect(page.getByRole('img', { name: 'Orientation wing', exact: true })).toBeVisible()
  await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - 1050), 'stepped out of the saved door').toBeLessThan(16)
})

test('Up enters an open course door, Leave course returns to it, and locked doors stay shut', async ({ page }, info) => {
  test.setTimeout(240000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await openFacility(page, { [WAKE]: true })
  const wing = page.getByRole('img', { name: 'Orientation wing', exact: true })
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  const until = (predicate, seconds = 15) => withoutIntermediateFrames(page, async () => {
    const start = (await motion(page)).time
    for (let p = await motion(page); !predicate(p); p = await motion(page)) {
      expect(p.time - start, `condition not met within ${seconds}s of gameplay: ${JSON.stringify({ x: p.x, y: p.y })}`).toBeLessThan(seconds)
      await advanceJumpingSimulation(page, 48)
    }
  })
  const walkTo = async x => {
    const key = (await motion(page)).x < x ? 'ArrowRight' : 'ArrowLeft'
    await page.keyboard.down('Shift'); await page.keyboard.down(key)
    await until(p => key === 'ArrowRight' ? p.x >= x - 6 : p.x <= x + 6)
    await page.keyboard.up(key); await page.keyboard.up('Shift')
    await advanceJumpingSimulation(page, 600)
    expect(Math.abs((await motion(page)).x - x), 'stopped in the doorway').toBeLessThan(16)
  }
  const pressUp = async () => { await page.keyboard.down('ArrowUp'); await advanceJumpingSimulation(page, 150); await page.keyboard.up('ArrowUp') }

  // Walking past open doors never enters one.
  await walkTo(700)
  await expect(wing).toBeVisible()
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('orientation-doors.png') })

  await pressUp(); await advanceJumpingSimulation(page, 1200)
  await expect(page.getByRole('img', { name: 'Leaps and Bounds I: reach the exit' })).toBeVisible()
  expect(await saved(page), 'a course resumes at its door').toEqual({ place: { kind: 'hub', level: 'facility-orientation', arrival: { kind: 'door', id: 'door-leaps-and-bounds-i' } } })
  await finishJumpingEntrance(page)
  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Game paused' })
  await expect(pause.getByRole('button', { name: 'Level menu' })).toHaveCount(0)
  await pause.getByRole('button', { name: 'Leave course' }).click()
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - 700), 'stepped out of the course door').toBeLessThan(16)

  // First Gap waits for a pass on Leaps and Bounds I.
  await walkTo(1050); await pressUp(); await advanceJumpingSimulation(page, 1200)
  await expect(wing).toBeVisible()
  expect(Math.abs((await motion(page)).x - 1050)).toBeLessThan(16)

  await page.keyboard.press('Escape')
  await expect(pause.getByRole('button')).toHaveText(['Resume Esc', 'Controls', 'Level studio', 'Back to arcade'])
  expect(errors).toEqual([])
})
