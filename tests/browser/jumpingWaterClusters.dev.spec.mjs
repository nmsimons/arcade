import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

test('six floating balls: surface pushes, underwater passes and reversals stay graceful', async ({ page }, info) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { createWaterCluster, clusterStages, clusterInput } = await import('/tests/helpers/jumpingWaterCluster.mjs')
    const { stepRun } = await import('/src/games/jumping/challenge.ts')
    const { STEP } = await import('/src/games/jumping/model.ts')
    const { drawPuzzleWorld } = await import('/src/games/jumping/challengeRender.ts')
    const canvas = document.createElement('canvas'); canvas.id = 'water-cluster-review'; canvas.width = 1500; canvas.height = 1200
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), samples = []
    for (const [row, side] of [1, -1].entries()) {
      const run = createWaterCluster(side, 48, 50), scale = 2.5
      for (const [col, [label, seconds, intent]] of clusterStages.entries()) {
        for (let i = 0; i < Math.round(seconds / STEP); i++) stepRun(run, clusterInput(intent, side), STEP)
        const ox = col % 3 * 500, oy = (row * 2 + Math.floor(col / 3)) * 300, p = run.player
        ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, 500, 300); ctx.clip(); ctx.fillStyle = '#f1f1ed'; ctx.fillRect(ox, oy, 500, 300)
        const centerY = Math.max(420, p.y - 35)
        ctx.translate(ox + 250 - p.x * scale, oy + 150 - centerY * scale); ctx.scale(scale, scale); drawPuzzleWorld(ctx, run); ctx.restore()
        ctx.fillStyle = '#43494b'; ctx.font = '15px sans-serif'; ctx.fillText(`${label} / ${side > 0 ? 'right' : 'left'}`, ox + 12, oy + 23)
        ctx.strokeStyle = '#ddd'; ctx.strokeRect(ox, oy, 500, 300)
        samples.push({ label, side, x: p.x, y: p.y, underwater: !!p.waterMotion?.underwater, push: p.pushing?.amount ?? 0, balls: run.props.map(b => ({ x: b.x, y: b.y })) })
      }
    }
    return samples
  })
  expect(result.filter(s => s.label === 'Swim below').every(s => s.underwater)).toBe(true)
  await page.locator('#water-cluster-review').screenshot({ path: info.outputPath('water-cluster-poses.png') })
  await info.attach('water-cluster-samples', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
})

test('normal keyboard swimming pushes a group at the surface, dives underneath and returns', async ({ page }, info) => {
  test.setTimeout(60000)
  const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/single-block-pool.json', import.meta.url), 'utf8'))
  level.name = 'Six floating balls'; level.goal = { ...level.goal, id: 'closed', power: 'switched' }
  level.props = Array.from({ length: 6 }, (_, i) => ({ kind: 'ball', x: 1000 + i * 48, y: 345, size: 40 }))
  await useLevelFixtures(page, [level]); await page.goto('/untitled-jumping-game?motionDebug=1')
  await page.getByRole('button', { name: 'Play Six floating balls', exact: true }).click()
  const canvas = page.locator('canvas'); await expect(canvas).toBeFocused()
  const stages = [ ['Surface', ['d'], 9000], ['Dive', ['ArrowDown'], 1500], ['Below left', ['a'], 2200],
    ['Rise right', ['d', 'ArrowUp'], 2600], ['Reverse', ['a'], 1600], ['Float', [], 1000] ]
  const samples = []
  for (const [label, keys, ms] of stages) {
    for (const key of keys) await page.keyboard.down(key)
    await page.waitForTimeout(ms)
    for (const key of keys) await page.keyboard.up(key)
    samples.push({ label, ...await page.evaluate(() => window.jumpingMotion.read()) })
    await canvas.screenshot({ path: info.outputPath(`cluster-${label.replaceAll(' ', '-').toLowerCase()}.png`) })
  }
  await info.attach('keyboard-cluster-motion', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
  expect(samples.find(s => s.label === 'Dive').recent.at(-1).waterCenter).toBeGreaterThan(370)
  expect(samples.find(s => s.label === 'Below left').recent.at(-1).waterCenter).toBeGreaterThan(370)
})

test('normal controls skim beneath a floating cluster, rise into it and turn away', async ({ page }, info) => {
  test.setTimeout(60000)
  const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/single-block-pool.json', import.meta.url), 'utf8'))
  level.name = 'Beneath six floats'; level.spawn = { x: 1080, y: 765 }
  level.goal = { ...level.goal, id: 'closed', power: 'switched' }
  level.props = Array.from({ length: 6 }, (_, i) => ({ kind: 'ball', x: 1000 + i * 48, y: 345, size: 40 }))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-10-10T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.getByRole('button', { name: 'Play Beneath six floats', exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-10T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Beneath six floats', exact: true }).click()
  const canvas = page.locator('canvas'); await expect(canvas).toBeFocused()
  await page.clock.runFor(64)
  const samples = []
  // Stop the ascent below the balls with room for the remaining upward glide.
  // Pause simulated time during screenshots so runner speed cannot carry the
  // swimmer to the surface before the horizontal underside pass begins.
  await page.keyboard.down('ArrowUp')
  let ascent
  for (let elapsed = 0; elapsed < 5000; elapsed += 64) {
    await page.clock.runFor(64)
    ascent = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    if (ascent.waterCenter <= 425) break
  }
  await page.keyboard.up('ArrowUp')
  expect(ascent.waterCenter).toBeGreaterThan(410)
  expect(ascent.waterCenter).toBeLessThanOrEqual(425)
  await page.clock.runFor(640)
  samples.push({ label: 'Ascent', ...await page.evaluate(() => window.jumpingMotion.read()) })
  await canvas.screenshot({ path: info.outputPath('underside-ascent.png') })
  for (const [label, keys, ms] of [ ['Underneath', ['d'], 1200], ['Rise', ['ArrowUp'], 1100],
    ['Turn-and-dive', ['a', 'ArrowDown'], 800], ['Rise-again', ['d', 'ArrowUp'], 900], ['Float', [], 500] ]) {
    for (const key of keys) await page.keyboard.down(key)
    await page.clock.runFor(ms)
    for (const key of keys) await page.keyboard.up(key)
    samples.push({ label, ...await page.evaluate(() => window.jumpingMotion.read()) })
    await canvas.screenshot({ path: info.outputPath(`underside-${label.toLowerCase()}.png`) })
  }
  await info.attach('underside-motion', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
  const underneath = samples.find(s => s.label === 'Underneath').recent.at(-1)
  expect(underneath.waterCenter).toBeGreaterThan(370)
  expect(underneath.x - samples[0].recent.at(-1).x).toBeGreaterThan(75)
})
