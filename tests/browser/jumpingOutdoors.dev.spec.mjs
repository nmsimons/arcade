import { test, expect } from './helpers/test.mjs'
import { installBuiltInFixtures, selectBuilderOption, waitForBuilderPreview } from './helpers/jumpingLevels.mjs'
import { readFileSync } from 'node:fs'

const root = new URL('../../public/levels/jumping/', import.meta.url)
const finale = JSON.parse(readFileSync(new URL('spelunk3.jump-level.json', root), 'utf8'))
const catalog = JSON.parse(readFileSync(new URL('index.json', root), 'utf8'))
const spelunkIFile = catalog.levels.find(file => JSON.parse(readFileSync(new URL(file, root), 'utf8')).id === '13b9b9d7-7937-4989-bc03-21238e7e58f2')

for (const backend of ['canvas', 'gpu']) test(`${backend}: sky receives no wall shadows; cave night and exterior daylight share one scene`, async ({ page }, info) => {
  await page.goto('/lab')
  const result = await page.evaluate(async backend => {
    const { blankTrial, parseLevel } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = parseLevel({ ...blankTrial(), version: 2, width: 1200, height: 720, floor: 720,
      entrance: { x: 100, y: 720 }, goal: { x: 1060, y: 720 },
      environment: { kind: 'landscape', horizon: 530, walls: [{ kind: 'cave', x: 0, y: 0, w: 500, h: 720 }] },
      platforms: [{ x: 300, y: 120, w: 600, h: 30 }, { x: 800, y: 600, w: 200, h: 120 }],
      lighting: { nightMode: true, ambient: 0, lights: [] } })
    const run = createPreviewRun(level), renderer = new LightingRenderer({ backend })
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 720
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), view = { x: 0, y: 0, width: 1200, height: 720, zoom: 1 }
    const points = [[700, 300], [1000, 190], [200, 300], [850, 650], [1000, 550]]
    const sample = () => points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3))
    renderer.render(ctx, run, level.lighting, view, 0, undefined, true, 'structural', true)
    const full = sample()
    const stats = renderer.render(ctx, run, level.lighting, view, 0)
    const night = sample()
    renderer.render(ctx, run, { ...level.lighting, nightMode: false }, view, 0)
    const day = sample()
    renderer.render(ctx, run, level.lighting, view, 0)
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    renderer.dispose()
    return { full, night, day, bytes: stats.bufferBytes, backend: stats.backend }
  }, backend)
  expect(result.backend).toBe(backend)
  for (const i of [0, 1, 4]) for (let c = 0; c < 3; c++) {
    expect(Math.abs(result.night[i][c] - result.full[i][c])).toBeLessThanOrEqual(2)
    expect(Math.abs(result.day[i][c] - result.full[i][c])).toBeLessThanOrEqual(2)
  }
  expect(result.full[0][2]).toBeGreaterThan(result.full[0][0])
  expect(result.full[0]).toEqual(result.full[4]) // Flat blue sky, without scenery at the horizon.
  expect(result.night[2][0]).toBeLessThan(result.day[2][0] * .75)
  for (let c = 0; c < 3; c++) expect(Math.abs(result.night[3][c] - result.day[3][c])).toBeLessThanOrEqual(2)
  expect(result.bytes).toBeLessThan(64 * 1024 * 1024)
  await page.locator('canvas').screenshot({ path: info.outputPath(`mixed-cave-daylight-${backend}.png`) })
})

for (const backend of ['canvas', 'gpu']) test(`${backend}: outer frame mirrors only lighting, without a glowing rectangle or stretched artwork`, async ({ page }, info) => {
  await page.goto('/lab')
  const results = await page.evaluate(async backend => {
    const { blankTrial, parseLevel } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = parseLevel({ ...blankTrial(), version: 2, width: 1600, height: 1600, floor: 1600,
      entrance: { x: 800, y: 1600 }, goal: { x: 1400, y: 1600 },
      platforms: [{ x: 0, y: 1400, w: 1600, h: 200 }],
      environment: { kind: 'landscape', horizon: 300, walls: [{ kind: 'cave', x: 0, y: 500, w: 1600, h: 1100 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } })
    const run = createPreviewRun(level), renderer = new LightingRenderer({ backend })
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true }), results = []
    for (const view of [{ x: -60, y: -60, zoom: .55, width: 1000, height: 1000 }, { x: -59.3, y: -63.4, zoom: .5, width: 1000, height: 900 }]) {
      canvas.width = view.width; canvas.height = view.height
      const x = Math.floor((600 - view.x) * view.zoom), top = -view.y * view.zoom, bottom = (1600 - view.y) * view.zoom
      const sample = y => Array.from(ctx.getImageData(x, Math.floor(y), 1, 1).data).slice(0, 3)
      const topOffsets = [-8, -6, -4, -2], bottomOffsets = [-3, -2, -1, 1, 2, 3, 4, 6, 8]
      renderer.render(ctx, run, level.lighting, view, 0, undefined, true, 'structural', true)
      const material = topOffsets.map(d => sample(top + d)), floorMaterial = bottomOffsets.map(d => sample(bottom + d))
      const stats = renderer.render(ctx, run, level.lighting, view, 0)
      results.push({ material, floorMaterial, top: topOffsets.map(d => sample(top + d)),
        bottom: bottomOffsets.map(d => sample(bottom + d)), bytes: stats.bufferBytes, backend: stats.backend })
      renderer.render(ctx, run, level.lighting, view, 0) // The retained field uses the same bounded result.
      results.at(-1).cached = sample(top - 8)
    }
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; renderer.dispose()
    return results
  }, backend)
  for (const result of results) {
    expect(result.backend).toBe(backend)
    for (const [i, pixel] of result.top.entries()) for (let c = 0; c < 3; c++)
      expect(Math.abs(pixel[c] - Math.round(result.material[i][c] * .95))).toBeLessThanOrEqual(3)
    expect(result.cached).toEqual(result.top[0])
    for (const [i, pixel] of result.bottom.entries()) for (let c = 0; c < 3; c++)
      expect(Math.abs(pixel[c] - Math.round(result.floorMaterial[i][c] * .35))).toBeLessThanOrEqual(3)
    expect(result.bytes).toBeLessThan(64 * 1024 * 1024)
  }
  await page.locator('canvas').screenshot({ path: info.outputPath(`mirrored-frame-lighting-${backend}.png`) })
})

for (const backend of ['canvas', 'gpu']) test(`${backend}: terrain touching the left frame has continuous lighting across the join`, async ({ page }) => {
  await page.goto('/lab')
  const profiles = await page.evaluate(async backend => {
    const { blankTrial, parseLevel } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = parseLevel({ ...blankTrial(), version: 2, width: 1600, height: 1600, floor: 1600,
      entrance: { x: 800, y: 1600 }, goal: { x: 1400, y: 1600 },
      platforms: [{ x: 0, y: 200, w: 350, h: 900 }, { x: 0, y: 1400, w: 1600, h: 200 }],
      environment: { kind: 'landscape', horizon: 300, walls: [{ kind: 'cave', x: 0, y: 500, w: 1600, h: 1100 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } })
    const run = createPreviewRun(level), renderer = new LightingRenderer({ backend })
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 900
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), profiles = []
    for (const view of [{ x: -50.4, y: 100, zoom: .72, width: 1000, height: 900 }, { x: -60.7, y: -60.3, zoom: .35, width: 1000, height: 900 }]) {
      const x = Math.floor(-view.x * view.zoom)
      const sample = () => [350, 600, 1000].map(y => Array.from({ length: 15 }, (_, i) =>
        ctx.getImageData(x - 6 + i, Math.floor((y - view.y) * view.zoom), 1, 1).data[0]))
      renderer.render(ctx, run, level.lighting, view, 0, undefined, true, 'structural', true)
      const full = sample()
      renderer.render(ctx, run, level.lighting, view, 0)
      profiles.push({ full, lit: sample() })
    }
    renderer.dispose(); return profiles
  }, backend)
  for (const { full, lit } of profiles) for (const [i, row] of lit.entries()) {
    const exposure = row.map((value, j) => value / full[i][j])
    expect(Math.max(...exposure) - Math.min(...exposure)).toBeLessThan(.025)
  }
})

test('Studio preserves background and regions through undo, save, reopen and grid preview', async ({ page }) => {
  await installBuiltInFixtures(page, { 'escape.json': finale })
  await page.goto('/lab/builder/built-in/escape.json')
  await waitForBuilderPreview(page)
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Background', exact: true })).toContainText('Blue sky')
  await page.getByText('Sky', { exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Cloud baseline', exact: true }).fill('600')
  await page.getByRole('spinbutton', { name: 'Cloud baseline', exact: true }).press('Enter')
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(page.getByRole('spinbutton', { name: 'Cloud baseline', exact: true })).toHaveValue(String(finale.environment.horizon))
  await selectBuilderOption(page, 'Background', 'interior')
  await expect(page.getByRole('combobox', { name: 'Lighting layout' })).toContainText('Day and night regions')
  await page.getByRole('button', { name: /Undo/ }).click()
  await expect(page.getByRole('combobox', { name: 'Background', exact: true })).toContainText('Blue sky')
  await page.getByRole('checkbox', { name: 'Editor grid', exact: true }).uncheck()
  await waitForBuilderPreview(page)
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  await page.reload()
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Back walls', exact: true }).getByRole('button')).toHaveCount(finale.environment.walls.length)
  const saved = await page.evaluate(async () => JSON.parse(await (await (await window.testLevelDirectory()).getFileHandle('escape.json')).getFile().then(f => f.text())))
  expect(saved.environment.walls).toEqual(finale.environment.walls)
})

test('back walls use normal object selection, nodes, duplicate, delete, undo and save', async ({ page }, info) => {
  test.setTimeout(120000)
  const source = JSON.parse(readFileSync(new URL(spelunkIFile, root), 'utf8'))
  const original = { ...source, environment: { ...source.environment, walls: [{ kind: 'cave', x: 0, y: 220, w: 3400, h: 1800,
    polygon: [[0, 0], [500, 0], [700, 180], [1200, 280], [1800, 180], [2300, 300], [2800, 540], [3400, 680], [3400, 1800], [0, 1800]] }] } }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await installBuiltInFixtures(page, { 'cave.json': original })
  await page.goto('/lab/builder/built-in/cave.json')
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const ready = () => expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 })
  await ready()
  async function selectWall() {
    await page.getByRole('tab', { name: 'Level', exact: true }).click()
    await page.getByRole('group', { name: 'Back walls', exact: true }).getByRole('button', { name: 'Back wall 1 night', exact: true }).click()
    await expect(page.getByRole('combobox', { name: 'Region lighting', exact: true })).toContainText('Night')
  }
  await selectWall()
  const box = await canvas.boundingBox(), wall = original.environment.walls[0]
  const zoom = Math.max(.08, Math.min(2.5, box.width / (wall.w + 120), box.height / (wall.h + 120)))
  const view = { x: wall.x + wall.w / 2 - box.width / zoom / 2, y: wall.y + wall.h / 2 - box.height / zoom / 2 }
  const screen = (x, y) => ({ x: box.x + (x - view.x) * zoom, y: box.y + (y - view.y) * zoom })
  const start = screen(700, 400), end = screen(800, 480)
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 4 }); await page.mouse.up()
  await expect(page.getByRole('spinbutton', { name: 'Node X', exact: true })).toHaveValue('800')
  await expect(page.getByRole('spinbutton', { name: 'Node Y', exact: true })).toHaveValue('1540')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.getByRole('spinbutton', { name: 'Node Y', exact: true })).toHaveValue('1539')
  await page.keyboard.press('Control+z')
  await selectWall()
  await page.mouse.click(end.x, end.y)
  await expect(page.getByRole('spinbutton', { name: 'Node Y', exact: true })).toHaveValue('1540')
  await page.getByRole('button', { name: 'Add node', exact: true }).click()
  const edge = screen(250, 220)
  await page.mouse.click(edge.x, edge.y)
  await expect(page.getByText('Node 2 of 11', { exact: true })).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(page.getByText('Node 2 of 10', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Back wall 2', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete object', exact: true }).click()
  await page.getByRole('button', { name: /Undo/ }).click()
  await page.getByRole('button', { name: /Redo/ }).click()
  await selectWall()
  await page.screenshot({ path: info.outputPath('back-wall-object-editor.png') })
  await ready()
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  await page.reload(); await ready()
  await selectWall()
  const saved = await page.evaluate(async () => JSON.parse(await (await (await window.testLevelDirectory()).getFileHandle('cave.json')).getFile().then(f => f.text())))
  expect(saved.environment.walls).toHaveLength(1)
  expect(saved.environment.walls[0].polygon[2]).toEqual([800, 260])
  expect(saved.platforms).toEqual(original.platforms)
  expect(saved.climbables).toEqual(original.climbables)
})

test('the outdoor endpoint waits for Up, retains the view, saves completion and resumes the coda', async ({ page }, info) => {
  test.setTimeout(120000)
  // One short endpoint fixture exercises the actual keyboard and persistence UI;
  // the full authored routes have separate normal-input replays.
  const level = { ...finale, id: 'outdoor-ending-browser', entrance: { x: 5680, y: 760 }, platforms: finale.platforms,
    lighting: { ...finale.lighting, lights: [] }, triggers: [], mechanisms: [] }
  await installBuiltInFixtures(page, { 'ending.json': level })
  await page.goto('/lab/levels/built-in/ending.json')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect(page.locator('.jumping-state')).not.toHaveText('Entering the level', { timeout: 30000 })
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused', exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.exterior.v1')).id)).toBe(level.id)
  await page.reload()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await page.keyboard.down('ArrowUp')
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible({ timeout: 30000 })
  await page.keyboard.up('ArrowUp')
  await expect(page.locator('.jumping-ending')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('arcade.jumping.completed.v1'))[id], level.id)).toBe(true)
  await page.screenshot({ path: info.outputPath('outdoor-ending.png') })
})

test('Spelunk III: keyboard play climbs the whole cave, reveals the exterior continuously and reaches the overlook', async ({ page }, info) => {
  test.setTimeout(300000)
  await page.setViewportSize({ width: 960, height: 640 })
  await page.goto('/lab/builder/built-in/spelunk3.jump-level.json/playtest?motionDebug=1')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect.poll(() => page.evaluate(() => window.jumpingMotion?.read().recent.length ?? 0), { timeout: 30000 }).toBeGreaterThan(0)
  // Read-only motion diagnostics observe the real rendered run. All movement
  // comes from keyboard controls, at normal speed, without a mocked clock.
  let held = new Set()
  async function keys(...values) {
    const next = new Set(values)
    for (const key of held) if (!next.has(key)) await page.keyboard.up(key)
    for (const key of next) if (!held.has(key)) await page.keyboard.down(key)
    held = next
  }
  async function until(condition) {
    await expect.poll(async () => condition(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))), { timeout: 60000, intervals: [80] }).toBe(true)
  }
  async function moveTo(x) {
    const position = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1).x)
    if (position < x - 110) { await keys('ArrowRight'); await until(p => p.x >= x - 110) }
    await keys('ArrowRight', 'Shift'); await until(p => p.x >= x - 7); await keys()
  }
  async function climbLadder(x, top) {
    await expect.poll(async () => {
      const p = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
      if (p.signals.grounded && p.y <= top + 1) { await keys(); return true }
      if (p.signals.mode === 'ladder' || Math.abs(p.x - x) < 7) await keys('ArrowUp')
      else await keys('Shift', p.x > x ? 'ArrowLeft' : 'ArrowRight', 'ArrowUp')
      return false
    }, { timeout: 60000, intervals: [80] }).toBe(true)
  }
  await keys('ArrowRight'); await until(p => p.x >= 345)
  await keys('ArrowRight', 'Space'); await until(p => p.signals.mode === 'hang' || p.x >= 490 && p.signals.grounded)
  let state = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  if (state.signals.mode === 'hang') { await keys('ArrowUp'); await until(p => p.signals.grounded) }
  state = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  if (state.y > 2101) {
    await keys('ArrowRight'); await until(p => p.x > 600 && p.y > 2450 && p.signals.grounded)
    await climbLadder(620, 2100)
  }
  await moveTo(1050); await climbLadder(1050, 1770)
  await moveTo(1580); await climbLadder(1580, 1160)
  await moveTo(1700); await climbLadder(1700, 1000)
  await page.screenshot({ path: info.outputPath('spelunk-iii-cave-mouth.png') })
  await moveTo(2200); await page.screenshot({ path: info.outputPath('spelunk-iii-emergence.png') })
  await moveTo(5685); await keys('ArrowUp')
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible({ timeout: 30000 })
  await keys()
  await page.screenshot({ path: info.outputPath('spelunk-iii-finish-landscape.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('spelunk-iii-finish-portrait.png') })
})
