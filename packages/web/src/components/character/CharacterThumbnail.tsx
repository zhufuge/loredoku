import { useState } from 'react';
import { User } from 'lucide-react';
import type { Character } from '@loredoku/shared';
import { cn } from '@/lib/utils';

interface CharacterThumbnailProps {
  character: Character;
  className?: string;
}

export function CharacterThumbnail({
  character,
  className,
}: CharacterThumbnailProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = failed ? character.avatarUrl : character.avatarThumbUrl ?? character.avatarUrl;

  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full border bg-muted/40 text-muted-foreground',
          className,
        )}
      >
        <User className="h-4 w-4" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={character.name}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('no-drag rounded-full border object-cover', className)}
    />
  );
}
