import { ITEM_CATEGORY_LABELS, type Item } from '@murdoku/shared';
import { ItemThumbnail } from '@/components/item/ItemThumbnail';
import { cn } from '@/lib/utils';

interface ItemListPanelProps {
  items: Item[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function ItemListPanel({ items, selectedId, onSelect }: ItemListPanelProps): JSX.Element {
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              'flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent',
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
                {item.canStand ? ' · 可站立' : ''}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
