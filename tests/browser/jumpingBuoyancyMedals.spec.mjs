import { unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
import { finishJumpingEntrance } from './helpers/jumpingLevels.mjs'
import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { installDigitalClockSpy } from './helpers/digitalClock.mjs'
import { DIGITAL_AMBER } from '../../src/games/jumping/digitalDisplay.ts'

// These route regressions start from an already unlocked campaign.
test.beforeEach(async ({ page }) => { await unlockJumpingLevels(page) })

const level = JSON.parse(readFileSync(new URL('../../public/levels/jumping/buoyancy.jump-level.json', import.meta.url)))

test('Buoyancy earns Gold with keyboard cargo delivery, both time pickups and draining', async ({ page }, info) => {
  test.setTimeout(180000)
  const errors = [], checkpoints = []
  page.on('pageerror', error => errors.push(error.message))
  await installDigitalClockSpy(page)
  await page.setViewportSize({ width: 852, height: 393 })
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') })
  await page.goto('/lab/levels/built-in/buoyancy.jump-level.json?motionDebug=1')
  await expect(page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })).toBeFocused()
  await page.clock.pauseAt(new Date('2026-10-10T13:00:00Z'))
    await finishJumpingEntrance(page)
  await page.clock.runFor(64)
  // Install after the entrance: React's development effect cleanup replaces
  // the monitor during mount, so an init-script setter would be discarded.
  // Force an observation gap without changing the player or scored time.
  await page.evaluate(() => {
    const monitor = window.jumpingMotion, read = monitor.read
    let gap = true
    monitor.read = () => {
      const state = read()
      if (gap && state.recent.length) {
        gap = false; window.buoyancyObservationGap = true
        return { ...state, recent: [] }
      }
      return state
    }
  })
  let held = new Set()
  const read = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function keys(wanted) {
    const next = new Set(wanted)
    for (const key of held) if (!next.has(key)) await page.keyboard.up(key)
    for (const key of next) if (!held.has(key)) await page.keyboard.down(key)
    held = next
  }
  // Water bobbing and free prop contacts vary with the idle time before input.
  // Drive to visible waypoints with ordinary keys; never move actors or edit
  // scored time directly, and cap each phase so waits cannot hide failed delivery.
  async function steer(wanted, arrived, label, { budget = 8000, needsSample = true } = {}) {
    await keys(wanted)
    let p, spent = 0, reached = false
    while (spent < budget) {
      await page.clock.runFor(64); spent += 64
      p = await read()
      // A diagnostic reset is not an arrival; wait within the same phase budget.
      if ((p || !needsSample) && await arrived(p)) { reached = true; break }
    }
    checkpoints.push({ label, spent, ...p })
    expect(reached, label).toBe(true)
  }
  await steer(['d'], p => p.x >= 645, 'enter the pool')
  await steer(['d', 's'], p => p.x >= 833 && p.y >= 1148, 'reach the bottom')
  await steer(['d'], p => p.x >= 1020, 'move the heavy ball off the pump switch')
  await steer(['w'], p => p.y <= 705, 'rise with the filling pool', { budget: 10000 })
  await page.screenshot({ path: info.outputPath('filled-pool.png') })
  // Observe the watch's actual effect; the larger floating cargo changes how
  // closely the player can approach its center before jumping toward the bank.
  const clockStopped = () => page.locator('.jumping-game > canvas').evaluate((canvas, amber) =>
    canvas.digitalClocks?.some(clock => clock.color === amber), DIGITAL_AMBER)
  await steer(['d'], clockStopped, 'collect the stopwatch')
  await steer(['d', 'w', 'Space'], p => p.x >= 1300 && (p.y < 530 || p.signals.mode === 'hang'), 'jump toward the right bank')
  await steer(['d', 'w'], p => p.x >= 1485 && p.signals.grounded && p.y < 570, 'collect the nine-second bonus')
  await steer(['a'], p => p.x <= 1420, 'take off from the right bank')
  await keys(['a', 'Space']); await page.clock.runFor(272)
  await steer(['a'], p => p.x <= 870 && p.y >= 705, 'return to the pool')
  await steer(['w'], p => p.y <= 685, 'rise beside the floating cargo')
  await steer(['a'], p => p.x <= 335, 'deliver floating balls above the exit switch')
  // The floats can settle while we return for the heavy ball; no idle wait is
  // needed here now that the larger cargo has reached the receiving bank.
  await keys([]); await page.clock.runFor(64)
  await page.screenshot({ path: info.outputPath('delivered-floats.png') })
  await steer(['d'], p => p.x >= 977, 'return through the gap between islands')
  await steer(['s'], p => p.y >= 850, 'dive below the right island')
  await steer(['d', 's'], p => p.x >= 1120, 'approach the heavy ball from the right')
  await steer(['s'], p => p.signals.grounded && p.y >= 1150, 'land on the pool bottom')
  await steer(['a'], p => p.x <= 1007, 'restore the heavy ball to the drain switch')
  await steer(['w'], p => p.y <= 892, 'rise while the cargo settles on the exit switch')
  await steer(['a', 'w'], p => p.x <= 950 && p.y <= 840, 'catch the island and enter its gravity lift')
  await steer(['w'], p => p.y <= 230, 'rise above the roof')
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await steer(['a'], () => complete.isVisible(), 'reach the powered doorway', { needsSample: false })
  await keys([])
  const [minutes, seconds] = (await complete.locator('.jumping-result-time').innerText()).split(':').map(Number)
  const elapsed = minutes * 60 + seconds
  await info.attach('route-checkpoints', { body: JSON.stringify({ elapsed, checkpoints }, null, 2), contentType: 'application/json' })
  await expect(complete.getByText('Grade A', { exact: true })).toBeVisible()
  expect(elapsed).toBeLessThanOrEqual(level.times.a)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => window.buoyancyObservationGap)).toBe(true)
  await page.screenshot({ path: info.outputPath('completed.png') })
})
