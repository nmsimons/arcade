import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { useLevelFixtures, installTestFolder, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel } from './helpers/jumpingLevels.mjs'
test.setTimeout(90000)

const fixture = () => ({ ...blankTrial(), id: 'water-browser', name: 'Water workshop',
  spawn: { x: 500, y: 920 }, goal: { id: 'exit', x: 1500, y: 920, power: 'switched' },
  props: [{ kind: 'box', x: 350, y: 920, size: 80 }, { kind: 'ball', x: 750, y: 920, size: 80 }],
  gravityPlates: [{ id: 'water', x: 200, y: 400, w: 1000, h: 520, gravity: -1, effect: 'water', power: 'always' }] })

async function recordWater(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, round = proto.roundRect, arc = proto.arc
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.waterFrame = { fills: [], dust: 0 }
      const frame = this.canvas.waterFrame
      if (frame && this.fillStyle === '#58a9df') frame.fills.push({ args, alpha: this.globalAlpha })
      if (frame && ['#8050aa', '#e4c6ff'].includes(this.fillStyle)) frame.dust++
      return rect.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (this.canvas.waterFrame && this.fillStyle === '#b3a28d' && args[2] === 80 && args[3] === 80) {
        this.canvas.waterFrame.boxBottom = args[1] + 80; this.canvas.waterFrame.boxX = args[0] + 40
      }
      return round.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.canvas.waterFrame && this.fillStyle === '#8f9e98' && [20, 40].includes(args[2])) {
        this.canvas.waterFrame.ballBottom = args[1] + args[2]; this.canvas.waterFrame.ballX = args[0]
      }
      return arc.apply(this, args)
    }
  })
}

test('normal controls settle the player and props in translucent water and allow leaving the pool', async ({ page }, info) => {
  await useLevelFixtures(page, [fixture()]); await recordWater(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(64); await page.keyboard.up('d')
  await page.clock.runFor(8000)
  const player = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const bob = []
  for (let i = 0; i < 9; i++) { await page.clock.runFor(500); bob.push((await player()).y) }
  const settled = await player(), frame = await page.locator('canvas').evaluate(c => c.waterFrame)
  expect(Math.max(...bob) - Math.min(...bob)).toBeGreaterThan(3.2)
  expect(Math.max(...bob) - Math.min(...bob)).toBeLessThan(4.6)
  expect(Math.abs(settled.vy)).toBeLessThan(4)
  expect(settled.y).toBeGreaterThan(400); expect(settled.y).toBeLessThan(460)
  expect(settled.blends.fall).toBe(0)
  expect(Math.abs(settled.y + settled.points[1][1] - 2 - 400)).toBeLessThan(3)
  expect(settled.y + settled.points[2][1]).toBeLessThan(400)
  expect(settled.signals.grounded).toBe(false)
  expect(Math.abs(frame.boxBottom - 440)).toBeLessThan(2.4); expect(Math.abs(frame.ballBottom - 440)).toBeLessThan(2.4)
  expect(frame.fills).toHaveLength(1); expect(frame.fills[0].alpha).toBeGreaterThan(0); expect(frame.fills[0].alpha).toBeLessThan(1)
  expect(frame.dust).toBe(0)
  await page.screenshot({ path: info.outputPath('water-floating.png') })
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(650)
  const diving = await player()
  expect(diving.points[2][1]).toBeGreaterThan(diving.points[0][1] + 20)
  expect(diving.y).toBeGreaterThan(settled.y + 40)
  await page.screenshot({ path: info.outputPath('water-diving.png') })
  await page.keyboard.up('ArrowDown'); await page.keyboard.down('ArrowUp'); await page.clock.runFor(750)
  const rising = await player()
  expect(rising.blends.fall).toBe(0)
  expect(rising.points[2][1]).toBeLessThan(rising.points[0][1] - 20)
  await page.screenshot({ path: info.outputPath('water-rising.png') })
  await page.clock.runFor(4000)
  const heldUp = await player()
  expect(Math.abs(heldUp.y - settled.y)).toBeLessThan(4.6)
  expect(Math.abs(heldUp.y + heldUp.points[1][1] - 2 - 400)).toBeLessThan(3)
  await page.screenshot({ path: info.outputPath('water-held-up.png') })
  await page.keyboard.up('ArrowUp'); await page.clock.runFor(1000)
  await page.keyboard.down('d'); await page.clock.runFor(900)
  const swimming = await player()
  expect(swimming.blends.fall).toBe(1)
  expect(Math.abs(swimming.y + swimming.points[2][1] - 400)).toBeLessThan(7)
  await page.screenshot({ path: info.outputPath('water-swimming.png') })
  await page.keyboard.up('d'); await page.clock.runFor(3000)
  const resting = await player()
  expect(resting.blends.fall).toBe(0)
  expect(Math.abs(resting.y + resting.points[1][1] - 2 - 400)).toBeLessThan(3)
  // Swim beneath the resisting float, then continue beyond the open pool edge.
  await page.keyboard.down('d'); await page.keyboard.down('ArrowDown'); await page.clock.runFor(2000)
  await page.keyboard.up('ArrowDown'); await page.clock.runFor(7000); await page.keyboard.up('d')
  await page.clock.runFor(1500)
  const out = await player()
  expect(out.x).toBeGreaterThan(1240); expect(out.y).toBeCloseTo(920, 1); expect(out.signals.grounded).toBe(true)
})

for (const side of [-1, 1]) test(`floating Up beneath a small ball clears the ${side > 0 ? 'right' : 'left'} bank with normal controls`, async ({ page }, info) => {
  const level = fixture(), edge = side > 0 ? 640 : 1160, ballX = edge - side * 20
  level.spawn = { x: edge - side * 14, y: 920 }
  level.goal = { ...level.goal, x: side > 0 ? 120 : 1500 }
  level.platforms = [{ x: side > 0 ? edge : 0, y: 380, w: 1160, h: 540 }]
  level.props = [{ kind: 'ball', x: ballX, y: 420, size: 40 }]
  level.gravityPlates[0] = { ...level.gravityPlates[0], x: side > 0 ? 200 : edge, w: 440 }
  await useLevelFixtures(page, [level]); await recordWater(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  const towardBank = side > 0 ? 'd' : 'a'
  await page.keyboard.down(towardBank); await page.clock.runFor(64); await page.keyboard.up(towardBank)
  await page.keyboard.down('ArrowUp')
  await page.clock.runFor(4500)
  await page.screenshot({ path: info.outputPath('water-small-ball-contact.png') })
  await page.clock.runFor(5500)
  const p = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const frame = await page.locator('canvas').evaluate(c => c.waterFrame)
  expect((ballX - frame.ballX) * side).toBeGreaterThan(30)
  expect(Math.abs(frame.ballBottom - 420)).toBeLessThan(2.4)
  expect(p.signals.grounded, JSON.stringify(p)).toBe(true)
  expect(p.y).toBeCloseTo(380, 4)
  expect((p.x - edge) * side).toBeGreaterThan(0)
  await page.keyboard.up('ArrowUp')
  await page.screenshot({ path: info.outputPath('water-small-ball-bank-cleared.png') })
})

for (const side of [-1, 1]) test(`holding Down at the ${side > 0 ? 'left' : 'right'} bank beside a floating ball stays responsive`, async ({ page }, info) => {
  const level = fixture(), edge = side > 0 ? 640 : 1160
  level.spawn = { x: edge + side * 14, y: 360 }
  level.goal = { ...level.goal, x: side > 0 ? 120 : 1500 }
  level.platforms = [{ x: side > 0 ? edge : 0, y: 360, w: 1160, h: 560 }]
  level.props = [{ kind: 'ball', x: edge - side * 40, y: 440, size: 80 }]
  level.gravityPlates[0] = { ...level.gravityPlates[0], x: side > 0 ? 200 : edge, w: 440 }
  await useLevelFixtures(page, [level])
  // Keep a real timer before the test clock replaces performance.now.
  await page.addInitScript(() => { window.realFrameNow = performance.now.bind(performance) })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.evaluate(() => {
    const raf = window.requestAnimationFrame
    window.realFrameDurations = []
    window.requestAnimationFrame = callback => raf.call(window, (...args) => {
      const start = window.realFrameNow(); callback(...args)
      window.realFrameDurations.push(window.realFrameNow() - start)
    })
  })
  const measureFrames = async milliseconds => {
    await page.evaluate(() => { window.realFrameDurations = [] })
    await page.clock.runFor(milliseconds)
    const durations = await page.evaluate(() => window.realFrameDurations)
    durations.sort((a, b) => a - b)
    expect(durations.length).toBeGreaterThan(100)
    expect(durations.at(-1)).toBeGreaterThan(0)
    return durations
  }
  await page.clock.runFor(2000)
  const restingBefore = await measureFrames(3000)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(2000)
  const heldDown = await measureFrames(6000)
  const samples = await page.evaluate(() => window.jumpingMotion.read().recent)
  expect(samples.length).toBeGreaterThan(100)
  for (const s of samples) {
    expect(s.signals.grounded).toBe(true)
    expect(s.y).toBeCloseTo(360, 5)
  }
  await page.keyboard.up('ArrowDown')
  await page.clock.runFor(2000)
  const restingAfter = await measureFrames(3000)
  await info.attach('frame-durations', { body: JSON.stringify({ restingBefore, heldDown, restingAfter }), contentType: 'application/json' })
  const p95 = durations => durations[Math.floor(durations.length * .95)]
  // Both browser workers share CI CPUs, and these frames include rendering and
  // motion diagnostics. Compare the blocked descent with nearby resting frames
  // on the same scene rather than treating this instrumented run as a 60 Hz
  // hardware benchmark. The physics-only stall budget lives in jumping-ledge-performance.test.mjs.
  const restingCost = Math.max(p95(restingBefore), p95(restingAfter))
  expect(p95(heldDown), 'blocked descent should not double the cost of resting frames').toBeLessThan(restingCost * 2 + 1)
  await page.screenshot({ path: info.outputPath('water-bank-blocked-descent.png') })
})

for (const left of [false, true]) test(`normal controls pull out at the ${left ? 'left' : 'right'} pool ledge`, async ({ page }, info) => {
  const level = fixture(); level.props = []
  level.spawn = { x: left ? 520 : 780, y: 920 }
  level.goal = { ...level.goal, x: left ? 200 : 1500, y: 400 }
  level.gravityPlates[0] = { ...level.gravityPlates[0], x: 450, w: 400 }
  level.platforms = [left ? { x: 0, y: 400, w: 450, h: 520 } : { x: 850, y: 400, w: 950, h: 520 }]
  await useLevelFixtures(page, [level]); await recordWater(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused(); await page.clock.runFor(100)
  const direction = left ? 'a' : 'd'
  await page.keyboard.down(direction); await page.clock.runFor(160); await page.keyboard.up(direction)
  await page.clock.runFor(8000)
  const settled = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(Math.abs(settled.y - 450.34), JSON.stringify(settled)).toBeLessThan(2.4)
  await page.keyboard.down(direction); await page.keyboard.down('ArrowUp')
  await page.clock.runFor(3500)
  await page.keyboard.up(direction); await page.keyboard.up('ArrowUp')
  const out = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(out.signals.grounded, JSON.stringify(out)).toBe(true); expect(out.y).toBeCloseTo(400, 1)
  expect(left ? out.x < 450 : out.x > 850).toBe(true)
  await page.screenshot({ path: info.outputPath('water-pull-up.png') })
})

test('normal controls dive onto the pool floor, hold a crouch and release into floating', async ({ page }, info) => {
  const level = fixture(); level.props = []
  await useLevelFixtures(page, [level]); await recordWater(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused(); await page.clock.runFor(100)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(1800); await page.keyboard.up('ArrowUp')
  const lifted = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(lifted.y).toBeLessThan(880)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(4500)
  const holding = await page.evaluate(() => window.jumpingMotion.read().recent)
  for (const sample of holding.slice(-100)) {
    expect(sample.signals.grounded).toBe(true); expect(sample.y).toBeCloseTo(920, 5)
    expect(sample.blends.fall).toBe(0); expect(sample.points[2][1]).toBeLessThan(sample.points[0][1] - 7)
  }
  await page.screenshot({ path: info.outputPath('water-bottom-crouch.png') })
  await page.keyboard.up('ArrowDown'); await page.clock.runFor(650)
  const rising = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(rising.signals.grounded).toBe(false); expect(rising.y).toBeLessThan(890)
})

test('water authoring preserves appearance, resizing, power and wiring through save and reopen', async ({ page }, info) => {
  const level = fixture(); level.gravityPlates = []; level.props = []
  level.triggers = [{ x: 500, y: 920, w: 100, mode: 'weight', behavior: 'toggle', startsOn: true, targets: [] }]
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'water.json': level }); await recordWater(page)
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const local = page.getByRole('dialog').getByRole('button', { name: 'Local folder', exact: true })
  if (await local.count()) await local.click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open water.json', exact: true }).click()
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  await page.getByRole('button', { name: 'Water', exact: true }).click()
  await canvas.click({ position: { x: 380, y: 220 } })
  await selectBuilderObject(page, 'gravity-plate:0')
  await expect(page.getByRole('combobox', { name: 'Selected object', exact: true })).toContainText('Water 1')
  await expect(page.getByRole('combobox', { name: 'Water power', exact: true })).toHaveText('Always on')
  await expect(page.getByRole('spinbutton', { name: 'Gravity strength', exact: true })).toHaveCount(0)
  const height = page.getByRole('spinbutton', { name: 'Object h', exact: true })
  await height.fill('300'); await height.press('Enter')
  await selectBuilderOption(page, 'Water power', 'switched')
  await page.getByRole('group', { name: 'Switched by', exact: true }).getByRole('checkbox', { name: 'Pressure plate 1', exact: true }).check()
  const saved = await saveTestLevel(page)
  expect(saved.level.gravityPlates[0]).toMatchObject({ effect: 'water', gravity: -1, power: 'switched', h: 300 })
  expect(saved.level.triggers[0].targets).toContain(saved.level.gravityPlates[0].id)
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'gravity-plate:0')
  await expect(page.getByRole('combobox', { name: 'Field appearance', exact: true })).toHaveText('Water')
  await expect(height).toHaveValue('300')
  await expect(page.getByRole('group', { name: 'Switched by', exact: true }).getByRole('checkbox', { name: 'Pressure plate 1', exact: true })).toBeChecked()
  await page.screenshot({ path: info.outputPath('water-editor.png') })
  await selectBuilderOption(page, 'Field appearance', 'gravity')
  await expect(page.getByRole('combobox', { name: 'Gravity plate power', exact: true })).toHaveText('Switched')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'gravity-plate:0')
  await expect(page.getByRole('combobox', { name: 'Field appearance', exact: true })).toHaveText('Water')
})

test('normal controls push a float with kicking legs and quickly lose momentum on release', async ({ page }, info) => {
  const level = fixture(); level.spawn = { x: 380, y: 920 }; level.props = [{ kind: 'box', x: 500, y: 440, size: 80 }]
  await useLevelFixtures(page, [level]); await recordWater(page)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused(); await page.clock.runFor(100)
  await page.keyboard.down('d'); await page.clock.runFor(64); await page.keyboard.up('d'); await page.clock.runFor(8000)
  await page.keyboard.down('d'); await page.clock.runFor(5000)
  const history = await page.evaluate(() => window.jumpingMotion.read().recent)
  const pushing = history.at(-1)
  expect(pushing.blends.fall).toBe(1); expect(pushing.blends.push).toBe(1); expect(pushing.signals.grounded).toBe(false)
  expect(pushing.points[2][0] - pushing.points[0][0]).toBeGreaterThan(18)
  const kicks = history.map(s => s.points[8][0])
  expect(Math.max(...kicks) - Math.min(...kicks)).toBeGreaterThan(8)
  await page.screenshot({ path: info.outputPath('water-pushing.png') })
  await page.keyboard.up('d'); await page.clock.runFor(1200)
  const released = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(released.blends.push).toBe(0); expect(released.blends.fall).toBe(0); expect(Math.abs(released.vx)).toBeLessThan(1)
  const before = await page.locator('canvas').evaluate(c => c.waterFrame.boxX)
  await page.clock.runFor(1000)
  const after = await page.locator('canvas').evaluate(c => c.waterFrame.boxX)
  expect(Math.abs(after - before)).toBeLessThan(4)
})
