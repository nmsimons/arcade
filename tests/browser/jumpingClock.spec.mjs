import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { smallPropGap, observeGapHead } from './helpers/jumpingSqueeze.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'
import { reverseRopeWorkshop } from './helpers/jumpingRopeGravity.mjs'

async function clockContext(browser, info, level) {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 800 } })
  await context.route('https://api.github.com/repos/nmsimons/arcade/releases?*', route => route.fulfill({ json: [] }))
  await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => [] }))
  const page = await context.newPage()
  await useLevelFixtures(page, [level])
  if (process.env.HV_TEST_CPU_RATE) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.HV_TEST_CPU_RATE) })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  return { context, page }
}

async function start(page) {
  await page.goto('/untitled-jumping-game?motionDebug=1')
  const card = page.locator('.jumping-level-card[aria-pressed=true]')
  await expect(card).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await card.click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
}

for (const reverse of [false, true]) test(`bounded passive waits preserve fixed steps and held gap animation (${reverse ? 'reversed' : 'normal'} prop order)`, async ({ browser }, info) => {
  test.setTimeout(90000)
  const level = smallPropGap(reverse)
  const traces = []
  for (const batched of [false, true]) {
    const { context, page } = await clockContext(browser, info, level)
    try {
      await observeGapHead(page)
      await start(page)
      const canvas = page.locator('canvas')
      await page.keyboard.down('w'); await page.clock.runFor(16); await page.keyboard.up('w')
      const stages = [], held = []
      const sample = () => page.evaluate(() => window.jumpingMotion.read().recent)
      for (let cycle = 0; cycle < 2; cycle++) {
        const passive = cycle ? 500 : 2000
        if (batched) await advanceJumpingPassiveWait(page, passive)
        else await page.clock.runFor(passive)
        stages.push(await sample())
        await page.keyboard.down('a'); await page.clock.runFor(150)
        await canvas.evaluate(c => { c.gapFrames = [] })
        await page.clock.runFor(2000)
        stages.push(await sample()); held.push(await canvas.evaluate(c => c.gapFrames))
        await page.keyboard.up('a')
      }
      if (batched) await advanceJumpingPassiveWait(page, 500)
      else await page.clock.runFor(500)
      stages.push(await sample())
      traces.push({ stages, held })
    } finally { await context.close() }
  }
  for (const stage of traces[0].stages) expect(stage.length).toBe(240)
  expect(traces[1].stages).toEqual(traces[0].stages)
  traces[1].held.forEach((frames, cycle) => {
    expect(frames.length).toBeGreaterThan(100)
    expect(frames.length).toBe(traces[0].held[cycle].length)
    frames.forEach((frame, index) => {
      const reference = traces[0].held[cycle][index]
      expect(frame.time).toBe(reference.time)
      for (const key of ['headX', 'headY', 'x', 'y']) expect(frame[key]).toBeCloseTo(reference[key], 6)
    })
  })
  await info.attach('schedule-proof', { body: JSON.stringify({ stages: traces[0].stages.map(stage => stage.length), held: traces[0].held.map(frames => frames.length) }), contentType: 'application/json' })
})

test('bounded passive gravity settling retains every rope step and both native-cadence departures', async ({ browser }, info) => {
  test.setTimeout(90000)
  for (const release of ['Space', 'x']) {
    const traces = []
    for (const batched of [false, true]) {
      const { context, page } = await clockContext(browser, info, reverseRopeWorkshop())
      try {
        // Read-only collection after each RAF retains every completed fixed
        // step, including the early part outside the two-second debug ring.
        await page.addInitScript(() => {
          const request = window.requestAnimationFrame.bind(window)
          window.ropeClockSamples = new Map()
          window.requestAnimationFrame = callback => request(time => {
            callback(time)
            for (const sample of window.jumpingMotion?.read().recent ?? []) window.ropeClockSamples.set(sample.time, sample)
          })
        })
        await start(page)
        await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
        if (batched) await advanceJumpingPassiveWait(page, 3500)
        else await page.clock.runFor(3500)
        await page.keyboard.down('ArrowDown'); await page.clock.runFor(900); await page.keyboard.up('ArrowDown')
        await page.keyboard.down('ArrowUp'); await page.clock.runFor(250); await page.keyboard.up('ArrowUp')
        await page.clock.runFor(200)
        await page.keyboard.down(release); await page.clock.runFor(32)
        await page.clock.runFor(100); await page.keyboard.up(release)
        traces.push(await page.evaluate(() => [...window.ropeClockSamples.values()]))
      } finally { await context.close() }
    }
    expect(traces[0].length).toBeGreaterThan(590)
    expect(traces[0].some(sample => sample.signals.mode === 'rope')).toBe(true)
    expect(traces[0].at(-1).signals.mode).toBe('free')
    expect(traces[1]).toEqual(traces[0])
    await info.attach(`rope-schedule-${release}`, { body: JSON.stringify({ fixedSteps: traces[0].length }), contentType: 'application/json' })
  }
})
