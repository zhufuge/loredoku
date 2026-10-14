import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Character, CharacterSlotEntry } from '@murdoku/shared';
import { DRAG_THRESHOLD } from '@/lib/grid';
import {
  computeParticipantLayout,
  slotPosition,
  type ParticipantLayout,
} from '@/lib/participantLayout';
import { CharacterThumbnail } from '@/components/character/CharacterThumbnail';
import { cn } from '@/lib/utils';

/**
 * CLAR-602 (docs/v0.3.1.md §2.2): the participant panel renders slots in a
 * matrix layout (cols × rows) approximating the golden ratio.
 *
 * CLAR-603: clicking a populated slot opens the right info drawer. Drag is
 * no longer canvas-bound; participants stay in the roster.
 *
 * Slot reorder (LAYOUT-01) uses the same pointer-drag pattern as the old
 * `CharacterSlotColumn`: a `pointerdown` arms a click/drag candidate, then
 * a `pointermove` beyond `DRAG_THRESHOLD` upgrades it to a drag. Pointer
 * capture guarantees we receive `pointerup` even when the pointer leaves
 * the slot.
 */
interface ParticipantPanelProps {
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  /** Slot index currently selected in the drawer. */
  selectedSlotIndex: number | null;
  /** Slot index being dragged (for visual feedback). */
  draggingIndex: number | null;
  /** Slot indexes the highlight engine is currently outlining. */
  highlightedSlots?: Set<number>;
  highlightColors?: Map<number, string>;
  onSelect: (slotIndex: number | null) => void;
  onClear: (index: number) => void;
  onDragBegin: (payload: { slotIndex: number; pointer: { x: number; y: number } }) => void;
  onDragMove: (pointer: { x: number; y: number }) => void;
  onDragEnd: (pointer: { x: number; y: number }) => void;
  onDragCancel: () => void;
}

const CLEAR_BUTTON_ATTR = 'data-slot-clear';

/** Minimum square cell side; below this the panel scrolls. */
const MIN_CELL_SIZE = 36;

export function ParticipantPanel({
  slots,
  charactersById,
  selectedSlotIndex,
  draggingIndex,
  highlightedSlots,
  highlightColors,
  onSelect,
  onClear,
  onDragBegin,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: ParticipantPanelProps): JSX.Element {
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [cellSize, setCellSize] = useState(56);
  const armRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number | null;
  } | null>(null);

  const layout: ParticipantLayout = useMemo(
    () => computeParticipantLayout(slots.length),
    [slots.length],
  );

  // Auto-fit cell size to the panel width (CLAR-602 §2.2). The wrapper is
  // 144px wide; subtract the inter-cell gap to compute a square size.
  const measuredRef = useRef<HTMLDivElement | null>(null);
  useMemo(() => {
    if (typeof window === 'undefined') return;
    const node = measuredRef.current;
    if (!node) return;
    const width = node.clientWidth;
    const gap = 6;
    const cols = layout.cols || 1;
    const computed = Math.floor((width - gap * (cols - 1)) / cols);
    setCellSize(Math.max(MIN_CELL_SIZE, Math.min(72, computed || 56)));
  }, [layout.cols]);

  const placedCount = useMemo(() => slots.filter(Boolean).length, [slots]);

  const reset = (): void => {
    armRef.current = null;
  };

  const hitClearButton = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest(`[${CLEAR_BUTTON_ATTR}]`) !== null;

  return (
    <aside
      ref={measuredRef}
      className="flex w-[144px] shrink-0 flex-col border-r bg-background"
    >
      <div className="shrink-0 border-b py-2 text-center text-[10px] font-medium text-muted-foreground">
        参与者 {placedCount}/{slots.length}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {slots.length === 0 ? (
          <p className="px-2 py-6 text-center text-[10px] text-muted-foreground">
            从角色列表拖拽到参与者区
          </p>
        ) : (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, ${cellSize}px)`,
              gap: 6,
              justifyContent: 'center',
            }}
          >
            {slots.map((slot, index) => {
              const character = slot ? charactersById.get(slot.characterId) : undefined;
              const isSelected = selectedSlotIndex === index;
              const isHovered = hoveredSlot === index;
              const isDragging = draggingIndex === index;
              const isHighlighted = highlightedSlots?.has(index) ?? false;
              const highlightColor = highlightColors?.get(index);
              const themeColor = slot?.themeColor ?? '#FFFFFF';
              return (
                <div
                  key={index}
                  data-slot-index={index}
                  style={{ touchAction: 'none', width: cellSize, height: cellSize }}
                  onPointerDown={(event) => {
                    if (hitClearButton(event.target)) return;
                    if (event.button !== 0) return;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    armRef.current = {
                      index,
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
                        slotIndex: arm.index,
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
                    // No movement → plain click selects the slot (opens the drawer).
                    onSelect(isSelected ? null : index);
                  }}
                  onPointerCancel={() => {
                    if (!armRef.current) return;
                    const wasActive = armRef.current.active;
                    reset();
                    if (wasActive) onDragCancel();
                  }}
                  onMouseEnter={() => setHoveredSlot(index)}
                  onMouseLeave={() =>
                    setHoveredSlot((current) => (current === index ? null : current))
                  }
                  title={
                    slot
                      ? charactersById.get(slot.characterId)?.name ?? `#${slot.characterId}`
                      : `空参与者框 ${index + 1}`
                  }
                  className={cn(
                    'relative flex items-center justify-center rounded-md border',
                    draggingIndex !== null ? 'cursor-grabbing' : slot ? 'cursor-grab' : undefined,
                    slot
                      ? isSelected
                        ? 'border-primary bg-accent'
                        : 'border-border bg-background hover:border-primary'
                      : 'border-dashed border-muted-foreground/40 bg-muted/30',
                    isDragging ? 'opacity-40' : undefined,
                  )}
                >
                  {slot ? (
                    <span
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: cellSize - 8,
                        height: cellSize - 8,
                        backgroundColor: themeColor,
                        border: isHighlighted
                          ? `3px solid ${highlightColor ?? '#3B82F6'}`
                          : '2px solid rgba(0,0,0,0.18)',
                        boxShadow: isHighlighted
                          ? `0 0 0 2px ${highlightColor ?? '#3B82F6'}`
                          : undefined,
                      }}
                    >
                      {character ? (
                        <CharacterThumbnail
                          character={character}
                          className="h-[80%] w-[80%]"
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          #{slot.characterId}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">{index + 1}</span>
                  )}
                  {slot ? (
                    <button
                      type="button"
                      {...{ [CLEAR_BUTTON_ATTR]: 'true' }}
                      aria-label="移出参与者"
                      data-testid={`slot-clear-${index}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!slots[index]) return;
                        onClear(index);
                        setHoveredSlot(null);
                      }}
                      className={cn(
                        'absolute -right-1 -top-1 flex h-4 w-4 cursor-pointer items-center justify-center',
                        'rounded-full border bg-background text-muted-foreground shadow-sm',
                        'transition-opacity hover:text-destructive',
                        isHovered ? 'opacity-100' : 'opacity-0',
                      )}
                      title="移出参与者"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// Keep the helper export in case callers compute positions outside React.
export { slotPosition };
