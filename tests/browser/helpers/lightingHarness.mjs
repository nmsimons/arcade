// Loaded only by the development browser tests through Vite.
import { createPreviewRun } from '../../../src/games/jumping/challenge.ts'
import { parseLevel } from '../../../src/games/jumping/level.ts'
import { LightingRenderer } from '../../../src/games/jumping/lightingRender.ts'
import { drawPuzzleWorld } from '../../../src/games/jumping/challengeRender.ts'
import { drawLevelBackdrop } from '../../../src/games/jumping/render.ts'

export async function lightingHarness(options) {
  const fixture = await (await fetch('/tests/fixtures/jumping/lighting-prototype.json')).json()
  const run = createPreviewRun(parseLevel({ ...fixture.level, version: 2, lighting: fixture.lighting }))
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const view = { x: 0, y: -40, width: 1280, height: 720, zoom: 1 }
  const renderer = new LightingRenderer(options)
  const render = (ambient, lights = [], dt = .2, onlyLight, nightMode = ambient < 100, shadows = 'full') => {
    const stats = renderer.render(ctx, run, { nightMode, ambient, lights }, view, dt, onlyLight, false, shadows)
    return { pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, 1280, 720).data), stats }
  }
  const fullBright = (lights = []) => {
    const stats = renderer.render(ctx, run, { nightMode: false, ambient: 0, lights }, view, .2, undefined, false, 'structural', true)
    return { pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, 1280, 720).data), stats }
  }
  const pixel = (image, x, y) => {
    const i = (Math.floor((y - view.y) * view.zoom) * canvas.width + Math.floor((x - view.x) * view.zoom)) * 4
    return [...image.pixels.slice(i, i + 3)]
  }
  const normal = (playerInk, lights = []) => {
    ctx.save(); ctx.translate(0, 40)
    drawLevelBackdrop(ctx, run.level, { x: 0, y: -40, w: 1280, h: 720 }, 1)
    drawPuzzleWorld(ctx, run, false, undefined, playerInk, lights.map(l => ({ ...l, fade: 1 }))); ctx.restore()
    return { pixels: ctx.getImageData(0, 0, 1280, 720).data }
  }
  const difference = (a, b) => a.pixels.reduce((max, channel, i) => Math.max(max, Math.abs(channel - b.pixels[i])), 0)
  return { fixture, run, view, canvas, renderer, render, fullBright, pixel, normal, difference }
}
