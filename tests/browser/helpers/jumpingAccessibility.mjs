import { expect } from '@playwright/test'

export async function expectAccessibleSelection(button) {
  await expect(button).toBeFocused()
  const contrast = await button.evaluate(el => {
    const rgb = color => color.match(/[\d.]+/g).map(Number)
    const luminance = color => rgb(color).slice(0, 3).reduce((sum, channel, i) => {
      const c = channel / 255
      return sum + (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]
    }, 0)
    const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    let parent = el.parentElement
    while (parent && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement
    const style = getComputedStyle(el), fill = luminance(style.backgroundColor)
    return { selection: ratio(fill, luminance(getComputedStyle(parent).backgroundColor)), text: ratio(fill, luminance(style.color)) }
  })
  expect(contrast.selection).toBeGreaterThanOrEqual(3)
  expect(contrast.text).toBeGreaterThanOrEqual(4.5)
}
