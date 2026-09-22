import { normalize3, rotZ } from './hardVacuum/math.ts'
import type { V3, Vector2 } from './hardVacuum/types'
export type { V3, Vector2 } from './hardVacuum/types'

export type Outline = readonly (readonly [number, number])[]
export interface Part {
  verts: V3[]
  faces: number[][]
  color: string
  at: V3
  rotation?: V3
  spin?: number
  glow?: boolean
  // Optional interior seams: vertex pair and opacity. Silhouette edges stay crisp.
  edges?: readonly (readonly [number, number, number])[]
  // Coplanar details belong to a specific hull face, not the assembly's
  // average-depth sort. They inherit that face's projection and visibility.
  markings?: { face: number; verts: V3[]; color: string; glow?: boolean }[]
}
/** Sculpted hull plating shared by the pilot ship and station craft. */
export function bevel(lower: Outline, upper: Outline, color: string, bottom = 3, top = -3, glow = false): Part {
  const n = lower.length
  return {
    verts: [...lower.map(([x, y]): V3 => [x, y, bottom]), ...upper.map(([x, y]): V3 => [x, y, top])],
    faces: [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => 2 * n - i - 1),
      ...lower.map((_, i) => [i, n + i, n + (i + 1) % n, (i + 1) % n])],
    color, at: [0, 0, 0], glow,
    // Crisp silhouette, quiet inset rim: shading describes the bevel instead
    // of outlining every small corner and glass facet.
    edges: lower.flatMap((_, i): [number, number, number][] => [
      [i, (i + 1) % n, 1], [n + i, n + (i + 1) % n, glow ? 0 : .25],
    ]),
  }
}

// Reuse trigonometry across an assembly/part without changing rotation order.
const rotation = (angles: V3) => {
  const cx=Math.cos(angles[0]),sx=Math.sin(angles[0]),cy=Math.cos(angles[1]),sy=Math.sin(angles[1]),cz=Math.cos(angles[2]),sz=Math.sin(angles[2])
  return (p:V3):V3=>{
    const y=p[1]*cx-p[2]*sx,z=p[1]*sx+p[2]*cx
    const x=p[0]*cy+z*sy,depth=-p[0]*sy+z*cy
    return [x*cz-y*sz,x*sz+y*cz,depth]
  }
}
const colorCache = new Map<string, V3>()
const rgb = (color: string): V3 => {
  if (!colorCache.has(color)) colorCache.set(color, [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) as V3)
  return colorCache.get(color)!
}

/** The same perspective, tumbling facets and lit edges as the ship and rocks.
 * Sort faces across the whole assembly, so struts and inset machinery occlude
 * one another correctly instead of looking like stacked flat icons. */
export function drawModel(ctx: CanvasRenderingContext2D, pos: Vector2, parts: readonly Part[], angles: V3, time: number, scale = 1, illumination = 0, material: 'vector' | 'solid' = 'vector', lightAngle = 0) {
  type Marking = { points: Vector2[]; color: V3; glow: boolean }
  const faces: { points: Vector2[]; z: number; color: V3; shade: number; glow: boolean; edges?: number[]; markings: Marking[] }[] = []
  const solid=material==='solid', rotateAssembly=rotation(angles)
  const light: V3 = material==='solid' ? rotZ([-.38,-.48,-.79],-lightAngle) : [0.25, -0.45, -0.86]
  const project = (p: V3): Vector2 => {
    const perspective=420/(420+p[2])
    return {x:p[0]*perspective*scale,y:p[1]*perspective*scale}
  }
  for (const part of parts) {
    const edgeKey = (a:number,b:number) => `${Math.min(a,b)}:${Math.max(a,b)}`
    // Solid models use shaded joins, never the vector material's edge graph.
    const edges = !solid && part.edges ? new Map(part.edges.map(([a,b,opacity])=>[edgeKey(a,b),opacity])) : undefined
    const local = part.rotation ?? [0, 0, 0]
    const rotatePart=rotation([local[0],local[1],local[2]+time*(part.spin??0)])
    const transform = (v: V3) => {
      const p = rotatePart(v)
      return rotateAssembly([p[0] + part.at[0], p[1] + part.at[1], p[2] + part.at[2]])
    }
    const vertices = part.verts.map(transform)
    const projected = vertices.map(project)
    const visibleFaces = part.faces.flatMap((face, index) => {
      // Newell's normal uses the whole polygon. Beveled quads can be slightly
      // twisted; using their first triangle makes mirrored faces disagree.
      let nx=0,ny=0,nz=0
      for(let i=0;i<face.length;i++){
        const a=vertices[face[i]],b=vertices[face[(i+1)%face.length]]
        nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1])
      }
      const normal=normalize3([nx,ny,nz])
      return normal[2] > 0.02 ? [] : [{ face, normal, index }]
    })
    const visibleEdges = new Map<string, number>()
    if (edges) {
      for (const { face } of visibleFaces) for (let i = 0; i < face.length; i++) {
        const key = edgeKey(face[i], face[(i + 1) % face.length])
        visibleEdges.set(key, (visibleEdges.get(key) ?? 0) + 1)
      }
    }
    for (const { face, normal, index } of visibleFaces) {
      const points = face.map(i => projected[i])
      faces.push({ points, z: face.reduce((sum, i) => sum + vertices[i][2], 0) / face.length, color: rgb(part.color), shade: Math.max(0, normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]), glow: !!part.glow,
        markings:(part.markings ?? []).filter(marking=>marking.face===index).map(marking=>({points:marking.verts.map(v=>project(transform(v))),color:rgb(marking.color),glow:!!marking.glow})),
        // An edge shared by two visible faces is a seam; with only one it is
        // the silhouette, even when banking exposes the quieter upper rim.
        edges:edges && face.map((a,i)=>{
          const key=edgeKey(a,face[(i+1)%face.length])
          return visibleEdges.get(key)===1 ? 1 : edges.get(key) ?? 0
        }) })
    }
  }
  faces.sort((a, b) => b.z - a.z)
  ctx.save()
  ctx.translate(pos.x, pos.y)
  ctx.lineJoin = 'round'
  for (const face of faces) {
    ctx.beginPath()
    face.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
    ctx.closePath()
    const brightness = (solid ? .24+face.shade*.62 : face.glow ? 0.4 + face.shade * 0.35 : 0.025 + face.shade * 0.055) + illumination * 0.25
    const [r, g, b] = face.color
    ctx.shadowBlur = 0
    ctx.fillStyle = `rgb(${Math.round(r * brightness)},${Math.round(g * brightness)},${Math.round(b * brightness)})`
    ctx.fill()
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + face.shade * 0.45})`
    ctx.lineWidth = face.glow ? 1.6 : 1.4
    ctx.shadowBlur = (face.glow&&!solid ? 4 : 0) + illumination * (solid ? 8 : 16)
    ctx.shadowColor = `rgba(${r},${g},${b},${0.25 + illumination * 0.5})`
    if(solid){
      // A thin dark join closes raster seams. Form comes from lit faces; there
      // is no illuminated wire cage or glow around glass and body panels.
      ctx.shadowBlur=0;ctx.strokeStyle=`rgba(${Math.round(r*brightness*.75)},${Math.round(g*brightness*.75)},${Math.round(b*brightness*.75)},.45)`
      ctx.lineWidth=.45;ctx.stroke()
    } else if (face.edges) {
      face.edges.forEach((opacity,i)=>{
        if (!opacity) return
        const start=face.points[i],end=face.points[(i+1)%face.points.length]
        ctx.strokeStyle=`rgba(${r},${g},${b},${(.5+face.shade*.45)*opacity})`
        ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke()
      })
    } else ctx.stroke()
    for (const marking of face.markings) {
      ctx.beginPath()
      marking.points.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y))
      ctx.closePath()
      const brightness=(solid ? .35+face.shade*.5 : marking.glow ? .55+face.shade*.25 : .08+face.shade*.12)+illumination*.25
      const [r,g,b]=marking.color
      ctx.fillStyle=`rgb(${Math.round(r*brightness)},${Math.round(g*brightness)},${Math.round(b*brightness)})`
      ctx.shadowBlur=marking.glow&&!solid ? 2 : 0
      ctx.shadowColor=`rgba(${r},${g},${b},.3)`
      ctx.fill()
      if(!solid){ctx.strokeStyle=`rgba(${r},${g},${b},.8)`;ctx.lineWidth=.8;ctx.stroke()}
    }
  }
  ctx.restore()
}
