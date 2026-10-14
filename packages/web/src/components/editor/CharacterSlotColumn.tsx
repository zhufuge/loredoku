import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Character, CharacterSlot } from '@murdoku/shared';
import { DRAG_THRESHOLD } from '@/lib/grid';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

interface CharacterSlotColumnProps {
  slots: Array<CharacterSlot | null>;
  charactersById: Map<number, Character>;
  selectedCharacterId: number | null;
  draggingIndex: number | null;
  onSelect: (id: number | null) => void;
  onClear: (index: number) => void;
  onDragBegin: (payload: { characterId: number; sourceSlotIndex: number; pointer: { x: number; y: number } }) => void;
  onDragMove: (pointer: { x: number; y: number }) => void;
  onDragEnd: (pointer: { x: number; y: number }) => void;
  onDragCancel: () => void;
}

const CLEAR_BUTTON_ATTR = 'data-slot-clear';

export function CharacterSlotColumn({
  slots,
  charactersById,
  selectedCharacterId,
  draggingIndex,
  onSelect,
  onClear,
  onDragBegin,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: CharacterSlotColumnProps): JSX.Element {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const armRef = useRef<{
    index: number;
    characterId: number;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number | null;
  } | null>(null);
  const placed = useMemo(() => slots.filter(Boolean).length, [slots]);

  const reset = (): void => {
    armRef.current = null;
  };

  /** `true` when the pointer went down on the remove button. */
  const hitClearButton = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(`[${CLEAR_BUTTON_ATTR}]`) !== null;

  return (
    <aside className="flex w-[72px] shrink-0 flex-col border-r bg-background">
      <div className="shrink-0 border-b py-2 text-center text-[10px] font-medium text-muted-foreground">
        已放置 {placed}/{slots.length}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="flex flex-col gap-2">
          {slots.map((slot, index) => {
            const character = slot ? charactersById.get(slot.characterId) : undefined;
            return (
              <div
                key={index}
                data-slot-index={index}
                style={{ touchAction: 'none' }}
                onPointerDown={(event) => {
                  if (hitClearButton(event.target) || !slot) return;
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  armRef.current = {
                    index,
                    characterId: slot.characterId,
                    startX: event.clientX,
                    startY: event.clientY,
                    active: false,
                    pointerId: event.pointerId,
                  };
                }}
                onPointerMove={(event) => {
                  const arm = armRef.current;
                  if (!arm || arm.pointerId !== event.pointerId) return;
                  if (!arm.active) {
                    const distance = Math.hypot(
                      event.clientX - arm.startX,
                      event.clientY - arm.startY,
                    );
                    if (distance <= DRAG_THRESHOLD) return;
                    arm.active = true;
                    onDragBegin({
                      characterId: arm.characterId,
                      sourceSlotIndex: arm.index,
                      pointer: { x: event.clientX, y: event.clientY },
                    });
                  }
                  onDragMove({ x: event.clientX, y: event.clientY });
                }}
                onPointerUp={(event) => {
                  const arm = armRef.current;
                  if (!arm || arm.pointerId !== event.pointerId) return;
                  reset();
                  if (arm.active) {
                    onDragEnd({ x: event.clientX, y: event.clientY });
                    return;
                  }
                  // No movement → plain click selects (FIX-303: never enters a drop mode).
                  if (slot) {
                    onSelect(selectedCharacterId === slot.characterId ? null : slot.characterId);
                  }
                }}
                onPointerCancel={() => {
                  if (!armRef.current) return;
                  const wasActive = armRef.current.active;
                  reset();
                  if (wasActive) onDragCancel();
                }}
                onMouseEnter={() => setHoveredSlot(index)}
                onMouseLeave={() => setHoveredSlot((current) => (current === index ? null : current))}
                title={
                  slot
                    ? charactersById.get(slot.characterId)?.name ?? `#${slot.characterId}`
                    : `空槽位 ${index + 1}`
                }
                className={cn(
                  'relative flex h-14 w-14 items-center justify-center rounded-md border',
                  draggingIndex !== null
                    ? 'cursor-grabbing'
                    : slot
                      ? 'cursor-grab'
                      : undefined,
                  slot
                    ? selectedCharacterId === slot.characterId
                      ? 'border-primary bg-accent'
                      : 'border-border bg-background hover:border-primary'
                    : 'border-dashed border-muted-foreground/40 bg-muted/30',
                  draggingIndex === index ? 'opacity-40' : undefined,
                )}
              >
                {slot ? (
                  character ? (
                    <CharacterThumbnail character={character} className="h-11 w-11" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">#{slot.characterId}</span>
                  )
                ) : (
                  <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                )}
                {slot ? (
                  <button
                    type="button"
                    {...{ [CLEAR_BUTTON_ATTR]: 'true' }}
                    aria-label="移出队伍"
                    data-testid={`slot-clear-${index}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!slots[index]) return; // guards rapid double clicks
                      onClear(index);
                      setHoveredSlot(null);
                    }}
                    className={cn(
                      'absolute -right-1 -top-1 flex h-4 w-4 cursor-pointer items-center justify-center',
                      'rounded-full border bg-background text-muted-foreground shadow-sm',
                      'transition-opacity hover:text-destructive',
                      hoveredSlot === index ? 'opacity-100' : 'opacity-0',
                    )}
                    title="移出队伍"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
