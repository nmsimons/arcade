import type { LightingView } from './lightingRender.ts'

export const LIGHTING_BUFFER_BUDGET = 64 * 1024 * 1024
export const ENVIRONMENT_FIELD_MARGIN = 64
export const ENVIRONMENT_NOISE_SIZE = 64
// Leave room for retained shadow vertices rather than spending the entire
// allowance on pixels. Actual allocations retain the renderer's final guard.
const GEOMETRY_RESERVE = 1024 * 1024
export const environmentDitherEnabled = (view: LightingView) => view.zoom >= .5 && view.width * view.height <= 1_500_000

/** Two small fields, optional noise, native ambient and GPU-only resolve. */
export function environmentBufferBytes(view: LightingView, gpu = false) {
  const scale = Math.min(1, 512 / Math.max(view.width, view.height))
  const width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
  return 4 * (2 * (width + ENVIRONMENT_FIELD_MARGIN * 2) * (height + ENVIRONMENT_FIELD_MARGIN * 2)
    + view.width * view.height * (gpu ? 2 : 1) + (environmentDitherEnabled(view) ? ENVIRONMENT_NOISE_SIZE * ENVIRONMENT_NOISE_SIZE : 0))
}

/** RGBA atlas, R8 resolve, four-sample R8/stencil, and four Canvas scratch
 * surfaces. Keep this consistent with GpuLightingField's allocation counter. */
export function gpuLightingBufferBytes(view: LightingView, regional = false, vertexBytes = GEOMETRY_RESERVE) {
  return view.width * view.height * (8 + 1 + 4 * 2 + 16) + vertexBytes + (regional ? environmentBufferBytes(view, true) : 0)
}

/** Choose the largest backing size within the ordinary pixel and GPU budgets.
 * Test rounded dimensions: rounding up each edge can otherwise exceed a cap. */
export function lightingPixelRatio(width: number, height: number, dpr = 1, reduced = false, regionalGpu = false) {
  const maximum = Math.min(dpr, reduced ? 1 : 2, Math.sqrt((reduced ? 1_000_000 : 2_000_000) / Math.max(1, width * height)))
  if (!regionalGpu) return maximum
  const fits = (ratio: number) => gpuLightingBufferBytes({ width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), x: 0, y: 0, zoom: 1 }, true) <= LIGHTING_BUFFER_BUDGET
  if (fits(maximum)) return maximum
  let low = 0, high = maximum
  for (let i = 0; i < 24; i++) { const middle = (low + high) / 2; if (fits(middle)) low = middle; else high = middle }
  return low
}
