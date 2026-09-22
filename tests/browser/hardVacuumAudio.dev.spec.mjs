import { test, expect } from './helpers/test.mjs'

test('partial thrust stays continuous through trigger jitter and follows throttle smoothly', async ({ page }) => {
  await page.goto('/hard-vacuum')
  const envelope = await page.evaluate(async () => {
    const { SoundSystem } = await import('/src/games/hardVacuum/sound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(1, rate * 2.4, rate)
    const sound = new SoundSystem()
    sound.ctx = ctx
    const voices = new Set()
    const thrust = level => {
      sound.startThrust(level)
      if (!sound.thrustNoise || voices.has(sound.thrustNoise)) return
      voices.add(sound.thrustNoise)
      // A constant input makes the rendered samples the actual gain envelope,
      // independent of random noise or the thruster's band-pass filter.
      sound.thrustNoise.disconnect()
      const input = ctx.createConstantSource()
      input.connect(sound.thrustGain)
      input.start()
    }
    thrust(.3)
    const changes = Array.from({ length: 60 }, (_, i) => [.1 + i / 60, .3 + (i % 2 ? -.003 : .003)])
    changes.push([1.2, 1], [1.5, .1], [1.8, 0], [1.84, .4], [2.1, 0])
    const stages = changes.map(([time, level]) => ({ ready: ctx.suspend(time), level }))
    const rendering = ctx.startRendering()
    for (const { ready, level } of stages) {
      await ready
      thrust(level)
      await ctx.resume()
    }
    const samples = (await rendering).getChannelData(0)
    const window = (start, end) => {
      const values = samples.slice(Math.ceil(start * rate), Math.floor(end * rate))
      return { min: Math.min(...values), max: Math.max(...values) }
    }
    let largestStep = 0, stepTime = 0
    for (let i = 1; i < samples.length; i++) {
      const step = Math.abs(samples[i] - samples[i - 1])
      if (step > largestStep) { largestStep = step; stepTime = i / rate }
    }
    return { partial: window(.25, 1.15), full: window(1.4, 1.49), low: window(1.7, 1.79),
      restarted: window(2, 2.09), stopped: window(2.22, 2.39), voices: voices.size, largestStep, stepTime }
  })
  expect(envelope.partial.min, JSON.stringify(envelope)).toBeGreaterThan(.0593)
  expect(envelope.partial.max).toBeLessThan(.0607)
  expect(envelope.full.min).toBeGreaterThan(.199)
  expect(envelope.full.max).toBeLessThanOrEqual(.20001)
  expect(envelope.low.min).toBeGreaterThan(.0199)
  expect(envelope.low.max).toBeLessThan(.0202)
  expect(envelope.restarted.min).toBeGreaterThan(.079)
  expect(envelope.restarted.max).toBeLessThanOrEqual(.08001)
  expect(envelope.stopped).toEqual({ min: 0, max: 0 })
  expect(envelope.voices).toBe(2)
  expect(envelope.largestStep, JSON.stringify(envelope)).toBeLessThan(.001)
})
