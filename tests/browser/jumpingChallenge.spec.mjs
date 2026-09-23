import { test, expect } from './helpers/test.mjs'
import { hold } from './helpers/controller.mjs'

async function setup(page, lesson = 0) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && (args[1] === 920 || args[1] === 1080) && args[2] >= 1000) window.levelCamera = this.getTransform()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && window.levelCamera) {
        const body = this.getTransform(), camera = window.levelCamera
        window.levelPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('button', { name: 'Start level', exact: false })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  if (lesson) await page.getByRole('button', { name: `Level ${lesson + 1}:`, exact: false }).click()
}
const position = page => page.evaluate(() => window.levelPlayer)
async function enter(page) { await page.getByRole('button', { name: 'Start level' }).click(); await page.clock.runFor(64) }
async function launch(page) {
  await page.keyboard.down('d'); await page.keyboard.down('Space')
  for (let i = 0; i < 150 && (await position(page)).x < 533; i++) await page.clock.runFor(16)
  await page.keyboard.up('Space'); await page.keyboard.down('w')
}
async function finishFirst(page) {
  await launch(page); await page.clock.runFor(2400); await page.keyboard.up('d'); await page.keyboard.up('w')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
}

test('the new level menu presents a readable progression', async ({ page }, info) => {
  await setup(page); await page.screenshot({ path: info.outputPath('campaign-menu.png') })
  await expect(page.getByRole('button', { name: 'Level 1: First Leap' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Level 3: Hand Over Hand' }).click()
  await expect(page.locator('.jumping-level-detail')).toContainText('Transfer from the first rope')
})
test('the trial waits, pauses, restarts, completes, saves a best and advances to the next lesson', async ({ page }, info) => {
  await setup(page); await enter(page)
  await page.clock.runFor(1500); await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.keyboard.down('d'); await page.clock.runFor(400); await page.keyboard.up('d')
  await page.keyboard.press('Escape'); await page.clock.runFor(5000)
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(100)
  expect(await page.getByTestId('level-time').innerText()).toMatch(/^0:00\./)
  await page.keyboard.press('r'); await page.clock.runFor(100); expect((await position(page)).x).toBeCloseTo(170)
  await page.screenshot({ path: info.outputPath('first-leap.png') })
  await finishFirst(page); await expect(page.getByText('Gold medal')).toBeVisible()
  await page.screenshot({ path: info.outputPath('first-leap-medal.png') })
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))['first-leap'])
  expect(record).toBeGreaterThan(2); expect(record).toBeLessThan(3.5)
  await page.getByRole('button', { name: 'Next level' }).click(); await page.clock.runFor(100)
  await expect(page.getByRole('img', { name: 'A Little Swing: reach the flag' })).toBeFocused()
  expect((await position(page)).x).toBeCloseTo(170); await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.clock.resume(); await page.reload(); await expect(page.getByText(/Gold · 0:02/)).toBeVisible()
})
for (const lesson of [1, 2]) test(`lesson ${lesson + 1} can be completed with ${lesson} rope${lesson > 1 ? 's' : ''} using the keyboard`, async ({ page }, info) => {
  test.setTimeout(90000); await setup(page, lesson); await enter(page); await launch(page)
  for (let rope = 0; rope < lesson; rope++) {
    for (let i = 0; i < 120 && !(await page.locator('.jumping-state').innerText()).startsWith('Rope'); i++) await page.clock.runFor(32)
    await expect(page.locator('.jumping-state')).toContainText('Rope')
    await page.keyboard.up('d')
    const climbY = lesson === 1 ? 380 : 330
    for (let i = 0; i < 200 && (await position(page)).y > climbY; i++) await page.clock.runFor(16)
    await page.keyboard.up('w'); await page.keyboard.down('d')
    const anchor = lesson === 1 ? 850 : rope === 0 ? 810 : 1140
    let previous = await position(page), forward = false
    for (let i = 0; i < 180; i++) {
      await page.clock.runFor(32)
      const current = await position(page)
      forward = i >= 7 && current.x > anchor + 55 && (current.x - previous.x) / .032 > 120
      previous = current
      if (forward) break
    }
    expect(forward).toBe(true)
    await page.screenshot({ path: info.outputPath(`lesson-${lesson + 1}-rope-${rope + 1}.png`) })
    await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space'); await page.keyboard.down('w'); await page.clock.runFor(160)
  }
  await page.clock.runFor(5000); await page.keyboard.up('d'); await page.keyboard.up('w')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
  expect(await page.getByText(/^(Gold|Silver|Bronze) medal$/).count()).toBe(1)
})
test('a fall is recoverable by the ladder and does not restart the clock', async ({ page }) => {
  await setup(page); await enter(page)
  await page.keyboard.down('d'); await page.clock.runFor(1400); await page.keyboard.up('d'); await page.clock.runFor(1300)
  expect((await position(page)).y).toBeCloseTo(920)
  await page.keyboard.down('a')
  for (let i = 0; i < 80 && (await position(page)).x > 578; i++) await page.clock.runFor(16)
  await page.keyboard.up('a'); await page.keyboard.down('w'); await page.clock.runFor(6500); await page.keyboard.up('w')
  expect((await position(page)).y).toBeCloseTo(520); expect((await position(page)).x).toBeLessThan(560)
  await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
})
for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} braces, falls, and jumps away on a fresh press`, async ({ page }, info) => {
  if (controller) await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Wall brace controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
  })
  await setup(page); await enter(page)
  const jump = async (down, ms) => {
    if (controller) await hold(page, 0, Number(down), ms)
    else {
      await page.keyboard[down ? 'down' : 'up']('Space')
      await page.clock.runFor(ms)
    }
  }
  if (controller) await page.evaluate(() => { window.testPad.axes[0] = 1 })
  else await page.keyboard.down('d')
  await page.clock.runFor(2400)
  expect((await position(page)).y).toBeCloseTo(920)
  expect((await position(page)).x).toBeGreaterThan(850)
  await jump(true, 400); await jump(false, 440)
  const before = await position(page)
  expect(before.y).toBeLessThan(815)
  expect(before.x).toBeCloseTo(868)
  await expect(page.locator('.jumping-state')).toHaveText('Bracing')
  await page.clock.runFor(400)
  expect((await position(page)).x).toBeCloseTo(868)
  await expect(page.locator('.jumping-state')).toHaveText('Bracing')
  await page.screenshot({ path: info.outputPath('wall-brace.png') })
  const falling = await position(page)
  await page.clock.runFor(120)
  expect((await position(page)).y).toBeGreaterThan(falling.y + 15)
  expect((await position(page)).x).toBeCloseTo(868)
  const beforeKick = await position(page)
  await jump(true, 100) // Holding toward the wall must not cancel the outward kick.
  expect((await position(page)).x).toBeLessThan(beforeKick.x - 25)
  expect((await position(page)).y).toBeLessThan(beforeKick.y - 40)
  await expect(page.locator('.jumping-state')).toHaveText('Wall jump')
  await page.screenshot({ path: info.outputPath('wall-jump.png') })
  const kicked = await position(page)
  await jump(false, 300)
  expect((await position(page)).x).toBeLessThan(kicked.x - 65)
  const apex = await position(page)
  await page.clock.runFor(200)
  expect((await position(page)).x).toBeLessThan(apex.x - 25)
  expect((await position(page)).y).toBeGreaterThan(apex.y)
  await page.clock.runFor(600)
  expect((await position(page)).y).toBeCloseTo(920)
  await expect(page.locator('.jumping-state')).not.toHaveText('Bracing')
})
test('the experiment shows the redesigned props and the game remains usable on a narrow screen', async ({ page }, info) => {
  await setup(page); await page.getByRole('button', { name: 'Counterweight Yard · experiment' }).click(); await enter(page)
  await page.screenshot({ path: info.outputPath('refined-props.png') })
  await page.setViewportSize({ width: 390, height: 740 }); await page.clock.runFor(100)
  await expect(page.getByRole('button', { name: /Restart/ })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('trial-mobile.png') })
})
