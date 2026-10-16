import type { Character, CharacterSlotEntry } from '@loredoku/shared';
import { PARTICIPANT_HEADER_HEIGHT } from '@loredoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { Skeleton } from '@/components/ui/skeleton';

interface PuzzleEditorLeftPanelProps {
  characters: Character[] | undefined;
  charactersLoading: boolean;
  charactersError: boolean;
  characterSlots: Array<CharacterSlotEntry | null>;
  /** The character whose detail is currently shown in the info drawer. */
  selectedCharacterId: number | null;
  onAssignSlot: (characterId: number) => void;
  onSelectCharacter: (id: number | null) => void;
}

/**
 * SPEC-K04 (docs/v0.5.0.md §4.1): the puzzle editor's left panel keeps the
 * 「角色」 tab **only** — the 物品 / 区域 tabs (and their `onSetLayer` /
 * `onSelectItem` / `onSelectRegion` / `onEditRegion` / `onDeleteRegion` props)
 * belong to the map editor, which owns the canvas those tools write to. The
 * canvas here is read-only, so the content is the old 「角色」 branch verbatim.
 */
export function PuzzleEditorLeftPanel({
  characters,
  charactersLoading,
  charactersError,
  characterSlots,
  selectedCharacterId,
  onAssignSlot,
  onSelectCharacter,
}: PuzzleEditorLeftPanelProps): JSX.Element {
  const rosterIds = new Set(characterSlots.filter(Boolean).map((slot) => slot!.characterId));

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r bg-background">
      {/* OPT-B06 §6.1: header aligns with the participant panel title bar */}
      <div
        className="flex shrink-0 items-center justify-center border-b text-sm font-medium"
        style={{ height: PARTICIPANT_HEADER_HEIGHT }}
      >
        角色
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex h-full flex-col gap-3 overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            点击角色可选中；点击「加入」放入右侧参与者区，再从参与者区拖拽完成放置。
          </p>
          {charactersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : charactersError ? (
            <p className="py-4 text-center text-xs text-muted-foreground">角色加载失败</p>
          ) : !characters || characters.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">暂无角色</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {characters.map((character) => (
                <div key={character.id} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onSelectCharacter(selectedCharacterId === character.id ? null : character.id)
                    }
                    className={
                      selectedCharacterId === character.id
                        ? 'rounded-full ring-2 ring-primary'
                        : 'rounded-full'
                    }
                    title={character.name}
                  >
                    <CharacterThumbnail character={character} className="h-12 w-12" />
                  </button>
                  <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                    {character.name}
                  </span>
                  <button
                    type="button"
                    disabled={rosterIds.has(character.id)}
                    onClick={() => onAssignSlot(character.id)}
                    className={
                      rosterIds.has(character.id)
                        ? 'h-6 w-full rounded border bg-secondary px-2 text-[11px] text-muted-foreground'
                        : 'h-6 w-full rounded border px-2 text-[11px] hover:border-primary'
                    }
                  >
                    {rosterIds.has(character.id) ? '已加入' : '加入'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
