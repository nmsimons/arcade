import { useEffect, useState } from 'react'
import { clearWallTextLayouts, GRAFFITI_FONT, OFFICIAL_FONT } from './wallText'

let ready = false, loading: Promise<void> | undefined
export function loadWallTextFonts() {
  return loading ??= (async () => {
    await Promise.all([
      [GRAFFITI_FONT, new URL('./fonts/PermanentMarker-Regular.ttf', import.meta.url).href],
      [OFFICIAL_FONT, new URL('./fonts/AllertaStencil-Regular.ttf', import.meta.url).href],
    ].map(async ([family, url]) => {
      const font = new FontFace(family, `url("${url}")`)
      document.fonts.add(font)
      try { await font.load() } catch { /* Keep the readable fallback if a bundled font cannot load. */ }
    }))
    clearWallTextLayouts()
    ready = true
  })()
}

/** Static editor canvases and thumbnails repaint once the bundled font is ready. */
export function useWallTextFont() {
  const [loaded, setLoaded] = useState(ready)
  useEffect(() => {
    let active = true
    void loadWallTextFonts().then(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [])
  return loaded
}
