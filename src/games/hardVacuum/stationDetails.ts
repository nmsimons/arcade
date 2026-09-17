import type { Expedition } from './expedition'

// Recessed service conduits physically connect receivers to their mechanisms.
// Their state follows the same power circuits as the doors.
const CIRCUITS = [
  { source: 'foundry', path: [[460,920],[385,940],[355,875],[435,790],[440,705]] },
  { source: 'relay', path: [[1660,1280],[1735,1325],[1760,1250],[1755,1125],[1810,1080],[1880,1005],[1950,1030],[2005,1030]] },
  { source: 'relay', path: [[1660,1280],[1740,1250],[1755,1000],[1730,855],[1615,820],[1565,760],[1570,705]] },
  { source: 'relay', path: [[1570,705],[1570,610],[1680,550],[1760,440],[1750,350],[1670,275],[1555,275],[1415,250],[1320,275],[1240,350],[1120,300],[1040,340],[1005,340]] },
  { source: 'heart', path: [[2480,1780],[2500,1875],[2660,1900],[2720,1805],[2670,1740]] },
]
export function drawStationInfrastructure(ctx: CanvasRenderingContext2D, state: Expedition) {
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const circuit of CIRCUITS) {
    const powered = !!state.power[circuit.source]
    ctx.beginPath()
    circuit.path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
    ctx.strokeStyle = '#0a1212'; ctx.lineWidth = 5; ctx.stroke()
    ctx.strokeStyle = powered ? '#32624d' : '#263b3c'; ctx.lineWidth = 2; ctx.stroke()
    // Flush contact collars read as cable hardware, not navigation arrows.
    for (const [x, y] of [circuit.path[0], circuit.path[circuit.path.length - 1]]) {
      ctx.fillStyle = powered ? '#65efb2' : '#668b8b'; ctx.fillRect(x - 2, y - 2, 4, 4)
    }
  }
  ctx.restore()
}
