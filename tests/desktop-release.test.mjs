import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { prepareDesktopRelease } from '../scripts/desktop-release.mjs'
import { desktopTarget, macSigningOptions } from '../desktop/packaging.mjs'

test('release preparation requires complete platform files and hashes their actual bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'arcade-release-'))
  try {
    assert.throws(() => prepareDesktopRelease(root, '0.1.0'), /both tested/)
    writeFileSync(join(root, 'dream-large-arcade-windows-x64.zip'), 'windows')
    writeFileSync(join(root, 'dream-large-arcade-linux-x64.tar.gz'), 'linux')
    assert.equal(prepareDesktopRelease(root, '0.1.0').length, 2)
    assert.ok(readFileSync(join(root, 'SHA256SUMS.txt'), 'utf8').includes(`${createHash('sha256').update('windows').digest('hex')}  dream-large-arcade-windows-x64.zip`))
    assert.match(readFileSync(join(root, 'RELEASE-NOTES.md'), 'utf8'), /pending Apple signing/)
    writeFileSync(join(root, 'dream-large-arcade-macos-arm64.zip'), 'arm')
    assert.equal(prepareDesktopRelease(root, '0.1.0').length, 3)
    assert.match(readFileSync(join(root, 'RELEASE-NOTES.md'), 'utf8'), /signed and notarized/)
    writeFileSync(join(root, 'dream-large-arcade-macos-x64.zip'), 'intel')
    assert.throws(() => prepareDesktopRelease(root, '0.1.0'), /Unsupported/)
    assert.throws(() => prepareDesktopRelease(root, '../invalid'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('public Mac signing cannot silently fall back when credentials are incomplete', () => {
  assert.deepEqual(macSigningOptions('darwin', {}), {})
  assert.deepEqual(macSigningOptions('win32', { ARCADE_MAC_SIGNED: '1' }), {})
  assert.throws(() => macSigningOptions('darwin', { ARCADE_MAC_SIGNED: '1' }), /requires/)
  const env = { ARCADE_MAC_SIGNED: '1', MAC_SIGNING_IDENTITY: 'Developer ID Application: Test', ARCADE_MAC_KEYCHAIN: '/test.keychain', APPLE_ID: 'test@example.com', APPLE_APP_SPECIFIC_PASSWORD: 'test-password', APPLE_TEAM_ID: 'TEST' }
  assert.equal(macSigningOptions('darwin', env).osxSign.optionsForFile().hardenedRuntime, true)
  assert.equal(macSigningOptions('darwin', env).osxNotarize.appleIdPassword, 'test-password')
  const product = { name: 'Dream Large Arcade', executable: 'dream-large-arcade' }
  assert.match(desktopTarget(product, 'darwin', 'arm64').executable, /Dream Large Arcade.app/)
  assert.throws(() => desktopTarget(product, 'linux', 'arm64'), /Unsupported/)
  assert.throws(() => desktopTarget(product, 'darwin', 'x64'), /Unsupported/)
})
