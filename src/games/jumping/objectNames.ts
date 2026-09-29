/** Optional author-facing labels; gameplay connections continue to use IDs. */
export interface NamedObject { name?: string }
export const OBJECT_NAME_MAX_LENGTH = 80

export function parseObjectName(value: unknown, fail: () => never): NamedObject {
  if (value === undefined) return {}
  if (typeof value !== 'string' || value.length > OBJECT_NAME_MAX_LENGTH) return fail()
  const name = value.trim()
  return name ? { name } : {}
}
