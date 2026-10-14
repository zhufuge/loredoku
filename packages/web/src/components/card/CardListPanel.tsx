import type { Card } from '@murdoku/shared';
import { CardThumbnail } from '@/components/card/CardThumbnail';
import { cn } from '@/lib/utils';

interface CardListPanelProps {
  cards: Card[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function CardListPanel({ cards, selectedId, onSelect }: CardListPanelProps): JSX.Element {
  return (
    <ul className="divide-y rounded-lg border">
      {cards.map((card) => (
        <li key={card.id}>
          <button
            type="button"
            onClick={() => onSelect(card.id)}
            className={cn(
              'flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent',
              selectedId === card.id && 'bg-accent',
            )}
          >
            <CardThumbnail card={card} className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{card.name}</span>
                {!card.isActive ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    已停用
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">{card.code}</div>
              {card.triggers.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {card.triggers.slice(0, 3).map((trigger) => (
                    <span
                      key={trigger.id}
                      className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                    >
                      {trigger.triggerKey}:{trigger.triggerValue}
                    </span>
                  ))}
                  {card.triggers.length > 3 ? (
                    <span className="text-[10px] text-muted-foreground">
                      +{card.triggers.length - 3}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
