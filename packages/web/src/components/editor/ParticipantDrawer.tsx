import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  DEFAULT_THEME_COLOR,
  EFFECT_COLOR_HEX,
  EFFECT_COLOR_LABELS,
  THEME_COLOR_PALETTE,
  type Character,
  type CharacterSlotEntry,
  type DraftRegion,
  type EffectColor,
  type ParticipantTarget,
} from '@murdoku/shared';
import { normalizeHexColor } from '@murdoku/shared';
import { parseClue } from '@/lib/clue';
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
  type LinkageItemOption,
} from './LinkageDialog';

/** MOD-702: max clue length. */
const CLUE_MAX = 200;
/** OPT-210 pattern: brief feedback window for the delete button spinner. */
const DELETE_FEEDBACK_MS = 150;

export interface PlacedItemOption {
  itemId: number;
  name: string;
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
  onSave: (
    slotIndex: number,
    patch: { themeColor: string; clue: string; linkages: ParticipantTarget[] },
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
  onSave,
}: ParticipantDrawerProps): JSX.Element | null {
  const [themeColor, setThemeColor] = useState<string>(DEFAULT_THEME_COLOR);
  const [hexDraft, setHexDraft] = useState<string>(DEFAULT_THEME_COLOR);
  const [clue, setClue] = useState<string>('');
  const [linkages, setLinkages] = useState<ParticipantTarget[]>([]);
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
    setHexDraft(slot.themeColor ?? DEFAULT_THEME_COLOR);
    setClue(slot.clue ?? '');
    setLinkages((slot.linkages ?? []).map((linkage) => ({ ...linkage })));
    setLinkageDialog({ open: false, editIndex: null });
    setDeleteIndex(null);
    setDeleting(false);
  }, [open, slot]);

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

  const itemOptions = useMemo<LinkageItemOption[]>(() => {
    const byId = new Map<number, LinkageItemOption>();
    for (const item of placedItems) {
      const existing = byId.get(item.itemId);
      if (existing) {
        existing.instances.push([item.x, item.y]);
      } else {
        byId.set(item.itemId, {
          itemId: item.itemId,
          name: item.name,
          instances: [[item.x, item.y]],
        });
      }
    }
    return [...byId.values()];
  }, [placedItems]);

  const applyHex = (): void => {
    const normalized = normalizeHexColor(hexDraft);
    if (!normalized) {
      setHexDraft(themeColor);
      return;
    }
    // MOD-801: any valid hex is accepted — no hints, no blocking.
    setThemeColor(normalized);
    setHexDraft(normalized);
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

  const avatar = character?.avatarThumbUrl ?? character?.avatarUrl;
  const name = character?.name ?? (slot ? `#${slot.characterId}` : '');
  const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';

  if (!open) return null;

  return (
    <aside
      className={
        'absolute inset-y-0 right-0 z-30 w-80 max-w-[85vw] border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200 ' +
        (open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full')
      }
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">参与者：{name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="关闭"
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
              {/* Avatar + name — MOD-703: theme color background layer */}
              <div className="flex items-start gap-4">
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: themeColor,
                    border: isWhiteTheme ? '1px solid #D1D5DB' : 'none',
                  }}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={name}
                      draggable={false}
                      className="h-[82%] w-[82%] rounded-full object-cover"
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

              {/* Theme colour picker — MOD-801: darkened 15-colour palette */}
              <div className="space-y-2">
                <Label>主题色</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {THEME_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={`主题色 ${color}`}
                      onClick={() => {
                        setThemeColor(color);
                        setHexDraft(color);
                      }}
                      className={
                        'h-7 w-7 rounded-full border-2 transition-transform ' +
                        (themeColor.toUpperCase() === color.toUpperCase()
                          ? 'scale-110 border-primary'
                          : 'border-border hover:border-primary')
                      }
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">当前</span>
                    <span
                      className="h-6 w-6 rounded border"
                      style={{ backgroundColor: themeColor }}
                    />
                    <span className="font-mono text-xs">{themeColor}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={hexDraft}
                    onChange={(event) => setHexDraft(event.target.value)}
                    onBlur={applyHex}
                    placeholder="#RRGGBB"
                    className="h-8 w-32 font-mono text-xs"
                    aria-label="自定义主题色"
                  />
                  <Button variant="outline" size="sm" className="h-8" onClick={applyHex}>
                    应用
                  </Button>
                </div>
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
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                          高亮
                        </span>
                        <span className="truncate">
                          {describeLinkage(linkage, charactersById, itemOptions, regions)}
                        </span>
                        <span
                          className="ml-auto h-4 w-4 shrink-0 rounded-full border"
                          style={{ backgroundColor: EFFECT_COLOR_HEX[linkage.color] }}
                          title={EFFECT_COLOR_LABELS[linkage.color]}
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

              {/* MOD-802: save only — no preview buttons in the drawer */}
              <div className="space-y-2 border-t pt-3">
                <Button
                  type="button"
                  className="w-full"
                  disabled={!slot || clueOverLimit}
                  onClick={() => {
                    if (slotIndex === null) return;
                    onSave(slotIndex, { themeColor, clue, linkages });
                  }}
                >
                  保存
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

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
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
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
  items: LinkageItemOption[],
  regions: DraftRegion[],
): string {
  switch (linkage.type) {
    case 'character':
      return `角色 · ${charactersById.get(linkage.id)?.name ?? `#${linkage.id}`}`;
    case 'item': {
      const item = items.find((entry) => entry.itemId === linkage.id);
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
