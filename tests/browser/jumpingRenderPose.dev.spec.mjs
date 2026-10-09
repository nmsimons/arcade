import { test, expect } from './helpers/test.mjs'

for (const backend of ['canvas', 'gpu']) test(`${backend}: one render reuses the rig with identical pixels across traversal and gravity poses`, async ({ page }, info) => {
  test.setTimeout(90000)
  await page.goto('/untitled-jumping-game/lighting-lab')
  await expect(page.locator('.lighting-lab-study')).toBeVisible()
  const result = await page.evaluate(async backend => {
    const [{ LightingRenderer }, { createRun, stepRun }, { blankTrial }, { NEUTRAL_INPUT }] = await Promise.all([
      import('/src/games/jumping/lightingRender.ts'), import('/src/games/jumping/challenge.ts'),
      import('/src/games/jumping/level.ts'), import('/src/games/jumping/model.ts'),
    ])
    const base = () => ({ ...blankTrial(), width: 1200, height: 600, floor: 500,
      spawn: { x: 650, y: 500 }, goal: { x: 100, y: 500 } })
    const gap = { ...base(), platforms: [{ x: 400, y: 200, w: 200, h: 300 }],
      props: [{ kind: 'box', x: 615, y: 500, size: 30 }, { kind: 'ball', x: 668, y: 500, size: 30 }],
      robots: [{ x: 710, y: 500, left: 300, right: 1000 }] }
    const rope = { ...base(), floor: 600, spawn: { x: 380, y: 600 },
      climbables: { ladders: [], ropes: [{ x: 400, y: 600, length: 600, segments: 75 }] },
      gravityPlates: [{ id: 'gravity', x: 0, y: 0, w: 1200, h: 600, gravity: -1, power: 'always' }] }
    const water = { ...base(), gravityPlates: [{ id: 'pool', x: 200, y: 200, w: 700, h: 300, gravity: -1, effect: 'water', power: 'always' }] }
    const fixtures = [
      { name: 'pressured gap', level: gap, input: i => ({ jump: i < 2, move: i > 180 ? -1 : 0 }) },
      ...[-1, 1].flatMap(direction => [30, 80].map(size => ({ name: `low and crouched brace ${direction}/${size}`,
        level: { ...base(), spawn: { x: 650 - direction * (size / 2 + 25.5), y: 500 },
          props: [{ kind: 'box', x: 650, y: 500, size }],
          platforms: [{ x: direction === 1 ? 650 + size / 2 : 530 - size / 2, y: 300, w: 120, h: 200 }] },
        input: i => ({ move: direction, crouch: i > 180 }) }))),
      { name: 'inverted rope', level: rope, input: i => ({ move: i < 3 ? 1 : 0, descend: i > 300 }) },
      { name: 'water', level: water, input: i => ({ move: i < 90 ? 1 : 0, descend: i > 180 && i < 240, climb: i >= 240 }) },
      { name: 'flight and landing', level: { ...base(), spawn: { x: 650, y: 200 } }, input: i => ({ move: .6, jump: i >= 300 && i < 324 }) },
    ]
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = 512; canvas.height = 384
    let worst = 0, frames = 0, readOnly = true
    const backends = new Set(), modes = new Set()
    for (const fixture of fixtures) {
      const run = createRun(fixture.level)
      const renderers = [new LightingRenderer({ backend }), new LightingRenderer({ backend, reuseAthletePose: false })]
      for (let i = 0; i < 360; i++) {
        stepRun(run, { ...NEUTRAL_INPUT, ...fixture.input(i) })
        if (i % 36 !== 35) continue
        const j = Math.floor(i / 36), nightMode = j >= 3 && j < 7
        const definition = { nightMode, ambient: 0, lights: nightMode && j >= 5 ? [
          { id: 'lamp', x: run.player.x + 100, y: run.player.y - 120, direction: 150, spread: 100, intensity: 100, power: 'always' },
        ] : [] }
        const view = { x: run.player.x - 180, y: run.player.y - 210, zoom: .8, width: 512, height: 384 }
        const before = JSON.stringify(run.player)
        const pixels = renderers.map(renderer => {
          const stats = renderer.render(ctx, run, definition, view, .1, undefined, false, 'full', j === 9)
          backends.add(stats.backend)
          readOnly &&= JSON.stringify(run.player) === before
          return ctx.getImageData(0, 0, 512, 384).data
        })
        for (let k = 0; k < pixels[0].length; k++) worst = Math.max(worst, Math.abs(pixels[0][k] - pixels[1][k]))
        const p = run.player
        if (p.pushing?.palms) modes.add('push')
        if (p.crouching) modes.add('crouch')
        if (p.inverted) modes.add('inverted')
        if (p.waterMotion) modes.add('water')
        if (!p.grounded) modes.add('air')
        frames++
      }
      renderers.forEach(renderer => renderer.dispose())
    }
    return { worst, frames, readOnly, backends: [...backends], modes: [...modes] }
  }, backend)
  await info.attach('rig-reuse-comparison', { body: JSON.stringify(result), contentType: 'application/json' })
  expect(result.frames).toBe(80)
  expect(result.worst).toBe(0)
  expect(result.readOnly).toBe(true)
  expect(result.backends).toContain(backend)
  expect(result.modes).toEqual(expect.arrayContaining(['push', 'crouch', 'inverted', 'water', 'air']))
})
