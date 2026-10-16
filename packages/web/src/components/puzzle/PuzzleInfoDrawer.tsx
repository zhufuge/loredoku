import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { HelpCircle, Plus, Trash2, X } from 'lucide-react';
import {
  LINKAGE_COLOR_KEY_PATTERN,
  LINKAGE_COLOR_LABEL_MAX_LENGTH,
  LINKAGE_COLOR_MAX_COUNT,
  LINKAGE_COLOR_MIN_COUNT,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  type CharacterSlotEntry,
  type MapLinkageColor,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ColorInput } from '@/components/ui/color-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  countLinkageColorUsage,
  isValidStyleColor,
  nextLinkageKey,
  resolveLinkageColors,
  retargetLinkageColors,
} from '@/lib/mapStyle';
import { cn } from '@/lib/utils';

/**
 * SPEC-K05 (docs/v0.5.0.md §4.2): the puzzle's 「基本信息」 drawer.
 *
 * It is exactly two things — the **description** and the **联动主题色 palette** —
 * and nothing else. Everything the map drawer carries (地图名称 / 画布尺寸 /
 * `cellSize` / `canvasFrame` / `gridSeparator` / `mouseCursorBox` /
 * `operationCursorBox` / `regionLabel` / `regionOutline` / `regionHighlight` /
 * `ruler`) belongs to the map and is deliberately absent: the puzzle only
 * **references** a map version (§5.1).
 *
 * The draft-then-commit contract is copied from `MapInfoDrawer` verbatim
 * (v0.3.9 FEAT-E01 + v0.3.10 FIX-F01/F02): every control writes a local draft,
 * the store is only touched on 保存, and the imperative handle lets the page
 * defer a panel switch until the user has decided.
 */
export interface PuzzleInfoDrawerHandle {
  /** True while the draft differs from the committed description / palette. */
  isDirty: () => boolean;
  /** Commits the draft (same as pressing 保存). */
  save: () => void;
  /** Drops the draft and re-reads the committed description / palette. */
  discard: () => void;
}

export interface PuzzleBasicInfo {
  description: string;
  linkageColors: MapLinkageColor[];
  /** The roster, re-pointed at surviving palette keys (FEAT-D04 §UI 规则). */
  characterSlots: Array<CharacterSlotEntry | null>;
}

interface PuzzleInfoDrawerProps {
  open: boolean;
  /** The committed values — the drawer edits a copy of them. */
  description: string;
  linkageColors: MapLinkageColor[];
  /** Needed only to re-point (and to preview) palette deletions. */
  characterSlots: Array<CharacterSlotEntry | null>;
  /**
   * The drawer never closes itself: both × and 取消 call this, and the page
   * decides whether to prompt for unsaved edits first.
   */
  onRequestClose: () => void;
  /** Applies the whole draft in a single undo step. */
  onCommit: (next: PuzzleBasicInfo) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Draft-then-commit wrapper so the store is only touched on 保存. */
function useDraft<T>(source: T, open: boolean): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T>(source);
  useEffect(() => {
    // Re-seed on every open so a cancelled edit never leaks into the next one.
    if (open) setDraft(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [draft, setDraft];
}

function Hint({ text }: { text: string }): JSX.Element {
  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center text-muted-foreground"
      title={text}
      aria-label={text}
      role="img"
    >
      <HelpCircle className="h-3.5 w-3.5 cursor-help" />
    </span>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-2 border-b px-4 py-3 last:border-b-0">
      <h3 className="flex items-center text-xs font-semibold text-foreground">
        <span>{title}</span>
        {hint ? <Hint text={hint} /> : null}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** Compares the two palettes field by field (both sides already normalised). */
function paletteEquals(a: MapLinkageColor[], b: MapLinkageColor[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const PuzzleInfoDrawer = forwardRef<PuzzleInfoDrawerHandle, PuzzleInfoDrawerProps>(
  function PuzzleInfoDrawer(
    {
      open,
      description,
      linkageColors,
      characterSlots,
      onRequestClose,
      onCommit,
      onDirtyChange,
    },
    ref,
  ): JSX.Element {
    const [draftDescription, setDraftDescription] = useDraft<string>(description, open);
    const [draftPalette, setDraftPalette] = useDraft<MapLinkageColor[]>(linkageColors, open);
    /**
     * The roster the draft carries. It only ever differs from the committed one
     * because a palette key was renamed or deleted — the drawer never edits a
     * participant itself.
     */
    const [draftSlots, setDraftSlots] = useDraft<Array<CharacterSlotEntry | null>>(
      characterSlots,
      open,
    );
    /** Set while committing / discarding, so the deferred switch reads clean. */
    const settledRef = useRef(false);

    const dirty =
      draftDescription !== description || !paletteEquals(draftPalette, linkageColors);
    const latest = useRef({ draftDescription, draftPalette, draftSlots, dirty });
    latest.current = { draftDescription, draftPalette, draftSlots, dirty };

    useEffect(() => {
      if (open) settledRef.current = false;
    }, [open]);

    useEffect(() => {
      onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useImperativeHandle(
      ref,
      () => ({
        isDirty: () => !settledRef.current && latest.current.dirty,
        save: () => {
          const {
            draftDescription: text,
            draftPalette: palette,
            draftSlots: slots,
            dirty: isDirty,
          } = latest.current;
          settledRef.current = true;
          if (isDirty) onCommit({ description: text, linkageColors: palette, characterSlots: slots });
          else onRequestClose();
        },
        discard: () => {
          settledRef.current = true;
          setDraftDescription(description);
          setDraftPalette(linkageColors);
          setDraftSlots(characterSlots);
        },
      }),
      [
        characterSlots,
        description,
        linkageColors,
        onCommit,
        onRequestClose,
        setDraftDescription,
        setDraftPalette,
        setDraftSlots,
      ],
    );

    const patchEntry = (index: number, patch: Partial<MapLinkageColor>): void => {
      setDraftPalette(
        draftPalette.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
      );
    };

    /**
     * FEAT-D04 §UI 规则 (kept from the map drawer): renaming a `key` re-points
     * every linkage that referenced the old one, so no participant is left
     * holding a dangling colour key.
     */
    const renameKey = (index: number, nextKey: string): void => {
      const entry = draftPalette[index];
      if (!entry) return;
      const key = nextKey.trim();
      if (!LINKAGE_COLOR_KEY_PATTERN.test(key)) return;
      if (draftPalette.some((other, i) => i !== index && other.key === key)) return;
      if (key === entry.key) return;
      setDraftSlots(retargetLinkageColors(draftSlots, entry.key, key));
      patchEntry(index, { key });
    };

    const removeEntry = (index: number): void => {
      if (draftPalette.length <= LINKAGE_COLOR_MIN_COUNT) return;
      const entry = draftPalette[index];
      if (!entry) return;
      const remaining = draftPalette.filter((_, i) => i !== index);
      const fallback = remaining[0]?.key;
      if (!fallback) return;
      setDraftSlots(retargetLinkageColors(draftSlots, entry.key, fallback));
      setDraftPalette(remaining);
    };

    const addEntry = (): void => {
      if (draftPalette.length >= LINKAGE_COLOR_MAX_COUNT) return;
      setDraftPalette(
        resolveLinkageColors([
          ...draftPalette,
          { key: nextLinkageKey(draftPalette), label: '', color: '#888888' },
        ]),
      );
    };

    const descriptionOverLimit = draftDescription.length > PUZZLE_DESCRIPTION_MAX_LENGTH;

    return (
      <aside
        aria-hidden={!open}
        data-testid="puzzle-info-drawer"
        className={cn(
          'absolute inset-y-0 right-0 z-30 flex w-80 max-w-[85vw] flex-col border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">谜题基本信息</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRequestClose}
            title="关闭（有未保存修改时会先确认）"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="描述" hint="Description — 面向玩家的谜题说明，可留空。">
            <Textarea
              value={draftDescription}
              rows={5}
              maxLength={PUZZLE_DESCRIPTION_MAX_LENGTH}
              placeholder="例如：六人六格，注意花丛的位置条件。"
              className={descriptionOverLimit ? 'border-destructive' : ''}
              onChange={(event) => setDraftDescription(event.target.value)}
            />
            <div className="flex justify-end text-[11px] text-muted-foreground">
              <span className={descriptionOverLimit ? 'font-medium text-destructive' : ''}>
                {draftDescription.length} / {PUZZLE_DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          </Section>

          <Section
            title="联动主题色"
            hint="Linkage Colors — 参与者联动高亮所用的调色板，最少 2 项、最多 12 项。改动 key 会同步所有引用它的联动。"
          >
            <ul className="space-y-2">
              {draftPalette.map((entry, index) => (
                <li key={`${entry.key}-${index}`} className="space-y-1 rounded-md border p-2">
                  <div className="flex items-center gap-1">
                    <ColorInput
                      value={isValidStyleColor(entry.color) ? entry.color : '#888888'}
                      onChange={(value) => patchEntry(index, { color: value })}
                      aria-label="选择颜色"
                    />
                    <Input
                      value={entry.color}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (!isValidStyleColor(value)) return;
                        patchEntry(index, { color: value });
                      }}
                      className="h-7 w-24 font-mono text-[11px]"
                      aria-label="颜色值"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                      title={
                        draftPalette.length <= LINKAGE_COLOR_MIN_COUNT
                          ? `至少保留 ${LINKAGE_COLOR_MIN_COUNT} 项`
                          : '删除该颜色'
                      }
                      disabled={draftPalette.length <= LINKAGE_COLOR_MIN_COUNT}
                      onClick={() => removeEntry(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="w-8 shrink-0 text-[10px] font-normal text-muted-foreground">
                      名称
                    </Label>
                    <Input
                      value={entry.label}
                      maxLength={LINKAGE_COLOR_LABEL_MAX_LENGTH}
                      placeholder={entry.key}
                      onChange={(event) => patchEntry(index, { label: event.target.value })}
                      className="h-7 flex-1 text-xs"
                      aria-label="颜色名称"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Label className="w-8 shrink-0 text-[10px] font-normal text-muted-foreground">
                      key
                    </Label>
                    <Input
                      value={entry.key}
                      onChange={(event) => renameKey(index, event.target.value)}
                      className="h-7 flex-1 font-mono text-[11px]"
                      aria-label="颜色标识"
                    />
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      被引用 {countLinkageColorUsage(draftSlots, entry.key)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={draftPalette.length >= LINKAGE_COLOR_MAX_COUNT}
              onClick={addEntry}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增颜色
            </Button>
          </Section>
        </div>

        {/* FEAT-E01: 取消 / 保存 并列固定在底部 */}
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t bg-background px-4 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onRequestClose}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!dirty || descriptionOverLimit}
            onClick={() =>
              onCommit({
                description: draftDescription,
                linkageColors: draftPalette,
                characterSlots: draftSlots,
              })
            }
          >
            保存
          </Button>
        </footer>
      </aside>
    );
  },
);
