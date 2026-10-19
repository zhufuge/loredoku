import { UI_Z } from '@loredoku/shared';
import type { DraftCell, DraftRegion, Asset } from '@loredoku/shared';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { Button } from '@/components/ui/button';
import { regionAt } from '@/lib/region';
import type { Selection } from '@/stores/editorStore';

interface EditorInfoDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  selection: Selection | null;
  cells: Map<string, DraftCell>;
  regions: DraftRegion[];
  assetsById: Map<number, Asset>;
  onClearCell: (x: number, y: number) => void;
  onClearItem: (x: number, y: number) => void;
  onEditRegion: (region: DraftRegion) => void;
  onDeleteRegion: (region: DraftRegion) => void;
  onLocateRegion: (region: DraftRegion) => void;
  /**
   * v0.5.0 SPEC-K06 (docs/v0.5.0.md §4.3): the puzzle editor renders this same
   * drawer against its **read-only** canvas, so every action button
   * (清空本格 / 清空物品层 / 编辑 / 定位 / 删除) must disappear. Default `false`
   * keeps the map editor's behaviour untouched.
   */
  readOnly?: boolean;
}

// OPT-H10: a single compact bordered block replaces the two-column `dl` —
// the region id moves into the `title` attribute so a uuid can no longer
// squeeze the region name out of the row.
function RegionInfo({ region }: { region: DraftRegion }): JSX.Element {
  const regionId = String(region.id);
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2" title={`区域 ID：${regionId}`}>
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full border"
          style={{ backgroundColor: region.color, borderColor: region.color }}
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
          <dt>边界线宽</dt>
          <dd className="text-foreground">{region.borderWidth}</dd>
        </div>
        <span aria-hidden="true">·</span>
        <div className="flex items-center gap-1">
          <dt>填充</dt>
          <dd className="text-foreground">{Math.round(region.fillOpacity * 100)}%</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * OPT-H10: the region's secondary actions travel as one optional object. The
 * cell branch omits it entirely (the region is read-only context there), the
 * region branch passes it, so the two branches share a single layout.
 */
interface RegionActionHandlers {
  onEdit: (region: DraftRegion) => void;
  onDelete: (region: DraftRegion) => void;
  onLocate: (region: DraftRegion) => void;
}

function RegionActions({
  region,
  actions,
}: {
  region: DraftRegion;
  actions: RegionActionHandlers;
}): JSX.Element {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => actions.onEdit(region)}>
        编辑
      </Button>
      <Button size="sm" variant="outline" className="h-7 flex-1 text-[11px]" onClick={() => actions.onLocate(region)}>
        定位
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 flex-1 text-[11px] text-destructive hover:text-destructive"
        onClick={() => actions.onDelete(region)}
      >
        删除
      </Button>
    </div>
  );
}

function RegionSection({
  region,
  actions,
}: {
  region: DraftRegion | undefined;
  /** Omitted by the cell branch → no 编辑 / 定位 / 删除 buttons. */
  actions?: RegionActionHandlers;
}): JSX.Element {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">区域信息</h3>
      {region ? (
        <>
          <RegionInfo region={region} />
          {actions ? <RegionActions region={region} actions={actions} /> : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">无</p>
      )}
    </section>
  );
}

function CellBranch({
  selection,
  cell,
  region,
  assetsById,
  onClearCell,
  onClearItem,
  readOnly = false,
}: {
  selection: Extract<Selection, { type: 'cell' }>;
  cell: DraftCell | undefined;
  region: DraftRegion | undefined;
  assetsById: Map<number, Asset>;
  onClearCell: (x: number, y: number) => void;
  onClearItem: (x: number, y: number) => void;
  readOnly?: boolean;
}): JSX.Element {
  const backgroundAsset =
    cell?.background?.assetId !== undefined ? assetsById.get(cell.background.assetId) : undefined;
  const itemAsset = cell?.item?.assetId !== undefined ? assetsById.get(cell.item.assetId) : undefined;

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
            <AssetThumbnail asset={backgroundAsset} className="h-8 w-8" />
            <span className="truncate text-sm">{backgroundAsset.name}</span>
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
            <AssetThumbnail asset={itemAsset} className="h-8 w-8" />
            <span className="truncate text-sm">{itemAsset.name}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {cell?.item?.w}×{cell?.item?.h}
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">空</p>
        )}
      </section>

      <RegionSection region={region} />

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
  onClearCell,
  onClearItem,
  onEditRegion,
  onDeleteRegion,
  onLocateRegion,
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
                assetsById={assetsById}
                onClearCell={onClearCell}
                onClearItem={onClearItem}
                readOnly={readOnly}
              />
            ) : (
              <RegionSection
                region={region}
                actions={
                  readOnly
                    ? undefined
                    : {
                        onEdit: onEditRegion,
                        onDelete: onDeleteRegion,
                        onLocate: onLocateRegion,
                      }
                }
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
