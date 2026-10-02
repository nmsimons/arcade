import assert from 'node:assert/strict'
import test from 'node:test'
import { steamConfigs } from '../scripts/steam-config.mjs'

test('Steam upload maps both platforms at depot root using portable paths', () => {
  const config = steamConfigs({ appId: '1000', windowsDepot: '1001', linuxDepot: '1002' })
  assert.match(config['app_build.vdf'], /"ContentRoot" "\.\.\/content"/)
  assert.match(config['app_build.vdf'], /"SetLive" "beta"/)
  assert.match(config['depot_1001.vdf'], /"LocalPath" "win32-x64\/\*"/)
  assert.match(config['depot_1002.vdf'], /"LocalPath" "linux-x64\/\*"/)
  assert.match(config['depot_1002.vdf'], /"DepotPath" "\."/)
})

test('Steam upload rejects missing IDs, duplicate depots, and injected or default branches', () => {
  const valid = { appId: '1000', windowsDepot: '1001', linuxDepot: '1002' }
  for (const args of [{ ...valid, appId: undefined }, { ...valid, windowsDepot: '1"' }, { ...valid, linuxDepot: '1001' }, { ...valid, branch: 'default' }, { ...valid, branch: 'beta"\n' }]) assert.throws(() => steamConfigs(args))
})
