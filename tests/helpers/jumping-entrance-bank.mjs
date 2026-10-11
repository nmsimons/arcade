/** Author a doorway-sized flat bank in a regression fixture's sloped surface.
 * The slope outside the bank retains its original geometry and contact rules. */
export function flattenFixtureEntrance(level, platformIndex = 0, join = 'center') {
  const platform = level.platforms[platformIndex]
  const points = platform.polygon ?? [...platform.profile, [platform.w, platform.h], [0, platform.h]]
  const x = level.entrance.x - platform.x, y = level.entrance.y - platform.y
  const left = x - 20.5, right = x + 20.5
  const edge = points.findIndex((a, i) => {
    const b = points[(i + 1) % points.length]
    return Math.min(a[0], b[0]) <= left && Math.max(a[0], b[0]) >= right
      && Math.abs(a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]) - y) < .01
  })
  if (edge < 0) throw new Error('The entrance must lie on a sloped fixture edge.')
  const a = points[edge], b = points[(edge + 1) % points.length]
  const height = px => a[1] + (px - a[0]) * (b[1] - a[1]) / (b[0] - a[0])
  const bankY = join === 'uphill' ? Math.min(height(left), height(right))
    : join === 'downhill' ? Math.max(height(left), height(right)) : y
  level.entrance.y = platform.y + bankY
  const bank = [[left, height(left)], [left, bankY], [right, bankY], [right, height(right)]]
  if (b[0] < a[0]) bank.reverse()
  const polygon = [...points.slice(0, edge + 1), ...bank, ...points.slice(edge + 1)]
    .filter((point, i, all) => !i || Math.hypot(point[0] - all[i - 1][0], point[1] - all[i - 1][1]) > 1e-9)
  platform.polygon = polygon
  delete platform.profile
  return level
}
