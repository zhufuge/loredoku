import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Character, CharacterSlotEntry } from '@loredoku/shared';
import { PARTICIPANT_HEADER_HEIGHT } from '@loredoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

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
 * `onSelectAsset` / `onSelectRegion` / `onEditRegion` / `onDeleteRegion` props)
 * belong to the map editor, which owns the canvas those tools write to. The
 * canvas here is read-only, so the content is the old 「角色」 branch verbatim.
 *
 * v0.5.3 FEAT-N08 (docs/v0.5.3.md §6.1): the panel **collapses** to a thin rail
 * (more canvas) and gains a **filter** over 名称 / 业务 ID — a puzzle with a few
 * dozen characters was unsearchable before. Both are view-only state and stay
 * in the component: they must never reach `puzzleStore`, whose undo stack holds
 * the puzzle's own data only.
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
  const [collapsed, setCollapsed] = useState(false);
  const [keyword, setKeyword] = useState('');

  const rosterIds = new Set(characterSlots.filter(Boolean).map((slot) => slot!.characterId));

  /** FEAT-N08: 名称 / 业务 ID, case-insensitive. */
  const visible = useMemo(() => {
    const list = characters ?? [];
    const needle = keyword.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (character) =>
        character.name.toLowerCase().includes(needle) ||
        character.code.toLowerCase().includes(needle),
    );
  }, [characters, keyword]);

  const filtered = keyword.trim().length > 0;

  if (collapsed) {
    return (
      <aside className="flex h-full w-10 shrink-0 flex-col border-r bg-background">
        <div
          className="flex shrink-0 items-center justify-center border-b"
          style={{ height: PARTICIPANT_HEADER_HEIGHT }}
        >
          <button
            type="button"
            title="展开角色列表"
            aria-label="展开角色列表"
            aria-expanded={false}
            onClick={() => setCollapsed(false)}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-start justify-center pt-3">
          <span
            className="text-xs text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            角色
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r bg-background">
      {/* OPT-B06 §6.1: header aligns with the participant panel title bar */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 text-sm font-medium"
        style={{ height: PARTICIPANT_HEADER_HEIGHT }}
      >
        <span>角色</span>
        <button
          type="button"
          title="收起角色列表"
          aria-label="收起角色列表"
          aria-expanded
          onClick={() => setCollapsed(true)}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* FEAT-N08: the filter sits right under the header, above the grid. */}
      <div className="shrink-0 border-b p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索名称 / 业务 ID"
            aria-label="搜索角色"
            className={cn(
              'h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="flex h-full flex-col gap-3 overflow-y-auto">
          {/* FIX-O14 (docs/v0.5.4.md §7.1): the 「点击角色可选中…」 caption is
              gone — the 「加入」 button and the drag handle explain themselves. */}
          {charactersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : charactersError ? (
            <p className="py-4 text-center text-xs text-muted-foreground">角色加载失败</p>
          ) : !characters || characters.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">暂无角色</p>
          ) : visible.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">没有匹配的角色</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {visible.map((character) => (
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
          {filtered && visible.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              匹配 {visible.length} / {characters?.length ?? 0} 个角色
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
