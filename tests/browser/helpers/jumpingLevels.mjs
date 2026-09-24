/** Gameplay regression maps are test fixtures, never deployed built-in levels. */
export async function useLevelFixtures(page, levels) {
  const files = levels.map((level, i) => ({ fileName: `${String(i).padStart(2, '0')}-fixture.json`, level }))
  await page.route('**/levels/jumping/*.json', route => {
    const fileName = decodeURIComponent(route.request().url().split('/').at(-1))
    if (fileName === 'index.json') return route.fulfill({ json: { version: 1, levels: files.map(file => file.fileName) } })
    const file = files.find(file => file.fileName === fileName)
    return file ? route.fulfill({ json: file.level }) : route.fulfill({ status: 404 })
  })
}
