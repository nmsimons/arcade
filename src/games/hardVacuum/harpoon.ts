import type { Harpoon, Rock, Ship, Vector2 } from './types'

type Ref<T> = { current: T }

type ToroidalDelta = (ax: number, ay: number, bx: number, by: number, w: number, h: number) => { dx: number; dy: number }

type Wrap = (x: number) => number

type BuildRopeBetween = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ropeLen: number,
) => { rope: Vector2[]; ropePrev: Vector2[]; segLen: number }

export function updateHarpoon(args: {
  dt: number
  w: number
  h: number

  ship: Ship
  shipRef: Ref<Ship>
  rocks: Rock[]

  harpoonRef: Ref<Harpoon>

  wrapX: Wrap
  wrapY: Wrap
  toroidalDelta: ToroidalDelta
  buildRopeBetween: BuildRopeBetween

  HARPOON_HOOK_MASS: number
  HARPOON_VISUAL_SLACK: number
  HARPOON_REEL_MIN_LEN: number
}) {
  const {
    dt,
    w,
    h,
    ship,
    shipRef,
    rocks,
    harpoonRef,
    wrapX,
    wrapY,
    toroidalDelta,
    buildRopeBetween,
    HARPOON_HOOK_MASS,
    HARPOON_VISUAL_SLACK,
    HARPOON_REEL_MIN_LEN,
  } = args

  // Harpoon update (wrap-aware)
  const hp0 = harpoonRef.current
  if (hp0.state === 'flying') {
    hp0.pos.x = wrapX(hp0.pos.x + hp0.vel.x * dt)
    hp0.pos.y = wrapY(hp0.pos.y + hp0.vel.y * dt)
    hp0.life -= dt * 1000

    // Enforce the cable max length (tension-only) with hook mass.
    // Treat the hook like a tiny rock: tension affects both ship and hook.
    {
      const sh = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
      const shDist = Math.hypot(sh.dx, sh.dy)
      if (shDist > hp0.maxLength && shDist > 1e-6) {
        const nx = sh.dx / shDist
        const ny = sh.dy / shDist

        const invShip = 1
        const invHook = 1 / HARPOON_HOOK_MASS
        const invSum = invShip + invHook

        const err = shDist - hp0.maxLength
        const maxCorr = 140
        const corr = Math.min(err, maxCorr)

        ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
        ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
        hp0.pos.x = wrapX(hp0.pos.x - nx * (corr * (invHook / invSum)))
        hp0.pos.y = wrapY(hp0.pos.y - ny * (corr * (invHook / invSum)))

        const relVx = hp0.vel.x - ship.vel.x
        const relVy = hp0.vel.y - ship.vel.y
        const relAlong = relVx * nx + relVy * ny
        if (relAlong > 0) {
          const j = (-relAlong * 0.9) / invSum
          ship.vel.x -= j * nx * invShip
          ship.vel.y -= j * ny * invShip
          hp0.vel.x += j * nx * invHook
          hp0.vel.y += j * ny * invHook
        }
      }
    }

    // When it reaches full extension without latching, leave it deployed until the player reels it in.
    const sh2 = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
    const sh2Dist = Math.hypot(sh2.dx, sh2.dy)

    // Rope simulation for rendering (slack/curve) while unattached.
    // Endpoints are ship + hook; this is visual-only.
    {
      const rope = hp0.rope
      const ropePrev = hp0.ropePrev
      const segLen = hp0.segLen

      const damp = 0.992
      const dt2 = dt * dt

      for (let i = 0; i < rope.length; i++) {
        const p = rope[i]
        const pp = ropePrev[i]
        const vx = (p.x - pp.x) * damp
        const vy = (p.y - pp.y) * damp
        ropePrev[i] = { x: p.x, y: p.y }
        // No gravity in space; curvature comes from inertia + slack.
        rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy + 0 * dt2) }
      }

      const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
        const d = toroidalDelta(ax, ay, bx, by, w, h)
        const dLen = Math.hypot(d.dx, d.dy)
        if (dLen < 1e-6) return { cx: 0, cy: 0 }
        const diff = (dLen - target) / dLen
        return { cx: d.dx * diff, cy: d.dy * diff }
      }

      const iterations = 9
      for (let it = 0; it < iterations; it++) {
        // ship -> first
        if (rope.length > 0) {
          const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
          rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
        }
        // internal
        for (let i = 0; i < rope.length - 1; i++) {
          const p0 = rope[i]
          const p1 = rope[i + 1]
          const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
          rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
          rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
        }
        // last -> hook
        if (rope.length > 0) {
          const last = rope[rope.length - 1]
          const c = solvePair(last.x, last.y, hp0.pos.x, hp0.pos.y, segLen)
          rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
        }
      }
    }

    hp0.traveled += Math.hypot(hp0.vel.x, hp0.vel.y) * dt

    if (hp0.life <= 0) {
      harpoonRef.current = {
        state: 'deployed',
        pos: { x: hp0.pos.x, y: hp0.pos.y },
        vel: { x: 0, y: 0 },
        maxLength: hp0.maxLength,
        ropeLength: hp0.ropeLength,
        segLen: hp0.segLen,
        rope: hp0.rope,
        ropePrev: hp0.ropePrev,
      }
    } else {
      // Try to latch onto a rock.
      for (let i = 0; i < rocks.length; i++) {
        const a = rocks[i]
        const { dx, dy } = toroidalDelta(hp0.pos.x, hp0.pos.y, a.pos.x, a.pos.y, w, h)
        const dist = Math.hypot(dx, dy)
        if (dist < a.radius) {
          // Fixed-length cable: latch uses the full cable length.
          const ropeLen = hp0.maxLength

          // Build a segmented rope for slack visuals.
          const segments = Math.max(18, Math.min(60, Math.ceil(ropeLen / 22)))
          const segLen = ropeLen / segments
          const ship0 = shipRef.current
          const d2 = toroidalDelta(ship0.pos.x, ship0.pos.y, a.pos.x, a.pos.y, w, h)
          const rope: Vector2[] = []
          const ropePrev: Vector2[] = []
          for (let k = 1; k < segments; k++) {
            const t = k / segments
            const px = wrapX(ship0.pos.x + d2.dx * t)
            const py = wrapY(ship0.pos.y + d2.dy * t)
            rope.push({ x: px, y: py })
            ropePrev.push({ x: px, y: py })
          }

          harpoonRef.current = {
            state: 'attached',
            rock: a,
            ropeLength: ropeLen,
            maxLength: hp0.maxLength,
            segLen,
            rope,
            ropePrev,
          }
          break
        }
      }

      // If not attached and fully extended, switch to deployed.
      if (harpoonRef.current === hp0 && sh2Dist >= hp0.maxLength - 0.5) {
        harpoonRef.current = {
          state: 'deployed',
          pos: { x: hp0.pos.x, y: hp0.pos.y },
          vel: { x: 0, y: 0 },
          maxLength: hp0.maxLength,
          ropeLength: hp0.ropeLength,
          segLen: hp0.segLen,
          rope: hp0.rope,
          ropePrev: hp0.ropePrev,
        }
      }
    }
  } else if (hp0.state === 'deployed') {
    // Hook is left out in space until the player reels it in.
    hp0.pos.x = wrapX(hp0.pos.x + hp0.vel.x * dt)
    hp0.pos.y = wrapY(hp0.pos.y + hp0.vel.y * dt)

    // Mild damping for stability (feels like a small object with some drag).
    hp0.vel.x *= 0.996
    hp0.vel.y *= 0.996

    // Enforce the cable max length (tension-only) with hook mass.
    {
      const sh = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
      const shDist = Math.hypot(sh.dx, sh.dy)
      if (shDist > hp0.maxLength && shDist > 1e-6) {
        const nx = sh.dx / shDist
        const ny = sh.dy / shDist

        const invShip = 1
        const invHook = 1 / HARPOON_HOOK_MASS
        const invSum = invShip + invHook

        const err = shDist - hp0.maxLength
        const maxCorr = 140
        const corr = Math.min(err, maxCorr)

        ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
        ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
        hp0.pos.x = wrapX(hp0.pos.x - nx * (corr * (invHook / invSum)))
        hp0.pos.y = wrapY(hp0.pos.y - ny * (corr * (invHook / invSum)))

        const relVx = hp0.vel.x - ship.vel.x
        const relVy = hp0.vel.y - ship.vel.y
        const relAlong = relVx * nx + relVy * ny
        if (relAlong > 0) {
          const j = (-relAlong * 0.9) / invSum
          ship.vel.x -= j * nx * invShip
          ship.vel.y -= j * ny * invShip
          hp0.vel.x += j * nx * invHook
          hp0.vel.y += j * ny * invHook
        }
      }
    }

    // If it touches a rock later, it should still latch.
    for (let i = 0; i < rocks.length; i++) {
      const a = rocks[i]
      const { dx, dy } = toroidalDelta(hp0.pos.x, hp0.pos.y, a.pos.x, a.pos.y, w, h)
      const dist = Math.hypot(dx, dy)
      if (dist < a.radius) {
        const ropeLen = hp0.maxLength
        const segments = Math.max(18, Math.min(60, Math.ceil(ropeLen / 22)))
        const segLen = ropeLen / segments
        const d2 = toroidalDelta(ship.pos.x, ship.pos.y, a.pos.x, a.pos.y, w, h)
        const rope: Vector2[] = []
        const ropePrev: Vector2[] = []
        for (let k = 1; k < segments; k++) {
          const t = k / segments
          const px = wrapX(ship.pos.x + d2.dx * t)
          const py = wrapY(ship.pos.y + d2.dy * t)
          rope.push({ x: px, y: py })
          ropePrev.push({ x: px, y: py })
        }
        harpoonRef.current = {
          state: 'attached',
          rock: a,
          ropeLength: ropeLen,
          maxLength: hp0.maxLength,
          segLen,
          rope,
          ropePrev,
        }
        break
      }
    }

    // Rope simulation for rendering (slack/curve).
    {
      const rope = hp0.rope
      const ropePrev = hp0.ropePrev
      const segLen = hp0.segLen

      const damp = 0.992
      const dt2 = dt * dt
      for (let i = 0; i < rope.length; i++) {
        const p = rope[i]
        const pp = ropePrev[i]
        const vx = (p.x - pp.x) * damp
        const vy = (p.y - pp.y) * damp
        ropePrev[i] = { x: p.x, y: p.y }
        rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy + 0 * dt2) }
      }

      const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
        const d = toroidalDelta(ax, ay, bx, by, w, h)
        const dLen = Math.hypot(d.dx, d.dy)
        if (dLen < 1e-6) return { cx: 0, cy: 0 }
        const diff = (dLen - target) / dLen
        return { cx: d.dx * diff, cy: d.dy * diff }
      }

      const iterations = 9
      for (let it = 0; it < iterations; it++) {
        if (rope.length > 0) {
          const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
          rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
        }
        for (let i = 0; i < rope.length - 1; i++) {
          const p0 = rope[i]
          const p1 = rope[i + 1]
          const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
          rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
          rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
        }
        if (rope.length > 0) {
          const last = rope[rope.length - 1]
          const c = solvePair(last.x, last.y, hp0.pos.x, hp0.pos.y, segLen)
          rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
        }
      }
    }
  } else if (hp0.state === 'attached') {
    // If the rock got destroyed/split, drop the harpoon.
    if (!rocks.includes(hp0.rock)) {
      const ropeLength = hp0.maxLength * HARPOON_VISUAL_SLACK
      const seed = buildRopeBetween(ship.pos.x, ship.pos.y, hp0.rock.pos.x, hp0.rock.pos.y, ropeLength)
      harpoonRef.current = {
        state: 'deployed',
        pos: { x: hp0.rock.pos.x, y: hp0.rock.pos.y },
        vel: { x: 0, y: 0 },
        maxLength: hp0.maxLength,
        ropeLength,
        segLen: seed.segLen,
        rope: seed.rope,
        ropePrev: seed.ropePrev,
      }
    } else {
      const rock = hp0.rock
      const { dx, dy } = toroidalDelta(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, w, h)
      const dist = Math.hypot(dx, dy)
      const L = hp0.ropeLength

      // Physics: tension-only cable.
      // Only enforce when stretched (dist > L). If compressed, it goes slack (no pushing).
      if (dist > L && dist > 1e-6) {
        const nx = dx / dist
        const ny = dy / dist

        // Mass: larger rock = heavier. Ship is always light.
        const invShip = 1
        const mRock = Math.max(1, (rock.radius / 18) * (rock.radius / 18))
        const invRock = 1 / mRock
        const invSum = invShip + invRock

        // Position correction to remove stretch.
        const err = dist - L
        const maxCorr = 140
        const corr = Math.min(err, maxCorr)

        ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
        ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
        rock.pos.x = wrapX(rock.pos.x - nx * (corr * (invRock / invSum)))
        rock.pos.y = wrapY(rock.pos.y - ny * (corr * (invRock / invSum)))

        // Velocity correction: only remove separating motion (keeps it from "rubber banding").
        const relVx = rock.vel.x - ship.vel.x
        const relVy = rock.vel.y - ship.vel.y
        const relAlong = relVx * nx + relVy * ny
        if (relAlong > 0) {
          const j = (-relAlong * 0.9) / invSum
          ship.vel.x -= j * nx * invShip
          ship.vel.y -= j * ny * invShip
          rock.vel.x += j * nx * invRock
          rock.vel.y += j * ny * invRock
        }
      }

      // Rope simulation for rendering (slack/curve).
      // Endpoints are fixed at ship/rock positions so slack doesn't push them.
      const rope = hp0.rope
      const ropePrev = hp0.ropePrev
      const segLen = hp0.segLen

      // Verlet integrate internal rope points.
      const damp = 0.992
      for (let i = 0; i < rope.length; i++) {
        const p = rope[i]
        const pp = ropePrev[i]
        const vx = (p.x - pp.x) * damp
        const vy = (p.y - pp.y) * damp
        ropePrev[i] = { x: p.x, y: p.y }
        rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy) }
      }

      const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
        const d = toroidalDelta(ax, ay, bx, by, w, h)
        const dLen = Math.hypot(d.dx, d.dy)
        if (dLen < 1e-6) return { cx: 0, cy: 0 }
        const diff = (dLen - target) / dLen
        return { cx: d.dx * diff, cy: d.dy * diff }
      }

      // Iterative constraint solve (PBD): keep each segment at segLen.
      const iterations = 10
      for (let it = 0; it < iterations; it++) {
        // Segment: ship -> first
        if (rope.length > 0) {
          const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
          rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
        }

        // Internal segments
        for (let i = 0; i < rope.length - 1; i++) {
          const p0 = rope[i]
          const p1 = rope[i + 1]
          const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
          rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
          rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
        }

        // Segment: last -> rock
        if (rope.length > 0) {
          const last = rope[rope.length - 1]
          const c = solvePair(last.x, last.y, rock.pos.x, rock.pos.y, segLen)
          rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
        }
      }
    }
  } else if (hp0.state === 'reeling') {
    // Winch behavior: cable length shrinks and tension pulls the hook in.
    hp0.reelLength = Math.max(HARPOON_REEL_MIN_LEN, hp0.reelLength - hp0.reelSpeed * dt)
    hp0.ropeLength = hp0.reelLength * HARPOON_VISUAL_SLACK

    const targetSegLen = hp0.ropeLength / Math.max(1, hp0.rope.length + 1)

    const d = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
    const dist = Math.hypot(d.dx, d.dy)
    if (dist > 1e-6 && dist > hp0.reelLength) {
      const nx = d.dx / dist
      const ny = d.dy / dist

      // Bias so the ship doesn't get dragged as much by the winch.
      const invShip = 0.35
      const invHook = 1 / HARPOON_HOOK_MASS
      const invSum = invShip + invHook

      const err = dist - hp0.reelLength
      const maxCorr = 220
      const corr = Math.min(err, maxCorr)

      ship.pos.x = wrapX(ship.pos.x + nx * (corr * (invShip / invSum)))
      ship.pos.y = wrapY(ship.pos.y + ny * (corr * (invShip / invSum)))
      hp0.pos.x = wrapX(hp0.pos.x - nx * (corr * (invHook / invSum)))
      hp0.pos.y = wrapY(hp0.pos.y - ny * (corr * (invHook / invSum)))

      // Reeling state doesn't store velocity; position solve is sufficient and avoids "hook flies into ship" snaps.
    }

    // Finished: once the cable is fully in, drop to idle.
    const d2 = toroidalDelta(ship.pos.x, ship.pos.y, hp0.pos.x, hp0.pos.y, w, h)
    const dist2 = Math.hypot(d2.dx, d2.dy)
    if (hp0.reelLength <= HARPOON_REEL_MIN_LEN + 0.5 && dist2 <= HARPOON_REEL_MIN_LEN + 6) {
      harpoonRef.current = { state: 'idle' }
    }

    // Rope simulation for rendering while reeling.
    {
      const rope = hp0.rope
      const ropePrev = hp0.ropePrev
      const segLen = targetSegLen

      const damp = 0.992
      const dt2 = dt * dt
      for (let i = 0; i < rope.length; i++) {
        const p = rope[i]
        const pp = ropePrev[i]
        const vx = (p.x - pp.x) * damp
        const vy = (p.y - pp.y) * damp
        ropePrev[i] = { x: p.x, y: p.y }
        rope[i] = { x: wrapX(p.x + vx), y: wrapY(p.y + vy + 0 * dt2) }
      }

      const solvePair = (ax: number, ay: number, bx: number, by: number, target: number) => {
        const dd = toroidalDelta(ax, ay, bx, by, w, h)
        const dLen = Math.hypot(dd.dx, dd.dy)
        if (dLen < 1e-6) return { cx: 0, cy: 0 }
        const diff = (dLen - target) / dLen
        return { cx: dd.dx * diff, cy: dd.dy * diff }
      }

      const iterations = 9
      for (let it = 0; it < iterations; it++) {
        if (rope.length > 0) {
          const c = solvePair(ship.pos.x, ship.pos.y, rope[0].x, rope[0].y, segLen)
          rope[0] = { x: wrapX(rope[0].x - c.cx), y: wrapY(rope[0].y - c.cy) }
        }
        for (let i = 0; i < rope.length - 1; i++) {
          const p0 = rope[i]
          const p1 = rope[i + 1]
          const c = solvePair(p0.x, p0.y, p1.x, p1.y, segLen)
          rope[i] = { x: wrapX(p0.x + c.cx * 0.5), y: wrapY(p0.y + c.cy * 0.5) }
          rope[i + 1] = { x: wrapX(p1.x - c.cx * 0.5), y: wrapY(p1.y - c.cy * 0.5) }
        }
        if (rope.length > 0) {
          const last = rope[rope.length - 1]
          const c = solvePair(last.x, last.y, hp0.pos.x, hp0.pos.y, segLen)
          rope[rope.length - 1] = { x: wrapX(last.x + c.cx), y: wrapY(last.y + c.cy) }
        }
      }
    }
  }
}
