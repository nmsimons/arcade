import { installAthleteHeadObserver } from './helpers/athleteHead.mjs'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { bodyPolygon, polygonIntersects } from '../../src/games/jumping/geometry.ts'
import { addItem } from '../../src/games/jumping/editor.ts'

for (const [tread, template] of [[20, false], [40, false], [40, true]]) test(`${template ? 'Steps wide template' : `${tread}-unit stair treads`} climb with ordinary movement controls`, async ({ page }, info) => {
  const steps = Array.from({ length: 5 }, (_, i) => ({ x: 300 + i * tread, y: 400 - i * 20, w: i === 4 ? 420 - i * tread : tread }))
  const stairs = template ? addItem(blankTrial(), 'steps-wide', { x: 300, y: 320 }, { x: 300, y: 320 }).level.platforms[0] : { x: 300, y: 320, w: 420, h: 100,
    polygon: [...steps.flatMap(s => [[s.x - 300, s.y - 320], [s.x + s.w - 300, s.y - 320]]), [420,100],[0,100]] }
  const level = { ...blankTrial(), name: 'Stair treads', width: 1000, height: 420, floor: 420,
    entrance: { x: 250, y: 420 }, goal: { x: 100, y: 420 }, platforms: [stairs] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await installAthleteHeadObserver(page)
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.stairCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    window.addEventListener('jumping-athlete-head', ({ detail: { canvas, body } }) => {
      if (canvas.stairCamera) {
        const root = canvas.stairCamera.multiply(body)
        canvas.stairFrames ??= []
        canvas.stairFrames.push({ x: root.e, y: root.f })
      }
    })
  })
  await page.goto('/lab')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click(); await finishJumpingEntrance(page)
  const canvas = page.getByRole('img', { name: 'Stair treads: reach the exit' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  await canvas.evaluate(c => { c.stairFrames = [] })
  await page.keyboard.down('d'); await page.clock.runFor(850)
  await page.screenshot({ path: info.outputPath('climbing-stairs.png') })
  for (let i = 0; i < 30; i++) {
    const last = await canvas.evaluate(c => c.stairFrames.at(-1))
    if (last.x > (template ? 320 : 330) + 4 * tread && Math.abs(last.y - 320) < .01) break
    await page.clock.runFor(32)
  }
  await page.keyboard.up('d'); await page.clock.runFor(200)
  const frames = await canvas.evaluate(c => c.stairFrames)
  expect(frames.at(-1).y).toBeCloseTo(320, 2)
  expect(frames.at(-1).x).toBeGreaterThan(320 + 4 * tread)
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    expect(polygonIntersects(bodyPolygon(frame.x, frame.y, 62), stairs, .002)).toBe(false)
    if (i) expect(Math.hypot(frame.x - frames[i - 1].x, frame.y - frames[i - 1].y)).toBeLessThan(15)
  }
  for (const y of [400, 380, 360, 340, 320]) expect(frames.some(f => Math.abs(f.y - y) < .01)).toBe(true)
  await page.screenshot({ path: info.outputPath('reached-top.png') })
  expect(errors).toEqual([])
})
