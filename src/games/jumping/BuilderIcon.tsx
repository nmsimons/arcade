import type { Tool } from './editor'
const paths: Record<Tool, string> = {
  select: 'M5 3v16l4-5 4 7 3-2-4-6 7-1Z', pan: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  polygon: 'M3 18 6 5 16 3 21 13 13 20Z',
  platform: 'M3 10h18v5H3zM6 18h12', pillar: 'M7 3h10v18H7zM7 9h10M7 15h10', pit: 'M2 7h6v13h8V7h6M10 20h4', ramp: 'M3 19 21 5v14Z',
  rough: 'M2 19V15l4-4 3 2 5-8 3 5 5 4v5Z', rope: 'M15 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 8v2c-6 4 6 7 0 11', ladder: 'M7 3v18M17 3v18M7 6h10M7 10h10M7 14h10M7 18h10',
  spawn: 'M8 21V4l11 4-11 4M4 21h8', flag: 'M5 21V3l14 3v8l-14-3M3 21h6', checkpoint: 'm12 3 8 9-8 9-8-9Z',
  box: 'M4 4h16v16H4zM7 4v16M17 4v16M7 8h10M7 16h10', ball: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M14 4c-6 3-6 13 0 16',
  pusher: 'M4 7h12v11H4zM16 13h4M21 8v12M7 7V4h6M7 11h5M7 18v3M13 18v3',
  plate: 'M3 16h18v4H3zM8 4h8v8H8zM10 14h4', lift: 'M4 3v18M20 3v18M4 16h16v4H4zM12 12V4M9 7l3-3 3 3',
  gate: 'M4 21V3h16v18M8 6v11M12 6v11M16 6v11M4 17h16',
}
export function BuilderIcon({ kind }: { kind: Tool }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]} /></svg> }
