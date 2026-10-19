import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Asset, EditorLayer } from '@loredoku/shared';
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
  onSelect: (asset: Asset | null) => void;
}

export function AssetPalette({
  assets,
  isLoading,
  isError,
  activeLayer,
  selectedAssetId,
  onSelect,
}: AssetPaletteProps): JSX.Element {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const list = (assets ?? []).filter((asset) => asset.type === activeLayer);
    const query = keyword.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (asset) =>
        asset.name.toLowerCase().includes(query) || asset.code.toLowerCase().includes(query),
    );
  }, [assets, activeLayer, keyword]);

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
            {filtered.map((asset) => (
              <button
                key={asset.id}
                type="button"
                title={`${asset.name} · ${asset.widthCells}×${asset.heightCells}`}
                onClick={() => onSelect(asset.id === selectedAssetId ? null : asset)}
                className={cn(
                  'group flex cursor-pointer flex-col items-center gap-1 rounded-md border p-1 text-center',
                  asset.id === selectedAssetId
                    ? 'border-primary bg-accent'
                    : 'hover:border-primary hover:shadow-sm',
                )}
              >
                <AssetThumbnail asset={asset} className="h-12 w-12" />
                <span className="w-full truncate text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                  {asset.name}
                </span>
              </button>
            ))}
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
