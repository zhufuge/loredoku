import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { EditorLayer, Item } from '@murdoku/shared';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemThumbnail } from '@/components/item/ItemThumbnail';
import { cn } from '@/lib/utils';

interface ItemPaletteProps {
  items: Item[] | undefined;
  isLoading: boolean;
  isError: boolean;
  activeLayer: EditorLayer;
  selectedItemId: number | null;
  onSelect: (item: Item | null) => void;
}

export function ItemPalette({
  items,
  isLoading,
  isError,
  activeLayer,
  selectedItemId,
  onSelect,
}: ItemPaletteProps): JSX.Element {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const list = (items ?? []).filter((item) => item.category === activeLayer);
    const query = keyword.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query),
    );
  }, [items, activeLayer, keyword]);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索物品"
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
          <p className="py-6 text-center text-sm text-muted-foreground">物品加载失败</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {keyword
              ? '没有匹配的物品'
              : activeLayer === 'background'
                ? '暂无背景物品'
                : '暂无物体物品'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                title={`${item.name} · ${item.widthCells}×${item.heightCells}`}
                onClick={() => onSelect(item.id === selectedItemId ? null : item)}
                className={cn(
                  'group flex cursor-pointer flex-col items-center gap-1 rounded-md border p-1 text-center',
                  item.id === selectedItemId
                    ? 'border-primary bg-accent'
                    : 'hover:border-primary hover:shadow-sm',
                )}
              >
                <ItemThumbnail item={item} className="h-12 w-12" />
                <span className="w-full truncate text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedItemId !== null ? (
        <p className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[11px] text-secondary-foreground">
          已选中物品，点击画布放置；再次点击可取消。
        </p>
      ) : null}
    </div>
  );
}
