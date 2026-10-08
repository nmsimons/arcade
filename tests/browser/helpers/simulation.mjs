/** Pause between test actions: screenshots, assertions and machine speed must
 * not advance a live expedition behind the test's back. Call while on a menu. */
export async function pauseSimulation(page) {
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now()+1000)))
}

/** Long gameplay waits render at 10 Hz but still execute every 60 Hz physics
 * step. A single large fastForward would lose time to the six-step hitch cap;
 * 100 ms batches stay within it. Short input/animation checks still use runFor. */
export async function advanceSimulation(page,milliseconds) {
  await page.clock.runFor(16) // Establish the first frame after a mode change.
  for(let remaining=milliseconds;remaining>0;remaining-=100) {
    await page.clock.fastForward(Math.min(100,remaining))
  }
}

/** UJG runs physics at 120 Hz and caps frame catch-up at 50 ms. Keep every
 * step while reducing expensive software-rendered frames in WebKit. */
export async function advanceJumpingSimulation(page,milliseconds) {
  for(let remaining=milliseconds;remaining>0;remaining-=48) {
    await page.clock.fastForward(Math.min(48,remaining))
  }
}

/** Only for passive waits without rendered-transition assertions. Preserve
 * Playwright's 16 ms RAF lattice: an off-lattice 48 ms jump can exceed UJG's
 * 50 ms catch-up cap, and a batched partial tail can add a simulation step.
 * Held animation checks must continue using normal clock.runFor pacing. */
export async function advanceJumpingPassiveWait(page, milliseconds) {
  if (milliseconds <= 48) { await page.clock.runFor(milliseconds); return }
  const now = await page.evaluate(() => performance.now())
  const leading = Math.min(milliseconds, (16 - now % 16) % 16)
  if (leading) { await page.clock.runFor(leading); milliseconds -= leading }
  while (milliseconds >= 48) { await page.clock.fastForward(48); milliseconds -= 48 }
  if (milliseconds) await page.clock.runFor(milliseconds)
}
