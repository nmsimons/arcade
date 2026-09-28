import type { Tool, TerrainTransform } from './editor'
import { STOPWATCH_FACE_PATH, STOPWATCH_DETAILS_PATH, STOPWATCH_HAND_PATH, TIME_BONUS_ARROW_PATH, TIME_BONUS_ARROW_WIDTH, TIME_BONUS_DEFAULT_SECONDS, TIME_PENALTY_COLOR, EMP_BOLT_PATH } from './pickups'
const paths: Record<Exclude<Tool, 'stopwatch' | 'fast-stopwatch' | 'time-bonus' | 'time-penalty' | 'emp'> | TerrainTransform, string> = {
  select: 'M5 3v16l4-5 4 7 3-2-4-6 7-1Z',
  node: 'M3 17h6m6 0h6M12 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 3v7M8.5 6.5h7',
  'rotate-left': 'M8 3 4 7l4 4M4 7h9a7 7 0 1 1-7 9',
  'rotate-right': 'm16 3 4 4-4 4M20 7h-9a7 7 0 1 0 7 9',
  'flip-horizontal': 'M12 3v3m0 4v4m0 4v3M3 7v10h5ZM21 7v10h-5Z',
  'flip-vertical': 'M3 12h3m4 0h4m4 0h3M7 3h10v5ZM7 21h10v-5Z',
  'steps-narrow': 'M2 21v-4h4v-4h4V9h4V5h4V1h4v8h-4v4h-4v4h-4v4Z',
  'steps-wide': 'M2 18v-3h5v-3h5V9h5V6h5v6h-5v3h-5v3Z',
  platform: 'M3 10h18v5H3zM6 18h12', pillar: 'M7 3h10v18H7zM7 9h10M7 15h10', pit: 'M2 7h6v13h8V7h6M10 20h4', ramp: 'M3 19 21 5v14Z',
  rough: 'M2 19V15l4-4 3 2 5-8 3 5 5 4v5Z', rope: 'M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 8v2c-6 4 6 7 0 11', ladder: 'M7 3v18M17 3v18M7 6h10M7 10h10M7 14h10M7 18h10',
  spawn: 'M8 21V4l11 4-11 4M4 21h8', goal: 'M3 19h11v2H3zM17 21V10M14 21h6M17 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Z', checkpoint: 'm12 3 8 9-8 9-8-9Z',
  box: 'M4 4h16v16H4zM7 9h10M7 15h10', ball: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM18 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  pusher: 'M4 5h16v13H4zM7 10h3M14 9h3v3h-3zM7 18v3M17 18v3',
  plate: 'M2 19h20M4 14h16v2H4zM12 3v7M9 7l3 3 3-3', lift: 'M8 13V3M5 6l3-3 3 3M16 3v10M13 10l3 3 3-3M3 17h18v4H3z',
  'moving-platform': 'M3 8h18M7 4 3 8l4 4M17 4l4 4-4 4M3 17h18v4H3z',
  gate: 'M9 3h6v18H9zM11 7h2M11 12h2M11 17h2',
  'horizontal-gate': 'M3 9h18v6H3zM7 11v2M12 11v2M17 11v2',
  timer: 'M2 6h20v12H2zM6 10v4M10 10v4M14 10v4M18 10v4',
  text: 'M4 7V4h16v3M12 4v16M8 20h8',
  coin: 'M17 12a6 9 0 1 1-12 0 6 9 0 1 1 12 0ZM11 3h3a6 9 0 0 1 0 18h-3',
  'coin-switch': 'M2 7h20v10H2zM5 10h7v4H5z',
}
export function BuilderIcon({ kind }: { kind: Tool | TerrainTransform }) {
  const color = kind === 'time-penalty' || kind === 'fast-stopwatch' ? TIME_PENALTY_COLOR : 'currentColor'
  if (kind === 'emp') return <svg width="22" height="22" viewBox="-24 -24 48 48" fill="currentColor" aria-hidden="true"><path d={EMP_BOLT_PATH} /></svg>
  if (kind === 'stopwatch' || kind === 'fast-stopwatch') return <svg width="22" height="22" viewBox="-26 -32 52 56" fill={color} aria-hidden="true"><path d={STOPWATCH_FACE_PATH} fillRule="evenodd" /><path d={STOPWATCH_DETAILS_PATH} /><path d={STOPWATCH_HAND_PATH} /></svg>
  if (kind === 'time-bonus' || kind === 'time-penalty') return <svg width="22" height="22" viewBox="-26 -36 52 56" fill={color} aria-hidden="true"><g transform="translate(0 -4)"><path d={TIME_BONUS_ARROW_PATH} transform={kind === 'time-penalty' ? 'scale(-1 1)' : undefined} fill="none" stroke={color} strokeWidth={TIME_BONUS_ARROW_WIDTH} strokeLinecap="round" strokeLinejoin="round" /><text x="0" y="8" textAnchor="middle" fontFamily="system-ui, sans-serif" fontSize="22" fontWeight="700">{TIME_BONUS_DEFAULT_SECONDS}</text></g></svg>
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true"><path d={paths[kind]} /></svg>
}
