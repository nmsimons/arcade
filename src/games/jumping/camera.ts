import { TUNING } from './model.ts'
import type { Player } from './model.ts'
import { levelHeight } from './level.ts'
import type { JumpLevel } from './level.ts'
export const LEVEL_BOTTOM_PADDING = 32

/** Shared by the original and lit renderers so lighting never changes framing. */
export function gameCamera(width: number, height: number, p: Player, level: JumpLevel, challenge: boolean) {
  if (!challenge) {
    const zoom = Math.max(.45, Math.min(1.6, height / 760))
    return { zoom, x: p.x - width / zoom / 2,
      y: Math.min(p.y - TUNING.height / 2 * (p.inverted ? -1 : 1) - height / zoom / 2, levelHeight(level) - (height - LEVEL_BOTTOM_PADDING) / zoom) }
  }
  const zoom = Math.max(.42, Math.min(1.3, height / 850, width / Math.min(1800, level.width + 80)))
  const half = width / zoom / 2
  const cameraX = level.width < half * 2 - 80 ? level.width / 2 : Math.max(half - 40, Math.min(level.width - half + 40, p.x))
  const cameraY = Math.min(p.y - 31 * (p.inverted ? -1 : 1), levelHeight(level) + (LEVEL_BOTTOM_PADDING - height / 2) / zoom)
  return { zoom, x: cameraX - half, y: cameraY - height / zoom / 2 }
}
