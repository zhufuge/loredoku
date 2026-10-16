import { ITEM_CATEGORY_LABELS, LIST_ROW_HEIGHT, type Item } from '@loredoku/shared';
import { ItemThumbnail } from '@/components/item/ItemThumbnail';
import { VirtualList } from '@/components/ui/virtual-list';
import { cn } from '@/lib/utils';

interface ItemListPanelProps {
  items: Item[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * v0.5.2 FEAT-M01 (docs/v0.5.2.md §1.3): windowed — only the rows inside the
 * viewport are mounted, so a 1000-item list no longer fires 1000 thumbnail
 * requests on first paint.
 *
 * v0.5.2 FEAT-M04 (§4): 「可站立」 is an object-only trait, so the size line
 * only mentions it for `category = 'object'`.
 */
export function ItemListPanel({ items, selectedId, onSelect }: ItemListPanelProps): JSX.Element {
  return (
    // FIX-O09 (docs/v0.5.4.md §5.2): `overflow-hidden` clips the scrollbar and
    // the row highlights to the frame's rounded corners — the viewport itself
    // is a plain square scroller and used to poke past them.
    <div className="overflow-hidden rounded-lg border">
      <VirtualList
        count={items.length}
        rowHeight={LIST_ROW_HEIGHT}
        className="divide-y"
        renderRow={(index) => {
          const item = items[index];
          if (!item) return null;
          return (
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                'flex h-full w-full items-center gap-3 px-3 text-left transition-colors hover:bg-accent',
                selectedId === item.id && 'bg-accent',
              )}
            >
              <ItemThumbnail item={item} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{item.name}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                    {ITEM_CATEGORY_LABELS[item.category]}
                  </span>
                  {!item.isActive ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.imageUrl ? '已停用' : '未启用'}
                    </span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.code} · {item.widthCells}×{item.heightCells}
                  {item.category === 'object' && item.canStand ? ' · 可站立' : ''}
                </div>
              </div>
            </button>
          );
        }}
      />
    </div>
  );
}
