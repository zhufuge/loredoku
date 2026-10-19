import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { AssetAppearance } from '@loredoku/shared';
import { cn } from '@/lib/utils';

interface AssetThumbnailProps {
  /** v0.6.1: the look lives on a form, so the caller picks the form first. */
  appearance: AssetAppearance;
  name: string;
  className?: string;
}

export function AssetThumbnail({ appearance, name, className }: AssetThumbnailProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = failed ? appearance.imageUrl : appearance.imageThumbUrl ?? appearance.imageUrl;

  // v0.5.1 FEAT-L01 / SPEC-L03: a colour block wins over the image — the
  // background simply shows the block.
  if (appearance.bgColor) {
    return (
      <div
        data-color-block={appearance.bgColor}
        style={{ backgroundColor: appearance.bgColor }}
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
      alt={name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('no-drag rounded border object-cover', className)}
    />
  );
}
