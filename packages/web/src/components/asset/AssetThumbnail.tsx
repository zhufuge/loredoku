import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { Asset } from '@loredoku/shared';
import { cn } from '@/lib/utils';

interface AssetThumbnailProps {
  asset: Asset;
  className?: string;
}

export function AssetThumbnail({ asset, className }: AssetThumbnailProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = failed ? asset.imageUrl : asset.imageThumbUrl ?? asset.imageUrl;

  // v0.5.1 FEAT-L01 / SPEC-L03: a colour block wins over the image — the
  // background simply shows the block.
  if (asset.bgColor) {
    return (
      <div
        data-color-block={asset.bgColor}
        style={{ backgroundColor: asset.bgColor }}
        className={cn('rounded border', className)}
      />
    );
  }

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
      alt={asset.name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('no-drag rounded border object-cover', className)}
    />
  );
}
