import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation, withoutIntermediateFrames } from './helpers/simulation.mjs'
import { readFileSync } from 'node:fs'

// The concourse's bulkhead to Orientation, wherever the layout puts it.
const concourse = JSON.parse(readFileSync(new URL('../../public/levels/jumping/Concourse.jump-level.json', import.meta.url), 'utf8'))
const toOrientation = concourse.bulkheads.find(bulkhead => bulkhead.id === 'concourse-to-opening')

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.facility.v1')))
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

/** Opens the development facility from the level menu with a paused clock, saved completions and an autosaved place. */
async function openFacility(page, completed = {}, place) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1&renderControl=1')
  await page.evaluate(([completed, place]) => {
    localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(completed))
    if (place) localStorage.setItem('arcade.jumping.facility.v1', JSON.stringify({ place }))
  }, [completed, place])
  const facility = page.getByRole('button', { name: 'Facility', exact: true })
  // A cold development server can take a while to transform the level catalog.
  await expect(facility).toBeEnabled({ timeout: 30000 }); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
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

test('a new save wakes in Orientation, an untimed facility area', async ({ page }) => {
  test.setTimeout(120000)
  await openFacility(page)
  await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeVisible()
  // The robot wakes in the pod; wait until its status says so before playing out the awakening.
  await expect.poll(async () => { await page.clock.runFor(16); return page.locator('.jumping-state').innerText() }, { timeout: 20000 }).toBe('Waking up')
  await finishJumpingEntrance(page)
  await expect(page.getByTestId('level-time'), 'the opening has no clock').toHaveCount(0)
  expect(await saved(page), 'the opening autosaves like any facility area').toEqual({ place: { kind: 'hub', level: 'lab-orientation', arrival: { kind: 'entrance' } } })
  // The robot walks along the pit toward the rope through the broken floor.
  await walkTo(page, 1000)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused' }).getByRole('button')).toHaveText(['Resume Esc', 'Restart area', 'Controls', 'Level studio', 'Back to arcade'])
})

test('the concourse and Orientation join through bulkheads, arriving at the far end of each', async ({ page }, info) => {
  test.setTimeout(240000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await openFacility(page, {}, { kind: 'hub', level: 'facility-concourse', arrival: { kind: 'door', id: 'concourse-to-opening' } })
  const concourse = page.getByRole('img', { name: 'Concourse', exact: true })
  await expect(concourse).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - toOrientation.x), 'steps out of the Orientation bulkhead').toBeLessThan(16)
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('concourse-orientation.png') })

  await advanceJumpingSimulation(page, 300); await pressUp(page); await advanceJumpingSimulation(page, 1200)
  await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeVisible()
  expect(await saved(page)).toEqual({ place: { kind: 'hub', level: 'lab-orientation', arrival: { kind: 'door', id: 'orientation-to-concourse' } } })
  await finishJumpingEntrance(page)
  // Orientation's bulkhead is Service access, on the gantry at its far end.
  expect(Math.round((await motion(page)).y)).toBe(350)
  expect(Math.abs((await motion(page)).x - 8355), 'steps out of Service access').toBeLessThan(16)
  await expect(page.getByTestId('level-time'), 'Orientation stays untimed').toHaveCount(0)
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('orientation-service-access.png') })

  await advanceJumpingSimulation(page, 300); await pressUp(page); await advanceJumpingSimulation(page, 1200)
  await expect(concourse).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - toOrientation.x), 'back out of the Orientation bulkhead').toBeLessThan(16)
  expect(errors).toEqual([])
})

test('a returning save resumes at its autosaved bulkhead, where locked doors stay shut', async ({ page }) => {
  test.setTimeout(120000)
  await openFacility(page, {}, { kind: 'hub', level: 'facility-movement', arrival: { kind: 'door', id: 'movement-to-concourse' } })
  const wing = page.getByRole('img', { name: 'Movement wing', exact: true })
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - 200), 'stepped out of the saved bulkhead').toBeLessThan(16)
  // A Bigger Swing waits for a pass on Hop Skip Jump I.
  await walkTo(page, 1150); await pressUp(page); await advanceJumpingSimulation(page, 1200)
  await expect(wing).toBeVisible()
  expect(Math.abs((await motion(page)).x - 1150)).toBeLessThan(16)
})
