import { useNavigate } from 'react-router-dom';
import { GAME_DIFFICULTY_COLORS, GAME_DIFFICULTY_LABELS } from '@murdoku/shared';
import type { MapGameSummary } from '@murdoku/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * FEAT-G01 (docs/v0.4.0.md §4): one deployed game as a card — cover, name,
 * difficulty badge and the `n×n` spec. The whole card is one button so a
 * mis-click anywhere on it starts the game.
 */
export function GameCard({ game }: { game: MapGameSummary }): JSX.Element {
  const navigate = useNavigate();
  const initial = game.name.trim().charAt(0) || '游';

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/games/${game.id}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(`/games/${game.id}`);
        }
      }}
      className={cn(
        'group cursor-pointer overflow-hidden transition-shadow hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* 16:10 cover; without one the map name's first character stands in. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden border-b bg-muted/50">
        {game.coverUrl ? (
          <img
            src={game.coverUrl}
            alt={game.name}
            draggable={false}
            className="no-drag h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary/40">
            <span className="text-4xl font-semibold text-muted-foreground/60">{initial}</span>
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="truncate font-medium" title={game.name}>
          {game.name}
        </h3>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span
            className="rounded px-2 py-0.5 font-medium text-white"
            style={{ backgroundColor: GAME_DIFFICULTY_COLORS[game.difficulty] }}
          >
            {GAME_DIFFICULTY_LABELS[game.difficulty]}
          </span>
          <span className="tabular-nums">
            {game.gridSize} × {game.gridSize}
          </span>
        </div>
      </div>
    </Card>
  );
}
