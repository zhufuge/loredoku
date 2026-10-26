import { LIST_ROW_HEIGHT, type Character } from '@loredoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { GenderBadge } from '@/components/character/GenderBadge';
import { VirtualList } from '@/components/ui/virtual-list';
import { cn } from '@/lib/utils';

interface CharacterListPanelProps {
  characters: Character[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * v0.5.2 FEAT-M01 (docs/v0.5.2.md §1.3): windowed — only the rows inside the
 * viewport are mounted, so a long roster no longer fires every avatar request
 * at once.
 */
export function CharacterListPanel({
  characters,
  selectedId,
  onSelect,
  }: CharacterListPanelProps): JSX.Element {
  return (
    // FIX-O09 (docs/v0.5.4.md §5.2): same corner fix as the item list — the
    // square scroller is clipped to the rounded frame.
    <div className="overflow-hidden rounded-lg border">
      <VirtualList
        count={characters.length}
        rowHeight={LIST_ROW_HEIGHT}
        className="divide-y"
        renderRow={(index) => {
          const character = characters[index];
          if (!character) return null;
          return (
            <button
              type="button"
              onClick={() => onSelect(character.id)}
              className={cn(
                'flex h-full w-full items-center gap-3 px-3 text-left transition-colors hover:bg-accent',
                selectedId === character.id && 'bg-accent',
              )}
            >
              <CharacterThumbnail character={character} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{character.name}</span>
                  <GenderBadge gender={character.gender} />
                  {!character.isActive ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {character.avatarUrl ? '已停用' : '未启用'}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{character.code}</div>
              </div>
            </button>
          );
        }}
      />
    </div>
  );
}
