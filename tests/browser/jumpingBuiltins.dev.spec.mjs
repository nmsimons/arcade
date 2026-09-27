import { test as base, expect } from './helpers/test.mjs'
import { createServer } from 'vite'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { CAMPAIGN } from '../helpers/jumping-fixtures.mjs'
import { installTestFolder, readTestLevel, dismissSaveFailure } from './helpers/jumpingLevels.mjs'

// Real dev middleware and Git worktree files, without touching authored repo maps.
const test = base.extend({
  project: async ({}, use) => {
    const root = await mkdtemp(join(tmpdir(), 'arcade-builtins-browser-')), assets = join(root, 'public/levels/jumping')
    let server
    try {
      await mkdir(assets, { recursive: true })
      for (const name of ['src', 'node_modules']) await symlink(resolve(name), join(root, name))
      for (const name of ['index.html', 'postcss.config.js', 'package.json']) await copyFile(resolve(name), join(root, name))
      await writeFile(join(assets, '00.json'), JSON.stringify(CAMPAIGN[0]))
      await writeFile(join(assets, '01.json'), JSON.stringify(CAMPAIGN[1]))
      await writeFile(join(assets, 'index.json'), JSON.stringify({ version: 1, levels: ['00.json', '01.json'] }))
      execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'add', 'public'])
      server = await createServer({ root, cacheDir: join(root, '.local/node_modules/.vite'), configFile: resolve('vite.config.ts'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, fs: { allow: [root, process.cwd()] } } })
      await server.listen()
      await use({ root, assets, url: `http://127.0.0.1:${server.httpServer.address().port}`, read: async name => JSON.parse(await readFile(join(assets, name), 'utf8')) })
    } finally { await server?.close(); await rm(root, { recursive: true, force: true }) }
  },
})

test('built-in maps edit, rename, save and test directly in the Git checkout', async ({ page, project }) => {
  await page.goto(`${project.url}/untitled-jumping-game`)
  await page.getByRole('button', { name: 'Edit First Leap', exact: true }).click()
  await expect(page).toHaveURL(/\/builder\/built-in\/00.json$/)
  await expect(page.locator('.builder-save-location')).toContainText('Built-in levels')
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Repository edit')
  await page.getByRole('textbox', { name: 'Level file name', exact: true }).fill('renamed.json')
  await page.getByRole('button', { name: 'Save and Test', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Repository edit: activate the goal' })).toBeFocused()
  await expect(page).toHaveURL(/\/builder\/built-in\/renamed.json\/playtest$/)
  expect((await project.read('renamed.json')).name).toBe('Repository edit')
  expect(await readdir(project.assets)).not.toContain('00.json')
  expect((await project.read('index.json')).levels).toEqual(['renamed.json', '01.json'])
  expect(execFileSync('git', ['-C', project.root, 'diff', '--name-only'], { encoding: 'utf8' })).toContain('public/levels/jumping/index.json')
  await page.getByRole('button', { name: 'Return to builder', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Repository edit')
  await writeFile(join(project.assets, 'renamed.json'), JSON.stringify({ ...(await project.read('renamed.json')), name: 'Edited outside the game' }))
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Keep my unsaved work')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await dismissSaveFailure(page, 'changed on disk')
  expect((await project.read('renamed.json')).name).toBe('Edited outside the game')
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Keep my unsaved work')
})

test('built-in library creates, reorders, recycles and recovers maps without publishing recovery files', async ({ page, project }, info) => {
  await page.goto(`${project.url}/untitled-jumping-game`)
  await page.getByRole('button', { name: 'Level builder', exact: true }).click()
  await expect(page.locator('.builder-save-location')).toContainText('Built-in levels')
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('New repository map')
  expect((await readdir(project.assets)).sort()).toEqual(['00.json', '01.json', 'index.json'])
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  const fileName = 'New repository map.jump-level.json'
  const level = await project.read(fileName)
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('button', { name: `Open ${fileName}`, exact: true }).focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(async () => (await project.read('index.json')).order).toBe('listed')
  await expect(page.getByRole('button', { name: 'Close library', exact: true })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('built-in-library.png') })
  await page.getByRole('button', { name: `Delete ${fileName}`, exact: true }).click()
  await expect(page.getByRole('button', { name: `Open ${fileName}`, exact: true })).toHaveCount(0)
  expect(await readdir(project.assets)).not.toContain('Deleted levels')
  expect((await readdir(join(project.root, '.local/jumping-recycle-bin'))).length).toBe(1)
  await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
  await page.getByRole('button', { name: `Recover ${fileName}`, exact: true }).click()
  await page.getByRole('button', { name: 'Recover', exact: true }).click()
  await expect(page.getByRole('alertdialog', { name: 'Recover level' })).toHaveCount(0)
  expect((await project.read(fileName)).id).toBe(level.id)
  await page.getByRole('button', { name: 'Back to levels', exact: true }).click()
  await expect(page.getByRole('button', { name: `Open ${fileName}`, exact: true })).toBeVisible()
})

test('switching Library collections keeps save destinations and unsaved changes separate', async ({ page, project }) => {
  // A local copy may have the same filename and level id as the built-in.
  await installTestFolder(page, { '00.json': { ...CAMPAIGN[0], name: 'Local original' } })
  await page.goto(`${project.url}/untitled-jumping-game`)
  await page.getByRole('button', { name: 'Edit First Leap', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Built-in draft')
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  await page.getByRole('group', { name: 'Library source' }).getByRole('button', { name: 'Local folder', exact: true }).click()
  await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open 00.json', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Open 00.json', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect((await project.read('00.json')).name).toBe('First Leap')
  await page.getByRole('button', { name: 'Open 00.json', exact: true }).click()
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Local original')
  await expect(page).toHaveURL(/\/builder\/local\/00.json$/)
  expect((await project.read('00.json')).name).toBe('Built-in draft')
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Local edit')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  expect((await readTestLevel(page, '00.json')).name).toBe('Local edit')
  expect((await project.read('00.json')).name).toBe('Built-in draft')
})

test('unfinished built-in maps remain available for editing and saving', async ({ page, project }) => {
  const unfinished = { ...(await project.read('00.json')), name: 'Unfinished built-in', goal: { x: 500, y: 150 } }
  await writeFile(join(project.assets, '00.json'), JSON.stringify(unfinished))
  await page.goto(`${project.url}/untitled-jumping-game`)
  await expect(page.getByRole('button', { name: 'Play Unfinished built-in', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Edit Unfinished built-in', exact: true }).click()
  await page.getByRole('textbox', { name: 'Level name', exact: true }).fill('Still working on this')
  await page.getByRole('button', { name: 'Save level', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Builder status' })).toContainText('Saved')
  expect((await project.read('00.json')).name).toBe('Still working on this')
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Level name', exact: true })).toHaveValue('Still working on this')
})
