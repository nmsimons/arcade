// Capture the reviewed world from 36a309b before later Studio lighting edits.
// These are catch/rig regressions, independent of live catalog revisions and
// their lighting cost. Move only the entrance to isolate each saved tower lip.
export const escapadeTowerFixture = new URL('../fixtures/jumping/escapade-tower-catches.json', import.meta.url)
export const escapadeTowerCatches = [
  { name: 'first tower left', edgeX: 200, edgeY: 2380, away: -1 },
  { name: 'second tower right', edgeX: 1680, edgeY: 2380, away: 1 },
  { name: 'third tower right', edgeX: 2545, edgeY: 1740, away: 1 },
  { name: 'fourth tower right', edgeX: 4125, edgeY: 1815, away: 1 },
]
export function escapadeTowerLevel(authored, { edgeX, edgeY, away }) {
  return { ...structuredClone(authored), entrance: { x: edgeX - away * 35, y: edgeY } }
}
