import { test, expect } from './helpers/test.mjs'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FIRST_LEVEL as first, JSON_LAB } from '../helpers/jumping-fixtures.mjs'
const custom = (id, name) => ({ ...structuredClone(first), id, name })

async function open(page) {
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('button', { name: 'Level builder', exact: true })).toBeVisible()
}
const names = page => page.locator('.jumping-level-card strong').allTextContents()

test('built-ins contain only the test lab, and the builder ignores browser copies and drafts', async ({ page }, info) => {
  await page.addInitScript(level => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem
    set.call(localStorage, 'arcade.jumping.levels.v1', JSON.stringify([level]))
    set.call(localStorage, 'arcade.jumping.draft.v1', JSON.stringify(level))
    window.levelStorageCalls = []
    const record = (method, key) => { if (/^arcade\.jumping\.(levels|draft)\./.test(key)) window.levelStorageCalls.push([method, key]) }
    Storage.prototype.getItem = function (key) { record('get', key); return get.call(this, key) }
    Storage.prototype.setItem = function (key, value) { record('set', key); return set.call(this, key, value) }
  }, { ...JSON_LAB, name: 'Old browser draft' })
  await open(page)
  expect(await names(page)).toEqual(['JSON Test Lab'])
  await expect(page.getByRole('button', { name: 'Enter playground' })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('only-test-lab.png') })
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Untitled level')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await expect(page.getByText('Browser copies', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Saved levels' })).toHaveCount(0)
  await expect(page.locator('.builder-templates button')).toHaveCount(1)
  await page.screenshot({ path: info.outputPath('file-library.png') })
  await page.getByRole('textbox', { name: 'Level name' }).fill('File-only level')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save level', exact: true }).click()])
  const file = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(file.name).toBe('File-only level')
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Downloaded')
  expect(await page.evaluate(() => window.levelStorageCalls)).toEqual([])
  await page.reload()
  await expect(page).toHaveURL(/\/builder$/)
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Untitled level')
  await page.getByLabel('Import level file').setInputFiles(await download.path())
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('File-only level')
  expect(await page.evaluate(() => window.levelStorageCalls)).toEqual([])
})

test('built-in JSON changes and newly indexed files load without changing the app bundle', async ({ page }, info) => {
  let revision = false
  await page.route('**/levels/jumping/index.json', route => route.fulfill({ json: { version: 1, levels: revision ? ['10-last.json', '02-added.json', '00-first.json'] : ['10-last.json', '00-first.json'] } }))
  await page.route('**/levels/jumping/*-*.json', route => {
    const name = route.request().url().split('/').at(-1)
    const level = custom(name, name === '00-first.json' ? revision ? 'Changed on disk' : 'First asset' : name === '02-added.json' ? 'New asset' : 'Last asset')
    if (revision && name === '00-first.json') { level.width = 2200; level.times.gold = 4 }
    return route.fulfill({ json: level })
  })
  await open(page)
  expect(await names(page)).toEqual(['First asset', 'Last asset'])
  const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))
  revision = true
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: Changed on disk' })).toBeVisible()
  expect(await names(page)).toEqual(['Changed on disk', 'New asset', 'Last asset'])
  expect(await page.locator('script[src]').evaluateAll(nodes => nodes.map(n => n.src))).toEqual(scripts)
  await page.screenshot({ path: info.outputPath('runtime-level-assets.png') })
  await expect(page.locator('.jumping-level-edit')).toHaveCount(0)
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.locator('.builder-templates').getByRole('button', { name: /Changed on disk/ }).click()
  await expect(page.getByRole('textbox', { name: 'Level name' })).toHaveValue('Changed on disk — copy')
  await expect(page.getByRole('spinbutton', { name: 'Level width' })).toHaveValue('2200')
  await expect(page.getByRole('spinbutton', { name: 'gold time' })).toHaveValue('4')
})

test('a missing index reports the failure and page reload recovers without a compiled fallback map', async ({ page }) => {
  let failing = true
  await page.route('**/levels/jumping/index.json', route => failing ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
  await open(page)
  await expect(page.getByRole('alert')).toContainText('index.json (HTTP 503)')
  expect(await names(page)).toEqual([])
  await expect(page.locator('.jumping-level-card')).toHaveCount(0)
  failing = false
  await page.reload()
  await expect(page.getByRole('button', { name: 'Level 1: JSON Test Lab' })).toBeVisible()
  expect(await names(page)).toEqual(['JSON Test Lab'])
  await expect(page.getByRole('button', { name: 'Enter playground' })).toHaveCount(0)
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
    await expect(page.locator('.jumping-level-card')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Refresh folder' })).toHaveCount(0)
    await expect(page.getByRole('alert')).toContainText('03-broken.json')
    await writeFile(join(dir, '00-first.json'), JSON.stringify(custom('first', 'Edited outside the game')))
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Reselect folder' }).click()
    await (await chooser).setFiles(dir)
    await expect(page.getByRole('button', { name: 'Level 1: Edited outside the game' })).toBeVisible()
    await page.screenshot({ path: info.outputPath('local-folder-levels.png') })
    await page.locator('.jumping-level-card[aria-pressed=true]').click()
    await expect(page.getByRole('img', { name: 'Edited outside the game: activate the goal' })).toBeFocused()
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
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Level 1: Local original' })).toBeVisible()
  await page.locator('.jumping-level-tile').filter({ has: page.locator('.jumping-level-card[aria-pressed=true]') }).getByRole('button', { name: /^Edit / }).click()
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
  await page.screenshot({ path: info.outputPath('builder-folder-files.png') })
  await page.getByRole('button', { name: 'Open 00-first.json', exact: true }).click()
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

test('folder picker handles cancel, busy, errors and empty folders without losing the current collection', async ({ page }, info) => {
  await page.addInitScript(level => {
    window.showDirectoryPicker = () => new Promise((resolve, reject) => {
      window.finishFolderPicker = (result) => {
        if (result === 'cancel') { reject(new DOMException('Cancelled', 'AbortError')); return }
        resolve({ name: result === 'empty' ? 'New levels' : 'My collection of jumping levels and experiments',
          async *values() {
            if (result === 'error') throw new DOMException('Folder access was denied. Choose the folder again.', 'NotAllowedError')
            if (result !== 'empty') yield { kind: 'file', name: '00-a-very-long-filename-for-my-first-level.json', getFile: async () => new File([JSON.stringify(level)], '00-a-very-long-filename-for-my-first-level.json') }
          },
        })
      }
    })
  }, custom('picker-test', 'First experiment'))
  await open(page)
  await page.getByRole('button', { name: 'Local folder', exact: true }).click()
  await page.screenshot({ path: info.outputPath('folder-empty-state.png') })
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await expect(page.getByRole('button', { name: 'Working…' })).toBeDisabled()
  await page.evaluate(() => window.finishFolderPicker('cancel'))
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Choose folder' }).click()
  await page.evaluate(() => window.finishFolderPicker('populated'))
  await expect(page.getByRole('button', { name: 'Level 1: First experiment' })).toBeVisible()
  await page.getByRole('button', { name: 'Change folder' }).click()
  await page.evaluate(() => window.finishFolderPicker('error'))
  await expect(page.getByRole('alert')).toContainText('Folder access was denied')
  expect(await names(page)).toEqual(['First experiment'])
  await page.getByRole('button', { name: 'Change folder' }).click()
  await page.evaluate(() => window.finishFolderPicker('cancel'))
  await expect(page.getByRole('button', { name: 'Change folder' })).toBeEnabled()
  expect(await names(page)).toEqual(['First experiment'])
  await page.getByRole('button', { name: 'Change folder' }).click()
  await page.evaluate(() => window.finishFolderPicker('populated'))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: info.outputPath('folder-mobile-menu.png') })
  await page.locator('.jumping-level-tile').filter({ has: page.locator('.jumping-level-card[aria-pressed=true]') }).getByRole('button', { name: /^Edit / }).click()
  await page.getByRole('button', { name: /Save location/ }).click()
  await expect(page.getByRole('button', { name: 'Open 00-a-very-long-filename-for-my-first-level.json' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('folder-mobile-builder.png') })
  await expect(page.locator('.builder-tools')).toHaveJSProperty('scrollWidth', await page.locator('.builder-tools').evaluate(el => el.clientWidth))
  await page.getByRole('button', { name: 'Open 00-a-very-long-filename-for-my-first-level.json' }).click()
  await expect(page.getByRole('application', { name: 'Level canvas' })).toBeFocused()
  expect(parseInt(await page.getByLabel('Zoom', { exact: true }).textContent())).toBeGreaterThan(8)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: 'Change folder' }).click()
  await page.evaluate(() => window.finishFolderPicker('empty'))
  await expect(page.getByText('0 levels · Save directly to folder')).toBeVisible()
  await expect(page.getByText('No level files yet. Save a level here from the builder.')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Local level files' })).toHaveCount(0)
})

test('local Next level follows filenames and skips files that need repairs', async ({ page }) => {
  const dir = await mkdtemp(join(tmpdir(), 'jumping-level-order-'))
  try {
    const start = custom('local-start', 'Start here'); start.goal = { x: 330, y: start.spawn.y }
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
    await expect(page.locator('.jumping-level-detail .jumping-load-error').first()).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Untitled Jumping Game', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Level 1: Start here' }).focus()
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    await page.locator('.jumping-level-card[aria-pressed=true]').click()
    await page.keyboard.down('d'); await page.clock.runFor(2600); await page.keyboard.up('d')
    await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
    await page.getByRole('button', { name: 'Next level' }).click()
    await expect(page.getByRole('img', { name: 'Alphabetically first title: activate the goal' })).toBeFocused()
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
  await expect(page.getByRole('img', { name: 'JSON Test Lab — copy: activate the goal' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  expect(errors).toEqual([])
})
