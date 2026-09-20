import { test, expect } from './helpers/test.mjs'
import { setup, tap } from './helpers/controller.mjs'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'

async function captureFloor(page) {
  await page.addInitScript(()=>{
    window.floorWords=[]
    const original=CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText=function(text,...args) {
      if(!window.floorWords.includes(text))window.floorWords.push(text)
      return original.call(this,text,...args)
    }
  })
}
test('keyboard training has floor instructions, minimal HUD, working menus and never touches the saved expedition',async({page},info)=>{
  const state=freshExpedition();state.banked=4567;const bytes=JSON.stringify(state)
  await page.addInitScript(({key,bytes})=>{localStorage.setItem(key,bytes);localStorage.setItem(`${key}-backup`,bytes)},{key:SAVE_KEY,bytes})
  await captureFloor(page)
  await page.clock.install();await page.goto('/hard-vacuum')
  await page.getByRole('button',{name:'Flight training',exact:true}).press('Enter')
  await expect(page.locator('.hud-room')).toHaveText('Flight training')
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(100)
  await expect(page.getByText('Hull exposed',{exact:true})).toBeVisible()
  await expect(page.getByRole('meter')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Station map',exact:true})).toHaveCount(0)
  expect(await page.evaluate(()=>window.floorWords)).toContain('HOLD Space  CUTTING LASER')
  await page.screenshot({path:info.outputPath('training-flight.png')})
  await page.keyboard.press('w',{delay:100});await page.keyboard.press('f');await page.clock.runFor(100)
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Training paused'})).toBeVisible()
  await page.keyboard.press('ArrowRight');await expect(page.getByRole('button',{name:'Restart simulation'})).toBeFocused()
  await page.keyboard.press('Enter');await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.press('g');await expect(page.getByText('No recordings downloaded',{exact:true})).toBeVisible()
  await page.keyboard.press('Escape');await page.keyboard.press('Escape')
  await page.clock.runFor(3500)
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe(bytes)
  expect(await page.evaluate(key=>localStorage.getItem(`${key}-backup`),SAVE_KEY)).toBe(bytes)
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Leave training'}).press('Enter')
  await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe(bytes)
})

test('training is available with an unreadable save and leaving preserves the original bytes',async({page})=>{
  await page.addInitScript(key=>localStorage.setItem(key,'broken save — keep me'),SAVE_KEY)
  await page.goto('/hard-vacuum');await page.getByRole('button',{name:'Flight training',exact:true}).click()
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Leave training'}).click()
  expect(await page.evaluate(key=>localStorage.getItem(key),SAVE_KEY)).toBe('broken save — keep me')
  await expect(page.getByRole('button',{name:'Launch expedition',exact:true})).toHaveCount(0)
})

test('controller enters training, updates floor bindings, navigates reset and leave, and disconnect pauses safely',async({page})=>{
  await captureFloor(page);await setup(page)
  await tap(page,15);await expect(page.getByRole('button',{name:'Flight training',exact:true})).toBeFocused()
  await tap(page,0);await page.clock.runFor(100)
  await expect(page.locator('.hud-room')).toHaveText('Flight training')
  expect(await page.evaluate(()=>window.floorWords)).toContain('HOLD A / ×  CUTTING LASER')
  expect(await page.evaluate(()=>window.floorWords)).toContain('RT / R2  THRUST     LT / L2  REVERSE')
  await tap(page,9);await expect(page.getByRole('dialog',{name:'Training paused'})).toBeVisible()
  await tap(page,15);await expect(page.getByRole('button',{name:'Restart simulation'})).toBeFocused()
  await tap(page,0);await expect(page.locator('canvas')).toBeFocused()
  await page.evaluate(()=>{window.testPad.connected=false;window.floorWords=[]});await page.clock.runFor(100)
  await expect(page.getByRole('dialog',{name:'Training paused'})).toBeVisible()
  expect(await page.evaluate(()=>window.floorWords)).toContain('HOLD Space  CUTTING LASER')
  await page.evaluate(()=>{window.testPad.connected=true});await page.clock.runFor(100)
  await tap(page,15);await tap(page,15);await expect(page.getByRole('button',{name:'Leave training'})).toBeFocused()
  await tap(page,0);await expect(page.getByRole('button',{name:'Continue expedition',exact:true})).toBeVisible()
})
