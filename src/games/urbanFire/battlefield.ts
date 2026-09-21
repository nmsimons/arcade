import { FIELD } from './types.ts'
import type { Wall } from './types'

export function createBuildings(): Wall[] {
  const { width, height } = FIELD
    const walls: Wall[] = []

    // Urban Fire style - fortress perimeter with internal structures
    const margin = 45
    const bw = Math.min(width, height) * 0.075  // Building size
    const bh = bw * 1.3
    const gap = bw * 0.4

    // === TOP ROW ===
    walls.push({ x: margin, y: margin, width: bw, height: bh })
    walls.push({ x: margin + bw + gap, y: margin, width: bw * 0.7, height: bh * 0.5 })

    walls.push({ x: width * 0.25, y: margin, width: bw, height: bh })
    walls.push({ x: width * 0.25 + bw, y: margin, width: bw * 0.5, height: bh * 0.6 })

    walls.push({ x: width * 0.5 - bw * 0.75, y: margin, width: bw * 1.5, height: bh * 0.7 })

    walls.push({ x: width * 0.75 - bw * 1.5, y: margin, width: bw * 0.5, height: bh * 0.6 })
    walls.push({ x: width * 0.75 - bw, y: margin, width: bw, height: bh })

    walls.push({ x: width - margin - bw * 1.7 - gap, y: margin, width: bw * 0.7, height: bh * 0.5 })
    walls.push({ x: width - margin - bw, y: margin, width: bw, height: bh })

    // === BOTTOM ROW ===
    walls.push({ x: margin, y: height - margin - bh, width: bw, height: bh })
    walls.push({ x: margin + bw + gap, y: height - margin - bh * 0.5, width: bw * 0.7, height: bh * 0.5 })

    walls.push({ x: width * 0.25, y: height - margin - bh, width: bw, height: bh })
    walls.push({ x: width * 0.25 + bw, y: height - margin - bh * 0.6, width: bw * 0.5, height: bh * 0.6 })

    walls.push({ x: width * 0.5 - bw * 0.75, y: height - margin - bh * 0.7, width: bw * 1.5, height: bh * 0.7 })

    walls.push({ x: width * 0.75 - bw * 1.5, y: height - margin - bh * 0.6, width: bw * 0.5, height: bh * 0.6 })
    walls.push({ x: width * 0.75 - bw, y: height - margin - bh, width: bw, height: bh })

    walls.push({ x: width - margin - bw * 1.7 - gap, y: height - margin - bh * 0.5, width: bw * 0.7, height: bh * 0.5 })
    walls.push({ x: width - margin - bw, y: height - margin - bh, width: bw, height: bh })

    // === LEFT COLUMN ===
    walls.push({ x: margin, y: height * 0.25, width: bh, height: bw })
    walls.push({ x: margin, y: height * 0.25 + bw, width: bh * 0.6, height: bw * 0.5 })

    walls.push({ x: margin, y: height * 0.5 - bw * 0.5, width: bh * 0.7, height: bw })

    walls.push({ x: margin, y: height * 0.75 - bw * 1.5, width: bh * 0.6, height: bw * 0.5 })
    walls.push({ x: margin, y: height * 0.75 - bw, width: bh, height: bw })

    // === RIGHT COLUMN ===
    walls.push({ x: width - margin - bh, y: height * 0.25, width: bh, height: bw })
    walls.push({ x: width - margin - bh * 0.6, y: height * 0.25 + bw, width: bh * 0.6, height: bw * 0.5 })

    walls.push({ x: width - margin - bh * 0.7, y: height * 0.5 - bw * 0.5, width: bh * 0.7, height: bw })

    walls.push({ x: width - margin - bh * 0.6, y: height * 0.75 - bw * 1.5, width: bh * 0.6, height: bw * 0.5 })
    walls.push({ x: width - margin - bh, y: height * 0.75 - bw, width: bh, height: bw })

    // === INNER RING - creates corridors ===
    const innerMargin = margin + bh + gap * 2

    // Inner top-left L
    walls.push({ x: innerMargin, y: innerMargin, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: innerMargin, y: innerMargin + bw * 0.8, width: bw * 0.6, height: bw })

    // Inner top-right L
    walls.push({ x: width - innerMargin - bw * 1.2, y: innerMargin, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: width - innerMargin - bw * 0.6, y: innerMargin + bw * 0.8, width: bw * 0.6, height: bw })

    // Inner bottom-left L
    walls.push({ x: innerMargin, y: height - innerMargin - bw * 0.8, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: innerMargin, y: height - innerMargin - bw * 1.8, width: bw * 0.6, height: bw })

    // Inner bottom-right L
    walls.push({ x: width - innerMargin - bw * 1.2, y: height - innerMargin - bw * 0.8, width: bw * 1.2, height: bw * 0.8 })
    walls.push({ x: width - innerMargin - bw * 0.6, y: height - innerMargin - bw * 1.8, width: bw * 0.6, height: bw })

    // === CENTER STRUCTURE - cross/plus shape ===
    const cx = width / 2
    const cy = height / 2
    const crossArm = bw * 3.6
    const crossThick = bw * 1.2

    // Horizontal bar of cross
    walls.push({ x: cx - crossArm / 2, y: cy - crossThick / 2, width: crossArm, height: crossThick })
    // Vertical bar of cross
    walls.push({ x: cx - crossThick / 2, y: cy - crossArm / 2, width: crossThick, height: crossArm })

    // Mid-field obstacles - diamond arrangement
    walls.push({ x: width * 0.3, y: height * 0.35, width: bw, height: bw * 0.6 })
    walls.push({ x: width * 0.7 - bw, y: height * 0.35, width: bw, height: bw * 0.6 })
    walls.push({ x: width * 0.3, y: height * 0.65 - bw * 0.6, width: bw, height: bw * 0.6 })
    walls.push({ x: width * 0.7 - bw, y: height * 0.65 - bw * 0.6, width: bw, height: bw * 0.6 })

  return walls
}
