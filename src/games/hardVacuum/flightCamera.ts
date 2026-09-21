// Preserve the established flight framing and small-screen readability floor.
// Larger viewports trade some extra visibility for a gentle increase in size.
const BASE_VIEWPORT = { width: 900, height: 620 } as const
const MIN_ZOOM = .58
const MAX_ZOOM = 2
const LARGE_SCREEN_ZOOM_GAIN = .4

export function flightCameraZoom(width: number, height: number) {
  const fit = Math.min(width / BASE_VIEWPORT.width, height / BASE_VIEWPORT.height)
  return fit <= 1 ? Math.max(MIN_ZOOM, fit)
    : Math.min(MAX_ZOOM, 1 + (fit - 1) * LARGE_SCREEN_ZOOM_GAIN)
}
