import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

test('normal controls climb through decks, stop on the upper landing and deliberately descend', async ({ page }, info) => {
  test.setTimeout(120000)
  const file = { ...blankTrial(), id: 'foreground-ladder-browser', name: 'Foreground ladder',
    width: 1000, height: 900, floor: 800, timing: 'untimed', entrance: { x: 400, y: 800 }, goal: { x: 900, y: 800, flipX: true },
    platforms: [{ x: 0, y: 500, w: 1000, h: 100 }, { x: 0, y: 200, w: 1000, h: 120 }],
    climbables: { ladders: [{ x: 400, top: 130, bottom: 800, platform: -1, side: 1 }], ropes: [] } }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  expect(levelProblems(file)).toEqual([])
  await useLevelFixtures(page, [file])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const card = page.locator('.jumping-level-card[aria-pressed=true]').filter({ hasText: file.name })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.click()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 }).catch(error => {
    throw new Error(`${error.message}\nPage errors: ${JSON.stringify(errors)}`)
  })
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await restartFromPause(page)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(3100)
  const inside = await motion(page)
  expect(inside.signals.mode).toBe('ladder'); expect(inside.y).toBeGreaterThan(500); expect(inside.y).toBeLessThan(600)
  await page.screenshot({ path: info.outputPath('ladder-through-deck.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space')
  expect((await motion(page)).signals.mode).toBe('ladder')
  await page.clock.runFor(5800); await page.keyboard.up('ArrowUp')
  const top = await motion(page)
  expect(top.y).toBe(200); expect(top.signals.grounded).toBe(true); expect(top.signals.mode).toBe('free')
  await page.screenshot({ path: info.outputPath('ladder-top-standing.png') })
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(1500); await page.keyboard.up('ArrowDown')
  const descending = await motion(page)
  expect(descending.signals.mode).toBe('ladder'); expect(descending.y).toBeGreaterThan(300)
  const descentStep = await page.evaluate(() => {
    const samples = window.jumpingMotion.read().recent
    return Math.max(...samples.slice(1).map((sample, i) => Math.abs(sample.y - samples[i].y)))
  })
  expect(descentStep).toBeLessThan(4)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(5000); await page.keyboard.up('ArrowDown')
  expect((await motion(page)).y).toBe(800)
  expect((await motion(page)).signals.grounded).toBe(true)
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowUp'); await page.clock.runFor(250)
  expect((await motion(page)).signals.mode).toBe('ladder')
  await page.keyboard.up('Space'); await page.clock.runFor(200); await page.keyboard.up('ArrowUp')
  await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space')
  expect((await motion(page)).signals.mode).not.toBe('ladder')
  expect(errors).toEqual([])
})

test('a captured scaffold lets a fresh player step off at a formerly slotted intermediate deck', async ({ page }, info) => {
  test.setTimeout(120000)
  // Preserve the overlap reproduction from 36a309b as Studio renames or edits maps.
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/ladder-scaffold-exit.json', import.meta.url), 'utf8'))
  // Keep this exact overlap check independent of the hunter's shot timing.
  // Fresh-start course recordings separately retain each authored Rbot.
  file.robots = []
  const ladder = file.climbables.ladders.find(l => l.name === 'Left lower ladder')
  const deck = file.platforms.find(p => p.name === 'Left lower deck')
  await useLevelFixtures(page, [file])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await restartFromPause(page)
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp')
  await page.clock.runFor(600); await page.keyboard.up('ArrowRight')
  expect((await motion(page)).signals.mode).toBe('ladder')
  // Stop while the boots still overlap the intermediate deck's top.
  await expect.poll(async () => {
    await page.clock.runFor(32)
    return (await motion(page)).y
  }, { intervals: [0], timeout: 30000 }).toBeLessThan(deck.y + 13)
  await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowRight')
  await page.clock.runFor(250); await page.keyboard.up('ArrowRight')
  const exit = await motion(page)
  expect(exit.signals.mode).toBe('free'); expect(exit.signals.grounded).toBe(true)
  expect(exit.y).toBe(deck.y); expect(exit.x).toBeGreaterThan(ladder.x + 15)
  await page.screenshot({ path: info.outputPath('triple-scaffold-intermediate-exit.png') })
})
