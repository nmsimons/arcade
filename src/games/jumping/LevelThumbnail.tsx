import type { JumpLevel } from './level'
import { levelHeight } from './level'
import { polygonPoints } from './geometry'
import { TERRAIN_COLOR } from './render'
import { ropePath } from './climbables'

export function LevelThumbnail({ level }: { level: JumpLevel }) {
  return <svg className="level-thumbnail" viewBox={`-30 -30 ${level.width + 60} ${levelHeight(level) + 60}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x={-30} y={-30} width={level.width + 60} height={levelHeight(level) + 60} fill={TERRAIN_COLOR} />
    <rect width={level.width} height={levelHeight(level)} fill="#f1f1ed" />
    {level.platforms.map((b, i) => <path key={i} fill={TERRAIN_COLOR} d={`${polygonPoints(b).map(([x,y], j) => `${j ? 'L' : 'M'} ${x} ${y}`).join(' ')} Z`} />)}
    {level.climbables.ropes.map((r, i) => <g key={i} stroke="#9d8360" strokeWidth="5" fill="none"><path d={ropePath(r).map(([x, y], j) => `${j ? 'L' : 'M'} ${x} ${y}`).join(' ')} /><circle cx={r.x} cy={r.y} r={5} fill="#697d72" stroke="none" /></g>)}
    {level.climbables.ladders.map((l, i) => <g key={i} stroke="#819184" strokeWidth="4"><path d={`M ${l.x - 8} ${l.top} v ${l.bottom - l.top} M ${l.x + 8} ${l.top} v ${l.bottom - l.top}`} />{Array.from({ length: Math.ceil((l.bottom - l.top) / 24) }, (_, j) => <path key={j} d={`M ${l.x - 8} ${l.top + j * 24} h 16`} />)}</g>)}
    <circle cx={level.spawn.x} cy={level.spawn.y - 27} r={15} fill="#526057" />
    {level.flag && <g stroke="#ca6548" strokeWidth="5" fill="#ca6548"><path d={`M ${level.flag.x} ${level.flag.y} v -100 l 55 12 v 34 l -55 -12`} /></g>}
  </svg>
}
