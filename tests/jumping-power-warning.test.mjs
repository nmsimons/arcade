import test from 'node:test'
import assert from 'node:assert/strict'

// Read drawn clocks from the display reports (debugFrames.ts), switched on before the renderer loads.
const displays = []
globalThis.window = { localStorage: { getItem: key => key === 'jumping:debug-frames' ? '1' : null },
  dispatchEvent: event => { if (event.type === 'jumping-display') displays.push(event.detail) } }
const { blankTrial } = await import('../src/games/jumping/level.ts')
const { createRun, stepRun } = await import('./helpers/jumping-active-run.mjs')
const { NEUTRAL_INPUT, STEP } = await import('../src/games/jumping/model.ts')
const { drawPuzzleWorld } = await import('../src/games/jumping/challengeRender.ts')
const { DIGITAL_DIM, DIGITAL_GREEN, DIGITAL_RED } = await import('../src/games/jumping/digitalDisplay.ts')
const { POWER_DOWN_WARNING_SECONDS, powerDownWarning } = await import('../src/games/jumping/powerDownWarning.ts')
const { JumpingAudioState } = await import('../src/games/jumping/audioState.ts')

// blankTrial's D deadline is 60 seconds.
const level = () => ({ ...blankTrial(), timers: [{ x: 200, y: 760 }] })
const steps = (run, count) => { for (let i = 0; i < count; i++) stepRun(run, NEUTRAL_INPUT) }
/** The clocks one wall draw shows. */
function clocks(run) {
  displays.length = 0
  const ctx = new Proxy({ canvas: { width: 1800, height: 920 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ width: 20 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
  { get: (target, key) => key in target ? target[key] : () => {} })
  drawPuzzleWorld(ctx, run, false, undefined, undefined, [], 'wall', 0, () => {})
  return displays.filter(display => display.value[2] === ':').map(({ value, color }) => ({ value, color }))
}
/** The border glow's bands in one full draw: each fillRect in its red, with the opacity in force. */
function border(run) {
  const bands = [], state = { fillStyle: '', globalAlpha: 1 }
  const ctx = new Proxy({ canvas: { width: 1800, height: 920 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    measureText: () => ({ width: 20 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    fillRect: (x, y, w, h) => { if (state.fillStyle === '#d6483a') bands.push({ x, y, w, h, alpha: state.globalAlpha }) } }, {
    get: (target, key) => key in target ? target[key] : key in state ? state[key] : () => {},
    set: (target, key, value) => { if (key in state) state[key] = value; else target[key] = value; return true },
  })
  drawPuzzleWorld(ctx, run, false, undefined, undefined, [], 'all', 0, () => {})
  return bands
}

test('wall clocks count the run time up from zero, and stop, dimmed, at the D limit on F', () => {
  const run = createRun(level())
  assert.deepEqual(clocks(run), [{ value: '00:00', color: DIGITAL_GREEN }])
  steps(run, 150)
  assert.deepEqual(clocks(run), [{ value: '00:01', color: DIGITAL_GREEN }])
  run.elapsed = 47.5
  assert.deepEqual(clocks(run), [{ value: '00:47', color: DIGITAL_GREEN }], 'counting up, not down to D')
  run.elapsed = 60 - STEP; steps(run, 1)
  assert.equal(run.failed, false, 'D includes its deadline')
  steps(run, 1)
  assert.equal(run.failed, true)
  steps(run, 120)
  assert.deepEqual(clocks(run), [{ value: '01:00', color: DIGITAL_DIM }], 'the limit that was passed')
  run.elapsed = 75
  assert.deepEqual(clocks(run), [{ value: '01:00', color: DIGITAL_DIM }], 'even after a penalty jumps past it')
})

test('the warning starts under ten seconds before D, beats each second, and holds until power down', () => {
  const run = createRun(level())
  run.elapsed = 60 - POWER_DOWN_WARNING_SECONDS - STEP * 2
  steps(run, 1)
  assert.equal(powerDownWarning(run), null, 'ten seconds or more is not yet the warning')
  steps(run, 2)
  assert.equal(powerDownWarning(run)?.beat, 0)
  assert.equal(clocks(run)[0].color, DIGITAL_RED, 'each beat opens red')
  const { width } = run.level, height = run.level.floor, opening = border(run)
  assert.ok(opening.length > 0, 'and the level border glows')
  assert.ok(opening.some(band => band.x === 0 && band.y === 0 && band.w === width), 'along its top')
  assert.ok(opening.some(band => band.x + band.w === width), 'its right side')
  assert.ok(opening.some(band => band.y + band.h === height), 'and its floor, not the window')
  assert.ok(opening.every(band => band.x >= 0 && band.y >= 0 && band.x + band.w <= width && band.y + band.h <= height), 'inside the level')
  steps(run, 72)
  const settled = border(run)
  assert.ok(Math.max(...settled.map(band => band.alpha)) < Math.max(...opening.map(band => band.alpha)) * .6, 'swelling on the beat, settling between')
  assert.ok(settled.length > 0)
  assert.equal(powerDownWarning(run).beat, 0)
  assert.equal(clocks(run)[0].color, DIGITAL_GREEN, 'and then shows its usual colour')
  steps(run, 48)
  assert.equal(powerDownWarning(run).beat, 1)
  assert.equal(clocks(run)[0].color, DIGITAL_RED)
  // A stopwatch freezes the clock, but not the warning.
  run.timeStopRemaining = 2
  steps(run, 240)
  assert.equal(powerDownWarning(run).beat, 3)
  assert.ok(run.timeStopRemaining < 1e-9)
  let last = powerDownWarning(run)
  while (!run.failed) { steps(run, 1); last = powerDownWarning(run) ?? last }
  assert.ok(last.remaining < .01, 'it holds to the deadline')
  assert.equal(powerDownWarning(run), null, 'power down ends it')
  assert.deepEqual(border(run), [])
  steps(run, 240)
  assert.equal(powerDownWarning(run), null)
  assert.equal(clocks(run)[0].color, DIGITAL_DIM)
})

test('the exit, a time bonus back above ten seconds, and untimed levels have no warning', () => {
  const run = createRun(level())
  run.elapsed = 55; steps(run, 1)
  assert.ok(powerDownWarning(run))
  run.elapsed -= 2; steps(run, 1)
  assert.ok(powerDownWarning(run), 'seven seconds left is still the warning')
  run.elapsed -= 5; steps(run, 1)
  assert.equal(powerDownWarning(run), null, 'twelve seconds left ends it')
  run.elapsed = 58; steps(run, 1)
  assert.equal(powerDownWarning(run).beat, 0, 'and it begins again from its first beat')
  run.exit = { elapsed: 0, fromX: run.player.x, toX: run.player.x }
  assert.equal(powerDownWarning(run), null, 'the exit stops the clock and the warning')
  assert.equal(clocks(run)[0].color, DIGITAL_GREEN)

  const untimed = createRun({ ...level(), timing: 'untimed' })
  untimed.elapsed = 58; steps(untimed, 1)
  assert.equal(powerDownWarning(untimed), null)
})

test('the warning beeps once a second, higher for the last three, until the one power-down sound', () => {
  const run = createRun(level()), audio = new JumpingAudioState()
  audio.reset(run.player, run)
  run.elapsed = 49
  const cues = []
  for (let i = 0; i < 14 / STEP; i++) {
    stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, STEP)
    cues.push(...audio.drain().cues.map(cue => ({ ...cue, at: run.activeTime })))
  }
  const beeps = cues.filter(cue => cue.kind === 'power-warning'), powerDown = cues.filter(cue => cue.kind === 'power-down')
  assert.equal(beeps.length, 10, JSON.stringify(beeps.map(beep => beep.at)))
  for (let i = 1; i < beeps.length; i++) assert.ok(Math.abs(beeps[i].at - beeps[i - 1].at - 1) < STEP, 'a second apart')
  assert.deepEqual(beeps.map(beep => beep.pitch), [1, 1, 1, 1, 1, 1, 1, 1.19, 1.19, 1.19])
  assert.ok(beeps.every(beep => beep.volume === 1 && beep.pan === 0), 'heard everywhere, centred')
  assert.equal(powerDown.length, 1)
  assert.ok(beeps.every(beep => beep.at < powerDown[0].at), 'no beep after the power goes')
})
