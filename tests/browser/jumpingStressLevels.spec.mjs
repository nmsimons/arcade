import { test, expect } from '@playwright/test'

test('production excludes stress maps and retired native experiments', async ({ page, request }) => {
  const requested = [], errors = []
  page.on('request', req => requested.push(req.url()))
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/lab?labRopes=wasm&labSolver=active')
  await expect(page.locator('.jumping-level-browser .jumping-level-card').first()).toBeVisible()
  await expect(page.locator('.jumping-stress-levels')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Load Test/ })).toHaveCount(0)
  const manifest = await (await request.get('/levels/jumping/index.json')).json()
  expect(manifest.levels).not.toContain('Load Test.jump-level.json')
  expect(manifest.levels).not.toContain('Load Test Max.jump-level.json')
  for (const path of ['/__arcade/jumping-stress-levels/index.json', '/levels/jumping/Load%20Test.jump-level.json', '/dev/levels/jumping/Load%20Test.jump-level.json', '/wasm/lab-rope.wasm']) {
    const response = await request.get(path)
    expect(response.headers()['content-type']).not.toMatch(/application\/(json|wasm)/)
  }
  expect(requested.filter(url => /jumping-stress-levels|\.wasm/.test(url))).toEqual([])
  expect(await page.evaluate(() => window.labRopeWasm ?? window.labSolverExperiment ?? null)).toBeNull()
  expect(errors).toEqual([])
})
