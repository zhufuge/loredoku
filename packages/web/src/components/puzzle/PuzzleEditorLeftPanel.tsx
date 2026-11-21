import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Character, CharacterSlotEntry } from '@loredoku/shared';
import { PARTICIPANT_HEADER_HEIGHT } from '@loredoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { RefreshButton } from '@/components/common/RefreshButton';
import { SearchInput } from '@/components/common/SearchInput';
import { Skeleton } from '@/components/ui/skeleton';
import { sortByName } from '@/lib/nameOrder';
import { PANEL_ICON_BUTTON_CLASS } from '@/lib/toolbarButtons';

interface PuzzleEditorLeftPanelProps {
  characters: Character[] | undefined;
  charactersLoading: boolean;
  charactersError: boolean;
  /** 角色列表来自共享查询，角色页可能刚加过角色 —— 头部给了个刷新按钮， 不用整页重载（重载会丢掉撤销栈与视口）。 */
  charactersRefreshing: boolean;
  onRefreshCharacters: () => void;
  characterSlots: Array<CharacterSlotEntry | null>;
  /** The character whose detail is currently shown in the info drawer. */
  selectedCharacterId: number | null;
  onAssignSlot: (characterId: number) => void;
  onSelectCharacter: (id: number | null) => void;
  /** 收起状态一变化就通知出去。 收起之后这一列**整列不渲染**，「展开角色列表」 的按钮挪到参与者面板的标题行上 —— 那一行是它唯一还站着的邻居。页面据此决定要不要在那个位置挂按钮。 */
  onCollapsedChange?: (collapsed: boolean) => void;
}

/**
 * 收起之后按钮不在这个组件里了，所以「展开」得能被外部叫一下。
 */
export interface PuzzleEditorLeftPanelHandle {
  /** 等同于点面板自己那颗「展开」—— 都走 `takeOver`，手动操作会锁住自动收起。 */
  expand: () => void;
}

/** Both are view-only state and stay in the component: they must never reach `puzzleStore`, whose undo stack holds the puzzle's own data only. 状态的归属没变：`collapsed` / `userTookOverRef` 仍然只在这个组件 里，页面通过 `onCollapsedChange` 知道要不要挂那颗箭头，通过 ref 的 `expand()` 把面板叫回来 —— 收起后组件仍挂载（返回 `null`），所以「手动展开过 就锁住自动收起」这条记忆不会因为一次收起而丢失。 */
export const PuzzleEditorLeftPanel = forwardRef<
  PuzzleEditorLeftPanelHandle,
  PuzzleEditorLeftPanelProps
>(function PuzzleEditorLeftPanel(
  {
    characters,
    charactersLoading,
    charactersError,
    charactersRefreshing,
    onRefreshCharacters,
    characterSlots,
    selectedCharacterId,
    onAssignSlot,
    onSelectCharacter,
    onCollapsedChange,
  },
  ref,
): JSX.Element | null {
  const [collapsed, setCollapsed] = useState(false);
  const [keyword, setKeyword] = useState('');

  const rosterIds = new Set(characterSlots.filter(Boolean).map((slot) => slot!.characterId));

  /** Every slot taken = the roster is full. An empty roster is not "full" — there is nothing to collapse for yet. */
  const rosterFull =
    characterSlots.length > 0 && characterSlots.every((slot) => slot !== null);
  /** Set the moment the user clicks 展开 / 收起: from then on the panel's state is theirs alone, and the auto-collapse below stops touching it. */
  const userTookOverRef = useRef(false);
  useEffect(() => {
    if (userTookOverRef.current) return;
    setCollapsed(rosterFull);
  }, [rosterFull]);

  const takeOver = useCallback((next: boolean): void => {
    userTookOverRef.current = true;
    setCollapsed(next);
  }, []);

  useImperativeHandle(ref, () => ({ expand: () => takeOver(false) }), [takeOver]);

  /** 页面靠它决定要不要在参与者标题行上挂那颗「展开」—— 面板自己不再留下任何收起态的痕迹，这个回调就是唯一的通知渠道。 */
  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  /** FEAT-N08: 名称 / 业务 ID, case-insensitive. */
  const visible = useMemo(() => {
    /* 先按名字排序（中文按拼音首字母），再过滤。 排的是角色库这一份 —— 参与者槽位那一列（`ParticipantPanel`）的顺序是作者排的「1 号、2 号」，动它等于改谜题本身，不能跟着字母走。 */
    const list = sortByName(characters ?? []);
    const needle = keyword.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (character) =>
        character.name.toLowerCase().includes(needle) ||
        character.code.toLowerCase().includes(needle),
    );
  }, [characters, keyword]);

  const filtered = keyword.trim().length > 0;

  /* 收起 = 整列不渲染。竖排细条只为「把自己展开」而存在，却占着一条边 —— 展开箭头挂在参与者标题行的左侧（见组件头的说明）。 */
  if (collapsed) return null;

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r bg-background">
      {/* OPT-B06 §6.1: header aligns with the participant panel title bar */}
      <div
        className="flex shrink-0 items-center justify-between border-b px-3 text-sm font-medium"
        style={{ height: PARTICIPANT_HEADER_HEIGHT }}
      >
        <span>角色</span>
        {/* 刷新只出现在展开态。 */}
        <div className="flex items-center gap-1">
          <RefreshButton
            label="刷新角色"
            refreshing={charactersRefreshing}
            onRefresh={onRefreshCharacters}
          />
          <button
            type="button"
            title="收起角色列表"
            aria-label="收起角色列表"
            aria-expanded
            onClick={() => takeOver(true)}
            className={PANEL_ICON_BUTTON_CLASS}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* FEAT-N08: the filter sits right under the header, above the grid. */}
      <div className="shrink-0 border-b p-2">
        <SearchInput
          size="xs"
          value={keyword}
          onValueChange={setKeyword}
          placeholder="搜索名称 / 编码"
          aria-label="搜索角色"
        />
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
                  <span className="w-full truncate text-center text-2xs text-muted-foreground">
                    {character.name}
                  </span>
                  <button
                    type="button"
                    disabled={rosterIds.has(character.id)}
                    onClick={() => onAssignSlot(character.id)}
                    className={
                      rosterIds.has(character.id)
                        ? 'h-6 w-full rounded border bg-secondary px-2 text-2xs text-muted-foreground'
                        : 'h-6 w-full rounded border px-2 text-2xs hover:border-primary'
                    }
                  >
                    {rosterIds.has(character.id) ? '已加入' : '加入'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {filtered && visible.length > 0 ? (
            <p className="text-2xs text-muted-foreground">
              匹配 {visible.length} / {characters?.length ?? 0} 个角色
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
});

/** 收起之后那颗箭头挂在**参与者面板的标题行**上（`ParticipantPanel` 的 `headerLeading`），所以得能被别的组件渲染。 单独导出而不是让页面自己写一遍 button：这三行 `title` / `aria-label` / `aria-expanded` 是「面板的一个出口」，跟面板内部那颗「收起」是一对；散在页面里，将来改一处忘一处。 */
export function RosterExpandButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      title="展开角色列表"
      aria-label="展开角色列表"
      aria-expanded={false}
      onClick={onClick}
      className={PANEL_ICON_BUTTON_CLASS}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  );
}
