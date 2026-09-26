import type { LevelRepository } from './levelRepository.ts'

const endpoint = '/__arcade/jumping-levels'
export function createDevLevelRepository(): LevelRepository | undefined {
  if (!import.meta.env.DEV || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return
  let token: Promise<string> | undefined
  async function call<T>(method: string, args: unknown[]): Promise<T> {
    token ??= fetch(endpoint, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Built-in editing requires the local development server.')
      return (await response.json()).token as string
    }).catch(error => { token = undefined; throw error })
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Arcade-Level-Token': await token }, body: JSON.stringify({ method, args }) })
    const result = await response.json()
    if (!response.ok) { if (response.status === 403) token = undefined; throw new Error(result.error || 'Could not update built-in levels.') }
    return result
  }
  return {
    read: () => call('read', []), save: (...args) => call('save', args),
    reorder: (...args) => call('reorder', args), remove: (...args) => call('remove', args),
    deleted: () => call('deleted', []), restore: (...args) => call('restore', args), empty: (...args) => call('empty', args),
  }
}
