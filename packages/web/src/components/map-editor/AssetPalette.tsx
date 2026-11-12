import { useMemo, useState } from 'react';
import type { Asset, AssetVariant, EditorLayer } from '@loredoku/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { RefreshButton } from '@/components/common/RefreshButton';
import { SearchInput } from '@/components/common/SearchInput';
import { cn } from '@/lib/utils';

interface AssetPaletteProps {
  assets: Asset[] | undefined;
  isLoading: boolean;
  isError: boolean;
  activeLayer: EditorLayer;
  selectedAssetId: number | null;
  selectedVariantId: number | null;
  onSelect: (asset: Asset | null, variant: AssetVariant | null) => void;
  /** True while the asset query is fetching; spins the refresh icon. */
  refreshing?: boolean;
  /**
   * v0.7.7: 搜索框右侧的刷新。**可选** —— 不传就不渲染按钮，调色板仍能单独用
   * （它不认识 react-query，取数方式由调用方决定）。
   */
  onRefresh?: () => void;
}

/** One tile = one thing you can place: a variant of the active layer's asset type. */
interface Tile {
  key: string;
  asset: Asset;
  variant: AssetVariant;
  variantId: number;
  multi: boolean;
}

/**
 * v0.6.1 (docs/v0.6.1.md §8.5): the tiles are **variants**, not assets — you place
 * 「宝箱·打开」, not 「宝箱」. Both layers work the same way: a background asset
 * may own several variants too, and the tile says which look you are about to
 * paint.
 *
 * v0.7.6: the second line lost its footprint (a variant does not declare one):
 * several variants → the variant name, a single variant → 「1 格」.
 */
function buildTiles(assets: Asset[], layer: EditorLayer): Tile[] {
  const tiles: Tile[] = [];
  for (const asset of assets) {
    if (asset.type !== layer) continue;
    const multi = asset.variants.length > 1;
    for (const variant of asset.variants) {
      tiles.push({ key: `a${asset.id}f${variant.id}`, asset, variant, variantId: variant.id, multi });
    }
  }
  return tiles;
}

export function AssetPalette({
  assets,
  isLoading,
  isError,
  activeLayer,
  selectedAssetId,
  selectedVariantId,
  onSelect,
  refreshing = false,
  onRefresh,
}: AssetPaletteProps): JSX.Element {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const tiles = buildTiles(assets ?? [], activeLayer);
    const query = keyword.trim().toLowerCase();
    if (!query) return tiles;
    // A variant's own name is searchable too — 「打开」 should find the open chest
    // even when the asset is called something else entirely.
    return tiles.filter(
      (tile) =>
        tile.asset.name.toLowerCase().includes(query) ||
        tile.asset.code.toLowerCase().includes(query) ||
        tile.variant.name.toLowerCase().includes(query),
    );
  }, [assets, activeLayer, keyword]);

  const isSelected = (tile: Tile): boolean =>
    tile.asset.id === selectedAssetId && tile.variantId === selectedVariantId;

  return (
    <div className="flex h-full flex-col gap-2">
      {/* v0.7.7: 刷新紧跟在搜索框右侧 —— 两者都是「对整份列表」的动作，同一行。 */}
      <div className="flex shrink-0 items-center gap-2">
        <SearchInput
          className="flex-1"
          size="sm"
          value={keyword}
          onValueChange={setKeyword}
          placeholder="搜索资源"
        />
        {onRefresh ? (
          <RefreshButton label="刷新资源" refreshing={refreshing} onRefresh={onRefresh} />
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-sm text-muted-foreground">资源加载失败</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {keyword
              ? '没有匹配的资源'
              : activeLayer === 'background'
                ? '暂无背景资源'
                : '暂无物品资源'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((tile) => {
              const selected = isSelected(tile);
              return (
                <button
                  key={tile.key}
                  type="button"
                  title={`${tile.asset.name} · ${tile.variant.name}`}
                  onClick={() => onSelect(selected ? null : tile.asset, selected ? null : tile.variant)}
                  className={cn(
                    'group flex cursor-pointer flex-col items-center gap-1 rounded-md border p-1 text-center',
                    selected
                      ? 'border-primary bg-accent'
                      : 'hover:border-primary hover:shadow-paper',
                  )}
                >
                  <AssetThumbnail
                    appearance={tile.variant}
                    name={tile.asset.name}
                    className="h-12 w-12"
                  />
                  <span className="w-full truncate text-2xs leading-tight text-muted-foreground group-hover:text-foreground">
                    {tile.asset.name}
                  </span>
                  <span className="w-full truncate text-2xs leading-tight text-muted-foreground/80">
                    {tile.multi ? tile.variant.name : '1 格'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAssetId !== null ? (
        <p className="shrink-0 rounded-md bg-secondary px-2 py-1 text-2xs text-secondary-foreground">
          已选中资源，点击画布放置；再次点击可取消。
        </p>
      ) : null}
    </div>
  );
}
