import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation, withoutIntermediateFrames } from './helpers/simulation.mjs'
import { readFileSync } from 'node:fs'
import { formatTime } from '../../src/games/jumping/challenge.ts'
import { gradeTimes } from '../../src/games/jumping/grading.ts'
import { parseCampaign } from '../../src/games/jumping/campaign.ts'
import { resolveCampaign } from '../../src/games/jumping/facility.ts'
import { parseLevel } from '../../src/games/jumping/level.ts'

// The concourse's bulkhead to Orientation, wherever the layout puts it.
const concourse = JSON.parse(readFileSync(new URL('../../public/levels/jumping/Concourse.jump-level.json', import.meta.url), 'utf8'))
const toOrientation = concourse.bulkheads.find(bulkhead => bulkhead.id === 'concourse-to-opening')
// The first wing and its second course's door, wherever the layout puts them.
const levels = new URL('../../public/levels/jumping/', import.meta.url)
const byId = new Map(JSON.parse(readFileSync(new URL('index.json', levels), 'utf8')).levels
  .map(file => parseLevel(JSON.parse(readFileSync(new URL(encodeURIComponent(file), levels), 'utf8')))).map(level => [level.id, level]))
const campaign = resolveCampaign(parseCampaign(JSON.parse(readFileSync(new URL('../jumping-campaign.json', levels), 'utf8'))), byId)
const firstWing = byId.get(campaign.wings[0].level)
const [firstCourse, secondCourse] = campaign.wings[0].courses.map(id => byId.get(id))
const secondDoor = firstWing.courseDoors.find(door => door.course === secondCourse.id)

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.facility.v1')))
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

/**
 * Opens L.A.B. at /lab with a paused clock, saved course records and an autosaved place, then continues
 * from the start screen to /lab/facility unless `stop` is set. With `path: '/lab/facility'` it opens the
 * facility's own address, which has no start screen. The campaign is held back until the clock is
 * paused, so the facility starts from a still clock.
 */
async function openFacility(page, { completed = {}, times = {}, place, stop = false, path = '/lab' } = {}) {
  await page.addInitScript(([completed, times, place]) => {
    if (sessionStorage.getItem('facility-test-seeded')) return
    sessionStorage.setItem('facility-test-seeded', '1')
    localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(completed))
    localStorage.setItem('arcade.jumping.times.v1', JSON.stringify(times))
    if (place) localStorage.setItem('arcade.jumping.facility.v1', JSON.stringify({ place }))
    else localStorage.removeItem('arcade.jumping.facility.v1')
  }, [completed, times, place])
  let release
  const campaignReady = new Promise(resolve => { release = resolve })
  await page.route('**/levels/jumping-campaign.json', async route => { await campaignReady; await route.continue() })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto(`${path}?motionDebug=1&renderControl=1`)
  // A cold development server can take a while to transform the level catalog.
  await expect(page.getByRole('dialog', { name: 'Opening the facility', exact: true })).toBeVisible({ timeout: 30000 })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  release()
  const start = page.getByRole('dialog', { name: 'Game start', exact: true })
  if (path !== '/lab') return start
  await expect(page).toHaveURL(/\/lab\?/)
  // The start screen waits over the robot's place.
  await expect(start).toBeVisible({ timeout: 30000 })
  if (!stop) {
    await start.getByRole('button').first().click(); await expect(start).toHaveCount(0)
    await expect(page, 'play moves to the facility’s own address, keeping debug options').toHaveURL(/\/lab\/facility\?motionDebug=1&renderControl=1$/)
  }
  return start
}
/** A save with the first wing's first course passed at its A time, resting at the wing's first bulkhead. */
const returning = { completed: { [firstCourse.id]: true }, times: { [firstCourse.id]: gradeTimes(firstCourse).a },
  place: { kind: 'hub', level: firstWing.id, arrival: { kind: 'door', id: firstWing.bulkheads[0].id } } }
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

test('a new save wakes in Orientation, an untimed facility area', async ({ page }, info) => {
  test.setTimeout(120000)
  const start = await openFacility(page, { stop: true })
  // A new save can only start: there is nothing to continue, review or erase.
  await expect(start.getByRole('heading', { level: 2 })).toHaveText('Online.')
  // It is a title screen: the L.A.B. mark, over the whole view.
  await expect(start.getByRole('img', { name: 'L.A.B. Experiments', exact: true })).toBeVisible()
  expect(await start.locator('.jumping-start').boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize() })
  await expect(start.getByRole('button')).toHaveText(['Start Esc', 'Controls', 'Level studio', 'Back to arcade'])
  await expect(start.getByRole('button', { name: 'Start', exact: false })).toBeFocused()
  await page.screenshot({ path: info.outputPath('start-new-save.png') })
  await page.keyboard.press('Enter')
  await expect(start).toHaveCount(0)
  await expect(page).toHaveURL(/\/lab\/facility\?/)
  await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeFocused()
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
  await openFacility(page, { place: { kind: 'hub', level: 'facility-concourse', arrival: { kind: 'door', id: 'concourse-to-opening' } } })
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
  const bulkhead = firstWing.bulkheads[0]
  await openFacility(page, { place: { kind: 'hub', level: firstWing.id, arrival: { kind: 'door', id: bulkhead.id } } })
  const wing = page.getByRole('img', { name: firstWing.name, exact: true })
  await expect(wing).toBeVisible(); await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - bulkhead.x), 'stepped out of the saved bulkhead').toBeLessThan(16)
  // The wing's second door waits for a pass on its first.
  await walkTo(page, secondDoor.x); await pressUp(page); await advanceJumpingSimulation(page, 1200)
  await expect(wing).toBeVisible()
  expect(Math.abs((await motion(page)).x - secondDoor.x)).toBeLessThan(16)
})

test('a returning save opens on the start screen, which shows the evaluation so far and continues in place', async ({ page }, info) => {
  test.setTimeout(120000)
  const start = await openFacility(page, { ...returning, stop: true })
  await expect(start.getByRole('button')).toHaveText(['Continue Esc', 'Progress', 'Restart', 'Controls', 'Level studio', 'Back to arcade'])
  await expect(start.locator('.jumping-dialog-kicker')).toHaveText(firstWing.name)
  await page.screenshot({ path: info.outputPath('start-returning.png') })

  await start.getByRole('button', { name: 'Progress', exact: true }).click()
  await expect(start.getByRole('heading', { level: 2 })).toHaveText('Progress.')
  const report = start.getByRole('region', { name: 'Evaluation progress', exact: true })
  const required = campaign.wings.reduce((total, wing) => total + wing.courses.length, 0)
  await expect(report.locator('.jumping-start-total')).toHaveText(`Evaluation 1 / ${required}`)
  // The first wing: its first course passed with its A time, the next door open with its deadline, the rest dark.
  const wing = report.getByRole('region', { name: firstWing.name, exact: true })
  await expect(wing.getByRole('heading', { level: 3 })).toHaveText(`${firstWing.name} 1/${campaign.wings[0].courses.length}`)
  await expect(wing.getByRole('listitem')).toHaveText([
    `${firstCourse.name} ${formatTime(gradeTimes(firstCourse).a)} A`,
    `${secondCourse.name} D ${formatTime(gradeTimes(secondCourse).d).replace(/\.00$/, '')} to pass`,
    ...campaign.wings[0].courses.slice(2).map(() => 'Locked'),
  ])
  await expect(start.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('start-progress.png') })

  // Escape steps back to the menu, then continues, as the pause screen resumes.
  await page.keyboard.press('Escape')
  await expect(start.getByRole('button', { name: 'Progress', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(start).toHaveCount(0)
  await expect(page).toHaveURL(/\/lab\/facility\?/)
  const wingCanvas = page.getByRole('img', { name: firstWing.name, exact: true })
  await expect(wingCanvas).toBeFocused()
  await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - firstWing.bulkheads[0].x), 'stepped out of the saved bulkhead').toBeLessThan(16)

  // Back returns to the start screen over the robot where it stands, and Continue plays on from there:
  // neither reloads the area, which would put the robot back at its bulkhead.
  await walkTo(page, secondDoor.x)
  await page.goBack()
  await expect(page).toHaveURL(/\/lab\?/)
  await expect(start.getByRole('button')).toHaveText(['Continue Esc', 'Progress', 'Restart', 'Controls', 'Level studio', 'Back to arcade'])
  await expect(page.getByRole('dialog', { name: 'Preparing level' })).toHaveCount(0)
  await start.getByRole('button', { name: 'Continue', exact: false }).click()
  await expect(page).toHaveURL(/\/lab\/facility\?/)
  await expect(wingCanvas).toBeFocused()
  await advanceJumpingSimulation(page, 300)
  expect(Math.abs((await motion(page)).x - secondDoor.x), 'still where it stood').toBeLessThan(16)
})

test('the facility’s own address resumes in place without the start screen', async ({ page }) => {
  test.setTimeout(120000)
  await openFacility(page, { ...returning, path: '/lab/facility' })
  const wing = page.getByRole('img', { name: firstWing.name, exact: true })
  await expect(wing).toBeFocused({ timeout: 30000 })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/lab\/facility\?/)
  await finishJumpingEntrance(page)
  expect(Math.abs((await motion(page)).x - firstWing.bulkheads[0].x), 'stepped out of the saved bulkhead').toBeLessThan(16)
})

test('restart asks first, then erases the save and wakes in Orientation', async ({ page }, info) => {
  test.setTimeout(120000)
  const start = await openFacility(page, { ...returning, stop: true })
  const confirm = page.getByRole('alertdialog', { name: 'Restart the game', exact: true })
  await start.getByRole('button', { name: 'Restart', exact: false }).click()
  await expect(confirm.getByRole('heading', { level: 2 })).toHaveText('Restart?')
  await expect(confirm).toContainText('Every passed course, every best time and the robot’s place will be erased. The robot wakes again in Orientation.')
  // Cancel is the default; Escape cancels too.
  await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('start-restart.png') })
  await page.keyboard.press('Escape')
  await expect(start.getByRole('button', { name: 'Continue', exact: false })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))), 'nothing erased yet').toEqual(returning.times)

  await start.getByRole('button', { name: 'Restart', exact: false }).click()
  await confirm.getByRole('button', { name: 'Erase progress and restart', exact: true }).click()
  await expect(page).toHaveURL(/\/lab\/facility\?/)
  await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeFocused({ timeout: 30000 })
  await expect(page.getByRole('dialog'), 'the restart goes straight to play').toHaveCount(0)
  expect(await page.evaluate(() => [localStorage.getItem('arcade.jumping.times.v1'), localStorage.getItem('arcade.jumping.completed.v1')])).toEqual([null, null])
  expect(await saved(page), 'a new place is saved in the opening').toEqual({ place: { kind: 'hub', level: 'lab-orientation', arrival: { kind: 'entrance' } } })
  await expect.poll(async () => { await page.clock.runFor(16); return page.locator('.jumping-state').innerText() }, { timeout: 20000 }).toBe('Waking up')
})

test('a facility area keeps its state between visits, and Restart area puts it back as authored', async ({ page }) => {
  test.setTimeout(120000)
  const concourseId = 'facility-concourse', areas = () => page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.areas.v1') ?? '{}'))
  await openFacility(page, { place: { kind: 'hub', level: concourseId, arrival: { kind: 'door', id: 'concourse-to-opening' } } })
  const concourseCanvas = page.getByRole('img', { name: 'Concourse', exact: true }), paused = page.getByRole('dialog', { name: 'Game paused', exact: true })
  await expect(concourseCanvas).toBeFocused()
  await finishJumpingEntrance(page)
  // Pausing saves the area as it stands: both pools are full, as authored.
  await page.keyboard.press('Escape'); await expect(paused).toBeVisible()
  const saved = (await areas())[concourseId]
  expect(saved.water).toEqual([100, 100])
  expect(saved.props).toHaveLength(concourse.props.length + concourse.floatSwitches.length)
  // As if an earlier visit had drained the lower pool, open the facility's address afresh.
  await page.evaluate(([id, state]) => localStorage.setItem('arcade.jumping.areas.v1', JSON.stringify({ [id]: state })), [concourseId, { ...saved, water: [40, 100] }])
  await page.clock.resume()
  await page.goto('/lab/facility?motionDebug=1&renderControl=1')
  await expect(concourseCanvas).toBeFocused({ timeout: 30000 })
  await page.keyboard.press('Escape'); await expect(paused).toBeVisible()
  expect((await areas())[concourseId].water, 'the drained pool came back drained').toEqual([40, 100])
  // Restart area is the way back to the authored layout, and forgets the saved state.
  await paused.getByRole('button', { name: 'Restart area', exact: false }).click()
  await expect(concourseCanvas).toBeFocused()
  await page.keyboard.press('Escape'); await expect(paused).toBeVisible()
  expect((await areas())[concourseId].water).toEqual([100, 100])
})
