import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ITEM_OFFSET_MAX,
  ITEM_OFFSET_MIN,
  ITEM_OFFSET_STEP,
  ITEM_SCALE_MAX,
  ITEM_SCALE_MIN,
  ITEM_SCALE_STEP,
  UI_Z,
  REGION_ID_MAX_LENGTH,
  REGION_ID_PATTERN,
  isIdentityItemTransform,
  resolveAssetVariant,
  resolveItemTransform,
} from '@loredoku/shared';
import type {
  DraftAnchorItem,
  DraftCell,
  DraftRegion,
  Asset,
  ItemTransformOverride,
  MapStyle,
  RegionStyle,
} from '@loredoku/shared';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RegionStyleEditor } from '@/components/map-editor/RegionStyleEditor';
import { NumberField, Row } from '@/components/map-editor/StyleFields';
import { findItemAnchor } from '@/lib/erase';
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
  /** 地图级样式块：区域分支编辑的是**解析后**的值，这里是每个字段的回退默认（docs/v0.7.0.md §5）。 */
  style: MapStyle;
  onClearCell: (x: number, y: number) => void;
  onClearItem: (x: number, y: number) => void;
  /** v0.7.5 (docs/v0.7.5.md §5): 改物品展示变换；`x, y` 传当前格，store 自己解析到脚位锚点。缺省 = 只读，控件不渲染。 */
  onItemTransform?: (x: number, y: number, patch: ItemTransformOverride) => void;
  /** Saves the region's name / id / style. The store derives the minimal override. */
  onSubmitRegion: (regionId: string, input: RegionInput) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  /** Reports the region branch's dirty flag so the page can guard a leave. */
  onRegionDirtyChange?: (dirty: boolean) => void;
  /** 这块区域的格子正在画布上编辑；只决定「编辑格子」按钮的字样与可点性，会话本身归页面与画布。 */
  cellEditActive?: boolean;
  /** 点「编辑格子」。缺省 = 不提供入口（谜题编辑器的只读画布）。 */
  onStartCellEdit?: (regionId: string) => void;
  /** SPEC-K06 (docs/v0.5.0.md §4.3): 谜题编辑器用同一抽屉配**只读**画布，所有操作按钮（清空本格 / 清空物品层 / 保存 / 删除）必须消失。 */
  readOnly?: boolean;
  /** v0.7.4 (docs/v0.7.4.md §4): `split`（默认）占据编辑区右侧、画布跟着收窄；`overlay` 浮在画布上（谜题编辑器用）。 */
  layout?: 'split' | 'overlay';
}

/**
 * v0.7.0 (docs/v0.7.0.md §5): 区域分支**就是**编辑器本身（旧「编辑」对话框并成三组样式）。每个控件改的是从**解析后**样式种下的本地草稿，保存只留与地图默认不同的字段。
 */
function RegionEditBranch({
  region,
  regions,
  style,
  cellEditActive = false,
  onStartCellEdit,
  onSubmitRegion,
  onDeleteRegion,
  onDirtyChange,
}: {
  region: DraftRegion;
  regions: DraftRegion[];
  style: MapStyle;
  /** 这块区域的格子编辑会话正在进行。 */
  cellEditActive?: boolean;
  onStartCellEdit?: (regionId: string) => void;
  onSubmitRegion: (regionId: string, input: RegionInput) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onDirtyChange?: (dirty: boolean) => void;
}): JSX.Element {
  const resolved = useMemo(() => resolveRegionStyle(style, region.style), [style, region.style]);
  const [name, setName] = useState(region.name);
  const [regionId, setRegionId] = useState(region.id);
  const [draft, setDraft] = useState<RegionStyle>(resolved);
  const [error, setError] = useState<string | null>(null);

  /**
   * 只有「这个分支展示的内容」变了才重置草稿（换区域、改名、已提交样式变）；纯**格子**编辑不重置，否则 Shift+点击加格会丢掉正在输的样式。
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
        <span className="ml-auto shrink-0 rounded-full border bg-background px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
          包含 {region.cells.length} 格
        </span>
        {/* 改格子入口做成按钮：点进去就是草稿会话（画布蓝加红减、工具条保存）；「Shift+点击」界面上没有，作者找不到，所以摆在标题行。 */}
        <Button
          size="sm"
          variant="outline"
          className="h-6 shrink-0 px-2 text-2xs"
          disabled={cellEditActive}
          onClick={() => onStartCellEdit?.(region.id)}
        >
          {cellEditActive ? '编辑中…' : '编辑格子'}
        </Button>
      </div>

      {cellEditActive ? (
        <p
          className="rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5 text-2xs text-muted-foreground"
          data-testid="region-cell-edit-hint"
        >
          在画布上点按或拖动：点空格加入，点已选格移除。改完在上方工具条点「保存格子」。
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="region-info-name" className="text-2xs font-normal text-muted-foreground">
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
        <Label htmlFor="region-info-id" className="text-2xs font-normal text-muted-foreground">
          区域 ID
        </Label>
        <Input
          id="region-info-id"
          value={regionId}
          maxLength={REGION_ID_MAX_LENGTH}
          onChange={(event) => setRegionId(event.target.value)}
          className="h-7 font-mono text-xs"
        />
        <span className="text-2xs text-muted-foreground">仅字母、数字与下划线</span>
      </div>

      <RegionStyleEditor
        idPrefix="region-info"
        value={draft}
        onChange={(next) => setDraft(next)}
        /* 位置偏移只在这一屏出现 —— 它属于这块区域自己的标签。 */
        showOffset
      />

      {error ? <p className="text-2xs text-destructive">{error}</p> : null}

      <div className="flex gap-1">
        <Button
          size="sm"
          variant="default"
          className="h-7 flex-1 text-2xs"
          disabled={!dirty}
          onClick={save}
        >
          保存
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-2xs text-destructive hover:text-destructive"
          onClick={() => onDeleteRegion(region)}
        >
          删除
        </Button>
      </div>
    </section>
  );
}

/** SPEC-K06: 谜题画布只读，区域分支只给**解析后**样式的摘要（区域没覆盖的字段由地图默认顶上）。 */
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
          <span className="ml-auto shrink-0 rounded-full border bg-background px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
            包含 {region.cells.length} 格
          </span>
        </div>
        <dl className="mt-1.5 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
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
  item,
  region,
  style,
  assetsById,
  onClearCell,
  onClearItem,
  onItemTransform,
  readOnly = false,
}: {
  selection: Extract<Selection, { type: 'cell' }>;
  cell: DraftCell | undefined;
  /** 覆盖本格的物品锚点 —— 可能是本格自己，也可能是它所在多格物品的脚位。 */
  item: DraftAnchorItem | undefined;
  region: DraftRegion | undefined;
  style: MapStyle;
  assetsById: Map<number, Asset>;
  onClearCell: (x: number, y: number) => void;
  onClearItem: (x: number, y: number) => void;
  onItemTransform?: (x: number, y: number, patch: ItemTransformOverride) => void;
  readOnly?: boolean;
}): JSX.Element {
  const backgroundAsset =
    cell?.background?.assetId !== undefined ? assetsById.get(cell.background.assetId) : undefined;
  const itemAsset = item?.assetId !== undefined ? assetsById.get(item.assetId) : undefined;
  // Both layers show the variant the cell was painted with; a missing or
  // dangling `variantId` falls back to the asset's first variant.
  const backgroundLook = backgroundAsset
    ? resolveAssetVariant(backgroundAsset, cell?.background?.variantId)
    : undefined;
  const itemLook = itemAsset ? resolveAssetVariant(itemAsset, item?.variantId) : undefined;
  const transform = resolveItemTransform(item);
  const identity = isIdentityItemTransform(transform);

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
              {backgroundLook && backgroundAsset.variants.length > 1 ? (
                <span className="text-muted-foreground"> · {backgroundLook.name}</span>
              ) : null}
            </span>
            <span className="ml-auto font-mono text-2xs text-muted-foreground">
              #{backgroundAsset.id}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">空</p>
        )}
      </section>

      <section className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">物品层</h3>
          {/* A way back to "as placed" that does not require typing 100 and two zeroes. */}
          {item && !readOnly && onItemTransform && !identity ? (
            <button
              type="button"
              className="text-2xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() =>
                onItemTransform(selection.x, selection.y, { scale: 1, offsetX: 0, offsetY: 0 })
              }
            >
              复位
            </button>
          ) : null}
        </div>
        {itemAsset ? (
          <div className="flex items-center gap-2">
            {itemLook ? (
              <AssetThumbnail appearance={itemLook} name={itemAsset.name} className="h-8 w-8" />
            ) : null}
            <span className="truncate text-sm">
              {itemAsset.name}
              {itemLook && itemAsset.variants.length > 1 ? (
                <span className="text-muted-foreground"> · {itemLook.name}</span>
              ) : null}
            </span>
            <span className="ml-auto text-2xs text-muted-foreground">
              {item?.w}×{item?.h}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">空</p>
        )}

        {/* v0.7.5 (docs/v0.7.5.md §6): 展示变换 —— 只改画出来的大小 / 位置，占格不变。 */}
        {item ? (
          readOnly ? (
            identity ? null : (
              <p className="text-2xs text-muted-foreground">
                展示 {Math.round(transform.scale * 100)}% · 偏移 ({transform.offsetX},{' '}
                {transform.offsetY}) 格
              </p>
            )
          ) : onItemTransform ? (
            <div className="space-y-1 pt-1">
              <Row
                label="大小"
                hint="Item Scale — 等比例放大 / 缩小这张图，围绕脚位中心缩放。只影响展示，占格与擦除范围仍是 w×h。"
              >
                <NumberField
                  id="cell-item-scale"
                  value={Math.round(transform.scale * 100)}
                  min={Math.round(ITEM_SCALE_MIN * 100)}
                  max={Math.round(ITEM_SCALE_MAX * 100)}
                  step={Math.round(ITEM_SCALE_STEP * 100)}
                  suffix="%"
                  commit={(value) =>
                    onItemTransform(selection.x, selection.y, { scale: value / 100 })
                  }
                />
              </Row>
              <Row
                label="偏移"
                hint="Item Offset — 以格为单位，可正可负（负数向左 / 上）。超出脚位的部分照常画出来，不会裁掉。"
              >
                <div className="flex items-center gap-1">
                  <NumberField
                    id="cell-item-offset-x"
                    value={transform.offsetX}
                    min={ITEM_OFFSET_MIN}
                    max={ITEM_OFFSET_MAX}
                    step={ITEM_OFFSET_STEP}
                    suffix="X 格"
                    commit={(value) =>
                      onItemTransform(selection.x, selection.y, { offsetX: value })
                    }
                  />
                  <NumberField
                    id="cell-item-offset-y"
                    value={transform.offsetY}
                    min={ITEM_OFFSET_MIN}
                    max={ITEM_OFFSET_MAX}
                    step={ITEM_OFFSET_STEP}
                    suffix="Y 格"
                    commit={(value) =>
                      onItemTransform(selection.x, selection.y, { offsetY: value })
                    }
                  />
                </div>
              </Row>
            </div>
          ) : null
        ) : null}
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
              className="h-7 flex-1 text-2xs"
              onClick={() => onClearCell(selection.x, selection.y)}
            >
              清空本格
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-2xs"
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

/** SPEC-K06 (docs/v0.5.0.md §4.3): 抽屉只展示格子 / 区域详情，空态是一行引导。 */
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
  onItemTransform,
  onSubmitRegion,
  onDeleteRegion,
  onRegionDirtyChange,
  cellEditActive = false,
  onStartCellEdit,
  readOnly = false,
  layout = 'split',
}: EditorInfoDrawerProps): JSX.Element {
  const cell =
    selection?.type === 'cell' ? cells.get(`${selection.x},${selection.y}`) : undefined;
  const region =
    selection?.type === 'region'
      ? regions.find((item) => item.id === selection.regionId)
      : selection?.type === 'cell'
        ? regionAt(regions, selection.x, selection.y)
        : undefined;

  /** The 8px strip that re-opens a collapsed drawer. */
  const reopenTab = (
    <button
      type="button"
      onClick={onOpen}
      className="absolute right-0 top-1/2 flex h-16 w-2 -translate-y-1/2 items-center justify-center rounded-l-full border border-r-0 bg-background shadow hover:bg-accent"
      style={{ zIndex: UI_Z.infoDrawer }}
      title="展开信息抽屉"
    />
  );

  const body = (
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
            item={findItemAnchor(cells, selection.x, selection.y)?.item}
            region={region}
            style={style}
            assetsById={assetsById}
            onClearCell={onClearCell}
            onClearItem={onClearItem}
            onItemTransform={onItemTransform}
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
              cellEditActive={cellEditActive}
              onStartCellEdit={onStartCellEdit}
              onSubmitRegion={onSubmitRegion}
              onDeleteRegion={onDeleteRegion}
              onDirtyChange={onRegionDirtyChange}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">区域不存在或已删除</p>
        )}
      </div>
    </div>
  );

  /** `overlay` —— v0.7.0 的行为，原样留给谜题编辑器：面板常挂载，在画布上滑入滑出。 */
  if (layout === 'overlay') {
    return (
      <>
        {!open ? reopenTab : null}
        <aside
          className={
            'absolute inset-y-0 right-0 w-80 max-w-[85vw] border-l bg-background/95 shadow-lifted backdrop-blur transition-transform duration-slow ' +
            (open ? 'pointer-events-auto translate-x-0' : 'pointer-events-none translate-x-full')
          }
          // FIX-N11 (docs/v0.5.3.md §6.4): above the ruler strips, below the
          // participant drawer.
          style={{ zIndex: UI_Z.infoDrawer }}
          aria-hidden={!open}
        >
          {body}
        </aside>
      </>
    );
  }

  /**
   * `split` (v0.7.4) —— 编辑行里的真 flex 子项：展开时从画布拿走 320px 而不是盖住它，画布自己的 ResizeObserver 重排棋盘。
   */
  return (
    <>
      {!open ? reopenTab : null}
      {open ? (
        <aside
          className="relative flex h-full w-80 max-w-[50vw] shrink-0 flex-col border-l bg-background"
          style={{ zIndex: UI_Z.infoDrawer }}
        >
          {body}
        </aside>
      ) : null}
    </>
  );
}
