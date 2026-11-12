/**
 * Draws a whole world frame with WebGL 2 straight onto a visible canvas: the
 * frame's own passes (built every frame) and, where the frame says, retained
 * scenes (built once per level and zoom). One context, one canvas, no picture
 * handed between contexts.
 *
 * Exposure. Each draw's colour is multiplied by its exposure before it blends:
 * the light field where artwork receives light, the ambient level where it does
 * not, and never below its readability floor. Canvas reaches the same result
 * by multiplying the finished frame by the field and correcting readable and
 * structural artwork in later passes; because blending is linear, multiplying
 * each draw first is equivalent. The field is drawn first, multisampled like
 * the world, into a texture each draw reads at its pixel.
 */
import type { Pass, Scene, TexturePaint } from './scene.ts'
import { VERTEX_BYTES } from './scene.ts'
import type { Light } from './recorder.ts'

export interface FrameView { x: number; y: number; zoom: number; width: number; height: number }
/** The frame's passes and vertices, as `SceneBuilder` leaves them. */
export interface FramePlan { passes: readonly Pass[]; textures: readonly TexturePaint[]; vertices: Uint8Array }
/** Shadow triangles in world units (x, y pairs), and the exposure inside them. */
export interface FieldPlan { triangles: Float32Array; count: number; shadow: number; ambient: number }

const VERTEX = `#version 300 es
layout(location = 0) in vec2 position;
layout(location = 1) in vec3 aa;
layout(location = 2) in vec4 color;
uniform vec2 view, size;
uniform float zoom;
out vec2 world;
out vec3 edge;
out vec4 tint;
void main() {
  world = position; edge = aa; tint = vec4(color.rgb * color.a, color.a);
  vec2 device = (position - view) * zoom;
  gl_Position = vec4(device / size * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`

const EXPOSURE = `
uniform sampler2D field;
uniform vec3 light;        // floor, receives light, exposure applies
uniform float ambient;
vec3 expose(vec3 rgb) {
  if (light.z < .5) return rgb;
  float f = texelFetch(field, ivec2(gl_FragCoord.xy), 0).r;
  return rgb * max(light.y > .5 ? f : ambient, light.x);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 world;
in vec3 edge;
in vec4 tint;
uniform float zoom;
uniform int paint;         // 0 vertex colour, 1 texture, 2 coverage only
uniform sampler2D image;
uniform mat3 placement;    // world units to texture coordinates
out vec4 color;
${EXPOSURE}
void main() {
  float coverage = 1.;
  if (edge.x > .5) {
    // A line's exact box-filtered coverage across it: the overlap of this
    // pixel's width with the line's, in device pixels.
    float d = edge.y * zoom, h = edge.z * zoom;
    coverage = clamp(min(d + .5, h) - max(d - .5, -h), 0., 1.);
  }
  if (paint == 2) { color = vec4(coverage); return; }
  vec4 base = paint == 1 ? texture(image, (placement * vec3(world, 1.)).xy) * tint.a : tint;
  color = vec4(expose(base.rgb), base.a) * coverage;
}`

const COVER_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D coverage;
uniform vec4 tone;
out vec4 color;
${EXPOSURE}
void main() { color = vec4(expose(tone.rgb), tone.a) * texelFetch(coverage, ivec2(gl_FragCoord.xy), 0).r; }`

const FIELD_VERTEX = `#version 300 es
layout(location = 0) in vec2 position;
uniform vec2 view, size;
uniform float zoom;
void main() {
  vec2 device = (position - view) * zoom;
  gl_Position = vec4(device / size * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
}`
const FIELD_FRAGMENT = `#version 300 es
precision highp float;
uniform float value;
out vec4 color;
void main() { color = vec4(value); }`

interface Program { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }
interface Uploaded { buffer: WebGLBuffer; vao: WebGLVertexArrayObject }
interface Target {
  width: number; height: number
  fbo: WebGLFramebuffer; color: WebGLRenderbuffer; stencil: WebGLRenderbuffer
  coverageFbo: WebGLFramebuffer; coverage: WebGLTexture
  fieldFbo: WebGLFramebuffer; fieldColor: WebGLRenderbuffer; fieldResolveFbo: WebGLFramebuffer; field: WebGLTexture
}

/** Whether a context draws on the CPU: slower than Canvas 2D, which may still have the GPU. */
export function softwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
  return /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render Driver/i.test(name)
}

export class GlFrame {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private gl: WebGL2RenderingContext
  private main: Program
  private cover: Program
  private fieldProgram: Program
  private target?: Target
  private stream: Uploaded
  private fieldStream: Uploaded
  private uploads = new Map<Scene, Uploaded>()
  private textures = new Map<object, { texture: WebGLTexture; used: number; repeat: boolean; smooth: boolean }>()
  private frame = 0
  private samples: number
  /** State already set during the current frame, so passes set only what changes. */
  private current = { program: null as WebGLProgram | null, paint: -1, texture: null as WebGLTexture | null, placement: null as TexturePaint | null, light: '' }
  private ambient = 1
  /** A transparent frame (pictures for a Canvas frame) clears to nothing; an opaque one is the screen. */
  private readonly transparent: boolean
  private readonly listening = new AbortController()
  lost = false

  /** Null when WebGL 2 is unavailable, or runs in software unless `allowSoftware`. */
  static create(canvas: HTMLCanvasElement | OffscreenCanvas, allowSoftware = false, transparent = false): GlFrame | null {
    try { return new GlFrame(canvas, allowSoftware, transparent) } catch { return null }
  }

  private constructor(canvas: HTMLCanvasElement | OffscreenCanvas, allowSoftware: boolean, transparent: boolean) {
    this.canvas = canvas; this.transparent = transparent
    // Alpha even when opaque: a multisampled resolve needs the canvas's format to match the RGBA8 target exactly.
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !allowSoftware }) as WebGL2RenderingContext | null
    // A canvas whose context was lost keeps returning it, lost, until the browser restores it.
    if (!gl || gl.isContextLost()) throw new Error('WebGL 2 is unavailable.')
    // Some browsers accept the caveat flag even when ANGLE draws on the CPU, as headless Chromium's SwiftShader does.
    if (!allowSoftware && softwareRenderer(gl)) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw new Error('WebGL 2 runs in software.') }
    this.gl = gl
    this.samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number)
    const view = ['view', 'size', 'zoom', 'field', 'light', 'ambient']
    this.main = this.program(VERTEX, FRAGMENT, [...view, 'paint', 'image', 'placement'])
    this.cover = this.program(VERTEX, COVER_FRAGMENT, [...view, 'coverage', 'tone'])
    this.fieldProgram = this.program(FIELD_VERTEX, FIELD_FRAGMENT, ['view', 'size', 'zoom', 'value'])
    this.stream = this.vertexArray(null)
    this.fieldStream = { buffer: gl.createBuffer()!, vao: gl.createVertexArray()! }
    gl.bindVertexArray(this.fieldStream.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldStream.buffer)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)
    gl.bindVertexArray(null)
    // Prevent the default so the browser restores the context; the owner then builds a new renderer.
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; this.uploads.clear(); this.textures.clear(); this.target = undefined },
      { signal: this.listening.signal })
  }

  private program(vertexSource: string, fragmentSource: string, names: string[]): Program {
    const gl = this.gl
    const shader = (kind: number, source: string) => {
      const s = gl.createShader(kind)!; gl.shaderSource(s, source); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const program = gl.createProgram()!
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link')
    return { program, uniforms: Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program, name)])) }
  }

  private vertexArray(data: ArrayBuffer | null): Uploaded {
    const gl = this.gl, buffer = gl.createBuffer()!, vao = gl.createVertexArray()!
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, VERTEX_BYTES, 0)
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, VERTEX_BYTES, 8)
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, VERTEX_BYTES, 20)
    gl.bindVertexArray(null)
    return { buffer, vao }
  }

  /**
   * GPU memory this renderer holds for its targets, in bytes: multisampled
   * colour and stencil, the multisampled field and its texture, and the coverage
   * target. Like the lighting allowance, it leaves out the canvas's own buffers.
   */
  get targetBytes() {
    const t = this.target
    return t ? t.width * t.height * (this.samples * 5 + this.samples + 1 + 1) : 0
  }

  private resize(width: number, height: number): Target {
    const gl = this.gl
    if (this.target?.width === width && this.target.height === height) return this.target
    this.releaseTarget()
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height }
    const storage = (format: number) => {
      const r = gl.createRenderbuffer()!; gl.bindRenderbuffer(gl.RENDERBUFFER, r); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, format, width, height); return r
    }
    const texture = (format: number) => {
      const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      return t
    }
    const framebuffer = (attach: (fbo: WebGLFramebuffer) => void) => {
      const fbo = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); attach(fbo)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Frame target is incomplete.')
      return fbo
    }
    const color = storage(gl.RGBA8), stencil = storage(gl.STENCIL_INDEX8)
    const fbo = framebuffer(() => {
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color)
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil)
    })
    const coverage = texture(gl.R8)
    const coverageFbo = framebuffer(() => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, coverage, 0))
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    const fieldColor = storage(gl.R8)
    const fieldFbo = framebuffer(() => gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, fieldColor))
    const field = texture(gl.R8)
    const fieldResolveFbo = framebuffer(() => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, field, 0))
    // A texture left bound while drawing into it is a feedback loop: WebGL drops the draw.
    gl.bindTexture(gl.TEXTURE_2D, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.target = { width, height, fbo, color, stencil, coverageFbo, coverage, fieldFbo, fieldColor, fieldResolveFbo, field }
    return this.target
  }

  private releaseTarget() {
    const gl = this.gl, t = this.target
    if (!t) return
    for (const fbo of [t.fbo, t.coverageFbo, t.fieldFbo, t.fieldResolveFbo]) gl.deleteFramebuffer(fbo)
    for (const r of [t.color, t.stencil, t.fieldColor]) gl.deleteRenderbuffer(r)
    gl.deleteTexture(t.coverage); gl.deleteTexture(t.field)
    this.target = undefined
  }

  private upload(scene: Scene): Uploaded {
    let uploaded = this.uploads.get(scene)
    if (!uploaded) { uploaded = this.vertexArray(scene.vertices); this.uploads.set(scene, uploaded) }
    return uploaded
  }
  /** Free a retained scene's GPU memory. */
  forget(scene: Scene) {
    const uploaded = this.uploads.get(scene)
    if (!uploaded) return
    this.gl.deleteBuffer(uploaded.buffer); this.gl.deleteVertexArray(uploaded.vao)
    this.uploads.delete(scene)
  }

  private texture(paint: TexturePaint) {
    const gl = this.gl
    let entry = this.textures.get(paint.source)
    if (!entry) {
      const texture = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paint.source as TexImageSource)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      entry = { texture, used: this.frame, repeat: !paint.repeat, smooth: !paint.smooth }
      this.textures.set(paint.source, entry)
      this.current.texture = texture
    } else if (this.current.texture !== entry.texture) { gl.bindTexture(gl.TEXTURE_2D, entry.texture); this.current.texture = entry.texture }
    entry.used = this.frame
    // Canvas smooths images bilinearly, without mipmaps; patterns repeat, everything else stops at its edge.
    if (entry.repeat !== paint.repeat) {
      const wrap = paint.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap); entry.repeat = paint.repeat
    }
    if (entry.smooth !== paint.smooth) {
      const filter = paint.smooth ? gl.LINEAR : gl.NEAREST
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter); entry.smooth = paint.smooth
    }
    return entry.texture
  }

  /** Release textures no frame has used for a while (sprites the cache let go, old patterns). */
  private sweepTextures() {
    for (const [source, entry] of this.textures) if (this.frame - entry.used > 300) { this.gl.deleteTexture(entry.texture); this.textures.delete(source) }
  }

  /** Draw a frame through `view`. `scenes` holds the retained layers the plan names. */
  render(plan: FramePlan, scenes: ReadonlyMap<string, Scene>, view: FrameView, field: FieldPlan) {
    if (this.gl.isContextLost()) throw new Error('Frame graphics context lost.')
    const gl = this.gl, target = this.resize(view.width, view.height)
    this.frame++
    if (this.frame % 120 === 0) this.sweepTextures()
    this.current = { program: null, paint: -1, texture: null, placement: null, light: '' }
    this.ambient = field.ambient
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND)
    gl.viewport(0, 0, view.width, view.height)

    // The light field: lit everywhere but the shadows, multisampled, then resolved into the texture draws read.
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fieldFbo); gl.colorMask(true, true, true, true)
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT)
    if (field.count) {
      const { program, uniforms: u } = this.fieldProgram
      gl.useProgram(program)
      gl.uniform2f(u.view, view.x, view.y); gl.uniform2f(u.size, view.width, view.height); gl.uniform1f(u.zoom, view.zoom); gl.uniform1f(u.value, field.shadow)
      gl.bindVertexArray(this.fieldStream.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldStream.buffer)
      gl.bufferData(gl.ARRAY_BUFFER, field.triangles.subarray(0, field.count * 2), gl.STREAM_DRAW)
      gl.drawArrays(gl.TRIANGLES, 0, field.count)
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.fieldFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.fieldResolveFbo)
    gl.blitFramebuffer(0, 0, view.width, view.height, 0, 0, view.width, view.height, gl.COLOR_BUFFER_BIT, gl.NEAREST)

    // The world.
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    gl.stencilMask(0xff); gl.clearColor(0, 0, 0, this.transparent ? 0 : 1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.enable(gl.STENCIL_TEST); gl.enable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, target.field); gl.activeTexture(gl.TEXTURE0)
    gl.bindVertexArray(this.stream.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.stream.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, plan.vertices, gl.STREAM_DRAW)
    this.passes(plan.passes, plan.textures, view, target, 0, null, scenes)
    gl.bindVertexArray(null)
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null)

    // Resolve onto the canvas.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
    gl.blitFramebuffer(0, 0, view.width, view.height, 0, 0, view.width, view.height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private passes(passes: readonly Pass[], textures: readonly TexturePaint[], view: FrameView, target: Target, depthOffset: number, inherited: Light | null,
    scenes: ReadonlyMap<string, Scene>) {
    const visible = (box: { x0: number; y0: number; x1: number; y1: number }) => box.x1 >= view.x && box.y1 >= view.y
      && box.x0 <= view.x + view.width / view.zoom && box.y0 <= view.y + view.height / view.zoom
    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i]
      if (pass.kind === 'scene') {
        const scene = scenes.get(pass.name)
        if (!scene) continue
        const uploaded = this.upload(scene)
        this.gl.bindVertexArray(uploaded.vao)
        this.passes(scene.passes, scene.textures, view, target, depthOffset + pass.depth, pass.light ?? inherited, scenes)
        this.gl.bindVertexArray(this.stream.vao)
        continue
      }
      // Everything inside an off-screen clip is off screen too: skip to past its removal.
      if (pass.kind === 'clip' && !visible(pass.box)) { i = pass.end; continue }
      if (pass.kind !== 'clip' && pass.kind !== 'unclip' && !visible(pass.box)) continue
      this.pass(pass, textures, view, target, depthOffset, inherited)
    }
  }

  private useProgram(p: Program, view: FrameView) {
    const gl = this.gl
    if (this.current.program === p.program) return false
    gl.useProgram(p.program); this.current.program = p.program
    const u = p.uniforms
    gl.uniform2f(u.view, view.x, view.y); gl.uniform2f(u.size, view.width, view.height); gl.uniform1f(u.zoom, view.zoom)
    gl.uniform1i(u.field, 1); gl.uniform1f(u.ambient, this.ambient)
    this.current.light = ''; this.current.paint = -1; this.current.placement = null
    return true
  }
  private setLight(p: Program, light: Light | null) {
    // Artwork outside any paint call is lit like the wall it sits on.
    const floor = light?.floor ?? 0, receives = light ? light.receives : true
    const key = `${floor}:${receives}`
    if (this.current.light === key) return
    this.gl.uniform3f(p.uniforms.light, floor, receives ? 1 : 0, 1); this.current.light = key
  }
  private useMain(view: FrameView, paint: number, textures: readonly TexturePaint[], texture: number, light: Light | null) {
    const gl = this.gl, u = this.main.uniforms, current = this.current
    this.useProgram(this.main, view)
    this.setLight(this.main, light)
    const mode = texture >= 0 && paint !== 2 ? 1 : paint
    if (current.paint !== mode) { gl.uniform1i(u.paint, mode); current.paint = mode; if (mode === 1) gl.uniform1i(u.image, 0) }
    if (mode === 1) {
      const t = textures[texture]
      this.texture(t)
      if (current.placement !== t) {
        const m = t.toTexture
        gl.uniformMatrix3fv(u.placement, false, [m.a, m.b, 0, m.c, m.d, 0, m.e, m.f, 1]); current.placement = t
      }
    }
  }

  private draw(range: { first: number; count: number }) { if (range.count) this.gl.drawArrays(this.gl.TRIANGLES, range.first, range.count) }

  /** Count winding into the low stencil bits, only where the sample is inside `depth` clips. */
  private wind(range: { first: number; count: number }, depth: number, evenOdd: boolean) {
    const gl = this.gl
    gl.colorMask(false, false, false, false)
    gl.stencilFunc(gl.EQUAL, depth << 4, 0xf0)
    if (evenOdd) { gl.stencilMask(0x01); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT) }
    else {
      gl.stencilMask(0x0f)
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP)
    }
    this.draw(range)
    gl.colorMask(true, true, true, true)
  }

  private pass(pass: Exclude<Pass, { kind: 'scene' }>, textures: readonly TexturePaint[], view: FrameView, target: Target, offset: number, inherited: Light | null) {
    const gl = this.gl
    const light = 'light' in pass ? pass.light ?? inherited : inherited
    const depth = pass.depth + offset
    switch (pass.kind) {
      case 'direct':
        this.useMain(view, 0, textures, pass.texture, light)
        gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, depth << 4, 0xf0); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
        this.draw(pass.draw)
        break
      case 'stencil-fill':
        this.useMain(view, 0, textures, pass.texture, light)
        this.wind(pass.wind, depth, pass.evenOdd)
        // Cover where the winding counted, clearing the count as each sample is drawn.
        gl.stencilMask(0x0f); gl.stencilFunc(gl.NOTEQUAL, 0, 0x0f); gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO)
        this.draw(pass.cover)
        break
      case 'stroke-once':
        this.useMain(view, 0, textures, pass.texture, light)
        gl.stencilMask(0x0f); gl.stencilFunc(gl.EQUAL, depth << 4, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR)
        this.draw(pass.draw)
        gl.colorMask(false, false, false, false)
        gl.stencilFunc(gl.NOTEQUAL, 0, 0x0f); gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO)
        this.draw(pass.draw)
        gl.colorMask(true, true, true, true)
        break
      case 'thin-max': {
        // Greatest coverage per pixel in the single-sample coverage target, limited to this stroke's box.
        const x0 = Math.max(0, Math.floor((pass.box.x0 - view.x) * view.zoom)), y0 = Math.max(0, Math.floor((pass.box.y0 - view.y) * view.zoom))
        const x1 = Math.min(view.width, Math.ceil((pass.box.x1 - view.x) * view.zoom)), y1 = Math.min(view.height, Math.ceil((pass.box.y1 - view.y) * view.zoom))
        if (x1 <= x0 || y1 <= y0) break
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.coverageFbo)
        gl.disable(gl.STENCIL_TEST); gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, view.height - y1, x1 - x0, y1 - y0)
        gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE)
        // Nothing may be bound for reading while the coverage target is drawn into (a feedback loop).
        gl.bindTexture(gl.TEXTURE_2D, null); this.current.texture = null
        this.useMain(view, 2, textures, -1, light)
        this.draw(pass.draw)
        gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); gl.enable(gl.STENCIL_TEST)
        this.useProgram(this.cover, view)
        this.setLight(this.cover, light)
        gl.uniform4f(this.cover.uniforms.tone, ...pass.color)
        gl.bindTexture(gl.TEXTURE_2D, target.coverage); gl.uniform1i(this.cover.uniforms.coverage, 0); this.current.texture = target.coverage
        gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, depth << 4, 0xf0); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
        this.draw(pass.cover)
        gl.bindTexture(gl.TEXTURE_2D, null); this.current.texture = null
        // Leave the coverage target clear for the next stroke.
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.coverageFbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
        gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
        break
      }
      case 'clip':
        this.useMain(view, 0, textures, -1, light)
        this.wind(pass.wind, depth, pass.evenOdd)
        // Inside the clip: one level deeper, with the count cleared.
        gl.colorMask(false, false, false, false)
        gl.stencilMask(0xff); gl.stencilFunc(gl.NOTEQUAL, (depth + 1) << 4, 0x0f); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
        this.draw(pass.cover)
        gl.colorMask(true, true, true, true)
        break
      case 'unclip':
        this.useMain(view, 0, textures, -1, light)
        gl.colorMask(false, false, false, false)
        gl.stencilMask(0xf0); gl.stencilFunc(gl.LESS, depth << 4, 0xf0); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
        this.draw(pass.cover)
        gl.colorMask(true, true, true, true)
        break
    }
  }

  /** Free everything. A canvas this renderer was given keeps a usable context for the next one (React mounts effects twice in development). */
  dispose() {
    this.listening.abort()
    if (this.lost || this.gl.isContextLost()) return
    const gl = this.gl
    for (const scene of [...this.uploads.keys()]) this.forget(scene)
    for (const entry of this.textures.values()) gl.deleteTexture(entry.texture)
    this.textures.clear()
    this.releaseTarget()
    for (const { buffer, vao } of [this.stream, this.fieldStream]) { gl.deleteBuffer(buffer); gl.deleteVertexArray(vao) }
    for (const { program } of [this.main, this.cover, this.fieldProgram]) gl.deleteProgram(program)
    // An offscreen canvas belongs to this renderer alone: let its context go at once.
    if (typeof OffscreenCanvas !== 'undefined' && this.canvas instanceof OffscreenCanvas) gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
