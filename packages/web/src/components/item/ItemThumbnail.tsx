import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { Item } from '@murdoku/shared';
import { cn } from '@/lib/utils';

interface ItemThumbnailProps {
  item: Item;
  className?: string;
}

export function ItemThumbnail({ item, className }: ItemThumbnailProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = failed ? item.imageUrl : item.imageThumbUrl ?? item.imageUrl;

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
      alt={item.name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('no-drag rounded border object-cover', className)}
    />
  );
}
