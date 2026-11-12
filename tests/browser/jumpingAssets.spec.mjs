import { test, expect } from './helpers/test.mjs'
import { readFile } from 'node:fs/promises'
import { FIRST_LEVEL as first } from '../helpers/jumping-fixtures.mjs'
import { openLevelLink, unlockJumpingLevels } from './helpers/jumpingLevels.mjs'
const custom = (id, name) => ({ ...structuredClone(first), id, name })

/** Opens a level by its link and reads the name it plays under. */
async function play(page, file) {
  await openLevelLink(page, { file })
  const canvas = page.locator('.jumping-game > canvas[role="img"]')
  // The game shows a blank "Untitled level" until the linked course is ready.
  await expect.poll(async () => { const label = await canvas.getAttribute('aria-label') ?? ''; return label.endsWith(': reach the exit') && !label.startsWith('Untitled level') },
    { timeout: 30000 }).toBe(true)
  return (await canvas.getAttribute('aria-label')).replace(/: reach the exit$/, '')
}

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
  // A collection without the campaign leaves every level open from its link.
  expect(await play(page, '00-first.json')).toBe('First asset')
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))
  revision = true
  expect(await play(page, '00-first.json')).toBe('Changed on disk')
  expect(await play(page, '02-added.json')).toBe('New asset')
  expect(await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))).toEqual(scripts)
  await page.screenshot({ path: info.outputPath('runtime-level-assets.png') })
  await expect(page.locator('.jumping-level-edit')).toHaveCount(0)

})

test('a missing index reports the failure and page reload recovers without a compiled fallback map', async ({ page }, info) => {
  const root = new URL('../../public/levels/jumping/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
  const files = manifest.order === 'listed' ? manifest.levels : [...manifest.levels].sort()
  // Facility hubs share the collection but never appear as level tiles.
  const entries = (await Promise.all(files.map(async name => [name, JSON.parse(await readFile(new URL(name, root), 'utf8'))]))).filter(([, level]) => level.kind !== 'hub')
  const builtIns = entries.map(([, level]) => level)
  await unlockJumpingLevels(page, builtIns)
  let failing = true
  await page.route('**/levels/jumping/index.json', route => failing ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await page.goto('/lab')
  // Without its index the facility cannot open, and says why.
  const unavailable = page.getByRole('dialog', { name: 'Facility unavailable', exact: true })
  await expect(unavailable).toBeVisible()
  await expect(unavailable.getByRole('alert').filter({ hasText: 'index.json (HTTP 503)' })).toBeVisible()
  await expect(page.locator('.jumping-level-card')).toHaveCount(0)
  failing = false
  await page.reload()
  // Recovered, /lab opens its start screen with nothing to report. With passed courses but no autosaved
  // place, the robot wakes in Orientation (docs/jumping-facility.md, Starting the game).
  await expect(page.getByRole('dialog', { name: 'Game start', exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('img', { name: 'Orientation', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Game start', exact: true }).getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('built-in-levels.png') })
  for (const [file, level] of entries.slice(0, 2)) expect(await play(page, file)).toBe(level.name)
})
