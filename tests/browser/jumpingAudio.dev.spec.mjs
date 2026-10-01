import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('all sound textures render quietly, loops reuse a bounded bank, and stopping leaves silence', async ({ page }) => {
  await page.goto('/untitled-jumping-game')
  const result = await page.evaluate(async () => {
    const { JumpingSound, MAX_LOOP_VOICES } = await import('/src/games/jumping/sound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(2, rate * 4.8, rate)
    let sources = 0
    const create = ctx.createBufferSource.bind(ctx)
    ctx.createBufferSource = () => { sources++; return create() }
    const sound = new JumpingSound(ctx), counts = []
    const loops = ['ball', 'box', 'gate-open', 'gate-close', 'elevator'].map((kind, i) => ({ id: String(i), kind, volume: 1, pan: 0, pace: .7, size: 60 }))
    const stages = [
      [.1, () => sound.update({ loops: [loops[0]], cues: [] })],
      [.5, () => sound.update({ loops: [loops[1]], cues: [] })],
      [.9, () => sound.update({ loops: [loops[2]], cues: [] })],
      [1.3, () => sound.update({ loops: [loops[3]], cues: [] })],
      [1.7, () => sound.update({ loops: [loops[4]], cues: [] })],
      [2.1, () => { counts.push(sources); sound.update({ loops: Array.from({ length: 100 }, (_, i) => ({ ...loops[i % 5], id: String(i) })), cues: [] }); counts.push(sources) }],
      [2.5, () => sound.silence()],
      [2.7, () => sound.cue({ kind: 'footstep', volume: 1, pan: 0, strength: 1 })],
      [2.95, () => sound.cue({ kind: 'switch', volume: 1, pan: 0, strength: 1 })],
      [3.2, () => sound.cue({ kind: 'timer-paused', volume: 1, pan: 0, strength: 1 })],
      [3.6, () => sound.silence()],
      [3.75, () => sound.cue({ kind: 'box-impact', volume: 1, pan: 0, strength: .65, size: 40 })],
      [4.05, () => sound.cue({ kind: 'ball-impact', volume: 1, pan: 0, strength: .65, size: 68 })],
      [4.4, () => sound.silence()],
    ].map(([time, action]) => ({ ready: ctx.suspend(time), action }))
    const rendering = ctx.startRendering()
    for (const stage of stages) { await stage.ready; stage.action(); await ctx.resume() }
    const buffer = await rendering, data = buffer.getChannelData(0)
    const measure = (start, end) => {
      const values = data.slice(start * rate, end * rate)
      return { rms: Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length), peak: values.reduce((max, v) => Math.max(max, Math.abs(v)), 0) }
    }
    sound.dispose(); sound.dispose()
    return { quiet: measure(0, .09), loops: [.25, .65, 1.05, 1.45, 1.85].map(t => measure(t, t + .15)),
      steps: measure(2.7, 2.86), switch: measure(2.95, 3.11), timer: measure(3.2, 3.55), crowd: measure(2.3, 2.5),
      box: measure(3.75, 3.93), ball: measure(4.05, 4.29), stopped: measure(4.6, 4.79), peak: measure(0, 4.8).peak, counts, limit: MAX_LOOP_VOICES }
  })
  expect(result.quiet.peak).toBe(0)
  for (const sound of [...result.loops, result.steps, result.switch, result.timer, result.box, result.ball]) expect(sound.rms, JSON.stringify(result)).toBeGreaterThan(.001)
  expect(result.peak).toBeLessThan(.3)
  expect(result.counts).toEqual([1, result.limit])
  expect(result.stopped.peak).toBe(0)
})

async function setup(page, savedMute = false) {
  const level = blankTrial()
  level.name = 'Sound test'; level.mechanisms = [{ id: 'gate', kind: 'gate', x: 650, y: 520, w: 20, h: 400, travel: 400 }]
  level.triggers = [{ x: 100, y: 920, w: 240, mode: 'touch', target: 'gate' }]
  await useLevelFixtures(page, [level])
  await page.addInitScript(savedMute => {
    if (savedMute) localStorage.setItem('arcade.jumping.sound.v1', 'off')
    window.soundContexts = []; window.soundGains = []; window.soundStarts = 0
    const Context = window.AudioContext
    window.AudioContext = class extends Context { constructor(...args) { super(...args); window.soundContexts.push(this) } }
    const connect = AudioNode.prototype.connect, disconnect = AudioNode.prototype.disconnect, start = AudioBufferSourceNode.prototype.start
    AudioNode.prototype.connect = function (...args) {
      if (this instanceof GainNode && args[0] instanceof StereoPannerNode) window.soundGains.push(this)
      return connect.apply(this, args)
    }
    AudioNode.prototype.disconnect = function (...args) {
      window.soundGains = window.soundGains.filter(g => g !== this)
      return disconnect.apply(this, args)
    }
    AudioBufferSourceNode.prototype.start = function (...args) { window.soundStarts++; return start.apply(this, args) }
  }, savedMute)
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('button', { name: /^Play Sound test$/ })).toBeVisible()
}
const peakGain = page => page.evaluate(() => Math.max(0, ...window.soundGains.map(g => g.gain.value)))

test('gameplay unlocks sound, pause/builder silence it, and leaving closes the context', async ({ page }) => {
  await setup(page)
  expect(await page.evaluate(() => window.soundContexts.length)).toBe(0)
  await page.getByRole('button', { name: 'Play Sound test', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Sound test: reach the exit' })).toBeFocused()
  await page.keyboard.down('ArrowRight')
  await expect.poll(() => peakGain(page)).toBeGreaterThan(.005)
  await page.keyboard.up('ArrowRight')
  expect(await page.evaluate(() => window.soundContexts.length)).toBe(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await expect.poll(() => peakGain(page)).toBe(0)
  await page.getByRole('button', { name: /^Resume/ }).click()
  await expect.poll(() => peakGain(page)).toBeGreaterThan(.005)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await expect.poll(() => peakGain(page)).toBe(0)
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in$/)
  await expect.poll(() => peakGain(page)).toBe(0)
  // SPA navigation must dispose the game audio, rather than relying on tab closure.
  await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect.poll(() => page.evaluate(() => window.soundContexts.every(c => c.state === 'closed'))).toBe(true)
})

test('an old mute preference cannot leave gameplay silent after removing the toggle', async ({ page }) => {
  await setup(page, true)
  await expect(page.getByRole('button', { name: /^Sound (on|off)$/ })).toHaveCount(0)
  expect(await page.evaluate(() => window.soundContexts.length)).toBe(0)
  await page.getByRole('button', { name: 'Play Sound test', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Sound test: reach the exit' })).toBeFocused()
  await page.keyboard.down('ArrowRight')
  await expect.poll(() => page.evaluate(() => window.soundContexts[0]?.state)).toBe('running')
  await expect.poll(() => peakGain(page)).toBeGreaterThan(.005)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Sound (on|off)$/ })).toHaveCount(0)
})
