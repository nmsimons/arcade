import type { BaseShot, Bullet, Debris, Harpoon, PhaserBeam, PhaserParticle, Rock, Ship, Vector2, V3 } from './types'
import { clamp, cross3, normalize3, rotX, rotY, rotZ } from './math'
import type { HardVacuumGameState } from './ui'
import { getCavernMap } from './worldGeometry'
import { havenDeployment, havenPose } from './campaign'
import { drawHaven } from './havenRender'
import { expeditionMap, maxShields } from './expedition'
import type { Expedition, ExpeditionRuntime } from './expedition'
import { drawExpeditionWorld, drawExpeditionMap, drawExpeditionWalls } from './expeditionRender'
import { drawPowerCell } from './objectModels'
import { drawRadiationShield } from './radiationRender'
import { drawTeleporter } from './teleportRender'
import type { BlasterVisuals } from './blaster'

type Ref<T> = { current: T }

type ToroidalDelta = (ax: number, ay: number, bx: number, by: number, w: number, h: number) => { dx: number; dy: number }

export function drawHardVacuumFrame(args: {
  ctx: CanvasRenderingContext2D
  gameState: HardVacuumGameState
  level: number
  expedition: Expedition
  expeditionRuntime: ExpeditionRuntime
  mapOpen: boolean
  mapOverview?: boolean
  canvasSizeRef: Ref<{ width: number; height: number }>


  miningBaseAngleRef: Ref<number>


  RED_ROCK_DETONATION_DELAY: number

  baseShotsRef: Ref<BaseShot[]>
  rocksRef: Ref<Rock[]>
  bulletsRef: Ref<Bullet[]>
  blasterRef: Ref<BlasterVisuals>
  phaserBeamRef: Ref<PhaserBeam>
  phaserParticlesRef: Ref<PhaserParticle[]>
  debrisRef: Ref<Debris[]>

  harpoonRef: Ref<Harpoon>
  shipRef: Ref<Ship>

  keysRef: Ref<Set<string>>

  shields: number
  lastShieldHitAtRef: Ref<number>
  lastShieldRechargeAtRef: Ref<number>

  toroidalDelta: ToroidalDelta
}) {
  const {
    ctx,
    gameState,
    level,
    expedition,
    expeditionRuntime,
    mapOpen,
    canvasSizeRef,
    miningBaseAngleRef,
    RED_ROCK_DETONATION_DELAY,
    baseShotsRef,
    rocksRef,
    bulletsRef,
    blasterRef,
    phaserBeamRef,
    phaserParticlesRef,
    debrisRef,
    harpoonRef,
    shipRef,
    keysRef,
    shields,
    lastShieldHitAtRef,
    lastShieldRechargeAtRef,
  } = args

  const width = canvasSizeRef.current.width
  const height = canvasSizeRef.current.height
  const cavernMap = gameState === 'menu' ? getCavernMap(level) : expeditionMap(expedition)

  // Clear
  ctx.fillStyle = '#050808'
  ctx.fillRect(0, 0, width, height)

  const shipPosition = shipRef.current.pos
  const cameraZoom = clamp(Math.min(width / 900, height / 620), 0.58, 1)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.scale(cameraZoom, cameraZoom)
  ctx.translate(-shipPosition.x, -shipPosition.y)

  const traceCavern = () => {
    ctx.beginPath()
    cavernMap.boundary.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
  }

  // The cavern is the actual world boundary, not a decorative viewport edge.
  traceCavern()
  ctx.fillStyle = '#081211'
  ctx.fill()
  ctx.save()
  traceCavern()
  ctx.clip()

  // Interior formations define the routes through later maps. They are drawn
  // as solid cavern mass, then added as holes in the gameplay clip below.
  ctx.lineJoin = 'round'
  for (const obstacle of cavernMap.obstacles) {
    ctx.beginPath()
    obstacle.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.fillStyle = '#030706'
    ctx.fill()
    if (gameState !== 'menu') continue
    ctx.strokeStyle = 'rgba(70, 112, 96, 0.72)'
    ctx.lineWidth = 7
    ctx.stroke()
    ctx.strokeStyle = 'rgba(180, 220, 200, 0.38)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  if (gameState !== 'menu') drawExpeditionWalls(ctx)

  if (gameState !== 'menu') drawExpeditionWorld(ctx, expedition, expeditionRuntime, shipRef.current)

  // Hide ships, rocks, beams, and debris when they pass behind solid rock.
  ctx.beginPath()
  cavernMap.boundary.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  ctx.closePath()
  for (const obstacle of cavernMap.obstacles) {
    ctx.moveTo(obstacle[0].x, obstacle[0].y)
    for (let index = 1; index < obstacle.length; index++) ctx.lineTo(obstacle[index].x, obstacle[index].y)
    ctx.closePath()
  }
  ctx.clip('evenodd')

  // The same rigid leaves supply rendering and collision geometry.
  if (gameState !== 'menu') drawHaven(ctx, havenPose(expedition, miningBaseAngleRef.current), expeditionRuntime.elapsed,
    (expedition.campaign.journey?.speed ?? 0) / 210, expeditionRuntime.havenImpact ?? 0)

  // Draw base shots
  if (gameState !== 'menu' && baseShotsRef.current.length > 0) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1.4
    for (const s of baseShotsRef.current) {
      const tx = s.pos.x - s.vel.x * 0.02
      const ty = s.pos.y - s.vel.y * 0.02
      ctx.beginPath()
      ctx.moveTo(tx, ty)
      ctx.lineTo(s.pos.x, s.pos.y)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Draw rocks
  rocksRef.current.forEach((rock) => {
    if (Math.abs(rock.pos.x-shipPosition.x) > width/(2*cameraZoom)+150 || Math.abs(rock.pos.y-shipPosition.y) > height/(2*cameraZoom)+150) return
    if (rock.sourceId && rock.kind === 'blue') {
      drawPowerCell(ctx, rock.pos, rock.rot, rock.laserGlow ?? 0)
      return
    }
    const { verts, polys } = rock.mesh

    const rx = rock.rot[0]
    const ry = rock.rot[1]
    const rz = rock.rot[2]

    const tVerts: V3[] = verts.map((v) => {
      let p = rotX(v, rx)
      p = rotY(p, ry)
      p = rotZ(p, rz)
      return p
    })

    const f = 260
    const proj = (p: V3): [number, number, number] => {
      const denom = Math.max(60, f + p[2])
      const s = f / denom
      return [p[0] * s, p[1] * s, p[2]]
    }

    const proj2 = tVerts.map((p) => {
      const pp = proj(p)
      return { x: pp[0], y: pp[1], z: pp[2] }
    })

    const lightDir = normalize3(([0.25, -0.35, -1] as V3))
    const frontEps = 1e-4
    const faces2: Array<{ idxs: number[]; z: number; shade: number; n: V3; isFront: boolean; isBack: boolean }> = []
    for (const idxs of polys) {
      if (idxs.length < 3) continue
      const p0 = tVerts[idxs[0]]
      const p1 = tVerts[idxs[1]]
      const p2 = tVerts[idxs[2]]
      const u: V3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
      const v: V3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
      let n = normalize3(cross3(u, v))

      let cx = 0
      let cy = 0
      let cz = 0
      for (const ii of idxs) {
        const p = tVerts[ii]
        cx += p[0]
        cy += p[1]
        cz += p[2]
      }
      cx /= idxs.length
      cy /= idxs.length
      cz /= idxs.length
      const outward = n[0] * cx + n[1] * cy + n[2] * cz
      if (outward < 0) n = ([-n[0], -n[1], -n[2]] as V3)

      const isFront = n[2] < -frontEps
      const isBack = n[2] > frontEps
      const ndotl = Math.max(0, n[0] * lightDir[0] + n[1] * lightDir[1] + n[2] * lightDir[2])
      const shade = 0.18 + ndotl * 0.82
      faces2.push({ idxs, z: cz, shade, n, isFront, isBack })
    }
    faces2.sort((a, b) => b.z - a.z)

    type EdgeAcc = {
      a: number
      b: number
      faceCount: number
      frontCount: number
      backCount: number
      n0?: V3
      n1?: V3
    }
    const edgeMap = new Map<string, EdgeAcc>()
    const keyOf = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`)

    for (const f2 of faces2) {
      const idxs2 = f2.idxs
      const isFront2 = f2.isFront
      const isBack2 = f2.isBack
      const n2 = f2.n
      for (let i = 0; i < idxs2.length; i++) {
        const u = idxs2[i]
        const v = idxs2[(i + 1) % idxs2.length]
        const k = keyOf(u, v)
        const aIdx = Math.min(u, v)
        const bIdx = Math.max(u, v)
        const e = edgeMap.get(k) || ({ a: aIdx, b: bIdx, faceCount: 0, frontCount: 0, backCount: 0 } as EdgeAcc)
        e.faceCount += 1
        if (isFront2) e.frontCount += 1
        else if (isBack2) e.backCount += 1
        if (!e.n0) e.n0 = n2
        else if (!e.n1) e.n1 = n2
        edgeMap.set(k, e)
      }
    }

    const isBlue = rock.kind === 'blue'
    const laserGlow = clamp(rock.laserGlow ?? 0, 0, 1)
    const isRed = rock.kind === 'red'
    const isArmedRed = isRed && rock.redFuseS != null
    const armedT = isArmedRed ? clamp(1 - (rock.redFuseS as number) / Math.max(1e-6, RED_ROCK_DETONATION_DELAY), 0, 1) : 0
    const now = isArmedRed ? Date.now() : 0
    const pulse01 = isArmedRed ? 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * (3.5 + 2.5 * armedT)) : 0

    ctx.save()
    ctx.translate(rock.pos.x, rock.pos.y)

    {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.shadowColor = 'rgba(0, 0, 0, 0)'
      ctx.fillStyle = `rgb(${10 + laserGlow * 24}, ${10 + laserGlow * 54}, ${10 + laserGlow * 72})`

      const facesFill = [...faces2].sort((a, b) => a.z - b.z)
      for (const f2 of facesFill) {
        if (!f2.isFront) continue
        ctx.beginPath()
        const p0 = proj2[f2.idxs[0]]
        ctx.moveTo(p0.x, p0.y)
        for (let i = 1; i < f2.idxs.length; i++) {
          const p = proj2[f2.idxs[i]]
          ctx.lineTo(p.x, p.y)
        }
        ctx.closePath()
        ctx.fill()
      }

      ctx.restore()
    }

    ctx.shadowBlur = isArmedRed ? 10 + 18 * pulse01 * (0.25 + 0.75 * armedT) : isBlue ? 10 : 0
    ctx.shadowColor = isBlue
      ? 'rgba(40, 170, 255, 0.45)'
      : isRed
        ? `rgba(255, 68, 68, ${isArmedRed ? 0.28 + 0.42 * pulse01 : 0.45})`
        : 'rgba(0, 0, 0, 0)'
    ctx.strokeStyle = isBlue
      ? 'rgba(40, 170, 255, 0.95)'
      : isRed
        ? isArmedRed ? `rgba(255, 68, 68, ${0.55 + 0.45 * pulse01})` : 'rgba(192, 145, 130, 0.9)'
        : 'rgba(255,255,255,0.9)'
    ctx.lineWidth = isArmedRed ? 1.4 + 0.9 * pulse01 * (0.25 + 0.75 * armedT) : 1.4
    if (laserGlow > 0.01) {
      ctx.shadowBlur = Math.max(ctx.shadowBlur, 20 * laserGlow)
      ctx.shadowColor = `rgba(135, 210, 255, ${laserGlow * 0.8})`
      ctx.lineWidth += laserGlow * 0.65
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()

    for (const e of edgeMap.values()) {
      const isBoundaryFront = e.faceCount === 1 && e.frontCount > 0
      const isSilhouette = e.frontCount > 0 && e.backCount > 0
      const isFrontEdge = e.faceCount === 2 && e.frontCount === 2
      if (!isBoundaryFront && !isSilhouette && !isFrontEdge) continue

      const pa = proj2[e.a]
      const pb = proj2[e.b]
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pb.x, pb.y)
    }

    ctx.stroke()
    if (isRed && !isArmedRed) {
      // Idle mineral fissures tumble with the faces. Once armed, the entire
      // asteroid uses the original accelerating red warning pulse above.
      ctx.strokeStyle = 'rgba(255, 88, 65, 0.7)'
      ctx.shadowColor = '#ff6650'; ctx.shadowBlur = 3
      ctx.lineWidth = 1
      for (let i = 0; i < faces2.length; i++) {
        const face = faces2[i]
        if (!face.isFront || i % 3 !== 0) continue
        const a = proj2[face.idxs[0]], b = proj2[face.idxs[1]], c = proj2[face.idxs[face.idxs.length - 1]]
        ctx.beginPath(); ctx.moveTo(a.x * 0.6 + b.x * 0.4, a.y * 0.6 + b.y * 0.4)
        ctx.lineTo(a.x * 0.22 + b.x * 0.43 + c.x * 0.35, a.y * 0.22 + b.y * 0.43 + c.y * 0.35)
        ctx.lineTo(a.x * 0.4 + c.x * 0.6, a.y * 0.4 + c.y * 0.6); ctx.stroke()
      }
    }
    ctx.restore()
  })

  // Draw bullets
  bulletsRef.current.forEach((bullet) => {
    ctx.fillStyle = bullet.isEnemy ? '#ff4444' : '#00ff88'
    ctx.beginPath()
    ctx.arc(bullet.pos.x, bullet.pos.y, 2, 0, Math.PI * 2)
    ctx.fill()
  })

  // Discrete red bolts: a hard-edged body and short exhaust trail.
  if (gameState !== 'menu') {
    for (const shot of blasterRef.current.shots) {
      ctx.save(); ctx.translate(shot.pos.x, shot.pos.y); ctx.rotate(Math.atan2(shot.vel.y, shot.vel.x))
      ctx.strokeStyle = '#ff665e'; ctx.lineWidth = 2; ctx.fillStyle = '#741e23'
      ctx.shadowColor = 'rgba(255,70,60,0.3)'; ctx.shadowBlur = 6
      ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(3, -5); ctx.lineTo(-12, -4); ctx.lineTo(-17, 0); ctx.lineTo(-12, 4); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.strokeStyle = '#ffbbb2'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(8, 0); ctx.stroke()
      ctx.strokeStyle = '#ff665e80'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(-18, 0); ctx.stroke()
      ctx.restore()
    }
    for (const burst of blasterRef.current.bursts) {
      const progress = 1 - burst.life / 0.28, radius = 10 + progress * 72
      ctx.save(); ctx.strokeStyle = `rgba(255,88,75,${1 - progress})`; ctx.lineWidth = 2.5 * (1 - progress)
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4
        const x = burst.pos.x + Math.cos(angle) * radius, y = burst.pos.y + Math.sin(angle) * radius
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath(); ctx.stroke(); ctx.restore()
    }
  }

  // Draw phaser beam (player)
  if (gameState === 'playing' && phaserBeamRef.current.active) {
    const beam = phaserBeamRef.current

    const now = Date.now()

    const drawWavyGradientStroke = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      color: string,
      alphaStart: number,
      alphaEnd: number,
      widthPx: number,
      wobbleAmp: number,
      wobbleFreq: number,
      phase: number,
    ) => {
      const dx = bx - ax
      const dy = by - ay
      const len = Math.max(1e-6, Math.hypot(dx, dy))
      const ux = dx / len
      const uy = dy / len
      const px = -uy
      const py = ux

      const g = ctx.createLinearGradient(ax, ay, bx, by)
      g.addColorStop(0, `rgba(${color}, ${alphaStart})`)
      g.addColorStop(0.72, `rgba(${color}, ${alphaStart})`)
      g.addColorStop(1, `rgba(${color}, ${alphaEnd})`)

      const segs = clamp(Math.round(len / 22), 8, 26)
      ctx.strokeStyle = g
      ctx.lineWidth = widthPx
      ctx.beginPath()
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const baseX = ax + dx * t
        const baseY = ay + dy * t
        const env = 0.25 + 0.75 * (1 - t)
        const wobble = Math.sin(t * Math.PI * 2 * wobbleFreq + now * 0.018 + phase) * wobbleAmp * env
        const x = baseX + px * wobble
        const y = baseY + py * wobble
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    const beamEnd = {
      x: beam.start.x + beam.direction.x * beam.length,
      y: beam.start.y + beam.direction.y * beam.length,
    }

    const energyA = clamp(0.25 + 0.75 * beam.energy01, 0.25, 1)
    const flicker = 0.85 + 0.15 * Math.sin(now * 0.045)
    const a = energyA * flicker

    ctx.save()
    ctx.globalAlpha = 1
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Outer glow (soft fade-out near end-of-reach)
    ctx.shadowBlur = 18
    ctx.shadowColor = `rgba(40, 170, 255, ${0.35 * a})`
    drawWavyGradientStroke(beam.start.x, beam.start.y, beamEnd.x, beamEnd.y, '40, 170, 255', 0.14 * a, 0.0, 12, 2.2, 2.2, 0.3)

    // Core
    ctx.shadowBlur = 22
    ctx.shadowColor = `rgba(40, 170, 255, ${0.5 * a})`
    drawWavyGradientStroke(beam.start.x, beam.start.y, beamEnd.x, beamEnd.y, '40, 170, 255', 0.92 * a, 0.05, 3.8, 1.6, 2.8, 1.1)

    // White-hot center
    ctx.shadowBlur = 0
    drawWavyGradientStroke(beam.start.x, beam.start.y, beamEnd.x, beamEnd.y, '255,255,255', 0.7 * a, 0.0, 1.5, 0.9, 3.2, 2.7)

    ctx.restore()
  }

  // Phaser particles (player)
  if (gameState === 'playing' && phaserParticlesRef.current.length > 0) {
    for (const p of phaserParticlesRef.current) {
      const a = clamp(p.life / 280, 0, 1)
      ctx.save()
      ctx.globalAlpha = 1
      ctx.shadowBlur = 10
      ctx.shadowColor = `rgba(40, 170, 255, ${0.55 * a})`
      ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`
      ctx.beginPath()
      ctx.arc(p.pos.x, p.pos.y, 1.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  // Draw debris
  debrisRef.current.forEach((d) => {
    const alpha = d.life / 2000
    ctx.strokeStyle = `rgba(${d.color}, ${alpha})`
    ctx.lineWidth = 2
    ctx.save()
    ctx.translate(d.pos.x, d.pos.y)
    ctx.rotate(d.angle)
    ctx.beginPath()
    ctx.moveTo(-d.length / 2, 0)
    ctx.lineTo(d.length / 2, 0)
    ctx.stroke()
    ctx.restore()
  })

  // Draw harpoon + tether in continuous world space.
  const hp = harpoonRef.current
  if (hp.state !== 'idle' && gameState === 'playing') {
    const ship = shipRef.current

    const drawRopeLine = (ax: number, ay: number, bx: number, by: number) => {
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.6

    if (hp.state === 'attached') {
      const pts: Vector2[] = [ship.pos, ...hp.rope, hp.rock.pos]
      for (let i = 0; i < pts.length - 1; i++) {
        drawRopeLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(hp.rock.pos.x, hp.rock.pos.y, 3, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const pts: Vector2[] = [ship.pos, ...hp.rope, hp.pos]
      for (let i = 0; i < pts.length - 1; i++) {
        drawRopeLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(hp.pos.x, hp.pos.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (gameState !== 'menu') drawTeleporter(ctx, expedition, expeditionRuntime)
  // Draw ship
  if ((!expedition.campaign.journey?.riding || havenDeployment(expedition) > .3) && (gameState !== 'dying' && gameState !== 'gameOver')) {
    const ship = shipRef.current

    const isHealing = expeditionRuntime.recharging

    ctx.save()
    ctx.translate(ship.pos.x, ship.pos.y)
    ctx.rotate(ship.angle)
    const s = ship.radius / 15

    const shipColor = '#ffffff'

    ctx.strokeStyle = shipColor
    ctx.lineWidth = 2.4
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.shadowColor = 'rgba(255, 255, 255, 0.28)'
    ctx.shadowBlur = 8

    const noseX = 18 * s
    const midX = -1 * s
    const tailX = -18 * s
    const bodyHalf = 10 * s
    const podOutY = 9 * s
    const podRearY = 4.5 * s

    if (isHealing) {
      const haloGap = 24
      const haloNoseX = noseX + 4 * s
      const haloNotchX = tailX + 6 * s
      const haloHull: Vector2[] = [
        { x: haloNoseX, y: 0 },
        { x: midX, y: -bodyHalf },
        { x: -10 * s, y: -podOutY },
        { x: tailX, y: -podRearY },
        { x: haloNotchX, y: 0 },
        { x: tailX, y: podRearY },
        { x: -10 * s, y: podOutY },
        { x: midX, y: bodyHalf },
      ]

      const expandHullByGap = (gap: number) =>
        haloHull.map((p) => {
          const len = Math.hypot(p.x, p.y)
          if (len < 1e-6) return p
          const k = 1 + gap / len
          return { x: p.x * k, y: p.y * k }
        })

      const healT = clamp(expeditionRuntime.rechargeProgress, 0, 1)
      const intensity = 0.4 + 0.35 * healT
      const now = Date.now() / 1000

      const base = expandHullByGap(haloGap)
      ctx.save()
      ctx.strokeStyle = '#00ff88'
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = 'rgba(0, 255, 136, 0.55)'
      ctx.shadowBlur = 9
      ctx.globalAlpha = 0.09 * intensity
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(base[0].x, base[0].y)
      for (let i = 1; i < base.length; i++) ctx.lineTo(base[i].x, base[i].y)
      ctx.closePath()
      ctx.stroke()

      const rippleCount = 2
      const cycleSec = 0.85
      const outerExtra = 58
      for (let i = 0; i < rippleCount; i++) {
        const t = ((now / cycleSec) + i / rippleCount) % 1
        const rippleGap = haloGap + outerExtra * (1 - t)
        const progress = t
        const ring = expandHullByGap(rippleGap)

        ctx.shadowBlur = 6 + 12 * progress
        ctx.globalAlpha = (0.035 + 0.18 * progress) * intensity
        ctx.lineWidth = 0.9 + 2.2 * progress
        ctx.beginPath()
        ctx.moveTo(ring[0].x, ring[0].y)
        for (let j = 1; j < ring.length; j++) ctx.lineTo(ring[j].x, ring[j].y)
        ctx.closePath()
        ctx.stroke()
      }

      ctx.restore()
    }

    if (shields > 0) {
      const shieldFrac = clamp(shields / maxShields(expedition), 0, 1)
      const gap = 6
      const shieldNoseX = noseX + 4 * s
      const shieldNotchX = tailX + 6 * s

      const shieldDamaged = shields <= 0
      const hitAgeMs = Date.now() - lastShieldHitAtRef.current
      const flashActive = hitAgeMs >= 0 && hitAgeMs < 220
      const flashAlpha = flashActive ? (Math.floor(hitAgeMs / 60) % 2 === 0 ? 1 : 0.18) : 1

      const rechargeAgeMs = Date.now() - lastShieldRechargeAtRef.current
      const rechargeFadeAlpha =
        !shieldDamaged && rechargeAgeMs >= 0 && rechargeAgeMs < 160 ? clamp(rechargeAgeMs / 160, 0, 1) : 1

      const shieldColor = shieldDamaged ? '#ffaa00' : '#00ff88'
      const shieldGlow = shieldDamaged ? 'rgba(255, 170, 0, 0.7)' : 'rgba(0, 255, 136, 0.75)'
      const shieldLow = shields < maxShields(expedition)
      const shieldLineWidth = shieldDamaged ? 1.4 : shieldLow ? 1.7 : 2.2
      const shieldBlur = (shieldDamaged ? 8 : shieldLow ? 12 : 14) + shieldFrac * (shieldDamaged ? 10 : 14)
      const hull: Vector2[] = [
        { x: shieldNoseX, y: 0 },
        { x: midX, y: -bodyHalf },
        { x: -10 * s, y: -podOutY },
        { x: tailX, y: -podRearY },
        { x: shieldNotchX, y: 0 },
        { x: tailX, y: podRearY },
        { x: -10 * s, y: podOutY },
        { x: midX, y: bodyHalf },
      ]

      const expanded = hull.map((p) => {
        const len = Math.hypot(p.x, p.y)
        if (len < 1e-6) return p
        const k = 1 + gap / len
        return { x: p.x * k, y: p.y * k }
      })

      ctx.save()
      ctx.globalAlpha = (0.25 + 0.55 * shieldFrac) * flashAlpha * rechargeFadeAlpha
      ctx.strokeStyle = flashActive && shieldDamaged ? '#00ff88' : shieldColor
      ctx.lineWidth = flashActive && shieldDamaged ? 2.2 : shieldLineWidth
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.shadowColor = flashActive && shieldDamaged ? 'rgba(0, 255, 136, 0.75)' : shieldGlow
      ctx.shadowBlur = flashActive && shieldDamaged ? 14 + shieldFrac * 14 : shieldBlur
      ctx.beginPath()
      ctx.moveTo(expanded[0].x, expanded[0].y)
      for (let i = 1; i < expanded.length; i++) ctx.lineTo(expanded[i].x, expanded[i].y)
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    ctx.beginPath()
    ctx.moveTo(noseX, 0)
    ctx.lineTo(midX, -bodyHalf)
    ctx.lineTo(-10 * s, -podOutY)
    ctx.lineTo(tailX, -podRearY)
    ctx.lineTo(-9 * s, 0)
    ctx.lineTo(tailX, podRearY)
    ctx.lineTo(-10 * s, podOutY)
    ctx.lineTo(midX, bodyHalf)
    ctx.closePath()

    ctx.save()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.shadowColor = 'rgba(0, 0, 0, 0)'
    ctx.fillStyle = '#0a0a0a'
    ctx.fill()
    ctx.restore()

    ctx.stroke()

    ctx.shadowBlur = 0
    ctx.globalAlpha = 0.9
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(noseX - 2 * s, 0)
    ctx.lineTo(-3 * s, -6.5 * s)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(noseX - 2 * s, 0)
    ctx.lineTo(-3 * s, 6.5 * s)
    ctx.stroke()

    ctx.globalAlpha = 0.85
    ctx.lineWidth = 1.6
    for (const sign of [-1, 1]) {
      const px = -12.5 * s
      const py = sign * 6.2 * s
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(px + 3.2 * s, py)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px, py + sign * 2.2 * s)
      ctx.lineTo(px + 2.2 * s, py + sign * 2.2 * s)
      ctx.stroke()
    }

    if (keysRef.current.has('arrowdown') || keysRef.current.has('s')) {
      ctx.save(); ctx.strokeStyle = '#ffb86b'; ctx.lineWidth = 2
      ctx.shadowColor = 'rgba(255, 160, 60, 0.4)'; ctx.shadowBlur = 6
      const jet = (9 + Math.random() * 7) * s
      ctx.beginPath(); ctx.moveTo(noseX, -2.5 * s); ctx.lineTo(noseX + jet, 0); ctx.lineTo(noseX, 2.5 * s); ctx.stroke()
      ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 1.3
      ctx.beginPath(); ctx.moveTo(noseX + 1, 0); ctx.lineTo(noseX + jet * 0.5, 0); ctx.stroke(); ctx.restore()
    }
    if (keysRef.current.has('arrowup') || keysRef.current.has('w')) {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#ff6600'
      ctx.shadowColor = 'rgba(255, 102, 0, 0.25)'
      ctx.shadowBlur = 6
      ctx.lineWidth = 2.6

      for (const sign of [-1, 1]) {
        const ex = tailX + 1.5 * s
        const ey = sign * 2.7 * s
        const flame = (8 + Math.random() * 7) * s
        const flare = 2.8 * s
        ctx.beginPath()
        ctx.moveTo(ex, ey - flare)
        ctx.lineTo(ex - flame, ey)
        ctx.lineTo(ex, ey + flare)
        ctx.stroke()
      }

      ctx.restore()
    }

    ctx.restore()
  }

  if (gameState === 'playing' && !expedition.campaign.journey?.riding) drawRadiationShield(ctx, shipRef.current, expeditionRuntime.radiation, expeditionRuntime.elapsed)
  ctx.restore() // cavern clip

  // A narrow mineral edge marks the boundary without creating an inner black band.
  ctx.save()
  ctx.lineJoin = 'round'
  traceCavern()
  ctx.strokeStyle = 'rgba(70, 112, 96, 0.62)'
  ctx.lineWidth = 7
  ctx.shadowBlur = 7
  ctx.shadowColor = 'rgba(0, 255, 136, 0.12)'
  ctx.stroke()
  traceCavern()
  ctx.strokeStyle = 'rgba(180, 220, 200, 0.4)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()
  ctx.restore() // camera

  if (gameState === 'playing' && mapOpen) {
    drawExpeditionMap(ctx, expedition, shipRef.current, width, height, mapOpen, args.mapOverview)
  }

}
