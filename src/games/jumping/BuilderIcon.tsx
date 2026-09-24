import type { Tool } from './editor'
import { STOPWATCH_FACE_PATH, STOPWATCH_DETAILS_PATH } from './pickups'
const paths: Record<Exclude<Tool, 'stopwatch'>, string> = {
  select: 'M5 3v16l4-5 4 7 3-2-4-6 7-1Z', pan: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  node: 'M3 17h6m6 0h6M12 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 3v7M8.5 6.5h7',
  platform: 'M3 10h18v5H3zM6 18h12', pillar: 'M7 3h10v18H7zM7 9h10M7 15h10', pit: 'M2 7h6v13h8V7h6M10 20h4', ramp: 'M3 19 21 5v14Z',
  rough: 'M2 19V15l4-4 3 2 5-8 3 5 5 4v5Z', rope: 'M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 8v2c-6 4 6 7 0 11', ladder: 'M7 3v18M17 3v18M7 6h10M7 10h10M7 14h10M7 18h10',
  spawn: 'M8 21V4l11 4-11 4M4 21h8', goal: 'M3 19h11v2H3zM17 21V10M14 21h6M17 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Z', checkpoint: 'm12 3 8 9-8 9-8-9Z',
  box: 'M4 4h16v16H4zM7 9h10M7 15h10', ball: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM18 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  pusher: 'M4 7h12v11H4zM16 13h4M21 8v12M7 7V4h6M7 11h5M7 18v3M13 18v3',
  plate: 'M2 19h20M4 14h16v2H4zM12 3v7M9 7l3 3 3-3', lift: 'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 6v11M3 17h18v4H3z',
  gate: 'M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 6v4M9 10h6v11H9zM11 14h2M11 18h2',
  timer: 'M2 6h20v12H2zM6 10v4M10 10v4M14 10v4M18 10v4',
  text: 'M4 7V4h16v3M12 4v16M8 20h8',
}
export function BuilderIcon({ kind }: { kind: Tool }) {
  if (kind === 'stopwatch') return <svg width="22" height="22" viewBox="-26 -32 52 56" fill="currentColor" aria-hidden="true"><path d={STOPWATCH_FACE_PATH} fillRule="evenodd" /><path d={STOPWATCH_DETAILS_PATH} /></svg>
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg>
}
