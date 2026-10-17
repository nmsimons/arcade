/** Isolate the reported storey without changing its terrain. Start below the
 * lip, clear the ball from the run-up, and hold the receiving gate open. */
export function towerWallCatchLevel(authored) {
  const level = structuredClone(authored)
  level.entrance = { x: 1200, y: 1320 }
  level.props = level.props.filter(prop => !(prop.x === 1234 && prop.y === 1320))
  level.mechanisms.find(m => m.x === 1280 && m.y === 980).switchReversed = true
  return level
}
