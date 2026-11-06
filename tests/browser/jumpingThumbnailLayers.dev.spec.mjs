import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { daylightInkPalette } from './helpers/jumpingLighting.mjs'

// Level thumbnails appear only in the development level library.
test('objects occlude collectibles, wall timers and text in thumbnails and gameplay', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Wall layers'; level.width = 1280; level.height = level.floor = 620
  level.entrance = { x: 80, y: 620 }; level.goal = { x: 1120, y: 620 }
  const kinds = ['coin', 'stopwatch', 'fast-stopwatch', 'time-bonus', 'time-penalty', 'emp']
  level.pickups = kinds.map((kind, i) => ({ kind, x: 200 + i * 160, y: 560,
    ...(['time-bonus', 'time-penalty'].includes(kind) ? { seconds: 5 } : {}) }))
  level.props = kinds.map((_, i) => ({ kind: i % 2 ? 'box' : 'ball', x: 200 + i * 160, y: 620, size: 120 }))
  level.props.push({ kind: 'box', x: 430, y: 350, size: 200 }, { kind: 'box', x: 800, y: 350, size: 200 })
  level.platforms = [{ x: 310, y: 350, w: 240, h: 20 }, { x: 680, y: 350, w: 240, h: 20 }]
  level.timers = [{ x: 330, y: 220 }]
  level.texts = [{ x: 715, y: 225, w: 150, h: 60, text: 'BEHIND', fontSize: 24, align: 'left' }]
  expect(levelProblems(level)).toEqual([])
  const regions = [...level.pickups.map(p => ({ x: p.x - 24, y: p.y - 32, w: 48, h: 60 })),
    { x: 330, y: 220, w: 200, h: 60 }, { x: 715, y: 225, w: 150, h: 60 }]
  const exposed = level.pickups.map(p => ({ ...p, y: 430 }))
  level.pickups.push(...exposed)
  const exposedRegions = exposed.map(p => ({ x: p.x - 24, y: p.y - 32, w: 48, h: 60 }))
  const wallInk = daylightInkPalette(['ba8542', 'dfb44f', 'ac7b35', '94433f', '718074', 'e2e7da', '40574a'])
  const objectInk = daylightInkPalette(['8f9e98', '667b72', 'b3a28d', '938777'])
  const visibleInk = (canvas, areas = regions) => canvas.evaluate((c, { regions, wallInk, objectInk }) => {
    const ctx = c.getContext('2d'), m = c.levelCamera
    const wall = new Set(wallInk), objects = new Set(objectInk)
    return regions.map(r => {
      const x = Math.ceil(r.x * m.a + m.e), y = Math.ceil(r.y * m.d + m.f)
      const data = ctx.getImageData(x, y, Math.floor(r.w * m.a), Math.floor(r.h * m.d)).data
      let leaked = 0, object = 0
      for (let i = 0; i < data.length; i += 4) {
        const color = [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
        if (wall.has(color)) leaked++
        if (objects.has(color)) object++
      }
      return { leaked, object }
    })
  }, { regions: areas, wallInk, objectInk })
  const check = async canvas => {
    const samples = await visibleInk(canvas)
    for (const sample of samples) { expect(sample.leaked).toBe(0); expect(sample.object).toBeGreaterThan(0) }
  }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    // Each canvas records the camera transform of the frame it last painted.
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.levelCamera = this.getTransform()
      return rect.apply(this, args)
    }
  })
  await page.goto('/lab/library?renderControl=1')
  const thumbnail = page.locator('.jumping-level-card[aria-pressed=true] canvas')
  // Let real worker preparation finish before the virtual clock jumps past its deadline.
  await expect.poll(() => thumbnail.evaluate(c => c.width)).toBeGreaterThan(1)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await check(thumbnail)
  await page.locator('.jumping-level-card[aria-pressed=true]').click(); await finishJumpingEntrance(page)
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.clock.runFor(64)
  await check(page.locator('canvas[role="img"]'))
  for (const sample of await visibleInk(page.locator('canvas[role="img"]'), exposedRegions)) {
    expect(sample.leaked, 'each uncovered collectible is still drawn').toBeGreaterThan(0)
  }
  await page.screenshot({ path: info.outputPath('wall-items-behind-objects.png') })
})
