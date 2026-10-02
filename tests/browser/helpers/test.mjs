import { test as base, expect } from '@playwright/test'
import { SAVE_KEY } from '../../../src/games/hardVacuum/expedition.ts'

// Never let a controller on the developer's desk change a keyboard fixture.
// Controller scenarios install their own navigator property, which takes
// precedence over this prototype fallback regardless of init-script ordering.
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    // Reproduce a slower machine without changing the simulation or timeouts.
    if(process.env.HV_TEST_CPU_RATE) {
      const cdp=await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.HV_TEST_CPU_RATE)})
    }
    await use(page)
    if(testInfo.status!==testInfo.expectedStatus && !page.isClosed()) {
      const state=await page.evaluate(key=>({
        visibility:document.visibilityState,focused:document.hasFocus(),
        dialogs:[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map(el=>el.getAttribute('aria-label')),
        expedition:localStorage.getItem(key),
      }),SAVE_KEY).catch(error=>({unavailable:String(error)}))
      await testInfo.attach('browser-state',{body:JSON.stringify(state,null,2),contentType:'application/json'})
    }
  },
  context: async ({ context }, use) => {
    // General browser tests run independently of published releases and the
    // public API. Download scenarios override this route with their fixtures.
    await context.route('https://api.github.com/repos/nmsimons/arcade/releases?*', route => route.fulfill({ json: [] }))
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable:true, writable:true, value:()=>[] })
    })
    await use(context)
  },
})
export { expect }
