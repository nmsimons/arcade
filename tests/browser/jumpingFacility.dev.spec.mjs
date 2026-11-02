import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation, withoutIntermediateFrames } from './helpers/simulation.mjs'

// Orientation holds Wake, the controls hall and Company in one untimed level.
const INTRODUCED = { 'lab-orientation': true }
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.facility.v1')))
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
const canvasLabel = page => page.locator('.jumping-game > canvas').getAttribute('aria-label')

/** Opens the development facility from the level menu with a paused clock, saved completions and an autosaved place. */
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
/** Shift-walks to a doorway and stops in it. */
async function walkTo(page, x) {
  const key = (await motion(page)).x < x ? 'ArrowRight' : 'ArrowLeft'
  await page.keyboard.down('Shift'); await page.keyboard.down(key)
  await withoutIntermediateFrames(page, async () => {
    const start = (await motion(page)).time
    for (let p = await motion(page); key === 'ArrowRight' ? p.x < x - 6 : p.x > x + 6; p = await motion(page)) {
      expect(p.time - start, `reach x ${x} from ${Math.round(p.x)}`).toBeLessThan(20)
      await advanceJumpingSimulation(page, 48)
    }
  })
  await page.keyboard.up(key); await page.keyboard.up('Shift')
  await advanceJumpingSimulation(page, 600)
  expect(Math.abs((await motion(page)).x - x), 'stopped in the doorway').toBeLessThan(16)
}
const pressUp = async page => { await page.keyboard.down('ArrowUp'); await advanceJumpingSimulation(page, 150); await page.keyboard.up('ArrowUp') }

test('a new save wakes in Orientation, an untimed opening level', async ({ page }) => {
  test.setTimeout(120000)
  await openFacility(page)
  await expect(page.getByRole('img', { name: 'Orientation: reach the exit' })).toBeVisible()
  // The robot wakes in the pod; wait until its status says so before playing out the awakening.
  await expect.poll(async () => { await page.clock.runFor(16); return page.locator('.jumping-state').innerText() }).toBe('Waking up')
  await finishJumpingEntrance(page)
  await expect(page.getByTestId('level-time'), 'the opening has no clock').toHaveCount(0)
  // Crossing the power plate opens the training access gate onto the day-lit hall.
  await walkTo(page, 1700)
  expect(await saved(page), 'the opening is never autosaved').toBeNull()
})

test('a finished opening starts at the concourse, whose Orientation door leads back in at the far end', async ({ page }, info) => {
  test.setTimeout(240000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await openFacility(page, INTRODUCED)
  const concourse = page.getByRole('img', { name: 'Concourse', exact: true })
  await expect(concourse).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - 1970), 'starts at the Orientation door').toBeLessThan(16)
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('concourse-orientation.png') })

  await advanceJumpingSimulation(page, 300); await pressUp(page); await advanceJumpingSimulation(page, 1200)
  await expect(page.getByRole('img', { name: 'Orientation: reach the exit' })).toBeVisible()
  expect(await saved(page), 'a level resumes at its door').toEqual({ place: { kind: 'hub', level: 'facility-concourse', arrival: { kind: 'door', id: 'door-orientation' } } })
  await finishJumpingEntrance(page)
  // Re-entering starts at the far end, on the gantry beside Service access.
  expect(Math.round((await motion(page)).y)).toBe(350)
  expect(Math.abs((await motion(page)).x - 8520), 'starts beside Service access').toBeLessThan(16)
  await expect(page.getByTestId('level-time'), 'the replayed opening stays untimed').toHaveCount(0)
  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Game paused' })
  await expect(pause.getByRole('button', { name: 'Level menu' })).toHaveCount(0)
  await pause.getByRole('button', { name: 'Leave course' }).click()
  await expect(concourse).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - 1970), 'stepped out of the door').toBeLessThan(16)
  await page.keyboard.press('Escape')
  await expect(pause.getByRole('button')).toHaveText(['Resume Esc', 'Controls', 'Level studio', 'Back to arcade'])
  expect(errors).toEqual([])
})

test('a returning save resumes at its autosaved bulkhead, where locked doors stay shut', async ({ page }) => {
  test.setTimeout(120000)
  await openFacility(page, INTRODUCED, { kind: 'hub', level: 'facility-movement', arrival: { kind: 'door', id: 'movement-to-concourse' } })
  const wing = page.getByRole('img', { name: 'Movement wing', exact: true })
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - 200), 'stepped out of the saved bulkhead').toBeLessThan(16)
  // A Bigger Swing waits for a pass on Hop Skip Jump I.
  await walkTo(page, 1150); await pressUp(page); await advanceJumpingSimulation(page, 1200)
  await expect(wing).toBeVisible()
  expect(Math.abs((await motion(page)).x - 1150)).toBeLessThan(16)
})
