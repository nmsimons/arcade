import { GpuShadowMask } from './lightingGpuShadows.ts'
import type { CasterGroup, LightSource } from './lightingModel.ts'
import { ambientExposure, sourceCovered } from './lightingModel.ts'
import type { LightingView } from './lightingRender.ts'
import { DAY_AMBIENT_EXPOSURE } from './daylight.ts'

/** Resolve every lamp on one GPU context. The output atlas contains the opaque
 * max-exposure field on the left and premultiplied source haze on the right.
 * Artwork and its existing exposure/occlusion composition stay in Canvas. */
export class GpuLightingField {
  readonly shadows: GpuShadowMask
  readonly canvas: HTMLCanvasElement
  readonly gl: WebGL2RenderingContext
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null> = {}
  target: WebGLFramebuffer
  resolved: WebGLFramebuffer
  mask: WebGLTexture
  color: WebGLRenderbuffer
  stencil: WebGLRenderbuffer
  samples: number
  private width = 0
  private height = 0
  static create(allowSoftware = false) {
    let shadows: GpuShadowMask | undefined
    try { shadows = new GpuShadowMask(allowSoftware); return new GpuLightingField(shadows) }
    catch { shadows?.dispose(); return null }
  }
  private constructor(shadows: GpuShadowMask) {
    this.shadows = shadows; this.canvas = shadows.canvas; this.gl = shadows.gl
    const gl = this.gl
    const shader = (kind: number, source: string) => {
      const s = gl.createShader(kind)!; gl.shaderSource(s, source); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!)
      return s
    }
    const vertex = shader(gl.VERTEX_SHADER, `#version 300 es
      layout(location = 0) in vec2 position;
      uniform vec2 viewport;
      out vec2 pixel;
      void main() { pixel = position; gl_Position = vec4(position / viewport * vec2(2., -2.) + vec2(-1., 1.), 0., 1.); }`)
    const fragment = shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      in vec2 pixel;
      uniform sampler2D mask;
      uniform vec2 viewport, source, aim;
      uniform vec4 room;
      uniform float ambient, fade, halfAngle, zoom, mode;
      out vec4 color;
      float smoothCurve(float t) { return t*t*(3.-2.*t); }
      float exposure(float t) { return floor((ambient+(1.-ambient)*fade*t)*255.+.5)/255.; }
      // Match the existing Canvas gradients' seventeen quantized color stops.
      float linearEdge(float t) {
        float s = clamp(t,0.,1.)*16.;
        return mix(exposure(smoothCurve(floor(s)/16.)),exposure(smoothCurve(min(16.,floor(s)+1.)/16.)),fract(s));
      }
      void main() {
        if (mode > 1.5) {
          float a = floor(ambient*255.+.5)/255.;
          float shadow = texture(mask,vec2(pixel.x/viewport.x,1.-pixel.y/viewport.y)).r;
          color = vec4(vec3(1.-(1.-a)*shadow),1.);
          return;
        }
        vec2 offset = (pixel-source)/zoom;
        vec2 local = vec2(dot(offset,aim),dot(offset,vec2(-aim.y,aim.x)));
        float interior = local.x*sin(halfAngle)-abs(local.y)*cos(halfAngle);
        float angular = length(local) < 0.00001 ? 0. : abs(atan(local.y,local.x))/halfAngle;
        float angularStrength = linearEdge(1.-(angular-.95)/.05);
        float cone = max(linearEdge(interior/2.),angularStrength);
        float transmission = 1.-texture(mask,vec2(pixel.x/viewport.x,1.-pixel.y/viewport.y)).r;
        float inRoom = clamp(min(min(pixel.x-room.x,room.z-pixel.x),min(pixel.y-room.y,room.w-pixel.y))+.5,0.,1.);
        if (mode < .5) {
          float a = floor(ambient*255.+.5)/255.;
          float value = a + (cone-a)*transmission*inRoom;
          color = vec4(vec3(value),1.);
        } else {
          float t = clamp((length(local)-6.)/50.,0.,1.);
          float radial = t < .4 ? 1.-1.5*t : .4*(1.-t)/.6;
          float edge = clamp(interior*zoom+.5,0.,1.);
          float strength = .18*fade*(1.-(ambient-.35)/.65);
          float alpha = strength*radial*edge*transmission*inRoom;
          color = vec4(vec3(244.,242.,233.)/255.*alpha,alpha);
        }
      }`)
    this.program = gl.createProgram()!; gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program)!)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    for (const name of ['viewport', 'source', 'aim', 'room', 'ambient', 'fade', 'halfAngle', 'zoom', 'mode', 'mask']) this.uniforms[name] = gl.getUniformLocation(this.program, name)
    this.target = gl.createFramebuffer()!; this.resolved = gl.createFramebuffer()!
    this.mask = gl.createTexture()!; this.color = gl.createRenderbuffer()!; this.stencil = gl.createRenderbuffer()!
    const colorSamples: number[] = [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.R8, gl.SAMPLES)]
    const stencilSamples: number[] = [...gl.getInternalformatParameter(gl.RENDERBUFFER, gl.STENCIL_INDEX8, gl.SAMPLES)]
    this.samples = 4
    if (!colorSamples.includes(4) || !stencilSamples.includes(4)) throw new Error('Four-sample R8/stencil rendering unavailable')
  }
  resize(width: number, height: number) {
    if (this.width === width && this.height === height) return
    const gl = this.gl
    const maximum = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE))
    const viewport: Int32Array = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
    if (width * 2 > Math.min(maximum, viewport[0]) || height > Math.min(maximum, viewport[1])) throw new Error('Lighting viewport exceeds graphics limits.')
    this.canvas.width = width*2; this.canvas.height = height
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.color); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.R8, width, height)
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.stencil); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.STENCIL_INDEX8, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, this.color)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.stencil)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Shadow framebuffer incomplete')
    gl.bindTexture(gl.TEXTURE_2D, this.mask); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.resolved); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mask, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Resolve framebuffer incomplete')
    this.width = width; this.height = height
  }
  render(groups: readonly CasterGroup[], sources: readonly LightSource[], view: LightingView, ambient: number, roomWidth: number, roomHeight: number, daylight = false) {
    if (this.gl.isContextLost()) throw new Error('Lighting graphics context lost.')
    this.resize(view.width, view.height)
    const gl = this.gl, u = this.uniforms, { width, height } = view
    const exposure = daylight ? DAY_AMBIENT_EXPOSURE : ambientExposure(ambient), a = Math.round(exposure*255)/255
    const sun = daylight ? this.renderDaylight(groups, view, roomWidth, roomHeight) : undefined
    if (!sun) {
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.colorMask(true,true,true,true); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0,0,width,height); gl.clearColor(a,a,a,1); gl.clear(gl.COLOR_BUFFER_BIT); gl.disable(gl.SCISSOR_TEST)
    }
    let lights=sun?.lights ?? 0, edges=sun?.edges ?? 0, vertexBytes=this.shadows.vertexBytes
    for (const light of sources) {
      if (sourceCovered(light, groups)) continue
      lights++
      const reach = Math.max(...[view.x,view.x+width/view.zoom].flatMap(x => [view.y,view.y+height/view.zoom].map(y => Math.hypot(x-light.x,y-light.y))))+1/view.zoom
      edges += this.shadows.render(groups, light, view, reach, this.target)
      vertexBytes = Math.max(vertexBytes, this.shadows.vertexBytes)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.target); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.resolved)
      gl.blitFramebuffer(0,0,width,height,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.NEAREST)
      gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.useProgram(this.program)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.mask); gl.uniform1i(u.mask,0)
      gl.uniform2f(u.viewport,width,height); gl.uniform2f(u.source,(light.x-view.x)*view.zoom,(light.y-view.y)*view.zoom)
      const angle=light.direction*Math.PI/180
      gl.uniform2f(u.aim,Math.cos(angle),Math.sin(angle)); gl.uniform1f(u.halfAngle,light.spread*Math.PI/360)
      gl.uniform1f(u.fade,light.fade); gl.uniform1f(u.zoom,view.zoom); gl.uniform1f(u.ambient,exposure)
      gl.uniform4f(u.room,-view.x*view.zoom,-view.y*view.zoom,(roomWidth-view.x)*view.zoom,(roomHeight-view.y)*view.zoom)
      gl.viewport(0,0,width,height); gl.uniform1f(u.mode,0); gl.blendEquation(gl.MAX); gl.drawArrays(gl.TRIANGLES,0,6)
      if (!daylight) {
        gl.viewport(width,0,width,height); gl.uniform1f(u.mode,1); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA); gl.drawArrays(gl.TRIANGLES,0,6)
      }
    }
    // RGBA output atlas (two panels), resolved R8 mask, and multisampled R8 +
    // stencil8 attachments. Driver/browser copies are outside this estimate.
    if (gl.isContextLost()) throw new Error('Lighting graphics context lost.')
    return { lights, edges, bufferBytes: width*height*(8+1+this.samples*2) + vertexBytes }
  }
  renderDaylight(groups: readonly CasterGroup[], view: LightingView, roomWidth: number, roomHeight: number) {
    if (this.gl.isContextLost()) throw new Error('Lighting graphics context lost.')
    this.resize(view.width, view.height)
    const gl = this.gl, u = this.uniforms, { width, height } = view
    const edges = this.shadows.renderDaylight(groups, view, roomWidth, roomHeight, this.target)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.target); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolved)
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.colorMask(true, true, true, true)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mask)
    gl.uniform1i(u.mask, 0); gl.uniform2f(u.viewport, width, height); gl.uniform1f(u.ambient, DAY_AMBIENT_EXPOSURE)
    gl.uniform1f(u.mode, 2); gl.viewport(0, 0, width, height); gl.drawArrays(gl.TRIANGLES, 0, 6)
    if (gl.isContextLost()) throw new Error('Lighting graphics context lost.')
    return { lights: 1, edges, bufferBytes: width * height * (8 + 1 + this.samples * 2) + this.shadows.vertexBytes }
  }
  dispose() {
    const gl=this.gl
    gl.deleteFramebuffer(this.target); gl.deleteFramebuffer(this.resolved); gl.deleteTexture(this.mask)
    gl.deleteRenderbuffer(this.color); gl.deleteRenderbuffer(this.stencil); gl.deleteProgram(this.program); this.shadows.dispose()
  }
}
