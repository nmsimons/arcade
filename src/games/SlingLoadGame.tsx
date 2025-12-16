import { useCallback, useEffect, useRef, useState } from 'react'

type SlingLoadGameProps = {
  onExit: () => void
}

type Vector2 = { x: number; y: number }

type Helicopter = {
  pos: Vector2
  vel: Vector2
  radius: number
  rotor: number
  hitFlashMs: number
  yaw: number
  pitch: number
}

type Crate = {
  pos: Vector2
  vel: Vector2
  radius: number
  attached: boolean
  delivered: boolean
}

type Pad = {
  x: number
  width: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function SlingLoadGame({ onExit }: SlingLoadGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'paused' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [deliveries, setDeliveries] = useState(0)
  const [menuIndex, setMenuIndex] = useState(0)
  const [gameOverIndex, setGameOverIndex] = useState(0)

  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)
  const canvasSizeRef = useRef({ width: 800, height: 600 })

  const worldWidthRef = useRef(4200)
  const cameraXRef = useRef(0)

  const heliRef = useRef<Helicopter>({
    pos: { x: 300, y: 200 },
    vel: { x: 0, y: 0 },
    radius: 16,
    rotor: 0,
    hitFlashMs: 0,
    yaw: 0,
    pitch: 0,
  })

  const ropeLengthRef = useRef(110)
  const crateRef = useRef<Crate>({
    pos: { x: 1200, y: 0 },
    vel: { x: 0, y: 0 },
    radius: 14,
    attached: false,
    delivered: false,
  })

  const padRef = useRef<Pad>({ x: 420, width: 140 })

  const hookRangeRef = useRef(80)

  const getHookPoint = useCallback((heli: Helicopter) => {
    const offY = heli.radius * 0.9
    const yawSign = heli.yaw >= 0 ? 1 : -1
    const yawAbs = Math.abs(heli.yaw)
    // When yaw is near 0 (front-facing), we intentionally squash X so that the left/right mirror flip is visually smooth.
    const yawScaleMag = 0.35 + 0.65 * smoothstep(0.08, 0.55, yawAbs)
    const sx = yawSign * yawScaleMag

    // Apply the same transform order as drawing: scaleX, then pitch rotation.
    const c = Math.cos(heli.pitch)
    const s = Math.sin(heli.pitch)

    // Start from local offset (0, offY)
    // After pitch rotation: (x, y) = (-offY*sin, offY*cos)
    // After scaleX: x *= sx
    const localX = (-offY * s) * sx
    const localY = offY * c

    return { x: heli.pos.x + localX, y: heli.pos.y + localY }
  }, [])

  const groundHeightAt = useCallback((x: number) => {
    // A smooth height field made from a few sine waves (fast + deterministic).
    const base = 0.78
    const h1 = Math.sin(x * 0.004) * 0.03
    const h2 = Math.sin(x * 0.011 + 1.7) * 0.02
    const h3 = Math.sin(x * 0.023 + 0.4) * 0.01
    const n = base + h1 + h2 + h3
    const { height } = canvasSizeRef.current
    return height * n
  }, [])

  const resetWorld = useCallback(() => {
    const { height } = canvasSizeRef.current
    const heli = heliRef.current
    heli.pos = { x: 320, y: height * 0.35 }
    heli.vel = { x: 0, y: 0 }
    heli.hitFlashMs = 0

    const crate = crateRef.current
    crate.attached = false
    crate.delivered = false
    crate.vel = { x: 0, y: 0 }
    crate.pos = { x: 1100, y: groundHeightAt(1100) - crate.radius }

    ropeLengthRef.current = 110
    cameraXRef.current = 0
  }, [groundHeightAt])

  const startGame = useCallback(() => {
    setScore(0)
    setLives(3)
    setDeliveries(0)
    resetWorld()
    setGameState('playing')
  }, [resetWorld])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase())

      // Pause
      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'playing') {
        setGameState('paused')
        return
      }
      if ((e.key === 'p' || e.key === 'Escape') && gameState === 'paused') {
        setGameState('playing')
        return
      }

      // Menu navigation
      if (gameState === 'menu') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setMenuIndex((i) => (i > 0 ? i - 1 : 1))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setMenuIndex((i) => (i < 1 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (menuIndex === 0) startGame()
          else onExit()
        }
        return
      }

      // Game Over navigation
      if (gameState === 'gameOver') {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
          e.preventDefault()
          setGameOverIndex((i) => (i > 0 ? i - 1 : 2))
        }
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') {
          e.preventDefault()
          setGameOverIndex((i) => (i < 2 ? i + 1 : 0))
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (gameOverIndex === 0) startGame()
          else if (gameOverIndex === 1) setGameState('menu')
          else onExit()
        }
        return
      }

      // Sling attach / release
      if (gameState === 'playing' && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault()
        if (e.repeat) return
        const heli = heliRef.current
        const crate = crateRef.current
        if (crate.delivered) return

        if (crate.attached) {
          crate.attached = false
          // Give a tiny separation impulse so it doesn't immediately reattach.
          crate.vel.x += heli.vel.x * 0.1
          crate.vel.y += heli.vel.y * 0.1
        } else {
          const hook = getHookPoint(heli)
          const dx = crate.pos.x - hook.x
          const dy = crate.pos.y - hook.y
          const d = Math.hypot(dx, dy)
          const hookRange = hookRangeRef.current
          if (d < hookRange) {
            crate.attached = true
          }
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase())
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [gameState, menuIndex, gameOverIndex, startGame, onExit, getHookPoint])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      canvasSizeRef.current = { width: canvas.width, height: canvas.height }

      // Keep world scale roughly comparable across screens.
      worldWidthRef.current = Math.max(2600, Math.floor(canvas.width * 5.5))
      // Place pad near the start.
      padRef.current = { x: Math.max(380, canvas.width * 0.45), width: 160 }
    }

    resize()
    window.addEventListener('resize', resize)

    const killPlayer = () => {
      if (gameState !== 'playing') return
      setLives((l) => {
        const nl = l - 1
        if (nl <= 0) {
          setTimeout(() => setGameState('gameOver'), 350)
        } else {
          // Soft reset position without resetting score.
          const { height } = canvasSizeRef.current
          heliRef.current.pos = { x: padRef.current.x, y: height * 0.35 }
          heliRef.current.vel = { x: 0, y: 0 }
          crateRef.current.attached = false
        }
        return nl
      })
    }

    const update = (dt: number) => {
      if (gameState !== 'playing') return

      const { width, height } = canvasSizeRef.current
      const worldWidth = worldWidthRef.current
      const heli = heliRef.current
      const crate = crateRef.current

      heli.hitFlashMs = Math.max(0, heli.hitFlashMs - dt * 1000)

      // Controls (arcade thrust model)
      const thrust = 520
      const drag = 0.985

      const left = keysRef.current.has('arrowleft') || keysRef.current.has('a')
      const right = keysRef.current.has('arrowright') || keysRef.current.has('d')
      const up = keysRef.current.has('arrowup') || keysRef.current.has('w')
      const down = keysRef.current.has('arrowdown') || keysRef.current.has('s')
      const stabilize = keysRef.current.has('shift')

      if (left) heli.vel.x -= thrust * dt
      if (right) heli.vel.x += thrust * dt
      if (up) heli.vel.y -= thrust * dt
      if (down) heli.vel.y += thrust * dt

      // 3D-ish yaw + pitch:
      // - yaw: smoothly transitions between left (-1), front (0), right (+1)
      // - pitch: nose-down tilt in the direction of travel (never upside down)
      const vx = heli.vel.x
      const vxAbs = Math.abs(vx)
      const yawDeadzone = 18
      const yawTarget = vxAbs < yawDeadzone ? 0 : vx > 0 ? 1 : -1
      const yawT = 1 - Math.exp(-7 * dt)
      heli.yaw += (yawTarget - heli.yaw) * yawT

      const maxPitch = 0.28 // ~16 degrees
      const pitchTarget = maxPitch * smoothstep(0, 260, vxAbs)
      const pitchT = 1 - Math.exp(-8 * dt)
      heli.pitch += (pitchTarget - heli.pitch) * pitchT

      // The helicopter should not auto-descend unless it's carrying a load.
      // If the attached load is still resting on the ground, it shouldn't pull the chopper down.
      const groundUnderCrate = groundHeightAt(crate.pos.x)
      const crateOnGround = crate.attached && !crate.delivered && crate.pos.y + crate.radius >= groundUnderCrate - 0.5
      const isLoaded = crate.attached && !crate.delivered && !crateOnGround
      if (isLoaded) heli.vel.y += 220 * dt

      const maxSpeed = 420
      const speed = Math.hypot(heli.vel.x, heli.vel.y)
      if (speed > maxSpeed) {
        heli.vel.x = (heli.vel.x / speed) * maxSpeed
        heli.vel.y = (heli.vel.y / speed) * maxSpeed
      }

      const d = stabilize ? 0.94 : drag
      heli.vel.x *= d
      heli.vel.y *= d

      heli.pos.x += heli.vel.x * dt
      heli.pos.y += heli.vel.y * dt

      heli.pos.x = clamp(heli.pos.x, 0, worldWidth)
      heli.pos.y = clamp(heli.pos.y, 30, height - 30)

      // Rotor animation
      heli.rotor += dt * (8 + clamp(Math.hypot(heli.vel.x, heli.vel.y) / 60, 0, 8))

      // Crate physics
      const crateDrag = stabilize ? 0.965 : 0.988
      crate.vel.y += 300 * dt
      crate.vel.x *= crateDrag
      crate.vel.y *= crateDrag
      crate.pos.x += crate.vel.x * dt
      crate.pos.y += crate.vel.y * dt

      // Sling constraint (only max distance, slack allowed)
      if (crate.attached && !crate.delivered) {
        const hook = getHookPoint(heli)
        const dx = crate.pos.x - hook.x
        const dy = crate.pos.y - hook.y
        const dist = Math.hypot(dx, dy)
        const L = ropeLengthRef.current

        if (dist > L && dist > 0.0001) {
          const nx = dx / dist
          const ny = dy / dist

          // Project position to rope circle
          crate.pos.x = hook.x + nx * L
          crate.pos.y = hook.y + ny * L

          // Remove outward velocity component (prevents energy blow-up)
          const relVx = crate.vel.x - heli.vel.x
          const relVy = crate.vel.y - heli.vel.y
          const outward = relVx * nx + relVy * ny
          if (outward > 0) {
            crate.vel.x -= outward * nx
            crate.vel.y -= outward * ny
          }

          // Add some tension damping
          crate.vel.x = crate.vel.x * 0.995 + heli.vel.x * 0.005
          crate.vel.y = crate.vel.y * 0.995 + heli.vel.y * 0.005
        }
      }

      // Ground collisions
      const groundHHeli = groundHeightAt(heli.pos.x)
      const heliBottom = heli.pos.y + heli.radius
      if (heliBottom > groundHHeli) {
        const impact = Math.hypot(heli.vel.x, heli.vel.y)
        heli.pos.y = groundHHeli - heli.radius
        heli.vel.y *= -0.15
        heli.vel.x *= 0.6
        heli.hitFlashMs = 150
        if (impact > 220) {
          killPlayer()
        }
      }

      const groundHCrate = groundHeightAt(crate.pos.x)
      const crateBottom = crate.pos.y + crate.radius
      if (crateBottom > groundHCrate) {
        const impact = Math.abs(crate.vel.y)
        crate.pos.y = groundHCrate - crate.radius
        crate.vel.y = 0
        crate.vel.x *= 0.86

        // Delivery check (crate must be on pad and not slammed)
        const pad = padRef.current
        const onPad = crate.pos.x >= pad.x - pad.width / 2 && crate.pos.x <= pad.x + pad.width / 2
        if (!crate.delivered && onPad && impact < 140 && !crate.attached) {
          crate.delivered = true
          setDeliveries((d) => d + 1)
          setScore((s) => s + 500)

          // Spawn a new crate further out.
          const spawnX = clamp(pad.x + 900 + Math.random() * 2200, 600, worldWidth - 200)
          setTimeout(() => {
            const c = crateRef.current
            c.delivered = false
            c.attached = false
            c.vel = { x: 0, y: 0 }
            c.pos = { x: spawnX, y: groundHeightAt(spawnX) - c.radius }
          }, 500)
        }

      }

      // Camera follows heli
      const camTarget = clamp(heli.pos.x - width * 0.45, 0, worldWidth - width)
      cameraXRef.current += (camTarget - cameraXRef.current) * (1 - Math.pow(0.001, dt))
    }

    const drawGround = (ctx2: CanvasRenderingContext2D) => {
      const { width, height } = canvasSizeRef.current
      const camX = cameraXRef.current

      ctx2.strokeStyle = '#00ff88'
      ctx2.lineWidth = 2
      ctx2.beginPath()

      const step = 18
      for (let sx = 0; sx <= width + step; sx += step) {
        const wx = camX + sx
        const gy = groundHeightAt(wx)
        if (sx === 0) ctx2.moveTo(sx, gy)
        else ctx2.lineTo(sx, gy)
      }
      ctx2.stroke()

      // Fill below ground as a dark mass
      ctx2.fillStyle = 'rgba(0, 255, 136, 0.06)'
      ctx2.beginPath()
      ctx2.moveTo(0, height)
      for (let sx = 0; sx <= width + step; sx += step) {
        const wx = camX + sx
        const gy = groundHeightAt(wx)
        ctx2.lineTo(sx, gy)
      }
      ctx2.lineTo(width, height)
      ctx2.closePath()
      ctx2.fill()
    }

    const draw = () => {
      const { width, height } = canvasSizeRef.current
      const camX = cameraXRef.current

      // Clear
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)

      // Scanline haze
      ctx.save()
      ctx.globalAlpha = 0.06
      ctx.fillStyle = '#00ff88'
      const scanY = ((Date.now() / 1000) * 60) % 12
      for (let y = -12; y < height + 12; y += 12) {
        ctx.fillRect(0, y + scanY, width, 1)
      }
      ctx.restore()

      // World transform
      ctx.save()
      ctx.translate(-camX, 0)

      // Ground
      ctx.save()
      ctx.translate(camX, 0)
      drawGround(ctx)
      ctx.restore()

      // Drop pad
      const pad = padRef.current
      const padY = groundHeightAt(pad.x)
      ctx.strokeStyle = '#00ff88'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(pad.x - pad.width / 2, padY)
      ctx.lineTo(pad.x - pad.width / 2, padY - 18)
      ctx.lineTo(pad.x + pad.width / 2, padY - 18)
      ctx.lineTo(pad.x + pad.width / 2, padY)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(0,255,136,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.x - pad.width / 2 + 10, padY - 10)
      ctx.lineTo(pad.x + pad.width / 2 - 10, padY - 10)
      ctx.stroke()

      // Rope + crate
      const heli = heliRef.current
      const crate = crateRef.current
      const hook = getHookPoint(heli)

      if (crate.attached) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(hook.x, hook.y)
        ctx.lineTo(crate.pos.x, crate.pos.y)
        ctx.stroke()
      }

      if (!crate.delivered) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.save()
        ctx.translate(crate.pos.x, crate.pos.y)
        ctx.beginPath()
        ctx.rect(-crate.radius, -crate.radius, crate.radius * 2, crate.radius * 2)
        ctx.stroke()
        ctx.restore()

        // Hook hint ring
        const dx = crate.pos.x - hook.x
        const dy = crate.pos.y - hook.y
        const dist = Math.hypot(dx, dy)
        const hookRange = hookRangeRef.current
        if (!crate.attached && dist < hookRange) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(crate.pos.x, crate.pos.y, 30, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // ========== 3D Helicopter Rendering ==========
      // 3D point type: [x, y, z] where +X is forward, +Y is down, +Z is right (viewer's left)
      type V3 = [number, number, number]

      // Rotate around Y axis (yaw: turning left/right heading)
      const rotY = (p: V3, angle: number): V3 => {
        const c = Math.cos(angle), s = Math.sin(angle)
        return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
      }
      // Rotate around Z axis (pitch: nose tips down toward ground)
      const rotZ = (p: V3, angle: number): V3 => {
        const c = Math.cos(angle), s = Math.sin(angle)
        return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]
      }
      // Project 3D to 2D (side view: Z->screen X, Y->screen Y)
      const proj = (p: V3): [number, number] => [p[2], p[1]]

      // Helicopter 3D model (scale factor)
      const S3 = 1.6

      // 3D polylines: each line is array of [x,y,z] points
      // Fuselage (box-ish shape)
      const fuselage: V3[] = [
        [14, -4, 0], [16, 0, 0], [14, 6, 0], [4, 8, 0], [-8, 8, 0],
        [-12, 4, 0], [-12, -4, 0], [-6, -6, 0], [8, -6, 0], [14, -4, 0]
      ]
      // Tail boom
      const tailBoom: V3[] = [[-12, 0, 0], [-38, 0, 0]]
      // Tail fin
      const tailFin: V3[] = [[-38, 0, 0], [-42, -8, 0], [-38, -2, 0]]
      // Tail rotor (spinning in XY plane, axis along Z - perpendicular to fuselage side)
      const tailRotorRadius = 7
      const tailRotorAngle = heli.rotor * 3  // Spin faster than main rotor
      const tailRotorCenterX = -40
      const tailRotorCenterY = -3
      const tailRotor: V3[] = [
        [tailRotorCenterX + Math.cos(tailRotorAngle) * tailRotorRadius, tailRotorCenterY + Math.sin(tailRotorAngle) * tailRotorRadius, 0],
        [tailRotorCenterX - Math.cos(tailRotorAngle) * tailRotorRadius, tailRotorCenterY - Math.sin(tailRotorAngle) * tailRotorRadius, 0]
      ]
      // Skids
      const skidL: V3[] = [[-10, 14, -4], [10, 14, -4]]
      const skidR: V3[] = [[-10, 14, 4], [10, 14, 4]]
      const strutFL: V3[] = [[-4, 8, -3], [-6, 14, -4]]
      const strutFR: V3[] = [[-4, 8, 3], [-6, 14, 4]]
      const strutBL: V3[] = [[4, 8, -3], [6, 14, -4]]
      const strutBR: V3[] = [[4, 8, 3], [6, 14, 4]]
      // Rotor mast
      const mast: V3[] = [[0, -6, 0], [0, -14, 0]]
      // Main rotor blade (spinning line in XZ plane)
      const rotorRadius = 30
      const rotorAngle = heli.rotor
      const rotorBlade: V3[] = [
        [Math.cos(rotorAngle) * rotorRadius, -14, Math.sin(rotorAngle) * rotorRadius],
        [-Math.cos(rotorAngle) * rotorRadius, -14, -Math.sin(rotorAngle) * rotorRadius]
      ]
      // Canopy (sphere cross-section circles)
      const canopyR3 = 10
      const canopyXY: V3[] = []
      const canopyXZ: V3[] = []
      const canopyYZ: V3[] = []
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2
        canopyXY.push([Math.cos(a) * canopyR3, Math.sin(a) * canopyR3, 0])
        canopyXZ.push([Math.cos(a) * canopyR3, 0, Math.sin(a) * canopyR3])
        canopyYZ.push([0, Math.cos(a) * canopyR3, Math.sin(a) * canopyR3])
      }

      // Transform and draw a 3D polyline
      // Order: pitch first (nose down), then yaw (turn left/right)
      const draw3D = (pts: V3[], yaw: number, pitch: number, stroke: string, lineWidth: number) => {
        ctx.strokeStyle = stroke
        ctx.lineWidth = lineWidth
        ctx.beginPath()
        for (let i = 0; i < pts.length; i++) {
          let p = pts[i]
          p = rotZ(p, pitch)  // Pitch: nose tips down
          p = rotY(p, yaw)    // Yaw: turn left/right
          const [sx, sy] = proj(p)
          if (i === 0) ctx.moveTo(sx * S3, sy * S3)
          else ctx.lineTo(sx * S3, sy * S3)
        }
        ctx.stroke()
      }

      // Helicopter position and orientation
      ctx.save()
      ctx.translate(heli.pos.x, heli.pos.y)

      const groundUnderCrate = groundHeightAt(crate.pos.x)
      const crateOnGround = crate.attached && !crate.delivered && crate.pos.y + crate.radius >= groundUnderCrate - 0.5
      const isLoaded = crate.attached && !crate.delivered && !crateOnGround
      const bodyStroke = heli.hitFlashMs > 0 ? '#ffffff' : '#00ff88'

      // Convert yaw (-1 to 1) to angle
      // yaw=1 means facing right, yaw=-1 means facing left, yaw=0 means facing viewer
      const yawAngle = -heli.yaw * (Math.PI / 2)  // Negate so right movement = facing right
      const pitchAngle = heli.pitch  // Positive tips nose down

      // Draw body parts
      draw3D(fuselage, yawAngle, pitchAngle, bodyStroke, 2)
      draw3D(tailBoom, yawAngle, pitchAngle, bodyStroke, 2)
      draw3D(tailFin, yawAngle, pitchAngle, bodyStroke, 2)
      draw3D(tailRotor, yawAngle, pitchAngle, 'rgba(255,255,255,0.6)', 1.5)

      // Skids
      draw3D(skidL, yawAngle, pitchAngle, bodyStroke, 1.5)
      draw3D(skidR, yawAngle, pitchAngle, bodyStroke, 1.5)
      draw3D(strutFL, yawAngle, pitchAngle, bodyStroke, 1.5)
      draw3D(strutFR, yawAngle, pitchAngle, bodyStroke, 1.5)
      draw3D(strutBL, yawAngle, pitchAngle, bodyStroke, 1.5)
      draw3D(strutBR, yawAngle, pitchAngle, bodyStroke, 1.5)

      // Rotor system
      draw3D(mast, yawAngle, pitchAngle, bodyStroke, 2)
      draw3D(rotorBlade, yawAngle, pitchAngle, 'rgba(255,255,255,0.8)', 2)

      // Canopy (3 rings to suggest a sphere)
      draw3D(canopyXY, yawAngle, pitchAngle, bodyStroke, 2)
      draw3D(canopyXZ, yawAngle, pitchAngle, 'rgba(255,255,255,0.3)', 1)
      draw3D(canopyYZ, yawAngle, pitchAngle, 'rgba(255,255,255,0.3)', 1)

      // Hook point (transformed with same rotations)
      const hookLocal: V3 = [0, heli.radius * 0.9, 0]
      let hp = rotZ(hookLocal, pitchAngle)
      hp = rotY(hp, yawAngle)
      const [hx, hy] = proj(hp)
      ctx.strokeStyle = isLoaded ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(hx * S3, hy * S3, 3, 0, Math.PI * 2)
      ctx.stroke()

      ctx.restore()

      ctx.restore() // world

      // HUD
      if (gameState === 'playing') {
        ctx.fillStyle = '#00ff88'
        ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText(`SCORE ${score.toString().padStart(6, '0')}`, 16, 28)
        ctx.fillText(`LIVES ${lives}`, 16, 48)
        ctx.fillText(`DELIVERED ${deliveries}`, 16, 68)

        // Minimal instructions
        ctx.fillStyle = 'rgba(0,255,136,0.65)'
        ctx.fillText('ARROWS/WASD: THRUST  •  SPACE: HOOK/RELEASE  •  SHIFT: STABILIZE  •  P: PAUSE', 16, height - 18)
      }

      // Pause overlay
      if (gameState === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(0, 0, width, height)
        ctx.strokeStyle = '#00ff88'
        ctx.lineWidth = 2
        ctx.strokeRect(width / 2 - 180, height / 2 - 90, 360, 180)
        ctx.fillStyle = '#00ff88'
        ctx.font = '24px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText('PAUSED', width / 2 - 54, height / 2 - 30)
        ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        ctx.fillText('Press P or Esc to resume', width / 2 - 96, height / 2 + 10)
      }
    }

    const animate = (t: number) => {
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.05)
      lastTimeRef.current = t
      update(dt)
      draw()
      rafRef.current = requestAnimationFrame(animate)
    }

    lastTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [gameState, groundHeightAt, score, lives, deliveries, getHookPoint])

  return (
    <div className="relative w-screen h-screen overflow-hidden font-mono">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-[#00ff88] bg-black p-8 max-w-md w-full">
            <h1 className="text-4xl text-[#00ff88] mb-8 text-center tracking-[0.3em] uppercase">Sling Load</h1>
            <div className="text-[#00ff88] text-sm space-y-2 mb-8 tracking-wider">
              <div className="flex items-center gap-2"><span className="text-white">›</span> Arrows / WASD: Thrust</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> Space: Hook / Release</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> Shift: Stabilize (damping)</div>
              <div className="flex items-center gap-2"><span className="text-white">›</span> P: Pause</div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  menuIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Start
              </button>
              <button
                onClick={onExit}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  menuIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}

      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-2 border-[#00ff88] bg-black p-8 max-w-md w-full">
            <h1 className="text-4xl text-[#00ff88] mb-4 text-center tracking-[0.3em] uppercase">Game Over</h1>
            <div className="text-[#00ff88] text-sm mb-8 tracking-wider text-center">
              <div>Score {score.toString().padStart(6, '0')}</div>
              <div>Delivered {deliveries}</div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={startGame}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 0
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Retry
              </button>
              <button
                onClick={() => setGameState('menu')}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 1
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Menu
              </button>
              <button
                onClick={onExit}
                className={`w-full border-2 py-3 uppercase tracking-widest transition-colors ${
                  gameOverIndex === 2
                    ? 'border-[#00ff88] bg-[#00ff88] text-black'
                    : 'border-[#00ff88] text-[#00ff88] hover:bg-[#00ff88] hover:text-black'
                }`}
              >
                Back
              </button>
            </div>
            <p className="mt-6 text-[#00ff88]/50 text-xs tracking-widest text-center">↑ ↓ to select • Enter to confirm</p>
          </div>
        </div>
      )}
    </div>
  )
}
