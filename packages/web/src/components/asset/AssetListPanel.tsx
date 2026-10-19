import { ASSET_TYPE_LABELS, LIST_ROW_HEIGHT, type Asset } from '@loredoku/shared';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { VirtualList } from '@/components/ui/virtual-list';
import { cn } from '@/lib/utils';

interface AssetListPanelProps {
  assets: Asset[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * v0.5.2 FEAT-M01 (docs/v0.5.2.md §1.3): windowed — only the rows inside the
 * viewport are mounted, so a 1000-asset list no longer fires 1000 thumbnail
 * requests on first paint.
 *
 * v0.5.2 FEAT-M04 (§4): 「阻挡」 is an item-only trait, so the size line
 * only mentions it for `type = 'item'`.
 */
export function AssetListPanel({ assets, selectedId, onSelect }: AssetListPanelProps): JSX.Element {
  return (
    // FIX-O09 (docs/v0.5.4.md §5.2): `overflow-hidden` clips the scrollbar and
    // the row highlights to the frame's rounded corners — the viewport itself
    // is a plain square scroller and used to poke past them.
    <div className="overflow-hidden rounded-lg border">
      <VirtualList
        count={assets.length}
        rowHeight={LIST_ROW_HEIGHT}
        className="divide-y"
        renderRow={(index) => {
          const asset = assets[index];
          if (!asset) return null;
          return (
            <button
              type="button"
              onClick={() => onSelect(asset.id)}
              className={cn(
                'flex h-full w-full items-center gap-3 px-3 text-left transition-colors hover:bg-accent',
                selectedId === asset.id && 'bg-accent',
              )}
            >
              <AssetThumbnail asset={asset} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{asset.name}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                    {ASSET_TYPE_LABELS[asset.type]}
                  </span>
                  {!asset.isActive ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {asset.imageUrl ? '已停用' : '未启用'}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {asset.code} · {asset.widthCells}×{asset.heightCells}
                  {asset.type === 'item' && asset.blocking ? ' · 阻挡' : ''}
                </div>
              </div>
            </button>
          );
        }}
      />
    </div>
  );
}
