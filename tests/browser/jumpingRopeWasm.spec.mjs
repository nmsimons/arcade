import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'

for (const solver of ['baseline', 'active']) test(`opt-in ${solver} Wasm loads under production CSP and released ropes use it`, async ({ page }, info) => {
  test.setTimeout(90_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const level = readLevelAsset('rope-window-gate.json')
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-10-12T12:00:00Z') })
  const response = await page.goto(`/untitled-jumping-game?labRopes=wasm&motionDebug=1${solver === 'active' ? '&labSolver=active' : ''}`)
  expect(response.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'")
  await expect.poll(() => page.evaluate(() => window.labRopeWasm?.status().enabled)).toBe(true)
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-12T13:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await finishJumpingEntrance(page)
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit` })
  await expect(canvas).toBeFocused()
  await page.keyboard.down('Shift'); await page.keyboard.down('a'); await page.keyboard.down('ArrowDown')
  await page.clock.runFor(1350)
  await page.keyboard.up('a'); await page.keyboard.up('ArrowDown'); await page.keyboard.up('Shift')
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(600); await page.keyboard.up('ArrowUp')
  await page.keyboard.down('d'); await page.clock.runFor(160); await page.keyboard.up('d')
  expect(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1).signals.mode)).toBe('rope')
  const beforeRelease = await page.evaluate(() => window.labRopeWasm.status().wasmSteps)
  // Hold detach across physics ticks; a press/release at one frozen timestamp
  // would never be sampled. Move away so this checks a real released rope.
  await page.keyboard.down('a'); await page.keyboard.down('x'); await page.clock.runFor(160)
  await page.keyboard.up('x'); await page.clock.runFor(240); await page.keyboard.up('a')
  expect(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1).signals.mode)).not.toBe('rope')
  const status = await page.evaluate(() => window.labRopeWasm.status())
  expect(status.wasmSteps).toBeGreaterThan(beforeRelease)
  expect(status.failures).toBe(0)
  expect(status.active).toBe(solver === 'active')
  if (solver === 'active') expect(await page.evaluate(() => window.labSolverExperiment.status().enabled)).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('released-rope-wasm.png') })
})

test('missing Wasm retains playable TypeScript LAB', async ({ page }) => {
  await page.route('**/wasm/lab-rope.wasm', route => route.fulfill({ status: 404, body: '' }))
  const level = readLevelAsset('rope-window-gate.json')
  await useLevelFixtures(page, [level])
  await page.goto('/untitled-jumping-game?labRopes=wasm')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.getByRole('img', { name: `${level.name}: reach the exit` })).toBeVisible()
  expect(await page.evaluate(() => window.labRopeWasm.status().enabled)).toBe(false)
})

test('incompatible host arithmetic keeps the established TypeScript solver', async ({ page }) => {
  const warnings = []
  page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })
  // Simulate an engine with a different norm implementation. A successful
  // download must not enable a kernel that changes contact decisions there.
  await page.addInitScript(() => {
    Math.hypot = (...values) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  })
  const level = readLevelAsset('rope-window-gate.json')
  await useLevelFixtures(page, [level])
  await page.goto('/untitled-jumping-game?labRopes=wasm')
  await expect.poll(() => warnings.some(message => message.includes('arithmetic differs'))).toBe(true)
  const status = await page.evaluate(() => window.labRopeWasm.status())
  expect(status.installed).toBe(false)
  expect(status.enabled).toBe(false)
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.getByRole('img', { name: `${level.name}: reach the exit` })).toBeVisible()
})
