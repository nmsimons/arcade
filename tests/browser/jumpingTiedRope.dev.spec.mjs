import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { installBuiltInFixtures, useLevelFixtures, waitForBuilderPreview, selectBuilderObject, selectBuilderOption } from './helpers/jumpingLevels.mjs'

test('render enlarged hand-over-hand frames along tied and hanging ropes for visual review', async ({ page }, info) => {
  await page.goto('/lab?renderControl=1')
  const frames = await page.evaluate(async () => {
    const { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } = await import('/src/games/jumping/model.ts')
    const { ropePath } = await import('/src/games/jumping/climbables.ts')
    const { prepareRope } = await import('/src/games/jumping/ropeLayout.ts')
    const { drawAthlete, athletePose } = await import('/src/games/jumping/athlete.ts')
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 980
    document.body.replaceChildren(canvas); document.body.style.margin = '0'
    const ctx = canvas.getContext('2d'), captured = []
    const rope = prepareRope({ x: 300, y: 300, length: 680, segments: 85, end: { x: 900, y: 300 } }, [])
    const low = rope.rest.points.reduce((a, b) => b[1] > a[1] ? b : a)
    let p = createPlayer({ x: low[0] - 10, y: low[1] + 60 }), world = { ladders: [], ropes: [rope] }
    p.grounded = false
    const tick = input => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, [], world)
    for (let i = 0; i < 20; i++) tick({ climb: true })
    for (let i = 0; i < 60; i++) tick({})
    const capture = (label, motion) => captured.push({ label, motion, p: structuredClone(p), pose: athletePose(p) })
    capture('Hanging, still')
    for (let i = 0; i < 30; i++) tick({ move: 1 })
    for (let k = 0; k < 6; k++) { for (let i = 0; i < 6; i++) tick({ move: 1 }); capture(`Shimmy right · ${k * 50} ms`, 'shimmy') }
    for (let i = 0; i < 40; i++) tick({ move: -1 })
    capture('Shimmy left')
    for (let i = 0; i < 400 && p.climbing.shimmy; i++) tick({ move: -1 })
    for (let i = 0; i < 30; i++) tick({ climb: true })
    capture('Up a steep end, arms only')
    // A rope hanging from one anchor is climbed the same way.
    p = createPlayer({ x: 290, y: 760 }); world = { ladders: [], ropes: [prepareRope({ x: 300, y: 300, length: 600, segments: 75 }, [])] }
    p.grounded = false
    for (let i = 0; i < 20; i++) tick({ climb: true })
    for (let i = 0; i < 60; i++) tick({})
    for (let i = 0; i < 30; i++) tick({ climb: true })
    capture('Up a hanging rope')
    for (let i = 0; i < 9; i++) tick({ climb: true })
    capture('Up a hanging rope · 75 ms')
    ctx.fillStyle = '#f1f2ef'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    for (const [i, { label, p: actor }] of captured.entries()) {
      const x = i % 4 * 350, y = Math.floor(i / 4) * 490
      ctx.fillStyle = '#30423a'; ctx.font = '17px sans-serif'; ctx.fillText(label, x + 20, y + 30)
      ctx.save(); ctx.beginPath(); ctx.rect(x, y + 45, 350, 440); ctx.clip()
      ctx.translate(x + 175, y + 200); ctx.scale(2.6, 2.6); ctx.translate(-actor.x, -(actor.y - 70))
      ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath()
      const state = actor.climbing.rope; ctx.moveTo(state.definition.x, state.definition.y)
      for (const point of ropePath(state.definition, state)) ctx.lineTo(...point)
      ctx.stroke(); drawAthlete(ctx, actor); ctx.restore()
    }
    return captured.map(({ label, motion, p, pose }) => ({ label, motion, sideView: pose.sideView, facing: p.facing, shimmy: p.climbing.shimmy, x: p.x, hang: p.climbing.hangBlend }))
  })
  await page.locator('canvas').screenshot({ path: info.outputPath('tied-rope-shimmy.png') })
  expect(frames[0].shimmy).toBe(true)
  const shimmy = frames.filter(frame => frame.motion === 'shimmy')
  for (const frame of shimmy) {
    expect(frame.sideView, frame.label).toBeGreaterThan(.99)
    expect(frame.facing, frame.label).toBe(1)
  }
  expect(frames.find(frame => frame.label === 'Shimmy left').facing).toBe(-1)
  // Every rope is climbed by the arms alone, the body hanging below the hands and seen side-on.
  for (const frame of frames.filter(frame => frame.label.startsWith('Up'))) {
    expect(frame.hang, frame.label).toBeGreaterThan(.99)
    expect(frame.sideView, frame.label).toBeGreaterThan(.99)
  }
  // Each 50 ms the robot moves on by a similar amount: the body glides while the hands take turns.
  const steps = shimmy.slice(1).map((frame, i) => frame.x - shimmy[i].x)
  for (const step of steps) expect(step).toBeGreaterThan(2)
  expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(1.5)
})

test('the studio ties a rope between two terrain edges and drags each anchor on its own', async ({ page }, info) => {
  test.setTimeout(90000)
  const level = { ...blankTrial(), name: 'Tied workshop', platforms: [{ x: 300, y: 500, w: 200, h: 420 }, { x: 1100, y: 500, w: 200, h: 420 }],
    climbables: { ladders: [], ropes: [{ x: 500, y: 500, length: 680, segments: 85, anchor: { platform: 0, x: 200, y: 0 }, end: { x: 1100, y: 500, anchor: { platform: 1, x: 0, y: 0 } } }] } }
  await useLevelFixtures(page, [level]); await installBuiltInFixtures(page, { 'tied.json': level })
  await page.goto('/lab')
  await page.getByRole('button', { name: 'Level studio', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open tied.json', exact: true }).click()
  await waitForBuilderPreview(page)
  await expect(page.getByRole('button', { name: 'Tied rope', exact: true })).toBeVisible()
  await selectBuilderObject(page, 'rope:0')
  await expect(page.locator('.builder-object-heading')).toHaveText('Tied rope 1')
  await expect(page.locator('.builder-anchor')).toHaveText([/Anchor 1: .*Terrain 1/, /Anchor 2: .*Terrain 2/])
  await selectBuilderOption(page, 'Rope release', 'end')
  await expect(page.getByRole('combobox', { name: 'Rope release', exact: true })).toHaveText('Switches release anchor 2')
  await expect(page.getByText('Switched by', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('tied-rope-inspector.png') })
  await page.getByRole('button', { name: 'Detach anchor 2', exact: true }).click()
  await expect(page.locator('.builder-anchor span').nth(1)).toHaveText('Anchor 2: free')
  await page.getByRole('button', { name: 'Untie anchor 2', exact: true }).click()
  await expect(page.locator('.builder-object-heading')).toHaveText('Rope 1')
  await expect(page.getByRole('combobox', { name: 'Rope release', exact: true })).toHaveCount(0)
})
