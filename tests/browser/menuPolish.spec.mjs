import { test, expect } from './helpers/test.mjs'
import { RECORDS, RETIRED_RECORD_IDS } from '../../src/games/hardVacuum/campaign.ts'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { SURVIVAL_PODS } from '../../src/games/hardVacuum/survivalPods.ts'
import { setup, tap, hold, armed } from './helpers/controller.mjs'
import { advanceSimulation } from './helpers/simulation.mjs'

test('Tab wraps in reading order, Home/End work, and focus cannot escape the dialog', async ({ page }) => {
  await setup(page)
  const launch = page.getByRole('button', { name: 'Continue expedition', exact: true })
  const controls = page.getByRole('button', { name: 'Controls', exact: true })
  await page.keyboard.press('Shift+Tab'); await expect(controls).toBeFocused()
  await page.keyboard.press('Tab'); await expect(launch).toBeFocused()
  await page.keyboard.press('End'); await expect(controls).toBeFocused()
  await page.keyboard.press('Home'); await expect(launch).toBeFocused()
  await page.keyboard.press('d'); await expect(page.getByRole('button', { name: 'Flight training', exact: true })).toBeFocused()
  await page.keyboard.press('a'); await expect(launch).toBeFocused()
  await page.locator('canvas').focus(); await expect(launch).toBeFocused()
  await page.keyboard.press('Enter'); await expect(page.locator('canvas')).toBeFocused()
})

test('held Enter cannot confirm a destructive choice on the next screen; Tab stays trapped', async ({ page }) => {
  await setup(page)
  const startNew = page.getByRole('button', { name: 'Start a new expedition…', exact: true })
  await startNew.focus(); await page.keyboard.down('Enter')
  const cancel = page.getByRole('button', { name: 'Cancel · B / ○', exact: true })
  await expect(cancel).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Start fresh', exact: true })).toBeFocused()
  await page.keyboard.down('Enter'); await page.clock.runFor(500)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.up('Enter')
  await page.keyboard.press('Tab'); await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape'); await expect(startNew).toBeFocused()
})

test('held flight keys cannot navigate pause until released', async ({ page }) => {
  await setup(page, armed()); await tap(page, 0)
  await page.keyboard.down('s'); await page.keyboard.press('p')
  const resume = page.getByRole('button', { name: 'Resume · B / ○', exact: true })
  await expect(resume).toBeFocused()
  await page.keyboard.down('s'); await expect(resume).toBeFocused()
  await page.keyboard.up('s'); await page.keyboard.press('s')
  await expect(page.getByRole('button', { name: 'Flight recorder', exact: true })).toBeFocused()
})

test('map arrows navigate consistently at both zoom levels and WASD pans without changing focus', async ({ page }) => {
  await setup(page, armed()); await tap(page, 0); await page.keyboard.press('m')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
  const zoom = page.getByRole('button', { name: 'Zoom · Fit · X / □', exact: true })
  await expect(zoom).toBeFocused()
  await page.keyboard.press('d'); await expect(zoom).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Close · B / ○', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(zoom).toBeFocused()
  await page.keyboard.press('Escape'); await expect(page.locator('canvas')).toBeFocused()
})

test('recorder contains shortcuts and returns to its initiating pause action', async ({ page }, testInfo) => {
  const state = armed(); state.campaign.records = RECORDS.map(record => record.id)
  await setup(page, state); await tap(page, 0); await page.keyboard.press('p')
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
  const recorder = page.getByRole('dialog', { name: 'Flight recorder', exact: true })
  for (const key of ['p', 'g', 'm', 'b', 't']) {
    await page.keyboard.press(key); await expect(recorder).toBeVisible()
  }
  await page.keyboard.press('Home'); await page.keyboard.press('Enter')
  await expect(recorder.locator('button:focus')).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: testInfo.outputPath('recorder.png') })
  await page.clock.runFor(64)
  await tap(page, 1)
  await expect(page.getByRole('button', { name: 'Flight recorder', exact: true })).toBeFocused()
})

test('old walkthrough downloads stay saved but the recorder only lists the remaining story logs',async({page})=>{
  const state=armed();state.campaign.records=[...RETIRED_RECORD_IDS,'first-light','tools-note']
  await setup(page,state);await tap(page,0);await page.keyboard.press('g')
  const recorder=page.getByRole('dialog',{name:'Flight recorder',exact:true})
  await expect(recorder).toBeVisible()
  await expect(recorder.locator('button[aria-pressed]')).toHaveCount(2)
  await expect(recorder.getByRole('button',{name:'A link to come back to',exact:true})).toBeVisible()
  await expect(recorder.getByRole('button',{name:'The last repair',exact:true})).toBeVisible()
  await expect(recorder).not.toContainText('A working berth')
  expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY)).campaign.records).toEqual(state.campaign.records)
})

test('keyboard purchase retains the upgrade selection and a held key buys only one stage', async ({ page }) => {
  const state = freshExpedition(); state.banked = 100000; state.blasterInstalled = true; state.blasterCharges = 3
  await setup(page, state); await tap(page, 0); await tap(page, 3); await page.clock.runFor(800)
  await page.keyboard.press('ArrowUp')
  const magazine = page.getByRole('button', { name: /Blaster magazine/ })
  await expect(magazine).toBeFocused()
  await page.keyboard.down(' '); await page.keyboard.down(' '); await page.clock.runFor(500)
  await expect(magazine).toBeFocused(); await expect(magazine).toContainText('4 shots → 5 shots')
  await page.keyboard.up(' '); await page.keyboard.press(' ')
  await expect(magazine).toContainText('5 shots → 6 shots')
})

test('failed save is a safe, self-contained controller dialog and Escape restores Save & exit', async ({ page }) => {
  await setup(page, armed()); await tap(page, 0); await tap(page, 9)
  await page.evaluate(key => {
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name.startsWith(key)) throw new DOMException('Full', 'QuotaExceededError')
      return write.call(this, name, value)
    }
  }, SAVE_KEY)
  const exit = page.getByRole('button', { name: 'Save & exit', exact: true })
  await exit.focus(); await hold(page, 0, 1, 600)
  await expect(page.getByRole('alertdialog', { name: 'Progress not saved', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go back · B / ○', exact: true })).toBeFocused()
  await hold(page, 0, 0); await page.keyboard.press('p')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(exit).toBeFocused()
  await page.clock.runFor(64)
  await tap(page, 0); await tap(page, 1); await expect(exit).toBeFocused()
})

test('completion screen supports keyboard wrap, controller selection and back to flight', async ({ page }, testInfo) => {
  const state = armed(); state.core = true; state.complete = true; state.rescuedPods = SURVIVAL_PODS.map(pod=>pod.id)
  await setup(page, state); await tap(page, 0)
  await expect(page.getByRole('dialog', { name: 'Expedition complete', exact: true })).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Save & exit', exact: true })).toBeFocused()
  await tap(page, 15)
  await expect(page.getByRole('button', { name: 'Keep exploring · B / ○', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('complete.png') })
  await tap(page, 1); await expect(page.locator('canvas')).toBeFocused()
})

test('ship recovery supports keyboard focus and controller return to the main menu', async ({ page }, testInfo) => {
  const state = freshExpedition(); state.position = { x: 1500, y: 4090 }; state.credits = 81
  await setup(page, state); await tap(page, 0)
  await advanceSimulation(page,12000)
  const dialog = page.getByRole('dialog', { name: 'Ship recovery', exact: true })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Respawn', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Main menu · B / ○', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('ship-recovery.png') })
  await tap(page, 1)
  await expect(page.getByRole('button', { name: 'Continue expedition', exact: true })).toBeFocused()
  await tap(page, 0); await expect(page.locator('canvas')).toBeFocused()
})

for (const viewport of [{ width: 360, height: 640 }, { width: 620, height: 360 }, { width: 1280, height: 800 }]) {
  test(`menus remain reachable at ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport); await setup(page)
    await page.screenshot({ path: testInfo.outputPath('main-menu.png') })
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Hard Vacuum', exact: true })
    for (let i = 0; i < 5; i++) await page.keyboard.press('PageDown')
    await expect(page.getByText('Standard-layout controllers supported.', { exact: false })).toBeInViewport()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('controls.png') })
    await tap(page, 1)
    await expect(page.getByRole('button', { name: 'Controls', exact: true })).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeInViewport()
    await page.keyboard.press('Home')
    await expect(page.getByRole('button', { name: 'Continue expedition', exact: true })).toBeInViewport()
    await page.getByRole('button', { name: 'Start a new expedition…', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Cancel · B / ○', exact: true })).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath('confirmation.png') })
  })
}

test('narrow outfitter keeps upgrade details, prices and selection inside the screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const state = freshExpedition(); state.banked = 100000
  await setup(page, state)
  // A disclosure left open on the title screen must not consume Back in a
  // different menu where that disclosure is no longer visible.
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await page.getByRole('button', { name: 'Continue expedition', exact: true }).focus()
  await tap(page, 0); await tap(page, 3); await page.clock.runFor(800)
  const dialog = page.getByRole('dialog', { name: 'Checkpoint upgrades', exact: true })
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('button', { name: /Laser focus I,/ })).toBeFocused()
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('outfitter-mobile.png') })
  await page.keyboard.press('Home'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Service berths', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: 'Undock · B / ○', exact: true })).toBeFocused()
  await tap(page, 1); await page.clock.runFor(800); await expect(page.locator('canvas')).toBeFocused()
})

test('controller can leave a loading screen without waiting for the game download', async ({ page }) => {
  await setup(page, freshExpedition(), 'standard', '/')
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/assets/HardVacuumGame-*.js', async route => { await gate; await route.abort('failed') })
  try {
    await tap(page, 0)
    await expect(page.getByRole('status')).toContainText('Loading game')
    await expect(page.getByRole('button', { name: 'Back to game selector', exact: true })).toBeFocused()
    await tap(page, 1)
    await expect(page.getByRole('button', { name: 'Hard Vacuum', exact: true })).toBeFocused()
  } finally { release() }
})

test('controller navigates a failed download and returns to the selected game', async ({ page }, testInfo) => {
  await setup(page, freshExpedition(), 'standard', '/')
  await page.route('**/assets/HardVacuumGame-*.js', route => route.abort('failed'))
  const failedDownload = page.waitForEvent('requestfailed', request => /HardVacuumGame-.*\.js/.test(request.url()))
  await tap(page, 0)
  await failedDownload
  // React defers replacing the Suspense fallback; advance the controlled
  // browser clock after the asynchronous network failure has arrived.
  await page.clock.runFor(1000)
  await expect(page.getByRole('alert')).toContainText('This game could not be loaded')
  await page.clock.runFor(64)
  await expect(page.getByRole('button', { name: 'Reload game', exact: true })).toBeFocused()
  await tap(page, 13)
  await expect(page.getByRole('button', { name: 'Back to game selector', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('failed-download.png') })
  await tap(page, 0)
  await expect(page.getByRole('button', { name: 'Hard Vacuum', exact: true })).toBeFocused()
})
