import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assetPath, isAppUrl } from '../desktop/assets.mjs'

test('desktop routing serves installed assets and rejects escaping paths and remote URLs', () => {
  const root = mkdtempSync(join(tmpdir(), 'arcade-assets-'))
  try {
    writeFileSync(join(root, 'index.html'), '<html></html>')
    mkdirSync(join(root, 'levels')); writeFileSync(join(root, 'levels', 'index.json'), '{}')
    assert.equal(assetPath(root, 'arcade://game/'), join(root, 'index.html'))
    assert.equal(assetPath(root, 'arcade://game/hard-vacuum'), join(root, 'index.html'))
    assert.equal(assetPath(root, 'arcade://game/untitled-jumping-game/build'), join(root, 'index.html'))
    assert.equal(assetPath(root, 'arcade://game/levels/index.json'), join(root, 'levels', 'index.json'))
    for (const url of ['https://example.com/', 'arcade://elsewhere/', 'arcade://game/levels/missing.json', 'arcade://game/%2e%2e%2foutside', 'arcade://game/%5coutside', 'arcade://game/C%3A/outside']) assert.equal(assetPath(root, url), undefined)
    assert.equal(isAppUrl('arcade://user:password@game/'), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
