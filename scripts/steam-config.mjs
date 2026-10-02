import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Generate a portable upload bundle. This does not log in to Steam or publish. */
export function steamConfigs({ appId, windowsDepot, linuxDepot, branch = 'beta' }) {
  for (const id of [appId, windowsDepot, linuxDepot]) if (!/^[1-9]\d{0,9}$/.test(String(id))) throw new Error('Supply numeric Steam app and depot IDs.')
  if (String(windowsDepot) === String(linuxDepot)) throw new Error('Windows and Linux need separate depot IDs.')
  if (!/^[a-zA-Z0-9_-]+$/.test(branch) || branch === 'default') throw new Error('Supply a named beta branch. Promote tested builds to default in Steamworks.')
  const depot = (id, platform) => `"DepotBuildConfig"\n{\n  "DepotID" "${id}"\n  "FileMapping"\n  {\n    "LocalPath" "${platform}-x64/*"\n    "DepotPath" "."\n    "recursive" "1"\n  }\n}\n`
  return {
    'app_build.vdf': `"AppBuild"\n{\n  "AppID" "${appId}"\n  "Desc" "Dream Large Arcade desktop build"\n  "ContentRoot" "../content"\n  "BuildOutput" "../build-cache"\n  "SetLive" "${branch}"\n  "Depots"\n  {\n    "${windowsDepot}" "depot_${windowsDepot}.vdf"\n    "${linuxDepot}" "depot_${linuxDepot}.vdf"\n  }\n}\n`,
    [`depot_${windowsDepot}.vdf`]: depot(windowsDepot, 'win32'),
    [`depot_${linuxDepot}.vdf`]: depot(linuxDepot, 'linux'),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [output, appId, windowsDepot, linuxDepot, branch] = process.argv.slice(2)
  if (!output) throw new Error('Usage: node scripts/steam-config.mjs OUTPUT APP_ID WINDOWS_DEPOT LINUX_DEPOT [BRANCH]')
  const configs = steamConfigs({ appId, windowsDepot, linuxDepot, branch })
  mkdirSync(resolve(output), { recursive: true })
  for (const [name, value] of Object.entries(configs)) writeFileSync(resolve(output, name), value)
}
