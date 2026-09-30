import { KeyboardDialog } from '../games/hardVacuum/KeyboardDialog'
import { useControlHints } from '../games/hardVacuum/controlHints'
import { ARCADE_GAMES } from './games'
import { GameArt } from './GameArt'
import { AccountSurface } from '../accounts/AccountSurface'

export function ArcadeMenu({ selectedIndex, onSelection, onPlay }: {
  selectedIndex: number; onSelection: (index: number) => void; onPlay: (path: string) => void
}) {
  const { connected, hint } = useControlHints()
  return <KeyboardDialog label="Arcade" focusKey="arcade" globalMenu onClose={() => {}} className="arcade-overlay">
    <div className="arcade-menu">
      <header className="arcade-heading">
        <div><p className="arcade-eyebrow">THE ARCADE</p><h1>Select Game</h1></div>
        <p className="arcade-edition">{String(ARCADE_GAMES.length).padStart(2, '0')} <span>games to get lost in</span></p>
      </header>
      <AccountSurface compact={false} />
      <div className="arcade-games" data-menu-grid>
        {ARCADE_GAMES.map((game, index) => <button key={game.id}
          data-menu-id={game.id} data-initial-focus={selectedIndex === index || undefined}
          aria-label={game.label} aria-describedby={`${game.id}-description`}
          onFocus={() => onSelection(index)} onClick={() => onPlay(game.path)}
          className={`arcade-choice arcade-choice-${game.theme}`}>
          <span className="arcade-card-heading"><span className="arcade-genre">{game.genre}</span><span className="arcade-title">{game.label}</span></span>
          <GameArt theme={game.theme} />
          <span className="arcade-card-footer"><span id={`${game.id}-description`}>{game.detail}</span><span className="arcade-play" aria-hidden="true">Play <span>→</span></span></span>
        </button>)}
      </div>
      <div className="menu-help arcade-help">{connected
        ? <p>Stick / D-pad <span>Choose</span> · {hint('confirm', '')} <span>Play</span></p>
        : <p>Arrow keys / Tab <span>Choose</span> · Enter <span>Play</span></p>}</div>
    </div>
  </KeyboardDialog>
}
