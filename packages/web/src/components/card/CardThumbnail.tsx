import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { Card } from '@murdoku/shared';
import { cn } from '@/lib/utils';

interface CardThumbnailProps {
  card: Card;
  className?: string;
}

export function CardThumbnail({ card, className }: CardThumbnailProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = failed ? card.imageUrl : card.imageThumbUrl ?? card.imageUrl;

  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded border bg-muted/40 text-muted-foreground',
          className,
        )}
      >
        <ImageIcon className="h-4 w-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={card.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('rounded border object-cover', className)}
    />
  );
}
