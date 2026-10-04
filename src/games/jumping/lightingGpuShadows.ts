import { polygonPoints } from './geometry.ts'
import type { Vec } from './geometry.ts'
import type { Platform } from './model.ts'
import { betweenLightAndView, lightReachesView, shadowQuad } from './lightingModel.ts'
import type { CasterGroup, LightSource } from './lightingModel.ts'
import { isExitEdge } from './lightingBoundary.ts'
import type { LightingView } from './lightingRender.ts'
import { clipShadowPolygon, triangulateCaster } from './lightingGpuGeometry.ts'
import { daylightShadowPolygons } from './daylight.ts'

export class GpuShadowMask {
  canvas = document.createElement('canvas')
  gl: WebGL2RenderingContext
  program: WebGLProgram
  buffer: WebGLBuffer
  opacity: WebGLUniformLocation | null
  viewport: WebGLUniformLocation | null
  vertexBytes = 0
  // staticCasters and dynamicCasters hand us immutable silhouette objects.
  // Share their contours/triangles across lights without retaining old poses.
  private silhouettes = new WeakMap<Platform, { points: Vec[]; triangles?: Vec[] }>()
  private silhouette(shape: Platform) {
    let cached = this.silhouettes.get(shape)
    if (!cached) { cached = { points: polygonPoints(shape) }; this.silhouettes.set(shape, cached) }
    return cached
  }
  constructor(allowSoftware = false) {
    // A software WebGL implementation can be much slower than the Canvas
    // fallback. Let the browser decline it without reducing lighting quality.
    const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, failIfMajorPerformanceCaveat: !allowSoftware })
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl
    try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    // Some browsers accept the caveat flag even when ANGLE uses a CPU driver.
    // Explicit GPU experiments may opt in; live play keeps full-quality Canvas.
    if (!allowSoftware && info && /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render Driver/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)))
      throw new Error('Software WebGL is unsuitable for live lighting')
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!)
      return s
    }
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
      layout(location = 0) in vec2 position;
      uniform vec2 viewport;
      void main() { gl_Position = vec4(position / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.); }`)
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      uniform float opacity;
      out vec4 color;
      void main() { color = vec4(opacity); }`)
    const program = gl.createProgram()!; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)!)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    this.program = program; this.buffer = gl.createBuffer()!
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    const location = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    this.opacity = gl.getUniformLocation(program, 'opacity'); this.viewport = gl.getUniformLocation(program, 'viewport')
    } catch (error) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error }
  }
  render(groups: readonly CasterGroup[], light: LightSource, view: LightingView, reach: number, target: WebGLFramebuffer) {
    const gl = this.gl, { width, height } = view
    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    const bounds = { x: view.x, y: view.y, w: width / view.zoom, h: height / view.zoom }
    const vertices: number[] = [0, 0, width, 0, width, height, 0, 0, width, height, 0, height]
    const batches: { start: number; shadows: number; bodies: number; opacity: number }[] = []
    const append = (p: Vec) => vertices.push((p[0] - view.x) * view.zoom, (p[1] - view.y) * view.zoom)
    let edges = 0
    // A ray that misses the lamp's cone cannot shadow that lamp. Expand the
    // test for antialiasing, retaining offscreen blockers and source-haze edges.
    const affectsCone = (x: number, y: number, w: number, h: number) => lightReachesView(light,
      { x: x - 2 / view.zoom, y: y - 2 / view.zoom, w: w + 4 / view.zoom, h: h + 4 / view.zoom })
    for (const group of groups) {
      const candidates = group.boundary ? [] : group.filter(shape => betweenLightAndView(shape, light, bounds)
        && affectsCone(shape.x, shape.y, shape.w, shape.h))
      const boundary = group.boundary?.filter(([a, b]) => isExitEdge(light, [a, b])
        && affectsCone(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]))
        && Math.min(a[0], b[0]) <= Math.max(light.x, bounds.x + bounds.w) && Math.max(a[0], b[0]) >= Math.min(light.x, bounds.x)
        && Math.min(a[1], b[1]) <= Math.max(light.y, bounds.y + bounds.h) && Math.max(a[1], b[1]) >= Math.min(light.y, bounds.y))
      const start = vertices.length / 2
      const cast = (a: Vec, b: Vec) => {
        const points = clipShadowPolygon(shadowQuad(light, a, b, reach), bounds)
        for (let i = 1; i < points.length - 1; i++) { append(points[0]); append(points[i]); append(points[i + 1]) }
        if (points.length >= 3) edges++
      }
      if (boundary) boundary.forEach(([a, b]) => cast(a, b))
      else for (const shape of candidates) {
        const { points } = this.silhouette(shape)
        for (let i = 0; i < points.length; i++) cast(points[i], points[(i + 1) % points.length])
      }
      const shadows = vertices.length / 2 - start
      if (!shadows) continue
      for (const shape of candidates) {
        const cached = this.silhouette(shape)
        const triangles = cached.triangles ??= triangulateCaster(cached.points)
        triangles.forEach(append)
      }
      batches.push({ start, shadows, bodies: vertices.length / 2 - start - shadows, opacity: group.opacity ?? 1 })
    }
    this.vertexBytes = vertices.length * 4
    gl.viewport(0, 0, width, height); gl.useProgram(this.program); gl.uniform2f(this.viewport, width, height)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)
    gl.colorMask(true, true, true, true); gl.stencilMask(255); gl.clearColor(0, 0, 0, 0); gl.clearStencil(0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.enable(gl.STENCIL_TEST); gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    let stamp = 0
    for (const batch of batches) {
      // Each group gets a distinct stencil value. Clearing for every caster
      // forced costly render-pass boundaries on the reference Adreno GPU.
      // Rollover clears only stencil; previously accumulated occlusion remains.
      if (++stamp === 256) { gl.clear(gl.STENCIL_BUFFER_BIT); stamp = 1 }
      gl.colorMask(false, false, false, false)
      gl.stencilFunc(gl.ALWAYS, stamp, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
      gl.drawArrays(gl.TRIANGLES, batch.start, batch.shadows)
      if (batch.bodies) {
        gl.stencilFunc(gl.ALWAYS, 0, 255)
        gl.drawArrays(gl.TRIANGLES, batch.start + batch.shadows, batch.bodies)
      }
      gl.colorMask(true, true, true, true); gl.stencilFunc(gl.EQUAL, stamp, 255); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
      gl.uniform1f(this.opacity, batch.opacity); gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    gl.disable(gl.STENCIL_TEST)
    return edges
  }
  renderDaylight(groups: readonly CasterGroup[], view: LightingView, roomWidth: number, roomHeight: number, target: WebGLFramebuffer) {
    const gl = this.gl, { width, height } = view
    const polygons = daylightShadowPolygons(groups.flatMap(group => group.boundary ?? []),
      { x: view.x, y: view.y, w: width / view.zoom, h: height / view.zoom }, roomWidth, roomHeight)
    // Keep the shared fullscreen quad first for the exposure pass. Structural
    // daylight casters are opaque; their projected triangles form one union.
    const vertices = [0, 0, width, 0, width, height, 0, 0, width, height, 0, height]
    const append = ([x, y]: Vec) => vertices.push((x - view.x) * view.zoom, (y - view.y) * view.zoom)
    for (const polygon of polygons) for (let i = 1; i < polygon.length - 1; i++) {
      append(polygon[0]); append(polygon[i]); append(polygon[i + 1])
    }
    this.vertexBytes = vertices.length * 4
    gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.viewport(0, 0, width, height)
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND); gl.colorMask(true, true, true, true)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program); gl.uniform2f(this.viewport, width, height); gl.uniform1f(this.opacity, 1)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)
    gl.drawArrays(gl.TRIANGLES, 6, vertices.length / 2 - 6)
    return polygons.length
  }
  dispose() {
    this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.width = this.canvas.height = 0
  }
}
