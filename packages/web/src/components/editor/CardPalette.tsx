import { useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Search } from 'lucide-react';
import type { Card } from '@murdoku/shared';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CardThumbnail } from '@/components/card/CardThumbnail';
import { cn } from '@/lib/utils';

interface CardPaletteProps {
  cards: Card[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onStartDrag: (event: ReactPointerEvent, card: Card) => void;
  onHoverCard: (card: Card | null) => void;
}

export function CardPalette({
  cards,
  isLoading,
  isError,
  onStartDrag,
  onHoverCard,
}: CardPaletteProps): JSX.Element {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    if (!cards) return [];
    const query = keyword.trim().toLowerCase();
    if (!query) return cards;
    return cards.filter((card) => {
      if (card.name.toLowerCase().includes(query)) return true;
      if (card.code.toLowerCase().includes(query)) return true;
      return Object.values(card.meta).some((value) =>
        String(value).toLowerCase().includes(query),
      );
    });
  }, [cards, keyword]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索卡片"
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
          <p className="py-6 text-center text-sm text-muted-foreground">卡片加载失败</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {keyword ? '没有匹配的卡片' : '暂无可用卡片'}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filtered.map((card) => (
              <button
                key={card.id}
                type="button"
                title={`${card.name} · ${card.code}`}
                onPointerDown={(event) => onStartDrag(event, card)}
                onMouseEnter={() => onHoverCard(card)}
                onMouseLeave={() => onHoverCard(null)}
                style={{ touchAction: 'none' }}
                className={cn(
                  'group flex cursor-grab flex-col items-center gap-1 rounded-md border p-1 text-center',
                  'hover:border-primary hover:shadow-sm active:cursor-grabbing',
                )}
              >
                <CardThumbnail card={card} className="h-12 w-12" />
                <span className="w-full truncate text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">
                  {card.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
