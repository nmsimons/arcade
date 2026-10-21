import { test, expect } from './helpers/test.mjs'
import { readFile } from 'node:fs/promises'
import { FIRST_LEVEL as first } from '../helpers/jumping-fixtures.mjs'
const custom = (id, name) => ({ ...structuredClone(first), id, name })

async function open(page) {
  await page.goto('/lab')
  await expect(page.getByRole('dialog', { name: 'L.A.B. Experiments', exact: true })).toBeVisible()
}
const names = page => page.locator('.jumping-level-card strong').allTextContents()

test('production preview does not expose the built-in file API', async ({ request }) => {
  const read = await request.get('/__arcade/jumping-levels')
  const write = await request.post('/__arcade/jumping-levels', { data: { method: 'read', args: [] } })
  for (const response of [read, write]) expect(response.headers()['content-type'] ?? '').not.toContain('application/json')
})

test('built-in JSON changes and newly indexed files load without changing the app bundle', async ({ page }, info) => {
  let revision = false
  await page.route('**/levels/jumping/index.json', route => route.fulfill({ json: { version: 1, levels: revision ? ['10-last.json', '02-added.json', '00-first.json'] : ['10-last.json', '00-first.json'] } }))
  await page.route('**/levels/jumping/*-*.json', route => {
    const name = route.request().url().split('/').at(-1)
    const level = custom(name, name === '00-first.json' ? revision ? 'Changed on disk' : 'First asset' : name === '02-added.json' ? 'New asset' : 'Last asset')
    if (revision && name === '00-first.json') { level.width = 2200; level.times.a = 4 }
    return route.fulfill({ json: level })
  })
  await open(page)
  expect(await names(page)).toEqual(['First asset', 'Level 2'])
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))
  revision = true
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Changed on disk' })).toBeVisible()
  expect(await names(page)).toEqual(['Changed on disk', 'Level 2', 'Level 3'])
  expect(await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))).toEqual(scripts)
  await page.screenshot({ path: info.outputPath('runtime-level-assets.png') })
  await expect(page.locator('.jumping-level-edit')).toHaveCount(0)

})

test('a missing index reports the failure and page reload recovers without a compiled fallback map', async ({ page }, info) => {
  const root = new URL('../../public/levels/jumping/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
  const files = manifest.order === 'listed' ? manifest.levels : [...manifest.levels].sort()
  const builtIns = await Promise.all(files.map(async name => JSON.parse(await readFile(new URL(name, root), 'utf8'))))
  let failing = true
  await page.route('**/levels/jumping/index.json', route => failing ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await open(page)
  await expect(page.getByRole('alert')).toContainText('index.json (HTTP 503)')
  expect(await names(page)).toEqual([])
  await expect(page.locator('.jumping-level-card')).toHaveCount(0)
  failing = false
  await page.reload()
  await expect(page.getByRole('button', { name: `Level 1: ${builtIns[0].name}`, exact: true })).toBeVisible()
  expect(await names(page)).toEqual(builtIns.map(level => level.name))
  await expect(page.getByRole('button', { name: 'Enter playground' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('built-in-levels.png') })
  for (const [index, level] of builtIns.slice(0, 2).entries()) {
    await page.getByRole('button', { name: `Level ${index + 1}: ${level.name}`, exact: true }).click()
    await expect(page.getByRole('img', { name: `${level.name}: reach the exit` })).toBeFocused()
    await page.goto('/lab')
  }
})
