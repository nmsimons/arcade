import type { JumpLevel } from './level'
import { levelHeight } from './level'
import { polygonPoints } from './geometry'
import { TERRAIN_COLOR } from './render'
import { ropePath } from './climbables'
import { GOAL_LIGHT_HEIGHT, GOAL_PLATE_WIDTH, GOAL_POLE_OFFSET } from './goal'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer'
import { WALL_TEXT_COLOR, WALL_TEXT_FONT, WALL_TEXT_LINE_HEIGHT } from './wallText'
import { STOPWATCH_COLOR, STOPWATCH_FACE_PATH, STOPWATCH_DETAILS_PATH } from './pickups'

export function LevelThumbnail({ level }: { level: JumpLevel }) {
  return <svg className="level-thumbnail" viewBox={`-30 -30 ${level.width + 60} ${levelHeight(level) + 60}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    <rect x={-30} y={-30} width={level.width + 60} height={levelHeight(level) + 60} fill={TERRAIN_COLOR} />
    <rect width={level.width} height={levelHeight(level)} fill="#f1f1ed" />
    {(level.texts ?? []).map((text, i) => <foreignObject key={i} x={text.x} y={text.y} width={text.w} height={text.h}>
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', whiteSpace: 'pre-line', overflowWrap: 'anywhere',
        color: WALL_TEXT_COLOR, fontFamily: WALL_TEXT_FONT, fontWeight: 500, fontSize: text.fontSize, lineHeight: WALL_TEXT_LINE_HEIGHT, textAlign: text.align }}>{text.text}</div>
    </foreignObject>)}
    {(level.timers ?? []).map((timer, i) => <g key={i}>
      <rect x={timer.x} y={timer.y} width={WALL_TIMER_WIDTH} height={WALL_TIMER_HEIGHT} fill="#d9e0cf" />
      <text x={timer.x + WALL_TIMER_WIDTH / 2} y={timer.y + WALL_TIMER_HEIGHT / 2} dominantBaseline="central" textAnchor="middle" fontFamily="monospace" fontSize={28} fill="#40574a">0:00.00</text>
    </g>)}
    {level.platforms.map((b, i) => <path key={i} fill={TERRAIN_COLOR} d={`${polygonPoints(b).map(([x,y], j) => `${j ? 'L' : 'M'} ${x} ${y}`).join(' ')} Z`} />)}
    {level.climbables.ropes.map((r, i) => <g key={i} stroke="#9d8360" strokeWidth="5" fill="none"><path d={ropePath(r).map(([x, y], j) => `${j ? 'L' : 'M'} ${x} ${y}`).join(' ')} /><circle cx={r.x} cy={r.y} r={5} fill="#697d72" stroke="none" /></g>)}
    {level.climbables.ladders.map((l, i) => <g key={i} stroke="#819184" strokeWidth="4"><path d={`M ${l.x - 8} ${l.top} v ${l.bottom - l.top} M ${l.x + 8} ${l.top} v ${l.bottom - l.top}`} />{Array.from({ length: Math.ceil((l.bottom - l.top) / 24) }, (_, j) => <path key={j} d={`M ${l.x - 8} ${l.top + j * 24} h 16`} />)}</g>)}
    <circle cx={level.spawn.x} cy={level.spawn.y - 27} r={15} fill="#526057" />
    {(level.pickups ?? []).map((pickup, i) => <g key={i} transform={`translate(${pickup.x} ${pickup.y})`} fill={STOPWATCH_COLOR}>
      <path d={STOPWATCH_FACE_PATH} fillRule="evenodd" /><path d={STOPWATCH_DETAILS_PATH} />
    </g>)}
    {level.goal && <g>
      <rect x={level.goal.x + GOAL_POLE_OFFSET - 2} y={level.goal.y - GOAL_LIGHT_HEIGHT} width={4} height={GOAL_LIGHT_HEIGHT} fill="#738575" />
      <rect x={level.goal.x - GOAL_PLATE_WIDTH / 2} y={level.goal.y - 7} width={GOAL_PLATE_WIDTH} height={7} fill="#c4a66b" />
      <circle cx={level.goal.x + GOAL_POLE_OFFSET} cy={level.goal.y - GOAL_LIGHT_HEIGHT} r={11} fill="#9aa38e" />
    </g>}
  </svg>
}
