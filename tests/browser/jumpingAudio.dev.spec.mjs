import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('robot footsteps and movement motors render distinct, bounded sounds and stop cleanly', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(2, rate * 2.5, rate), sound = new JumpingSound(ctx)
    const cue = kind => sound.cue({ kind, volume: 1, pan: 0, strength: 1 })
    const motor = (kind, pan) => sound.update({ loops: [{ id: 'robot', kind, volume: 1, pace: .7, pan, size: 0 }], cues: [] })
    cue('footstep')
    const stages = [
      [.3, () => cue('robot-footstep')],
      [.65, () => motor('shovebot', -.5)],
      [1.25, () => sound.silence()],
      [1.45, () => motor('robot-servo', .5)],
      [2.05, () => sound.silence()],
    ].map(([time, action]) => ({ ready: ctx.suspend(time), action }))
    const rendering = ctx.startRendering()
    for (const stage of stages) { await stage.ready; stage.action(); await ctx.resume() }
    const buffer = await rendering
    const measure = (start, end, channel = 0) => {
      const values = buffer.getChannelData(channel).slice(start * rate, end * rate)
      return { rms: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length),
        peak: values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0), finite: values.every(Number.isFinite) }
    }
    sound.dispose()
    return { player: measure(0, .17), robot: measure(.3, .54), motor: measure(.8, 1.2), motorRight: measure(.8, 1.2, 1),
      climb: measure(1.6, 2), climbRight: measure(1.6, 2, 1), stopped: measure(2.2, 2.49), full: measure(0, 2.5) }
  })
  expect(result.robot.rms).toBeGreaterThan(result.player.rms * 1.5)
  expect(result.motor.rms).toBeGreaterThan(.003)
  expect(result.climbRight.rms).toBeGreaterThan(.002)
  expect(result.motor.rms).toBeGreaterThan(result.motorRight.rms * 1.5)
  expect(result.climbRight.rms).toBeGreaterThan(result.climb.rms * 1.5)
  expect(result.full.finite).toBe(true)
  expect(result.full.peak).toBeLessThan(.2)
  expect(result.stopped.peak).toBe(0)
})

test('all sound textures render quietly, loops reuse a bounded bank, and stopping leaves silence', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    const { JumpingSound, MAX_LOOP_VOICES } = await import('/src/games/jumping/sound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(2, rate * 5.6, rate)
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
      [4.65, () => sound.cue({ kind: 'water-entry', volume: 1, pan: 0, strength: .8, size: 60 })],
      [5.2, () => sound.silence()],
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
      box: measure(3.75, 3.93), ball: measure(4.05, 4.29), splash: measure(4.65, 4.9), waterTail: measure(4.95, 5.15),
      stopped: measure(5.4, 5.59), peak: measure(0, 5.6).peak, counts, limit: MAX_LOOP_VOICES }
  })
  expect(result.quiet.peak).toBe(0)
  for (const sound of [...result.loops, result.steps, result.switch, result.timer, result.box, result.ball, result.splash, result.waterTail]) expect(sound.rms, JSON.stringify(result)).toBeGreaterThan(.001)
  expect(result.peak).toBeLessThan(.3)
  expect(result.counts).toEqual([1, result.limit])
  expect(result.stopped.peak).toBe(0)
})

test('ambient beds sit at their levels under a running lift, run down with the power, and stop without ambience', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    const rate = 48000, empty = { loops: [], cues: [] }
    // Plays frames as the game sends them, every 50 ms.
    const play = async (seconds, frame) => {
      const ctx = new OfflineAudioContext(1, Math.round(rate * seconds), rate), sound = new JumpingSound(ctx)
      const stages = Array.from({ length: Math.round(seconds * 20) - 1 }, (_, i) => ({ ready: ctx.suspend((i + 1) / 20), time: (i + 1) / 20 }))
      sound.update(frame(0))
      const rendering = ctx.startRendering()
      for (const stage of stages) { await stage.ready; sound.update(frame(stage.time)); await ctx.resume() }
      const data = (await rendering).getChannelData(0); sound.dispose(); return data
    }
    const slice = (data, from, to) => data.slice(Math.round(from * rate), Math.round(to * rate))
    const rms = data => Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
    const peak = data => data.reduce((max, v) => Math.max(max, Math.abs(v)), 0)
    // A-weighted level in decibels, from the weighting's poles: high passes at 20.6 (twice), 107.7 and 737.9 Hz.
    const weighted = data => {
      let x = data
      for (const f of [20.6, 20.6, 107.7, 737.9]) {
        const a = 1 / (1 + 2 * Math.PI * f / rate), y = new Float32Array(x.length)
        for (let i = 1; i < x.length; i++) y[i] = a * (y[i - 1] + x[i] - x[i - 1])
        x = y
      }
      return 20 * Math.log10(rms(x.slice(rate / 4)))
    }
    const lift = weighted(slice(await play(2, () => ({ ...empty, loops: [{ id: 'lift', kind: 'elevator', volume: 1, pan: 0, pace: .5, size: 0 }] })), 1, 2))
    const beds = {}
    for (const kind of ['hvac', 'air', 'hum', 'gravity', 'buzz', 'field', 'whir', 'water', 'underwater', 'engine']) {
      beds[kind] = weighted(slice(await play(4, () => ({ ...empty, ambience: { [kind]: { volume: 1, pan: 0, power: 1 } } })), 1.25, 4)) - lift
    }
    // The power goes at 2 s and comes back at 6 s.
    const cut = await play(9, time => ({ ...empty, ambience: { hvac: { volume: 1, pan: 0, power: time >= 2 && time < 6 ? 0 : 1 } } }))
    let jump = 0
    for (let i = 1; i < cut.length; i++) jump = Math.max(jump, Math.abs(cut[i] - cut[i - 1]))
    const gone = await play(3, time => time < 1 ? { ...empty, ambience: { field: { volume: 1, pan: .5, power: 1 }, water: { volume: 1, pan: -.5, power: 1 } } } : empty)
    return { beds, running: rms(slice(cut, 1, 2)), early: rms(slice(cut, 2.3, 2.8)), late: rms(slice(cut, 4.5, 5.5)), back: rms(slice(cut, 8.5, 9)),
      peak: peak(cut), jump, gone: peak(slice(gone, 2.6, 3)) }
  })
  // Decibels under the lift, as sound.ts documents them.
  const targets = { hvac: -12, air: -10, hum: -10, gravity: -9, buzz: -15, field: -4, whir: -12, water: -8, underwater: -6, engine: 5 }
  for (const [kind, target] of Object.entries(targets)) expect(Math.abs(result.beds[kind] - target), `${kind}: ${result.beds[kind].toFixed(1)} dB`).toBeLessThan(2)
  // A power cut runs the air handling down over a couple of seconds, and power back runs it up again.
  expect(result.early).toBeLessThan(result.running * .8)
  expect(result.early).toBeGreaterThan(result.running * .2)
  expect(result.late).toBeLessThan(result.running * .05)
  expect(result.back).toBeGreaterThan(result.running * .5)
  expect(result.jump, 'no click').toBeLessThan(result.peak)
  expect(result.gone).toBeLessThan(1e-4)
})

test('under water the air is muffled but the water is not, and silent beds let their voices go', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    // Count the oscillators and noise sources running. A buffer source has a start of its own.
    let live = 0
    for (const type of [AudioScheduledSourceNode, AudioBufferSourceNode]) {
      const start = type.prototype.start
      type.prototype.start = function (...args) { live++; return start.apply(this, args) }
    }
    const stop = AudioScheduledSourceNode.prototype.stop
    AudioScheduledSourceNode.prototype.stop = function (...args) { live--; return stop.apply(this, args) }
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    const rate = 48000, empty = { loops: [], cues: [] }, bed = { volume: 1, pan: 0, power: 1 }
    const play = async (seconds, frame, at = {}) => {
      const ctx = new OfflineAudioContext(1, Math.round(rate * seconds), rate), sound = new JumpingSound(ctx), counts = {}
      const stages = Array.from({ length: Math.round(seconds * 20) - 1 }, (_, i) => ({ ready: ctx.suspend((i + 1) / 20), time: Math.round((i + 1) * 5) / 100 }))
      sound.update(frame(0, sound))
      const rendering = ctx.startRendering()
      for (const stage of stages) {
        await stage.ready
        sound.update(frame(stage.time, sound))
        if (at[stage.time]) at[stage.time](sound)
        counts[stage.time] = live
        await ctx.resume()
      }
      const data = (await rendering).getChannelData(0); sound.dispose(); return { data, counts }
    }
    const slice = (data, from, to) => data.slice(Math.round(from * rate), Math.round(to * rate))
    const rms = data => Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length)
    // Energy above 1 kHz, from a one-pole high pass.
    const bright = data => { const a = 1 / (1 + 2 * Math.PI * 1000 / rate), y = new Float32Array(data.length); for (let i = 1; i < data.length; i++) y[i] = a * (y[i - 1] + data[i] - data[i - 1]); return rms(y) }
    // A lamp's buzz in the air, then the head goes under.
    const buzz = (await play(3, time => ({ ...empty, ambience: { buzz: bed }, underwater: time >= 1.5 ? 1 : 0 }))).data
    // The water round the head is heard as it is: the same, rendered with the head under and not.
    const water = (await play(3, () => ({ ...empty, ambience: { underwater: bed }, underwater: 0 }))).data
    const waterUnder = (await play(3, () => ({ ...empty, ambience: { underwater: bed }, underwater: 1 }))).data
    // A field heard for a second, then nothing: its voice goes after three seconds of silence.
    const field = await play(6, time => time < 1 ? { ...empty, ambience: { field: bed } } : empty)
    // Pausing lets every voice go at once.
    const paused = await play(2, time => time < 1 ? { ...empty, ambience: { hvac: bed, water: bed } } : empty, { 1: sound => sound.silence() })
    // A long outage lets the air handling's voice go; power back builds it again, running up from stopped.
    const outage = await play(14, time => ({ ...empty, ambience: { hvac: { ...bed, power: time >= 1 && time < 10 ? 0 : 1 } } }))
    return {
      buzzDry: bright(slice(buzz, .75, 1.5)), buzzUnder: bright(slice(buzz, 2, 3)),
      waterDry: rms(slice(water, 2, 3)), waterUnder: rms(slice(waterUnder, 2, 3)),
      fieldPlaying: field.counts[.5], fieldGone: field.counts[5.5],
      pausedPlaying: paused.counts[.5], pausedGone: paused.counts[1.05],
      outageGone: outage.counts[9.5], outageBack: outage.counts[10.5],
      spinStart: rms(slice(outage.data, 10.05, 10.4)), spinRunning: rms(slice(outage.data, 13, 14)),
    }
  })
  expect(result.buzzUnder).toBeLessThan(result.buzzDry * .15)
  expect(Math.abs(result.waterUnder / result.waterDry - 1)).toBeLessThan(.02)
  expect(result.fieldPlaying).toBeGreaterThan(0)
  expect(result.fieldGone).toBe(0)
  expect(result.pausedPlaying).toBeGreaterThan(0)
  expect(result.pausedGone).toBe(0)
  expect(result.outageGone).toBe(0)
  expect(result.outageBack).toBeGreaterThan(0)
  expect(result.spinStart).toBeLessThan(result.spinRunning * .5)
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
  await page.goto('/lab/library?renderControl=1')
  await expect(page.getByRole('button', { name: /^Play Sound test$/ })).toBeVisible()
}
const peakGain = page => page.evaluate(() => Math.max(0, ...window.soundGains.map(g => g.gain.value)))

test('gameplay unlocks sound, pause/builder silence it, and leaving closes the context', async ({ page }) => {
  await setup(page)
  expect(await page.evaluate(() => window.soundContexts.length)).toBe(0)
  await page.getByRole('button', { name: 'Play Sound test', exact: true }).click(); await finishJumpingEntrance(page)
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
  await page.getByRole('button', { name: 'Play Sound test', exact: true }).click(); await finishJumpingEntrance(page)
  await expect(page.getByRole('img', { name: 'Sound test: reach the exit' })).toBeFocused()
  await page.keyboard.down('ArrowRight')
  await expect.poll(() => page.evaluate(() => window.soundContexts[0]?.state)).toBe('running')
  await expect.poll(() => peakGain(page)).toBeGreaterThan(.005)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Sound (on|off)$/ })).toHaveCount(0)
})

test('normal gameplay plays one splash for the player and each falling prop, then floating stays quiet', async ({ page }, info) => {
  const level = blankTrial()
  level.name = 'Water sound test'; level.entrance = { x: 600, y: 200 }
  level.platforms = [{ x: 560, y: 200, w: 80, h: 20 }]
  // Keep the falling routes separate so the player cannot land on a float
  // and turn the intended hard entry into a zero-speed, gentle splash.
  level.props = [{ kind: 'ball', size: 68, x: 1120, y: 390 }, { kind: 'box', size: 50, x: 1260, y: 410 }]
  level.gravityPlates = [{ id: 'pool', effect: 'water', power: 'always', x: 400, y: 500, w: 1000, h: 420, gravity: -1 }]
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab/library?motionDebug=1&renderControl=1')
  const play = page.getByRole('button', { name: 'Play Water sound test', exact: true })
  await expect(play).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.evaluate(async () => {
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    window.waterSounds = []
    const cue = JumpingSound.prototype.cue
    JumpingSound.prototype.cue = function (sound) { window.waterSounds.push(sound); return cue.call(this, sound) }
  })
  await play.click(); await finishJumpingEntrance(page)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  await page.keyboard.down('ArrowRight')
  await page.clock.runFor(600)
  expect(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1)?.x ?? 0)).toBeGreaterThan(660)
  await page.keyboard.up('ArrowRight')
  await page.clock.runFor(1400)
  const splashes = () => page.evaluate(() => window.waterSounds.filter(c => c.kind === 'water-entry'))
  await expect.poll(async () => (await splashes()).length).toBe(3)
  const entries = await splashes()
  await info.attach('water-entry-sounds', { body: JSON.stringify(entries, null, 2), contentType: 'application/json' })
  expect(entries.map(c => c.size).sort((a, b) => a - b)).toEqual([50, 60, 68])
  expect(entries.every(c => c.volume > .05 && c.strength > .2)).toBe(true)
  await page.clock.runFor(4000)
  expect(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1)?.time ?? 0)).toBeGreaterThan(5)
  expect(await splashes()).toEqual(entries)
})

test('hard landings sound louder than any step, for the player and for Rbot', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(1, rate * 2, rate), sound = new JumpingSound(ctx)
    // A running step, the softest and hardest player landings that raise dust, then Rbot's step and its softest hard landing.
    const cues = [[0, 'footstep', .8], [.4, 'landing', .45], [.8, 'landing', 1], [1.2, 'robot-footstep', .9], [1.6, 'robot-landing', .7]]
    const stages = cues.map(([time, kind, strength]) => ({ ready: ctx.suspend(time), action: () => sound.cue({ kind, volume: 1, pan: 0, strength }) }))
    const rendering = ctx.startRendering()
    for (const stage of stages) { await stage.ready; stage.action(); await ctx.resume() }
    const data = (await rendering).getChannelData(0)
    sound.dispose()
    return cues.map(([time]) => { const values = data.slice(time * rate, (time + .1) * rate); return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length) })
  })
  const [step, softLanding, hardLanding, robotStep, robotLanding] = result
  const decibels = (a, b) => 20 * Math.log10(a / b)
  expect(decibels(softLanding, step)).toBeGreaterThan(3)
  expect(decibels(hardLanding, step)).toBeGreaterThan(9)
  expect(decibels(robotLanding, robotStep)).toBeGreaterThan(2)
})

test('every surface sounds as stone with a slight change: earth muted, steel with a faint echo and overtones', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    const { JumpingSound, synthesizeSounds } = await import('/src/games/jumping/sound.ts')
    const surfaces = ['stone', 'earth', 'grass', 'metal', 'wood', 'rubber'], kinds = [['footstep', .8], ['robot-footstep', .8], ['box-impact', .65]], rate = 24000
    const plan = kinds.flatMap(([kind, strength]) => surfaces.map(surface => ({ kind, strength, surface })))
    // Steps vary their pitch from one to the next; a fresh bank for each cue plays every surface at the same pitch.
    // Each cue starts on a render quantum (128 samples), so the same cue on two surfaces lines up sample for sample.
    const span = 96 * 128 / rate
    const ctx = new OfflineAudioContext(1, Math.round(rate * plan.length * span), rate), samples = synthesizeSounds(rate), sounds = []
    const stages = plan.map((cue, i) => ({ ready: ctx.suspend(i * span), action: () => {
      const sound = new JumpingSound(ctx, samples); sounds.push(sound); sound.cue({ ...cue, volume: 1, pan: 0, size: 50 })
    } }))
    const rendering = ctx.startRendering()
    for (const stage of stages) { await stage.ready; stage.action(); await ctx.resume() }
    const data = (await rendering).getChannelData(0)
    for (const sound of sounds) sound.dispose()
    const at = (i, from, to) => data.slice(Math.round(i * span * rate) + Math.round(from * rate), Math.round(i * span * rate) + Math.round(to * rate))
    const rms = values => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length)
    // How much of a sound is in sample-to-sample change: a rough measure of brightness.
    const brightness = values => { let sum = 0, change = 0; for (let j = 1; j < values.length; j++) { sum += values[j] ** 2; change += (values[j] - values[j - 1]) ** 2 } return Math.sqrt(change / sum) }
    return plan.map(({ kind, surface }, i) => {
      // Loudness, brightness, and what rings on after the cue's own sound has ended.
      const length = { footstep: .17, 'robot-footstep': .23, 'box-impact': .18 }[kind], values = at(i, 0, .2), tail = at(i, length + .01, .4)
      // What the surface adds before steel's first echo: the same cue on stone, taken away.
      const stone = plan.findIndex(cue => cue.kind === kind && cue.surface === 'stone'), first = at(stone, 0, .07)
      const added = at(i, 0, .07).map((v, j) => v - first[j])
      return { kind, surface, rms: rms(values), brightness: brightness(values), tail: rms(tail), added: rms(added) / rms(first), addedBrightness: brightness(added) / brightness(first) }
    })
  })
  for (const kind of ['footstep', 'robot-footstep', 'box-impact']) {
    const sounds = Object.fromEntries(result.filter(r => r.kind === kind).map(r => [r.surface, r])), stone = sounds.stone
    const decibels = surface => 20 * Math.log10(sounds[surface].rms / stone.rms)
    // Felt more than heard: every surface stays within 1.5 dB of stone.
    for (const surface of Object.keys(sounds)) expect(Math.abs(decibels(surface)), `${kind} on ${surface}`).toBeLessThan(1.5)
    for (const surface of ['earth', 'grass', 'rubber']) expect(decibels(surface), `${kind} on ${surface} is a little quieter`).toBeLessThan(-.2)
    expect(sounds.earth.brightness, `${kind} on earth is a little duller`).toBeLessThan(stone.brightness)
    // Steel's overtones: higher than the cue's own sound, and faint. A step's thump is low, where the ear is
    // dull, so a ring 30 dB under it by measure is only about 20 dB under it to the ear.
    const ring = 20 * Math.log10(sounds.metal.added)
    expect(ring, `${kind} on steel rings faintly`).toBeGreaterThan(-42)
    expect(ring, `${kind} on steel rings faintly`).toBeLessThan(-30)
    // A crate's knock is about as high as the ring.
    if (kind !== 'box-impact') expect(sounds.metal.addedBrightness, `${kind} on steel rings above its own sound`).toBeGreaterThan(2)
    expect(sounds.metal.tail, `${kind} on steel echoes`).toBeGreaterThan(stone.tail * 2 + 1e-6)
  }
})

test('steel rings at its own pitch, the same under every step, while the steps vary theirs', async ({ page }) => {
  await page.goto('/lab/library?renderControl=1')
  const result = await page.evaluate(async () => {
    const { JumpingSound, synthesizeSounds } = await import('/src/games/jumping/sound.ts')
    // Two steps in a row from one bank, on stone and then on steel; each starts on a render quantum.
    const rate = 24000, span = 96 * 128 / rate, samples = synthesizeSounds(rate)
    const ctx = new OfflineAudioContext(1, Math.round(rate * span * 4), rate), banks = { stone: new JumpingSound(ctx, samples), metal: new JumpingSound(ctx, samples) }
    const plan = ['stone', 'stone', 'metal', 'metal'], stages = plan.map((surface, i) => ({ ready: ctx.suspend(i * span), action: () =>
      banks[surface].cue({ kind: 'footstep', strength: .8, surface, volume: 1, pan: 0 }) }))
    const rendering = ctx.startRendering()
    for (const stage of stages) { await stage.ready; stage.action(); await ctx.resume() }
    const data = (await rendering).getChannelData(0)
    for (const bank of Object.values(banks)) bank.dispose()
    const at = i => data.slice(Math.round(i * span * rate), Math.round(i * span * rate) + Math.round(.07 * rate))
    const rms = values => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length)
    const difference = (a, b) => rms(a.map((v, j) => v - b[j])) / rms(a)
    const rings = [at(2).map((v, j) => v - at(0)[j]), at(3).map((v, j) => v - at(1)[j])]
    return { steps: difference(at(0), at(1)), rings: difference(rings[0], rings[1]) }
  })
  expect(result.steps, 'one step differs from the next').toBeGreaterThan(.1)
  expect(result.rings, 'the floor rings the same under both').toBeLessThan(1e-3)
})
