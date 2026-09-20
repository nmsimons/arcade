import { test, expect } from '@playwright/test'
import { freshExpedition, SAVE_KEY } from '../../src/games/hardVacuum/expedition.ts'
import { STATION_TERRAIN } from '../../src/games/hardVacuum/stationLayout.ts'
import { getDemoCavernMap } from '../../src/games/hardVacuum/worldGeometry.ts'

test('each frame outlines all rock once without clipping outer walls or restyling machinery', async ({ page }, testInfo) => {
  const state = freshExpedition('freight')
  state.position = { x: 7570, y: 1200 }
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state))
    const proto = CanvasRenderingContext2D.prototype, contexts = new WeakMap()
    const context = ctx => {
      if (!contexts.has(ctx)) contexts.set(ctx, { contours: [], clips: 0, stack: [] })
      return contexts.get(ctx)
    }
    const intercept = (method, observe) => {
      const original = proto[method]
      proto[method] = function (...args) { observe(this, ...args); return original.apply(this, args) }
    }
    intercept('save', ctx => { const c = context(ctx); c.stack.push(c.clips) })
    intercept('restore', ctx => { const c = context(ctx); c.clips = c.stack.pop() ?? 0 })
    intercept('clip', ctx => { context(ctx).clips++ })
    intercept('beginPath', ctx => { context(ctx).contours = [] })
    intercept('moveTo', (ctx, x, y) => { context(ctx).contours.push({ start: { x, y }, points: 1, closed: false }) })
    intercept('lineTo', ctx => { const contour = context(ctx).contours.at(-1); if (contour) contour.points++ })
    intercept('closePath', ctx => { const contour = context(ctx).contours.at(-1); if (contour) contour.closed = true })
    intercept('fillRect', ctx => {
      if (ctx.fillStyle === '#050808') window.terrainFrame = { strokes: [], legacy: 0 }
    })
    intercept('stroke', ctx => {
      if (!window.terrainFrame) return
      const color = String(ctx.strokeStyle).replaceAll(' ', '')
      if (color.startsWith('rgba(70,112,96,') && ctx.lineWidth === 7) window.terrainFrame.legacy++
      if (color === 'rgba(70,100,86,0.4)' || color === 'rgba(174,197,181,0.52)') {
        const c = context(ctx)
        window.terrainFrame.strokes.push({ contours: structuredClone(c.contours), clips: c.clips, width: Number(ctx.lineWidth.toFixed(4)) })
      }
    })
  }, { key: SAVE_KEY, state })
  const expectedFrame = contours => ({
    legacy: 0,
    strokes: [5, 1.4].map(width => ({ width, clips: 0,
      contours: contours.map(points => ({ start: points[0], points: points.length, closed: true })),
    })),
  })
  await page.goto('/hard-vacuum')
  const demo = getDemoCavernMap(1)
  await expect.poll(() => page.evaluate(() => window.terrainFrame)).toEqual(expectedFrame([demo.boundary, ...demo.obstacles]))
  await page.getByRole('button', { name: 'Continue expedition', exact: true }).press('Enter')
  await expect(page.locator('canvas')).toBeFocused()
  await expect.poll(() => page.evaluate(() => window.terrainFrame)).toEqual(expectedFrame([STATION_TERRAIN.boundary, ...STATION_TERRAIN.islands]))
  await page.screenshot({ path: testInfo.outputPath('consistent-walls.png') })
})
