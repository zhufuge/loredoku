import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Asset, AssetForm, EditorLayer } from '@loredoku/shared';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AssetThumbnail } from '@/components/asset/AssetThumbnail';
import { cn } from '@/lib/utils';

interface AssetPaletteProps {
  assets: Asset[] | undefined;
  isLoading: boolean;
  isError: boolean;
  activeLayer: EditorLayer;
  selectedAssetId: number | null;
  selectedFormId: number | null;
  onSelect: (asset: Asset | null, form: AssetForm | null) => void;
}

/** One tile = one thing you can place: a form of the active layer's asset type. */
interface Tile {
  key: string;
  asset: Asset;
  form: AssetForm;
  formId: number;
  multi: boolean;
}

/**
 * v0.6.1 (docs/v0.6.1.md §8.5): the tiles are **forms**, not assets — you place
 * 「宝箱·打开 2×2」, not 「宝箱」. Both layers work the same way: a background
 * asset may own several forms too, and the tile says which look you are about
 * to paint. The footprint line stays honest either way — a background form is
 * pinned at 1×1, so it always reads 1×1.
 */
function buildTiles(assets: Asset[], layer: EditorLayer): Tile[] {
  const tiles: Tile[] = [];
  for (const asset of assets) {
    if (asset.type !== layer) continue;
    const multi = asset.forms.length > 1;
    for (const form of asset.forms) {
      tiles.push({ key: `a${asset.id}f${form.id}`, asset, form, formId: form.id, multi });
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
  selectedFormId,
  onSelect,
}: AssetPaletteProps): JSX.Element {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const tiles = buildTiles(assets ?? [], activeLayer);
    const query = keyword.trim().toLowerCase();
    if (!query) return tiles;
    // A form's own name is searchable too — 「打开」 should find the open chest
    // even when the asset is called something else entirely.
    return tiles.filter(
      (tile) =>
        tile.asset.name.toLowerCase().includes(query) ||
        tile.asset.code.toLowerCase().includes(query) ||
        tile.form.name.toLowerCase().includes(query),
    );
  }, [assets, activeLayer, keyword]);

  const isSelected = (tile: Tile): boolean =>
    tile.asset.id === selectedAssetId && tile.formId === selectedFormId;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索资源"
          className="h-9 pl-9"
        />
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
                  title={`${tile.asset.name} · ${tile.form.name} · ${tile.form.widthCells}×${tile.form.heightCells}`}
                  onClick={() => onSelect(selected ? null : tile.asset, selected ? null : tile.form)}
                  className={cn(
                    'group flex cursor-pointer flex-col items-center gap-1 rounded-md border p-1 text-center',
                    selected
                      ? 'border-primary bg-accent'
                      : 'hover:border-primary hover:shadow-sm',
                  )}
                >
                  <AssetThumbnail
                    appearance={tile.form}
                    name={tile.asset.name}
                    className="h-12 w-12"
                  />
                  <span className="w-full truncate text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                    {tile.asset.name}
                  </span>
                  <span className="w-full truncate text-[10px] leading-tight text-muted-foreground/80">
                    {tile.multi
                      ? `${tile.form.name} · ${tile.form.widthCells}×${tile.form.heightCells}`
                      : `${tile.form.widthCells}×${tile.form.heightCells}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedAssetId !== null ? (
        <p className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[11px] text-secondary-foreground">
          已选中资源，点击画布放置；再次点击可取消。
        </p>
      ) : null}
    </div>
  );
}
