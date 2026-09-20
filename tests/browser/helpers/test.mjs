import { test as base, expect } from '@playwright/test'

// Never let a controller on the developer's desk change a keyboard fixture.
// Controller scenarios install their own navigator property, which takes
// precedence over this prototype fallback regardless of init-script ordering.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable:true, writable:true, value:()=>[] })
    })
    await use(context)
  },
})
export { expect }
