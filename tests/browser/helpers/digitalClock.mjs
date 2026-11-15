/** Read each drawn wall clock: its reading and lit colour, as the renderer reports
 * them (`jumping-display`, see src/games/jumping/debugFrames.ts), so any renderer
 * can be read. A canvas lists the clocks drawn since its wall was last drawn. */
export async function installDigitalClockSpy(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('jumping:debug-frames', '1') } catch { /* Reports stay off; no clocks are read. */ }
    window.addEventListener('jumping-wall', ({ detail: { canvas } }) => { canvas.digitalClocks = [] })
    // Clocks read mm:ss; coin counters (00/03) are not clocks.
    window.addEventListener('jumping-display', ({ detail: { canvas, value, color } }) => {
      if (value[2] === ':') canvas.digitalClocks?.push({ value, color })
    })
  })
}

/** HUD/result timing retains hundredths; the wall face shows whole seconds. */
export const wallTimeFromHud = value => value.split('.')[0].padStart(5, '0')
