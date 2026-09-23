import type { JumpLevel } from './level'
import { levelTerrain } from './level'

export function LevelThumbnail({ level }: { level: JumpLevel }) {
  const top = Math.min(level.spawn.y - 280, ...level.climbables.ropes.map(r => r.y - 35), ...level.platforms.map(b => b.y - 35))
  const bottom = level.floor ?? Math.max(level.spawn.y + 100, ...level.platforms.map(b => b.y + b.h))
  return <svg className="level-thumbnail" viewBox={`0 ${top} ${level.width} ${bottom - top + 50}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    {levelTerrain(level).map((b, i) => <path key={i} fill="#c7d0c2" stroke="#899b8b" strokeWidth="3" d={b.profile
      ? `M ${b.x} ${b.y + b.h} ${b.profile.map(([x, y]) => `L ${b.x + x} ${b.y + y}`).join(' ')} L ${b.x + b.w} ${b.y + b.h} Z`
      : `M ${b.x} ${b.y} h ${b.w} v ${b.h} h ${-b.w} Z`} />)}
    {level.climbables.ropes.map((r, i) => <g key={i} stroke="#9d8360" strokeWidth="5"><path d={`M ${r.x} ${r.y} v ${r.length}`} /><path d={`M ${r.x - 15} ${r.y} h 30`} /></g>)}
    {level.climbables.ladders.map((l, i) => <g key={i} stroke="#819184" strokeWidth="4"><path d={`M ${l.x - 8} ${l.top} v ${l.bottom - l.top} M ${l.x + 8} ${l.top} v ${l.bottom - l.top}`} />{Array.from({ length: Math.ceil((l.bottom - l.top) / 24) }, (_, j) => <path key={j} d={`M ${l.x - 8} ${l.top + j * 24} h 16`} />)}</g>)}
    <circle cx={level.spawn.x} cy={level.spawn.y - 27} r={15} fill="#526057" />
    {level.flag && <g stroke="#ca6548" strokeWidth="5" fill="#ca6548"><path d={`M ${level.flag.x} ${level.flag.y} v -100 l 55 12 v 34 l -55 -12`} /></g>}
  </svg>
}
