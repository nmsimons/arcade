import { test, expect } from './helpers/test.mjs'

test('rendered motor revs smoothly, stays quiet and fades to silence without repeated attacks', async ({ page }) => {
  await page.goto('/bumper-ball')
  const audio = await page.evaluate(async () => {
    const { BumperMotorSound } = await import('/src/games/bumperBall/motorSound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(2, rate * 3.6, rate)
    const motor = new BumperMotorSound(ctx)
    const idle = { speed: 0, throttle: 0, boosting: false }
    const stages = [
      [0.2, { speed: 0, throttle: 1, boosting: false }],
      [0.9, { speed: 200, throttle: 1, boosting: false }],
      [1.7, { speed: 350, throttle: 1, boosting: true }],
      [2.3, { speed: 80, throttle: 0, boosting: false }],
      [2.9, null],
    ].map(([time, drive]) => ({ ready: ctx.suspend(time), drive }))
    const rendering = ctx.startRendering()
    for (const stage of stages) {
      await stage.ready
      if (stage.drive) motor.update(stage.drive, idle, 1000, 0)
      else motor.silence()
      await ctx.resume()
    }
    const buffer = await rendering, samples = buffer.getChannelData(0)
    const window = (start, end) => {
      let energy = 0, crossings = 0, peak = 0
      for (let i = Math.floor(start * rate); i < Math.floor(end * rate); i++) {
        energy += samples[i] ** 2
        peak = Math.max(peak, Math.abs(samples[i]))
        if (i > 0 && samples[i - 1] <= 0 && samples[i] > 0) crossings++
      }
      return { rms: Math.sqrt(energy / ((end - start) * rate)), hz: crossings / (end - start), peak }
    }
    let largestStep = 0, stepTime = 0
    for (let i = 1; i < samples.length; i++) {
      const delta = Math.abs(samples[i] - samples[i - 1])
      if (delta > largestStep) { largestStep = delta; stepTime = i / rate }
    }
    motor.dispose()
    motor.dispose()
    return { idle: window(0, 0.15), pull: window(0.5, 0.8), cruise: window(1.35, 1.65),
      boost: window(2.05, 2.25), coast: window(2.65, 2.85), stopped: window(3.1, 3.5), largestStep, stepTime }
  })
  expect(audio.idle.peak).toBe(0)
  expect(audio.pull.rms).toBeGreaterThan(0.002)
  expect(audio.cruise.hz).toBeGreaterThan(audio.pull.hz + 30)
  expect(audio.boost.hz).toBeGreaterThan(audio.cruise.hz + 20)
  expect(audio.boost.peak).toBeLessThan(0.04)
  expect(audio.coast.rms).toBeLessThan(audio.cruise.rms * 0.6)
  expect(audio.stopped.peak).toBe(0)
  expect(audio.largestStep, JSON.stringify(audio)).toBeLessThan(0.003)
})

test('live motor voices are reused, fade when paused or unfocused, and close on exit', async ({ page }) => {
  await page.addInitScript(() => {
    window.motorGains = []
    const connect = AudioNode.prototype.connect
    AudioNode.prototype.connect = function (...args) {
      if (this instanceof GainNode && args[0] instanceof StereoPannerNode) {
        window.motorGains.push(this)
        window.motorContext = this.context
      }
      return connect.apply(this, args)
    }
  })
  await page.goto('/bumper-ball')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.keyboard.down('ArrowUp')
  await expect.poll(() => page.evaluate(() => window.motorGains[0]?.gain.value ?? 0)).toBeGreaterThan(0.005)
  await page.keyboard.up('ArrowUp')
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Math.max(...window.motorGains.map(node => node.gain.value)))).toBe(0)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.keyboard.down('ArrowUp')
  await expect.poll(() => page.evaluate(() => window.motorGains[0].gain.value)).toBeGreaterThan(0.005)
  expect(await page.evaluate(() => window.motorGains.length)).toBe(2)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.keyboard.up('ArrowUp')
  await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Math.max(...window.motorGains.map(node => node.gain.value)))).toBe(0)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(() => page.evaluate(() => window.motorContext.state)).toBe('closed')
})
