import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compareFileNames, isLevelFileName, loadLevelCatalog } from '../src/games/jumping/levelAssets.ts'

const source = resolve('public/levels/jumping')
async function index(root) {
  const names = async dir => (await readdir(`${root}/${dir}`, { withFileTypes: true })).filter(entry => entry.isFile() && isLevelFileName(entry.name)).map(entry => entry.name).sort(compareFileNames)
  const manifest = { version: 1, campaign: await names('campaign'), playground: 'playground.json', examples: await names('examples') }
  await writeFile(`${root}/index.json`, JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}
const mode = process.argv[2] ?? 'index'
if (mode === 'index') {
  const root = resolve(process.argv[3] ?? source), manifest = await index(root)
  console.log(`Indexed ${manifest.campaign.length} campaign levels and ${manifest.examples.length} examples in ${root}.`)
} else if (mode === 'sync') {
  await index(source)
  const target = resolve(process.argv[3] ?? 'dist/levels/jumping')
  if (target === source) throw new Error('The deployment folder must differ from the source folder.')
  await mkdir(target, { recursive: true }); await cp(source, target, { recursive: true })
  console.log(`Copied JSON assets to ${target}; no JavaScript build required.`)
} else if (mode === 'check') {
  const root = resolve(process.argv[3] ?? source)
  const catalog = await loadLevelCatalog('/', async url => {
    try { return new Response(await readFile(`${root}/${decodeURIComponent(String(url).split('/levels/jumping/')[1])}`, 'utf8')) }
    catch { return new Response(null, { status: 404 }) }
  })
  if (catalog.errors.length) throw new Error(catalog.errors.join('\n'))
  console.log(`Validated ${catalog.campaign.length} campaign levels, ${catalog.examples.length} examples, and the playground.`)
} else throw new Error('Use index, sync, or check, optionally followed by the level asset directory.')
