/** Gameplay regression maps are test fixtures, never deployed built-in levels. */
export async function useLevelFixtures(page, levels) {
  const files = levels.map((level, i) => ({ fileName: `${String(i).padStart(2, '0')}-fixture.json`, level }))
  // Development has a writable catalog endpoint in addition to public assets.
  await page.route('**/__arcade/jumping-levels', route => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON()?.method !== 'read') return route.continue()
    const manifest = { version: 1, levels: files.map(file => file.fileName) }
    return route.fulfill({ json: { files: files.map(file => ({ ...file, sourceText: JSON.stringify(file.level) })), missing: [], errors: [], manifest, manifestSource: JSON.stringify(manifest) } })
  })
  await page.route('**/levels/jumping/*.json', route => {
    const fileName = decodeURIComponent(route.request().url().split('/').at(-1))
    if (fileName === 'index.json') return route.fulfill({ json: { version: 1, levels: files.map(file => file.fileName) } })
    const file = files.find(file => file.fileName === fileName)
    return file ? route.fulfill({ json: file.level }) : route.fulfill({ status: 404 })
  })
}

/** Finish worker preparation before pauseAt jumps through its timeout timers. */
export async function waitForBuilderPreview(page) {
  const { expect } = await import('@playwright/test')
  await expect(page.getByRole('application', { name: 'Level canvas' })).toHaveAttribute('aria-busy', 'false')
}

export async function restartFromPause(page, finishEntrance = true) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^(Restart level|Reset position)$/ }).click()
  if (finishEntrance) await finishJumpingEntrance(page)
}

/** Gameplay routes start after the doorway closes; entrance tests cover the opening itself. */
export async function finishJumpingEntrance(page) {
  const { expect } = await import('@playwright/test')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  const waking = await page.locator('.jumping-state').textContent() === 'Waking up'
  await page.clock.runFor(waking ? 3600 : 1350)
  // Preparation and the first RAF can delay the opening. Advance neutral
  // frames until its published status confirms that ordinary controls are live.
  await expect.poll(async () => {
    await page.clock.runFor(16)
    return page.locator('.jumping-state').innerText()
  }, { intervals: [0] }).not.toMatch(/^(Entering the level|Waking up)$/)
  // Begin controls on a rendered frame, keeping recorded input phases stable.
  const now = await page.evaluate(() => performance.now())
  await page.clock.runFor((16 - now % 16) % 16)
}

/** Isolated repository fixtures exercise the same file operations as local dev, without touching authored assets. */
export async function installBuiltInFixtures(page, files = {}) {
  await page.addInitScript(files => {
    window.testFolderWrites = 0
    FileSystemHandle.prototype.queryPermission = async () => 'granted'
    FileSystemHandle.prototype.requestPermission = async () => 'granted'
    const original = FileSystemFileHandle.prototype.createWritable
    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const writer = await original.apply(this, args), close = writer.close.bind(writer)
      writer.close = async () => { await close(); window.testFolderWrites++ }
      return writer
    }
    let directoryReady
    window.testLevelDirectory = () => directoryReady ??= (async () => {
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('Test levels', { create: true })
      for (const [name, level] of Object.entries(files)) {
        try { await directory.getFileHandle(name); continue } catch { /* Seed only once, preserving saves across reload. */ }
        const writer = await (await directory.getFileHandle(name, { create: true })).createWritable()
        await writer.write(JSON.stringify(level)); await writer.close()
      }
      return directory
    })()
  }, files)
  let queue = Promise.resolve()
  await page.route('**/__arcade/jumping-levels', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { token: 'fixture-repository' } })
    const request = route.request().postDataJSON()
    try {
      const pending = queue.then(() => page.evaluate(async ({ method, args }) => {
        const { directoryRepository } = await import('/src/games/jumping/levelRepository.ts')
        const repository = directoryRepository(await window.testLevelDirectory())
        if (!['read', 'save', 'reorder', 'remove', 'deleted', 'restore', 'empty'].includes(method)) throw new Error('Unknown fixture operation.')
        // JSON sends omitted optional arguments as null; the real dev endpoint
        // restores them to undefined before calling the repository.
        return await repository[method](...args.map(value => value === null ? undefined : value)) ?? null
      }, request))
      queue = pending.catch(() => {})
      const result = await pending
      return route.fulfill({ json: result })
    } catch (error) { return route.fulfill({ status: 400, json: { error: error.message } }) }
  })
}

export async function readTestLevel(page, fileName) {
  return page.evaluate(async name => JSON.parse(await (await (await (await window.testLevelDirectory()).getFileHandle(name)).getFile()).text()), fileName)
}

export async function saveTestLevel(page, button = 'Save level') {
  const { expect } = await import('@playwright/test')
  const fileName = await page.getByRole('textbox', { name: 'Level file name', exact: true, includeHidden: true }).inputValue()
  const writes = await page.evaluate(() => window.testFolderWrites)
  await page.getByRole('button', { name: button, exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.testFolderWrites)).toBeGreaterThan(writes)
  if (button === 'Save and Test') {
    await expect(page.getByRole('button', { name: 'Return to builder', exact: true })).toBeVisible()
    await expect(page.getByRole('img', { name: /: reach the exit$/ })).toBeFocused()
    // Gameplay assertions begin after the entrance; entry itself has dedicated coverage.
    await finishJumpingEntrance(page)
  }
  else await expect(page.getByRole('status', { name: 'Builder status' })).toContainText(`Saved “${fileName}”`)
  return { fileName, level: await readTestLevel(page, fileName) }
}

export async function dismissSaveFailure(page, reason) {
  const { expect } = await import('@playwright/test')
  const dialog = page.getByRole('alertdialog', { name: 'Save failed', exact: true })
  await expect(dialog).toContainText(reason)
  await expect(dialog).toContainText('Your changes are still in the editor.')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

export async function reopenTestLevel(page, saved) {
  await page.getByRole('button', { name: 'Library', exact: true }).click()
  const open = page.getByRole('button', { name: `Open ${saved.fileName}`, exact: true })
  await open.click()
  if (await page.getByRole('alertdialog', { name: 'Unsaved changes' }).count()) await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
}

/** Select through the Object tab, including after opening or reloading a level. */
export async function selectBuilderObject(page, value) {
  await page.getByRole('tab', { name: 'Object', exact: true }).click()
  await selectBuilderOption(page, 'Selected object', value)
}

export async function selectBuilderOption(page, label, value) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('listbox', { name: label, exact: true }).locator(`[role=option][data-value=${JSON.stringify(value)}]`).click()
}
