import { expect, test } from './helpers/test.mjs'
import { setup, tap, armed } from './helpers/controller.mjs'
import { freshExpedition } from '../../src/games/hardVacuum/expedition.ts'

const connection = async (page, connected) => {
  await page.evaluate(connected => { window.testPad.connected = connected }, connected)
  await page.clock.runFor(64)
}

test('menu hints switch live without losing selection and keyboard use does not change controller hints', async ({ page }, testInfo) => {
  await setup(page)
  const help = page.locator('.game-dialog .menu-help')
  await expect(help).toContainText('A / ×')
  await expect(help).not.toContainText('Enter')
  const back = page.getByRole('button', { name: 'Back · B / ○', exact: true })
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await expect(back).toBeFocused()
  await expect(help).not.toContainText('Esc')
  await connection(page, false)
  await expect(page.getByRole('button', { name: 'Back · Esc', exact: true })).toBeFocused()
  await expect(help).toContainText('Enter / Space')
  await expect(help).not.toContainText('D-pad')
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Keyboard', exact: true })).toBeVisible()
  await connection(page, true)
  await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Keyboard', exact: true })).toHaveCount(0)
  await expect(page.locator('#flight-controls')).toContainText('RT / R2')
  await expect(page.locator('#flight-controls')).toContainText('LB / L1 · Strafe left')
  await expect(page.locator('#flight-controls')).toContainText('RB / R1 · Strafe right')
  await expect(page.locator('#flight-controls')).toContainText('X / □ · Grapple / release')
  await expect(page.locator('#flight-controls')).toContainText('Y / △ · Dock / call Haven nearby; teleport elsewhere')
  await expect(page.locator('#flight-controls')).not.toContainText('Space · Laser')
  await page.screenshot({ path: testInfo.outputPath('controller-controls.png') })
})

test('confirmation prompts update on reconnect while preserving the safe default', async ({ page }) => {
  await setup(page); await connection(page, false)
  await page.getByRole('button', { name: 'Start a new expedition…', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cancel · Esc', exact: true })).toBeFocused()
  await connection(page, true)
  await expect(page.getByRole('button', { name: 'Cancel · B / ○', exact: true })).toBeFocused()
  await expect(page.getByRole('alertdialog').locator('.menu-help')).not.toContainText('Esc')
  await tap(page, 1)
  await expect(page.getByRole('button', { name: 'Start a new expedition…', exact: true })).toBeFocused()
})

test('HUD, map and equipment show real controller bindings and revert on disconnect', async ({ page }, testInfo) => {
  const state = armed(); state.teleporterInstalled = true
  await page.setViewportSize({ width: 620, height: 700 })
  await setup(page, state); await tap(page, 0)
  const map = page.getByRole('button', { name: 'Station map', exact: true })
  await expect(map).toContainText('View / Share')
  await expect(map).not.toHaveAttribute('title')
  await expect(page.getByRole('button', { name: 'Flight recorder', exact: true })).toContainText('RS click / R3')
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toContainText('Menu / Options')
  await expect(page.getByRole('button', { name: 'Teleport to Haven', exact: true })).toContainText('Y / △')
  await expect(page.locator('.hud-instrument').filter({ hasText: 'Blaster' })).toContainText('B / ○')
  await expect(page.getByRole('button', { name: 'Fire laser', exact: true })).toContainText('A / ×')
  await expect(page.getByRole('button', { name: 'Thrust', exact: true })).toContainText('RT / R2')
  await page.screenshot({ path: testInfo.outputPath('controller-hud.png') })
  await page.keyboard.press('m'); await page.clock.runFor(64)
  await expect(page.getByRole('button', { name: 'Station overview · Y / △', exact: true })).toBeFocused()
  await page.keyboard.press('z')
  await expect(page.getByText('Pan · Left stick', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').locator('.menu-help')).not.toContainText('WASD')
  await connection(page, false)
  // Disconnection still safely pauses flight and closes the map.
  await expect(page.getByRole('button', { name: 'Resume · P / Esc', exact: true })).toBeVisible()
  await page.keyboard.press('Escape'); await page.clock.runFor(64)
  await expect(map).not.toHaveAttribute('title')
  await expect(map).toContainText('M')
  await expect(map).not.toContainText('View / Share')
  await expect(page.getByRole('button', { name: 'Fire laser', exact: true })).toContainText('Space')
  await page.keyboard.press('m'); await page.keyboard.press('z'); await page.keyboard.press('z')
  await expect(page.getByText('Pan · WASD / drag', { exact: true })).toBeVisible()
})

test('station exploration and pause do not broadcast tutorial lessons or objective instructions', async ({ page }) => {
  const state = freshExpedition(); state.position = { x: 7130, y: 3590 }
  await setup(page, state); await tap(page, 0)
  const lesson = page.getByRole('status').filter({ hasText: 'TETHER LINK' })
  await expect(lesson).toHaveCount(0)
  await page.keyboard.press('p')
  await expect(page.getByRole('dialog')).not.toContainText('press X / □ to grapple')
  await connection(page, false)
  await expect(page.getByRole('dialog')).not.toContainText('press F to grapple')
})

test('docking is written on the floor with the current binding, never a floating button', async ({ page }) => {
  await page.addInitScript(()=>{
    window.dockWords=[]
    const original=CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText=function(text,...args) {
      if(text.startsWith('Dock · ') && !window.dockWords.includes(text))window.dockWords.push(text)
      return original.call(this,text,...args)
    }
  })
  await setup(page); await tap(page, 0)
  expect(await page.evaluate(()=>window.dockWords)).toContain('Dock · Y / △')
  await expect(page.getByRole('button', { name: /^Dock ·/ })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.evaluate(()=>{window.dockWords=[]})
  await connection(page, false)
  await page.keyboard.press('Escape'); await page.clock.runFor(64)
  expect(await page.evaluate(()=>window.dockWords)).toEqual(['Dock · E'])
  await page.keyboard.press('e');await page.clock.runFor(1600)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toBeVisible()
})

test('the floor docking label can be tapped on a small screen without a floating prompt',async({page})=>{
  await page.setViewportSize({width:620,height:700})
  const state=freshExpedition();state.position={...state.campaign.haven}
  await setup(page,state);await tap(page,0)
  await page.mouse.click(310,280);await page.clock.runFor(64)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toHaveCount(0)
  await page.mouse.click(310,350);await page.clock.runFor(1600)
  await expect(page.getByRole('heading',{name:'Haven outfitter'})).toBeVisible()
})

test('arcade and loading prompts follow connection state; unsupported pads keep keyboard hints', async ({ page }) => {
  await setup(page, freshExpedition(), 'standard', '/')
  const help = page.locator('.menu-help')
  await expect(help).toContainText('A / ×'); await expect(help).not.toContainText('Enter')
  await connection(page, false)
  await expect(help).toContainText('Enter'); await expect(help).not.toContainText('D-pad')
  await connection(page, true)
  await page.evaluate(() => { window.testPad.mapping = '' }); await page.clock.runFor(64)
  await expect(help).toContainText('Enter')
  await page.evaluate(() => { window.testPad.mapping = 'standard' }); await page.clock.runFor(64)
  let release
  const pending = new Promise(resolve => { release = resolve })
  await page.route('**/assets/HardVacuumGame-*.js', async route => { await pending; await route.abort('failed') })
  try {
    await tap(page, 0)
    await expect(page.getByRole('dialog', { name: 'Loading game', exact: true }).locator('.menu-help')).toHaveText('B / ○ Back')
    await connection(page, false)
    await expect(help).toHaveText('Esc Back')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Hard Vacuum', exact: true })).toBeFocused()
  } finally { release() }
})
