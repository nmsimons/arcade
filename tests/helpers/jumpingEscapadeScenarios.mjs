// Preserve the authored world; move only the entrance to isolate each tower lip.
export const escapadeTowerCatches = [
  { name: 'first tower left', edgeX: 200, edgeY: 2380, away: -1 },
  { name: 'second tower right', edgeX: 1680, edgeY: 2380, away: 1 },
  { name: 'third tower right', edgeX: 2545, edgeY: 1740, away: 1 },
  { name: 'fourth tower right', edgeX: 4125, edgeY: 1815, away: 1 },
]
export function escapadeTowerLevel(authored, { edgeX, edgeY, away }) {
  return { ...structuredClone(authored), entrance: { x: edgeX - away * 35, y: edgeY } }
}
