// Personal OneDrive can HTML-escape descriptions in metadata responses. File
// contents and the JSON request/response envelope are not HTML-escaped.
export const escapeDescription = text => text.replace(/[&"{}<>']/g, character => ({ '&': '&amp;', '"': '&quot;', '{': '&#123;', '}': '&#125;', '<': '&lt;', '>': '&gt;', "'": '&#39;' })[character])

/** In-memory Graph boundary: conditional moves and create-only uploads. */
export function oneDrive({ descriptionResponse = escapeDescription, downloadOrigin = 'https://files.1drv.com' } = {}) {
  let sequence = 0
  const items = new Map(), requests = []
  const root = { id: 'root', name: 'Dream Large Arcade', webUrl: 'https://onedrive.live.com/?id=test-app-folder', folder: {}, eTag: '"root"' }
  items.set(root.id, root)
  const stamp = entry => { entry.eTag = `"${++sequence}"`; return entry }
  const child = (parent, name) => [...items.values()].find(entry => entry.parent === parent && entry.name.toLowerCase() === name.toLowerCase())
  const make = (parent, name, text) => {
    const entry = stamp({ id: `file-${++sequence}`, parent, name, ...(text === undefined ? { folder: {} } : { file: {}, text, size: Buffer.byteLength(text) }) })
    items.set(entry.id, entry); return entry
  }
  function find(path, start = root) {
    return path.split('/').filter(Boolean).reduce((entry, name) => entry && child(entry.id, name), start)
  }
  function put(path, text) {
    const parts = path.split('/'), name = parts.pop()
    let parent = root
    for (const part of parts) parent = child(parent.id, part) ?? make(parent.id, part)
    const existing = child(parent.id, name)
    if (existing) { existing.text = text; existing.size = Buffer.byteLength(text); stamp(existing); return existing }
    return make(parent.id, name, text)
  }
  const view = entry => {
    const { text, parent, ...data } = entry
    const downloadUrl = `${downloadOrigin}/personal/test/_layouts/15/download.aspx?UniqueId=${entry.id}&tempauth=test-only`
    return { ...data, ...(typeof data.description === 'string' ? { description: descriptionResponse(data.description) } : {}), ...(text === undefined ? {} : { '@microsoft.graph.downloadUrl': downloadUrl }) }
  }
  const error = (status, code) => Response.json({ error: { code } }, { status })
  const api = {
    items, requests, put, find,
    remove(path) { const entry = find(path); if (entry) items.delete(entry.id) },
    paths() {
      const path = entry => !entry.parent ? '' : `${path(items.get(entry.parent))}/${entry.name}`
      return [...items.values()].filter(entry => entry.file).map(entry => path(entry).slice(1)).sort()
    },
    before: undefined,
    async fetch(url, init = {}) {
      const request = { url: new URL(url), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body }
      requests.push(request)
      init.signal?.throwIfAborted()
      const intercepted = await api.before?.(request)
      if (intercepted) return intercepted
      if (request.url.origin === downloadOrigin) {
        const entry = items.get(request.url.searchParams.get('UniqueId'))
        return entry ? new Response(entry.text) : error(404, 'notFound')
      }
      if (request.url.origin !== 'https://graph.microsoft.com') throw new Error('Bearer token escaped Graph')
      if (!request.headers.get('authorization')) throw new Error('Missing bearer token')
      const select = request.url.searchParams.get('$select')
      const selectedView = entry => {
        const data = view(entry)
        if (!select) return data
        const fields = new Set(select.split(','))
        // Graph can omit instance annotations when applying field projection,
        // even if @microsoft.graph.downloadUrl appears in the selection.
        return Object.fromEntries(Object.entries(data).filter(([key]) => !key.startsWith('@') && fields.has(key)))
      }
      const pathname = request.url.pathname
      if (pathname === '/v1.0/me/drive/special/approot') return Response.json(selectedView(root))
      const tail = pathname.replace('/v1.0/me/drive/items/', '')
      const id = decodeURIComponent(tail.split(/[/:]/)[0]), base = items.get(id)
      if (!base) return error(404, 'notFound')
      const rest = tail.slice(tail.split(/[/:]/)[0].length)
      if (rest.startsWith(':/')) {
        if (rest.endsWith(':/children')) {
          const folder = find(rest.slice(2, -10).split('/').map(decodeURIComponent).join('/'), base)
          if (!folder) return error(404, 'notFound')
          if (!folder.folder) return error(400, 'notAFolder')
          return Response.json({ value: [...items.values()].filter(entry => entry.parent === folder.id).map(selectedView) })
        }
        const content = rest.endsWith(':/content')
        const parts = rest.slice(2, content ? -9 : undefined).split('/').map(decodeURIComponent)
        if (!content) {
          const entry = find(parts.join('/'), base)
          return entry ? Response.json(selectedView(entry)) : error(404, 'notFound')
        }
        const name = parts.pop(), parent = find(parts.join('/'), base)
        if (!parent) return error(404, 'notFound')
        if (child(parent.id, name)) return error(409, 'nameAlreadyExists')
        if (request.url.searchParams.get('@microsoft.graph.conflictBehavior') !== 'fail') throw new Error('Unsafe overwrite')
        return Response.json(view(make(parent.id, name, init.body)), { status: 201 })
      }
      if (rest === '/children') {
        if (request.method === 'GET') return Response.json({ value: [...items.values()].filter(entry => entry.parent === id).map(selectedView) })
        const data = JSON.parse(init.body)
        if (child(id, data.name)) return error(409, 'nameAlreadyExists')
        return Response.json(view(make(id, data.name)), { status: 201 })
      }
      if (request.method === 'PATCH') {
        if (request.headers.get('if-match') !== base.eTag) return error(412, 'preconditionFailed')
        const data = JSON.parse(init.body)
        if (data.parentReference) {
          if (child(data.parentReference.id, data.name ?? base.name)) return error(409, 'nameAlreadyExists')
          base.parent = data.parentReference.id; base.name = data.name ?? base.name
        }
        if (data.description !== undefined) base.description = data.description
        return Response.json(view(stamp(base)))
      }
      if (request.method === 'GET') return Response.json(selectedView(base))
      throw new Error(`Unexpected request: ${request.method} ${pathname}`)
    },
  }
  return api
}
