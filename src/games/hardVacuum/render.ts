import type { BaseShot, Bullet, Debris, Harpoon, PhaserBeam, PhaserParticle, Rock, Ship, Vector2, V3 } from './types'
import { clamp, cross3, normalize3, rotX, rotY, rotZ } from './math'
import type { HardVacuumGameState } from './ui'

type Ref<T> = { current: T }

type ToroidalDelta = (ax: number, ay: number, bx: number, by: number, w: number, h: number) => { dx: number; dy: number }

type PowerPulse = { kind: 'gravity' | 'stasis'; at: number }

export function drawHardVacuumFrame(args: {
  ctx: CanvasRenderingContext2D
  gameState: HardVacuumGameState
  canvasSizeRef: Ref<{ width: number; height: number }>
  starFieldCanvasRef: Ref<HTMLCanvasElement | null>
  starFieldSizeRef: Ref<{ width: number; height: number }>

  MINING_BASE_RADIUS: number
  MINING_DOOR_TRIM: number

  miningBaseAngleRef: Ref<number>

  attractorActive: boolean
  attractorTimer: number

  baseShotsRef: Ref<BaseShot[]>
  rocksRef: Ref<Rock[]>
  bulletsRef: Ref<Bullet[]>
  phaserBeamRef: Ref<PhaserBeam>
  phaserParticlesRef: Ref<PhaserParticle[]>
  debrisRef: Ref<Debris[]>

  harpoonRef: Ref<Harpoon>
  shipRef: Ref<Ship>

  powerPulsesRef: Ref<PowerPulse[]>
  keysRef: Ref<Set<string>>

  shields: number
  shieldsRef: Ref<number>
  shipRepairTimeRef: Ref<number>
  lastShieldHitAtRef: Ref<number>
  lastShieldRechargeAtRef: Ref<number>

  toroidalDelta: ToroidalDelta
}) {
  const {
    ctx,
    gameState,
    canvasSizeRef,
    starFieldCanvasRef,
    starFieldSizeRef,
    MINING_BASE_RADIUS,
    MINING_DOOR_TRIM,
    miningBaseAngleRef,
    attractorActive,
    attractorTimer,
    baseShotsRef,
    rocksRef,
    bulletsRef,
    phaserBeamRef,
    phaserParticlesRef,
    debrisRef,
    harpoonRef,
    shipRef,
    powerPulsesRef,
    keysRef,
    shields,
    shieldsRef,
    shipRepairTimeRef,
    lastShieldHitAtRef,
    lastShieldRechargeAtRef,
    toroidalDelta,
  } = args

  const width = canvasSizeRef.current.width
  const height = canvasSizeRef.current.height

  const ensureStarField = () => {
    const w = canvasSizeRef.current.width
    const h = canvasSizeRef.current.height

    if (starFieldCanvasRef.current && starFieldSizeRef.current.width === w && starFieldSizeRef.current.height === h) {
      return
    }

    const off = document.createElement('canvas')
    off.width = w
    off.height = h
    const sctx = off.getContext('2d')
    if (!sctx) return

    const area = w * h
    const count = clamp(Math.round(area / 5000), 200, 600)
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const r = Math.random()
      const size = r < 0.08 ? 2 : 1
      const alpha = r < 0.08 ? 0.35 : 0.18
      sctx.fillStyle = `rgba(255,255,255,${alpha})`
      sctx.fillRect(x, y, size, size)
    }

    starFieldCanvasRef.current = off
    starFieldSizeRef.current = { width: w, height: h }
  }

  // Clear
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, width, height)

  // Starfield background (behind everything).
  if (gameState !== 'menu') {
    ensureStarField()
    if (starFieldCanvasRef.current) {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.drawImage(starFieldCanvasRef.current, 0, 0)
      ctx.restore()
    }
  }

  // Draw mining base (center) behind rocks.
  if (gameState !== 'menu') {
    const cx = width / 2
    const cy = height / 2
    const R = MINING_BASE_RADIUS

    const baseAng = miningBaseAngleRef.current

    const poly = (r: number, n: number, rot: number) => {
      const pts: Vector2[] = []
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
      }
      return pts
    }

    ctx.save()
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'

    // Flat-topped hex (flats north/south).
    const doorCorners = new Set([1, 3, 5])

    const drawHexWithDoorGaps = (verts: Vector2[]) => {
      const segs: Array<{ ax: number; ay: number; bx: number; by: number; edge: number }> = []
      for (let i = 0; i < 6; i++) {
        const a0 = verts[i]
        const b0 = verts[(i + 1) % 6]
        const ex = b0.x - a0.x
        const ey = b0.y - a0.y
        const len = Math.hypot(ex, ey)
        if (len < 1e-6) continue
        const startT = doorCorners.has(i) ? MINING_DOOR_TRIM / len : 0
        const endT = doorCorners.has((i + 1) % 6) ? 1 - MINING_DOOR_TRIM / len : 1
        if (startT >= endT - 1e-6) continue
        const ax = a0.x + ex * startT
        const ay = a0.y + ey * startT
        const bx = a0.x + ex * endT
        const by = a0.y + ey * endT

        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.stroke()

        segs.push({ ax, ay, bx, by, edge: i })
      }

      return segs
    }

    const outer = poly(R, 6, baseAng)

    // Opaque base panels (match background) so stars don't show through the base.
    ctx.save()
    ctx.globalAlpha = 1
    ctx.shadowBlur = 0
    ctx.shadowColor = 'rgba(0, 0, 0, 0)'
    ctx.fillStyle = '#0a0a0a'
    ctx.beginPath()
    ctx.moveTo(outer[0].x, outer[0].y)
    for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    const outerSegs = drawHexWithDoorGaps(outer)

    // Extend short lines inward from segment endpoints (about 1/5 to center).
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.lineWidth = 1.6
    for (const s of outerSegs) {
      const ax2 = s.ax + (cx - s.ax) * 0.2
      const ay2 = s.ay + (cy - s.ay) * 0.2
      const bx2 = s.bx + (cx - s.bx) * 0.2
      const by2 = s.by + (cy - s.by) * 0.2

      // Second interior layer
      const innerFrac = 0.12
      const ax3 = ax2 + (cx - ax2) * innerFrac
      const ay3 = ay2 + (cy - ay2) * innerFrac
      const bx3 = bx2 + (cx - bx2) * innerFrac
      const by3 = by2 + (cy - by2) * innerFrac

      // Third interior layer
      const innerFrac2 = 0.08
      const ax4 = ax3 + (cx - ax3) * innerFrac2
      const ay4 = ay3 + (cy - ay3) * innerFrac2
      const bx4 = bx3 + (cx - bx3) * innerFrac2
      const by4 = by3 + (cy - by3) * innerFrac2

      // Inward extensions.
      ctx.beginPath()
      ctx.moveTo(s.ax, s.ay)
      ctx.lineTo(ax2, ay2)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(s.bx, s.by)
      ctx.lineTo(bx2, by2)
      ctx.stroke()

      // Connect inner endpoints
      ctx.beginPath()
      ctx.moveTo(ax2, ay2)
      ctx.lineTo(bx2, by2)
      ctx.stroke()

      // Repeat from the interior segment ends toward center
      ctx.save()
      ctx.globalAlpha = 0.42
      ctx.lineWidth = 1.2

      ctx.beginPath()
      ctx.moveTo(ax2, ay2)
      ctx.lineTo(ax3, ay3)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(bx2, by2)
      ctx.lineTo(bx3, by3)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(ax3, ay3)
      ctx.lineTo(bx3, by3)
      ctx.stroke()

      ctx.restore()

      // Repeat one more time
      ctx.save()
      ctx.globalAlpha = 0.32
      ctx.lineWidth = 1

      ctx.beginPath()
      ctx.moveTo(ax3, ay3)
      ctx.lineTo(ax4, ay4)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(bx3, by3)
      ctx.lineTo(bx4, by4)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(ax4, ay4)
      ctx.lineTo(bx4, by4)
      ctx.stroke()

      ctx.restore()

      const isArmPanel = s.edge === 0 || s.edge === 2 || s.edge === 4
      const isNeighborPanel = s.edge === 1 || s.edge === 3 || s.edge === 5
      if (isArmPanel || isNeighborPanel) {
        const sx = s.bx - s.ax
        const sy = s.by - s.ay
        const sl = Math.hypot(sx, sy)
        if (sl > 1e-6) {
          const tx = sx / sl
          const ty = sy / sl

          const alongSign = isArmPanel ? 1 : -1
          const t = isArmPanel ? 0.42 : 0.58
          const inset = 8
          const p0x = s.ax + sx * t
          const p0y = s.ay + sy * t
          const rx0 = cx - p0x
          const ry0 = cy - p0y
          const rl = Math.hypot(rx0, ry0)
          if (rl < 1e-6) continue
          const rx = rx0 / rl
          const ry = ry0 / rl

          const px = p0x + rx * inset
          const py = p0y + ry * inset

          const raySegHitT = (
            ox: number,
            oy: number,
            dx: number,
            dy: number,
            ax: number,
            ay: number,
            bx: number,
            by: number,
          ) => {
            const sx2 = bx - ax
            const sy2 = by - ay
            const denom = dx * sy2 - dy * sx2
            if (Math.abs(denom) < 1e-6) return null
            const qpx = ax - ox
            const qpy = ay - oy
            const tRay = (qpx * sy2 - qpy * sx2) / denom
            const uSeg = (qpx * dy - qpy * dx) / denom
            if (tRay > 1e-3 && uSeg >= 0 && uSeg <= 1) return tRay
            return null
          }

          const rayHitNth = (
            ox: number,
            oy: number,
            dx: number,
            dy: number,
            segs: Array<[number, number, number, number]>,
            n: number,
          ) => {
            const hits: number[] = []
            for (const seg of segs) {
              const tHit = raySegHitT(ox, oy, dx, dy, seg[0], seg[1], seg[2], seg[3])
              if (tHit == null) continue
              hits.push(tHit)
            }
            if (hits.length === 0) return null
            hits.sort((a, b) => a - b)
            return hits[Math.min(n, hits.length - 1)]
          }

          ctx.save()
          ctx.globalAlpha = 0.45
          ctx.lineWidth = 1.3

          const tdx = tx * alongSign
          const tdy = ty * alongSign
          const useB = alongSign > 0
          const tangentTargets: Array<[number, number, number, number]> = useB
            ? [
                [s.bx, s.by, bx2, by2],
                [bx2, by2, bx3, by3],
                [bx3, by3, bx4, by4],
              ]
            : [
                [s.ax, s.ay, ax2, ay2],
                [ax2, ay2, ax3, ay3],
                [ax3, ay3, ax4, ay4],
              ]
          const alongT = rayHitNth(px, py, tdx, tdy, tangentTargets, 1)

          const radialTargets: Array<[number, number, number, number]> = [
            [ax2, ay2, bx2, by2],
            [ax3, ay3, bx3, by3],
            [ax4, ay4, bx4, by4],
          ]
          const upT = rayHitNth(px, py, rx, ry, radialTargets, 1)

          const along = (alongT ?? 10) * 0.98
          const up = (upT ?? 7) * 0.98
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + tdx * along, py + tdy * along)
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + rx * up, py + ry * up)
          ctx.stroke()

          ctx.restore()
        }
      }
    }
    ctx.restore()

    ctx.restore()

    // Draw base guns as simple dots
    {
      const gunRadius = MINING_BASE_RADIUS * 0.63
      const gunAngles = [baseAng + 0, baseAng + (2 * Math.PI) / 3, baseAng + (4 * Math.PI) / 3]
      ctx.save()
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (let gi = 0; gi < 3; gi++) {
        const gx = cx + Math.cos(gunAngles[gi]) * gunRadius
        const gy = cy + Math.sin(gunAngles[gi]) * gunRadius
        ctx.beginPath()
        ctx.arc(gx, gy, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  // Draw Attractor Beam UI
  if (gameState !== 'menu') {
    const cx = width / 2
    const cy = height / 2
    const hexRadius = 20

    ctx.save()
    ctx.strokeStyle = 'rgba(0, 136, 255, 0.8)'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(0, 136, 255, 0.15)'

    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const x = cx + Math.cos(a) * hexRadius
      const y = cy + Math.sin(a) * hexRadius
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.fill()

    ctx.fillStyle = attractorActive ? 'rgba(0, 136, 255, 1)' : 'rgba(255, 255, 255, 0.6)'
    ctx.font = '20px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(Math.ceil(attractorTimer).toString(), cx, cy + 2)
    ctx.restore()

    if (attractorActive && attractorTimer > 0) {
      const baseAng = miningBaseAngleRef.current
      const attractorRange = MINING_BASE_RADIUS * 2.5
      const doorVertices = [1, 3, 5]
      const fanAngleSpread = Math.PI / 5

      ctx.save()
      const pulsePhase = ((Date.now() / 1000) / 3) % 1

      for (const vertIdx of doorVertices) {
        const gateAngle = baseAng + (vertIdx / 6) * Math.PI * 2
        const arcStartAngle = gateAngle - fanAngleSpread / 2
        const arcEndAngle = gateAngle + fanAngleSpread / 2

        const gradient = ctx.createRadialGradient(cx, cy, MINING_BASE_RADIUS, cx, cy, attractorRange)
        gradient.addColorStop(0, 'rgba(0, 136, 255, 0.25)')
        gradient.addColorStop(1, 'rgba(0, 136, 255, 0.02)')

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, attractorRange, arcStartAngle, arcEndAngle)
        ctx.closePath()
        ctx.fill()

        for (let waveIdx = 0; waveIdx < 4; waveIdx++) {
          const waveT = (pulsePhase + waveIdx * 0.25) % 1
          const waveRadius = attractorRange * (1 - waveT)
          const progress = waveT
          const alpha = 0.15 + progress * 0.6
          const lineWidth = 1.5 + progress * 2.5
          ctx.strokeStyle = `rgba(0, 136, 255, ${alpha})`
          ctx.lineWidth = lineWidth
          ctx.beginPath()
          ctx.arc(cx, cy, waveRadius, arcStartAngle, arcEndAngle)
          ctx.stroke()
        }
      }

      ctx.restore()
    }

    // Draw force field barriers over doors when attractor is active
    if (attractorActive && attractorTimer > 0) {
      ctx.save()
      const baseAng = miningBaseAngleRef.current
      const doorVertices = [1, 3, 5]

      const verts: Vector2[] = []
      for (let i = 0; i < 6; i++) {
        const a = baseAng + (i / 6) * Math.PI * 2
        verts.push({ x: cx + Math.cos(a) * MINING_BASE_RADIUS, y: cy + Math.sin(a) * MINING_BASE_RADIUS })
      }

      for (const vertIdx of doorVertices) {
        const prevEdgeIdx = (vertIdx - 1 + 6) % 6

        const prevStart = verts[prevEdgeIdx]
        const prevEnd = verts[vertIdx]
        const prevDx = prevEnd.x - prevStart.x
        const prevDy = prevEnd.y - prevStart.y
        const prevLen = Math.hypot(prevDx, prevDy)

        const door1x = prevStart.x + prevDx * (1 - MINING_DOOR_TRIM / prevLen)
        const door1y = prevStart.y + prevDy * (1 - MINING_DOOR_TRIM / prevLen)

        const nextStart = verts[vertIdx]
        const nextEnd = verts[(vertIdx + 1) % 6]
        const nextDx = nextEnd.x - nextStart.x
        const nextDy = nextEnd.y - nextStart.y
        const nextLen = Math.hypot(nextDx, nextDy)

        const door2x = nextStart.x + nextDx * (MINING_DOOR_TRIM / nextLen)
        const door2y = nextStart.y + nextDy * (MINING_DOOR_TRIM / nextLen)

        const shimmer = Math.sin(Date.now() * 0.008 + vertIdx) * 0.2 + 0.8
        const gradient = ctx.createLinearGradient(door1x, door1y, door2x, door2y)
        gradient.addColorStop(0, `rgba(0, 136, 255, ${0.3 * shimmer})`)
        gradient.addColorStop(0.5, `rgba(100, 200, 255, ${0.7 * shimmer})`)
        gradient.addColorStop(1, `rgba(0, 136, 255, ${0.3 * shimmer})`)

        ctx.strokeStyle = gradient
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(door1x, door1y)
        ctx.lineTo(door2x, door2y)
        ctx.stroke()

        ctx.strokeStyle = `rgba(100, 200, 255, ${0.3 * shimmer})`
        ctx.lineWidth = 10
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.moveTo(door1x, door1y)
        ctx.lineTo(door2x, door2y)
        ctx.stroke()
        ctx.globalAlpha = 1

        for (let i = 0; i < 4; i++) {
          const t = ((Date.now() / 600 + i * 0.25 + vertIdx * 0.2) % 1)
          const px = door1x + (door2x - door1x) * t
          const py = door1y + (door2y - door1y) * t
          const particleAlpha = Math.sin(t * Math.PI) * 0.8

          ctx.fillStyle = `rgba(150, 220, 255, ${particleAlpha})`
          ctx.beginPath()
          ctx.arc(px, py, 3, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.restore()
    }
  }

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

    ctx.save()
    ctx.translate(rock.pos.x, rock.pos.y)

    {
      ctx.save()
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      ctx.shadowColor = 'rgba(0, 0, 0, 0)'
      ctx.fillStyle = '#0a0a0a'

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

    ctx.shadowBlur = isBlue ? 10 : 0
    ctx.shadowColor = isBlue ? 'rgba(40, 170, 255, 0.45)' : 'rgba(0, 0, 0, 0)'
    ctx.strokeStyle = isBlue ? 'rgba(40, 170, 255, 0.95)' : 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.4
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
    ctx.restore()
  })

  // Draw bullets
  bulletsRef.current.forEach((bullet) => {
    ctx.fillStyle = bullet.isEnemy ? '#ff4444' : '#00ff88'
    ctx.beginPath()
    ctx.arc(bullet.pos.x, bullet.pos.y, 2, 0, Math.PI * 2)
    ctx.fill()
  })

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

    const drawToroidalWavy = (ax: number, ay: number, bx: number, by: number, draw: (ax2: number, ay2: number, bx2: number, by2: number) => void) => {
      const dx = bx - ax
      const dy = by - ay
      let ox = 0
      let oy = 0
      if (dx > width / 2) ox = -width
      else if (dx < -width / 2) ox = width
      if (dy > height / 2) oy = -height
      else if (dy < -height / 2) oy = height

      draw(ax, ay, bx + ox, by + oy)
      if (ox !== 0 || oy !== 0) draw(ax - ox, ay - oy, bx, by)
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
    drawToroidalWavy(beam.start.x, beam.start.y, beam.end.x, beam.end.y, (ax, ay, bx, by) => {
      drawWavyGradientStroke(ax, ay, bx, by, '40, 170, 255', 0.14 * a, 0.0, 12, 2.2, 2.2, 0.3)
    })

    // Core
    ctx.shadowBlur = 22
    ctx.shadowColor = `rgba(40, 170, 255, ${0.5 * a})`
    drawToroidalWavy(beam.start.x, beam.start.y, beam.end.x, beam.end.y, (ax, ay, bx, by) => {
      drawWavyGradientStroke(ax, ay, bx, by, '40, 170, 255', 0.92 * a, 0.05, 3.8, 1.6, 2.8, 1.1)
    })

    // White-hot center
    ctx.shadowBlur = 0
    drawToroidalWavy(beam.start.x, beam.start.y, beam.end.x, beam.end.y, (ax, ay, bx, by) => {
      drawWavyGradientStroke(ax, ay, bx, by, '255,255,255', 0.7 * a, 0.0, 1.5, 0.9, 3.2, 2.7)
    })

    ctx.restore()
  }

  // Phaser particles (player)
  if (gameState === 'playing' && phaserParticlesRef.current.length > 0) {
    const { width: w2, height: h2 } = canvasSizeRef.current
    for (const p of phaserParticlesRef.current) {
      const a = clamp(p.life / 280, 0, 1)
      ctx.save()
      ctx.globalAlpha = 1
      ctx.shadowBlur = 10
      ctx.shadowColor = `rgba(40, 170, 255, ${0.55 * a})`
      ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`
      for (const ox of [-w2, 0, w2]) {
        for (const oy of [-h2, 0, h2]) {
          ctx.beginPath()
          ctx.arc(p.pos.x + ox, p.pos.y + oy, 1.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
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

  // Draw harpoon + tether (wrap-aware)
  const hp = harpoonRef.current
  if (hp.state !== 'idle' && gameState === 'playing') {
    const { width: w2, height: h2 } = canvasSizeRef.current
    const ship = shipRef.current

    const drawToroidalLine = (ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax
      const dy = by - ay
      let ox = 0
      let oy = 0
      if (dx > w2 / 2) ox = -w2
      else if (dx < -w2 / 2) ox = w2
      if (dy > h2 / 2) oy = -h2
      else if (dy < -h2 / 2) oy = h2

      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx + ox, by + oy)
      ctx.stroke()

      if (ox !== 0 || oy !== 0) {
        ctx.beginPath()
        ctx.moveTo(ax - ox, ay - oy)
        ctx.lineTo(bx, by)
        ctx.stroke()
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 1.6

    if (hp.state === 'attached') {
      const pts: Vector2[] = [ship.pos, ...hp.rope, hp.rock.pos]
      for (let i = 0; i < pts.length - 1; i++) {
        drawToroidalLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(hp.rock.pos.x, hp.rock.pos.y, 3, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const pts: Vector2[] = [ship.pos, ...hp.rope, hp.pos]
      for (let i = 0; i < pts.length - 1; i++) {
        drawToroidalLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
      }

      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(hp.pos.x, hp.pos.y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Draw ship
  if (gameState === 'playing' || gameState === 'store' || gameState === 'menu') {
    const ship = shipRef.current

    let isHealing = false

    // Powerup activation pulses (visible)
    {
      const now = Date.now()
      const durationMs = 520
      powerPulsesRef.current = powerPulsesRef.current.filter((p) => now - p.at < durationMs)

      if (powerPulsesRef.current.length > 0) {
        const drawWrappedRing = (cx: number, cy: number, r: number) => {
          for (const ox of [-width, 0, width]) {
            for (const oy of [-height, 0, height]) {
              ctx.beginPath()
              ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2)
              ctx.stroke()
            }
          }
        }

        for (const p of powerPulsesRef.current) {
          const t = clamp((now - p.at) / durationMs, 0, 1)
          const r = ship.radius + 12 + t * 360
          const a = (1 - t) * 0.75

          ctx.save()
          ctx.globalAlpha = 1
          ctx.lineWidth = 3.2 - 1.8 * t
          if (p.kind === 'stasis') {
            ctx.strokeStyle = `rgba(0,255,136,${a})`
            ctx.shadowColor = `rgba(0,255,136,${0.55 * a})`
          } else {
            ctx.strokeStyle = `rgba(255,68,68,${a})`
            ctx.shadowColor = `rgba(255,68,68,${0.55 * a})`
          }
          ctx.shadowBlur = 18
          drawWrappedRing(ship.pos.x, ship.pos.y, r)
          ctx.restore()
        }
      }
    }

    // Healing halo
    {
      const baseX = width / 2
      const baseY = height / 2
      const baseAng = miningBaseAngleRef.current
      const hexVerts: Vector2[] = Array.from({ length: 6 }, (_, i) => {
        const a = baseAng + (i / 6) * Math.PI * 2
        return { x: Math.cos(a) * MINING_BASE_RADIUS, y: Math.sin(a) * MINING_BASE_RADIUS }
      })

      const circleFullyInHexLocal = (px: number, py: number, radius: number) => {
        for (let i = 0; i < 6; i++) {
          const a = hexVerts[i]
          const b = hexVerts[(i + 1) % 6]
          const ex = b.x - a.x
          const ey = b.y - a.y
          const len = Math.hypot(ex, ey)
          if (len < 1e-6) continue
          const nx = -ey / len
          const ny = ex / len
          const dist = (px - a.x) * nx + (py - a.y) * ny
          if (dist < radius) return false
        }
        return true
      }

      const d = toroidalDelta(baseX, baseY, ship.pos.x, ship.pos.y, width, height)
      const fullyInside = circleFullyInHexLocal(d.dx, d.dy, ship.radius)
      isHealing =
        fullyInside &&
        shieldsRef.current < 2 &&
        shipRepairTimeRef.current > 0 &&
        shipRepairTimeRef.current < 2
    }

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

      const healT = clamp(shipRepairTimeRef.current / 2, 0, 1)
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
      const shieldFrac = clamp(shields / 2, 0, 1)
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
      const shieldLow = shields < 2
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

  // Subtle scanline haze
  ctx.save()
  ctx.globalAlpha = 0.06
  ctx.fillStyle = '#00ff88'
  const scanY = ((Date.now() / 1000) * 60) % 12
  for (let y = -12; y < height + 12; y += 12) {
    ctx.fillRect(0, y + scanY, width, 1)
  }
  ctx.restore()
}
