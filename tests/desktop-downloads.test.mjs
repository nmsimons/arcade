import assert from 'node:assert/strict'
import test from 'node:test'
import { DESKTOP_DOWNLOADS, DESKTOP_RELEASES_URL, desktopReleaseFromResponse } from '../src/platform/web/desktopRelease.ts'

function release(version = '0.1.0', options = {}) {
  const tag = `desktop-v${version}`
  return { tag_name: tag, draft: false, prerelease: false, assets: DESKTOP_DOWNLOADS.map(option => ({ name: option.asset, state: 'uploaded', size: 42, browser_download_url: `${DESKTOP_RELEASES_URL}/download/${tag}/${option.asset}` })), ...options }
}

test('downloads select one published stable release for Windows, Linux and Apple silicon Mac', () => {
  const result = desktopReleaseFromResponse([release('0.3.0', { draft: true }), release('0.2.0', { prerelease: true }), release()])
  assert.equal(result.version, '0.1.0')
  assert.equal(Object.keys(result.downloads).length, 3)
  assert.match(result.downloads['mac-arm64'], /macos-arm64\.zip$/)
  assert.equal(desktopReleaseFromResponse([]), null)
})

test('missing uploads and unexpected URLs never become download links or mix releases', () => {
  const newer = release('0.2.0')
  newer.assets[0].browser_download_url = 'https://example.com/app.exe'
  newer.assets[1].state = 'new'
  newer.assets[2].size = 0
  assert.equal(desktopReleaseFromResponse([newer]), null)
  newer.assets[0] = release('0.2.0').assets[0]
  const result = desktopReleaseFromResponse([newer, release()])
  assert.deepEqual(Object.keys(result.downloads), ['windows'])
  assert.equal(result.version, '0.2.0')
  assert.equal(desktopReleaseFromResponse([release('0.1.0/evil')]), null)
  assert.throws(() => desktopReleaseFromResponse({ error: 'rate limited' }))
  const intelOnly = release('0.1.0', { assets: [{ name: 'dream-large-arcade-macos-x64.zip', state: 'uploaded', size: 42, browser_download_url: `${DESKTOP_RELEASES_URL}/download/desktop-v0.1.0/dream-large-arcade-macos-x64.zip` }] })
  assert.equal(desktopReleaseFromResponse([intelOnly]), null)
})
