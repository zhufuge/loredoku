import { useState } from 'react';
import { User } from 'lucide-react';
import type { Character } from '@loredoku/shared';
import { cn } from '@/lib/utils';

interface CharacterThumbnailProps {
  character: Character;
  className?: string;
  /**
   * OPT-H06 §6.2 (docs/v0.4.2.md §6): `'plain'` drops the component's own circle
   * and border, so the **parent** can be the single circle — the participant card
   * and the participant drawer sit on a theme-colour disc and must not stack a
   * second (near-white) ring inside it.
   *
   * Defaults to `'circle'`: the other call sites (character list, items page,
   * profiles) keep their v0.4.1 look pixel for pixel.
   */
  shape?: 'circle' | 'plain';
  /** OPT-H06: `false` removes the 1 px border. Default `true` (unchanged). */
  bordered?: boolean;
}

/**
 * CLAR-602 / MOD-703 + OPT-H06: one character's avatar.
 *
 * - `shape="circle"` (default): a round frame with its own border and a muted
 *   placeholder disc — unchanged since v0.4.1.
 * - `shape="plain"`: no frame, no border, no placeholder disc. The image fills
 *   whatever box the parent gives it (the parent clips it with
 *   `overflow-hidden rounded-full`), and a character without artwork shows its
 *   name's first character instead of a second circle.
 */
export function CharacterThumbnail({
  character,
  className,
  shape = 'circle',
  bordered = true,
}: CharacterThumbnailProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const src = failed ? character.avatarUrl : character.avatarThumbUrl ?? character.avatarUrl;
  const plain = shape === 'plain';

  if (!src) {
    if (plain) {
      const initial = character.name.trim().charAt(0);
      return (
        <span className={cn('flex items-center justify-center', className)}>
          {initial !== '' ? (
            <span className="font-semibold text-muted-foreground">{initial}</span>
          ) : (
            <User className="h-1/2 w-1/2 text-muted-foreground" />
          )}
        </span>
      );
    }
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
      className={cn(
        'no-drag object-cover',
        plain ? undefined : 'rounded-full',
        bordered ? 'border' : undefined,
        className,
      )}
    />
  );
}
