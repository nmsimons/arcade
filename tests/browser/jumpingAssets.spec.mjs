import { test, expect } from './helpers/test.mjs'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const first = JSON.parse(await readFile(new URL('../../public/levels/jumping/campaign/00-first-leap.json', import.meta.url), 'utf8'))
const custom = (id, name) => ({ ...structuredClone(first), id, name })

async function open(page) {
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('button', { name: 'Level builder', exact: true })).toBeVisible()
}
const names = page => page.locator('.jumping-level-card strong').allTextContents()

test('built-in JSON changes and newly indexed files load without changing the app bundle', async ({ page }, info) => {
  let revision = false
  await page.route('**/levels/jumping/index.json', route => route.fulfill({ json: { version: 1, playground: 'playground.json', examples: [], campaign: revision ? ['10-last.json', '02-added.json', '00-first.json'] : ['10-last.json', '00-first.json'] } }))
  await page.route('**/levels/jumping/campaign/*.json', route => {
    const name = route.request().url().split('/').at(-1)
    const level = custom(name, name === '00-first.json' ? revision ? 'Changed on disk' : 'First asset' : name === '02-added.json' ? 'New asset' : 'Last asset')
    if (revision && name === '00-first.json') { level.width = 2200; level.times.gold = 4 }
    return route.fulfill({ json: level })
  })
  await open(page)
  expect(await names(page)).toEqual(['First asset', 'Last asset'])
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))
  revision = true
  await page.getByRole('button', { name: 'Refresh levels', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Level 1: Changed on disk' })).toBeVisible()
  expect(await names(page)).toEqual(['Changed on disk', 'New asset', 'Last asset'])
  expect(await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))).toEqual(scripts)
  await page.screenshot({ path: info.outputPath('runtime-level-assets.png') })
  await page.getByRole('button', { name: 'Edit selected level' }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Changed on disk')
  await expect(page.getByRole('spinbutton', { name: 'Level width' })).toHaveValue('2200')
  await expect(page.getByRole('spinbutton', { name: 'gold time' })).toHaveValue('4')
})

test('a missing index reports the failure and refresh recovers without a compiled fallback map', async ({ page }) => {
  let failing = true
  await page.route('**/levels/jumping/index.json', route => failing ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await open(page)
  await expect(page.getByRole('alert')).toContainText('index.json (HTTP 503)')
  expect(await names(page)).toEqual([])
  await expect(page.getByRole('button', { name: /^Start level/ })).toBeDisabled()
  failing = false
  await page.getByRole('button', { name: 'Refresh levels', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Level 1: First Leap' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('local folder fallback loads real JSON files in filename order and reloads external edits', async ({ page }, info) => {
  const dir = await mkdtemp(join(tmpdir(), 'jumping-level-folder-'))
  try {
    await writeFile(join(dir, '02-second.json'), JSON.stringify(custom('second', 'Second local level')))
    await writeFile(join(dir, '00-first.json'), JSON.stringify(custom('first', 'First local level')))
    await writeFile(join(dir, '03-broken.json'), '{bad')
    await writeFile(join(dir, 'notes.txt'), 'Not a level')
    await mkdir(join(dir, 'nested')); await writeFile(join(dir, 'nested/00-nested.json'), JSON.stringify(custom('nested', 'Nested level')))
    await page.addInitScript(() => { window.showDirectoryPicker = undefined })
    await open(page); await page.getByRole('button', { name: 'Local folder', exact: true }).click()
    await page.getByLabel('Open local level folder').setInputFiles(dir)
    await expect(page.getByRole('button', { name: 'Level 1: First local level' })).toBeVisible()
    expect(await names(page)).toEqual(['First local level', 'Second local level'])
    await expect(page.getByRole('alert')).toContainText('03-broken.json')
    await writeFile(join(dir, '00-first.json'), JSON.stringify(custom('first', 'Edited outside the game')))
    await page.getByLabel('Open local level folder').setInputFiles(dir)
    await expect(page.getByRole('button', { name: 'Level 1: Edited outside the game' })).toBeVisible()
    await page.screenshot({ path: info.outputPath('local-folder-levels.png') })
    await page.getByRole('button', { name: /^Start level/ }).click()
    await expect(page.getByRole('img', { name: 'Edited outside the game: reach the flag' })).toBeFocused()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('native folder saves update the loaded file, protect external edits, and create independently identified copies', async ({ page }, info) => {
  await page.addInitScript(level => {
    window.folderContents = { '01-second.json': JSON.stringify({ ...level, id: 'second', name: 'Second' }), '00-first.json': JSON.stringify(level) }
    window.folderWrites = []
    window.showDirectoryPicker = async () => ({ name: 'My jumping levels',
      async *values() { for (const name of Object.keys(window.folderContents)) yield { kind: 'file', name, getFile: async () => new File([window.folderContents[name]], name) } },
      async getFileHandle(name, options) {
        if (!(name in window.folderContents) && !options?.create) throw new DOMException('Missing', 'NotFoundError')
        return { kind: 'file', name, getFile: async () => new File([window.folderContents[name] ?? ''], name), createWritable: async () => {
          let staged
          return { write: async text => { staged = text }, close: async () => { window.folderContents[name] = staged; window.folderWrites.push(name) }, abort: async () => {} }
        } }
      },
    })
  }, custom('local-first', 'Local original'))
  await open(page); await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await page.getByRole('button', { name: 'Open folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Level 1: Local original' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit selected level' }).click()
  await page.getByRole('textbox', { name: 'Level name' }).fill('Edited in builder')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “00-first.json” to My jumping levels')
  let saved = await page.evaluate(() => JSON.parse(window.folderContents['00-first.json']))
  expect(saved.name).toBe('Edited in builder'); expect(saved.id).toBe('local-first')
  expect(await page.evaluate(() => localStorage.getItem('arcade.jumping.levels.v1'))).toBeNull()
  await page.evaluate(() => { const level = JSON.parse(window.folderContents['00-first.json']); level.name = 'External edit'; window.folderContents['00-first.json'] = JSON.stringify(level) })
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Refresh folder', exact: true }).click()
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('changed on disk')
  expect(await page.evaluate(() => window.folderWrites)).toEqual(['00-first.json'])
  await page.getByRole('combobox', { name: 'Local level files' }).selectOption('00-first.json')
  await page.getByRole('button', { name: 'Edit file', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('External edit')
  await page.getByRole('textbox', { name: 'Level file name' }).fill('02-copy.json')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved “02-copy.json”')
  saved = await page.evaluate(() => JSON.parse(window.folderContents['02-copy.json']))
  expect(saved.id).not.toBe('local-first')
  await page.getByRole('button', { name: 'Back to game', exact: true }).click()
  expect(await names(page)).toEqual(['External edit', 'Second', 'External edit'])
  await page.getByRole('button', { name: 'Refresh folder', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('saved-local-levels.png') })
})

test('local Next level follows filenames and skips files that need repairs', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'jumping-level-order-'))
  try {
    const start = custom('local-start', 'Start here'); start.flag = { x: 330, y: start.spawn.y }
    const broken = custom('local-repair', 'Needs repair'); broken.spawn.y += 100
    await writeFile(join(dir, '10-last.json'), JSON.stringify(custom('local-last', 'Alphabetically first title')))
    await writeFile(join(dir, '02-repair.json'), JSON.stringify(broken))
    await writeFile(join(dir, '00-start.json'), JSON.stringify(start))
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    await page.addInitScript(() => { window.showDirectoryPicker = undefined })
    await open(page); await page.getByRole('button', { name: 'Local folder', exact: true }).click()
    await page.getByLabel('Open local level folder').setInputFiles(dir)
    await expect(page.getByRole('button', { name: 'Level 1: Start here' })).toBeVisible()
    expect(await names(page)).toEqual(['Start here', 'Needs repair', 'Alphabetically first title'])
    await page.getByRole('button', { name: 'Level 2: Needs repair' }).click()
    await expect(page.getByRole('button', { name: /^Start level/ })).toBeDisabled()
    await page.getByRole('button', { name: 'Level 1: Start here' }).click()
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await page.getByRole('button', { name: /^Start level/ }).click()
    await page.keyboard.down('d'); await page.clock.runFor(1000); await page.keyboard.up('d')
    await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
    await page.getByRole('button', { name: 'Next level' }).click()
    await expect(page.getByRole('img', { name: 'Alphabetically first title: reach the flag' })).toBeFocused()
    const records = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1')))
    expect(records['local:local-start']).toBeGreaterThan(0)
    expect(records['local-start']).toBeUndefined()
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('the comprehensive JSON reference level is available as a builder template and survives playtest/export', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await open(page); await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: /JSON Test Lab/ }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('JSON Test Lab — copy')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(exported.platforms).toHaveLength(5); expect(exported.climbables.ropes).toHaveLength(3)
  expect(exported.mechanisms.map(m => m.kind)).toEqual(['lift', 'gate'])
  expect(exported.props.map(p => p.kind)).toEqual(['box', 'ball'])
  await page.screenshot({ path: info.outputPath('json-test-lab.png') })
  await page.getByRole('button', { name: 'Playtest' }).click()
  await expect(page.getByRole('img', { name: 'JSON Test Lab — copy: reach the flag' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  expect(errors).toEqual([])
})
