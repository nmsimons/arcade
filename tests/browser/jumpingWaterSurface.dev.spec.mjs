import { test, expect } from './helpers/test.mjs'

test('water entry review shows restrained ripples and physical float motion in a concave pool', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/single-block-pool.json')
  const result = await page.evaluate(async () => {
    const { parseLevel } = await import('/src/games/jumping/level.ts')
    const { createRun, stepRun } = await import('/src/games/jumping/challenge.ts')
    const { NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { drawPuzzleWorld } = await import('/src/games/jumping/challengeRender.ts')
    const { playerSwimStrength } = await import('/src/games/jumping/gravity.ts')
    const level = parseLevel(await (await fetch('/tests/fixtures/jumping/single-block-pool.json')).json())
    level.spawn = { x: 950, y: 210 }; level.goal = { ...level.goal, id: 'closed', power: 'switched' }
    level.props = [{ kind: 'box', x: 1020, y: 355, size: 60 }, { kind: 'ball', x: 1130, y: 355, size: 60 }]
    const run = createRun(level); run.started = true
    const quietLevel = { ...level, spawn: { x: 115, y: 290 } }, quiet = createRun(quietLevel); quiet.started = true
    const canvas = document.createElement('canvas'); canvas.id = 'water-surface-review'; canvas.width = 1200; canvas.height = 860
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), frames = [], columns = 2, scale = 1.4
    let entryTime = null, maximum = 0, boxMotion = 0, boxRock = 0
    const capture = label => {
      const index = frames.length, x = index % columns * 600, y = Math.floor(index / columns) * 285
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 600, 285); ctx.clip()
      ctx.fillStyle = '#f0efe8'; ctx.fillRect(x, y, 600, 285)
      ctx.translate(x + 50 - 900 * scale, y + 125 - 325 * scale); ctx.scale(scale, scale)
      drawPuzzleWorld(ctx, run); ctx.restore()
      ctx.fillStyle = '#43494b'; ctx.font = '15px sans-serif'; ctx.fillText(label, x + 18, y + 26)
      frames.push({ label, time: run.activeTime, amplitude: Math.max(...run.waterSurface.surfaces.flatMap(s => [...s.height].map(Math.abs))),
        boxY: run.props[0].y, boxAngle: run.props[0].angle, wet: playerSwimStrength(run.gravityField, run.player) })
    }
    capture('Before entry')
    const offsets = [.15, .45, .8, 1.4, 6]
    let next = 0
    for (let i = 0; i < 1100 && next < offsets.length; i++) {
      stepRun(run, NEUTRAL_INPUT, STEP); stepRun(quiet, NEUTRAL_INPUT, STEP)
      const amplitude = Math.max(...run.waterSurface.surfaces.flatMap(s => [...s.height].map(Math.abs)))
      maximum = Math.max(maximum, amplitude)
      boxMotion = Math.max(boxMotion, Math.abs(run.props[0].y - quiet.props[0].y)); boxRock = Math.max(boxRock, Math.abs(run.props[0].angle))
      if (entryTime === null && run.waterSurface.active) entryTime = run.activeTime
      if (entryTime !== null && run.activeTime >= entryTime + offsets[next]) {
        capture(`Entry + ${offsets[next].toFixed(2)} s`); next++
      }
    }
    return { maximum, boxMotion, boxRock, frames, settled: !run.waterSurface.active, finalAngle: run.props[0].angle }
  })
  expect(result.maximum).toBeGreaterThan(1); expect(result.maximum).toBeLessThanOrEqual(6)
  expect(result.boxMotion).toBeGreaterThan(.1); expect(result.boxMotion).toBeLessThan(5)
  expect(result.boxRock).toBeGreaterThan(.002); expect(result.boxRock).toBeLessThan(.1)
  expect(result.settled).toBe(true); expect(Math.abs(result.finalAngle)).toBeLessThan(.002)
  expect(result.frames).toHaveLength(6)
  await page.locator('#water-surface-review').screenshot({ path: info.outputPath('water-surface-entry.png') })
  await info.attach('water-surface-motion', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
})
