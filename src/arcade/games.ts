// Keep entry-point branding independent of the lazily loaded game engines.
export const ARCADE_GAMES = [
  { id: 'hardVacuum', path: '/hard-vacuum', label: 'Hard Vacuum', theme: 'vacuum', genre: 'Salvage & survival', detail: 'A lost station. A way home.' },
  { id: 'kickball', path: '/bumper-ball', label: 'Bumper Ball', theme: 'bumper', genre: 'Three-minute matches', detail: 'Small cars. Questionable manners.' },
  { id: 'urbanFire', path: '/urban-fire', label: 'Urban Fire', theme: 'urban', genre: 'Armored street combat', detail: 'Hold the district. Keep moving.' },
  { id: 'jumping', path: '/untitled-jumping-game', label: 'Untitled Jumping Game', theme: 'jumping', genre: 'Movement playground', detail: 'Find your stride. Reach a little higher.' },
] as const
export type GameTheme = typeof ARCADE_GAMES[number]['theme']
export const gameForPath = (path: string) => ARCADE_GAMES.find(game => game.path === path.replace(/^\/games\//, '/'))
