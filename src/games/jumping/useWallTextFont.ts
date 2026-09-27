import { useEffect, useState } from 'react'
import { clearWallTextLayouts, GRAFFITI_FONT } from './wallText'

let ready = false, loading: Promise<void> | undefined
function loadFont() {
  return loading ??= (async () => {
    const font = new FontFace(GRAFFITI_FONT, `url("${new URL('./fonts/PermanentMarker-Regular.ttf', import.meta.url).href}")`)
    document.fonts.add(font)
    try { await font.load() } catch { /* Leave the readable cursive fallback if the font cannot load. */ }
    clearWallTextLayouts()
    ready = true
  })()
}

/** Static editor canvases and thumbnails repaint once the bundled font is ready. */
export function useWallTextFont() {
  const [loaded, setLoaded] = useState(ready)
  useEffect(() => {
    let active = true
    void loadFont().then(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [])
  return loaded
}
