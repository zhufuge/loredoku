import { useState } from 'react';
import { X } from 'lucide-react';
import type { Character, CharacterSlot } from '@murdoku/shared';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

interface CharacterSlotColumnProps {
  slots: Array<CharacterSlot | null>;
  charactersById: Map<number, Character>;
  selectedCharacterId: number | null;
  onSelect: (id: number | null) => void;
  onSwap: (from: number, to: number) => void;
  onClear: (index: number) => void;
}

export function CharacterSlotColumn({
  slots,
  charactersById,
  selectedCharacterId,
  onSelect,
  onSwap,
  onClear,
}: CharacterSlotColumnProps): JSX.Element {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const placed = slots.filter(Boolean).length;

  return (
    <aside className="flex w-[72px] shrink-0 flex-col border-r bg-background">
      <div className="shrink-0 border-b py-2 text-center text-[10px] font-medium text-muted-foreground">
        已放置 {placed}/{slots.length}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-2">
          {slots.map((slot, index) => (
            <div key={index} className="relative">
              {overIndex === index && dragIndex !== null && dragIndex !== index ? (
                <span className="absolute -top-1 left-0 right-0 h-0.5 rounded bg-primary" />
              ) : null}
              <div
                draggable={slot !== null}
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragIndex !== null) onSwap(dragIndex, index);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onClick={() => {
                  if (slot) onSelect(selectedCharacterId === slot.characterId ? null : slot.characterId);
                }}
                title={
                  slot
                    ? charactersById.get(slot.characterId)?.name ?? `#${slot.characterId}`
                    : `空槽位 ${index + 1}`
                }
                className={cn(
                  'relative flex h-14 w-14 cursor-pointer items-center justify-center rounded-md border',
                  slot
                    ? selectedCharacterId === slot.characterId
                      ? 'border-primary bg-accent'
                      : 'border-border bg-background hover:border-primary'
                    : 'border-dashed border-muted-foreground/40 bg-muted/30',
                )}
              >
                {slot ? (
                  charactersById.get(slot.characterId) ? (
                    <CharacterThumbnail
                      character={charactersById.get(slot.characterId)!}
                      className="h-11 w-11"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">#{slot.characterId}</span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                )}
                {slot ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClear(index);
                    }}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive"
                    title="移出队伍"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
