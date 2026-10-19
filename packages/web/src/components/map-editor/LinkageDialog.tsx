import { useEffect, useMemo, useState } from 'react';
import {
  PARTICIPANT_TARGET_TYPES,
  type DraftRegion,
  type LinkageColorKey,
  type MapLinkageColor,
  type ParticipantTarget,
  type ParticipantTargetType,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  applyRectClick,
  cellKey,
  clearCells,
  selectAllCells,
  selectColumn,
  selectRectangle,
  selectRow,
  selectionToCoords,
  toggleCell,
  type CellSelection,
} from '@/lib/cellSelection';

/**
 * MOD-801 (docs/v0.3.3.md §1.1.3): add / edit dialog for one participant's
 * linkages. Multi-select lists expand to one stored linkage per object;
 * the cell type embeds a matrix picker with row / column / rectangle
 * quick selection.
 */

export interface LinkageCharacterOption {
  id: number;
  name: string;
}

export interface LinkageAssetOption {
  assetId: number;
  name: string;
  /**
   * v0.5.3 FIX-N12 (docs/v0.5.3.md §6.5): the item's **业务 ID**. The list used
   * to lead with `#${assetId}` — a database primary key the author never sees.
   * `''` means the item carries no code, and the label degrades to the name.
   */
  code: string;
  /** Anchor coords of every placed instance of this item. */
  instances: Array<[number, number]>;
}

const TARGET_TYPE_LABELS: Record<ParticipantTargetType, string> = {
  character: '角色',
  asset: '资源',
  cell: '方格',
  region: '区域',
};

type QuickMode = 'row' | 'column' | 'rect' | null;

const QUICK_LABELS: Record<Exclude<QuickMode, null>, string> = {
  row: '整行',
  column: '整列',
  rect: '矩形范围',
};

/** Mutable dialog state; converted to stored linkages by {@link buildLinkages}. */
export interface LinkageDraft {
  type: ParticipantTargetType;
  characterIds: number[];
  assetId: number | null;
  assetScope: 'all' | 'instances';
  assetInstances: Array<[number, number]>;
  regionIds: string[];
  cells: Array<[number, number]>;
  /** FEAT-D04: a key of the linkage palette. */
  color: LinkageColorKey;
}

export const EMPTY_LINKAGE_DRAFT: LinkageDraft = {
  type: 'character',
  characterIds: [],
  assetId: null,
  assetScope: 'all',
  assetInstances: [],
  regionIds: [],
  cells: [],
  color: 'red',
};

/** Edit refill: rebuilds the draft state from one stored linkage. */
export function draftFromLinkage(linkage: ParticipantTarget | null): LinkageDraft {
  if (!linkage) return { ...EMPTY_LINKAGE_DRAFT };
  const base: LinkageDraft = {
    ...EMPTY_LINKAGE_DRAFT,
    type: linkage.type,
    color: linkage.color,
  };
  switch (linkage.type) {
    case 'character':
      return { ...base, characterIds: [linkage.id] };
    case 'asset':
      return {
        ...base,
        assetId: linkage.id,
        assetScope: linkage.scope,
        assetInstances: linkage.instances ? [...linkage.instances] : [],
      };
    case 'cell':
      return { ...base, cells: linkage.cells.map((cell) => [...cell] as [number, number]) };
    case 'region':
      return { ...base, regionIds: [linkage.id] };
  }
}

/**
 * Expands the draft into stored linkages. Multi-select character / region
 * lists produce one entry per object (spec: "保存时按角色 ID 逐条存储").
 * Returns an empty array when the draft has no selectable object.
 */
export function buildLinkages(draft: LinkageDraft): ParticipantTarget[] {
  const effect = 'highlight' as const;
  switch (draft.type) {
    case 'character':
      return draft.characterIds.map((id) => ({ type: 'character', id, effect, color: draft.color }));
    case 'region':
      return draft.regionIds.map((id) => ({ type: 'region', id, effect, color: draft.color }));
    case 'asset': {
      if (draft.assetId === null) return [];
      const linkage: ParticipantTarget =
        draft.assetScope === 'instances'
          ? {
              type: 'asset',
              id: draft.assetId,
              scope: 'instances',
              instances: draft.assetInstances.map((cell) => [...cell] as [number, number]),
              effect,
              color: draft.color,
            }
          : { type: 'asset', id: draft.assetId, scope: 'all', effect, color: draft.color };
      return [linkage];
    }
    case 'cell': {
      if (draft.cells.length === 0) return [];
      return [
        {
          type: 'cell',
          cells: draft.cells.map((cell) => [...cell] as [number, number]),
          effect,
          color: draft.color,
        },
      ];
    }
  }
}

/** True when the draft can produce at least one stored linkage. */
export function isLinkageDraftValid(draft: LinkageDraft): boolean {
  return buildLinkages(draft).length > 0;
}

interface LinkageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linkage being edited; `null` opens the dialog in add mode. */
  linkage: ParticipantTarget | null;
  characters: LinkageCharacterOption[];
  items: LinkageAssetOption[];
  regions: DraftRegion[];
  gridSize: number;
  /** FEAT-D04: the palette the swatches come from (map-level, extensible). */
  linkageColors: MapLinkageColor[];
  onSubmit: (linkages: ParticipantTarget[]) => void;
}

/** Cell size (px) of the embedded matrix picker. */
const PICKER_CELL = 22;

export function LinkageDialog({
  open,
  onOpenChange,
  linkage,
  characters,
  items,
  regions,
  gridSize,
  linkageColors,
  onSubmit,
}: LinkageDialogProps): JSX.Element {
  const [draft, setDraft] = useState<LinkageDraft>(() => draftFromLinkage(linkage));
  const [quickMode, setQuickMode] = useState<QuickMode>(null);
  const [rectAnchor, setRectAnchor] = useState<[number, number] | null>(null);

  // Re-seed whenever the dialog (re)opens — add mode starts empty, edit
  // mode refills from the linkage.
  useEffect(() => {
    if (!open) return;
    const seed = draftFromLinkage(linkage);
    // FEAT-D04: fall back to the first palette key when the stored colour is
    // not (or no longer) part of this map's palette.
    const usable = linkageColors.some((entry) => entry.key === seed.color)
      ? seed.color
      : (linkageColors[0]?.key ?? seed.color);
    setDraft({ ...seed, color: usable });
    setQuickMode(null);
    setRectAnchor(null);
  }, [open, linkage, linkageColors]);

  const cellSelection = useMemo<CellSelection>(
    () => new Set(draft.cells.map(([x, y]) => cellKey(x, y))),
    [draft.cells],
  );

  const patch = (values: Partial<LinkageDraft>): void =>
    setDraft((previous) => ({ ...previous, ...values }));

  const toggleCharacter = (id: number): void =>
    setDraft((previous) => ({
      ...previous,
      characterIds: previous.characterIds.includes(id)
        ? previous.characterIds.filter((value) => value !== id)
        : [...previous.characterIds, id],
    }));

  const toggleRegion = (id: string): void =>
    setDraft((previous) => ({
      ...previous,
      regionIds: previous.regionIds.includes(id)
        ? previous.regionIds.filter((value) => value !== id)
        : [...previous.regionIds, id],
    }));

  const toggleInstance = (coord: [number, number]): void =>
    setDraft((previous) => {
      const key = cellKey(coord[0], coord[1]);
      const has = previous.assetInstances.some(([x, y]) => cellKey(x, y) === key);
      return {
        ...previous,
        assetInstances: has
          ? previous.assetInstances.filter(([x, y]) => cellKey(x, y) !== key)
          : [...previous.assetInstances, [...coord] as [number, number]],
      };
    });

  /** Matrix click — honours the active quick-select mode. */
  const onMatrixClick = (x: number, y: number): void => {
    if (quickMode === 'row') {
      patch({ cells: selectionToCoords(selectRow(cellSelection, y, gridSize)) });
      return;
    }
    if (quickMode === 'column') {
      patch({ cells: selectionToCoords(selectColumn(cellSelection, x, gridSize)) });
      return;
    }
    if (quickMode === 'rect') {
      const result = applyRectClick(cellSelection, rectAnchor, [x, y]);
      setRectAnchor(result.anchor);
      patch({ cells: selectionToCoords(result.selection) });
      return;
    }
    patch({ cells: selectionToCoords(toggleCell(cellSelection, x, y)) });
  };

  const selectedAsset = items.find((item) => item.assetId === draft.assetId) ?? null;
  const valid = isLinkageDraftValid(draft);

  const submit = (): void => {
    if (!valid) return;
    onSubmit(buildLinkages(draft));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{linkage ? '编辑联动' : '添加联动'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Object type */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">对象类型</span>
            <div className="flex flex-wrap gap-1">
              {PARTICIPANT_TARGET_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={draft.type === type ? 'secondary' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => {
                    patch({ type });
                    setQuickMode(null);
                    setRectAnchor(null);
                  }}
                >
                  {TARGET_TYPE_LABELS[type]}
                </Button>
              ))}
            </div>
          </div>

          {/* Object selection */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">具体对象选择</span>

            {draft.type === 'character' ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {characters.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    暂无可联动的角色
                  </p>
                ) : (
                  characters.map((character) => (
                    <label
                      key={character.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={draft.characterIds.includes(character.id)}
                        onChange={() => toggleCharacter(character.id)}
                      />
                      <span className="truncate">
                        #{character.id} {character.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            ) : null}

            {draft.type === 'asset' ? (
              <div className="space-y-2">
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {items.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      地图中暂无物品
                    </p>
                  ) : (
                    items.map((item) => (
                      <label
                        key={item.assetId}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={draft.assetId === item.assetId}
                          onChange={() =>
                            patch({
                              assetId: draft.assetId === item.assetId ? null : item.assetId,
                              assetScope: 'all',
                              assetInstances: [],
                            })
                          }
                        />
                        {/* FIX-N12 §6.5: 名称（业务 ID）— no `#数字 id`. */}
                        <span className="truncate" title={item.code || undefined}>
                          {item.name}
                          {item.code ? `（${item.code}）` : ''} × {item.instances.length}
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedAsset && selectedAsset.instances.length > 1 ? (
                  <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={draft.assetScope === 'all' ? 'secondary' : 'ghost'}
                        className="h-6 text-xs"
                        onClick={() => patch({ assetScope: 'all' })}
                      >
                        全部实例
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={draft.assetScope === 'instances' ? 'secondary' : 'ghost'}
                        className="h-6 text-xs"
                        onClick={() => patch({ assetScope: 'instances' })}
                      >
                        指定实例（{draft.assetInstances.length}）
                      </Button>
                    </div>
                    {draft.assetScope === 'instances' ? (
                      <div className="grid grid-cols-4 gap-1">
                        {selectedAsset.instances.map(([x, y]) => {
                          const key = cellKey(x, y);
                          const checked = draft.assetInstances.some(
                            ([ix, iy]) => cellKey(ix, iy) === key,
                          );
                          return (
                            <label
                              key={key}
                              className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[11px] hover:bg-accent"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleInstance([x, y])}
                              />
                              <span className="font-mono">
                                {x + 1},{y + 1}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.type === 'region' ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {regions.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    地图中暂无区域
                  </p>
                ) : (
                  regions.map((region) => (
                    <label
                      key={region.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        checked={draft.regionIds.includes(region.id)}
                        onChange={() => toggleRegion(region.id)}
                      />
                      <span className="truncate">{region.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}

            {draft.type === 'cell' ? (
              <div className="space-y-2">
                {/* Quick selection */}
                <div className="flex flex-wrap items-center gap-1">
                  {(Object.keys(QUICK_LABELS) as Array<Exclude<QuickMode, null>>).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant={quickMode === mode ? 'secondary' : 'outline'}
                      className="h-6 text-xs"
                      onClick={() => {
                        setQuickMode(quickMode === mode ? null : mode);
                        setRectAnchor(null);
                      }}
                    >
                      {QUICK_LABELS[mode]}
                    </Button>
                  ))}
                  <span className="ml-auto text-xs text-muted-foreground">
                    已选 {draft.cells.length} 格
                    {quickMode === 'rect' && rectAnchor
                      ? `（起点 ${rectAnchor[0] + 1},${rectAnchor[1] + 1}）`
                      : ''}
                  </span>
                </div>

                {/* Matrix */}
                <div className="flex justify-center">
                  <div
                    className="grid gap-px"
                    style={{
                      gridTemplateColumns: `repeat(${gridSize}, ${PICKER_CELL}px)`,
                    }}
                  >
                    {Array.from({ length: gridSize * gridSize }, (_, index) => {
                      const x = index % gridSize;
                      const y = Math.floor(index / gridSize);
                      const key = cellKey(x, y);
                      const selected = cellSelection.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          title={`${x + 1},${y + 1}`}
                          aria-label={`方格 ${x + 1},${y + 1}`}
                          onClick={() => onMatrixClick(x, y)}
                          className={
                            'border transition-colors ' +
                            (selected
                              ? 'border-primary bg-primary/70'
                              : 'border-border bg-background hover:bg-accent')
                          }
                          style={{ width: PICKER_CELL, height: PICKER_CELL }}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => {
                      patch({ cells: [] });
                      setRectAnchor(null);
                    }}
                  >
                    清空
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => patch({ cells: selectionToCoords(selectAllCells(gridSize)) })}
                  >
                    全选
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() =>
                      patch({
                        cells: selectionToCoords(
                          selectRectangle(cellSelection, [0, 0], [gridSize - 1, gridSize - 1]),
                        ),
                      })
                    }
                  >
                    全幅矩形
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Colour — OPT-H07 §7.2 (docs/v0.4.2.md §7): the effect is always
              「高亮」 and carried no information, so only the colour is left. */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">颜色</span>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {linkageColors.map((entry) => (
                <label key={entry.key} className="flex cursor-pointer items-center gap-1">
                  <input
                    type="radio"
                    name="linkage-color"
                    value={entry.key}
                    checked={draft.color === entry.key}
                    onChange={() => patch({ color: entry.key })}
                  />
                  <span
                    className="h-3 w-3 rounded-full border"
                    style={{
                      // FEAT-D04: the swatch mirrors the rendered colour.
                      backgroundColor: entry.color,
                    }}
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={!valid} onClick={submit}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
