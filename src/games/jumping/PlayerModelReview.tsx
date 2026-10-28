import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LAB_PATH } from '../../branding/lab'
import { recordReviewClip, REVIEW_FPS, reviewFrameAt, reviewLevelUrl, reviewPoster } from './modelReview.ts'
import type { ReviewBaselineIndex, ReviewClip, ReviewRecording } from './modelReview.ts'
import { drawReviewCard, REVIEW_BACKDROPS } from './modelReviewRender.ts'
import type { ReviewBackdrop } from './modelReviewRender.ts'
import { LightingRenderer } from './lightingRender.ts'
import { gameCamera } from './camera.ts'
import { ANDROID_HAND_SIZE } from './androidHand.ts'
import './ModelReview.css'

const NOTES_KEY = 'arcade.jumping.model-review.notes.v1'
const readNotes = (): Record<string, string> => {
  try { const saved = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}'); return saved && typeof saved === 'object' ? saved : {} } catch { return {} }
}
const getJson = async (url: string, signal: AbortSignal) => {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not load ${url.split('/').at(-1)}.`)
  return response.json()
}

/** Development-only inspection. Playback reads captured states; it never runs
 * game input, saves scores, or writes an authored level. */
export default function PlayerModelReview() {
  const [, setSearchParams] = useSearchParams()
  const [clips, setClips] = useState<ReviewClip[]>([])
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get('clip') ?? 'stride')
  const [recording, setRecording] = useState<ReviewRecording | null>(null)
  const [baselines, setBaselines] = useState<ReviewBaselineIndex | null>(null)
  const [baselineImage, setBaselineImage] = useState<{ id: string; image: HTMLImageElement } | null>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [backdrop, setBackdrop] = useState<ReviewBackdrop>('paper')
  const [silhouette, setSilhouette] = useState(false)
  const [joints, setJoints] = useState(false)
  const [context, setContext] = useState(true)
  const [mirror, setMirror] = useState(false)
  const [reference, setReference] = useState('current')
  const [handSize, setHandSize] = useState(ANDROID_HAND_SIZE)
  const [notes, setNotes] = useState(readNotes)
  const [error, setError] = useState('')
  const [baselineError, setBaselineError] = useState('')
  const currentCanvas = useRef<HTMLCanvasElement>(null), baselineCanvas = useRef<HTMLCanvasElement>(null), gameCanvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<LightingRenderer | null>(null), playback = useRef(0)
  const clip = clips.find(c => c.id === selected), active = recording?.clip.id === selected ? recording : null
  const index = active ? Math.min(frame, active.frames.length - 1) : 0
  const current = active?.frames[index], baseline = baselines?.clips[selected]
  const baselineReady = !!active && !!baseline && baseline.signature === active.signature && baseline.frames === active.frames.length
  const image = baselineReady && baselineImage?.id === selected ? baselineImage.image : null
  const referenceReady = !!active && (reference === 'current' || !!image)

  useEffect(() => {
    const abort = new AbortController()
    getJson('/dev/model-review/clips.json', abort.signal).then(data => {
      if (abort.signal.aborted) return
      setClips(data.clips)
      if (!data.clips.some((c: ReviewClip) => c.id === selected)) setSelected(data.clips[0].id)
    }).catch(e => { if (!abort.signal.aborted) setError(e.message) })
    getJson('/dev/model-review/baseline/index.json', abort.signal).then(data => {
      if (!abort.signal.aborted) setBaselines(data)
    }).catch(e => { if (!abort.signal.aborted) setBaselineError(e.message) })
    return () => abort.abort()
  // The selected clip is deliberately read only on initial page load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!clip) return
    const abort = new AbortController()
    getJson(reviewLevelUrl(clip), abort.signal).then(source => recordReviewClip(clip, source, abort.signal)).then(result => {
      if (abort.signal.aborted) return
      playback.current = 0; setFrame(0); setRecording(result)
    }).catch(e => { if (!abort.signal.aborted) setError(e.message) })
    return () => abort.abort()
  }, [clip])

  useEffect(() => {
    if (!baseline) return
    let cancelled = false
    const loaded = new Image()
    loaded.src = `/dev/model-review/baseline/${baseline.image}`
    loaded.decode().then(() => { if (!cancelled) setBaselineImage({ id: selected, image: loaded }) })
      .catch(() => { if (!cancelled) setBaselineError('Could not load the saved baseline image.') })
    return () => { cancelled = true }
  }, [baseline, selected])

  const seek = (next: number) => {
    if (!active) return
    const target = Math.max(0, Math.min(active.frames.length - 1, next))
    playback.current = target / REVIEW_FPS; setFrame(target); setPlaying(false)
  }
  const paint = useEffectEvent(() => {
    if (!active || !current) return
    const display = { backdrop, silhouette, joints, context, mirror, reference: baselineReady ? baseline.bounds : active.bounds, handSize }
    if (currentCanvas.current) drawReviewCard(currentCanvas.current, active, index, display)
    if (baselineCanvas.current) {
      if (reference === 'current') drawReviewCard(baselineCanvas.current, active, index, { ...display, handSize: 1 })
      else if (image && baseline) drawReviewCard(baselineCanvas.current, active, index, display, { baseline, image })
    }
    const canvas = gameCanvas.current, render = renderer.current
    if (!canvas || !render) return
    const width = Math.round(canvas.clientWidth), height = 240, ratio = Math.min(2, devicePixelRatio || 1)
    if (!width) return
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio }
    const run = { ...active.run, player: current.player, props: current.props, activeTime: current.time, pickupTime: current.time }
    const nightMode = backdrop === 'night'
    run.level = { ...run.level, lighting: { ambient: 0, nightMode, lights: [] },
      environment: backdrop === 'sky' ? { kind: 'landscape', horizon: 0, lighting: 'uniform', walls: [] }
        : backdrop === 'stone' ? { kind: 'interior', lighting: 'uniform', walls: [{ x: 0, y: 0, w: run.level.width, h: run.level.height ?? run.level.floor, kind: 'cave' }] }
        : undefined }
    // Keep the actor centered for inspection at the game's phone-size zoom
    // floor; the normal production renderer supplies materials and lighting.
    const view = gameCamera(width, height, current.player, run.level, true)
    view.x = current.player.x - width / view.zoom / 2; view.y = current.player.y - 32 - height / view.zoom / 2
    render.render(canvas.getContext('2d')!, run, run.level.lighting!, { ...view, width: canvas.width, height: canvas.height, zoom: view.zoom * ratio }, 0)
  })
  useEffect(() => {
    renderer.current = new LightingRenderer()
    const observer = new ResizeObserver(() => paint())
    for (const canvas of [currentCanvas.current, baselineCanvas.current, gameCanvas.current]) if (canvas) observer.observe(canvas)
    return () => { observer.disconnect(); renderer.current?.dispose(); renderer.current = null }
  }, [])
  useEffect(() => { paint() }, [active, frame, image, backdrop, silhouette, joints, context, mirror, reference, handSize])

  const advance = useEffectEvent((dt: number) => {
    if (!active || !playing || document.hidden) return
    const duration = active.frames.length / REVIEW_FPS
    playback.current += dt * speed
    if (playback.current >= duration) {
      if (loop) playback.current %= duration
      else { playback.current = duration - 1 / REVIEW_FPS; setPlaying(false) }
    }
    setFrame(reviewFrameAt(playback.current, active.frames.length))
  })
  useEffect(() => {
    let request = 0, previous = performance.now()
    const tick = (now: number) => { advance(Math.min(.1, (now - previous) / 1000)); previous = now; request = requestAnimationFrame(tick) }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [])
  const shortcut = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.target instanceof Element && e.target.closest('button, input, select, textarea, a'))) return
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing) }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); seek(index + (e.code === 'ArrowRight' ? 1 : -1)) }
  })
  useEffect(() => { window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut) }, [])

  const exportFrame = () => {
    if (!currentCanvas.current || !baselineCanvas.current || !referenceReady || !active) return
    const output = document.createElement('canvas'), width = currentCanvas.current.width
    output.width = width * 2; output.height = currentCanvas.current.height + 100
    const ctx = output.getContext('2d')!
    ctx.fillStyle = '#f3f0e6'; ctx.fillRect(0, 0, output.width, output.height); ctx.fillStyle = '#303c36'; ctx.font = '20px sans-serif'
    ctx.fillText(`${clip!.title} · frame ${index} · ${REVIEW_BACKDROPS[backdrop].label}`, 20, 28)
    ctx.font = '16px sans-serif'; ctx.fillText(reference === 'current' ? 'Hand shape · 100%' : `Baseline ${baselines!.revision}`, 20, 65)
    ctx.fillText(`Hands · ${Math.round(handSize * 100)}%${handSize === ANDROID_HAND_SIZE ? ' (game)' : ' (preview)'}`, width + 20, 65)
    ctx.drawImage(baselineCanvas.current, 0, 100); ctx.drawImage(currentCanvas.current, width, 100)
    output.toBlob(blob => {
      if (!blob) return
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `player-${selected}-${index}-hands-${Math.round(handSize * 100)}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  return <main className="model-review">
    <header className="model-review-header"><div><p>L.A.B. EXPERIMENTS · MODEL REVIEW</p><h1>The player.</h1><span>Observe first. Change one thing at a time.</span></div>
      <div><a href="/dev/model-review/baseline/overview.png" target="_blank" rel="noreferrer">Baseline sheet ↗</a><Link to={LAB_PATH}>Back to game</Link></div></header>
    <div className="model-review-layout">
      <nav aria-label="Movement clips" className="model-review-clips">
        <p className="model-review-eyebrow">01 / BASELINE STUDY</p>
        {['Movement', 'Contact', 'Water'].map(group => <div key={group}><h2>{group}</h2>{clips.filter(c => c.group === group).map(c =>
          <button key={c.id} aria-current={selected === c.id ? 'true' : undefined} onClick={() => {
            setSelected(c.id); setPlaying(false); playback.current = 0; setFrame(0); setError('')
            setSearchParams({ clip: c.id }, { replace: true })
          }}>{c.title}<span aria-hidden="true">↗</span></button>)}</div>)}
        <p className="model-review-aside">Fresh starts. Ordinary inputs.<br />The live player artwork.</p>
      </nav>
      <section className="model-review-workspace" aria-label="Player comparison" data-ready={referenceReady}>
        <div className="model-review-intro"><div><p className="model-review-eyebrow">{clip?.group ?? 'Preparing study'}</p><h2>{clip?.title ?? 'Loading recordings…'}</h2><p>{clip?.focus}</p></div>
          <button onClick={exportFrame} disabled={!referenceReady}>Export frame ↓</button></div>
        <div className="model-review-playback" aria-label="Playback controls">
          <button aria-label="Previous frame" disabled={!active} onClick={() => seek(index - 1)}>←</button>
          <button className="model-review-play" disabled={!active} aria-label={playing ? 'Pause playback' : 'Play recording'} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
          <button aria-label="Next frame" disabled={!active} onClick={() => seek(index + 1)}>→</button>
          <input aria-label="Recording frame" type="range" min="0" max={Math.max(0, (active?.frames.length ?? 1) - 1)} value={index} disabled={!active} onChange={e => seek(Number(e.target.value))} />
          <output aria-label="Frame position">{index} / {Math.max(0, (active?.frames.length ?? 1) - 1)}</output>
          <label>Speed <select aria-label="Speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option></select></label>
          <label><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />Loop</label>
        </div>
        <div className="model-review-options">
          <label>Reference <select aria-label="Comparison reference" value={reference} onChange={e => setReference(e.target.value)}><option value="current">Hand shape · 100%</option><option value="saved">Frozen baseline</option></select></label>
          <label>Hands <select aria-label="Hand size" value={handSize} onChange={e => setHandSize(Number(e.target.value))}><option value="1">100%</option><option value="1.12">112% · game</option><option value="1.2">120%</option></select></label>
          <label>Backdrop <select aria-label="Backdrop" value={backdrop} onChange={e => setBackdrop(e.target.value as ReviewBackdrop)}>{Object.entries(REVIEW_BACKDROPS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}</select></label>
          {[['Silhouette', silhouette, setSilhouette], ['Joints', joints, setJoints], ['Contact surfaces', context, setContext], ['Mirror view', mirror, setMirror]].map(([label, checked, setter]) =>
            <label key={String(label)}><input type="checkbox" checked={checked as boolean} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} />{label as string}</label>)}
        </div>
        {!active && !error && <p role="status">Preparing movement from a fresh start…</p>}
        {error && <p role="alert">{error}</p>}
        <div className="model-review-pair">
          <figure><figcaption><strong>{reference === 'current' ? 'Hand shape · 100%' : 'Saved baseline'}</strong><span>{reference === 'current' ? 'Same shape · original size' : baselines ? `${baselines.revision} · ${baselines.captured.slice(0, 10)}` : 'Loading reference'}</span></figcaption>
            <canvas ref={baselineCanvas} aria-label="Player comparison reference" />
            {reference === 'saved' && (!image || !baselineReady) && <p className="model-review-unavailable" role="status">{baselineError || (baseline && active && !baselineReady ? 'The input recording changed. Capture a new reference before comparing.' : 'Loading the saved baseline…')}</p>}</figure>
          <figure><figcaption><strong>Hands · {Math.round(handSize * 100)}%</strong><span>{handSize === ANDROID_HAND_SIZE ? 'Game size · same frame' : 'Size preview · same frame'}</span></figcaption><canvas ref={currentCanvas} aria-label="Current player model" /></figure>
        </div>
        <div className="model-review-frame-info"><span>{current ? `${current.time.toFixed(2)} s · ${current.label}` : 'Preparing clip'}</span><strong>{current?.state}</strong><button disabled={!active} onClick={() => active && seek(reviewPoster(active))}>Key pose</button></div>
        <section className="model-review-context"><div><h3>In-game context</h3><p>Current game artwork at {Math.round(ANDROID_HAND_SIZE * 100)}% hand size. Other sizes preview only in the comparison above.</p></div><canvas ref={gameCanvas} aria-label="Player in the game renderer" /></section>
        <section className="model-review-notes"><label htmlFor="model-review-note">Review notes</label><p>Record what to keep, what looks wrong, and one experiment to try. Saved in this browser.</p>
          <textarea id="model-review-note" rows={3} value={notes[selected] ?? ''} placeholder="Keep… / Concern… / Try…" onChange={e => {
            const updated = { ...notes, [selected]: e.target.value }; setNotes(updated)
            try { localStorage.setItem(NOTES_KEY, JSON.stringify(updated)) } catch { /* Notes remain available for this session. */ }
          }} /></section>
        <footer>Space: play / pause · ← →: one frame · Recorded at 60 frames/s · Mirror reflects the view; clips retain their recorded facing.</footer>
      </section>
    </div>
  </main>
}
