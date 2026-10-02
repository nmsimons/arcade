import { useEffect, useState } from 'react'
import { DESKTOP_DOWNLOADS, DESKTOP_RELEASES_API, DESKTOP_RELEASES_URL, desktopReleaseFromResponse } from './desktopRelease'
import type { DesktopRelease } from './desktopRelease'

export function DesktopDownloads() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; release: DesktopRelease | null }>({ status: 'loading', release: null })
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    void fetch(DESKTOP_RELEASES_API, { signal: controller.signal, credentials: 'omit' })
      .then(response => { if (!response.ok) throw new Error('Release lookup failed'); return response.json() })
      .then(value => { if (!cancelled) setState({ status: 'ready', release: desktopReleaseFromResponse(value) }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', release: null }) })
      .finally(() => window.clearTimeout(timeout))
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout) }
  }, [])
  return <section className="arcade-downloads" aria-labelledby="desktop-downloads-title">
    <h2 id="desktop-downloads-title">Play offline on your computer</h2>
    <p>Download all four games. Your progress is saved on each device; browser and desktop saves are separate.</p>
    <p className="arcade-download-status" role="status">{state.status === 'loading' ? 'Checking downloads…' : state.status === 'error'
      ? 'Download availability could not be checked.' : state.release ? `Desktop version ${state.release.version}` : 'Desktop downloads are coming soon.'}</p>
    <div className="arcade-download-options">
      {DESKTOP_DOWNLOADS.map(option => <div className="arcade-download-option" key={option.id}>
        <h3>{option.label}</h3><p>{option.detail}</p>
        {state.release?.downloads[option.id]
          ? <><a data-menu-link href={state.release.downloads[option.id]}>Download for {option.label}</a><p>{option.instructions}</p></>
          : <p className="arcade-download-unavailable">{state.status === 'loading' ? 'Checking…' : state.status === 'error' ? 'Check releases below' : 'Coming soon'}</p>}
      </div>)}
    </div>
    {state.release && <a data-menu-link href={state.release.url} target="_blank" rel="noopener noreferrer">Release notes and checksums</a>}
    {state.status === 'error' && <a data-menu-link href={DESKTOP_RELEASES_URL} target="_blank" rel="noopener noreferrer">View desktop releases</a>}
  </section>
}
