/** Drive v2 boundary: duplicate names are legal and metadata writes require ETags. */
export function googleDrive() {
  let serial = 0
  const items = new Map(), requests = []
  const root = { id: 'root', title: 'My Drive', mimeType: 'application/vnd.google-apps.folder', parents: [], etag: 'root' }
  items.set(root.id, root)
  const folder = value => value.mimeType === 'application/vnd.google-apps.folder'
  function make(parent, name, text, properties) {
    const id = `drive-${++serial}`, item = { id, title: name, parents: [{ id: parent }], mimeType: text === undefined ? 'application/vnd.google-apps.folder' : 'application/json', etag: `"${id}-1"`, revision: 1, properties, ...(text === undefined ? {} : { text, fileSize: String(new TextEncoder().encode(text).length) }) }
    items.set(id, item); return item
  }
  const bump = item => { item.etag = `"${item.id}-${++item.revision}"` }
  const view = item => Object.fromEntries(Object.entries(item).filter(([key]) => !['text', 'revision'].includes(key)))
  const child = (parent, name) => [...items.values()].find(item => item.parents.some(p => p.id === parent) && item.title === name && !item.trashed)
  const app = () => [...items.values()].find(item => item.properties?.some(p => p.key === 'dreamLargeArcade' && p.value === 'root-v2'))
  const path = item => !item || item === app() || item.id === 'root' ? '' : `${path(items.get(item.parents[0]?.id))}/${item.title}`
  const error = (status, reason) => Response.json({ error: { errors: [{ reason }] } }, { status })
  const api = {
    items, requests, before: undefined,
    find(name) { let found = app(); for (const part of name.split('/').filter(Boolean)) found = found && child(found.id, part); return found },
    put(name, text) {
      let parent = app()
      if (!parent) parent = make('root', 'Dream Large Arcade', undefined, [{ key: 'dreamLargeArcade', value: 'root-v2', visibility: 'PRIVATE' }])
      const parts = name.split('/'), last = parts.pop()
      for (const part of parts) parent = child(parent.id, part) ?? make(parent.id, part)
      const found = child(parent.id, last)
      if (!found) return make(parent.id, last, text)
      found.text = text; found.fileSize = String(new TextEncoder().encode(text).length); bump(found); return found
    },
    paths() { return [...items.values()].filter(item => !folder(item)).map(item => path(item).slice(1)).sort() },
    async fetch(url, init = {}) {
      const request = { url: new URL(url), method: init.method ?? 'GET', headers: new Headers(init.headers), body: init.body }
      requests.push(request); init.signal?.throwIfAborted()
      const intercepted = await api.before?.(request)
      if (intercepted) return intercepted
      if (request.url.origin !== 'https://www.googleapis.com' || !request.headers.get('authorization')) throw new Error('Invalid Google token destination')
      const u = request.url, id = decodeURIComponent(u.pathname.match(/\/files\/(.+)/)?.[1] ?? '')
      if (request.method === 'GET' && !id) {
        const q = u.searchParams.get('q') ?? ''
        const unquote = text => text.replace(/\\(.)/g, '$1')
        const parent = q.match(/'((?:\\.|[^'])*)' in parents/)?.[1], title = q.match(/title = '((?:\\.|[^'])*)'/)?.[1]
        let found = [...items.values()].filter(item => item.id !== 'root' && !item.trashed && item.appAccessible !== false)
        if (q.includes('properties has')) found = found.filter(item => item.properties?.some(p => p.key === 'dreamLargeArcade' && p.value === 'root-v2'))
        if (parent !== undefined) found = found.filter(item => item.parents.some(p => p.id === unquote(parent)))
        if (title !== undefined) found = found.filter(item => item.title === unquote(title))
        const start = Number(u.searchParams.get('pageToken') || 0), size = Number(u.searchParams.get('maxResults') || 200)
        return Response.json({ items: found.slice(start, start + size).map(view), ...(start + size < found.length ? { nextPageToken: String(start + size) } : {}) })
      }
      if (request.method === 'POST') {
        let metadata, text
        if (u.pathname.startsWith('/upload/')) {
          const boundary = request.headers.get('content-type').split('boundary=')[1], parts = request.body.split('--' + boundary)
          const payload = part => part.slice(part.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '')
          metadata = JSON.parse(payload(parts[1])); text = payload(parts[2])
        } else metadata = JSON.parse(request.body)
        return Response.json(view(make(metadata.parents[0].id, metadata.title, text, metadata.properties)), { status: 201 })
      }
      const item = items.get(id)
      if (!item || item.trashed || item.appAccessible === false) return error(404, 'notFound')
      if (request.method === 'GET') return u.searchParams.get('alt') === 'media' ? new Response(item.text) : Response.json(view(item))
      if (request.method === 'PATCH') {
        if (!request.headers.has('if-match')) throw new Error('Unconditional Google metadata write')
        if (request.headers.get('if-match') !== item.etag) return error(412, 'conditionNotMet')
        Object.assign(item, JSON.parse(request.body))
        const remove = u.searchParams.get('removeParents')?.split(',') ?? [], add = u.searchParams.get('addParents')
        item.parents = item.parents.filter(p => !remove.includes(p.id))
        if (add && !item.parents.some(p => p.id === add)) item.parents.push({ id: add })
        bump(item); return Response.json(view(item))
      }
      throw new Error(`Unexpected Google request ${request.method} ${u.pathname}`)
    },
  }
  return api
}
