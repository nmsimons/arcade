import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { useLevelFixtures, installTestFolder, selectBuilderObject, selectBuilderOption, saveTestLevel, reopenTestLevel, restartFromPause } from './helpers/jumpingLevels.mjs'

function fixture(power = 'always') {
  return { ...blankTrial(), id: 'gravity-browser-test', name: 'Gravity workshop', width: 1200, height: 600, floor: 600,
    spawn: { x: 300, y: 600 }, goal: { x: 1040, y: 600 },
    props: [{ kind: 'box', x: 160, y: 600, size: 60 }, { kind: 'ball', x: 230, y: 600, size: 60 }],
    gravityPlates: [{ id: 'gravity', x: 120, y: 0, w: 580, h: 600, gravity: -1, power }],
    triggers: power === 'switched' ? [{ x: 260, y: 600, w: 100, mode: 'weight', behavior: 'switch', targets: ['gravity'] }] : [] }
}
async function open(page, power = 'always', level = fixture(power)) {
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, round = proto.roundRect, arc = proto.arc, outline = proto.strokeRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.gravityFrame = { active: false, handles: [], dust: [], dustRaster: [], fieldFill: false, fieldOutline: false }
      const frame = this.canvas.gravityFrame
      if (frame && this.fillStyle === '#bda0e5') frame.active = true
      if (frame && this.fillStyle === '#9775cc') frame.fieldFill = true
      if (frame && ['#8050aa', '#e4c6ff'].includes(this.fillStyle)) {
        frame.dust.push(args)
        const t = this.getTransform(), [x, y, w, h] = args
        frame.dustRaster.push({ x: t.a * (x + w / 2) + t.e, y: t.d * (y + h / 2) + t.f, w: w * t.a, h: h * t.d })
      }
      if (frame && this.fillStyle === '#c65231') {
        const t = this.getTransform(), [x, y, w, h] = args
        frame.handles.push({ x: t.a * (x + w / 2) + t.e, y: t.d * (y + h / 2) + t.f })
      }
      return rect.apply(this, args)
    }
    proto.strokeRect = function (...args) {
      if (this.canvas.gravityFrame && ['#9b7ac6', '#948a9e'].includes(this.strokeStyle)) this.canvas.gravityFrame.fieldOutline = true
      return outline.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (this.canvas.gravityFrame && this.fillStyle === '#b3a28d' && args[2] === 60 && args[3] === 60) this.canvas.gravityFrame.boxBottom = args[1] + 60
      return round.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.canvas.gravityFrame && this.fillStyle === '#8f9e98' && args[2] === 30) this.canvas.gravityFrame.ballBottom = args[1] + 30
      return arc.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
}
const player = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
const frame = page => page.locator('canvas').evaluate(canvas => canvas.gravityFrame)

for (const night of [false, true]) test(`small weak-gravity fields have visible moving dust in ${night ? 'night' : 'day'} rooms`, async ({ page }, info) => {
  const level = fixture(); level.props = []; level.spawn.x = 200
  level.gravityPlates[0] = { ...level.gravityPlates[0], w: 160, y: 280, h: 320, gravity: -.2 }
  if (night) { level.version = 2; level.lighting = { nightMode: true, ambient: 0, lights: [] } }
  await open(page, 'always', level)
  const before = (await frame(page)).dust
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d')
  await page.clock.runFor(700)
  expect((await frame(page)).dust).not.toEqual(before)
  // Check the final composited pixels, including night lighting, rather than
  // just verifying that the particle drawing commands ran.
  const visible = await page.locator('canvas').evaluate((canvas, night) => {
    const ctx = canvas.getContext('2d'), samples = canvas.gravityFrame.dustRaster
    const brightness = (x, y) => {
      const [r, g, b] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
      return (r + g + b) / 3
    }
    return samples.filter(p => p.x > 12 && p.x < canvas.width - 12 && p.y > 12 && p.y < canvas.height - 12
      && (night ? 1 : -1) * (brightness(p.x, p.y) - brightness(p.x + 10, p.y)) > 30).length
  }, night)
  expect(visible).toBeGreaterThanOrEqual(4)
  await page.screenshot({ path: info.outputPath(`gravity-dust-${night ? 'night' : 'day'}.png`) })
})

for (const power of ['always', 'switched']) test(`${power} rectangular gravity lifts the player and loose objects with normal controls, and resets`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page, power)
  const initial = await frame(page)
  expect(initial.active).toBe(power === 'always')
  expect(initial.fieldFill).toBe(false); expect(initial.fieldOutline).toBe(false)
  expect(initial.dust.length > 0).toBe(power === 'always')
  // A small input starts the simulation. The switched case physically presses
  // its latching pressure switch before the player leaves the floor.
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d')
  await page.clock.runFor(700)
  const rising = await player(page), props = await frame(page)
  expect(rising.y).toBeLessThan(400); expect(rising.vy).toBeLessThan(-700)
  expect(rising.signals.grounded).toBe(false)
  expect(props.active).toBe(true); expect(props.boxBottom).toBeLessThan(400); expect(props.ballBottom).toBeLessThan(400)
  expect(props.dust.length).toBeGreaterThan(0); expect(props.dust.length).toBeLessThanOrEqual(96)
  expect(props.fieldFill).toBe(false); expect(props.fieldOutline).toBe(false)
  if (power === 'always') expect(props.dust).not.toEqual(initial.dust)
  await page.screenshot({ path: info.outputPath(`gravity-${power}-lifting.png`) })
  if (power === 'always') {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
    await page.clock.runFor(64)
    const pausedDust = (await frame(page)).dust
    await page.clock.runFor(600)
    expect((await frame(page)).dust).toEqual(pausedDust)
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
  }
  await page.clock.runFor(1800)
  expect((await player(page)).y).toBeCloseTo(0, 1)
  expect((await player(page)).signals.grounded).toBe(true)
  expect((await frame(page)).boxBottom).toBeCloseTo(60, 0)
  expect((await frame(page)).ballBottom).toBeCloseTo(60, 0)
  await page.screenshot({ path: info.outputPath(`gravity-${power}-ceiling.png`) })
  await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space')
  await page.clock.runFor(150)
  expect((await player(page)).y).toBeGreaterThan(20)
  expect((await player(page)).signals.grounded).toBe(false)
  await page.clock.runFor(1000)
  expect((await player(page)).y).toBeCloseTo(0, 1)
  await page.keyboard.down('d'); await page.clock.runFor(1200); await page.keyboard.up('d')
  await page.keyboard.down('a'); await page.clock.runFor(1000); await page.keyboard.up('a')
  await page.clock.runFor(700)
  const recovered = await player(page)
  expect(recovered.x).toBeGreaterThan(712); expect(recovered.y).toBeCloseTo(600, 1)
  expect(recovered.signals.grounded).toBe(true)
  await page.screenshot({ path: info.outputPath(`gravity-${power}-recovery.png`) })
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await frame(page)).active).toBe(power === 'always')
  expect((await frame(page)).boxBottom).toBeCloseTo(600, 1)
  expect((await frame(page)).ballBottom).toBeCloseTo(600, 1)
  expect(errors).toEqual([])
})

for (const slope of [-1, 1]) test(`the player walks and jumps on a ceiling sloping ${slope < 0 ? 'up' : 'down'} with normal controls`, async ({ page }, info) => {
  const level = fixture(); level.props = []
  level.platforms = [{ x: 100, y: 80, w: 600, h: 150,
    polygon: [[0, 0], [600, 0], [600, slope > 0 ? 150 : 60], [0, slope > 0 ? 60 : 150]] }]
  await open(page, 'always', level)
  await page.keyboard.down('d'); await page.clock.runFor(32); await page.keyboard.up('d')
  await page.clock.runFor(2200)
  const landed = await player(page)
  expect(landed.signals.grounded).toBe(true)
  const surfaceY = x => 80 + (slope > 0 ? 60 + (x - 100) * .15 : 150 - (x - 100) * .15)
  expect(landed.y).toBeCloseTo(surfaceY(landed.x), 1)
  await page.keyboard.down('d'); await page.clock.runFor(650); await page.keyboard.up('d')
  const walking = await player(page)
  expect(walking.x).toBeGreaterThan(landed.x + 100)
  expect(walking.signals.grounded).toBe(true)
  expect(walking.y).toBeCloseTo(surfaceY(walking.x), 1)
  await page.screenshot({ path: info.outputPath(`gravity-slope-${slope}-running.png`) })
  await page.clock.runFor(200)
  await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space')
  await page.clock.runFor(150)
  expect((await player(page)).y).toBeGreaterThan(walking.y + 20)
  expect((await player(page)).signals.grounded).toBe(false)
  await page.clock.runFor(1000)
  const settled = await player(page)
  expect(settled.signals.grounded).toBe(true)
  expect(settled.y).toBeCloseTo(surfaceY(settled.x), 1)
})

test('gravity authoring exposes power, fractional strength, eight resize handles, wiring, undo and save/reopen', async ({ page }, info) => {
  const level = fixture('switched'); level.gravityPlates = []; level.triggers[0].targets = []
  await useLevelFixtures(page, [level]); await installTestFolder(page, { 'gravity.json': level })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect
    proto.fillRect = function (...args) {
      const canvas = this.canvas
      if (args[0] === 0 && args[1] === 0) canvas.gravityHandles = []
      if (this.fillStyle === '#c65231' && args[2] === args[3]) {
        const t = this.getTransform(), [x, y, w, h] = args
        canvas.gravityHandles ??= []
        canvas.gravityHandles.push({ x: t.a * (x + w / 2) + t.e, y: t.d * (y + h / 2) + t.f })
      }
      return rect.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const local = page.getByRole('dialog').getByRole('button', { name: 'Local folder', exact: true })
  if (await local.count()) await local.click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open gravity.json', exact: true }).click()
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  await page.getByRole('button', { name: 'Gravity plate', exact: true }).click()
  await canvas.click({ position: { x: 380, y: 280 } })
  await selectBuilderObject(page, 'gravity-plate:0')
  await expect(page.getByRole('combobox', { name: 'Gravity plate power', exact: true })).toHaveText('Switched')
  const strength = page.getByRole('spinbutton', { name: 'Gravity strength', exact: true })
  await strength.fill('-0.5'); await strength.press('Enter'); await expect(strength).toHaveValue('-0.5')
  const incoming = page.getByRole('group', { name: 'Switched by', exact: true })
  await incoming.getByRole('checkbox', { name: 'Pressure plate 1', exact: true }).check()
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
  await expect.poll(() => canvas.evaluate(c => c.gravityHandles?.length)).toBe(8)
  const before = Number(await page.getByRole('spinbutton', { name: 'Object h', exact: true }).inputValue())
  const handles = await canvas.evaluate(c => c.gravityHandles), bounds = await canvas.boundingBox()
  // Top midpoint: changing height keeps the plate's bottom edge fixed.
  const top = handles[1]
  await page.mouse.move(bounds.x + top.x, bounds.y + top.y)
  await page.mouse.down(); await page.mouse.move(bounds.x + top.x, bounds.y + top.y + 40, { steps: 8 }); await page.mouse.up()
  const resized = Number(await page.getByRole('spinbutton', { name: 'Object h', exact: true }).inputValue())
  expect(resized).toBeLessThan(before)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'gravity-plate:0')
  await expect(page.getByRole('spinbutton', { name: 'Object h', exact: true })).toHaveValue(String(before))
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'gravity-plate:0')
  await selectBuilderOption(page, 'Gravity plate power', 'always')
  await expect(incoming).toHaveCount(0)
  await selectBuilderOption(page, 'Gravity plate power', 'switched')
  await incoming.getByRole('checkbox', { name: 'Pressure plate 1', exact: true }).check()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  const saved = await saveTestLevel(page)
  expect(saved.level.gravityPlates).toHaveLength(2)
  expect(saved.level.gravityPlates[0]).toMatchObject({ gravity: -.5, power: 'switched', h: resized })
  expect(saved.level.triggers[0].targets).toContain(saved.level.gravityPlates[0].id)
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'gravity-plate:0')
  await expect(strength).toHaveValue('-0.5')
  await expect(incoming.getByRole('checkbox', { name: 'Pressure plate 1', exact: true })).toBeChecked()
  await expect.poll(() => canvas.evaluate(c => c.gravityHandles?.length)).toBe(8)
  await page.screenshot({ path: info.outputPath('gravity-editor-handles.png') })
})
