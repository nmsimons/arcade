import { androidMaterials } from '../../../src/games/jumping/androidArtwork.ts'

const installed = new WeakSet()

/** Observe the rendered head's coordinate space, independently of its outline.
 * The renderer reports every head it draws (`jumping-head`, see
 * src/games/jumping/debugFrames.ts) once a test turns reporting on, so no canvas
 * call is patched and any renderer can be observed (WebGL's frames report on
 * the game's canvas too). This keeps the player's heads on the game canvas and
 * passes them on as `jumping-athlete-head`.
 * Palette values come from the artwork so visual tuning cannot disable probes. */
export async function installAthleteHeadObserver(page, inks = ['#686b6e', '#e5e7e6']) {
  if (installed.has(page)) return
  installed.add(page)
  await page.addInitScript(({ faces }) => {
    try { localStorage.setItem('jumping:debug-frames', '1') } catch { /* Reports stay off; probes see nothing. */ }
    window.addEventListener('jumping-head', ({ detail }) => {
      const { canvas, ink } = detail
      if (!faces.includes(ink) || !(canvas instanceof HTMLCanvasElement) || !canvas.matches('.jumping-game > canvas')) return
      window.dispatchEvent(new CustomEvent('jumping-athlete-head', { detail }))
    })
  }, { faces: inks.map(ink => androidMaterials(ink).face) })
}
