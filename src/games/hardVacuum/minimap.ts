import { clamp } from './math'
import type { Rock, Ship, Vector2 } from './types'

export function drawHardVacuumMinimap(args: {
  ctx: CanvasRenderingContext2D
  viewportWidth: number
  viewportHeight: number
  cameraZoom: number
  worldWidth: number
  worldHeight: number
  boundary: readonly Vector2[]
  obstacles: readonly (readonly Vector2[])[]
  mapId: number
  mapName: string
  basePosition: Vector2
  ship: Ship
  rocks: readonly Rock[]
}) {
  const {
    ctx,
    viewportWidth,
    viewportHeight,
    cameraZoom,
    worldWidth,
    worldHeight,
    boundary,
    obstacles,
    mapId,
    mapName,
    basePosition,
    ship,
    rocks,
  } = args

  const compact = viewportWidth < 700
  const panelWidth = compact ? 146 : 210
  const panelHeight = compact ? 116 : 164
  const panelX = viewportWidth - panelWidth - (compact ? 8 : 18)
  const panelY = compact ? 94 : 76
  const headerHeight = compact ? 19 : 23
  const pad = compact ? 6 : 8
  const plotX = panelX + pad
  const plotY = panelY + headerHeight
  const plotWidth = panelWidth - pad * 2
  const plotHeight = panelHeight - headerHeight - pad

  const viewportWorldWidth = viewportWidth / cameraZoom
  const viewportWorldHeight = viewportHeight / cameraZoom

  // Current maps fit in their entirety. If a future map grows past this scan
  // envelope, the map becomes a ship-following local scan near the player.
  const scanWorldWidth = Math.min(worldWidth, Math.max(3000, viewportWorldWidth * 1.55))
  const scanWorldHeight = Math.min(worldHeight, Math.max(2200, viewportWorldHeight * 1.55))
  const halfScanWidth = scanWorldWidth / 2
  const halfScanHeight = scanWorldHeight / 2
  const scanCenter = {
    x: clamp(ship.pos.x, halfScanWidth, Math.max(halfScanWidth, worldWidth - halfScanWidth)),
    y: clamp(ship.pos.y, halfScanHeight, Math.max(halfScanHeight, worldHeight - halfScanHeight)),
  }
  const scaleX = plotWidth / scanWorldWidth
  const scaleY = plotHeight / scanWorldHeight

  const project = (point: Vector2) => ({
    x: plotX + plotWidth / 2 + (point.x - scanCenter.x) * scaleX,
    y: plotY + plotHeight / 2 + (point.y - scanCenter.y) * scaleY,
  })

  ctx.save()
  ctx.fillStyle = 'rgba(2, 8, 8, 0.9)'
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight)
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.42)'
  ctx.lineWidth = 1
  ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelWidth - 1, panelHeight - 1)

  ctx.font = `${compact ? 8 : 10}px monospace`
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(0, 255, 136, 0.72)'
  ctx.textAlign = 'left'
  const mapLabel = `${compact ? 'M' : 'MAP '}${mapId} ${mapName.toUpperCase()}`
  ctx.fillText(mapLabel, panelX + pad, panelY + headerHeight / 2)
  ctx.fillStyle = 'rgba(220, 238, 230, 0.62)'
  ctx.textAlign = 'right'
  ctx.fillText(`${rocks.length} ROCK${rocks.length === 1 ? '' : 'S'}`, panelX + panelWidth - pad, panelY + headerHeight / 2)

  ctx.save()
  ctx.beginPath()
  ctx.rect(plotX, plotY, plotWidth, plotHeight)
  ctx.clip()
  ctx.fillStyle = 'rgba(24, 48, 41, 0.4)'
  ctx.fillRect(plotX, plotY, plotWidth, plotHeight)

  // Cavern/map outline.
  ctx.beginPath()
  boundary.forEach((point, index) => {
    const p = project(point)
    if (index === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.closePath()
  ctx.strokeStyle = 'rgba(120, 166, 146, 0.72)'
  ctx.lineWidth = compact ? 1 : 1.4
  ctx.stroke()

  // Solid cavern formations are filled so routes and blind corners are legible.
  ctx.fillStyle = 'rgba(3, 9, 8, 0.94)'
  ctx.strokeStyle = 'rgba(120, 166, 146, 0.62)'
  ctx.lineWidth = compact ? 0.8 : 1.1
  for (const obstacle of obstacles) {
    ctx.beginPath()
    obstacle.forEach((point, index) => {
      const p = project(point)
      if (index === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // The current camera footprint makes the extra scan coverage explicit.
  const viewTopLeft = project({
    x: ship.pos.x - viewportWorldWidth / 2,
    y: ship.pos.y - viewportWorldHeight / 2,
  })
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 1
  ctx.strokeRect(viewTopLeft.x, viewTopLeft.y, viewportWorldWidth * scaleX, viewportWorldHeight * scaleY)

  // Fixed mining base.
  const base = project(basePosition)
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.9)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(base.x, base.y, compact ? 3 : 4, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = 'rgba(0, 255, 136, 0.32)'
  ctx.fill()

  // Asteroid contacts. Special rocks keep their gameplay colors.
  for (const rock of rocks) {
    const p = project(rock.pos)
    const markerRadius = clamp(rock.radius * (compact ? 0.065 : 0.08), compact ? 1.7 : 2.2, compact ? 3 : 4)
    ctx.fillStyle = rock.kind === 'red' ? '#ff5555' : rock.kind === 'blue' ? '#4488ff' : 'rgba(225, 238, 232, 0.9)'
    ctx.beginPath()
    ctx.arc(p.x, p.y, markerRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  // Oriented player ship.
  const shipMarker = project(ship.pos)
  ctx.save()
  ctx.translate(shipMarker.x, shipMarker.y)
  ctx.rotate(ship.angle)
  ctx.fillStyle = '#00ff88'
  ctx.beginPath()
  ctx.moveTo(compact ? 5 : 6, 0)
  ctx.lineTo(compact ? -4 : -5, compact ? -3 : -4)
  ctx.lineTo(compact ? -2 : -2.5, 0)
  ctx.lineTo(compact ? -4 : -5, compact ? 3 : 4)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  ctx.restore()
  ctx.restore()
}
