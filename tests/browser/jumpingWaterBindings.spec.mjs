import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { waterBindingLevel } from '../helpers/jumpingWaterBindings.mjs'

async function controls(page, device) {
  let keys = [], contacts = []
  const pointer = (type, id, x, y) => page.locator('canvas[tabindex="0"]').evaluate((canvas, event) => {
    canvas.dispatchEvent(new PointerEvent(event.type, { bubbles: true, pointerType: 'touch', pointerId: event.id,
      clientX: event.x, clientY: event.y, isPrimary: event.id === 31,
      buttons: event.type === 'pointerup' ? 0 : 1 }))
  }, { type, id, x, y })
  return async (intent = {}, ms = 64) => {
    if (device === 'keyboard') {
      for (const key of keys) await page.keyboard.up(key)
      keys = [intent.move > 0 ? 'd' : intent.move < 0 ? 'a' : null,
        intent.vertical > 0 ? 'ArrowUp' : intent.vertical < 0 ? 'ArrowDown' : null, intent.jump ? 'Space' : null].filter(Boolean)
      for (const key of keys) await page.keyboard.down(key)
    } else if (device === 'controller') {
      await page.evaluate(intent => {
        const indices = [intent.move > 0 ? 15 : intent.move < 0 ? 14 : -1,
          intent.vertical > 0 ? 12 : intent.vertical < 0 ? 13 : -1, intent.jump ? 0 : -1]
        window.testPad.buttons.forEach((b, i) => { b.pressed = indices.includes(i); b.value = Number(b.pressed) })
      }, intent)
    } else {
      for (const [id, x, y] of contacts) await pointer('pointerup', id, x, y)
      contacts = []
      const bounds = await page.locator('canvas[tabindex="0"]').boundingBox()
      const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2
      if (intent.move) {
        await pointer('pointerdown', 31, x, y); await pointer('pointermove', 31, x + intent.move * 40, y)
        contacts.push([31, x + intent.move * 40, y])
      }
      if (intent.vertical) {
        await pointer('pointerdown', 32, x, y); await pointer('pointermove', 32, x, y - intent.vertical * 40)
        contacts.push([32, x, y - intent.vertical * 40])
      }
      if (intent.jump) await page.touchscreen.tap(x, y)
    }
    await page.clock.runFor(ms)
  }
}

for (const device of ['keyboard', 'controller', 'touch']) test.describe(`${device} water capability`, () => {
  if (device === 'touch') test.use({ viewport: { width: 852, height: 393 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 })
  for (const kind of ['clear', 'float', 'grip', 'bank']) test(`${kind} uses ordinary bindings and truthful feedback`, async ({ page }, info) => {
    test.setTimeout(60000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [waterBindingLevel(kind)])
    if (device === 'controller') await page.addInitScript(() => {
      window.testPad = { index: 0, id: 'Water acceptance pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    })
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.goto('/untitled-jumping-game?motionDebug=1')
    const play = page.getByRole('button', { name: `Play Water ${kind} 1`, exact: true })
    await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await play.click(); await page.clock.runFor(64)
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    // The controller blocks buttons carried across menu/play transitions. Give
    // the committed, focused gameplay screen its released sampling frame.
    await page.clock.runFor(64)
    const input = await controls(page, device)
    const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    const samples = () => page.evaluate(() => window.jumpingMotion.read().recent)
    await input({ vertical: -1 }, 1000)
    expect((await state()).signals.grounded).toBe(true)
    expect((await state()).input.crouch).toBe(true)
    await input({}, 8000)
    expect((await state()).signals.grounded).toBe(false); expect((await state()).y).toBeLessThan(460)
    if (kind === 'clear') {
      const surface = (await state()).y
      await input({ vertical: -1 }, 1000)
      expect((await state()).y).toBeGreaterThan(surface + 50)
      await input({ vertical: 1 }, 1600)
      const rising = await state()
      expect(rising.vy).toBeGreaterThanOrEqual(-85.01); expect(rising.y).toBeLessThan(surface + 50)
      await expect(page.getByLabel('Available actions')).toContainText('turn upright and float')
      await input({}, 3000)
      const beforeJump = (await state()).y
      await input({ jump: true }, device === 'touch' ? 64 : 16); await input({}, 120)
      expect((await state()).y).toBeLessThan(beforeJump - 25)
      expect((await state()).vy).toBeLessThan(-100)
    } else if (kind === 'float') {
      await input({ move: 1 }, 2000)
      expect(['hang', 'mantle']).not.toContain((await state()).signals.mode)
      expect((await state()).blends.push).toBeGreaterThan(.5)
      await expect(page.getByLabel('Available actions')).toContainText('Move to push')
      await expect(page.getByLabel('Available actions')).not.toContainText('grip')
      await input({ move: 1, vertical: 1 }, 1000)
      expect(['hang', 'mantle']).not.toContain((await state()).signals.mode)
      if (device === 'touch') await expect(page.locator('.jumping-touch-contact')).toContainText(['Run →', 'Up ↑'])
    } else if (kind === 'grip') {
      await input({ jump: true }, device === 'touch' ? 64 : 16)
      await input({ vertical: 1 }, 900)
      const recent = await samples()
      expect(recent.some(s => s.signals.mode === 'hang')).toBe(true)
      expect(recent.some(s => s.signals.mode === 'mantle')).toBe(true)
      await input({ vertical: 1 }, 2100)
      expect((await state()).signals.grounded).toBe(true)
      expect((await state()).y).toBeCloseTo(350, 1)
    } else {
      await input({ move: 1, vertical: 1 }, 2000); await input({ vertical: 1 }, 1000)
      expect((await state()).signals.grounded).toBe(true)
      expect((await state()).y).toBeCloseTo(380, 1); expect((await state()).x).toBeGreaterThan(640)
    }
    await page.screenshot({ path: info.outputPath(`water-${device}-${kind}.png`) })
    if (kind === 'clear') {
      await input()
      if (device === 'touch') await page.getByRole('button', { name: 'Pause game', exact: true }).click()
      else await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Controls', exact: true }).click()
      const help = page.getByRole('region', { name: 'How to play' })
      await expect(help).toContainText('Up does not make you rise faster')
      await expect(help).toContainText('Only a stable supported crate offers a grip')
      await help.evaluate(el => { el.scrollTop = el.scrollHeight })
      await page.screenshot({ path: info.outputPath(`water-${device}-help.png`) })
    }
    expect(errors).toEqual([])
  })
})
