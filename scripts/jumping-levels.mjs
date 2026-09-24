import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compareFileNames, isLevelFileName, loadLevelCatalog } from '../src/games/jumping/levelAssets.ts'

const source = resolve('public/levels/jumping')
async function index(root) {
  const levels = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isFile() && isLevelFileName(entry.name)).map(entry => entry.name).sort(compareFileNames)
  const manifest = { version: 1, levels }
  await writeFile(`${root}/index.json`, JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}
const mode = process.argv[2] ?? 'index'
if (mode === 'index') {
  const root = resolve(process.argv[3] ?? source), manifest = await index(root)
  console.log(`Indexed ${manifest.levels.length} built-in levels in ${root}.`)
} else if (mode === 'sync') {
  const manifest = await index(source)
  const target = resolve(process.argv[3] ?? 'dist/levels/jumping')
  if (target === source) throw new Error('The deployment folder must differ from the source folder.')
  // Remove only obsolete files named by the previous asset index, including the
  // old grouped layout. Leave unrelated local files alone.
  let previous
  try { previous = JSON.parse(await readFile(`${target}/index.json`, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const names = value => Array.isArray(value) ? value.filter(name => typeof name === 'string' && isLevelFileName(name)) : []
  const obsolete = [...names(previous?.levels), ...names(previous?.campaign).map(name => `campaign/${name}`),
    ...names(previous?.examples).map(name => `examples/${name}`), ...names([previous?.playground])].filter(name => !manifest.levels.includes(name))
  await mkdir(target, { recursive: true }); await cp(source, target, { recursive: true })
  for (const name of obsolete) await rm(`${target}/${name}`, { force: true })
  console.log(`Copied JSON assets to ${target}; no JavaScript build required.`)
} else if (mode === 'check') {
  const root = resolve(process.argv[3] ?? source)
  const catalog = await loadLevelCatalog('/', async url => {
    try { return new Response(await readFile(`${root}/${decodeURIComponent(String(url).split('/levels/jumping/')[1])}`, 'utf8')) }
    catch { return new Response(null, { status: 404 }) }
  })
  if (catalog.errors.length) throw new Error(catalog.errors.join('\n'))
  console.log(`Validated ${catalog.files.length} built-in levels.`)
} else throw new Error('Use index, sync, or check, optionally followed by the level asset directory.')
