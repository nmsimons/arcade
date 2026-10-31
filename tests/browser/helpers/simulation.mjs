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

// Level routes drop the query string, so remember pages that opened with it.
const renderControlled=new WeakSet()
export function trackRenderControl(page) {
  page.on('framenavigated',frame=>{
    if(frame===page.mainFrame() && new URL(frame.url()).searchParams.get('renderControl')==='1') renderControlled.add(page)
  })
}

/** Software rendering dominates live UJG frames in headless browsers. On a page
 * opened with renderControl=1, skip world drawing while `advance` runs, then
 * draw the resulting frame once. Gameplay, camera and light timing still run.
 * Pages without the flag, including pixel and per-frame checks, draw normally. */
export async function withoutIntermediateFrames(page,advance) {
  const paused=renderControlled.has(page)
    && await page.evaluate(()=>window.jumpingRendering?.pause() ?? false).catch(()=>false)
  try { return await advance() }
  finally { if(paused) await page.evaluate(()=>window.jumpingRendering?.resume()).catch(()=>{}) }
}

/** UJG runs physics at 120 Hz and caps frame catch-up at 50 ms. Keep every
 * step while reducing expensive software-rendered frames in WebKit. */
export async function advanceJumpingSimulation(page,milliseconds) {
  await withoutIntermediateFrames(page,async ()=>{
    for(let remaining=milliseconds;remaining>0;remaining-=48) {
      await page.clock.fastForward(Math.min(48,remaining))
    }
  })
}

/** Only for passive waits without rendered-transition assertions. Preserve
 * Playwright's 16 ms RAF lattice: an off-lattice 48 ms jump can exceed UJG's
 * 50 ms catch-up cap, and a batched partial tail can add a simulation step.
 * Held animation checks must continue using normal clock.runFor pacing. */
export async function advanceJumpingPassiveWait(page, milliseconds) {
  if (milliseconds <= 48) { await page.clock.runFor(milliseconds); return }
  await withoutIntermediateFrames(page, async () => {
    const now = await page.evaluate(() => performance.now())
    const leading = Math.min(milliseconds, (16 - now % 16) % 16)
    if (leading) { await page.clock.runFor(leading); milliseconds -= leading }
    while (milliseconds >= 48) { await page.clock.fastForward(48); milliseconds -= 48 }
    if (milliseconds) await page.clock.runFor(milliseconds)
  })
}
