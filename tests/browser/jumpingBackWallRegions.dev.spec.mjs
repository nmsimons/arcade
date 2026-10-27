import { test, expect } from './helpers/test.mjs'
import { installBuiltInFixtures, selectBuilderOption, selectBuilderObject } from './helpers/jumpingLevels.mjs'

const interior = { version: 2, id: 'indoor-regions-ui', name: 'Indoor regions', width: 1600, height: 1000, floor: 1000,
  platforms: [], entrance: { x: 100, y: 1000 }, goal: { x: 1450, y: 1000 }, checkpoints: [],
  climbables: { ropes: [], ladders: [] }, timing: 'untimed', times: { a: 10, b: 20, c: 40, d: 100 },
  props: [], robots: [], triggers: [], mechanisms: [], timers: [], texts: [], pickups: [],
  lighting: { nightMode: false, ambient: 0, lights: [] } }

for (const backend of ['canvas', 'gpu']) test(`${backend}: indoor day and night regions share the course wall and preserve sky and uniform modes`, async ({ page }, info) => {
  await page.goto('/lab')
  const samples = await page.evaluate(async backend => {
    const { blankTrial, parseLevel } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = parseLevel({ ...blankTrial(), version: 2, width: 1200, height: 900, floor: 900,
      entrance: { x: 100, y: 900 }, goal: { x: 1060, y: 900 },
      platforms: [{ x: 0, y: 420, w: 920, h: 50 }],
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [
        { kind: 'facility', x: 0, y: 450, w: 1200, h: 450, lighting: 'night', name: 'Cave' },
        { kind: 'facility', x: 200, y: 600, w: 200, h: 130, lighting: 'day', name: 'Lit bay' },
      ] }, lighting: { nightMode: true, ambient: 0, lights: [] } })
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), renderer = new LightingRenderer({ backend }), view = { x: 0, y: 0, zoom: 1, width: 1200, height: 900 }
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3)
    function render(current) {
      const run = createPreviewRun(current), stats = renderer.render(ctx, run, current.lighting, view, 0)
      return { day: pixel(800, 200), night: pixel(750, 850), bay: pixel(300, 650), bytes: stats.bufferBytes, backend: stats.backend }
    }
    const mixed = render(level)
    const sky = render({ ...level, environment: { ...level.environment, kind: 'landscape', horizon: 300 } })
    const day = render({ ...level, environment: { ...level.environment, lighting: 'uniform' }, lighting: { ...level.lighting, nightMode: false } })
    const night = render({ ...level, environment: { ...level.environment, lighting: 'uniform' } })
    const legacy = { ...level }; delete legacy.environment
    const legacyNight = render(legacy)
    render(level)
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; renderer.dispose()
    return { mixed, sky, day, night, legacyNight }
  }, backend)
  expect(samples.mixed.backend).toBe(backend)
  expect(samples.mixed.day[0]).toBeGreaterThan(200)
  expect(Math.max(...samples.mixed.day) - Math.min(...samples.mixed.day)).toBeLessThan(12)
  expect(samples.mixed.night[0]).toBeLessThan(samples.mixed.day[0] * .65)
  expect(samples.mixed.bay[0]).toBeGreaterThan(200)
  expect(samples.sky.day[2]).toBeGreaterThan(samples.sky.day[0] + 20)
  expect(samples.day.night[0]).toBeGreaterThan(200)
  expect(samples.night).toEqual(samples.legacyNight)
  expect(samples.mixed.bytes).toBeLessThan(64 * 1024 * 1024)
  await page.locator('canvas').screenshot({ path: info.outputPath(`indoor-day-night-${backend}.png`) })
})

test('wide cave mouths fade continuously without point-source interference at overview and close zoom', async ({ page }, info) => {
  await page.goto('/lab')
  const profiles = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { EnvironmentLighting } = await import('/src/games/jumping/environmentLighting.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const level = { ...blankTrial(), version: 2, width: 1200, height: 900, floor: 900,
      entrance: { x: 350, y: 900 }, goal: { x: 850, y: 900 },
      platforms: [{ x: 0, y: 0, w: 250, h: 900 }, { x: 950, y: 0, w: 250, h: 900 }],
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [{ kind: 'facility', x: 0, y: 300, w: 1200, h: 600 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const run = createPreviewRun(level), lighting = new EnvironmentLighting(), profiles = []
    for (const zoom of [.4, 1, 2]) {
      const view = { x: zoom > 1 ? 350 : 0, y: zoom > 1 ? 200 : 0, zoom, width: 1000, height: 800 }
      const field = lighting.render(run, view).ambient.ctx
      const sample = (x, y) => field.getImageData(Math.round((x - view.x) * zoom), Math.round((y - view.y) * zoom), 1, 1).data[0]
      profiles.push({ zoom, boundary: [375, 450, 525, 600, 675, 750, 825].map(x => Math.abs(sample(x, 299) - sample(x, 301))),
        rows: [320, 400, 480].map(y => [375, 450, 525, 600, 675, 750, 825].map(x => sample(x, y))) })
    }
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 800
    const renderer = new LightingRenderer({ backend: 'canvas' })
    renderer.render(canvas.getContext('2d'), run, level.lighting, { x: 100, y: 100, zoom: 1, width: 1000, height: 800 }, 0)
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    lighting.release(); renderer.dispose(); return profiles
  })
  for (const profile of profiles) {
    // Two independent samples can span two gray values with the one-level
    // dither. Larger variation still indicates a seam or source lobes.
    for (const delta of profile.boundary) expect(delta).toBeLessThanOrEqual(2)
    for (const row of profile.rows) expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(2)
    expect(profile.rows[0][3]).toBeGreaterThan(profile.rows[1][3])
    expect(profile.rows[1][3]).toBeGreaterThan(profile.rows[2][3])
  }
  await page.locator('canvas').screenshot({ path: info.outputPath('continuous-cave-mouth.png') })
})

test('terrain exposure does not glow onto the dark back wall beneath an overhang', async ({ page }, info) => {
  await page.goto('/lab')
  const samples = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { EnvironmentLighting } = await import('/src/games/jumping/environmentLighting.ts')
    const level = { ...blankTrial(), version: 2, width: 1200, height: 900, floor: 900,
      platforms: [{ x: 100, y: 280, w: 1000, h: 40 }],
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [{ kind: 'facility', x: 0, y: 300, w: 1200, h: 600 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const run = createPreviewRun(level), light = new EnvironmentLighting(), samples = []
    for (const zoom of [.35, .65, 1, 1.7]) {
      const view = { x: zoom > 1 ? 300.15 : -10.15, y: 150.23, zoom, width: 1000, height: 600 }
      const field = light.render(run, view).ambient
      const edge = (320 - view.y) * zoom
      samples.push({ zoom, pixels: [350, 450, 550, 650, 750].flatMap(x => [1, 2, 4].map(offset =>
        field.ctx.getImageData(Math.round((x - view.x) * zoom), Math.ceil(edge) + offset, 1, 1).data[0])) })
    }
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 600
    canvas.getContext('2d').drawImage(light.render(run, { x: 0, y: 150, zoom: 1, width: 1000, height: 600 }).ambient.canvas, 0, 0)
    document.body.replaceChildren(canvas); document.body.style.margin = '0'; light.release()
    return samples
  })
  // Hardware bilinear interpolation can round the ambient floor by one value.
  for (const sample of samples) for (const value of sample.pixels) expect(Math.abs(value - 89), JSON.stringify(sample)).toBeLessThanOrEqual(1)
  await page.locator('canvas').screenshot({ path: info.outputPath('overhang-no-light-leak.png') })
})

test('cached lighting follows camera motion and invalidates for zoom, changed geometry and moving occluders', async ({ page }) => {
  await page.goto('/lab')
  const results = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { EnvironmentLighting } = await import('/src/games/jumping/environmentLighting.ts')
    const level = { ...blankTrial(), version: 2, width: 1600, height: 1000, floor: 1000,
      platforms: [{ x: 150, y: 360, w: 650, h: 65 }],
      mechanisms: [{ id: 'shutter', kind: 'gate', x: 850, y: 200, w: 20, h: 400, travel: 400 }],
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [{ kind: 'facility', x: 0, y: 400, w: 1600, h: 600 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    let run = createPreviewRun(level)
    const cached = new EnvironmentLighting(), results = []
    for (const [i, x] of [-10.15, -9.15, 15.5, 70.25, 260.25, 500.4, 501.4, 1200].entries()) {
      if (i === 3) run.mechanisms[0].y += 200
      if (i === 6) run = createPreviewRun({ ...level, platforms: [{ ...level.platforms[0], h: 100 }] })
      const view = { x, y: 160.3 + i * 3.2, zoom: i === 5 ? .65 : 1, width: 640, height: 480 }
      const actual = cached.render(run, view).ambient.ctx.getImageData(0, 0, 640, 480).data
      const fresh = new EnvironmentLighting(), expected = fresh.render(run, view).ambient.ctx.getImageData(0, 0, 640, 480).data
      let worst = 0, total = 0
      for (let j = 0; j < actual.length; j++) { const difference = Math.abs(actual[j] - expected[j]); worst = Math.max(worst, difference); total += difference }
      results.push({ i, worst, mean: total / actual.length }); fresh.release()
    }
    cached.release(); return results
  })
  for (const result of results) {
    // Cropping a retained GPU texture can differ by a few low bits from a fresh
    // raster; stale lighting or shifted silhouettes produce much larger errors.
    expect(result.worst, JSON.stringify(results)).toBeLessThanOrEqual(4)
    expect(result.mean, JSON.stringify(results)).toBeLessThan(.1)
  }
})

test('a shadowed cave pocket has no luminous rim where its ceiling and wall meet the rock', async ({ page }) => {
  await page.goto('/lab')
  const results = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { EnvironmentLighting } = await import('/src/games/jumping/environmentLighting.ts')
    const level = { ...blankTrial(), version: 2, width: 1200, height: 1000, floor: 1000,
      platforms: [{ x: 100, y: 100, w: 900, h: 800, polygon: [[0,0],[900,0],[900,800],[600,800],[600,400],[700,250],[650,160],[350,220],[250,500],[250,800],[0,800]] }],
      environment: { kind: 'interior', lighting: 'regions', baseLighting: 'day', walls: [{ kind: 'facility', x: 0, y: 200, w: 1200, h: 800 }] },
      lighting: { nightMode: true, ambient: 0, lights: [] } }
    const run = createPreviewRun(level), light = new EnvironmentLighting(), results = []
    for (const zoom of [.6, 1, 2.5]) {
      const view = { x: 300, y: 220, zoom, width: 900, height: 1000 }, ctx = light.render(run, view).ambient.ctx
      for (const [a, b] of [[[750,260],[450,320]], [[450,320],[350,600]]]) {
        const dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx,dy), nx = dy/length, ny = -dx/length
        let excess = 0
        for (let i=1;i<20;i++) {
          const x=a[0]+dx*i/20,y=a[1]+dy*i/20,values=[]
          for(const distance of [-4,-2,-1,0,1,2,4]) values.push(ctx.getImageData(
            Math.round((x-view.x)*zoom+nx*distance),Math.round((y-view.y)*zoom+ny*distance),1,1).data[0])
          excess = Math.max(excess, Math.max(...values.slice(1,-1)) - Math.max(values[0],values.at(-1)))
        }
        results.push({ zoom, edge: a, excess })
      }
    }
    light.release(); return results
  })
  for (const result of results) expect(result.excess, JSON.stringify(results)).toBeLessThanOrEqual(1)
})

test('a new indoor level creates named day/night back walls with the normal tool, saves and reopens', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await installBuiltInFixtures(page, { 'indoor.json': interior })
  await page.goto('/lab/builder/built-in/indoor.json')
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const ready = () => expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 })
  await ready()
  await expect(page.getByRole('combobox', { name: 'Background', exact: true })).toContainText('Indoor wall')
  await page.getByRole('button', { name: 'Fit level', exact: true }).click()
  const box = await canvas.boundingBox(), zoom = Math.min(box.width / 1720, box.height / 1120)
  const screen = (x, y) => ({ x: box.x + (x + 60) * zoom, y: box.y + (y + 60) * zoom })
  async function draw(a, b) {
    const p = screen(...a), q = screen(...b)
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.up()
  }
  await page.getByRole('button', { name: 'Back wall', exact: true }).click()
  await draw([300, 450], [900, 950])
  await expect(page.getByRole('combobox', { name: 'Region lighting', exact: true })).toContainText('Night')
  await page.getByRole('textbox', { name: 'Object name' }).fill('Maintenance cave')
  await page.getByRole('textbox', { name: 'Object name' }).press('Enter')
  await page.getByRole('button', { name: 'Back wall', exact: true }).click()
  await draw([450, 600], [650, 780])
  await selectBuilderOption(page, 'Region lighting', 'day')
  await page.getByRole('textbox', { name: 'Object name' }).fill('Service bay')
  await page.getByRole('textbox', { name: 'Object name' }).press('Enter')
  await page.getByRole('tab', { name: 'Level', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Back walls', exact: true }).getByRole('button')).toHaveCount(2)
  await selectBuilderOption(page, 'Background', 'landscape')
  await selectBuilderOption(page, 'Background', 'interior')
  await selectBuilderOption(page, 'Lighting layout', 'uniform')
  await page.getByRole('checkbox', { name: 'Night mode', exact: true }).check()
  await selectBuilderOption(page, 'Lighting layout', 'regions')
  await expect(page.getByRole('combobox', { name: 'Outside regions', exact: true })).toContainText('Night')
  await selectBuilderOption(page, 'Outside regions', 'day')
  await ready()
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  await page.screenshot({ path: info.outputPath('back-wall-regions-level-ui.png') })
  await page.reload(); await ready()
  await expect(page.getByRole('combobox', { name: 'Background', exact: true })).toContainText('Indoor wall')
  await expect(page.getByRole('group', { name: 'Back walls', exact: true }).getByRole('button')).toHaveCount(2)
  const saved = await page.evaluate(async () => JSON.parse(await (await (await window.testLevelDirectory()).getFileHandle('indoor.json')).getFile().then(f => f.text())))
  expect(saved.environment.kind).toBe('interior')
  expect(saved.environment.baseLighting).toBe('day')
  expect(saved.environment.walls.map(w => [w.name, w.lighting])).toEqual([['Maintenance cave', 'night'], ['Service bay', 'day']])
  expect(saved.platforms).toEqual([])
})

test('terrain ground cover follows its shape, has distinct styles and invalidates day and night artwork caches', async ({ page }, info) => {
  await page.goto('/lab')
  const result = await page.evaluate(async () => {
    const { blankTrial } = await import('/src/games/jumping/level.ts')
    const { createPreviewRun } = await import('/src/games/jumping/challenge.ts')
    const { LightingRenderer } = await import('/src/games/jumping/lightingRender.ts')
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500
    const ctx = canvas.getContext('2d', { willReadFrequently: true }), view = { x: 0, y: 0, zoom: 1, width: 800, height: 500 }
    const level = { ...blankTrial(), width: 900, height: 600, floor: 600, entrance: { x: 60, y: 600 }, goal: { x: 780, y: 600 },
      platforms: [{ x: 180, y: 280, w: 450, h: 200, material: 'chalk', profile: [[0, 60], [225, 0], [450, 60]] }] }
    const run = createPreviewRun(level), cases = [], gallery = document.createElement('canvas'); gallery.width = 800; gallery.height = 500
    const galleryCtx = gallery.getContext('2d')
    let worst = 0, backgrounds = 0
    for (const nightMode of [false, true]) {
      const renderer = new LightingRenderer({ backend: 'canvas' }), strips = []
      for (const groundCover of ['none', 'grass', 'scrub', 'moss', 'none']) {
        level.platforms[0].groundCover = groundCover
        const lighting = { nightMode, ambient: 0, lights: [] }
        for (let frame = 0; frame < 3; frame++) {
          const stats = renderer.render(ctx, run, lighting, view, 0)
          backgrounds += Number(stats.dayBackgroundCached)
        }
        const reused = ctx.getImageData(0, 0, 800, 500).data
        strips.push(Array.from(ctx.getImageData(170, 255, 470, 90).data))
        const fresh = new LightingRenderer({ backend: 'canvas' })
        fresh.render(ctx, run, lighting, view, 0)
        const expected = ctx.getImageData(0, 0, 800, 500).data
        for (let i = 0; i < reused.length; i++) worst = Math.max(worst, Math.abs(reused[i] - expected[i]))
        fresh.dispose()
        if (!nightMode && groundCover === 'scrub') galleryCtx.drawImage(canvas, 0, 0)
      }
      cases.push({ nightMode, different: strips.slice(1, 4).map(strip => strip.filter((value, i) => value !== strips[0][i]).length),
        distinct: new Set(strips.slice(0, 4).map(strip => strip.join(','))).size, cleared: strips[0].every((v, i) => v === strips[4][i]) })
      renderer.dispose()
    }
    document.body.replaceChildren(gallery); document.body.style.margin = '0'
    return { cases, worst, backgrounds }
  })
  expect(result.worst).toBe(0)
  expect(result.backgrounds).toBeGreaterThan(0)
  for (const sample of result.cases) {
    expect(sample.distinct).toBe(4)
    expect(sample.cleared).toBe(true)
    for (const changed of sample.different) expect(changed).toBeGreaterThan(100)
  }
  await page.locator('canvas').screenshot({ path: info.outputPath('terrain-ground-cover-slope.png') })
})

test('terrain Appearance owns ground cover types with undo, save and reopen indoors', async ({ page }, info) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await installBuiltInFixtures(page, { 'cover.json': { ...interior, id: 'terrain-cover-ui',
    platforms: [{ x: 300, y: 650, w: 600, h: 160, name: 'Garden ledge' }] } })
  await page.goto('/lab/builder/built-in/cover.json')
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const ready = () => expect(canvas).toHaveAttribute('aria-busy', 'false', { timeout: 30000 })
  await ready(); await selectBuilderObject(page, 'platform:0')
  const cover = page.getByRole('combobox', { name: 'Ground cover', exact: true })
  await expect(cover).toContainText('None')
  for (const type of ['grass', 'scrub', 'moss']) await selectBuilderOption(page, 'Ground cover', type)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0'); await expect(cover).toContainText('Scrub')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'platform:0'); await expect(cover).toContainText('Moss')
  await ready(); await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  await cover.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('terrain-cover-appearance-ui.png') })
  await page.reload(); await ready(); await selectBuilderObject(page, 'platform:0')
  await expect(cover).toContainText('Moss')
  const saved = await page.evaluate(async () => JSON.parse(await (await (await window.testLevelDirectory()).getFileHandle('cover.json')).getFile().then(f => f.text())))
  expect(saved.platforms[0].groundCover).toBe('moss')
  expect(saved.environment).toBeUndefined()
})
