import { expect } from '@playwright/test'
import { DAY_AMBIENT_EXPOSURE } from '../../../src/games/jumping/daylight.ts'

const ambientByte = Math.round(255 * DAY_AMBIENT_EXPOSURE)
export const dayAmbientChannel = value => Math.round(value * ambientByte / 255)

export function expectDayAmbientPixel(actual, artwork) {
  expect(actual).toHaveLength(artwork.length)
  actual.forEach((value, channel) => {
    if (channel === 3) expect(value).toBe(artwork[channel])
    // Canvas multiplication and GPU readback can differ by one integer channel.
    else expect(Math.abs(value - dayAmbientChannel(artwork[channel])), JSON.stringify({ actual, artwork })).toBeLessThanOrEqual(1)
  })
}

/** Recognize artwork throughout Day's ambient-to-sunlight range, including
 * integer-channel rounding, so occlusion checks also detect shaded leaks. */
export function daylightInkPalette(colors) {
  const palette = new Set()
  for (const hex of colors) {
    const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
    for (let exposure = ambientByte; exposure <= 255; exposure++) {
      const rgb = channels.map(value => Math.round(value * exposure / 255))
      for (const r of [-1, 0, 1]) for (const g of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
        palette.add(rgb.map((value, i) => Math.max(0, Math.min(255, value + [r, g, b][i])).toString(16).padStart(2, '0')).join(''))
      }
    }
  }
  return [...palette]
}
