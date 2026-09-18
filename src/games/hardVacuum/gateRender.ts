import { doorPanels, doorTravel } from './doors'
import type { GATES } from './expedition'

/** Door leaves share the map's plane and the collider's exact bounds.
 * Depth comes from inset edges, never a projected or floating silhouette. */
export function drawGateObject(ctx: CanvasRenderingContext2D, gate: typeof GATES[number], progress = 0) {
  const vertical = gate.h > gate.w
  const length = vertical ? gate.h : gate.w, thickness = vertical ? gate.w : gate.h
  const half = length / 2, depth = thickness / 2
  ctx.save()
  ctx.translate(gate.x + gate.w / 2, gate.y + gate.h / 2)
  if (vertical) ctx.rotate(Math.PI / 2)
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt'; ctx.shadowBlur = 0

  if (progress < 1) {
    ctx.save()
    ctx.beginPath(); ctx.rect(-half, -depth, length, thickness); ctx.clip()
    if (gate.kind === 'socket') {
      const travel = doorTravel(progress) * half
      const panels = doorPanels({ x: -half, y: -depth, w: length, h: thickness }, progress)
      panels.forEach((panel, index) => {
        const start = panel[0].x, end = panel[1].x
        ctx.fillStyle = '#0a1512'; ctx.fillRect(start, -depth, end - start, thickness)
        ctx.strokeStyle = '#8ca99a'; ctx.lineWidth = 1.4; ctx.strokeRect(start, -depth, end - start, thickness)
        // The inset travels with the whole leaf as it disappears into the wall.
        const origin = index === 0 ? -half - travel : travel
        ctx.strokeStyle = '#3b5549'; ctx.lineWidth = 1
        ctx.strokeRect(origin + 5, -depth + 4, half - 10, thickness - 8)
        const edge = index === 0 ? end : start
        ctx.strokeStyle = progress > 0 ? '#65efb2' : '#6bcaff'; ctx.lineWidth = 1.6
        ctx.beginPath(); ctx.moveTo(edge, -depth + 4); ctx.lineTo(edge, depth - 4); ctx.stroke()
      })
    } else {
      const rubble = gate.kind === 'rubble'
      ctx.fillStyle = rubble ? '#111912' : '#171813'
      ctx.fillRect(-half, -depth, length, thickness)
      ctx.strokeStyle = rubble ? '#94a38c' : '#aaae9b'; ctx.lineWidth = 1.4
      ctx.strokeRect(-half, -depth, length, thickness)
      if (rubble) {
        // A fractured rock plug joins both tunnel walls; cracks stay inside it.
        ctx.strokeStyle = '#71816b'; ctx.lineWidth = 1
        for (let i = 1; i < 5; i++) {
          const x = -half + length * i / 5, bend = i % 2 ? 5 : -6
          ctx.beginPath(); ctx.moveTo(x, -depth); ctx.lineTo(x + bend, -3)
          ctx.lineTo(x - bend * 0.6, 5); ctx.lineTo(x + 3, depth); ctx.stroke()
        }
      } else {
        ctx.strokeStyle = '#50574a'; ctx.lineWidth = 1
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(side * (half - 4), -depth + 4)
          ctx.lineTo(side * 12, -depth + 4); ctx.lineTo(side * 8, 0)
          ctx.lineTo(side * 13, depth - 4); ctx.lineTo(side * (half - 4), depth - 4); ctx.stroke()
        }
        // The torn joint reveals damaged metal, retaining the blast-door cue.
        ctx.strokeStyle = '#bba58a'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(-2, -depth); ctx.lineTo(4, -depth * 0.5)
        ctx.lineTo(-3, -2); ctx.lineTo(5, 4); ctx.lineTo(-4, depth * 0.6); ctx.lineTo(1, depth); ctx.stroke()
      }
    }
    ctx.restore()
  }

  ctx.restore()
}

/** Draw after the cavern mask: foundations are recessed into the solid wall. */
export function drawGateFoundations(ctx: CanvasRenderingContext2D, gate: typeof GATES[number], progress = 0) {
  if (gate.kind === 'rubble') return
  const vertical = gate.h > gate.w
  const length = vertical ? gate.h : gate.w, thickness = vertical ? gate.w : gate.h
  const half = length / 2, depth = thickness / 2
  ctx.save()
  ctx.translate(gate.x + gate.w / 2, gate.y + gate.h / 2)
  if (vertical) ctx.rotate(Math.PI / 2)
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt'; ctx.shadowBlur = 0
  // Recessed actuator housings anchor each leaf into the rock. Their bulk
  // stays outside the aperture, leaving a readable doorway when it is open.
  for (const side of [-1, 1]) {
    const reach = depth + 16
    ctx.save(); ctx.scale(side, 1)
    ctx.fillStyle = '#13221b'; ctx.strokeStyle = '#7f9a8b'; ctx.lineWidth = 1.3
    ctx.beginPath(); ctx.moveTo(half, -reach); ctx.lineTo(half + 15, -reach)
    ctx.lineTo(half + 21, -reach + 6); ctx.lineTo(half + 21, reach - 6)
    ctx.lineTo(half + 15, reach); ctx.lineTo(half, reach); ctx.closePath(); ctx.fill(); ctx.stroke()
    // One inset face and the leaf's receiving slot give depth in map space.
    ctx.fillStyle = '#22392c'; ctx.fillRect(half + 2, -reach + 3, 4, reach * 2 - 6)
    ctx.fillStyle = '#050c09'; ctx.fillRect(half + 2, -depth + 2, 8, thickness - 4)
    ctx.strokeStyle = gate.kind === 'socket' ? (progress > 0 ? '#7bceaa' : '#7799a1') : '#a69c86'
    ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.moveTo(half, -depth + 2); ctx.lineTo(half, depth - 2); ctx.stroke()
    ctx.strokeStyle = '#506e5c'; ctx.lineWidth = 1
    for (const end of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(half + 10, end * (depth + 9)); ctx.lineTo(half + 16, end * (depth + 9)); ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}
