import { polygonPoints } from './geometry'
import type { Vec } from './geometry'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { addPolygon, anchorRope, moveVertex, polygonPlatform, addItem, allSelections, clamp, deleteItem, duplicateItem, hitItem, itemBounds, itemOutline, itemHandle, moveItem, replacePlatform, resizeItem, resizeLevelHeight } from './editor'
import type { Selection, Tool } from './editor'
import { copyLevel, DRAFT_STORAGE_KEY, LEVEL_GRID_SIZE, isPuzzleLevel, levelPlayer, levelProblems, levelTerrain, levelHeight, newLevelId, parseLevel, playgroundCopy, prepareLevelRopes, readSavedLevels, saveLevel } from './level'
import type { JumpLevel } from './level'
import { drawAthlete, drawClimbables, drawTerrain, drawLevelBackdrop } from './render'
import { blankTrial, CAMPAIGN } from './levels'
import { copyForEditing } from './puzzleEditor'
import { createRun } from './challenge'
import { drawPuzzleWorld } from './challengeRender'
import { BuilderIcon } from './BuilderIcon'
import { LevelThumbnail } from './LevelThumbnail'
import { TUNING } from './model'
import './builder.css'

type Point = { x: number; y: number }
type View = Point & { zoom: number }
const homeView = (level: JumpLevel, height: number): View => ({ x: Math.max(0, level.spawn.x - 200), y: Math.max(100, level.spawn.y - height / .8 * .72), zoom: .8 })
type Drag = { mode: 'move' | 'resize' | 'point' | 'draw' | 'pan'; start: Point; screen: Point; base: JumpLevel; view: View; selection: Selection | null; point?: number }
const TOOLS: { id: Tool; group: string; label: string; help: string }[] = [
  { id: 'select', group: 'Navigate', label: 'Select', help: 'Drag to move. Drag the corner handle to resize. Shift + arrow nudges one unit.' },
  { id: 'pan', group: 'Navigate', label: 'Pan', help: 'Drag to move around the level. Hold Space or the middle mouse button to pan from any tool.' },
  { id: 'platform', group: 'Terrain', label: 'Rectangle', help: 'Drag any rectangle. Terrain stays where you place it, including in midair.' },
  { id: 'polygon', group: 'Terrain', label: 'Polygon', help: 'Click each corner, then click the first corner or press Enter to close. Slopes over 45 degrees make the player slide.' },
  { id: 'rope', group: 'Movement', label: 'Rope', help: 'Drag down from the anchor. Start near a terrain edge to attach the anchor to it.' },
  { id: 'ladder', group: 'Movement', label: 'Ladder', help: 'Drag down anywhere to place a ladder. Move it or change its height in the inspector.' },
  { id: 'spawn', group: 'Markers', label: 'Start', help: 'Click a surface to choose where the player starts.' },
  { id: 'flag', group: 'Markers', label: 'Finish flag', help: 'Click a clear surface for the finish. Reaching it stops the timer.' },
  { id: 'checkpoint', group: 'Markers', label: 'Checkpoint', help: 'Reset marker for movement playgrounds. Time trials always restart at the beginning.' },
]
function initialEditor() {
  let level: JumpLevel = blankTrial(), library: JumpLevel[] = [], error = ''
  try {
    library = readSavedLevels(localStorage)
    const draft = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (draft) level = parseLevel(JSON.parse(draft))
  } catch { error = 'Some local level data could not be loaded. Saved levels have been kept.' }
  return { level: prepareLevelRopes(level), library, error }
}
const selectionLabel = (s: Selection, level: JumpLevel) => {
  const name = s.kind === 'spawn' ? 'Start' : s.kind === 'flag' ? 'Finish flag' : s.kind === 'prop' ? level.props?.[s.index]?.kind === 'ball' ? 'Ball' : 'Crate'
    : s.kind === 'robot' ? 'Pusher' : s.kind === 'trigger' ? 'Pressure plate' : s.kind === 'mechanism' ? level.mechanisms?.[s.index]?.kind === 'gate' ? 'Gate' : 'Elevator' : s.kind === 'platform' ? 'Terrain' : s.kind[0].toUpperCase() + s.kind.slice(1)
  return `${name}${s.kind === 'spawn' || s.kind === 'flag' ? '' : ` ${s.index + 1}`}`
}


export function LevelBuilder({ active, onPlay, onClose }: { active: boolean; onPlay: (level: JumpLevel) => void; onClose: () => void }) {
  const [initial] = useState(initialEditor)
  const [history, setHistory] = useState({ past: [] as JumpLevel[], present: initial.level, future: [] as JumpLevel[] })
  const [preview, setPreview] = useState<JumpLevel | null>(null)
  const level = prepareLevelRopes(preview ?? history.present)
  const roomHeight = levelHeight(level)
  const [library, setLibrary] = useState(initial.library), [libraryId, setLibraryId] = useState('')
  const [message, setMessage] = useState(initial.error), [draftStatus, setDraftStatus] = useState('')
  const [tool, setTool] = useState<Tool>('select'), [selection, setSelection] = useState<Selection | null>(null)
  const [panel, setPanel] = useState<'build' | 'library'>('build')
  const [jumpGuide, setJumpGuide] = useState(false), [keepTool, setKeepTool] = useState(false)
  const [vertices, setVertices] = useState<Vec[]>([])
  const panHeld = useRef(false)
  const [pointer, setPointer] = useState<Point | null>(null)
  const [snap, setSnap] = useState(true), [view, setView] = useState<View>({ x: 0, y: 100, zoom: .8 })
  const [size, setSize] = useState({ width: 800, height: 600 })
  const canvasRef = useRef<HTMLCanvasElement>(null), fileRef = useRef<HTMLInputElement>(null), drag = useRef<Drag | null>(null)
  const latestPreview = useRef<JumpLevel | null>(null)
  const framed = useRef(false)
  const bounds = selection ? itemBounds(level, selection) : null
  const outline = selection ? itemOutline(level, selection) : null
  const handlePoint = selection ? itemHandle(level, selection) : null
  const chosen = selection?.kind === 'platform' ? level.platforms[selection.index] : null
  const problems = levelProblems(level), problem = problems[0]
  const mechanism = selection?.kind === 'mechanism' ? level.mechanisms?.[selection.index] : null
  const trigger = selection?.kind === 'trigger' ? level.triggers?.[selection.index] : null
  const robot = selection?.kind === 'robot' ? level.robots?.[selection.index] : null
  const quantize = useCallback((v: number) => snap ? Math.round(v / LEVEL_GRID_SIZE) * LEVEL_GRID_SIZE : Math.round(v), [snap])
  const quantizeY = useCallback((y: number) => roomHeight - quantize(roomHeight - y), [roomHeight, quantize])

  function commit(next: JumpLevel) {
    next = prepareLevelRopes(next)
    setHistory(h => JSON.stringify(next) === JSON.stringify(h.present) ? h : { past: [...h.past, h.present].slice(-60), present: next, future: [] })
    setPreview(null); latestPreview.current = null; setMessage('')
  }
  function undo() {
    if (history.past.length) keepFloorInView(history.past.at(-1)!)
    setHistory(h => h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h)
    setSelection(null); setPreview(null); latestPreview.current = null; drag.current = null
  }
  function redo() {
    if (history.future.length) keepFloorInView(history.future[0])
    setHistory(h => h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)
    setSelection(null); setPreview(null); latestPreview.current = null; drag.current = null
  }
  function keepFloorInView(next: JumpLevel) {
    const dy = levelHeight(next) - levelHeight(history.present)
    if (!dy) return
    setView(v => ({ ...v, y: v.y + dy }))
    setPointer(p => p && { ...p, y: p.y + dy })
    setVertices(points => points.map(([x, y]) => [x, y + dy]))
  }
  function load(next: JumpLevel) {
    setVertices([]); commit(copyLevel(next)); setSelection(null); setTool('select'); setView(homeView(next, size.height))
  }
  function remove() {
    if (selection) { commit(deleteItem(history.present, selection)); setSelection(null) }
  }
  function add(tool: Tool, start: Point, end: Point) {
    try {
      const added = addItem(history.present, tool, start, end)
      if (added) { commit(added.level); setSelection(added.selection); if (!keepTool) setTool('select') }
    } catch (error) { setMessage((error as Error).message) }
  }
  function finishPolygon() {
    try {
      const added = addPolygon(history.present, vertices)
      commit(added.level); setSelection(added.selection); setVertices([]); if (!keepTool) setTool('select')
    } catch (error) { setMessage((error as Error).message) }
  }
  function save() {
    try { setLibrary(saveLevel(localStorage, prepareLevelRopes(history.present))); setLibraryId(level.id); setMessage(`Saved “${level.name}” in this browser.`) }
    catch (error) { setMessage(`Could not save: ${(error as Error).message}`) }
  }
  function exportLevel() {
    try {
    const url = URL.createObjectURL(new Blob([JSON.stringify(parseLevel(prepareLevelRopes(history.present)), null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `${level.name.replace(/[^a-z0-9 -]/gi, '').trim() || 'jumping-level'}.jump-level.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Level exported. Give this .jump-level.json file to Codex to add it to the game, or import it here to keep editing.')
    } catch (error) { setMessage(`Could not export: ${(error as Error).message}`) }
  }
  async function importFile(file?: File) {
    if (!file) return
    try {
      if (file.size > 1_000_000) throw new Error('Please choose a level file smaller than 1 MB.')
      const imported = parseLevel(JSON.parse(await file.text()))
      load({ ...imported, id: newLevelId() }); setMessage(`Imported “${imported.name}”. Save it to add it to your library.`)
    } catch (error) { setMessage(`Could not import: ${(error as Error).message}`) }
    if (fileRef.current) fileRef.current.value = ''
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(parseLevel(prepareLevelRopes(history.present)))); setDraftStatus('Draft saved locally') }
      catch { setDraftStatus('Draft not saved. Check the settings or export a valid copy; the previous draft is kept.') }
    }, 500)
    return () => clearTimeout(timer)
  }, [history.present])
  useEffect(() => {
    if (!active || !canvasRef.current) return
    const canvas = canvasRef.current
    const resize = () => {
      const r = canvas.getBoundingClientRect(); setSize({ width: r.width, height: r.height })
      if (!framed.current && r.height > 0) {
        setView({ x: -60, y: -60, zoom: Math.min(r.width / (initial.level.width + 120), r.height / (levelHeight(initial.level) + 120)) }); framed.current = true
      }
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize()
    canvas.focus({ preventScroll: true })
    return () => observer.disconnect()
  }, [active, initial.level])
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!, ratio = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(size.width * ratio); canvas.height = Math.round(size.height * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = '#eeeee6'; ctx.fillRect(0, 0, size.width, size.height)
    ctx.save(); ctx.scale(view.zoom, view.zoom); ctx.translate(-view.x, -view.y)
    drawLevelBackdrop(ctx, level, { x: view.x, y: view.y, w: size.width / view.zoom, h: size.height / view.zoom }, view.zoom)
    if (vertices.length) {
      ctx.beginPath(); vertices.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
      if (pointer) ctx.lineTo(quantize(pointer.x), quantizeY(pointer.y))
      ctx.closePath(); ctx.fillStyle = '#999c9e88'; ctx.fill(); ctx.strokeStyle = '#c65231'; ctx.lineWidth = 2 / view.zoom; ctx.stroke()
      for (const [x, y] of vertices) { ctx.beginPath(); ctx.arc(x, y, 4 / view.zoom, 0, Math.PI * 2); ctx.fillStyle = '#c65231'; ctx.fill() }
    }
    const player = levelPlayer(level)
    if (isPuzzleLevel(level)) drawPuzzleWorld(ctx, createRun(level))
    else { drawTerrain(ctx, levelTerrain(level)); drawClimbables(ctx, player, level.climbables); ctx.globalAlpha = .55; drawAthlete(ctx, player); ctx.globalAlpha = 1 }
    ctx.fillStyle = '#ce6548'; ctx.beginPath(); ctx.arc(level.spawn.x, level.spawn.y + 12, 4 / view.zoom, 0, Math.PI * 2); ctx.fill()
    if (jumpGuide) {
      const origin = chosen ? { x: chosen.x + chosen.w - 14, y: chosen.y } : level.spawn
      for (const [speed, color] of [[TUNING.jumpSpeed, '#98a58b'], [TUNING.chargedJumpSpeed, '#b28543']] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5 / view.zoom; ctx.setLineDash([4 / view.zoom, 4 / view.zoom]); ctx.beginPath()
        const duration = speed * 2 / TUNING.gravity
        for (let i = 0; i <= 60; i++) { const t = i / 60 * duration, x = origin.x + TUNING.runSpeed * t, y = origin.y - speed * t + TUNING.gravity * t * t / 2; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
        ctx.stroke(); ctx.setLineDash([])
      }
    }
    if (mechanism) {
      ctx.strokeStyle = '#b78947'; ctx.lineWidth = 1 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
      ctx.strokeRect(mechanism.x, mechanism.y - mechanism.travel, mechanism.w, mechanism.h)
      ctx.beginPath(); ctx.moveTo(mechanism.x + mechanism.w / 2, mechanism.y); ctx.lineTo(mechanism.x + mechanism.w / 2, mechanism.y - mechanism.travel); ctx.stroke(); ctx.setLineDash([])
    }
    if (robot) {
      ctx.strokeStyle = '#cc6a49'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 3 / view.zoom]); ctx.beginPath(); ctx.moveTo(robot.left, robot.y - 65); ctx.lineTo(robot.right, robot.y - 65); ctx.stroke(); ctx.setLineDash([])
      for (const x of [robot.left, robot.right]) { ctx.beginPath(); ctx.arc(x, robot.y - 65, 3 / view.zoom, 0, Math.PI * 2); ctx.fill() }
    }
    if (outline) {
      ctx.strokeStyle = '#c65231'; ctx.lineWidth = 2 / view.zoom; ctx.setLineDash([5 / view.zoom, 4 / view.zoom])
      ctx.strokeRect(outline.x - 4, outline.y - 4 - (outline.h ? 0 : 62), Math.max(8, outline.w + 8), Math.max(8, outline.h + 8 + (outline.h ? 0 : 62)))
      ctx.setLineDash([])
      if (selection && handlePoint && ['platform', 'rope', 'ladder', 'prop', 'mechanism', 'trigger'].includes(selection.kind)) {
        const handle = 9 / view.zoom; ctx.fillStyle = '#c65231'
        ctx.fillRect(handlePoint.x - handle / 2, handlePoint.y + 14 / view.zoom - handle / 2, handle, handle)
      }
      if (chosen) for (const [wx, wy] of polygonPoints(chosen)) {
        ctx.beginPath(); ctx.arc(wx, wy, 4.5 / view.zoom, 0, Math.PI * 2)
        ctx.fillStyle = '#fffdf5'; ctx.fill(); ctx.stroke()
      }
    }
    ctx.restore()
  }, [active, level, view, size, outline, handlePoint, chosen, selection, jumpGuide, mechanism, robot, vertices, pointer, quantize, quantizeY])

  function position(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: view.x + (event.clientX - rect.left) / view.zoom, y: view.y + (event.clientY - rect.top) / view.zoom }
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0 && event.button !== 1) return
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
    const p = position(event), screen = { x: event.clientX, y: event.clientY }, base = history.present
    latestPreview.current = null
    if (tool === 'pan' || panHeld.current || event.button === 1) { drag.current = { mode: 'pan', start: p, screen, base, view, selection: null }; return }
    if (tool === 'polygon') {
      if (vertices.length >= 3 && Math.hypot(p.x - vertices[0][0], p.y - vertices[0][1]) < 12 / view.zoom) finishPolygon()
      else setVertices(v => [...v, [clamp(quantize(p.x), 0, level.width), clamp(quantizeY(p.y), 0, roomHeight)]])
      return
    }
    if (tool !== 'select') { drag.current = { mode: 'draw', start: { x: quantize(p.x), y: quantizeY(p.y) }, screen, base, view, selection: null }; return }
    if (selection && handlePoint && Math.hypot(p.x - handlePoint.x, p.y - handlePoint.y - 14 / view.zoom) < 11 / view.zoom) {
      drag.current = { mode: 'resize', start: p, screen, base, view, selection }; return
    }
    if (selection && chosen) {
      const point = polygonPoints(chosen).findIndex(([x, y]) => Math.hypot(p.x - x, p.y - y) < 10 / view.zoom)
      if (point >= 0) { drag.current = { mode: 'point', start: p, screen, base, view, selection, point }; return }
    }
    const hit = hitItem(level, p.x, p.y, 9 / view.zoom)
    setSelection(hit); drag.current = hit ? { mode: 'move', start: p, screen, base, view, selection: hit } : null
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current
    if (!d) { setPointer(position(event)); return }
    if (d.mode === 'pan') { setView({ ...d.view, x: d.view.x - (event.clientX - d.screen.x) / d.view.zoom, y: d.view.y - (event.clientY - d.screen.y) / d.view.zoom }); return }
    const p = position(event), dx = p.x - d.start.x, dy = p.y - d.start.y
    let next: JumpLevel | null = null
    if (d.mode === 'draw') {
      try { next = addItem(d.base, tool, d.start, { x: quantize(p.x), y: quantizeY(p.y) })?.level ?? null } catch { /* Explain invalid placement when released. */ }
    } else if (d.selection) {
      const b = itemBounds(d.base, d.selection)!
      if (d.mode === 'move') next = moveItem(d.base, d.selection, quantize(b.x + dx) - b.x, quantizeY(b.y + dy) - b.y)
      if (d.mode === 'resize') next = resizeItem(d.base, d.selection,
        Math.max(snap ? LEVEL_GRID_SIZE : 1, quantize(b.x + b.w + dx) - b.x),
        Math.max(snap ? LEVEL_GRID_SIZE : 1, quantizeY(b.y + b.h + dy) - b.y))
      if (d.mode === 'point') {
        const point = polygonPoints(d.base.platforms[d.selection.index])[d.point!]
        next = moveVertex(d.base, d.selection.index, d.point!, quantize(point[0] + dx) - point[0], quantizeY(point[1] + dy) - point[1])
      }
    }
    if (next) { latestPreview.current = next; setPreview(next) }
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const d = drag.current; drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!d) return
    if (d.mode === 'draw') { const p = position(event); add(tool, d.start, { x: quantize(p.x), y: quantizeY(p.y) }) }
    else if (latestPreview.current) commit(latestPreview.current)
    setPreview(null); latestPreview.current = null
  }
  function zoom(factor: number, at = { x: size.width / 2, y: size.height / 2 }) {
    setView(v => { const z = clamp(v.zoom * factor, .08, 2.5); return { zoom: z, x: v.x + at.x / v.zoom - at.x / z, y: v.y + at.y / v.zoom - at.y / z } })
  }
  function setDimension(axis: 'x' | 'y' | 'w' | 'h', value: number) {
    if (!selection || !bounds || !Number.isFinite(value)) return
    commit(axis === 'x' || axis === 'y' ? moveItem(history.present, selection, axis === 'x' ? value - bounds.x : 0, axis === 'y' ? roomHeight - value - bounds.y : 0)
      : resizeItem(history.present, selection, axis === 'w' ? value : bounds.w, axis === 'h' ? value : bounds.h))
  }

  function duplicate() {
    if (!selection) return
    const result = duplicateItem(history.present, selection)
    if (result) { commit(result.level); setSelection(result.selection) }
  }
  function fitLevel(next = level) {
    const z = Math.min(size.width / (next.width + 120), size.height / (levelHeight(next) + 120))
    setView({ x: -60, y: -60, zoom: clamp(z, .08, 2.5) })
  }
  function chooseTemplate(template: JumpLevel) { const next = copyForEditing(template); load(next); fitLevel(next); setPanel('build') }
  function changeObject(field: string, value: number | string) {
    if (!selection) return
    const next = copyLevel(history.present)
    if (selection.kind === 'mechanism') next.mechanisms![selection.index].travel = clamp(Number(value), 60, 1200)
    if (selection.kind === 'trigger') {
      const t = next.triggers![selection.index]
      if (field === 'target') t.target = String(value)
      else t.mode = value === 'touch' ? 'touch' : 'weight'
    }
    if (selection.kind === 'robot') {
      const r = next.robots![selection.index]
      if (field === 'left') r.left = clamp(Number(value), 50, Math.min(r.x, r.right - 50))
      else r.right = clamp(Number(value), Math.max(r.x, r.left + 50), next.width - 50)
    }
    commit(next)
  }

  return <section className="jumping-builder" hidden={!active} aria-label="Level builder" onKeyDown={event => {
    if ((event.target as HTMLElement).matches('input, select, textarea')) return
    if (event.code === 'Space') { event.preventDefault(); panHeld.current = true }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
    else if (event.key === 'Enter' && vertices.length) { event.preventDefault(); finishPolygon() }
    else if (event.key === 'Escape') { setVertices([]); setTool('select'); setSelection(null); drag.current = null; setPreview(null); latestPreview.current = null }
    else if (!event.ctrlKey && !event.metaKey && ({ v: 'select', h: 'pan', p: 'platform', r: 'rope', l: 'ladder', g: 'polygon', f: 'flag' } as Record<string, Tool>)[event.key.toLowerCase()]) { event.preventDefault(); setTool(({ v: 'select', h: 'pan', p: 'platform', r: 'rope', l: 'ladder', g: 'polygon', f: 'flag' } as Record<string, Tool>)[event.key.toLowerCase()]) }
    else if (event.target === canvasRef.current && selection) {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove() }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 1 : snap ? LEVEL_GRID_SIZE : 5
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        commit(moveItem(history.present, selection,
          snap && !event.shiftKey && bounds && dx ? quantize(bounds.x + dx) - bounds.x : dx,
          snap && !event.shiftKey && bounds && dy ? quantizeY(bounds.y + dy) - bounds.y : dy))
      }
    }
  }} onKeyUp={event => { if (event.code === 'Space') panHeld.current = false }} onBlur={() => { panHeld.current = false }}>
    <header className="builder-header">
      <div className="builder-brand"><span className="builder-brand-mark" aria-hidden="true">↗</span><div><p className="jumping-eyebrow">UNTITLED JUMPING GAME</p><h1>Level studio</h1></div></div>
      <label className="builder-name">YOUR LEVEL<input aria-label="Level name" maxLength={80} value={level.name} onChange={e => commit({ ...history.present, name: e.target.value })} /></label>
      <div className="builder-main-actions"><button onClick={onClose}>Back to game</button><button onClick={save}>Save level</button><button onClick={exportLevel}>Export</button><button className="builder-play" disabled={!!problem} onClick={() => onPlay(copyLevel(history.present))}>▶ Playtest</button></div>
    </header>
    <aside className="builder-tools" aria-label="Building tools">
      <div className="builder-panel-tabs"><button aria-pressed={panel === 'build'} onClick={() => setPanel('build')}>Build</button><button aria-pressed={panel === 'library'} onClick={() => setPanel('library')}>Library</button></div>
      {panel === 'build' ? <>
        {['Terrain', 'Movement', 'Markers'].map(group => <div className="builder-tool-group" key={group}><h2>{group}</h2><div className="builder-tool-grid">{TOOLS.filter(item => item.group === group && (item.id !== 'checkpoint' || !isPuzzleLevel(level))).map(item => <button key={item.id} aria-pressed={tool === item.id} title={item.help} onClick={() => { setTool(item.id); setVertices([]); setMessage('') }}><BuilderIcon kind={item.id} /><span>{item.label}</span></button>)}</div></div>)}
        {tool === 'polygon' && <button disabled={vertices.length < 3} onClick={finishPolygon}>Finish polygon</button>}
        <label className="builder-snap"><input type="checkbox" checked={keepTool} onChange={e => setKeepTool(e.target.checked)} /> Keep placing</label>
        {!['select', 'pan', 'polygon'].includes(tool) && <button className="builder-add" onClick={() => { const p = { x: quantize(view.x + size.width / view.zoom / 2), y: quantizeY(view.y + size.height / view.zoom / 2) }; add(tool, p, p) }}>Add at view center</button>}
      </> : <>
        <h2>Start from a template</h2>
        <div className="builder-templates">{CAMPAIGN.map(template => <button key={template.id} onClick={() => chooseTemplate(template)}><LevelThumbnail level={template} /><strong>{template.name}</strong><span>{template.climbables.ropes.length ? `${template.climbables.ropes.length} rope${template.climbables.ropes.length > 1 ? 's' : ''}` : 'Charged jump'} · Pit + return ladder</span></button>)}</div>
        <div className="builder-library-actions"><button onClick={() => { load(blankTrial()); setPanel('build') }}>New level</button><button onClick={() => load(playgroundCopy())}>Copy playground</button></div>
        <h2>Your collection</h2>
        <label>Saved levels<select aria-label="Saved levels" value={libraryId} onChange={e => setLibraryId(e.target.value)}><option value="">Choose a level</option>{library.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="builder-load" disabled={!libraryId} onClick={() => { const saved = library.find(l => l.id === libraryId); if (saved) { load(saved); fitLevel(saved); setPanel('build') } }}>Load level</button>
        <button className="builder-import" onClick={() => fileRef.current?.click()}>Import level file</button>
        <p className="builder-local-note">Export a .jump-level.json file and give it to Codex to add your level to the game. It includes terrain, ladders, ropes, and your level settings.</p>
      </>}
      <input ref={fileRef} aria-label="Import level file" type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} />
    </aside>
    <div className="builder-stage">
      <div className="builder-view-controls">
        {(['select', 'pan'] as const).map(id => <button key={id} aria-label={id === 'select' ? 'Select' : 'Pan'} aria-pressed={tool === id} title={id === 'select' ? 'Select (V)' : 'Pan (H / hold Space)'} onClick={() => setTool(id)}><BuilderIcon kind={id} /></button>)}
        <div className="builder-divider" /><button disabled={!history.past.length} onClick={undo}>Undo</button><button disabled={!history.future.length} onClick={redo}>Redo</button>
        <label className="builder-inline-check"><input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} />Snap {LEVEL_GRID_SIZE}</label>
        <label className="builder-inline-check"><input type="checkbox" checked={jumpGuide} onChange={e => setJumpGuide(e.target.checked)} />Jump guide</label><span />
        <button aria-label="Zoom out" onClick={() => zoom(.8)}>−</button><output aria-label="Zoom">{Math.round(view.zoom * 100)}%</output><button aria-label="Zoom in" onClick={() => zoom(1.25)}>+</button>
        <button onClick={() => fitLevel()}>Fit level</button><button onClick={() => setView(homeView(level, size.height))}>Find start</button>
      </div>
      <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Level canvas" aria-describedby="builder-help" style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setPreview(null); latestPreview.current = null }} onContextMenu={e => e.preventDefault()}
        onWheel={e => { if (e.ctrlKey || e.metaKey) { const r = e.currentTarget.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * .003), { x: e.clientX - r.left, y: e.clientY - r.top }) } else setView(v => ({ ...v, x: v.x + (e.shiftKey ? e.deltaY : e.deltaX) / v.zoom, y: v.y + (e.shiftKey ? 0 : e.deltaY) / v.zoom })) }} />
      <button className="builder-minimap" aria-label="Fit level overview" title="Click to fit the whole level" onClick={() => fitLevel()}><LevelThumbnail level={level} /><span>OVERVIEW</span></button>
      <p id="builder-help" className="builder-help">{TOOLS.find(t => t.id === tool)?.help}</p>
    </div>
    <aside className="builder-inspector" aria-label="Object properties">
      <h2>Inspector</h2>
      <label>Selected object<select aria-label="Selected object" value={selection ? `${selection.kind}:${selection.index}` : ''} onChange={e => { const [kind, index] = e.target.value.split(':'); setSelection(kind ? { kind: kind as Selection['kind'], index: Number(index) } : null); setTool('select') }}>
        <option value="">Nothing selected</option>{allSelections(level).map(s => <option key={`${s.kind}:${s.index}`} value={`${s.kind}:${s.index}`}>{selectionLabel(s, level)}</option>)}
      </select></label>
      {selection && bounds ? <div className="builder-property-card">
        <h3>{selectionLabel(selection, level)}</h3>
        <div className="builder-dimensions">{(['x', 'y', 'w', 'h'] as const).filter(axis => ['platform', 'prop', 'mechanism'].includes(selection.kind) || (axis === 'x' || axis === 'y') || axis === 'h' && ['rope', 'ladder'].includes(selection.kind) || axis === 'w' && selection.kind === 'trigger').map(axis =>
          <label key={axis}>{({ x: 'X', y: 'Y', w: 'Width', h: 'Height' })[axis]}<input type="number" aria-label={`Object ${axis}`} step={snap ? LEVEL_GRID_SIZE : 1} value={Math.round((axis === 'y' ? roomHeight - bounds.y : bounds[axis]) * 100) / 100} onChange={e => setDimension(axis, Number(e.target.value))} onBlur={e => { if (snap && e.currentTarget.value !== '') setDimension(axis, quantize(Number(e.currentTarget.value))) }} /></label>)}</div>
        <p>Y is height above the floor, measured at {['spawn', 'checkpoint', 'flag'].includes(selection.kind) ? 'the feet' : selection.kind === 'rope' ? 'the anchor' : 'the top of the object'}.</p>
        {chosen?.profile && <><button onClick={() => commit(replacePlatform(history.present, selection.index, { ...chosen, profile: [...chosen.profile!].reverse().map(([x, y]) => [chosen.w - x, y]) }))}>Flip slope</button><p>Drag the white points to shape the surface.</p></>}
        {chosen && <><button onClick={() => {
          const points = polygonPoints(chosen), a = points[0], b = points[1]
          points.splice(1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
          if (points.length <= 64) commit(replacePlatform(history.present, selection.index, polygonPlatform(points)))
        }}>Add corner</button><p>Drag the white corners to reshape terrain. Slopes above 45° are slippery.</p></>}
        {selection.kind === 'ladder' && <p>Climb with Up / Down. Jump to leave the ladder.</p>}
        {selection.kind === 'rope' && <><p>{level.climbables.ropes[selection.index].anchor ? 'Anchored to terrain. Moving that terrain carries the anchor.' : 'Free anchor. Place it near a terrain edge to attach it.'}</p><button onClick={() => {
          const next = copyLevel(history.present), r = next.climbables.ropes[selection.index]
          if (r.anchor) { delete r.anchor; commit(next) } else commit(anchorRope(next, selection.index))
        }}>{level.climbables.ropes[selection.index].anchor ? 'Detach anchor' : 'Anchor to nearby terrain'}</button></>}
        {mechanism && <label>Travel distance<input aria-label="Travel distance" type="number" min={60} max={1200} step={20} value={mechanism.travel} onChange={e => changeObject('travel', Number(e.target.value))} /></label>}
        {trigger && <><label>Activates<select aria-label="Connected mechanism" value={trigger.target} onChange={e => changeObject('target', e.target.value)}><option value="">Choose a mechanism</option>{level.mechanisms?.map((m, i) => <option key={m.id} value={m.id}>{m.kind === 'lift' ? 'Elevator' : 'Gate'} {i + 1}</option>)}</select></label><label>Pressure mode<select aria-label="Pressure mode" value={trigger.mode} onChange={e => changeObject('mode', e.target.value)}><option value="weight">Crates & balls</option><option value="touch">Player or props</option></select></label><p>Activation latches on until restart.</p></>}
        {robot && <><div className="builder-dimensions"><label>Left limit<input aria-label="Pusher left limit" type="number" value={Math.round(robot.left)} onChange={e => changeObject('left', Number(e.target.value))} /></label><label>Right limit<input aria-label="Pusher right limit" type="number" value={Math.round(robot.right)} onChange={e => changeObject('right', Number(e.target.value))} /></label></div><p>Chases on sight. A brief wind-up, a hard shove, then straight back after you.</p></>}
        <div className="builder-object-actions"><button disabled={['spawn', 'flag'].includes(selection.kind)} onClick={duplicate}>Duplicate</button><button className="builder-delete" disabled={['spawn', 'flag'].includes(selection.kind)} onClick={remove}>Delete object</button></div>
      </div> : <div className="builder-empty-selection"><BuilderIcon kind="select" /><strong>Make it yours.</strong><p>Choose a tool and draw in the canvas, or select an object to refine it.</p></div>}
      <details className="builder-level-settings" open={!selection}>
        <summary>Level settings</summary>
        <label>Level width<input type="number" aria-label="Level width" step={100} value={level.width} min={800} max={20000} onChange={e => {
          const extent = Math.max(800, level.spawn.x + 40, ...allSelections(level).map(s => { const b = itemBounds(level, s)!; return b.x + b.w + (level.floor === undefined ? 0 : 24) }))
          commit({ ...history.present, width: clamp(Number(e.target.value), extent, 20000) })
        }} /></label>
        <label>Level height<input type="number" aria-label="Level height" step={100} value={levelHeight(level)} min={400} max={6000} onChange={e => {
          const next = resizeLevelHeight(history.present, Number(e.target.value))
          keepFloorInView(next); commit(next)
        }} /></label>
        <p>Height adds or removes space at the top. The floor stays at Y = 0.</p>
        {isPuzzleLevel(level) && <>
          <h3>Medal times <small>seconds</small></h3><div className="builder-medal-inputs">{(['gold', 'silver', 'bronze'] as const).map(medal => <label key={medal}>{medal}<input type="number" aria-label={`${medal} time`} min={.1} max={3600} step={.5} value={level.times[medal]} onChange={e => commit({ ...history.present, times: { ...level.times, [medal]: clamp(Number(e.target.value), .1, 3600) } })} /></label>)}</div>
          <label>Player hint<textarea aria-label="Player hint" rows={3} maxLength={600} value={level.description ?? ''} onChange={e => commit({ ...history.present, description: e.target.value })} /></label>
        </>}
      </details>
      <div className={`builder-validation ${problems.length ? 'has-problems' : ''}`}><strong>{problems.length ? 'Before you play' : 'Ready to playtest'}</strong>{problems.length ? problems.map(issue => <p key={issue} role="alert">{issue}</p>) : <p>{isPuzzleLevel(level) ? 'Start and flag are placed. Test the route, then export it.' : 'The player has a clear place to start.'}</p>}</div>
      <p className="builder-shortcuts">V Select · H / Space Pan<br />⌘ / Ctrl D Duplicate · Z Undo<br />Arrow keys Move · Delete Remove</p>
    </aside>
    <footer className="builder-status"><span role="status" aria-label="Builder status">{message || draftStatus}</span><span><output aria-label="Cursor coordinates">{pointer ? `${Math.round(pointer.x)}, ${Math.round(roomHeight - pointer.y)}` : '0, 0 = bottom left'}</output> · Scroll to pan · Ctrl + scroll to zoom</span></footer>
  </section>
}
