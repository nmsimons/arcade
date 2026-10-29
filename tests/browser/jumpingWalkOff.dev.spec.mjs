import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { finishJumpingEntrance, installBuiltInFixtures, selectBuilderOption, useLevelFixtures, waitForBuilderPreview } from './helpers/jumpingLevels.mjs'

const exit = JSON.parse(readFileSync(new URL('../../public/levels/jumping/exit.jump-level.json', import.meta.url), 'utf8'))
const fixture = JSON.parse(readFileSync(new URL('../fixtures/jumping/walk-off.json', import.meta.url), 'utf8'))

test('Play Exit uses the authored entrance despite an old outdoor checkpoint; Resume keeps the live run', async ({ page }) => {
  test.setTimeout(120000)
  await useLevelFixtures(page, [exit])
  await page.addInitScript(level => {
    localStorage.setItem('arcade.jumping.exterior.v1', JSON.stringify({
      id: level.id, x: 19720, y: 2320, switches: level.triggers.map(() => null),
    }))
  }, exit)
  await page.clock.install({ time: new Date('2026-10-29T12:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const play = page.getByRole('button', { name: 'Play Exit', exact: true })
  await expect(play).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-10-29T13:00:00Z'))
  const position = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function playFromEntrance() {
    await play.click(); await finishJumpingEntrance(page)
    const start = await position()
    expect(start.x).toBeCloseTo(exit.entrance.x)
    expect(start.y).toBeCloseTo(exit.entrance.y)
  }
  await playFromEntrance()
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(300); await page.keyboard.up('ArrowRight')
  await page.clock.runFor(200)
  const moved = await position()
  expect(moved.x).toBeGreaterThan(exit.entrance.x + 40)
  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Game paused', exact: true })
  await pause.getByRole('button', { name: /^Resume/ }).click()
  await page.clock.runFor(32)
  expect((await position()).x).toBeCloseTo(moved.x)
  await page.keyboard.press('Escape')
  await pause.getByRole('button', { name: 'Level menu', exact: true }).click()
  await playFromEntrance()
  await page.clock.resume()
  // Play navigates to the level route without the read-only diagnostic query.
  const reload = new URL(page.url()); reload.searchParams.set('motionDebug', '1')
  await page.goto(reload.toString())
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-10-29T14:00:00Z'))
  await finishJumpingEntrance(page)
  const reloaded = await position()
  expect(reloaded.x).toBeCloseTo(exit.entrance.x)
  expect(reloaded.y).toBeCloseTo(exit.entrance.y)
})

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`Exit's final approach runs off the right edge at ${viewport.width}px`, async ({ page }, info) => {
    // A fresh entrance on the final flat approach tests the actual Exit geometry
    // with keyboard controls, independently of its long service-course route.
    const level = { ...structuredClone(exit), entrance: { x: 19720, y: 2320 } }
    await page.setViewportSize(viewport)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: 'Play Exit', exact: true })
    await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-28T13:00:00Z'))
    await play.click(); await finishJumpingEntrance(page)
    await page.clock.runFor(500)
    expect((await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))).x).toBeCloseTo(level.entrance.x)
    await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('exit-final-approach.png') })
    await page.keyboard.down('ArrowRight')
    await expect.poll(async () => {
      await page.clock.runFor(160)
      return page.getByRole('dialog', { name: 'Level complete', exact: true }).count()
    }, { intervals: [0] }).toBe(1)
    await page.keyboard.up('ArrowRight')
    const ending = page.getByRole('dialog', { name: 'Level complete', exact: true })
    await expect(ending.getByRole('heading', { name: 'You’re outside.' })).toBeVisible()
    await expect(ending.getByRole('button', { name: 'Level menu', exact: true })).toBeVisible()
    await expect(ending.getByRole('button', { name: 'Next level', exact: true })).toHaveCount(0)
    expect(await page.evaluate(id => JSON.parse(localStorage.getItem('arcade.jumping.completed.v1'))[id], level.id)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('exit-escaped.png') })
    await ending.getByRole('button', { name: 'Play again', exact: false }).click()
    await finishJumpingEntrance(page)
    await page.clock.runFor(64)
    expect((await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))).x).toBeCloseTo(level.entrance.x)
  })
}

test('Studio switches run-off and doorway finishes, saves, and reopens the selected finish', async ({ page }) => {
  await installBuiltInFixtures(page, { 'ending.json': fixture })
  await page.goto('/lab/builder/built-in/ending.json')
  await waitForBuilderPreview(page)
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Finish', exact: true })).toContainText('Run off right edge')
  await selectBuilderOption(page, 'Finish', 'doorway')
  await expect(page.getByRole('combobox', { name: 'Finish', exact: true })).toContainText('Doorway')
  await selectBuilderOption(page, 'Finish', 'walk-off')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  await page.reload(); await waitForBuilderPreview(page)
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Finish', exact: true })).toContainText('Run off right edge')
})
