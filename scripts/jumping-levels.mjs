import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { compareFileNames, decodeLevelManifest, decodeLevelFile, isLevelFileName, playableLevelFile } from '../src/games/jumping/levelAssets.ts'
import { MAX_LEVEL_BYTES, checkCollectionSize, textBytes } from '../src/games/jumping/levelLimits.ts'

const source = resolve('public/levels/jumping')
async function entries(root) {
  const directory = await lstat(root)
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error(`Level assets must use a regular directory: ${root}`)
  const files = await readdir(root, { withFileTypes: true })
  for (const file of files) if (!file.isFile() || file.name !== 'index.json' && !isLevelFileName(file.name)) {
    throw new Error(`Unexpected level asset: ${file.name}. Only level JSON and index.json may be published; directories and symlinks are not allowed.`)
  }
  let bytes = 0, count = 0
  for (const file of files) {
    const size = (await lstat(join(root, file.name))).size
    if (size > MAX_LEVEL_BYTES) throw new Error(`${file.name} exceeds 1 MB.`)
    bytes += size; if (file.name !== 'index.json') count++
    checkCollectionSize(bytes, count)
  }
  return files.map(file => file.name).sort(compareFileNames)
}
async function inspect(root) {
  const names = await entries(root), contents = new Map(), ids = new Set()
  for (const name of names) {
    const text = await readFile(join(root, name), 'utf8')
    if (name === 'index.json') { decodeLevelManifest(text); continue }
    const file = playableLevelFile({ fileName: name, level: decodeLevelFile(text) })
    if (ids.has(file.level.id)) throw new Error(`${name}: duplicate level ID.`)
    ids.add(file.level.id); contents.set(name, text)
  }
  const previous = names.includes('index.json') ? decodeLevelManifest(await readFile(join(root, 'index.json'), 'utf8')) : undefined
  return { contents, previous }
}
async function index(root) {
  const { contents, previous } = await inspect(root), levels = [...contents.keys()]
  const retained = (previous?.levels ?? []).filter(name => contents.has(name))
  const manifest = { ...previous, version: 1, levels: [...retained, ...levels.filter(name => !retained.includes(name))] }
  const text = JSON.stringify(manifest, null, 2) + '\n'
  decodeLevelManifest(text)
  checkCollectionSize([...contents.values()].reduce((sum, level) => sum + textBytes(level), textBytes(text)), contents.size)
  await writeFile(join(root, 'index.json'), text)
  return { manifest, contents, text }
}
const mode = process.argv[2] ?? 'index'
if (mode === 'index') {
  const root = resolve(process.argv[3] ?? source), { manifest } = await index(root)
  console.log(`Indexed ${manifest.levels.length} validated built-in levels in ${root}.`)
} else if (mode === 'sync') {
  const { manifest, contents, text } = await index(source)
  const target = resolve(process.argv[3] ?? 'dist/web/levels/jumping')
  if (target === source) throw new Error('The deployment folder must differ from the source folder.')
  await mkdir(target, { recursive: true })
  const names = await entries(target)
  const previous = names.includes('index.json') ? decodeLevelManifest(await readFile(join(target, 'index.json'), 'utf8')) : undefined
  for (const name of names) if (name !== 'index.json' && !previous?.levels.includes(name) && !contents.has(name)) {
    throw new Error(`Unlisted file in deployment folder: ${name}. Use a clean deployment folder.`)
  }
  // Copy only the validated allowlist, never arbitrary files from a level pack.
  for (const [name, content] of contents) await writeFile(join(target, name), content)
  await writeFile(join(target, 'index.json'), text)
  for (const name of previous?.levels ?? []) if (!contents.has(name)) await rm(join(target, name), { force: true })
  console.log(`Copied ${manifest.levels.length} validated JSON levels to ${target}; no JavaScript build required.`)
} else if (mode === 'check') {
  const root = resolve(process.argv[3] ?? source), { previous, contents } = await inspect(root)
  if (!previous || previous.levels.length !== contents.size || previous.levels.some(name => !contents.has(name))) {
    throw new Error('The built-in index must list every level exactly once. Run npm run levels:index.')
  }
  console.log(`Validated ${contents.size} built-in levels.`)
} else throw new Error('Use index, sync, or check, optionally followed by the level asset directory.')
