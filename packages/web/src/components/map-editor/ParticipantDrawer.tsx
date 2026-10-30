import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_THEME_COLOR,
  PARTICIPANT_DISPLAY_NUMBER_MAX,
  UI_Z,
  type Character,
  type CharacterSlotEntry,
  type DraftRegion,
  type MapLinkageColor,
  type ParticipantTarget,
} from '@loredoku/shared';
import { parseClue } from '@/lib/clue';
import { linkageColorFor, linkageLabelFor } from '@/lib/mapStyle';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { GenderBadge } from '@/components/character/GenderBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  LinkageDialog,
  type LinkageCharacterOption,
  type LinkageAssetOption,
} from './LinkageDialog';
import { ThemeColorDialog } from './ThemeColorDialog';
import { LoredokuTick } from '@/components/common/LoredokuLoader';

/** MOD-702: max clue length. */
const CLUE_MAX = 200;
/** OPT-210 pattern: brief feedback window for the delete button spinner. */
const DELETE_FEEDBACK_MS = 150;

export interface PlacedItemOption {
  assetId: number;
  name: string;
  /** v0.5.3 FIX-N12: the item's 业务 ID (the linkage picker shows it). */
  code: string;
  x: number;
  y: number;
}

interface ParticipantDrawerProps {
  open: boolean;
  onClose: () => void;
  slotIndex: number | null;
  slots: Array<CharacterSlotEntry | null>;
  character: Character | undefined;
  charactersById: Map<number, Character>;
  placedItems: PlacedItemOption[];
  regions: DraftRegion[];
  gridSize: number;
  /**
   * FEAT-D04 + v0.5.0 FEAT-K14 (Q16): the linkage palette. It used to hang off
   * `MapStyle`; the puzzle owns it now, so it is passed directly.
   */
  linkageColors: MapLinkageColor[];
  /**
   * FEAT-E01 (docs/v0.4.1.md §7.3): picking a position happens on the canvas,
   * so the drawer only owns the intent — the page owns the pointer.
   */
  positionPickActive?: boolean;
  onTogglePositionPick?: () => void;
  /** The cell the page just reported from the canvas; consumed via the callback. */
  pickedPosition?: { x: number; y: number } | null;
  onPositionPicked?: () => void;
  onSave: (
    slotIndex: number,
    patch: {
      themeColor: string;
      clue: string;
      linkages: ParticipantTarget[];
      /** FEAT-E01 §7.4: `[]` means "no positional constraint". */
      positionConditions: Array<{ x: number; y: number }>;
      /** v0.6.4 §2: the 编号展示 text; `''` clears it back to the sequence number. */
      displayNumber: string;
    },
  ) => void;
}

/**
 * CLAR-603 + MOD-702/801 (docs/v0.3.2.md + v0.3.3.md): right-side info drawer.
 * MOD-801:
 * - theme colour palette (no luminance hint, no hex hints)
 * - clue editor without the `**bold**` hint (char count kept)
 * - 「联动」 module: one flat list (no click/touch tabs), add / edit via
 *   LinkageDialog, delete via AlertDialog with loading (OPT-210)
 * - no preview buttons (MOD-802 moved previews to the roster panel)
 */
export function ParticipantDrawer({
  open,
  onClose,
  slotIndex,
  slots,
  character,
  charactersById,
  placedItems,
  regions,
  gridSize,
  linkageColors,
  positionPickActive = false,
  onTogglePositionPick,
  pickedPosition,
  onPositionPicked,
  onSave,
}: ParticipantDrawerProps): JSX.Element | null {
  const [themeColor, setThemeColor] = useState<string>(DEFAULT_THEME_COLOR);
  /** FEAT-H08 §8.2(a): the palette lives one layer down now. */
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [clue, setClue] = useState<string>('');
  /** v0.6.4 §2: the configured 编号展示 text (`''` = show the sequence number). */
  const [displayNumber, setDisplayNumber] = useState<string>('');
  const [linkages, setLinkages] = useState<ParticipantTarget[]>([]);
  /** FEAT-E01: the cells this participant may occupy (OR-ed, §14 Q11). */
  const [positionConditions, setPositionConditions] = useState<Array<{ x: number; y: number }>>(
    [],
  );
  const [linkageDialog, setLinkageDialog] = useState<{
    open: boolean;
    /** Index into `linkages` when editing; `null` when adding. */
    editIndex: number | null;
  }>({ open: false, editIndex: null });
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const slot = slotIndex === null ? null : slots[slotIndex] ?? null;

  useEffect(() => {
    if (!open || !slot) return;
    setThemeColor(slot.themeColor ?? DEFAULT_THEME_COLOR);
    setClue(slot.clue ?? '');
    setDisplayNumber(slot.displayNumber ?? '');
    setLinkages((slot.linkages ?? []).map((linkage) => ({ ...linkage })));
    setPositionConditions((slot.positionConditions ?? []).map((entry) => ({ ...entry })));
    setLinkageDialog({ open: false, editIndex: null });
    setThemeDialogOpen(false);
    setDeleteIndex(null);
    setDeleting(false);
  }, [open, slot]);

  /**
   * FEAT-E01 §7.3(a): the page reports the picked cell. Duplicates are ignored
   * (§7.2 去重) and the page is told the pick was consumed either way, so the
   * selection mode can end.
   */
  useEffect(() => {
    if (!pickedPosition) return;
    const { x, y } = pickedPosition;
    setPositionConditions((previous) =>
      previous.some((entry) => entry.x === x && entry.y === y) ? previous : [...previous, { x, y }],
    );
    onPositionPicked?.();
  }, [pickedPosition, onPositionPicked]);

  // ---- Linkage dialog option sources ----
  const characterOptions = useMemo<LinkageCharacterOption[]>(() => {
    const options: LinkageCharacterOption[] = [];
    slots.forEach((entry, index) => {
      if (!entry || index === slotIndex) return;
      options.push({
        id: entry.characterId,
        name: charactersById.get(entry.characterId)?.name ?? '',
      });
    });
    return options;
  }, [slots, charactersById, slotIndex]);

  const itemOptions = useMemo<LinkageAssetOption[]>(() => {
    const byId = new Map<number, LinkageAssetOption>();
    for (const item of placedItems) {
      const existing = byId.get(item.assetId);
      if (existing) {
        existing.instances.push([item.x, item.y]);
      } else {
        byId.set(item.assetId, {
          assetId: item.assetId,
          name: item.name,
          // FIX-N12 §6.5: the 业务 ID travels with the option so the picker can
          // show 名称（业务 ID）instead of `#主键`.
          code: item.code,
          instances: [[item.x, item.y]],
        });
      }
    }
    return [...byId.values()];
  }, [placedItems]);

  /**
   * FEAT-H09 §9.2(3~4) (docs/v0.4.2.md §9): 「取消」, the × button and `Esc` all
   * mean the same thing — drop this drawer's local edits and close. The store is
   * never touched, so no undo step appears. (The page closes the drawer on `Esc`
   * by clearing the selection, and the seeding effect above guarantees a fresh
   * open reads the stored slot again.)
   */
  const cancel = (): void => {
    if (slot) {
      setThemeColor(slot.themeColor ?? DEFAULT_THEME_COLOR);
      setClue(slot.clue ?? '');
      setDisplayNumber(slot.displayNumber ?? '');
      setLinkages((slot.linkages ?? []).map((linkage) => ({ ...linkage })));
      setPositionConditions((slot.positionConditions ?? []).map((entry) => ({ ...entry })));
    }
    setLinkageDialog({ open: false, editIndex: null });
    setThemeDialogOpen(false);
    onClose();
  };

  // MOD-702: clue char count (no bold-syntax hint any more).
  const clueOverLimit = clue.length > CLUE_MAX;

  const submitLinkages = (produced: ParticipantTarget[]): void => {
    setLinkages((previous) => {
      const editIndex = linkageDialog.editIndex;
      if (editIndex === null) {
        // Add: append, skipping exact duplicates.
        const next = [...previous];
        for (const linkage of produced) {
          const duplicate = next.some(
            (item) =>
              item.type === linkage.type &&
              JSON.stringify(stripMeta(item)) === JSON.stringify(stripMeta(linkage)),
          );
          if (!duplicate) next.push(linkage);
        }
        return next;
      }
      // Edit: replace the edited entry with the produced set.
      const head = previous.slice(0, editIndex);
      const tail = previous.slice(editIndex + 1);
      return [...head, ...produced, ...tail];
    });
  };

  const confirmDelete = (): void => {
    if (deleteIndex === null) return;
    const index = deleteIndex;
    setDeleting(true);
    window.setTimeout(() => {
      setLinkages((previous) => previous.filter((_, i) => i !== index));
      setDeleting(false);
      setDeleteIndex(null);
    }, DELETE_FEEDBACK_MS);
  };

  const name = character?.name ?? (slot ? `#${slot.characterId}` : '');
  const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';

  if (!open) return null;

  return (
    <aside
      className={
        'absolute inset-y-0 right-0 w-80 max-w-[85vw] border-l bg-background/95 shadow-lifted backdrop-blur transition-transform duration-slow ' +
        (open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full')
      }
      /**
       * FIX-N10 (docs/v0.5.3.md §6.3): `inset-y-0` is measured against the
       * nearest positioned ancestor — which must be the row **below** the
       * header bar, never the page root. The page renders this drawer inside
       * that row for exactly this reason.
       *
       * FIX-N11 §6.4: `UI_Z.drawer` — the top-most of the three panels.
       */
      style={{ zIndex: UI_Z.drawer }}
      aria-hidden={!open}
      data-testid="participant-drawer"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">参与者：{name}</h2>
          <button
            type="button"
            onClick={cancel}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="关闭（等同取消）"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
          {!slot ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              选择左侧参与者框以编辑联动配置
            </p>
          ) : (
            <>
              {/* Avatar + name — MOD-703: theme color background layer.
                  OPT-H06 §6.2: exactly one circle — this disc clips, the
                  thumbnail fills it and draws no ring of its own. */}
              <div className="flex items-start gap-4">
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full"
                  style={{
                    backgroundColor: themeColor,
                    border: isWhiteTheme ? '1px solid #D1D5DB' : 'none',
                  }}
                >
                  {character ? (
                    <CharacterThumbnail
                      character={character}
                      shape="plain"
                      bordered={false}
                      className="h-full w-full text-2xl"
                    />
                  ) : (
                    <span className="text-2xl font-semibold text-muted-foreground">
                      {name.slice(0, 1)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="truncate">{name}</span>
                    <GenderBadge gender={character?.gender} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    角色 ID：<span className="font-mono">{character?.code ?? '—'}</span>
                  </p>
                </div>
              </div>

              {/*
               * Theme colour — FEAT-H08 §8.2(a) (docs/v0.4.2.md §8): one row with
               * the current selection. The editing controls moved one layer down
               * into `ThemeColorDialog`, which the row opens. v0.8.3：那一层里现在
               * 只有取色器 + hex（色板已按用户要求删除）。
               */}
              <div className="space-y-2">
                <Label>主题色</Label>
                <button
                  type="button"
                  aria-label="修改主题色"
                  onClick={() => setThemeDialogOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors hover:border-primary"
                >
                  <span
                    className="h-6 w-6 shrink-0 rounded-full border"
                    style={{ backgroundColor: themeColor }}
                    data-testid="theme-color-chip"
                  />
                  <span className="font-mono text-xs">{themeColor}</span>
                  <span className="ml-auto text-xs text-muted-foreground">修改</span>
                </button>
              </div>

              {/*
               * v0.6.4 (docs/v0.6.4.md §2): 编号展示 — the text the slot's
               * top-left badge shows. Left empty it shows the sequence number,
               * which is what the placeholder spells out. The mapping lives on
               * the slot entry, so rearranging the roster renumbers the badges
               * but never overwrites a configured text.
               */}
              <div className="space-y-2">
                <Label>编号展示</Label>
                <Input
                  value={displayNumber}
                  onChange={(event) => setDisplayNumber(event.target.value)}
                  maxLength={PARTICIPANT_DISPLAY_NUMBER_MAX}
                  placeholder={`序号 ${(slotIndex ?? 0) + 1}`}
                  data-testid="display-number-input"
                />
                <p className="text-xs text-muted-foreground">
                  留空显示序号；拖动改变位置时序号会更新，不会覆盖此处配置。
                </p>
              </div>

              {/* MOD-702: clue editor (no bold hint, char count kept) */}
              <div className="space-y-2">
                <Label>线索</Label>
                <Textarea
                  value={clue}
                  onChange={(event) => setClue(event.target.value)}
                  rows={3}
                  placeholder="一句话线索"
                  className={clueOverLimit ? 'border-destructive' : ''}
                />
                <div className="flex items-center justify-end text-xs text-muted-foreground">
                  <span className={clueOverLimit ? 'text-destructive font-medium' : ''}>
                    {clue.length} / {CLUE_MAX}
                  </span>
                </div>
                {/* Live bold preview */}
                {clue.trim() ? (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                    {parseClue(clue).map((seg, i) =>
                      seg.bold ? (
                        <strong key={i}>{seg.text}</strong>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </div>
                ) : null}
              </div>

              {/* MOD-801: 联动 module — one flat list, no tabs */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">联动</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto h-7 text-xs"
                    onClick={() => setLinkageDialog({ open: true, editIndex: null })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加联动
                  </Button>
                </div>

                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {linkages.length === 0 ? (
                    <li className="py-2 text-center text-xs text-muted-foreground">
                      暂无联动，点击「添加联动」
                    </li>
                  ) : (
                    linkages.map((linkage, index) => (
                      <li
                        key={`${linkage.type}-${index}`}
                        className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                      >
                        {/* OPT-H07 §7.2: no 「高亮」 badge — the effect is fixed
                            and the badge carried no information. */}
                        <span className="truncate">
                          {describeLinkage(linkage, charactersById, itemOptions, regions)}
                        </span>
                        <span
                          className="ml-auto h-4 w-4 shrink-0 rounded-full border"
                          style={{ backgroundColor: linkageColorFor(linkageColors, linkage.color) }}
                          title={linkageLabelFor(linkageColors, linkage.color)}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-primary"
                          title="编辑"
                          onClick={() => setLinkageDialog({ open: true, editIndex: index })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="删除"
                          onClick={() => setDeleteIndex(index)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {/* FEAT-E01 (docs/v0.4.1.md §7): 位置条件 — a list of allowed cells */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">位置条件</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant={positionPickActive ? 'default' : 'outline'}
                    className="ml-auto h-7 text-xs"
                    onClick={onTogglePositionPick}
                  >
                    {positionPickActive ? (
                      '取消选择'
                    ) : (
                      <>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        添加位置
                      </>
                    )}
                  </Button>
                </div>
                {positionPickActive ? (
                  <p className="rounded-md border border-dashed bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                    请在画布上点击要允许的位置（`Esc` 取消）。
                  </p>
                ) : null}

                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {positionConditions.length === 0 ? (
                    <li className="py-2 text-center text-xs text-muted-foreground">
                      暂无位置条件，点击「添加位置」
                    </li>
                  ) : (
                    [...positionConditions]
                      .map((entry, index) => ({ entry, index }))
                      .sort(
                        (a, b) =>
                          a.entry.y - b.entry.y ||
                          a.entry.x - b.entry.x ||
                          a.index - b.index,
                      )
                      .map(({ entry, index }) => (
                        <li
                          key={`${entry.x},${entry.y}`}
                          className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
                        >
                          <span className="font-mono">
                            R{entry.y + 1} C{entry.x + 1}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="ml-auto h-6 w-6 text-muted-foreground hover:text-destructive"
                            title="删除该位置"
                            onClick={() =>
                              setPositionConditions((previous) =>
                                previous.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))
                  )}
                </ul>
                <p className="text-xs text-muted-foreground">
                  多个位置之间为「或」关系；留空表示不限制位置。
                </p>
              </div>

            </>
          )}
        </div>

        {/*
         * FEAT-H09 §9.2(1~2) (docs/v0.4.2.md §9): the buttons live in a fixed
         * footer, outside the scroll area, so they are always reachable. 取消 and
         * the × / `Esc` all discard the same local edits; 保存 is the only path
         * into the store. No footer in the empty state (§9.2.7).
         */}
        {slot ? (
          <div className="flex shrink-0 gap-2 border-t px-4 py-3">
            <Button type="button" variant="outline" className="flex-1" onClick={cancel}>
              取消
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={clueOverLimit}
              onClick={() => {
                if (slotIndex === null) return;
                onSave(slotIndex, {
                  themeColor,
                  clue,
                  linkages,
                  positionConditions,
                  displayNumber,
                });
              }}
            >
              保存
            </Button>
          </div>
        ) : null}
      </div>

      <ThemeColorDialog
        open={themeDialogOpen}
        value={themeColor}
        onOpenChange={setThemeDialogOpen}
        onConfirm={(color) => {
          setThemeColor(color);
          setThemeDialogOpen(false);
        }}
      />

      <LinkageDialog
        open={linkageDialog.open}
        onOpenChange={(next) =>
          setLinkageDialog((state) => ({ open: next, editIndex: next ? state.editIndex : null }))
        }
        linkage={
          linkageDialog.open && linkageDialog.editIndex !== null
            ? linkages[linkageDialog.editIndex] ?? null
            : null
        }
        characters={characterOptions}
        items={itemOptions}
        regions={regions}
        gridSize={gridSize}
        linkageColors={linkageColors}
        onSubmit={submitLinkages}
      />

      {/* MOD-801: delete confirmation with loading (OPT-210) */}
      <AlertDialog
        open={deleteIndex !== null}
        onOpenChange={(next) => {
          if (!next && !deleting) setDeleteIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除该联动吗？</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <LoredokuTick className="mr-1" />
                  删除中…
                </>
              ) : (
                '删除'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

/** Drops `effect` so duplicates compare on object + colour only. */
function stripMeta(linkage: ParticipantTarget): Record<string, unknown> {
  const { effect: _effect, ...rest } = linkage;
  return rest;
}

/** Human readable label for one stored linkage. */
function describeLinkage(
  linkage: ParticipantTarget,
  charactersById: Map<number, Character>,
  items: LinkageAssetOption[],
  regions: DraftRegion[],
): string {
  switch (linkage.type) {
    case 'character':
      return `角色 · ${charactersById.get(linkage.id)?.name ?? `#${linkage.id}`}`;
    case 'asset': {
      const item = items.find((entry) => entry.assetId === linkage.id);
      const label = item?.name ?? `#${linkage.id}`;
      return linkage.scope === 'instances'
        ? `物品 · ${label} · ${linkage.instances?.length ?? 0} 实例`
        : `物品 · ${label} × ${item?.instances.length ?? 0}`;
    }
    case 'cell':
      return `方格 · ${linkage.cells.length} 格`;
    case 'region':
      return `区域 · ${regions.find((entry) => entry.id === linkage.id)?.name ?? linkage.id}`;
  }
}
