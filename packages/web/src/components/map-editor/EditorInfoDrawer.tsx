import { useEffect, useMemo, useRef, useState } from 'react';
import { UI_Z, REGION_ID_MAX_LENGTH, REGION_ID_PATTERN, resolveAssetForm } from '@loredoku/shared';
import type { DraftCell, DraftRegion, Asset, MapStyle, RegionStyle } from '@loredoku/shared';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RegionStyleEditor } from '@/components/map-editor/RegionStyleEditor';
import { regionAt } from '@/lib/region';
import { resolveRegionStyle, regionStyleEquals } from '@/lib/regionStyle';
import type { RegionInput, Selection } from '@/stores/editorStore';

interface EditorInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  selection: Selection | null;
  cells: Map<string, DraftCell>;
  regions: DraftRegion[];
  assetsById: Map<number, Asset>;
  /**
   * v0.7.0: the map-level style block. The region branch edits **resolved**
   * values, and this is the default every field falls back to (docs/v0.7.0.md §5).
   */
  style: MapStyle;
  onClearCell: (x: number, y: number) => void;
  onClearItem: (x: number, y: number) => void;
  /** Saves the region's name / id / style. The store derives the minimal override. */
  onSubmitRegion: (regionId: string, input: RegionInput) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
  /** Reports the region branch's dirty flag so the page can guard a leave. */
  onRegionDirtyChange?: (dirty: boolean) => void;
  /**
   * v0.5.0 SPEC-K06 (docs/v0.5.0.md §4.3): the puzzle editor renders this same
   * drawer against its **read-only** canvas, so every action button
   * (清空本格 / 清空物品层 / 保存 / 定位 / 删除) must disappear. Default `false`
   * keeps the map editor's behaviour untouched.
   */
  readOnly?: boolean;
}

/**
 * v0.7.0 (docs/v0.7.0.md §5): the region branch **is** the editor now.
 *
 * The old 「编辑」dialog (颜色 / 边界线宽 / 填充透明度) moved here and became the
 * three style groups; the left panel's pencil button is gone, so clicking a
 * region in the list and clicking its label on the canvas open the same box.
 *
 * Every control edits a local draft seeded from the **resolved** style — the
 * region's own override merged over the map-level defaults — and 保存 hands the
 * resolved values to the store, which keeps only the fields that differ from the
 * map default (`regionStyleOverride`). A region that agrees everywhere therefore
 * carries no `style` key at all.
 */
function RegionEditBranch({
  region,
  regions,
  style,
  onSubmitRegion,
  onDeleteRegion,
  onLocateRegion,
  onDirtyChange,
}: {
  region: DraftRegion;
  regions: DraftRegion[];
  style: MapStyle;
  onSubmitRegion: (regionId: string, input: RegionInput) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
  onDirtyChange?: (dirty: boolean) => void;
}): JSX.Element {
  const resolved = useMemo(() => resolveRegionStyle(style, region.style), [style, region.style]);
  const [name, setName] = useState(region.name);
  const [regionId, setRegionId] = useState(region.id);
  const [draft, setDraft] = useState<RegionStyle>(resolved);
  const [error, setError] = useState<string | null>(null);

  /**
   * Re-seed when the committed region changes **what the form shows**: another
   * region, a renamed one, or new committed style values (a save, an undo, a
   * changed map-level default). A pure **cell** edit does not re-seed —
   * shift+clicking more cells into the region must not drop the style the
   * author is in the middle of typing.
   */
  const seedKey = `${region.id}\u0000${region.name}\u0000${JSON.stringify(resolved)}`;
  const seedRef = useRef(seedKey);
  useEffect(() => {
    if (seedRef.current === seedKey) return;
    seedRef.current = seedKey;
    setName(region.name);
    setRegionId(region.id);
    setDraft(resolved);
    setError(null);
  }, [seedKey, region.name, region.id, resolved]);

  const dirty =
    name !== region.name || regionId !== region.id || !regionStyleEquals(draft, resolved);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = (): void => {
    const trimmedName = name.trim();
    const trimmedId = regionId.trim();
    if (!trimmedName) {
      setError('请填写区域名称');
      return;
    }
    if (!trimmedId) {
      setError('请填写区域 ID');
      return;
    }
    if (trimmedId.length > REGION_ID_MAX_LENGTH || !REGION_ID_PATTERN.test(trimmedId)) {
      setError('区域 ID 只能包含字母、数字与下划线');
      return;
    }
    if (regions.some((item) => item.id === trimmedId && item.id !== region.id)) {
      setError('区域 ID 已存在，请更换');
      return;
    }
    setError(null);
    onSubmitRegion(region.id, {
      id: trimmedId,
      name: trimmedName,
      cells: region.cells,
      style: draft,
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">区域信息</h3>
        <span className="ml-auto shrink-0 rounded-full border bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          包含 {region.cells.length} 格
        </span>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="region-info-name" className="text-[11px] font-normal text-muted-foreground">
          名称
        </Label>
        <Input
          id="region-info-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          className="h-7 text-xs"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="region-info-id" className="text-[11px] font-normal text-muted-foreground">
          区域 ID
        </Label>
        <Input
          id="region-info-id"
          value={regionId}
          maxLength={REGION_ID_MAX_LENGTH}
          onChange={(event) => setRegionId(event.target.value)}
          className="h-7 font-mono text-xs"
        />
        <span className="text-[10px] text-muted-foreground">仅字母、数字与下划线</span>
      </div>

      <RegionStyleEditor
        idPrefix="region-info"
        value={draft}
        onChange={(next) => setDraft(next)}
      />

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

      <div className="flex gap-1">
        <Button
          size="sm"
          variant="default"
          className="h-7 flex-1 text-[11px]"
          disabled={!dirty}
          onClick={save}
        >
          保存
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-[11px]"
          onClick={() => onLocateRegion(region)}
        >
          定位
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-[11px] text-destructive hover:text-destructive"
          onClick={() => onDeleteRegion(region)}
        >
          删除
        </Button>
      </div>
    </section>
  );
}

/**
 * SPEC-K06: the puzzle canvas is read-only, so the region branch is a summary
 * of the **resolved** style (the map default stands in for anything the region
 * does not override).
 */
function RegionSummary({
  region,
  style,
}: {
  region: DraftRegion;
  style: MapStyle;
}): JSX.Element {
  const resolved = resolveRegionStyle(style, region.style);
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">区域信息</h3>
      <div className="rounded-md border bg-muted/30 px-3 py-2" title={`区域 ID：${region.id}`}>
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full border"
            style={{
              backgroundColor: resolved.outline.color,
              borderColor: resolved.outline.color,
            }}
          />
          <span className="truncate text-sm" title={region.name}>
            {region.name}
          </span>
          <span className="ml-auto shrink-0 rounded-full border bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            包含 {region.cells.length} 格
          </span>
        </div>
        <dl className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <dt>轮廓线宽</dt>
            <dd className="text-foreground">{resolved.outline.width}</dd>
          </div>
          <span aria-hidden="true">·</span>
          <div className="flex items-center gap-1">
            <dt>标签字号</dt>
            <dd className="text-foreground">{resolved.label.fontSize}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function CellBranch({
  selection,
  cell,
  region,
  style,
  assetsById,
  onClearCell,
  onClearItem,
  readOnly = false,
}: {
  selection: Extract<Selection, { type: 'cell' }>;
  cell: DraftCell | undefined;
  region: DraftRegion | undefined;
  style: MapStyle;
  assetsById: Map<number, Asset>;
  onClearCell: (x: number, y: number) => void;
  onClearItem: (x: number, y: number) => void;
  readOnly?: boolean;
}): JSX.Element {
  const backgroundAsset =
    cell?.background?.assetId !== undefined ? assetsById.get(cell.background.assetId) : undefined;
  const itemAsset = cell?.item?.assetId !== undefined ? assetsById.get(cell.item.assetId) : undefined;
  // v0.6.1: both layers show the form the cell was painted with; a missing or
  // dangling `formId` falls back to the asset's first form.
  const backgroundLook = backgroundAsset
    ? resolveAssetForm(backgroundAsset, cell?.background?.formId)
    : undefined;
  const itemLook = itemAsset ? resolveAssetForm(itemAsset, cell?.item?.formId) : undefined;

  return (
    <>
      <div className="rounded-md border bg-muted/40 px-3 py-2">
        <span className="text-xs text-muted-foreground">坐标</span>
        <p className="font-mono text-sm">
          C{selection.x + 1} R{selection.y + 1}
        </p>
      </div>

      <section className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">背景层</h3>
        {backgroundAsset ? (
          <div className="flex items-center gap-2">
            {backgroundLook ? (
              <AssetThumbnail appearance={backgroundLook} name={backgroundAsset.name} className="h-8 w-8" />
            ) : null}
            <span className="truncate text-sm">
              {backgroundAsset.name}
              {backgroundLook && backgroundAsset.forms.length > 1 ? (
                <span className="text-muted-foreground"> · {backgroundLook.name}</span>
              ) : null}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              #{backgroundAsset.id}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">空</p>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">物品层</h3>
        {itemAsset ? (
          <div className="flex items-center gap-2">
            {itemLook ? (
              <AssetThumbnail appearance={itemLook} name={itemAsset.name} className="h-8 w-8" />
            ) : null}
            <span className="truncate text-sm">
              {itemAsset.name}
              {itemLook && itemAsset.forms.length > 1 ? (
                <span className="text-muted-foreground"> · {itemLook.name}</span>
              ) : null}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {cell?.item?.w}×{cell?.item?.h}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">空</p>
        )}
      </section>

      {/* SPEC-K06: a read-only canvas shows the region as context only. */}
      {region && readOnly ? <RegionSummary region={region} style={style} /> : null}

      {/* SPEC-K06: a read-only canvas has nothing to clear. */}
      {readOnly ? null : (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">快捷操作</h3>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              onClick={() => onClearCell(selection.x, selection.y)}
            >
              清空本格
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              onClick={() => onClearItem(selection.x, selection.y)}
            >
              清空物品层
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * SPEC-K06 (docs/v0.5.0.md §4.3): the drawer shows cell / region detail only.
 * v0.5.0 removed the roster from the map (and from this drawer with it), so the
 * old 「未落地角色」prompt and its clear button are gone — the empty state is a
 * single line of guidance.
 */
export function EditorInfoDrawer({
  open,
  onClose,
  onOpen,
  selection,
  cells,
  regions,
  assetsById,
  style,
  onClearCell,
  onClearItem,
  onSubmitRegion,
  onDeleteRegion,
  onLocateRegion,
  onRegionDirtyChange,
  readOnly = false,
}: EditorInfoDrawerProps): JSX.Element {
  const cell =
    selection?.type === 'cell' ? cells.get(`${selection.x},${selection.y}`) : undefined;
  const region =
    selection?.type === 'region'
      ? regions.find((item) => item.id === selection.regionId)
      : selection?.type === 'cell'
        ? regionAt(regions, selection.x, selection.y)
        : undefined;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={onOpen}
          className="absolute right-0 top-1/2 flex h-16 w-2 -translate-y-1/2 items-center justify-center rounded-l-full border border-r-0 bg-background shadow hover:bg-accent"
          style={{ zIndex: UI_Z.infoDrawer }}
          title="展开信息抽屉"
        />
      ) : null}
      <aside
        className={
          'absolute inset-y-0 right-0 w-80 max-w-[85vw] border-l bg-background/95 shadow-xl backdrop-blur transition-transform duration-200 ' +
          (open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full')
        }
        // FIX-N11 (docs/v0.5.3.md §6.4): above the ruler strips, below the
        // participant drawer.
        style={{ zIndex: UI_Z.infoDrawer }}
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">信息</h2>
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
            {!selection ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                在画布上点击格位或区域标签查看详情
              </p>
            ) : selection.type === 'cell' ? (
              <CellBranch
                selection={selection}
                cell={cell}
                region={region}
                style={style}
                assetsById={assetsById}
                onClearCell={onClearCell}
                onClearItem={onClearItem}
                readOnly={readOnly}
              />
            ) : region ? (
              readOnly ? (
                <RegionSummary region={region} style={style} />
              ) : (
                <RegionEditBranch
                  region={region}
                  regions={regions}
                  style={style}
                  onSubmitRegion={onSubmitRegion}
                  onDeleteRegion={onDeleteRegion}
                  onLocateRegion={onLocateRegion}
                  onDirtyChange={onRegionDirtyChange}
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground">区域不存在或已删除</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
