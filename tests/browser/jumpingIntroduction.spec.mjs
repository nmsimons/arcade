import { test, expect } from './helpers/test.mjs'

const sample = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
async function open(page, file, name) {
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') })
  await page.goto(`/untitled-jumping-game/levels/built-in/${file}?motionDebug=1`)
  await expect(page.getByRole('img', { name: `${name}: reach the exit`, exact: true })).toBeFocused()
  await page.clock.pauseAt(new Date('2026-10-08T13:00:00Z'))
  await page.clock.runFor(64)
}

test('First Leap shows its approach hint and accepts a normal held running jump in portrait', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '00.json', 'First Leap')
  await page.screenshot({ path: info.outputPath('first-leap-approach.png') })
  await page.keyboard.down('d'); await page.clock.runFor(1040)
  await page.keyboard.down('Space'); await page.clock.runFor(184)
  await page.keyboard.up('Space'); await page.clock.runFor(2400)
  await page.keyboard.up('d')
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await expect(complete).toBeVisible()
  await expect(complete.getByText('Gold medal', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('first-leap-complete.png') })
})

for (const [file, name] of [['00.json', 'First Leap'], ['02.json', 'A Little Swing']]) {
  test(`${name} shows its recovery hint and a missed approach returns through the ladder`, async ({ page }, info) => {
    // This is the whole descent and 400-unit recovery climb at ordinary render
    // cadence. The deadline belongs to this new full-route test.
    test.setTimeout(60000)
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page, file, name)
    await page.keyboard.down('d'); await page.clock.runFor(1264)
    await page.keyboard.up('d'); await page.keyboard.down('a')
    let p
    for (let i = 0; i < 80; i++) {
      await page.clock.runFor(32); p = await sample(page)
      if (p.signals.grounded && p.y === 1600) break
    }
    expect(p.signals.grounded).toBe(true); expect(p.y).toBe(1600)
    await page.screenshot({ path: info.outputPath('recovery-floor-hint.png') })
    for (let i = 0; i < 80 && p.x > 573; i++) {
      await page.clock.runFor(16); p = await sample(page)
    }
    expect(p.x).toBeGreaterThan(540); expect(p.x).toBeLessThanOrEqual(573)
    // HUD metrics publish at most every 80 ms. Advance the frozen animation
    // clock through that boundary before asserting its contact-specific cue.
    await page.keyboard.up('a'); await page.keyboard.down('w'); await page.clock.runFor(160)
    expect((await sample(page)).signals.mode).toBe('ladder')
    await expect(page.getByLabel('Available actions')).toContainText('Up / Down to climb')
    await page.screenshot({ path: info.outputPath('ladder-acquired.png') })
    await page.clock.runFor(5400); await page.keyboard.up('w')
    p = await sample(page)
    expect(p.signals.grounded).toBe(true); expect(p.y).toBe(1200); expect(p.x).toBeLessThan(540)
    await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
    await page.screenshot({ path: info.outputPath('recovery-complete.png') })
  })
}

test('A Little Swing teaches an automatic catch, held-press consumption, and a deliberate rope departure', async ({ page }, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page, '02.json', 'A Little Swing')
  await page.screenshot({ path: info.outputPath('rope-approach.png') })
  await page.keyboard.down('d'); await page.clock.runFor(1040)
  await page.keyboard.down('Space'); await page.clock.runFor(688)
  let p = await sample(page)
  expect(p.input.climb).toBe(false); expect(p.signals.mode).toBe('rope')
  await page.clock.runFor(96)
  await expect(page.getByLabel('Available actions')).toContainText('Release Space, then press again to jump off')
  await page.keyboard.up('d'); await page.clock.runFor(168)
  expect((await sample(page)).signals.mode).toBe('rope')
  await page.screenshot({ path: info.outputPath('rope-automatic-held-catch.png') })
  await page.keyboard.up('Space'); await page.clock.runFor(16)
  const caught = await sample(page)
  await page.keyboard.down('w'); await page.clock.runFor(832); await page.keyboard.up('w')
  p = await sample(page)
  expect(p.signals.mode).toBe('rope'); expect(p.y).toBeLessThan(caught.y - 30)
  await expect(page.getByLabel('Available actions')).toContainText('Space to jump off')
  let direction = 1, forward = false
  await page.keyboard.down('d')
  for (let i = 0; i < 220; i++) {
    await page.clock.runFor(32); p = await sample(page)
    if (i >= 7 && p.x > 870 && p.vx > 120) { forward = true; break }
    if (Math.abs(p.vx) > 3 && Math.sign(p.vx) !== direction) {
      await page.keyboard.up(direction > 0 ? 'd' : 'a'); direction = Math.sign(p.vx)
      await page.keyboard.down(direction > 0 ? 'd' : 'a')
    }
  }
  expect(forward).toBe(true)
  await page.keyboard.up('a'); await page.keyboard.up('d')
  await page.screenshot({ path: info.outputPath('rope-departure-window.png') })
  await page.keyboard.down('d'); await page.keyboard.down('Space'); await page.clock.runFor(184)
  await page.keyboard.up('Space'); await page.keyboard.down('w'); await page.clock.runFor(2300)
  await page.keyboard.up('d'); await page.keyboard.up('w')
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await expect(complete).toBeVisible()
  await expect(complete.getByText('Gold medal', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('rope-route-complete.png') })
})
