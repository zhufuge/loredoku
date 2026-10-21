import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
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
  PUZZLE_NAME_MAX_LENGTH,
  ROSTER_COLS_MAX,
  UI_Z,
  type CharacterSlotEntry,
  type MapLinkageColor,
} from '@loredoku/shared';
import { CoverPicker } from '@/components/common/CoverPicker';
import {
  computeParticipantLayout,
  resolveRosterCols,
  rosterRows,
} from '@/lib/participantLayout';
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
 * It holds what the puzzle owns — **名称 / 封面**（v0.7.3）、the **description**,
 * the **联动主题色 palette** and (v0.6.3 §3) the **参与者布局** column count —
 * and nothing else. Everything the map drawer carries (画布尺寸 / `cellSize` /
 * `canvasFrame` / `gridSeparator` / `mouseCursorBox` / `operationCursorBox` /
 * `regionLabel` / `regionOutline` / `regionHighlight` / `ruler`) belongs to the
 * map and is deliberately absent: the puzzle only **references** a map version
 * (§5.1).
 *
 * 名称与其余字段一起进草稿（撤销 + 随保存落库）；封面不同 —— 它没有 JSON 通道，
 * 且 fork 态（`?v=`）下还没有可写的行，所以这里只产出 `{ file, removed }`，
 * 由页面留在本地、等草稿保存成功后再上传（与 `MapInfoDrawer` 同一套契约）。
 *
 * The draft-then-commit contract: every control writes a local draft, the store
 * is only touched on 保存, and the imperative handle lets the page defer a panel
 * switch until the user has decided.
 */
export interface PuzzleInfoDrawerHandle {
  /** True while the draft differs from the committed name / description / palette / cover. */
  isDirty: () => boolean;
  /** Commits the draft (same as pressing 保存). `false` = the name is invalid. */
  save: () => boolean;
  /** Drops the draft and re-reads the committed values. */
  discard: () => void;
}

export interface PuzzleBasicInfo {
  /** v0.7.3 §2: the puzzle's own name (required). */
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  /** The roster, re-pointed at surviving palette keys (FEAT-D04 §UI 规则). */
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 (docs/v0.6.3.md §3): `null` = 自动. */
  rosterCols: number | null;
  /** v0.7.3 §2: a freshly picked cover file, or `null` to keep the stored one. */
  coverFile: File | null;
  /** v0.7.3 §2: the stored cover should be dropped. */
  coverRemoved: boolean;
}

interface PuzzleInfoDrawerProps {
  open: boolean;
  /** The committed values — the drawer edits a copy of them. */
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  /** Needed only to re-point (and to preview) palette deletions. */
  characterSlots: Array<CharacterSlotEntry | null>;
  /** v0.6.3 §3: the committed column count. `null` = 自动. */
  rosterCols: number | null;
  /** The cover currently on the server (`null` when it has none). */
  coverUrl: string | null;
  /** A cover file already applied to the page's local state but not uploaded yet. */
  coverFile: File | null;
  /** The page's local state already marks the stored cover as removed. */
  coverRemoved: boolean;
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
      name,
      description,
      linkageColors,
      characterSlots,
      rosterCols,
      coverUrl,
      coverFile,
      coverRemoved,
      onRequestClose,
      onCommit,
      onDirtyChange,
    },
    ref,
  ): JSX.Element {
    const [draftName, setDraftName] = useDraft<string>(name, open);
    const [draftDescription, setDraftDescription] = useDraft<string>(description, open);
    const [draftPalette, setDraftPalette] = useDraft<MapLinkageColor[]>(linkageColors, open);
    /** v0.6.3 §3: the column count is drafted like everything else here. */
    const [draftCols, setDraftCols] = useDraft<number | null>(rosterCols, open);
    /** v0.7.3 §2: the cover is drafted as `{ file, removed }` and uploaded on save. */
    const [draftCoverFile, setDraftCoverFile] = useDraft<File | null>(coverFile, open);
    const [draftCoverRemoved, setDraftCoverRemoved] = useDraft<boolean>(coverRemoved, open);
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

    const nameBlank = draftName.trim().length === 0;
    const dirty =
      draftName !== name ||
      draftDescription !== description ||
      !paletteEquals(draftPalette, linkageColors) ||
      draftCols !== rosterCols ||
      draftCoverFile !== coverFile ||
      draftCoverRemoved !== coverRemoved;
    const latest = useRef({
      draftName,
      draftDescription,
      draftPalette,
      draftSlots,
      draftCols,
      draftCoverFile,
      draftCoverRemoved,
      dirty,
      blocked: nameBlank,
    });
    latest.current = {
      draftName,
      draftDescription,
      draftPalette,
      draftSlots,
      draftCols,
      draftCoverFile,
      draftCoverRemoved,
      dirty,
      blocked: nameBlank,
    };

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
          const current = latest.current;
          // 名称为空时不提交、也不关 —— 留在原地让用户补完。
          if (current.blocked) return false;
          settledRef.current = true;
          if (current.dirty)
            onCommit({
              name: current.draftName.trim(),
              description: current.draftDescription,
              linkageColors: current.draftPalette,
              characterSlots: current.draftSlots,
              rosterCols: current.draftCols,
              coverFile: current.draftCoverFile,
              coverRemoved: current.draftCoverRemoved,
            });
          else onRequestClose();
          return true;
        },
        discard: () => {
          settledRef.current = true;
          setDraftName(name);
          setDraftDescription(description);
          setDraftPalette(linkageColors);
          setDraftSlots(characterSlots);
          setDraftCols(rosterCols);
          setDraftCoverFile(coverFile);
          setDraftCoverRemoved(coverRemoved);
        },
      }),
      [
        characterSlots,
        coverFile,
        coverRemoved,
        name,
        description,
        linkageColors,
        rosterCols,
        onCommit,
        onRequestClose,
        setDraftName,
        setDraftDescription,
        setDraftPalette,
        setDraftSlots,
        setDraftCols,
        setDraftCoverFile,
        setDraftCoverRemoved,
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

    /**
     * v0.6.3 §3.2: the row count is never typed, only shown — it is
     * `ceil(参与者数 / 列数)`, recomputed on every keystroke. With no column
     * count (自动) the preview shows the golden-ratio layout the panel will
     * pick, so the two agree before the user commits to a number.
     */
    const slotTotal = characterSlots.length;
    const autoLayout = useMemo(() => computeParticipantLayout(slotTotal), [slotTotal]);
    const previewCols = draftCols ?? autoLayout.cols;
    const previewRows = draftCols === null ? autoLayout.rows : rosterRows(slotTotal, draftCols);

    /**
     * An empty field means 自动 (the stored value is `null`); anything else is
     * forced into `[1, min(参与者数, ROSTER_COLS_MAX)]` so the preview can
     * never describe a matrix with more columns than it has people, and the
     * panel never has to scroll to show them.
     */
    const changeCols = (raw: string): void => {
      if (raw.trim() === '') {
        setDraftCols(null);
        return;
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        setDraftCols(null);
        return;
      }
      setDraftCols(Math.min(ROSTER_COLS_MAX, resolveRosterCols(parsed, slotTotal) ?? 1));
    };

    return (
      <aside
        aria-hidden={!open}
        data-testid="puzzle-info-drawer"
        className={cn(
          'absolute inset-y-0 right-0 flex w-80 max-w-[85vw] flex-col border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200',
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
        // FIX-N11 (docs/v0.5.3.md §6.4): shared layer constant.
        style={{ zIndex: UI_Z.infoDrawer }}
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
          {/*
            v0.7.3 §2：名称 / 描述 / 封面合成一块「基本」，与地图抽屉同一个排版。
            名称与描述进草稿；封面只交 `{ file, removed }`，页面等保存成功后再上传。
          */}
          <Section
            title="基本"
            hint="Info — 名称、描述与封面。封面图片在点「保存」后上传。"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="puzzle-info-name" className="text-[11px] font-normal text-muted-foreground">
                名称
              </Label>
              <Input
                id="puzzle-info-name"
                value={draftName}
                maxLength={PUZZLE_NAME_MAX_LENGTH}
                placeholder="例如：午夜花园"
                className={cn('h-7 text-xs', nameBlank ? 'border-destructive' : undefined)}
                onChange={(event) => setDraftName(event.target.value)}
              />
              {nameBlank ? <p className="text-[11px] text-destructive">谜题名称必填。</p> : null}
            </div>

            <div className="grid gap-1.5">
              <Label
                htmlFor="puzzle-info-description"
                className="text-[11px] font-normal text-muted-foreground"
              >
                描述
              </Label>
              <Textarea
                id="puzzle-info-description"
                value={draftDescription}
                rows={5}
                maxLength={PUZZLE_DESCRIPTION_MAX_LENGTH}
                placeholder="例如：六人六格，注意花丛的位置条件。"
                className={descriptionOverLimit ? 'border-destructive' : undefined}
                onChange={(event) => setDraftDescription(event.target.value)}
              />
              <div className="flex justify-end text-[11px] text-muted-foreground">
                <span className={descriptionOverLimit ? 'font-medium text-destructive' : ''}>
                  {draftDescription.length} / {PUZZLE_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
            </div>

            <CoverPicker
              noun="谜题"
              layout="stack"
              storedUrl={coverUrl}
              file={draftCoverFile}
              removed={draftCoverRemoved}
              onPick={(picked) => {
                setDraftCoverFile(picked);
                // 新选的文件永远盖过「准备移除」这个状态。
                if (picked) setDraftCoverRemoved(false);
              }}
              onRemove={() => {
                setDraftCoverFile(null);
                setDraftCoverRemoved(true);
              }}
              onRestore={() => setDraftCoverRemoved(false)}
            />
          </Section>

          <Section
            title="参与者布局"
            hint="Roster Layout — 只填列数，行数按参与者数量算出。槽框尺寸固定，面板整体宽度随列数变化；留空则回到自动排列。"
          >
            {/*
              v0.6.3: the control is just 「输入框 × 行数」— the field carries
              the column count, so a 列数 label would only repeat it, and the
              row count is derived, never typed. 自动 (empty field) shows the
              layout the panel will pick on its own.
            */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={ROSTER_COLS_MAX}
                value={draftCols === null ? '' : String(draftCols)}
                placeholder="自动"
                onChange={(event) => changeCols(event.target.value)}
                className="h-7 w-20 text-xs tabular-nums"
                aria-label="参与者列数"
              />
              <span
                data-testid="roster-layout-preview"
                className="text-xs tabular-nums text-muted-foreground"
              >
                {draftCols === null
                  ? `${previewCols} × ${previewRows}（自动）`
                  : `× ${previewRows}`}
              </span>
            </div>
          </Section>

          <Section
            title="联动主题色"
            hint="Linkage Colors — 参与者联动高亮所用的调色板，最少 2 项、最多 12 项。改动 key 会同步所有引用它的联动。"
          >
            <ul className="space-y-2">
              {/*
                FIX-O17 (docs/v0.5.4.md §7.4): the row's `key` must NOT contain
                the entry's own `key` — every edit to it remounted the row and
                stole focus from the input. The row's identity is its index.
              */}
              {draftPalette.map((entry, index) => (
                <li key={index} className="space-y-1 rounded-md border p-2">
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
                  {/* FIX-O16 (docs/v0.5.4.md §7.3): no swatch grid here — the
                      palette belongs to the participant's theme colour only.
                      The `ColorInput` above plus the hex field stay. */}
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
            disabled={!dirty || descriptionOverLimit || nameBlank}
            onClick={() =>
              onCommit({
                name: draftName.trim(),
                description: draftDescription,
                linkageColors: draftPalette,
                characterSlots: draftSlots,
                rosterCols: draftCols,
                coverFile: draftCoverFile,
                coverRemoved: draftCoverRemoved,
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
