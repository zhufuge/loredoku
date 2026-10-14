import type { Character } from '@murdoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

interface CharacterListPanelProps {
  characters: Character[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function CharacterListPanel({
  characters,
  selectedId,
  onSelect,
}: CharacterListPanelProps): JSX.Element {
  return (
    <ul className="divide-y rounded-lg border">
      {characters.map((character) => (
        <li key={character.id}>
          <button
            type="button"
            onClick={() => onSelect(character.id)}
            className={cn(
              'flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent',
              selectedId === character.id && 'bg-accent',
            )}
          >
            <CharacterThumbnail character={character} className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{character.name}</span>
                {!character.isActive ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {character.avatarUrl ? '已停用' : '未启用'}
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">{character.code}</div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
